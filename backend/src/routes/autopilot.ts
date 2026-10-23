import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { runAutopilot, tourneeAutopilot, AUTO_PLATFORMS } from '../services/autopilot.js'
import { PLATFORMS } from '../services/platforms.js'
import { rayonsAutoShipper, IMPORTABLES_PAR_RAYON } from '../services/autoShipperRayons.js'
import { DEPARTMENT_KEYS, findDepartment } from '../services/departments.js'
import { DROPS } from '../services/tarifs.js'
import { contexteVoies, voieDe, type VoieImport } from '../services/autoShipperFile.js'

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
  produitsRayons: {},
}

autopilotRouter.get('/', async (req: AuthedRequest, res) => {
  const settings = await prisma.autopilot.findUnique({ where: { userId: req.userId! } })
  const departements = await prisma.department.findMany({ where: { userId: req.userId! }, select: { id: true, key: true, boost: true } })
  const ctx = await contexteVoies(req.userId!)

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
          produitsRayons: (settings.produitsRayons ?? {}) as Record<string, number>,
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
    // Comment ce vendeur-là reçoit les produits que seul un navigateur lit (14/10/2026) :
    // API AliExpress si reliée, sinon application desktop, sinon file de l'extension.
    voies: ctx,
    rayons: rayonsAutoShipper().map(({ navigateur, ...r }) => {
      const dep = departements.find((d) => d.key === r.key)
      // La voie de chaque importable : l'agent de contrôle ne sert qu'à la voie « extension ».
      const voies: Record<VoieImport, number> = { serveur: r.importables - navigateur.length, api: 0, desktop: 0, extension: 0 }
      for (const url of navigateur) voies[voieDe(url, ctx, true)]++
      return { ...r, voies, parExtension: voies.extension, departmentId: dep?.id ?? null, boost: Boolean(dep?.boost) }
    }),
  })
})

const settingsSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int().min(1).max(480), // 480 = sans plafond choisi ; le vrai maximum est 23 rayons × 10 gagnants = 230 par jour (16/10/2026)
  produitsParRayon: z.number().int().min(1).max(10),
  autoPublish: z.boolean(),
  destinations: z.array(z.string()).max(10),
  minMargin: z.number().int().min(0).max(1000),
  requireEuStock: z.boolean(),
  controleAgent: z.boolean().optional(),
  produitsRayons: z.record(z.string(), z.number().int().min(0).max(10)).optional(),
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
 * Les rayons sélectionnés d'AUTO-SHIPPER : les rayons cochés sont confiés s'ils
 * ne l'étaient pas, et marqués (colonne `boost`, nom historique) ; les autres
 * perdent la marque. Gratuit : la sélection ne fait que reprendre les gagnants
 * publics des rapports. Booster un rayon, c'est autre chose : l'analyse
 * personnelle du chef (AUTO-MODE), payante à chaque passage (Max, 23/10/2026).
 */
autopilotRouter.put('/rayons', async (req: AuthedRequest, res) => {
  const parsed = z.object({ keys: z.array(z.enum(DEPARTMENT_KEYS as [string, ...string[]])).max(DEPARTMENT_KEYS.length) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Rayons invalides' })

  const voulus = new Set(parsed.data.keys)
  const confies = await prisma.department.findMany({ where: { userId: req.userId! } })
  for (const key of voulus) {
    if (confies.some((d) => d.key === key)) continue
    await prisma.department.create({ data: { userId: req.userId!, key, agentName: findDepartment(key)!.agentName, boost: true } })
  }
  for (const d of confies) {
    const boost = voulus.has(d.key)
    if (d.boost !== boost) await prisma.department.update({ where: { id: d.id }, data: { boost } })
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

/**
 * Le rapport des journées AUTO-SHIPPER (14/10/2026) : les jours qui ont au moins
 * un passage, puis, pour un jour, ce que ses imports ont donné depuis — ventes,
 * achats, chiffre d'affaires, marge — en tout et par rayon boost.
 *
 * Un produit est compté pour un jour quand le journal de ce jour le dit
 * « importé » et que son opportunité a donné lieu à l'import : le journal est
 * la seule trace écrite de ce que le pilote a fait, pas une estimation.
 * Les commandes remboursées ne comptent pas.
 */
autopilotRouter.get('/rapports', async (req: AuthedRequest, res) => {
  const jours = await prisma.autopilotRun.findMany({
    where: { userId: req.userId! },
    distinct: ['day'],
    orderBy: { day: 'desc' },
    select: { day: true },
    take: 120,
  })
  res.json({ jours: jours.map((j) => j.day) })
})

autopilotRouter.get('/rapports/:jour', async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const jour = req.params.jour
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return res.status(400).json({ error: 'Date invalide' })

  const runs = await prisma.autopilotRun.findMany({ where: { userId, day: jour } })
  if (!runs.length) return res.status(404).json({ error: 'Aucun passage ce jour-là' })

  const titres = new Set<string>()
  for (const r of runs) {
    for (const l of (Array.isArray(r.log) ? r.log : []) as Array<{ titre?: unknown; action?: unknown }>) {
      if (l?.action === 'importé' && typeof l.titre === 'string' && l.titre !== '—') titres.add(l.titre)
    }
  }

  const debut = new Date(`${jour}T00:00:00Z`)
  const fin = new Date(debut.getTime() + 24 * 3600 * 1000)
  const opps = titres.size
    ? await prisma.opportunity.findMany({
        where: { userId, status: 'IMPORTED', title: { in: [...titres] }, productId: { not: null } },
        select: { productId: true, departmentId: true },
      })
    : []
  const produits = opps.length
    ? await prisma.product.findMany({
        where: { id: { in: opps.map((o) => o.productId!) }, userId, createdAt: { gte: debut, lt: fin } },
        select: { id: true, title: true, aiTitle: true, price: true, shippingCost: true, sellingPrice: true },
      })
    : []
  const commandes = produits.length
    ? await prisma.order.findMany({
        where: { userId, productId: { in: produits.map((p) => p.id) }, status: { not: 'REFUNDED' } },
        select: { productId: true, amount: true, quantity: true },
      })
    : []

  const rayons = await prisma.department.findMany({ where: { userId }, select: { id: true, key: true } })
  const cleDe = new Map(rayons.map((d) => [d.id, d.key]))
  const rayonDuProduit = new Map(opps.map((o) => [o.productId!, o.departmentId ? cleDe.get(o.departmentId) ?? null : null]))

  type Somme = { produits: number; ventes: number; achats: number; ca: number }
  const vide = (): Somme => ({ produits: 0, ventes: 0, achats: 0, ca: 0 })
  const total = vide()
  const parRayon = new Map<string, Somme>()
  const ligne = (key: string | null) => {
    const k = key ?? 'sans-rayon'
    if (!parRayon.has(k)) parRayon.set(k, vide())
    return parRayon.get(k)!
  }
  const cout = new Map(produits.map((p) => [p.id, Number(p.price) + Number(p.shippingCost ?? 0)]))
  for (const p of produits) {
    total.produits++
    ligne(rayonDuProduit.get(p.id) ?? null).produits++
  }
  for (const c of commandes) {
    const r = ligne(rayonDuProduit.get(c.productId) ?? null)
    const achats = (cout.get(c.productId) ?? 0) * c.quantity
    for (const s of [total, r]) {
      s.ventes += c.quantity
      s.ca += Number(c.amount)
      s.achats += achats
    }
  }
  const arrondi = (n: number) => Math.round(n * 100) / 100
  const sortie = (s: Somme) => ({
    produits: s.produits,
    ventes: s.ventes,
    achats: arrondi(s.achats),
    ca: arrondi(s.ca),
    marge: arrondi(s.ca - s.achats),
    margePct: s.ca > 0 ? Math.round(((s.ca - s.achats) / s.ca) * 1000) / 10 : null,
  })

  res.json({
    jour,
    passages: runs.length,
    importes: runs.reduce((n, r) => n + r.imported, 0),
    publies: runs.reduce((n, r) => n + r.published, 0),
    ecartes: runs.reduce((n, r) => n + r.skipped, 0),
    echecs: runs.reduce((n, r) => n + r.failed, 0),
    total: sortie(total),
    rayons: [...parRayon.entries()].map(([key, s]) => ({ key, label: findDepartment(key)?.label ?? 'Sans rayon', ...sortie(s) })),
  })
})
