import type Stripe from 'stripe'
import { prisma } from '../lib/prisma.js'
import { getStripe } from './billing.js'
import { frontendUrl } from '../lib/urls.js'
import { sendMail } from './mailer.js'
import { notifierCommande, type Acheteur, type LigneCommande } from './commandeVitrine.js'
import { resoudre } from './themes.js'

/**
 * Le paiement par carte d'une boutique DropShop dont le vendeur n'a PAS collé
 * sa propre clé Stripe (21/11/2026 : « coquilles vides, aucun moyen de
 * paiement »).
 *
 * Avant, une boutique sans clé n'encaissait rien : la commande partait « à
 * encaisser par le marchand », et l'acheteur ne voyait jamais de paiement.
 * Personne ne colle une `sk_live_` le jour où il crée sa boutique ; toutes les
 * boutiques créées étaient donc des vitrines où l'on ne pouvait pas payer.
 *
 * Désormais l'acheteur paie sur le compte Stripe de la plateforme (celui des
 * recharges de drops, déjà branché), comme sur DropShop Market : la vente est
 * reversée au vendeur par Stripe Connect dès qu'il a activé ses paiements
 * (formulaire Stripe, gratuit), sinon sa part est mise de côté et lui est
 * versée à l'activation (`verserPartsBoutiqueEnAttente`).
 *
 * Ce que la plateforme retient : les frais réels de Stripe sur la vente (lus
 * sur la transaction), plus `COMMISSION_BOUTIQUE` — 0 tant que max n'a pas
 * décidé autrement : la page de création promet « nous ne prenons rien ».
 *
 * Marqueur : une commande payée ainsi porte `commission` non nulle (0 compris).
 * Une commande payée sur la clé du marchand la laisse nulle : rien à reverser.
 */
export const COMMISSION_BOUTIQUE = 0

export function paiementPlateformeOuvert(): boolean {
  return Boolean(getStripe())
}

function euros(centimes: number) {
  return (centimes / 100).toFixed(2).replace('.', ',') + ' €'
}

export async function ouvrirPaiementPlateforme(args: {
  shop: { id: string; name: string; shopKey: string }
  lignes: LigneCommande[]
  port: number
  acheteur: Acheteur
  retour: string
  commandes: string[]
}): Promise<{ url: string; sessionId: string }> {
  const s = getStripe()
  if (!s) throw new Error('Stripe plateforme non configuré')
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = args.lignes.map((l) => ({
    quantity: l.quantite,
    price_data: { currency: 'eur', unit_amount: Math.round(l.prixUnitaire * 100), product_data: { name: l.titre.slice(0, 200) } },
  }))
  if (args.port > 0) {
    line_items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(args.port * 100), product_data: { name: 'Livraison' } } })
  }
  const sep = args.retour.includes('?') ? '&' : '?'
  // `boutique: '1'` aiguille le webhook ; jamais `userId`/`planId`, qui créditeraient des drops.
  const metadata = { boutique: '1', shopId: args.shop.id, shopKey: args.shop.shopKey }
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    line_items,
    ...(args.acheteur.email ? { customer_email: args.acheteur.email } : {}),
    payment_intent_data: {
      transfer_group: `dsb-${args.shop.id}`,
      description: `${args.shop.name} — commande en ligne`.slice(0, 200),
      statement_descriptor_suffix: args.shop.name.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 22) || undefined,
      metadata,
    },
    success_url: `${args.retour}${sep}session_id={CHECKOUT_SESSION_ID}#/merci`,
    cancel_url: `${args.retour}#/commande`,
    metadata,
  })
  if (!session.url) throw new Error("Stripe n'a pas rendu d'adresse de paiement.")
  return { url: session.url, sessionId: session.id }
}

/**
 * Relit la session chez Stripe (jamais la parole du navigateur), marque les
 * commandes payées, envoie les emails une seule fois, puis reverse au vendeur.
 * Appelée au retour de l'acheteur ET par le webhook : la première gagne.
 */
export async function confirmerPaiementBoutique(sessionId: string): Promise<boolean> {
  const s = getStripe()
  if (!s) return false
  const session = await s.checkout.sessions.retrieve(sessionId)
  if (session.metadata?.boutique !== '1' || session.payment_status !== 'paid') return false

  const commandes = await prisma.order.findMany({
    where: { stripeSessionId: sessionId, platform: 'OWN_SITE', paidAt: null },
    include: { product: true },
  })
  if (commandes.length) {
    // Seul celui qui pose `paidAt` envoie les emails : retour et webhook peuvent arriver ensemble.
    const pose = await prisma.order.updateMany({
      where: { id: { in: commandes.map((c) => c.id) }, paidAt: null },
      data: { paidAt: new Date() },
    })
    const shop = await prisma.shop.findUnique({ where: { id: session.metadata.shopId ?? '' } })
    if (pose.count && shop) {
      const adresse = commandes[0].buyerAddress as { street: string; zip: string; city: string; country: string; phone?: string; email?: string }
      const lignes = commandes.map((c) => ({ titre: c.product.aiTitle || c.product.title, quantite: c.quantity, prixUnitaire: Number(c.amount) / c.quantity, total: Number(c.amount) }))
      const contenu = resoudre(shop).contenu
      const sousTotal = lignes.reduce((t, l) => t + l.total, 0)
      void notifierCommande({
        shop,
        acheteur: { name: commandes[0].buyerName, email: adresse.email, phone: adresse.phone, street: adresse.street, zip: adresse.zip, city: adresse.city, country: adresse.country },
        lignes,
        port: sousTotal >= contenu.portOffertDes ? 0 : contenu.fraisPort,
        paye: true,
        encaissement: 'plateforme',
      })
    }
  }
  await verserSession(s, sessionId).catch((e) => console.error('[boutique] virement vendeur', sessionId, e instanceof Error ? e.message : e))
  return true
}

/** Verse au vendeur actif sa part d'une session payée, une seule fois (clé d'idempotence). */
async function verserSession(s: Stripe, sessionId: string): Promise<void> {
  const lignes = await prisma.order.findMany({
    where: { stripeSessionId: sessionId, platform: 'OWN_SITE', paidAt: { not: null }, stripeTransferId: null, commission: { not: null }, status: { not: 'REFUNDED' } },
  })
  if (!lignes.length) return
  const vendeur = await prisma.user.findUnique({ where: { id: lignes[0].userId }, select: { email: true, stripeConnectId: true, stripeConnectReady: true } })

  const session = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge.balance_transaction'] })
  const pi = session.payment_intent
  const charge = pi && typeof pi !== 'string' && pi.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null
  const bt = charge && charge.balance_transaction && typeof charge.balance_transaction !== 'string' ? charge.balance_transaction : null
  const total = session.amount_total ?? 0
  const frais = bt?.fee ?? 0
  const commission = Math.round(total * COMMISSION_BOUTIQUE)
  const part = total - frais - commission
  if (part <= 0) return

  if (!vendeur?.stripeConnectId || !vendeur.stripeConnectReady) {
    // Part mise de côté : le vendeur est prévenu, une fois par vente.
    if (vendeur?.email) {
      await sendMail({
        to: vendeur.email,
        subject: `Vente payée : ${euros(part)} vous attendent`,
        heading: 'Activez vos paiements pour recevoir cette vente.',
        body: `Un client vient de payer une commande sur votre boutique. Votre part, ${euros(part)} (frais Stripe déduits), est mise de côté.\n\nActivez vos paiements (formulaire Stripe, gratuit, quelques minutes) : elle vous sera virée aussitôt, comme toutes les ventes suivantes.`,
        actionLabel: 'Activer mes paiements',
        actionUrl: `${frontendUrl()}/creer-boutique`,
        footer: 'Message envoyé par DropShipper IA pour votre boutique DropShop.',
      }).catch(() => {})
    }
    return
  }

  const virement = await s.transfers.create(
    {
      amount: part,
      currency: (session.currency || 'eur').toLowerCase(),
      destination: vendeur.stripeConnectId,
      transfer_group: session.payment_intent && typeof session.payment_intent !== 'string' ? session.payment_intent.transfer_group ?? undefined : undefined,
      ...(charge ? { source_transaction: charge.id } : {}),
      description: 'Vente sur votre boutique DropShop',
      metadata: { boutique: '1', session: sessionId },
    },
    { idempotencyKey: `dsb-virement-${sessionId}` },
  )
  await prisma.order.updateMany({ where: { id: { in: lignes.map((l) => l.id) } }, data: { stripeTransferId: virement.id, payoutStatus: 'RELEASED' } })
}

/** Les ventes de boutique mises de côté d'un vendeur qui vient d'activer ses paiements. */
export async function verserPartsBoutiqueEnAttente(userId: string): Promise<void> {
  const s = getStripe()
  if (!s) return
  const lignes = await prisma.order.findMany({
    where: { userId, platform: 'OWN_SITE', commission: { not: null }, paidAt: { not: null }, stripeTransferId: null, stripeSessionId: { not: null }, status: { not: 'REFUNDED' } },
    select: { stripeSessionId: true },
  })
  for (const id of new Set(lignes.map((l) => l.stripeSessionId!))) {
    await verserSession(s, id).catch((e) => console.error('[boutique] part en attente', id, e instanceof Error ? e.message : e))
  }
}
