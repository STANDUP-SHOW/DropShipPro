import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { DEPARTMENTS, DEPARTMENT_KEYS, findDepartment } from '../services/departments.js'
import { AGENT_PLANS, isActive } from '../services/agentBilling.js'
import { enqueteAliExpress } from '../services/enqueteFournisseurs.js'
import { reserveCredits } from '../services/billing.js'
import { SECTOR_CATEGORIES } from '../services/categorySectors.js'
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
        autoMode: d.autoMode,
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

  /*
   * Pas d'essai gratuit — décision du 05/09/2026 : « un chef de rayon doit
   * être embauché pour travailler, point ». L'embauche crée le rayon à
   * l'arrêt ; il se met au travail quand sa formule est payée (1 jour,
   * 1 semaine ou 1 mois), et c'est la page du rayon qui la propose.
   */
  const created = await prisma.department.create({
    data: {
      userId: req.userId!,
      key: profile.key,
      agentName: profile.agentName,
      plan: null,
      paidUntil: null,
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
 * Lance l'enquête fournisseurs sans attendre la tournée.
 *
 * Le vendeur qui vient de relier sa clé AliExpress veut voir la liste tout de
 * suite, pas demain matin. La garde des vingt heures s'applique quand même :
 * relancer dix fois ne relève pas dix fois.
 */
departmentsRouter.post('/:id/enquete', async (req: AuthedRequest, res) => {
  const department = await prisma.department.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!department) return res.status(404).json({ error: 'Rayon introuvable' })
  if (!isActive(department.paidUntil) || department.plan === 'essai') {
    return res.status(402).json({
      error: `${department.agentName} n'est pas en poste : choisissez sa formule pour lancer une enquête — un chef travaille quand il est embauché.`,
    })
  }

  const resultat = await enqueteAliExpress(req.userId!)
  res.json(resultat)
})

/**
 * L'interrupteur IA AUTO-MODE du rayon (05/09/2026) : toutes les douze
 * heures, une analyse de marché et dix produits gagnants. Inclus dans le
 * salaire — mais un chef qui n'est pas en poste n'a pas d'automatismes.
 */
departmentsRouter.patch('/:id/auto', async (req: AuthedRequest, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const department = await prisma.department.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!department) return res.status(404).json({ error: 'Rayon introuvable' })
  if (parsed.data.enabled && (!isActive(department.paidUntil) || department.plan === 'essai')) {
    return res.status(402).json({
      error: `${department.agentName} n'est pas en poste : choisissez sa formule pour activer son mode automatique.`,
    })
  }

  const maj = await prisma.department.update({
    where: { id: department.id },
    data: { autoMode: parsed.data.enabled },
  })
  res.json({ id: maj.id, autoMode: maj.autoMode })
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

/**
 * Ce que le rayon a rapporté, et ce qui bouge sur les boutiques.
 *
 * Un chef de rayon conseille des produits ; la seule question qui compte
 * ensuite est de savoir si ceux-là se sont vendus. Le lien entre un rayon et
 * une annonce passe par la catégorie : les entrées du catalogue portent leur
 * secteur, et le secteur porte la clé du rayon.
 *
 * Les chiffres sont ceux des commandes réellement enregistrées. Rien n'est
 * estimé ni extrapolé : une place de marché qui ne remonte pas ses ventes
 * apparaît à zéro, et c'est dit.
 */
departmentsRouter.get('/:id/sales', async (req: AuthedRequest, res) => {
  const department = await prisma.department.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!department) return res.status(404).json({ error: 'Rayon introuvable' })

  const categoryIds = SECTOR_CATEGORIES.filter((c) => c.sector === department.key).map((c) => c.id)

  const products = await prisma.product.findMany({
    where: { userId: req.userId!, categoryId: { in: categoryIds } },
    select: { id: true, title: true, aiTitle: true, createdAt: true, publications: true },
  })
  const productIds = products.map((p) => p.id)

  const orders = productIds.length
    ? await prisma.order.findMany({
        where: { userId: req.userId!, productId: { in: productIds } },
        select: {
          id: true,
          platform: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          product: { select: { id: true, title: true, aiTitle: true, price: true, shippingCost: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    : []

  const parPlateforme = new Map<string, { commandes: number; chiffre: number; marge: number }>()
  for (const o of orders) {
    if (o.status === 'REFUNDED') continue
    const ligne = parPlateforme.get(o.platform) ?? { commandes: 0, chiffre: 0, marge: 0 }
    const revient = Number(o.product.price) + Number(o.product.shippingCost)
    ligne.commandes += 1
    ligne.chiffre += Number(o.amount)
    ligne.marge += Number(o.amount) - revient
    parPlateforme.set(o.platform, ligne)
  }

  // Ce qui est en ligne, et où : c'est la « notification boutique » du rayon —
  // ce qui vient d'être publié, et ce qui attend encore.
  const publications = products.flatMap((p) =>
    p.publications.map((pub) => ({
      productId: p.id,
      titre: p.aiTitle || p.title,
      platform: pub.platform,
      status: pub.status,
      externalUrl: pub.externalUrl,
      publishedAt: pub.publishedAt,
      error: pub.error,
    })),
  )

  res.json({
    rayon: { id: department.id, key: department.key, agentName: department.agentName },
    annonces: products.length,
    parPlateforme: [...parPlateforme.entries()]
      .map(([platform, l]) => ({ platform, ...l }))
      .sort((a, b) => b.chiffre - a.chiffre),
    ventes: orders.slice(0, 40).map((o) => ({
      id: o.id,
      platform: o.platform,
      titre: o.product.aiTitle || o.product.title,
      montant: Number(o.amount),
      devise: o.currency,
      status: o.status,
      createdAt: o.createdAt,
    })),
    publications: publications
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, 40),
  })
})
