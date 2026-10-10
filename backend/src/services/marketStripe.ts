import type Stripe from 'stripe'
import { prisma } from '../lib/prisma.js'
import { getStripe } from './billing.js'
import { sendMail } from './mailer.js'
import { frontendUrl } from '../lib/urls.js'
import { COMMISSION, marketUrl, type Annonce, type Offre } from './market.js'

/**
 * Les paiements de DropShop Market, par Stripe Connect.
 *
 * Le montage « destination charges » de Stripe pour les places de marché :
 * l'acheteur paie sur NOTRE compte plateforme, Stripe reverse aussitôt la vente
 * au compte Express du vendeur et retient la commission (`application_fee_amount`,
 * 5 %). Le vendeur s'inscrit chez Stripe par le formulaire hébergé de Stripe
 * (identité, IBAN) : aucune pièce d'identité ni aucun IBAN ne passe chez nous.
 *
 * L'inscription est gratuite ; seuls les frais Stripe et la commission
 * s'appliquent à une vente.
 */

export class MarketIndisponible extends Error {}

function stripe(): Stripe {
  const s = getStripe()
  if (!s) throw new MarketIndisponible("Les paiements Stripe de la plateforme ne sont pas configurés (STRIPE_SECRET_KEY).")
  return s
}

/** La commission, en centimes, sur un montant en centimes. */
export function commissionCentimes(totalCentimes: number): number {
  return Math.round(totalCentimes * COMMISSION)
}

/**
 * Ouvre (ou reprend) l'inscription Stripe du vendeur et rend l'adresse du
 * formulaire Stripe. Un compte déjà créé n'est jamais recréé : on renvoie un
 * nouveau lien d'inscription sur le même.
 */
export async function lienInscription(userId: string): Promise<string> {
  const s = stripe()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, stripeConnectId: true } })

  let compte = user.stripeConnectId
  if (!compte) {
    const cree = await s.accounts.create({
      type: 'express',
      country: 'FR',
      email: user.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { product_description: 'Vente de produits sur DropShop Market (drop-shop.cloud)' },
      metadata: { userId: user.id, origine: 'dropshop-market' },
    })
    compte = cree.id
    await prisma.user.update({ where: { id: user.id }, data: { stripeConnectId: compte } })
  }

  const retour = `${frontendUrl()}/dropshop-market`
  const lien = await s.accountLinks.create({
    account: compte,
    type: 'account_onboarding',
    refresh_url: `${retour}?stripe=relancer`,
    return_url: `${retour}?stripe=retour`,
  })
  return lien.url
}

/** Relit le compte chez Stripe et range `stripeConnectReady`. */
export async function etatCompte(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeConnectId: true, stripeConnectReady: true } })
  if (!user.stripeConnectId) return { inscrit: false, actif: false, detailsEnvoyes: false, virements: false }

  const s = getStripe()
  if (!s) return { inscrit: true, actif: user.stripeConnectReady, detailsEnvoyes: false, virements: false }

  const compte = await s.accounts.retrieve(user.stripeConnectId)
  const actif = Boolean(compte.charges_enabled)
  if (actif !== user.stripeConnectReady) {
    await prisma.user.update({ where: { id: userId }, data: { stripeConnectReady: actif } })
  }
  return {
    inscrit: true,
    actif,
    detailsEnvoyes: Boolean(compte.details_submitted),
    virements: Boolean(compte.payouts_enabled),
    manque: compte.requirements?.currently_due ?? [],
  }
}

/** Le lien vers le tableau de bord Stripe Express du vendeur (ventes, virements). */
export async function lienTableauDeBord(userId: string): Promise<string | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { stripeConnectId: true } })
  if (!user.stripeConnectId) return null
  const lien = await stripe().accounts.createLoginLink(user.stripeConnectId)
  return lien.url
}

/** Les pays où le Market livre (adresse demandée par Stripe Checkout). */
const PAYS_LIVRES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
  'FR', 'BE', 'LU', 'CH', 'MC', 'DE', 'ES', 'IT', 'NL', 'PT', 'AT', 'IE',
]

/**
 * Ouvre le paiement d'une offre. La commande est écrite AVANT (son identifiant
 * voyage dans la session) et effacée si Stripe refuse, comme pour les vitrines.
 */
export async function ouvrirPaiementMarket(args: {
  annonce: Annonce
  offre: Offre
  quantite: number
  base: string
}): Promise<string> {
  const { annonce, offre, quantite } = args
  const s = stripe()
  const vendeur = await prisma.user.findUniqueOrThrow({
    where: { id: annonce.vendeur.userId },
    select: { stripeConnectId: true, stripeConnectReady: true },
  })
  if (!vendeur.stripeConnectId || !vendeur.stripeConnectReady) {
    throw new MarketIndisponible("Ce vendeur n'a pas encore activé ses paiements.")
  }

  const unitaire = Math.round(offre.prix * 100)
  const total = unitaire * quantite
  const commission = commissionCentimes(total)

  const commande = await prisma.order.create({
    data: {
      userId: annonce.vendeur.userId,
      productId: offre.productId,
      platform: 'DROPSHOP_MARKET',
      status: 'NEW',
      buyerName: 'En attente de paiement',
      buyerAddress: {},
      amount: total / 100,
      currency: offre.devise,
      quantity: quantite,
      commission: commission / 100,
      variante: offre.libelleVariante,
      supplierVariantRef: null,
    },
    select: { id: true },
  })

  try {
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      line_items: [
        {
          quantity: quantite,
          price_data: {
            currency: offre.devise.toLowerCase(),
            unit_amount: unitaire,
            product_data: {
              name: offre.titre.slice(0, 200),
              ...(offre.image ? { images: [offre.image] } : {}),
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: PAYS_LIVRES },
      phone_number_collection: { enabled: true },
      payment_intent_data: {
        application_fee_amount: commission,
        transfer_data: { destination: vendeur.stripeConnectId },
        description: `DropShop Market — ${annonce.vendeur.nom}`,
        metadata: { market: '1', commande: commande.id },
      },
      // `market` aiguille le webhook ; jamais `userId`/`planId`, qui sont ceux des recharges de drops.
      metadata: { market: '1', commande: commande.id },
      success_url: `${args.base}/merci?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${args.base}${offre.chemin}`,
    })
    if (!session.url) throw new Error("Stripe n'a pas rendu d'adresse de paiement.")
    await prisma.order.update({ where: { id: commande.id }, data: { stripeSessionId: session.id } })
    return session.url
  } catch (e) {
    await prisma.order.delete({ where: { id: commande.id } }).catch(() => {})
    throw e
  }
}

interface Livraison {
  name?: string | null
  address?: Stripe.Address | null
}

/**
 * Confirme une commande payée : relit la session chez Stripe (jamais ce que
 * dit le navigateur), range l'adresse de livraison, prévient le vendeur.
 * Idempotente : la deuxième confirmation ne fait que répondre.
 */
export async function confirmerCommandeMarket(sessionId: string): Promise<{ paye: boolean; titre?: string }> {
  const s = stripe()
  const session = await s.checkout.sessions.retrieve(sessionId)
  if (session.metadata?.market !== '1') return { paye: false }
  if (session.payment_status !== 'paid') return { paye: false }

  const commande = await prisma.order.findFirst({
    where: { stripeSessionId: session.id, platform: 'DROPSHOP_MARKET' },
    include: { product: { select: { title: true, aiTitle: true } }, user: { select: { email: true } } },
  })
  if (!commande) return { paye: true }
  const titre = commande.product.aiTitle || commande.product.title
  if (commande.paidAt) return { paye: true, titre }

  // L'adresse a changé de place dans l'API Stripe (2025) : on lit les deux.
  const brut = session as unknown as { shipping_details?: Livraison; collected_information?: { shipping_details?: Livraison } }
  const livraison = brut.collected_information?.shipping_details ?? brut.shipping_details ?? null
  const client = session.customer_details
  const adresse = livraison?.address ?? client?.address ?? null
  const nom = livraison?.name || client?.name || 'Acheteur'

  const marque = await prisma.order.updateMany({
    where: { id: commande.id, paidAt: null },
    data: {
      paidAt: new Date(),
      buyerName: nom,
      buyerEmail: client?.email ?? null,
      buyerAddress: {
        street: [adresse?.line1, adresse?.line2].filter(Boolean).join(', '),
        zip: adresse?.postal_code ?? '',
        city: adresse?.city ?? '',
        country: adresse?.country ?? '',
        ...(client?.phone ? { phone: client.phone } : {}),
        ...(client?.email ? { email: client.email } : {}),
      },
      payoutStatus: 'PENDING',
    },
  })
  if (!marque.count) return { paye: true, titre }

  try {
    const montant = Number(commande.amount)
    const commission = Number(commande.commission ?? 0)
    if (commande.user.email) {
      await sendMail({
        to: commande.user.email,
        subject: `Nouvelle vente sur DropShop Market : ${titre}`,
        heading: `${nom} vient d'acheter sur DropShop Market.`,
        body: `${commande.quantity} × ${titre}${commande.variante ? ` (${commande.variante})` : ''}\nMontant payé : ${montant.toFixed(2)} €\nCommission DropShop Market (5 %) : ${commission.toFixed(2)} €\nReversé sur votre compte Stripe : ${(montant - commission).toFixed(2)} € (avant frais Stripe)\n\nLivraison : ${[adresse?.line1, adresse?.postal_code, adresse?.city, adresse?.country].filter(Boolean).join(', ')}\n\nPassez la commande chez votre fournisseur et renseignez le suivi.`,
        actionLabel: 'Voir mes commandes',
        actionUrl: `${frontendUrl()}/orders`,
        footer: 'Cette vente vient de DropShop Market (drop-shop.cloud).',
      })
    }
    if (client?.email) {
      await sendMail({
        to: client.email,
        subject: `DropShop Market — votre commande est confirmée`,
        heading: 'Merci, votre paiement est reçu.',
        body: `Bonjour ${nom},\n\n${commande.quantity} × ${titre}${commande.variante ? ` (${commande.variante})` : ''} — ${montant.toFixed(2)} €, livraison comprise.\n\nLe vendeur prépare votre colis et vous tiendra informé de son envoi.`,
        footer: `Vous recevez ce message parce que vous avez commandé sur ${marketUrl().replace(/^https?:\/\//, '')}.`,
        brand: 'DropShop Market',
      })
    }
  } catch (e) {
    console.error('[market] email non envoyé', e instanceof Error ? e.message : e)
  }
  return { paye: true, titre }
}
