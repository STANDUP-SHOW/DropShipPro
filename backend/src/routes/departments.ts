import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { DEPARTMENTS, DEPARTMENT_KEYS, findDepartment } from '../services/departments.js'

/**
 * Les chefs de rayon du vendeur.
 *
 * Embaucher un agent est un geste explicite : tant qu'un rayon n'est pas confié,
 * rien n'y est déposé et l'écran ne s'encombre pas d'un secteur que le vendeur
 * ne travaille pas.
 */
export const departmentsRouter = Router()
departmentsRouter.use(requireAuth)

/** Les profils disponibles, et ceux déjà en poste. */
departmentsRouter.get('/catalogue', async (req: AuthedRequest, res) => {
  const hired = await prisma.department.findMany({
    where: { userId: req.userId! },
    select: { key: true },
  })
  const taken = new Set(hired.map((h) => h.key))

  res.json(DEPARTMENTS.map((d) => ({ ...d, hired: taken.has(d.key) })))
})

departmentsRouter.get('/', async (req: AuthedRequest, res) => {
  const departments = await prisma.department.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { opportunities: true, signals: true } },
    },
  })

  // Le nombre de nouveautés est ce que le vendeur regarde en premier le matin.
  const pending = await prisma.opportunity.groupBy({
    by: ['departmentId'],
    where: { userId: req.userId!, status: 'NEW' },
    _count: true,
  })
  const pendingBy = new Map(pending.map((p) => [p.departmentId, p._count]))

  res.json(
    departments.map((d) => {
      const profile = findDepartment(d.key)
      return {
        id: d.id,
        key: d.key,
        agentName: d.agentName,
        label: profile?.label ?? d.key,
        emoji: profile?.emoji ?? '📦',
        focus: profile?.focus ?? '',
        covers: profile?.covers ?? [],
        opportunities: d._count.opportunities,
        signals: d._count.signals,
        pending: pendingBy.get(d.id) ?? 0,
        createdAt: d.createdAt,
      }
    }),
  )
})

const hireSchema = z.object({ key: z.enum(DEPARTMENT_KEYS as [string, ...string[]]) })

departmentsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = hireSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Rayon inconnu' })

  const profile = findDepartment(parsed.data.key)!

  const existing = await prisma.department.findUnique({
    where: { userId_key: { userId: req.userId!, key: profile.key } },
  })
  if (existing) return res.status(400).json({ error: `${existing.agentName} tient déjà ce rayon.` })

  const created = await prisma.department.create({
    data: { userId: req.userId!, key: profile.key, agentName: profile.agentName },
  })

  res.status(201).json({
    id: created.id,
    key: created.key,
    agentName: created.agentName,
    label: profile.label,
    emoji: profile.emoji,
  })
})

/**
 * Rendre un rayon.
 *
 * Ce que l'agent avait trouvé est conservé et se retrouve dans la veille
 * générale : le vendeur peut encore vouloir importer un produit repéré la
 * semaine dernière. Supprimer le rayon ne doit pas supprimer son travail.
 */
departmentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.department.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!count) return res.status(404).json({ error: 'Rayon introuvable' })
  res.status(204).send()
})
