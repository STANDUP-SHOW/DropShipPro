import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const reviewsRouter = Router()
reviewsRouter.use(requireAuth)

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(1500),
  displayName: z.string().trim().min(2).max(40).optional(),
})

/** The tester's own review, so the form opens on what they already wrote. */
reviewsRouter.get('/mine', async (req: AuthedRequest, res) => {
  const review = await prisma.review.findUnique({ where: { userId: req.userId! } })
  res.json(review)
})

/**
 * One review per account, hence an upsert rather than a create: a tester who comes
 * back after using the app corrects their opinion instead of stacking a second one.
 */
reviewsRouter.put('/', async (req: AuthedRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Donnez une note de 1 à 5 et un avis de 10 à 1500 caractères.',
    })
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  // Never the email: it would end up published on the home page.
  const displayName = parsed.data.displayName || user.shopName || 'Utilisateur DropShipper IA'
  const data = { rating: parsed.data.rating, comment: parsed.data.comment, displayName }

  const review = await prisma.review.upsert({
    where: { userId: req.userId! },
    create: { ...data, userId: req.userId! },
    update: data,
  })
  res.json(review)
})

reviewsRouter.delete('/', async (req: AuthedRequest, res) => {
  await prisma.review.deleteMany({ where: { userId: req.userId! } })
  res.status(204).send()
})
