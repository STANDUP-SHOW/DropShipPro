import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { runAutopilot, AUTO_PLATFORMS } from '../services/autopilot.js'
import { PLATFORMS } from '../services/platforms.js'

/**
 * Le pilote automatique, côté vendeur.
 *
 * Réglages, déclenchement manuel, et l'historique de ce qui a été fait. Ce
 * dernier n'est pas décoratif : quelqu'un qui laisse une machine acheter et
 * publier à sa place doit pouvoir relire chaque décision au réveil.
 */
export const autopilotRouter = Router()
autopilotRouter.use(requireAuth)

const DEFAULTS = {
  enabled: false,
  dailyLimit: 5,
  autoPublish: false,
  destinations: ['OWN_SITE'],
  minMargin: 50,
  requireEuStock: false,
}

autopilotRouter.get('/', async (req: AuthedRequest, res) => {
  const settings = await prisma.autopilot.findUnique({ where: { userId: req.userId! } })

  res.json({
    settings: settings
      ? {
          enabled: settings.enabled,
          dailyLimit: settings.dailyLimit,
          autoPublish: settings.autoPublish,
          destinations: Array.isArray(settings.destinations) ? settings.destinations : [],
          minMargin: settings.minMargin,
          requireEuStock: settings.requireEuStock,
        }
      : DEFAULTS,
    // Les seules destinations qu'une machine peut servir seule. Les autres
    // supposent de piloter un compte vendeur sur un site tiers.
    destinations: PLATFORMS.filter((p) => AUTO_PLATFORMS.includes(p.id)).map((p) => ({
      id: p.id,
      label: p.label,
      color: p.color,
    })),
  })
})

const settingsSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int().min(1).max(50),
  autoPublish: z.boolean(),
  destinations: z.array(z.string()).max(10),
  minMargin: z.number().int().min(0).max(1000),
  requireEuStock: z.boolean(),
})

autopilotRouter.put('/', async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Réglages invalides' })

  // Une destination hors liste est écartée en silence plutôt que refusée : la
  // liste peut rétrécir entre deux versions, et le vendeur n'y est pour rien.
  const destinations = parsed.data.destinations.filter((d) => AUTO_PLATFORMS.includes(d as never))

  const data = { ...parsed.data, destinations }
  const settings = await prisma.autopilot.upsert({
    where: { userId: req.userId! },
    create: { ...data, userId: req.userId! },
    update: data,
  })

  res.json({ ok: true, enabled: settings.enabled })
})

/** Lancer un passage tout de suite, pour voir ce que ça donne. */
autopilotRouter.post('/run', async (req: AuthedRequest, res) => {
  const result = await runAutopilot(req.userId!)
  res.json(result)
})

autopilotRouter.get('/runs', async (req: AuthedRequest, res) => {
  const runs = await prisma.autopilotRun.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  res.json({ count: runs.length, runs })
})
