import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PACKS, SIGNUP_CREDITS, appUrl, findPack, getStripe, grantPack } from '../services/billing.js'
import { DROPS, EURO_PAR_DROP, USD_PAR_DROP } from '../services/tarifs.js'

export const billingRouter = Router()

/**
 * Public : la grille de recharges et les tarifs des actions, montrés avant même
 * la connexion.
 *
 * Un seul portefeuille en drops (07/09/2026) : plus d'abonnement, plus de
 * location d'agent. On expose aussi le tarif en drops de chaque action, pour que
 * le site affiche « tant de drops » sur chaque bouton depuis une source unique.
 */
billingRouter.get('/plans', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json({
    signupCredits: SIGNUP_CREDITS,
    euroParDrop: EURO_PAR_DROP,
    usdParDrop: USD_PAR_DROP,
    packs: PACKS,
    tarifs: DROPS,
    /** False when no Stripe key is set: the UI then hides the buy buttons. */
    enabled: Boolean(getStripe()),
  })
})

billingRouter.use(requireAuth)

/** Solde de drops et derniers paiements du vendeur connecté. */
billingRouter.get('/me', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, planId: true, amount: true, credits: true, createdAt: true },
  })

  res.json({
    /** Le solde, en drops (le champ garde son nom `credits` en base). */
    credits: user.credits,
    euroParDrop: EURO_PAR_DROP,
    usdParDrop: USD_PAR_DROP,
    payments,
  })
})

/**
 * Le relevé du portefeuille : chaque mouvement de drops, du plus récent au plus
 * ancien. C'est ce que le vendeur voit dans « Mes crédits » — rechargements et
 * chaque action facturée, avec son libellé, son montant signé et le solde après.
 *
 * Paginé par curseur (`before` = id du dernier mouvement déjà affiché) : un
 * compte actif accumule des milliers de lignes, on ne les envoie pas d'un bloc.
 */
billingRouter.get('/transactions', async (req: AuthedRequest, res) => {
  const before = typeof req.query.before === 'string' ? req.query.before : undefined
  const mouvements = await prisma.dropTransaction.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: { id: true, delta: true, balance: true, motif: true, ref: true, createdAt: true },
  })
  res.json({
    mouvements,
    /** L'id à repasser en `before` pour la page suivante, ou null s'il n'y en a plus. */
    suite: mouvements.length === 50 ? mouvements[mouvements.length - 1].id : null,
  })
})

/** Stripe product tax code: « Software as a service (SaaS) - business use ». */
const TAX_CODE = 'txcd_10103001'

const checkoutSchema = z.object({ planId: z.string() })

/**
 * Opens a Stripe Checkout session for a drops recharge.
 *
 * Prices are declared inline rather than referencing Price objects created in the
 * dashboard: the grid then lives in one place, in the code, and no deploy can
 * disagree with what Stripe charges. Only drops packs are sold — no subscription,
 * no rental — so every session is a one-off `payment`.
 */
billingRouter.post('/checkout', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  if (!stripe) return res.status(503).json({ error: 'Paiement indisponible pour le moment.' })

  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Recharge inconnue' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

  const pack = findPack(parsed.data.planId)
  if (!pack) return res.status(400).json({ error: 'Recharge inconnue' })

  // One Stripe customer per account, reused: without it every purchase creates a
  // new customer and the payment history shows empty.
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
    mode: 'payment',
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
          unit_amount: pack.amount,
          // Prices are advertised TTC, as French consumer law requires: the amount
          // above is what the buyer pays, VAT included, not a base to add tax to.
          tax_behavior: 'inclusive',
          product_data: {
            name: `DropShipper — ${pack.drops} drops`,
            // Required as soon as Managed Payments is on, which it is by default:
            // without it Stripe refuses the session outright.
            tax_code: TAX_CODE,
          },
        },
      },
    ],
    // Without this a one-off payment leaves only a receipt; sellers need a real
    // invoice, and they need it from us rather than from a Stripe page.
    invoice_creation: { enabled: true },
    // Read back on confirm/webhook: the session is the only link between the
    // payment and the account once Stripe answers asynchronously.
    metadata: { userId: user.id, planId: parsed.data.planId },
    // Where the iframe sends the buyer once the payment is done. The session id
    // lets the wallet page confirm the outcome instead of assuming it.
    return_url: `${appUrl()}/credits?session_id={CHECKOUT_SESSION_ID}`,
  })

  // The client secret is what mounts the form; there is no URL to redirect to.
  res.json({ clientSecret: session.client_secret })
})

/**
 * Grants a recharge from its session id, without waiting for the webhook.
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

  const pack = findPack(session.metadata?.planId ?? '')
  if (!pack) return res.status(400).json({ error: 'Recharge inconnue sur ce paiement.' })

  await grantPack(req.userId!, pack, session.id, session.amount_total ?? pack.amount)
  res.json({ granted: true, credits: pack.drops })
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

/** Stripe's own portal: card change, invoices. */
billingRouter.post('/portal', async (req: AuthedRequest, res) => {
  const stripe = getStripe()
  if (!stripe) return res.status(503).json({ error: 'Paiement indisponible pour le moment.' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!user.stripeCustomerId) return res.status(400).json({ error: 'Aucun paiement enregistré.' })

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl()}/credits`,
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
  // Only one-off drops recharges exist now — a completed checkout grants its pack.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const planId = session.metadata?.planId
    if (!userId || !planId) return
    const pack = findPack(planId)
    if (pack) await grantPack(userId, pack, session.id, session.amount_total ?? pack.amount)
  }
}
