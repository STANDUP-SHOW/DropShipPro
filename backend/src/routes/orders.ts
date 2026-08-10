import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'

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
