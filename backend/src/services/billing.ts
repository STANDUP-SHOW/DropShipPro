import Stripe from 'stripe'
import { prisma } from '../lib/prisma.js'
import { PACKS_DROPS, DROPS_INSCRIPTION, type PackDrops } from './tarifs.js'

/**
 * Le portefeuille en drops — la monnaie unique de DropShipper (07/09/2026).
 *
 * Plus d'abonnement, plus de location d'agent : le vendeur accède à tout et paie
 * ce qu'il consomme. Chaque action débite un nombre de drops (voir `tarifs.ts`),
 * le solde vit dans `User.credits` (le champ garde son nom en base, il compte
 * désormais des drops), et une recharge crédite des drops. Publier reste gratuit.
 */

/** Le solde de drops offert à l'inscription. Réexporté pour la valeur par défaut Prisma. */
export const SIGNUP_CREDITS = DROPS_INSCRIPTION

/** Les recharges disponibles, en drops (1 drop = 1 centime). */
export const PACKS = PACKS_DROPS
export type Pack = PackDrops

let stripe: Stripe | null = null

/** Null when no key is configured: the app must still run without billing. */
export function getStripe(): Stripe | null {
  if (stripe) return stripe
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  stripe = new Stripe(key)
  return stripe
}

export function findPack(id: string): PackDrops | undefined {
  return PACKS_DROPS.find((p) => p.id === id)
}

export interface CreditCheck {
  ok: boolean
  /** Drops réellement débités (le coût demandé, ou 0 si refusé). */
  allowed: number
  reason?: string
}

/**
 * Inscrit un mouvement au relevé du portefeuille.
 *
 * Best-effort à dessein : le débit du solde (juste au-dessus) fait autorité et
 * doit tenir même si l'écriture du relevé échoue — une ligne d'historique perdue
 * ne doit jamais bloquer une action déjà payée, ni pire, la refuser après coup.
 * L'échec est journalisé, pas propagé.
 */
async function inscrireMouvement(userId: string, delta: number, balance: number, motif: string, ref?: string) {
  try {
    await prisma.dropTransaction.create({ data: { userId, delta, balance, motif, ref: ref ?? null } })
  } catch (err) {
    console.error('relevé drops non écrit', motif, err instanceof Error ? err.message : err)
  }
}

/**
 * Réserve `cost` drops, atomiquement et **tout ou rien**.
 *
 * Le décrément est conditionné au solde dans la même requête : deux actions
 * lancées d'un coup depuis deux onglets ne peuvent pas passer toutes les deux un
 * contrôle lire-puis-écrire et prendre les mêmes derniers drops.
 *
 * Tout ou rien, et non partiel : une action coûte un nombre fixe de drops, et en
 * débiter la moitié n'a aucun sens (on ne fait pas un demi-import). Les lots
 * réservent donc drop par drop, action par action, dans leur boucle.
 *
 * `motif` est le libellé porté au relevé du vendeur ; `ref` désigne l'objet
 * concerné (produit, publicité…) quand il existe.
 */
export async function reserveCredits(
  userId: string,
  cost = 1,
  motif = 'Action',
  ref?: string,
): Promise<CreditCheck> {
  if (cost <= 0) return { ok: true, allowed: 0 }
  const { count } = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: cost } },
    data: { credits: { decrement: cost } },
  })
  if (count === 0) {
    return {
      ok: false,
      allowed: 0,
      reason: 'Solde de drops insuffisant. Rechargez votre portefeuille pour continuer.',
    }
  }
  const apres = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } })
  await inscrireMouvement(userId, -cost, apres?.credits ?? 0, motif, ref)
  return { ok: true, allowed: cost }
}

/**
 * Rend `cost` drops quand le travail n'a pas été livré.
 *
 * Un scraping qui ne rend rien, ou un appel IA raté qui laisse le texte source
 * intact, ne doit pas être facturé : le vendeur n'a pas eu ce qu'il a payé. Le
 * remboursement figure au relevé, pour que le solde reste explicable ligne à ligne.
 */
export async function refundCredits(userId: string, cost = 1, motif = 'Remboursement', ref?: string): Promise<void> {
  if (cost <= 0) return
  const apres = await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: cost } },
    select: { credits: true },
  })
  await inscrireMouvement(userId, cost, apres.credits, motif, ref)
}

/** Crédite les drops d'une recharge payée, enregistre le paiement et le relevé. */
export async function grantPack(userId: string, pack: PackDrops, sessionId: string, amount: number) {
  const apres = await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: pack.drops } },
    select: { credits: true },
  })
  await prisma.payment.create({
    data: { userId, planId: pack.id, amount, credits: pack.drops, stripeSessionId: sessionId },
  })
  await inscrireMouvement(userId, pack.drops, apres.credits, `Recharge de ${pack.drops} drops`, sessionId)
}

/** Where Stripe sends the buyer back. First entry of FRONTEND_URL, apex or www. */
export function appUrl(): string {
  return (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')
}
