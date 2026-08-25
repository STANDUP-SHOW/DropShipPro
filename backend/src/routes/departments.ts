import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { DEPARTMENTS, DEPARTMENT_KEYS, findDepartment } from '../services/departments.js'
import { AGENT_PLANS, isActive } from '../services/agentBilling.js'
import { reserveCredits } from '../services/billing.js'
import {
  COUT_EN_CREDITS,
  FRAICHEUR_JOURS,
  adviseOnProduct,
  normalizeUrl,
} from '../services/productAdvice.js'

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

  res.json({
    profiles: DEPARTMENTS.map((d) => ({ ...d, hired: taken.has(d.key) })),
    plans: AGENT_PLANS,
  })
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
        paidUntil: d.paidUntil,
        plan: d.plan,
        active: isActive(d.paidUntil),
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

  // Vingt-quatre heures offertes à l'embauche : de quoi recevoir un premier
  // rapport et une première liste avant de décider. Sans cet essai, personne ne
  // paie un agent qu'il n'a jamais vu travailler.
  const created = await prisma.department.create({
    data: {
      userId: req.userId!,
      key: profile.key,
      agentName: profile.agentName,
      plan: 'essai',
      paidUntil: new Date(Date.now() + 24 * 3600 * 1000),
    },
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

/**
 * « Info sur un produit » : le vendeur colle une adresse, le rayon rend un avis.
 *
 * Trois crédits, cinq recherches. L'avis est resservi sans repayer pendant une
 * semaine sur la même adresse : un vendeur indécis recolle le même lien quatre
 * fois dans la journée, et il paierait quatre fois la même réponse — notre
 * facture triplerait avec la sienne.
 */
const avisSchema = z.object({ url: z.string().trim().min(8).max(2000) })

departmentsRouter.post('/:id/product-info', async (req: AuthedRequest, res) => {
  const parsed = avisSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Collez l'adresse du produit." })

  const url = normalizeUrl(parsed.data.url)
  if (!url) return res.status(400).json({ error: "Cette adresse n'est pas lisible." })

  const department = await prisma.department.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!department) return res.status(404).json({ error: 'Rayon introuvable' })

  const profil = findDepartment(department.key)

  // Le cache d'abord : inutile de vérifier un solde pour resservir.
  const connu = await prisma.productReview.findUnique({
    where: { userId_url: { userId: req.userId!, url } },
  })
  const frais =
    connu && Date.now() - connu.createdAt.getTime() < FRAICHEUR_JOURS * 24 * 3600 * 1000

  if (connu && frais) {
    return res.json({ review: connu, billed: false, credits: null })
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { credits: true, plan: true, premiumUntil: true },
  })
  const illimite = user.plan === 'PREMIUM' && (!user.premiumUntil || user.premiumUntil > new Date())
  if (!illimite && user.credits < COUT_EN_CREDITS) {
    return res.status(402).json({
      error: `Un avis coûte ${COUT_EN_CREDITS} crédits : il vous en reste ${user.credits}.`,
      needsCredits: true,
    })
  }

  let avis
  try {
    avis = await adviseOnProduct(url, profil?.label ?? department.key)
  } catch (err) {
    // Rien rendu, rien facturé.
    return res.status(503).json({
      error: err instanceof Error ? err.message : "L'avis n'a pas pu être rendu.",
    })
  }

  const review = await prisma.productReview.upsert({
    where: { userId_url: { userId: req.userId!, url } },
    create: {
      userId: req.userId!,
      departmentId: department.id,
      url,
      title: avis.title,
      verdict: avis.verdict,
      suppliers: avis.suppliers,
      social: avis.social,
      marketplace: avis.marketplace,
      sources: avis.sources,
    },
    update: {
      departmentId: department.id,
      title: avis.title,
      verdict: avis.verdict,
      suppliers: avis.suppliers,
      social: avis.social,
      marketplace: avis.marketplace,
      sources: avis.sources,
      createdAt: new Date(),
    },
  })

  let credits = user.credits
  if (!illimite) {
    const pris = await reserveCredits(req.userId!, COUT_EN_CREDITS)
    if (pris.ok) credits = user.credits - COUT_EN_CREDITS
  }

  res.status(201).json({ review, billed: !illimite, credits: illimite ? null : credits })
})

/** Les avis déjà rendus dans ce rayon : payés une fois, relisibles toujours. */
departmentsRouter.get('/:id/product-info', async (req: AuthedRequest, res) => {
  const reviews = await prisma.productReview.findMany({
    where: { userId: req.userId!, departmentId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  res.json({ count: reviews.length, reviews })
})
