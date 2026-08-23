import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  PACKS,
  PREMIUM,
  SIGNUP_CREDITS,
  appUrl,
  findPack,
  getStripe,
  grantPack,
  isPremium,
} from '../services/billing.js'

export const billingRouter = Router()

/** Public: the pricing grid is shown on the site before anyone signs in. */
billingRouter.get('/plans', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json({
    signupCredits: SIGNUP_CREDITS,
    packs: PACKS,
    premium: PREMIUM,
    /** False when no Stripe key is set: the UI then hides the buy buttons. */
    enabled: Boolean(getStripe()),
  })
})

billingRouter.use(requireAuth)

/** Balance and plan of the signed-in seller. */
billingRouter.get('/me', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, planId: true, amount: true, credits: true, createdAt: true },
  })

  res.json({
    credits: user.credits,
    premium: isPremium(user),
    premiumUntil: user.premiumUntil,
    payments,
  })
})

/** Stripe product tax code: « Software as a service (SaaS) - business use ». */
const TAX_CODE = 'txcd_10103001'

const checkoutSchema = z.object({ planId: z.string() })

/**
 * Opens a Stripe Checkout session.
 *
 * Prices are declared inline rather than referencing Price objects created in the
 * dashboard: the grid then lives in one place, in the code, and no deploy can
 * disagree with what Stripe charges.
 */
billingRouter.post('/checkout', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  if (!stripe) return res.status(503).json({ error: 'Paiement indisponible pour le moment.' })

  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Formule inconnue' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const isSubscription = parsed.data.planId === PREMIUM.id
  const pack = isSubscription ? null : findPack(parsed.data.planId)
  if (!isSubscription && !pack) return res.status(400).json({ error: 'Formule inconnue' })

  // One Stripe customer per account, reused: without it every purchase creates a
  // new customer and the subscription portal shows an empty history.
  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: isSubscription ? 'subscription' : 'payment',
    locale: 'fr',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: isSubscription ? PREMIUM.amount : pack!.amount,
          product_data: {
            name: isSubscription ? PREMIUM.label : `DropShipper IA — ${pack!.label}`,
            // Required as soon as Managed Payments is on, which it is by default:
            // without it Stripe refuses the session outright. SaaS for business
            // use is what this is — software reached over the internet, nothing
            // downloaded, sold to sellers for their trade.
            tax_code: TAX_CODE,
          },
          ...(isSubscription ? { recurring: { interval: 'month' as const } } : {}),
        },
      },
    ],
    // Read back in the webhook: the session is the only link between the payment
    // and the account once Stripe answers asynchronously.
    metadata: { userId: user.id, planId: parsed.data.planId },
    success_url: `${appUrl()}/abonnement?paiement=ok`,
    cancel_url: `${appUrl()}/abonnement?paiement=annule`,
  })

  res.json({ url: session.url })
})

/** Stripe's own portal: card change, invoices, cancellation. */
billingRouter.post('/portal', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  if (!stripe) return res.status(503).json({ error: 'Paiement indisponible pour le moment.' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!user.stripeCustomerId) return res.status(400).json({ error: 'Aucun paiement enregistré.' })

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl()}/abonnement`,
  })
  res.json({ url: session.url })
})

/**
 * Stripe webhook.
 *
 * Mounted separately in index.ts with a raw body parser: the signature is computed
 * on the exact bytes Stripe sent, so a JSON round-trip invalidates it.
 */
export async function stripeWebhook(req: Request, res: Response) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!stripe || !secret) return res.status(503).send('billing off')

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, secret)
  } catch (err) {
    // An unsigned or replayed-from-elsewhere call must never credit an account.
    console.error('signature Stripe refusée', (err as Error).message)
    return res.status(400).send('signature invalide')
  }

  // Stripe retries until it gets a 2xx. Without this guard a retry would credit
  // the same pack twice.
  const seen = await prisma.webhookEvent.findUnique({ where: { id: event.id } })
  if (seen) return res.json({ received: true, duplicate: true })

  try {
    await handleEvent(event)
    await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } })
  } catch (err) {
    console.error('traitement du webhook Stripe', event.type, err)
    // 500 so Stripe retries: better a late credit than a lost one.
    return res.status(500).send('erreur de traitement')
  }

  res.json({ received: true })
}

async function handleEvent(event: import('stripe').Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId = session.metadata?.userId
      const planId = session.metadata?.planId
      if (!userId || !planId) return

      if (session.mode === 'subscription') {
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: 'PREMIUM',
            stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
            // Extended on each paid invoice; a month covers the first period.
            premiumUntil: new Date(Date.now() + 32 * 24 * 3600 * 1000),
          },
        })
        await prisma.payment.create({
          data: {
            userId,
            planId: PREMIUM.id,
            amount: session.amount_total ?? PREMIUM.amount,
            credits: 0,
            stripeSessionId: session.id,
          },
        })
        return
      }

      const pack = findPack(planId)
      if (pack) await grantPack(userId, pack, session.id, session.amount_total ?? pack.amount)
      return
    }

    // Renewal: push the paid-until date forward.
    case 'invoice.paid': {
      const invoice = event.data.object
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
      if (!customerId) return
      const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } })
      if (!user) return
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'PREMIUM', premiumUntil: new Date(Date.now() + 32 * 24 * 3600 * 1000) },
      })
      return
    }

    // Cancelled or failed: the account falls back to credits at the end of the
    // period, never mid-month — the seller paid for it.
    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null
      if (!customerId) return
      const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } })
      if (!user) return
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'FREE', stripeSubscriptionId: null },
      })
      return
    }
  }
}
