import Stripe from 'stripe'
import type { User } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

/**
 * Credit packs and the unlimited subscription.
 *
 * A credit is consumed when a listing is *imported* — the moment the AI actually
 * costs money. Publishing is free and consumes nothing, which is what the offer
 * promises. Credits never expire and stack: an unused pack keeps its value.
 */
export interface Pack {
  id: string
  label: string
  /** Cents, so Stripe takes it without rounding surprises. */
  amount: number
  credits: number
}

export const PACKS: Pack[] = [
  { id: 'pack-20', label: '20 annonces', amount: 500, credits: 20 },
  { id: 'pack-50', label: '50 annonces', amount: 1000, credits: 50 },
  { id: 'pack-200', label: '200 annonces', amount: 2500, credits: 200 },
  { id: 'pack-500', label: '500 annonces', amount: 5000, credits: 500 },
  { id: 'pack-1250', label: '1250 annonces', amount: 10000, credits: 1250 },
]

export const PREMIUM = {
  id: 'premium',
  label: 'Premium — annonces illimitées',
  amount: 29900,
  /**
   * Fair-use ceiling, in imports per month.
   *
   * "Unlimited" at 299 € breaks even around 20 600 listings a month at the current
   * AI cost. Past that, every listing is sold below cost, so the plan needs a stop
   * — announced up front rather than discovered by a seller mid-month.
   */
  monthlyFairUse: 20000,
}

/** Free listings granted at signup — also the value of `credits` default in Prisma. */
export const SIGNUP_CREDITS = 10

let stripe: Stripe | null = null

/** Null when no key is configured: the app must still run without billing. */
export function getStripe(): Stripe | null {
  if (stripe) return stripe
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  stripe = new Stripe(key)
  return stripe
}

export function findPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id)
}

/** True while a paid subscription is running — checked on date, not on a flag. */
export function isPremium(user: Pick<User, 'plan' | 'premiumUntil'>): boolean {
  if (user.plan !== 'PREMIUM') return false
  // A cancelled subscription stays usable until the end of the paid period.
  return !user.premiumUntil || user.premiumUntil.getTime() > Date.now()
}

export interface CreditCheck {
  ok: boolean
  /** How many of the requested imports are actually covered. */
  allowed: number
  reason?: string
}

/**
 * Reserves credits for an import, atomically.
 *
 * The decrement is conditional on the balance in the same statement: two imports
 * fired at once from two tabs cannot both pass a read-then-write check and take
 * the same last credit.
 */
export async function reserveCredits(userId: string, wanted = 1): Promise<CreditCheck> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (isPremium(user)) return { ok: true, allowed: wanted }

  if (user.credits <= 0) {
    return {
      ok: false,
      allowed: 0,
      reason: "Vous n'avez plus d'annonces disponibles. Rechargez votre compte pour continuer.",
    }
  }

  const allowed = Math.min(wanted, user.credits)
  const { count } = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: allowed } },
    data: { credits: { decrement: allowed } },
  })

  if (count === 0) {
    return { ok: false, allowed: 0, reason: 'Solde insuffisant, réessayez.' }
  }
  return { ok: true, allowed }
}

/**
 * Gives a credit back when the work was not delivered.
 *
 * A scrape that returns nothing, or an AI call that failed and left the source
 * text untouched, must not be charged: the seller did not get what they paid for.
 */
export async function refundCredits(userId: string, count = 1): Promise<void> {
  if (count <= 0) return
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || isPremium(user)) return
  await prisma.user.update({ where: { id: userId }, data: { credits: { increment: count } } })
}

/** Adds the credits of a paid pack, and records the payment. */
export async function grantPack(userId: string, pack: Pack, sessionId: string, amount: number) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { credits: { increment: pack.credits } } }),
    prisma.payment.create({
      data: { userId, planId: pack.id, amount, credits: pack.credits, stripeSessionId: sessionId },
    }),
  ])
}

/** Where Stripe sends the buyer back. First entry of FRONTEND_URL, apex or www. */
export function appUrl(): string {
  return (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')
}
