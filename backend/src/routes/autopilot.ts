import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { runAutopilot, tourneeAutopilot, AUTO_PLATFORMS } from '../services/autopilot.js'
import { PLATFORMS } from '../services/platforms.js'
import { rayonsAutoShipper, IMPORTABLES_PAR_RAYON } from '../services/autoShipperRayons.js'
import { DEPARTMENT_KEYS, findDepartment } from '../services/departments.js'
import { DROPS } from '../services/tarifs.js'

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
  produitsParRayon: 10,
  autoPublish: false,
  destinations: ['OWN_SITE'],
  minMargin: 50,
  requireEuStock: false,
  controleAgent: false,
}

autopilotRouter.get('/', async (req: AuthedRequest, res) => {
  const settings = await prisma.autopilot.findUnique({ where: { userId: req.userId! } })
  const departements = await prisma.department.findMany({ where: { userId: req.userId! }, select: { id: true, key: true, autoMode: true } })

  res.json({
    settings: settings
      ? {
          enabled: settings.enabled,
          dailyLimit: settings.dailyLimit,
          produitsParRayon: settings.produitsParRayon,
          autoPublish: settings.autoPublish,
          destinations: Array.isArray(settings.destinations) ? settings.destinations : [],
          minMargin: settings.minMargin,
          requireEuStock: settings.requireEuStock,
          controleAgent: settings.controleAgent,
        }
      : DEFAULTS,
    lastAutoRunAt: settings?.lastAutoRunAt ?? null,
    // Les seules destinations qu'une machine peut servir seule. Les autres
    // supposent de piloter un compte vendeur sur un site tiers.
    destinations: PLATFORMS.filter((p) => AUTO_PLATFORMS.includes(p.id)).map((p) => ({
      id: p.id,
      label: p.label,
      color: p.color,
    })),
    // Ce que le serveur débite (services/tarifs.ts) : l'écran calcule avec ces chiffres, jamais en dur.
    tarifs: {
      journee: DROPS.autoShipperJour,
      parProduit: DROPS.autoShipperImport,
      controle: DROPS.autoShipperControle,
    },
    importablesParRayon: IMPORTABLES_PAR_RAYON,
    // Les 24 rayons, ce que leurs analyses du dernier jour donnent, et lesquels sont en boost.
    rayons: rayonsAutoShipper().map((r) => {
      const dep = departements.find((d) => d.key === r.key)
      return { ...r, departmentId: dep?.id ?? null, boost: Boolean(dep?.autoMode) }
    }),
  })
})

const settingsSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int().min(1).max(480), // 50 conseillés ; jusqu à 480 (24 catégories × 20 produits) pour qui peut se l offrir (17/09/2026)
  produitsParRayon: z.number().int().min(1).max(10),
  autoPublish: z.boolean(),
  destinations: z.array(z.string()).max(10),
  minMargin: z.number().int().min(0).max(1000),
  requireEuStock: z.boolean(),
  controleAgent: z.boolean().optional(),
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

/**
 * Les rayons boost : les rayons cochés sont confiés s'ils ne l'étaient pas, et
 * leur AUTO-MODE est levé ; les autres rayons confiés le baissent. Confier un
 * rayon et lever son AUTO-MODE sont gratuits (07/09/2026, 17/09/2026).
 */
autopilotRouter.put('/rayons', async (req: AuthedRequest, res) => {
  const parsed = z.object({ keys: z.array(z.enum(DEPARTMENT_KEYS as [string, ...string[]])).max(DEPARTMENT_KEYS.length) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Rayons invalides' })

  const voulus = new Set(parsed.data.keys)
  const confies = await prisma.department.findMany({ where: { userId: req.userId! } })
  for (const key of voulus) {
    if (confies.some((d) => d.key === key)) continue
    await prisma.department.create({ data: { userId: req.userId!, key, agentName: findDepartment(key)!.agentName, autoMode: true } })
  }
  for (const d of confies) {
    const boost = voulus.has(d.key)
    if (d.autoMode !== boost) await prisma.department.update({ where: { id: d.id }, data: { autoMode: boost } })
  }
  res.json({ ok: true, boost: [...voulus] })
})

/**
 * Activer AUTO-SHIPPER IA pour 24 heures : la journée est débitée tout de suite
 * et le premier passage part aussitôt, sans attendre la tournée (toutes les 3 h).
 * La tournée reste la seule à débiter : elle rend la journée si rien n'est
 * importé, et ne la redemande pas le même jour. Le passage tourne en fond.
 */
autopilotRouter.post('/activer', async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Réglages invalides' })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } })
  const avant = await prisma.autopilot.findUnique({ where: { userId } })
  const dejaPayee = Boolean(avant?.lastAutoRunAt && avant.lastAutoRunAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10))
  if (!dejaPayee && (user?.credits ?? 0) < DROPS.autoShipperJour) {
    return res.status(402).json({ error: `Il faut ${DROPS.autoShipperJour} drops pour la journée AUTO-SHIPPER.` })
  }

  const destinations = parsed.data.destinations.filter((d) => AUTO_PLATFORMS.includes(d as never))
  const data = { ...parsed.data, destinations, enabled: true }
  await prisma.autopilot.upsert({ where: { userId }, create: { ...data, userId }, update: data })

  tourneeAutopilot(runAutopilot, 0, userId).catch((err) =>
    console.error(`auto-shipper : activation de ${userId} en échec`, err instanceof Error ? err.message : err),
  )
  res.json({ ok: true, journeeDejaPayee: dejaPayee })
})
