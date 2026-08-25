import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { findAgentPlan, extendDepartment } from '../services/agentBilling.js'
import { findImagePack } from './visuals.js'
import { findSupportAgent } from '../services/agentRoster.js'
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

const checkoutSchema = z.object({
  planId: z.string(),
  /** Le rayon à prolonger, quand la formule est celle d'un chef de rayon. */
  departmentId: z.string().optional(),
})

/** Les formules « chef de rayon » se reconnaissent à leur préfixe. */
const AGENT_PREFIX = 'agent:'

/** Les recharges d'images des agents visuels. */
const IMAGE_PREFIX = 'img-'

/** L'embauche d'un agent de comptoir payant, au mois. */
const HIRE_PREFIX = 'agent-hire:'

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

  // Le salaire d'un chef de rayon : un paiement unique qui prolonge un rayon
  // précis. Il faut donc vérifier que le rayon appartient bien à ce vendeur
  // avant d'encaisser quoi que ce soit.
  const agentPlan = parsed.data.planId.startsWith(AGENT_PREFIX)
    ? findAgentPlan(parsed.data.planId.slice(AGENT_PREFIX.length))
    : null

  let department: { id: string; agentName: string; key: string } | null = null
  if (agentPlan) {
    if (!parsed.data.departmentId) return res.status(400).json({ error: 'Rayon manquant' })
    department = await prisma.department.findFirst({
      where: { id: parsed.data.departmentId, userId: user.id },
      select: { id: true, agentName: true, key: true },
    })
    if (!department) return res.status(404).json({ error: 'Rayon introuvable' })
  } else if (parsed.data.planId.startsWith(AGENT_PREFIX)) {
    return res.status(400).json({ error: 'Formule inconnue' })
  }

  const hired = parsed.data.planId.startsWith(HIRE_PREFIX)
    ? findSupportAgent(parsed.data.planId.slice(HIRE_PREFIX.length))
    : null
  if (parsed.data.planId.startsWith(HIRE_PREFIX) && (!hired || !hired.monthly)) {
    return res.status(400).json({ error: 'Agent inconnu' })
  }

  const imagePack = parsed.data.planId.startsWith(IMAGE_PREFIX)
    ? findImagePack(parsed.data.planId)
    : null
  if (parsed.data.planId.startsWith(IMAGE_PREFIX) && !imagePack) {
    return res.status(400).json({ error: 'Formule inconnue' })
  }

  const isSubscription = parsed.data.planId === PREMIUM.id
  const pack = isSubscription || agentPlan || imagePack || hired ? null : findPack(parsed.data.planId)
  if (!isSubscription && !agentPlan && !imagePack && !hired && !pack) {
    return res.status(400).json({ error: 'Formule inconnue' })
  }

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
    // Embedded rather than hosted: the payment form is mounted inside the app,
    // the seller never leaves drop-shipper.fr. Card data still goes straight to
    // Stripe from an iframe, so nothing sensitive touches our servers.
    ui_mode: 'embedded_page',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: hired
            ? hired.monthly!
            : agentPlan
            ? agentPlan.amount
            : imagePack
              ? imagePack.amount
              : isSubscription
                ? PREMIUM.amount
                : pack!.amount,
          // Prices are advertised TTC, as French consumer law requires: the amount
          // above is what the buyer pays, VAT included, not a base to add tax to.
          tax_behavior: 'inclusive',
          product_data: {
            name: hired
              ? `${hired.role} ${hired.name} — 1 mois`
              : agentPlan
              ? `Chef de rayon ${department!.agentName} — ${agentPlan.label}`
              : imagePack
                ? `Agent visuel — ${imagePack.label}`
              : isSubscription
                ? PREMIUM.label
                : `DropShipper IA — ${pack!.label}`,
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
    // Without this a one-off payment leaves only a receipt; sellers need a real
    // invoice, and they need it from us rather than from a Stripe page.
    ...(isSubscription ? {} : { invoice_creation: { enabled: true } }),
    metadata: {
      userId: user.id,
      planId: parsed.data.planId,
      ...(department ? { departmentId: department.id } : {}),
    },
    // Where the iframe sends the buyer once the payment is done. The session id
    // lets the page confirm the outcome instead of assuming it.
    // Le vendeur revient là où il était : sur son rayon s'il vient d'embaucher,
    // sur son compte sinon.
    return_url: department
      ? `${appUrl()}/rayon/${department.id}?session_id={CHECKOUT_SESSION_ID}`
      : `${appUrl()}/abonnement?session_id={CHECKOUT_SESSION_ID}`,
  })

  // The client secret is what mounts the form; there is no URL to redirect to.
  res.json({ clientSecret: session.client_secret })
})

/**
 * Grants a purchase from its session id, without waiting for the webhook.
 *
 * A webhook can be late, misconfigured or refused — it happened on the very first
 * real payment here. Making the credit depend on it alone means a seller pays and
 * gets nothing, which is the one failure a paid product cannot afford. The buyer
 * comes back with the session id, and the truth is asked directly of Stripe.
 *
 * Safe to call repeatedly: Payment.stripeSessionId is unique, so a session
 * already granted is reported as such instead of being credited twice.
 */
billingRouter.post('/confirm', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  if (!stripe) return res.status(503).json({ error: 'Paiement indisponible pour le moment.' })

  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Session inconnue' })

  const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId)

  // The session must belong to the caller: a session id is not a secret, and
  // nobody should be able to credit their account with someone else's payment.
  if (session.metadata?.userId !== req.userId) {
    return res.status(403).json({ error: 'Ce paiement ne correspond pas à votre compte.' })
  }
  if (session.payment_status !== 'paid') {
    return res.json({ granted: false, status: session.payment_status })
  }

  const existing = await prisma.payment.findUnique({ where: { stripeSessionId: session.id } })
  if (existing) return res.json({ granted: true, alreadyGranted: true, credits: existing.credits })

  const planId = session.metadata?.planId ?? ''

  if (session.mode === 'subscription') {
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        plan: 'PREMIUM',
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
        premiumUntil: new Date(Date.now() + 32 * 24 * 3600 * 1000),
      },
    })
    await prisma.payment.create({
      data: {
        userId: req.userId!,
        planId: PREMIUM.id,
        amount: session.amount_total ?? PREMIUM.amount,
        credits: 0,
        stripeSessionId: session.id,
      },
    })
    return res.json({ granted: true, premium: true })
  }

  if (planId.startsWith(AGENT_PREFIX)) {
    const plan = findAgentPlan(planId.slice(AGENT_PREFIX.length))
    const departmentId = session.metadata?.departmentId
    if (!plan || !departmentId) {
      return res.status(400).json({ error: 'Formule inconnue sur ce paiement.' })
    }

    const owned = await prisma.department.findFirst({
      where: { id: departmentId, userId: req.userId! },
      select: { id: true, agentName: true },
    })
    if (!owned) return res.status(404).json({ error: 'Rayon introuvable' })

    const updated = await extendDepartment(owned.id, plan)
    await prisma.payment.create({
      data: {
        userId: req.userId!,
        planId,
        amount: session.amount_total ?? plan.amount,
        credits: 0,
        stripeSessionId: session.id,
      },
    })
    return res.json({ granted: true, agent: owned.agentName, paidUntil: updated.paidUntil })
  }

  if (planId.startsWith(HIRE_PREFIX)) {
    const agent = findSupportAgent(planId.slice(HIRE_PREFIX.length))
    if (!agent || !agent.monthly) return res.status(400).json({ error: 'Agent inconnu sur ce paiement.' })

    // La durée s'ajoute à ce qui reste : renouveler en avance ne doit pas
    // faire perdre les jours déjà payés.
    const existant = await prisma.agentSubscription.findUnique({
      where: { userId_agentKey: { userId: req.userId!, agentKey: agent.key } },
    })
    const depart = existant && existant.paidUntil > new Date() ? existant.paidUntil : new Date()
    const paidUntil = new Date(depart.getTime() + 30 * 24 * 3600 * 1000)

    await prisma.agentSubscription.upsert({
      where: { userId_agentKey: { userId: req.userId!, agentKey: agent.key } },
      create: { userId: req.userId!, agentKey: agent.key, paidUntil, plan: 'mois' },
      update: { paidUntil, plan: 'mois' },
    })
    await prisma.payment.create({
      data: {
        userId: req.userId!,
        planId,
        amount: session.amount_total ?? agent.monthly,
        credits: 0,
        stripeSessionId: session.id,
      },
    })
    return res.json({ granted: true, agent: agent.name, paidUntil })
  }

  if (planId.startsWith(IMAGE_PREFIX)) {
    const imagePack = findImagePack(planId)
    if (!imagePack) return res.status(400).json({ error: 'Formule inconnue sur ce paiement.' })

    await prisma.user.update({
      where: { id: req.userId! },
      data: { imageCredits: { increment: imagePack.images } },
    })
    await prisma.payment.create({
      data: {
        userId: req.userId!,
        planId,
        amount: session.amount_total ?? imagePack.amount,
        credits: 0,
        stripeSessionId: session.id,
      },
    })
    return res.json({ granted: true, images: imagePack.images })
  }

  const pack = findPack(planId)
  if (!pack) return res.status(400).json({ error: 'Formule inconnue sur ce paiement.' })

  await grantPack(req.userId!, pack, session.id, session.amount_total ?? pack.amount)
  res.json({ granted: true, credits: pack.credits })
})

/**
 * Invoices, shown in our own interface.
 *
 * The seller should never have to land on a Stripe page to find a receipt: the
 * list is served here, and the PDF is proxied below so the download stays on
 * drop-shipper.fr.
 */
billingRouter.get('/invoices', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!stripe || !user.stripeCustomerId) return res.json({ invoices: [] })

  const list = await stripe.invoices.list({ customer: user.stripeCustomerId, limit: 24 })
  res.json({
    invoices: list.data.map((i) => ({
      id: i.id,
      number: i.number,
      createdAt: new Date(i.created * 1000).toISOString(),
      total: i.total,
      currency: i.currency,
      status: i.status,
      paid: i.status === 'paid',
    })),
  })
})

/** Streams the invoice PDF through our domain, after checking it is the caller's. */
billingRouter.get('/invoices/:id/pdf', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!stripe || !user.stripeCustomerId) return res.status(404).json({ error: 'Facture introuvable' })

  const invoice = await stripe.invoices.retrieve(req.params.id)
  // An invoice id is guessable enough that ownership has to be checked.
  if (invoice.customer !== user.stripeCustomerId || !invoice.invoice_pdf) {
    return res.status(404).json({ error: 'Facture introuvable' })
  }

  const pdf = await fetch(invoice.invoice_pdf)
  if (!pdf.ok) return res.status(502).json({ error: 'Facture momentanément indisponible' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="facture-${invoice.number ?? invoice.id}.pdf"`)
  res.send(Buffer.from(await pdf.arrayBuffer()))
})

/** Registered cards, listed in our interface rather than on a Stripe page. */
billingRouter.get('/payment-methods', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!stripe || !user.stripeCustomerId) return res.json({ cards: [] })

  const methods = await stripe.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' })
  res.json({
    cards: methods.data.map((m) => ({
      id: m.id,
      brand: m.card?.brand ?? 'carte',
      last4: m.card?.last4 ?? '••••',
      expMonth: m.card?.exp_month ?? null,
      expYear: m.card?.exp_year ?? null,
    })),
  })
})

/**
 * Opens a card registration, mounted in our page.
 *
 * A SetupIntent stores a card without charging it — what "add a payment method"
 * means. The number goes straight to Stripe from its iframe, as with payment.
 */
billingRouter.post('/setup-intent', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  if (!stripe) return res.status(503).json({ error: 'Paiement indisponible pour le moment.' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } })
    customerId = customer.id
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } })
  }

  const intent = await stripe.setupIntents.create({ customer: customerId, usage: 'off_session' })
  res.json({ clientSecret: intent.client_secret })
})

billingRouter.delete('/payment-methods/:id', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!stripe || !user.stripeCustomerId) return res.status(404).json({ error: 'Carte introuvable' })

  const method = await stripe.paymentMethods.retrieve(req.params.id)
  if (method.customer !== user.stripeCustomerId) return res.status(403).json({ error: 'Carte introuvable' })

  await stripe.paymentMethods.detach(req.params.id)
  res.status(204).send()
})

/** Cancels at period end: the seller keeps what they paid for until it runs out. */
billingRouter.post('/cancel-subscription', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!stripe || !user.stripeSubscriptionId) return res.status(400).json({ error: 'Aucun abonnement actif.' })

  const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  })
  res.json({
    cancelled: true,
    activeUntil: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
  })
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
