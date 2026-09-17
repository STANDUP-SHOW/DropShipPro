import Stripe from 'stripe'
import { prisma } from '../lib/prisma.js'
import { frontendUrl } from '../lib/urls.js'
import { sendMail } from './mailer.js'

/**
 * Ce qui entoure une commande passée sur une boutique hébergée : les emails,
 * et le paiement en ligne quand le marchand a branché Stripe.
 *
 * **Le paiement va sur le compte Stripe DU MARCHAND.** Nous ne sommes ni
 * intermédiaire ni encaisseur : la boutique crée une session Checkout avec
 * SA clé, l'acheteur paie chez Stripe, l'argent arrive chez lui. Ce qui
 * revient chez nous, c'est la confirmation — relue chez Stripe avec la même
 * clé au retour de l'acheteur, jamais crue sur parole du navigateur (leçon du
 * `return_url` des chefs de rayon : une page de retour qui ne confirme pas
 * encaisse sans livrer).
 *
 * **Les emails partent sous l'enseigne de la boutique**, pas sous la nôtre :
 * l'acheteur ne nous connaît pas, et « DropShipper IA » à la place de la
 * boutique inquiète plus qu'il ne rassure.
 */

export interface LigneCommande {
  titre: string
  quantite: number
  prixUnitaire: number
  total: number
}

export interface Acheteur {
  name: string
  email?: string
  phone?: string
  street: string
  zip: string
  city: string
  country: string
}

function euros(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €'
}

function recap(lignes: LigneCommande[], port: number): string {
  const total = lignes.reduce((s, l) => s + l.total, 0) + port
  return [
    ...lignes.map((l) => `${l.quantite} × ${l.titre} — ${euros(l.total)}`),
    port > 0 ? `Livraison — ${euros(port)}` : 'Livraison offerte',
    `Total — ${euros(total)}`,
  ].join('\n')
}

/** Best-effort : un email qui ne part pas ne doit jamais faire échouer une commande déjà prise. */
export async function notifierCommande(args: {
  shop: { id: string; name: string; slug: string | null; userId: string }
  acheteur: Acheteur
  lignes: LigneCommande[]
  port: number
  paye: boolean
}) {
  const { shop, acheteur, lignes, port, paye } = args
  const resume = recap(lignes, port)
  const adresse = `${acheteur.street}, ${acheteur.zip} ${acheteur.city}, ${acheteur.country}`
  try {
    if (acheteur.email) {
      await sendMail({
        to: acheteur.email,
        subject: `${shop.name} — votre commande est ${paye ? 'confirmée' : 'enregistrée'}`,
        heading: paye ? 'Merci, votre paiement est reçu.' : 'Merci, votre commande est bien enregistrée.',
        body: `Bonjour ${acheteur.name},\n\nVoici le récapitulatif :\n${resume}\n\nLivraison à : ${adresse}\n\n${paye ? 'Nous préparons votre colis et vous tenons informé de son envoi.' : 'Nous revenons vers vous très vite pour finaliser votre commande.'}`,
        footer: `Vous recevez ce message parce que vous avez commandé sur ${shop.name}.`,
        brand: shop.name,
      })
    }
    const marchand = await prisma.user.findUnique({ where: { id: shop.userId }, select: { email: true } })
    if (marchand?.email) {
      await sendMail({
        to: marchand.email,
        subject: `Nouvelle commande sur ${shop.name}${paye ? ' (payée)' : ''}`,
        heading: `${acheteur.name} vient de commander sur ${shop.name}.`,
        body: `${resume}\n\nAcheteur : ${acheteur.name}${acheteur.email ? ` — ${acheteur.email}` : ''}${acheteur.phone ? ` — ${acheteur.phone}` : ''}\nLivraison : ${adresse}\n\n${paye ? 'Paiement reçu sur votre compte Stripe.' : 'Commande sans paiement en ligne : à encaisser selon vos conditions.'}`,
        actionLabel: 'Voir mes commandes',
        actionUrl: `${frontendUrl()}/orders`,
        footer: 'Cette commande vient de votre boutique DropShop hébergée par DropShipper IA.',
      })
    }
  } catch (e) {
    console.error('[commande vitrine] email non envoyé', e instanceof Error ? e.message : e)
  }
}

/**
 * Ouvre une session de paiement chez Stripe, sur le compte du marchand.
 * Rend l'adresse où envoyer l'acheteur.
 */
export async function ouvrirPaiement(args: {
  cle: string
  boutique: string
  lignes: LigneCommande[]
  port: number
  acheteur: Acheteur
  retour: string
  commandes: string[]
  shopKey: string
}): Promise<{ url: string; sessionId: string }> {
  const stripe = new Stripe(args.cle)
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = args.lignes.map((l) => ({
    quantity: l.quantite,
    price_data: { currency: 'eur', unit_amount: Math.round(l.prixUnitaire * 100), product_data: { name: l.titre.slice(0, 200) } },
  }))
  if (args.port > 0) {
    line_items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(args.port * 100), product_data: { name: 'Livraison' } } })
  }
  const sep = args.retour.includes('?') ? '&' : '?'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    line_items,
    customer_email: args.acheteur.email,
    success_url: `${args.retour}${sep}session_id={CHECKOUT_SESSION_ID}#/merci`,
    cancel_url: `${args.retour}#/commande`,
    metadata: { boutique: args.boutique, shopKey: args.shopKey, commandes: args.commandes.join(',').slice(0, 500) },
  })
  if (!session.url) throw new Error('Stripe n\'a pas rendu d\'adresse de paiement.')
  return { url: session.url, sessionId: session.id }
}

/** Relit la session chez Stripe. `paye` ne vient que de là. */
export async function paiementConfirme(cle: string, sessionId: string): Promise<boolean> {
  const stripe = new Stripe(cle)
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  return session.payment_status === 'paid'
}
