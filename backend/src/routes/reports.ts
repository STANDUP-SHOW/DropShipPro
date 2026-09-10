import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { askDepartment } from '../services/departmentChat.js'
import { etatPlafond, messagePlafond, PLAFOND_JOUR } from '../services/chatBudget.js'
import { reserveCredits } from '../services/billing.js'
import { DROPS } from '../services/tarifs.js'
import { AGENT_CATEGORIES, ALL_AGENTS, PIPELINE_AGENTS, SUPPORT_AGENTS, findSupportAgent } from '../services/agentRoster.js'
import { askSupportAgent } from '../services/supportChat.js'
import { findDepartment } from '../services/departments.js'

/**
 * Le tarif d'une question, en drops.
 *
 * Modèle du 10/09/2026 : **seul l'avocat se paie à la question** (`access:
 * 'question'`), au tarif d'un agent lourd — il raisonne comme un chef de rayon.
 * Tous les autres agents de comptoir sont compris dans la plateforme (les
 * administratifs) ou payés à l'action ailleurs (le marketing, à la publicité) :
 * leur conversation ne se facture pas. Un plafond quotidien les borne quand
 * même, côté serveur, pour notre propre coût d'IA.
 */
function coutQuestion(access: string): number {
  return access === 'question' ? DROPS.questionChef : 0
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

  // Plus d'abonnement (07/09/2026) : un chef de rayon confié répond toujours,
  // et chaque question est facturée en drops. Le solde est vérifié avant
  // d'appeler le modèle : payer un appel pour annoncer ensuite qu'il n'y avait
  // pas de drops serait absurde.
  const COUT = DROPS.questionChef
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { credits: true },
  })
  if (user.credits < COUT) {
    return res.status(402).json({
      error: `Une question à un chef de rayon coûte ${COUT} drops : il vous en reste ${user.credits}.`,
      needsCredits: true,
    })
  }

  /*
   * Le plafond du jour, verifie avant l appel.
   *
   * L abonnement d un chef de rayon vaut quinze euros par mois pour un nombre
   * de questions qui n etait borne par rien. Trente reponses par jour, c est le
   * double de ce que l abonnement couvre : invisible pour qui travaille
   * normalement, et le seul garde-fou contre le cas ou un seul vendeur coute
   * plus que ce que cent rapportent.
   */
  const quota = await etatPlafond(req.userId!, { departmentId: department.id })
  if (!quota.reste) {
    return res.status(429).json({ error: messagePlafond(department.agentName), quotaAtteint: true })
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: req.userId!, departmentId: department.id },
    orderBy: { createdAt: 'desc' },
    // Trente plutot que dix : le resume des anciens echanges a besoin de
    // matiere, et il ne coute presque rien puisqu il est reduit avant l envoi.
    take: 30,
    select: { role: true, content: true },
  })

  const answer = await askDepartment(
    department.key,
    department.agentName,
    history.reverse().map((m) => ({ role: m.role as 'user' | 'agent', content: m.content })),
    parsed.data.question,
    req.userId!,
    department.id,
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
  if (answer.billed) {
    const taken = await reserveCredits(req.userId!, COUT, 'Question à un chef de rayon')
    if (taken.ok) credits = user.credits - COUT
  }

  res.status(201).json({
    message: saved,
    billed: answer.billed,
    credits,
    // Le compteur voyage avec la reponse : le vendeur voit venir le plafond au
    // lieu de le decouvrir sur un refus.
    quota: { utilise: quota.utilise + (answer.billed ? 1 : 0), plafond: PLAFOND_JOUR },
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

  const autos = await prisma.agentAutoSetting.findMany({ where: { userId: req.userId! } })
  const autoPar = new Map(autos.map((a) => [a.agentKey, a.enabled]))

  const rayons = await prisma.department.findMany({
    where: { userId: req.userId! },
    select: { id: true, key: true, agentName: true, autoMode: true },
    orderBy: { createdAt: 'asc' },
  })

  res.json({
    categories: AGENT_CATEGORIES,
    // Les chefs de rayon sont nommés, pas seulement comptés : « 3 rayons
    // confiés » ne dit pas lesquels, et le vendeur veut voir son équipe.
    // Plus d'abonnement (07/09/2026) : un rayon confié est toujours en poste.
    rayons: rayons.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.agentName,
      label: findDepartment(r.key)?.label ?? r.key,
      active: true,
      autoMode: r.autoMode,
    })),
    // L'AUTO-MODE prend le défaut de l'agent tant que le vendeur n'a rien réglé
    // (10/09/2026) : actif d'office pour la production et les administratifs,
    // « à activer » pour le marketing et le contrôle.
    pipeline: PIPELINE_AGENTS.map((a) => ({
      ...a,
      ...statusOf(a.key),
      autoMode: autoPar.get(a.key) ?? a.autoDefault,
    })),
    // Tout agent est accessible ; `hired` reste vrai pour l'interface existante.
    support: SUPPORT_AGENTS.map((a) => ({
      ...a,
      ...statusOf(a.key),
      hired: true,
      autoMode: autoPar.get(a.key) ?? a.autoDefault,
    })),
    departments,
  })
})

/**
 * L'interrupteur IA AUTO-MODE d'un agent d'administration : sa tâche —
 * réponses aux messages, comptabilité, factures — s'exécute en autonomie
 * quand il est levé. Le réglage est posé ici ; chaque automatisme d'agent
 * vient le lire avant d'agir.
 */
chatRouter.patch('/support/:key/auto', async (req: AuthedRequest, res) => {
  // Every admin agent carries the switch — chain agents included, their key
  // lives in the same registry and the same settings table.
  const agent = ALL_AGENTS.find((a) => a.key === req.params.key) ?? null
  if (!agent) return res.status(404).json({ error: 'Agent introuvable' })

  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  // Plus d'embauche préalable (07/09/2026) : tout agent peut passer en AUTO-MODE.
  // Chaque passage automatique est facturé en drops par la tâche elle-même.
  const maj = await prisma.agentAutoSetting.upsert({
    where: { userId_agentKey: { userId: req.userId!, agentKey: agent.key } },
    create: { userId: req.userId!, agentKey: agent.key, enabled: parsed.data.enabled },
    update: { enabled: parsed.data.enabled },
  })
  res.json({ agentKey: agent.key, autoMode: maj.enabled })
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

  // Seul l'avocat se paie à la question (10/09/2026) ; les autres agents de
  // comptoir sont inclus. COUT vaut alors 0 : pas de contrôle de solde, pas de
  // débit, mais le plafond quotidien reste (il borne notre coût d'IA).
  const COUT = coutQuestion(agent.access)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { credits: true },
  })
  if (COUT > 0 && user.credits < COUT) {
    return res.status(402).json({
      error: `Une question à ${agent.name} coûte ${COUT} drops : il vous en reste ${user.credits}.`,
      needsCredits: true,
    })
  }

  const quota = await etatPlafond(req.userId!, { supportAgent: agent.key })
  if (!quota.reste) {
    return res.status(429).json({ error: messagePlafond(agent.name), quotaAtteint: true })
  }

  const history = await prisma.chatMessage.findMany({
    where: { userId: req.userId!, supportAgent: agent.key },
    orderBy: { createdAt: 'desc' },
    take: 30,
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
  if (COUT > 0) {
    const taken = await reserveCredits(req.userId!, COUT, `Question à ${agent.name}`)
    if (taken.ok) credits = user.credits - COUT
  }

  res.status(201).json({
    message: saved,
    route: answer.route,
    credits,
    quota: { utilise: quota.utilise + (answer.failed ? 0 : 1), plafond: PLAFOND_JOUR },
  })
})
