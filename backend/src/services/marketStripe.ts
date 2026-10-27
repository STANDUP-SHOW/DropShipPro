import type Stripe from 'stripe'
import { prisma } from '../lib/prisma.js'
import { getStripe } from './billing.js'
import { sendMail } from './mailer.js'
import { frontendUrl } from '../lib/urls.js'
import crypto from 'node:crypto'
import type { MarketClient } from '@prisma/client'
import { COMMISSION, marketUrl, type Annonce, type Offre } from './market.js'
import type { LigneResolue } from './marketPanier.js'

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
  if (!s) throw new MarketIndisponible("Les paiements du Market ne sont pas encore ouverts. Réessayez un peu plus tard.")
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
  // Les ventes faites avant l'activation : leur part attendait, on la verse.
  if (actif) await verserPartsEnAttente(userId).catch((e) => console.error('[market] parts en attente', e instanceof Error ? e.message : e))
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
export const PAYS_LIVRES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
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
export async function confirmerCommandeMarket(sessionId: string): Promise<{ paye: boolean; titre?: string; numero?: string }> {
  const s = stripe()
  const session = await s.checkout.sessions.retrieve(sessionId)
  if (session.metadata?.market !== '1') return { paye: false }
  if (session.payment_status !== 'paid') return { paye: false }
  if (session.metadata?.panier === '1') return confirmerPanier(s, session)

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

// ——— Le panier : un paiement, plusieurs vendeurs (décision de max du 27/10/2026) ———
//
// Montage « separate charges and transfers » de Stripe : l'acheteur paie UNE
// fois sur le compte de la plateforme, puis chaque vendeur reçoit par virement
// Connect sa part, moins la commission. Un vendeur qui n'a pas encore activé ses
// paiements est quand même achetable : sa part reste mise de côté et lui est
// versée dès qu'il les active (`verserPartsEnAttente`, appelé par `etatCompte`).

/** Un numéro de commande lisible, dicté au téléphone sans ambiguïté (pas de 0/O ni 1/I). */
export function nouveauNumero(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const octets = crypto.randomBytes(8)
  return `DSM-${[...octets].map((b) => alphabet[b % alphabet.length]).join('')}`
}

export async function ouvrirPaiementPanier(args: { lignes: LigneResolue[]; client: MarketClient | null; base: string; viderPanier?: boolean }): Promise<string> {
  const { lignes, client } = args
  if (!lignes.length) throw new MarketIndisponible('Votre panier est vide.')
  const devises = new Set(lignes.map((l) => l.offre.devise))
  if (devises.size > 1) throw new MarketIndisponible('Votre panier mêle plusieurs devises : passez une commande par devise.')
  const devise = [...devises][0]
  const s = stripe()
  const numero = nouveauNumero()

  const commandes = await prisma.$transaction(
    lignes.map((l) => {
      const total = Math.round(l.offre.prix * 100) * l.quantite
      return prisma.order.create({
        data: {
          userId: l.annonce.vendeur.userId,
          productId: l.offre.productId,
          platform: 'DROPSHOP_MARKET',
          status: 'NEW',
          buyerName: 'En attente de paiement',
          buyerAddress: {},
          buyerEmail: client?.email ?? null,
          amount: total / 100,
          currency: devise,
          quantity: l.quantite,
          commission: commissionCentimes(total) / 100,
          variante: l.offre.libelleVariante,
          marketNumero: numero,
          marketClientId: client?.id ?? null,
        },
        select: { id: true },
      })
    }),
  )

  try {
    // Client connecté : son adresse par défaut pré-remplit le paiement (client Stripe).
    let customer: string | undefined
    if (client) {
      customer = client.stripeCustomerId ?? undefined
      const adresse = await prisma.marketAdresse.findFirst({ where: { clientId: client.id }, orderBy: [{ parDefaut: 'desc' }, { createdAt: 'desc' }] })
      const shipping = adresse
        ? { name: adresse.nom, phone: adresse.telephone ?? undefined, address: { line1: adresse.ligne1, line2: adresse.ligne2 ?? undefined, postal_code: adresse.codePostal, city: adresse.ville, country: adresse.pays } }
        : undefined
      if (!customer) {
        const c = await s.customers.create({ email: client.email, name: client.nom, ...(shipping ? { shipping } : {}), metadata: { marketClientId: client.id } })
        customer = c.id
        await prisma.marketClient.update({ where: { id: client.id }, data: { stripeCustomerId: customer } })
      } else if (shipping) {
        await s.customers.update(customer, { shipping })
      }
    }

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      line_items: lignes.map((l) => ({
        quantity: l.quantite,
        price_data: {
          currency: devise.toLowerCase(),
          unit_amount: Math.round(l.offre.prix * 100),
          product_data: {
            name: l.offre.titre.slice(0, 200),
            description: `Vendu par ${l.annonce.vendeur.nom}`.slice(0, 200),
            ...(l.offre.image ? { images: [l.offre.image] } : {}),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: PAYS_LIVRES },
      phone_number_collection: { enabled: true },
      ...(customer ? { customer, customer_update: { shipping: 'auto' as const, name: 'auto' as const } } : {}),
      payment_intent_data: {
        transfer_group: numero,
        description: `DropShop Market — commande ${numero}`,
        metadata: { market: '1', panier: '1', numero },
      },
      // `market` aiguille le webhook ; jamais `userId`/`planId`, qui sont ceux des recharges de drops.
      metadata: { market: '1', panier: '1', numero, ...(client ? { client: client.id } : {}) },
      success_url: `${args.base}/merci?session_id={CHECKOUT_SESSION_ID}${args.viderPanier ? '&panier=1' : ''}`,
      cancel_url: `${args.base}/panier`,
    })
    if (!session.url) throw new Error("Stripe n'a pas rendu d'adresse de paiement.")
    await prisma.order.updateMany({ where: { id: { in: commandes.map((c) => c.id) } }, data: { stripeSessionId: session.id } })
    return session.url
  } catch (e) {
    await prisma.order.deleteMany({ where: { id: { in: commandes.map((c) => c.id) } } }).catch(() => {})
    throw e
  }
}

/** Le paiement Stripe d'une session, pour rattacher les virements à la vente (`source_transaction`). */
async function paiementDe(s: Stripe, sessionId: string): Promise<string | null> {
  const session = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] })
  const pi = session.payment_intent
  if (!pi || typeof pi === 'string') return null
  const charge = pi.latest_charge
  return typeof charge === 'string' ? charge : charge?.id ?? null
}

/**
 * Verse à un vendeur actif sa part des lignes payées, une fois par vente.
 * La clé d'idempotence empêche un double virement si le webhook et le retour
 * de l'acheteur arrivent en même temps.
 */
async function virer(s: Stripe, args: { userId: string; destination: string; sessionId: string; numero: string; orderIds: string[] }) {
  const lignes = await prisma.order.findMany({ where: { id: { in: args.orderIds }, stripeTransferId: null, paidAt: { not: null }, status: { not: 'REFUNDED' } } })
  if (!lignes.length) return
  const part = lignes.reduce((t, o) => t + Math.round(Number(o.amount) * 100) - Math.round(Number(o.commission ?? 0) * 100), 0)
  if (part <= 0) return
  const charge = await paiementDe(s, args.sessionId)
  const virement = await s.transfers.create(
    {
      amount: part,
      currency: (lignes[0].currency || 'EUR').toLowerCase(),
      destination: args.destination,
      transfer_group: args.numero,
      ...(charge ? { source_transaction: charge } : {}),
      description: `DropShop Market — commande ${args.numero}`,
      metadata: { market: '1', numero: args.numero, vendeur: args.userId },
    },
    { idempotencyKey: `dsm-virement-${args.numero}-${args.userId}-${lignes.map((l) => l.id).sort().join('.')}`.slice(0, 255) },
  )
  await prisma.order.updateMany({ where: { id: { in: lignes.map((l) => l.id) } }, data: { stripeTransferId: virement.id, payoutStatus: 'RELEASED' } })
}

/** Les parts mises de côté d'un vendeur qui vient d'activer ses paiements. */
export async function verserPartsEnAttente(userId: string) {
  const s = getStripe()
  if (!s) return
  const vendeur = await prisma.user.findUnique({ where: { id: userId }, select: { stripeConnectId: true, stripeConnectReady: true } })
  if (!vendeur?.stripeConnectId || !vendeur.stripeConnectReady) return
  const lignes = await prisma.order.findMany({
    where: { userId, platform: 'DROPSHOP_MARKET', marketNumero: { not: null }, paidAt: { not: null }, stripeTransferId: null, status: { not: 'REFUNDED' } },
    select: { id: true, stripeSessionId: true, marketNumero: true },
  })
  const parSession = new Map<string, { numero: string; ids: string[] }>()
  for (const l of lignes) {
    if (!l.stripeSessionId) continue
    const g = parSession.get(l.stripeSessionId) ?? { numero: l.marketNumero!, ids: [] }
    g.ids.push(l.id)
    parSession.set(l.stripeSessionId, g)
  }
  for (const [sessionId, g] of parSession) {
    await virer(s, { userId, destination: vendeur.stripeConnectId, sessionId, numero: g.numero, orderIds: g.ids })
  }
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

async function confirmerPanier(s: Stripe, session: Stripe.Checkout.Session): Promise<{ paye: boolean; titre?: string; numero?: string }> {
  const numero = session.metadata?.numero
  const commandes = await prisma.order.findMany({
    where: { stripeSessionId: session.id, platform: 'DROPSHOP_MARKET' },
    include: { product: { select: { title: true, aiTitle: true } }, user: { select: { id: true, email: true, stripeConnectId: true, stripeConnectReady: true } } },
  })
  if (!commandes.length) return { paye: true, numero }

  const brut = session as unknown as { shipping_details?: Livraison; collected_information?: { shipping_details?: Livraison } }
  const livraison = brut.collected_information?.shipping_details ?? brut.shipping_details ?? null
  const client = session.customer_details
  const adresse = livraison?.address ?? client?.address ?? null
  const nom = livraison?.name || client?.name || 'Acheteur'
  const clientId = session.metadata?.client || null
  const email = client?.email ?? null

  // Seules les lignes que CET appel a marquées payées partent en virement et en email.
  const nouvelles: typeof commandes = []
  for (const c of commandes) {
    const r = await prisma.order.updateMany({
      where: { id: c.id, paidAt: null },
      data: {
        paidAt: new Date(),
        buyerName: nom,
        buyerEmail: email ?? c.buyerEmail,
        buyerAddress: {
          street: [adresse?.line1, adresse?.line2].filter(Boolean).join(', '),
          zip: adresse?.postal_code ?? '',
          city: adresse?.city ?? '',
          country: adresse?.country ?? '',
          ...(client?.phone ? { phone: client.phone } : {}),
          ...(email ? { email } : {}),
        },
        payoutStatus: 'PENDING',
      },
    })
    if (r.count) nouvelles.push(c)
  }
  const titre = commandes[0].product.aiTitle || commandes[0].product.title
  if (!nouvelles.length) return { paye: true, titre, numero }

  // Le carnet d'adresses du client : la première adresse de livraison y entre d'elle-même.
  if (clientId && adresse?.line1) {
    const deja = await prisma.marketAdresse.count({ where: { clientId } }).catch(() => 1)
    if (!deja) {
      await prisma.marketAdresse
        .create({ data: { clientId, nom, ligne1: adresse.line1, ligne2: adresse.line2 ?? null, codePostal: adresse.postal_code ?? '', ville: adresse.city ?? '', pays: adresse.country ?? 'FR', telephone: client?.phone ?? null, parDefaut: true } })
        .catch(() => {})
    }
  }

  // Les vendeurs actifs reçoivent leur part tout de suite ; les autres plus tard.
  const parVendeur = new Map<string, typeof nouvelles>()
  for (const c of nouvelles) parVendeur.set(c.userId, [...(parVendeur.get(c.userId) ?? []), c])
  for (const [userId, lignes] of parVendeur) {
    const v = lignes[0].user
    if (v.stripeConnectId && v.stripeConnectReady && numero) {
      await virer(s, { userId, destination: v.stripeConnectId, sessionId: session.id, numero, orderIds: lignes.map((l) => l.id) }).catch((e) =>
        console.error('[market] virement vendeur', userId, e instanceof Error ? e.message : e),
      )
    }
  }

  const adresseTexte = esc([adresse?.line1, adresse?.line2, [adresse?.postal_code, adresse?.city].filter(Boolean).join(' '), adresse?.country].filter(Boolean).join(', '))
  const ligneTexte = (c: (typeof commandes)[number]) => `${c.quantity} × ${esc(c.product.aiTitle || c.product.title)}${c.variante ? ` (${esc(c.variante)})` : ''} — ${euros(Number(c.amount))}`

  try {
    for (const [, lignes] of parVendeur) {
      const v = lignes[0].user
      if (!v.email) continue
      const montant = lignes.reduce((t, c) => t + Number(c.amount), 0)
      const commission = lignes.reduce((t, c) => t + Number(c.commission ?? 0), 0)
      const actif = Boolean(v.stripeConnectId && v.stripeConnectReady)
      await sendMail({
        to: v.email,
        subject: `Nouvelle vente sur DropShop Market (${numero})`,
        heading: `${esc(nom)} vient d'acheter sur DropShop Market.`,
        body: `${lignes.map(ligneTexte).join('<br>')}<br><br>Montant payé : ${euros(montant)}<br>Commission DropShop Market (5 %) : ${euros(commission)}<br>Votre part : ${euros(montant - commission)} (avant frais Stripe)<br><br>${
          actif
            ? 'Elle est virée sur votre compte Stripe.'
            : '<b>Votre part est mise de côté</b> : activez vos paiements dans DropShipper (écran DropShop Market) pour la recevoir. Elle vous est versée dès l\'activation.'
        }<br><br>Livraison : ${adresseTexte}<br><br>Passez la commande chez votre fournisseur et renseignez le numéro de suivi : l'acheteur en est prévenu par email.`,
        actionLabel: actif ? 'Voir mes commandes' : 'Activer mes paiements',
        actionUrl: actif ? `${frontendUrl()}/orders` : `${frontendUrl()}/dropshop-market`,
        footer: `Commande ${numero} sur DropShop Market (drop-shop.cloud).`,
      })
    }
    if (email) {
      const total = commandes.reduce((t, c) => t + Number(c.amount), 0)
      await sendMail({
        to: email,
        subject: `DropShop Market — commande ${numero} confirmée`,
        heading: 'Merci, votre commande est confirmée.',
        body: `Bonjour ${esc(nom)},<br><br>${commandes.map(ligneTexte).join('<br>')}<br><br><b>Total payé : ${euros(total)}</b>, livraison comprise.<br>Livraison à : ${adresseTexte}<br><br>Chaque vendeur prépare son colis ; vous recevrez un email avec le numéro de suivi à chaque expédition. Vous disposez de 14 jours après réception pour changer d'avis.`,
        actionLabel: 'Suivre ma commande',
        actionUrl: `${marketUrl()}/suivi?numero=${encodeURIComponent(numero ?? '')}&email=${encodeURIComponent(email)}`,
        footer: `Numéro de commande : ${numero}. Une question ? Répondez depuis ${marketUrl().replace(/^https?:\/\//, '')}/contact.`,
        brand: 'DropShop Market',
      })
    }
  } catch (e) {
    console.error('[market] email non envoyé', e instanceof Error ? e.message : e)
  }
  return { paye: true, titre, numero }
}

/**
 * Prévient l'acheteur qu'une ligne est expédiée, une seule fois. Appelé quand le
 * vendeur saisit le suivi, ou quand le fournisseur le donne.
 */
export async function prevenirExpeditionMarket(orderId: string) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { product: { select: { title: true, aiTitle: true } } } })
  if (!o || o.platform !== 'DROPSHOP_MARKET' || !o.buyerEmail || !o.paidAt || !o.trackingNumber || o.marketExpeditionAvisAt) return
  const marque = await prisma.order.updateMany({ where: { id: o.id, marketExpeditionAvisAt: null }, data: { marketExpeditionAvisAt: new Date() } })
  if (!marque.count) return
  const titre = o.product.aiTitle || o.product.title
  try {
    await sendMail({
      to: o.buyerEmail,
      subject: `DropShop Market — votre colis est en route${o.marketNumero ? ` (${o.marketNumero})` : ''}`,
      heading: 'Votre colis est expédié.',
      body: `Bonjour ${esc(o.buyerName)},<br><br>${o.quantity} × ${esc(titre)}${o.variante ? ` (${esc(o.variante)})` : ''} vient d'être expédié.<br>Numéro de suivi : <b>${esc(o.trackingNumber)}</b>${o.carrier ? ` (${esc(o.carrier)})` : ''}.`,
      ...(o.marketNumero ? { actionLabel: 'Suivre ma commande', actionUrl: `${marketUrl()}/suivi?numero=${encodeURIComponent(o.marketNumero)}&email=${encodeURIComponent(o.buyerEmail)}` } : {}),
      footer: "Vous disposez de 14 jours après réception pour changer d'avis : la demande se fait depuis le suivi de commande.",
      brand: 'DropShop Market',
    })
  } catch (e) {
    console.error('[market] email d\'expédition non envoyé', e instanceof Error ? e.message : e)
  }
}
