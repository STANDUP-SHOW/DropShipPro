import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { askDepartment } from '../services/departmentChat.js'
import { reserveCredits } from '../services/billing.js'
import { AGENT_CATEGORIES, PIPELINE_AGENTS, SUPPORT_AGENTS, findSupportAgent } from '../services/agentRoster.js'
import { askSupportAgent } from '../services/supportChat.js'
import { findDepartment } from '../services/departments.js'

/**
 * Vrai quand l'agent payant est effectivement payé.
 *
 * Un agent compris dans l'abonnement répond toujours. Les autres se taisent
 * quand la période est passée — sans quoi le prix ne veut rien dire — mais la
 * conversation reste : reprendre son avocat ne doit pas effacer ses conseils.
 */
async function agentActif(userId: string, agentKey: string, monthly?: number) {
  if (!monthly) return true
  const abo = await prisma.agentSubscription.findUnique({
    where: { userId_agentKey: { userId, agentKey } },
  })
  return Boolean(abo && abo.paidUntil > new Date())
}

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

// --- Agents transverses ----------------------------------------------------

/**
 * L'équipe fournie d'office, avec l'état réel de chacun.
 *
 * Un agent « actif » l'est parce que le service derrière répond, pas parce que
 * la liste le dit. Un vendeur qui voit « actif » sur un agent en panne perd sa
 * confiance dans les huit autres.
 */
chatRouter.get('/agents/roster', async (req: AuthedRequest, res) => {
  const [user, departments] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { controlAgent: true },
    }),
    prisma.department.count({ where: { userId: req.userId! } }),
  ])

  const autopilot = await prisma.autopilot.findUnique({ where: { userId: req.userId! } })
  const iaReady = Boolean(process.env.ANTHROPIC_API_KEY)

  const statusOf = (key: string): { state: 'actif' | 'inactif' | 'indisponible'; note: string | null } => {
    if (!iaReady && key !== 'scrapper' && key !== 'seller') {
      return { state: 'indisponible', note: "Le service d'intelligence artificielle ne répond pas." }
    }
    if (key === 'control' && !user.controlAgent) {
      return { state: 'inactif', note: 'Désactivé dans vos réglages.' }
    }
    if (key === 'autopilot') {
      if (!autopilot?.enabled) return { state: 'inactif', note: 'Pilote automatique désactivé.' }
      if (!departments) return { state: 'inactif', note: "Aucun chef de rayon : il n'a rien à traiter." }
      return { state: 'actif', note: `Plafond de ${autopilot.dailyLimit} import(s) par jour.` }
    }
    return { state: 'actif', note: null }
  }

  const abonnements = await prisma.agentSubscription.findMany({ where: { userId: req.userId! } })
  const paidUntil = new Map(abonnements.map((a) => [a.agentKey, a.paidUntil]))

  const rayons = await prisma.department.findMany({
    where: { userId: req.userId! },
    select: { id: true, key: true, agentName: true, paidUntil: true },
    orderBy: { createdAt: 'asc' },
  })

  res.json({
    categories: AGENT_CATEGORIES,
    // Les chefs de rayon sont nommés, pas seulement comptés : « 3 rayons
    // confiés » ne dit pas lesquels, et le vendeur veut voir son équipe.
    rayons: rayons.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.agentName,
      label: findDepartment(r.key)?.label ?? r.key,
      paidUntil: r.paidUntil,
      active: Boolean(r.paidUntil && r.paidUntil > new Date()),
    })),
    pipeline: PIPELINE_AGENTS.map((a) => ({ ...a, ...statusOf(a.key) })),
    support: SUPPORT_AGENTS.map((a) => {
      const echeance = paidUntil.get(a.key) ?? null
      const actif = !a.monthly || Boolean(echeance && echeance > new Date())
      return {
        ...a,
        ...statusOf(a.key),
        hired: actif,
        paidUntil: echeance,
        // Un agent payant non souscrit n'est pas « en panne » : il n'est pas
        // embauché, ce qui n'est pas la même inquiétude.
        ...(a.monthly && !actif ? { state: 'inactif' as const, note: 'Pas encore embauché.' } : {}),
      }
    }),
    departments,
  })
})

chatRouter.get('/support/:key', async (req: AuthedRequest, res) => {
  const agent = findSupportAgent(req.params.key)
  if (!agent) return res.status(404).json({ error: 'Agent introuvable' })

  const messages = await prisma.chatMessage.findMany({
    where: { userId: req.userId!, supportAgent: agent.key },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  res.json({ agent, messages })
})

/**
 * Une question à un agent de comptoir.
 *
 * Facturée comme une question à un chef de rayon : c'est le même appel au
 * modèle, avec en plus une lecture de l'état du compte.
 */
chatRouter.post('/support/:key', async (req: AuthedRequest, res) => {
  const agent = findSupportAgent(req.params.key)
  if (!agent) return res.status(404).json({ error: 'Agent introuvable' })

  const parsed = askSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Écrivez votre question' })

  if (!(await agentActif(req.userId!, agent.key, agent.monthly))) {
    return res.status(402).json({
      error: `${agent.name} n'est pas encore embauché. Son abonnement est de ${((agent.monthly ?? 0) / 100).toFixed(2)} € par mois.`,
      needsHire: true,
    })
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { credits: true, plan: true, premiumUntil: true },
  })
  const unlimited = user.plan === 'PREMIUM' && (!user.premiumUntil || user.premiumUntil > new Date())
  if (!unlimited && user.credits < 1) {
    return res.status(402).json({
      error: "Il vous faut au moins un crédit pour poser une question à un agent.",
      needsCredits: true,
    })
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: req.userId!, supportAgent: agent.key },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { role: true, content: true },
  })

  const answer = await askSupportAgent(agent.key, req.userId!, history.reverse(), parsed.data.question)

  // Une panne n'est pas une conversation : rien n'est enregistré ni facturé, et
  // le vendeur peut reposer sa question à l'identique.
  if (answer.failed) return res.status(503).json({ error: answer.content })

  await prisma.chatMessage.create({
    data: { userId: req.userId!, supportAgent: agent.key, role: 'user', content: parsed.data.question },
  })
  const saved = await prisma.chatMessage.create({
    data: { userId: req.userId!, supportAgent: agent.key, role: 'agent', content: answer.content },
  })

  let credits = user.credits
  if (!unlimited) {
    const taken = await reserveCredits(req.userId!, 1)
    if (taken.ok) credits = user.credits - 1
  }

  res.status(201).json({
    message: saved,
    route: answer.route,
    credits: unlimited ? null : credits,
  })
})
