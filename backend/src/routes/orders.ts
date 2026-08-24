import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { identify, fetchEvents } from '../services/tracking.js'

export const ordersRouter = Router()
ordersRouter.use(requireAuth)

// Manual sale entry for now: no marketplace has a connected seller API yet
// (see PlatformCredential.connected), so there's no live webhook to trigger this
// automatically. Once a platform is connected, its webhook creates the Order the
// same way this endpoint does, and it will show up in the dashboard identically.
const createSchema = z.object({
  productId: z.string(),
  platform: z.enum(PLATFORM_IDS),
  externalOrderId: z.string().optional(),
  buyerName: z.string().min(1),
  buyerAddress: z.object({
    street: z.string(),
    city: z.string(),
    zip: z.string(),
    country: z.string().default('France'),
    phone: z.string().optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().default('EUR'),
})

ordersRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs de commande invalides' })

  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const order = await prisma.order.create({
    data: { ...parsed.data, userId: req.userId! },
  })
  res.status(201).json(order)
})

ordersRouter.get('/', async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { product: true },
  })
  res.json(orders)
})

/**
 * Figures for the orders workspace: turnover, real margin, and how many orders
 * sit in each state.
 *
 * Margin is computed against the product's current supplier cost, not the cost
 * at the time of sale — nothing records the latter yet. It is therefore an
 * indication, and it drifts if the seller edits a price afterwards. Said here so
 * nobody mistakes it for accounting.
 */
ordersRouter.get('/summary', async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId! },
    include: { product: { select: { price: true, shippingCost: true } } },
  })

  const parStatut: Record<string, number> = {}
  const parPlateforme: Record<string, { commandes: number; chiffre: number }> = {}
  let chiffre = 0
  let cout = 0

  for (const o of orders) {
    parStatut[o.status] = (parStatut[o.status] ?? 0) + 1

    // A refunded order is neither turnover nor margin: counting it would flatter
    // the figures exactly when the seller needs them to be honest.
    if (o.status === 'REFUNDED') continue

    const montant = Number(o.amount)
    chiffre += montant
    cout += Number(o.product.price) + Number(o.product.shippingCost)

    const p = (parPlateforme[o.platform] ??= { commandes: 0, chiffre: 0 })
    p.commandes++
    p.chiffre += montant
  }

  res.json({
    commandes: orders.length,
    chiffreAffaires: Number(chiffre.toFixed(2)),
    coutFournisseur: Number(cout.toFixed(2)),
    marge: Number((chiffre - cout).toFixed(2)),
    parStatut,
    parPlateforme,
  })
})

const bulkSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(200),
  status: z.enum(['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'REFUNDED']),
})

/**
 * Moves several orders at once.
 *
 * Scoped by userId in the same statement rather than checked beforehand: a list
 * of ids coming from the client must never be trusted to belong to the caller.
 */
ordersRouter.patch('/bulk/status', async (req: AuthedRequest, res) => {
  const parsed = bulkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélection invalide' })

  const { count } = await prisma.order.updateMany({
    where: { id: { in: parsed.data.orderIds }, userId: req.userId! },
    data: { status: parsed.data.status },
  })

  res.json({ updated: count, ignored: parsed.data.orderIds.length - count })
})

const updateSchema = z.object({
  status: z.enum(['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'REFUNDED']).optional(),
  trackingNumber: z.string().optional(),
  shippingLabelUrl: z.string().optional(),
  receiptUrl: z.string().optional(),
  payoutStatus: z.enum(['PENDING', 'RELEASED']).optional(),
  platformBalance: z.number().optional(),
  supplierOrderUrl: z.string().optional(),
})

// Covers "marquer comme expédié", attacher étiquette/reçu, statut de paiement:
// saisis manuellement ici tant qu'aucune plateforme n'est connectée en API réelle.
ordersRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const owned = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Commande introuvable' })

  const order = await prisma.order.update({ where: { id: req.params.id }, data: parsed.data })
  res.json(order)
})

/**
 * La fiche d'une commande : adresse, colis, et de quoi joindre l'acheteur.
 *
 * Le suivi détaillé n'arrive que si une clé 17TRACK est configurée ; sans elle,
 * le lien vers le transporteur reste affiché, ce qui couvre l'essentiel du
 * besoin sans imposer un abonnement à un vendeur qui débute.
 */
ordersRouter.get('/:id', async (req: AuthedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { product: { select: { id: true, title: true, aiTitle: true, images: true } } },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })

  const tracking = order.trackingNumber ? identify(order.trackingNumber, order.carrier) : null
  const events = tracking ? await fetchEvents(tracking.number, tracking.carrier) : null

  // Une conversation déjà ouverte pour cette commande : le bouton « contacter »
  // doit y ramener au lieu d'en créer une deuxième.
  const conversation = await prisma.conversation.findFirst({
    where: { userId: req.userId!, orderId: order.id },
    select: { id: true },
  })

  res.json({
    ...order,
    amount: Number(order.amount),
    platformBalance: order.platformBalance === null ? null : Number(order.platformBalance),
    tracking,
    events,
    conversationId: conversation?.id ?? null,
  })
})

const trackingSchema = z.object({
  trackingNumber: z.string().trim().min(3).max(60),
  carrier: z.string().trim().max(40).optional(),
})

ordersRouter.put('/:id/tracking', async (req: AuthedRequest, res) => {
  const parsed = trackingSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Numéro de suivi invalide' })

  const { count } = await prisma.order.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { trackingNumber: parsed.data.trackingNumber, carrier: parsed.data.carrier ?? null },
  })
  if (!count) return res.status(404).json({ error: 'Commande introuvable' })

  res.json({ ok: true, tracking: identify(parsed.data.trackingNumber, parsed.data.carrier) })
})

/**
 * Contacter l'acheteur depuis la commande.
 *
 * Ouvre une conversation dans la messagerie, rattachée à la commande et au
 * produit, et confiée au chef de rayon qui saura répondre. Rien n'est envoyé
 * ici : le vendeur écrit, relit, et décide.
 */
ordersRouter.post('/:id/contact', async (req: AuthedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { product: { select: { id: true, title: true, aiTitle: true } } },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })

  const existing = await prisma.conversation.findFirst({
    where: { userId: req.userId!, orderId: order.id },
    select: { id: true },
  })
  if (existing) return res.json({ id: existing.id, created: false })

  const conversation = await prisma.conversation.create({
    data: {
      userId: req.userId!,
      platform: order.platform,
      customerName: order.buyerName,
      customerEmail: order.buyerEmail,
      subject: `Commande ${order.externalOrderId ?? order.id.slice(0, 8)}`,
      productId: order.productId,
      orderId: order.id,
      // Ouverte par le vendeur : rien à signaler comme non lu.
      unread: false,
    },
  })

  res.status(201).json({ id: conversation.id, created: true })
})
