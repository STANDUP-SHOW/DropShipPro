import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { askDepartment } from '../services/departmentChat.js'
import { reserveCredits } from '../services/billing.js'

/**
 * Les rapports archivés et les échanges avec les chefs de rayon.
 *
 * Les deux tiennent dans le même fichier parce qu'ils partagent la même règle :
 * ce sont les productions d'un agent, lues par le vendeur, et jamais un ordre
 * donné à l'application.
 */
export const reportsRouter = Router()
reportsRouter.use(requireAuth)

const SECTIONS = ['SOCIAL', 'SUPPLIERS', 'MARKET']

/** La liste ne renvoie pas les corps : trente rapports feraient une page lourde. */
reportsRouter.get('/', async (req: AuthedRequest, res) => {
  const section = typeof req.query.section === 'string' ? req.query.section.toUpperCase() : null

  const reports = await prisma.report.findMany({
    where: {
      userId: req.userId!,
      ...(section && SECTIONS.includes(section) ? { section } : {}),
      ...(typeof req.query.department === 'string' ? { departmentId: req.query.department } : {}),
    },
    orderBy: [{ day: 'desc' }, { createdAt: 'desc' }],
    take: 120,
    select: { id: true, section: true, day: true, title: true, summary: true, createdAt: true },
  })

  res.json({ count: reports.length, reports })
})

reportsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const report = await prisma.report.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!report) return res.status(404).json({ error: 'Rapport introuvable' })
  res.json(report)
})

reportsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.report.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!count) return res.status(404).json({ error: 'Rapport introuvable' })
  res.status(204).send()
})

// --- Discussion avec le chef de rayon -------------------------------------

export const chatRouter = Router()
chatRouter.use(requireAuth)

chatRouter.get('/:departmentId', async (req: AuthedRequest, res) => {
  const department = await prisma.department.findFirst({
    where: { id: req.params.departmentId, userId: req.userId! },
  })
  if (!department) return res.status(404).json({ error: 'Rayon introuvable' })

  const messages = await prisma.chatMessage.findMany({
    where: { userId: req.userId!, departmentId: department.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  res.json({ agentName: department.agentName, messages })
})

const askSchema = z.object({ question: z.string().trim().min(1).max(2000) })

/**
 * Une question posée, une réponse rendue.
 *
 * Le crédit est pris après coup, et seulement si la réponse relevait bien du
 * rayon. Le réserver avant obligerait à le rembourser dans trois cas sur
 * quatre, et un remboursement raté se voit tout de suite sur le compteur du
 * vendeur — alors qu'un débit tardif ne se perd jamais.
 */
chatRouter.post('/:departmentId', async (req: AuthedRequest, res) => {
  const parsed = askSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Écrivez votre question' })

  const department = await prisma.department.findFirst({
    where: { id: req.params.departmentId, userId: req.userId! },
  })
  if (!department) return res.status(404).json({ error: 'Rayon introuvable' })

  // Le solde est vérifié avant d'appeler le modèle : payer un appel pour
  // annoncer ensuite qu'il n'y avait pas de crédit serait absurde.
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { credits: true, plan: true, premiumUntil: true },
  })
  const unlimited = user.plan === 'PREMIUM' && (!user.premiumUntil || user.premiumUntil > new Date())
  if (!unlimited && user.credits < 1) {
    return res.status(402).json({
      error: "Il vous faut au moins un crédit pour poser une question à un chef de rayon.",
      needsCredits: true,
    })
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: req.userId!, departmentId: department.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { role: true, content: true },
  })

  const answer = await askDepartment(
    department.key,
    department.agentName,
    history.reverse().map((m) => ({ role: m.role as 'user' | 'agent', content: m.content })),
    parsed.data.question,
  )

  // Une panne du modèle n'est pas une conversation : rien n'est enregistré, et
  // le vendeur peut reposer sa question à l'identique.
  if (answer.failed) {
    return res.status(503).json({ error: answer.content })
  }

  await prisma.chatMessage.create({
    data: {
      userId: req.userId!,
      departmentId: department.id,
      role: 'user',
      content: parsed.data.question,
      billed: answer.billed,
    },
  })
  const saved = await prisma.chatMessage.create({
    data: {
      userId: req.userId!,
      departmentId: department.id,
      role: 'agent',
      content: answer.content,
      billed: answer.billed,
    },
  })

  let credits = user.credits
  if (answer.billed && !unlimited) {
    const taken = await reserveCredits(req.userId!, 1)
    if (taken.ok) credits = user.credits - 1
  }

  res.status(201).json({
    message: saved,
    billed: answer.billed && !unlimited,
    credits: unlimited ? null : credits,
  })
})
