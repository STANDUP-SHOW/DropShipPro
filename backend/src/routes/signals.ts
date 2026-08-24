import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { matchToCatalogue } from '../services/signalMatch.js'

/**
 * Les signaux de veille, côté vendeur.
 *
 * Deux lectures du même flux : ce que fait le marché, et ce qui touche ses
 * propres produits. La seconde est celle qui appelle une décision aujourd'hui,
 * et elle se noie dans la première si rien ne les sépare.
 */
export const signalsRouter = Router()
signalsRouter.use(requireAuth)

signalsRouter.get('/', async (req: AuthedRequest, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind.toUpperCase() : null
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null

  const items = await prisma.signal.findMany({
    where: {
      userId: req.userId!,
      ...(typeof req.query.department === 'string' ? { departmentId: req.query.department } : {}),
      ...(kind === 'SOCIAL' || kind === 'MARKET' ? { kind } : {}),
      ...(status === 'NEW' || status === 'KEPT' || status === 'REJECTED' ? { status } : {}),
    },
    orderBy: [{ detectedAt: 'desc' }],
    take: 300,
  })

  const matches = await matchToCatalogue(
    req.userId!,
    items.map((s) => ({ title: s.title, category: s.category, brand: s.brand })),
  )
  const matchList = [...matches.values()]

  res.json({
    count: items.length,
    signals: items.map((s, i) => ({
      ...s,
      matchedProducts: matchList[i] ?? [],
      // « Personnel » n'est pas déclaré par l'agent : il ne connaît pas le
      // catalogue. C'est le rapprochement qui le dit.
      personal: (matchList[i] ?? []).length > 0,
    })),
  })
})

const patchSchema = z.object({ status: z.enum(['NEW', 'KEPT', 'REJECTED']) })

signalsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Statut invalide' })

  const { count } = await prisma.signal.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { status: parsed.data.status },
  })
  if (!count) return res.status(404).json({ error: 'Signal introuvable' })
  res.json({ ok: true })
})

signalsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.signal.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!count) return res.status(404).json({ error: 'Signal introuvable' })
  res.status(204).send()
})
