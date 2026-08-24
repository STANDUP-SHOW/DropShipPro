import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireApiKey, type AgentRequest } from '../middleware/apiKey.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { findDepartment } from '../services/departments.js'
import { isActive } from '../services/agentBilling.js'
import { runAutopilot } from '../services/autopilot.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import type { Platform } from '@prisma/client'

/**
 * La porte d'entrée des agents de veille.
 *
 * Un agent extérieur — celui qui surveille les fournisseurs et les réseaux —
 * dépose ici ce qu'il a trouvé. Il ne peut rien faire d'autre : ni importer, ni
 * publier, ni payer. Ces trois gestes engagent le catalogue du vendeur, son
 * argent et ses comptes marchands ; ils restent derrière une session humaine.
 */
export const agentRouter = Router()

agentRouter.use(rateLimit({ name: 'agent', windowMs: 60_000, max: 120 }))
agentRouter.use(requireApiKey)

/** De quoi vérifier une clé fraîchement collée, sans rien écrire. */
agentRouter.get('/me', async (req: AgentRequest, res) => {
  const [user, waiting] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true, credits: true, plan: true } }),
    prisma.opportunity.count({ where: { userId: req.userId!, status: 'NEW' } }),
  ])
  res.json({ ok: true, compte: user?.email, credits: user?.credits, plan: user?.plan, opportunitesEnAttente: waiting })
})

/**
 * Traduit le rayon annoncé par l'agent en rayon réellement confié.
 *
 * Un agent peut se déclarer d'un rayon que le vendeur n'a pas ouvert. Le dépôt
 * n'est pas refusé pour autant — la trouvaille reste bonne — mais elle atterrit
 * dans la veille générale, et la réponse le dit plutôt que de le taire.
 */
async function resolveDepartment(userId: string, key: string | undefined) {
  if (!key) return { id: null as string | null, warning: null as string | null }
  const profile = findDepartment(key)
  if (!profile) return { id: null, warning: `Rayon « ${key} » inconnu, dépôt rangé dans la veille générale.` }

  const dept = await prisma.department.findUnique({ where: { userId_key: { userId, key: profile.key } } })
  if (!dept) {
    return { id: null, warning: `Rayon « ${profile.label} » non confié, dépôt rangé dans la veille générale.` }
  }
  // Un abonnement expiré arrête l'agent : sinon l'abonnement ne veut rien dire.
  // Le dépôt n'est pas refusé pour autant — la trouvaille reste bonne.
  if (!isActive(dept.paidUntil)) {
    return {
      id: null,
      warning: `Abonnement de ${dept.agentName} expiré : dépôt rangé dans la veille générale.`,
    }
  }
  return { id: dept.id, warning: null }
}

const opportunitySchema = z.object({
  source: z.string().trim().min(1).max(40),
  /** Clé du rayon, quand l'agent en tient un : high-tech, jardinage… */
  department: z.string().trim().max(40).optional(),
  sourceUrl: z.string().url().max(2000),
  title: z.string().trim().min(1).max(300),
  image: z.string().url().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  sourcePrice: z.number().nonnegative(),
  /** Prix moyen constaté sur les places de marché. Absent est une réponse valable. */
  marketPrice: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  /**
   * Compteur de ventes de la plateforme source. Il faut le laisser vide quand
   * elle n'en publie pas — un zéro inventé se lirait comme « ne se vend pas ».
   */
  salesCount: z.number().int().nonnegative().optional(),
  /**
   * Trois états. Omettre le champ veut dire « je n'ai pas pu vérifier », ce qui
   * est le cas le plus fréquent d'une veille automatique — et ce n'est pas la
   * même chose que « pas de stock en Europe ».
   */
  euStock: z.boolean().nullable().optional(),
  /**
   * Nombre de jours, ou le texte de la plateforme : « 3-5 jours ouvrés »,
   * « sous 48h ». Un scan de trois heures ne doit pas être perdu parce que le
   * délai est arrivé sous une forme inattendue.
   */
  deliveryDays: z.union([z.number(), z.string()]).optional(),
  warranty: z.string().trim().max(120).optional(),
  isNew: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  raw: z.unknown().optional(),
})

/**
 * Lit un délai de livraison quelle que soit sa forme.
 *
 * Le premier vrai lot déposé par un agent a été perdu en entier parce qu'il
 * envoyait « 3-5 jours ouvrés » là où un entier était attendu. Le texte est donc
 * conservé tel quel, et le nombre en est extrait quand il s'y trouve : la borne
 * haute d'un intervalle, parce qu'un vendeur qui promet un délai doit annoncer
 * le pire, pas le meilleur.
 */
function readDelivery(value: number | string | undefined): { days: number | null; text: string | null } {
  if (value === undefined || value === null) return { days: null, text: null }
  if (typeof value === 'number') {
    return { days: Number.isFinite(value) ? Math.min(365, Math.max(0, Math.round(value))) : null, text: null }
  }

  const text = value.trim().slice(0, 120)
  const numbers = text.match(/\d+/g)
  if (!numbers) return { days: null, text: text || null }

  const worst = Math.max(...numbers.map(Number))
  return { days: worst <= 365 ? worst : null, text }
}

const batchSchema = z.object({
  opportunities: z.array(opportunitySchema).min(1).max(100),
})

/**
 * Dépôt d'un lot de trouvailles.
 *
 * Le même produit repéré à chaque passage ne doit pas empiler des doublons : la
 * ligne est mise à jour. Une opportunité déjà arbitrée — gardée, écartée,
 * importée — ne repasse pas en « nouvelle », sinon un scan toutes les trois
 * heures ressusciterait indéfiniment ce que le vendeur a écarté.
 */
agentRouter.post('/opportunities', async (req: AgentRequest, res) => {
  const parsed = batchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Lot invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  let created = 0
  let updated = 0
  const warnings: string[] = []
  const rejected: Array<{ sourceUrl: string; raison: string }> = []

  for (const o of parsed.data.opportunities) {
    const delivery = readDelivery(o.deliveryDays)
    const dept = await resolveDepartment(req.userId!, o.department)
    if (dept.warning && !warnings.includes(dept.warning)) warnings.push(dept.warning)
    const data = {
      source: o.source,
      title: o.title,
      image: o.image ?? null,
      category: o.category ?? null,
      sourcePrice: o.sourcePrice,
      marketPrice: o.marketPrice ?? null,
      currency: o.currency?.toUpperCase() ?? 'EUR',
      salesCount: o.salesCount ?? null,
      euStock: o.euStock ?? null,
      deliveryDays: delivery.days,
      deliveryText: delivery.text,
      warranty: o.warranty ?? null,
      isNew: o.isNew ?? false,
      notes: o.notes ?? null,
      raw: (o.raw ?? null) as never,
      departmentId: dept.id,
    }

    try {
      const existing = await prisma.opportunity.findUnique({
        where: { userId_sourceUrl: { userId: req.userId!, sourceUrl: o.sourceUrl } },
        select: { id: true, status: true },
      })

      if (!existing) {
        await prisma.opportunity.create({ data: { ...data, sourceUrl: o.sourceUrl, userId: req.userId! } })
        created++
      } else {
        // Les chiffres sont rafraîchis, l'arbitrage du vendeur est intouchable.
        await prisma.opportunity.update({ where: { id: existing.id }, data })
        updated++
      }
    } catch (e) {
      rejected.push({ sourceUrl: o.sourceUrl, raison: (e as Error).message })
    }
  }

  res.status(201).json({
    recues: parsed.data.opportunities.length,
    creees: created,
    mises_a_jour: updated,
    rejetees: rejected,
    avertissements: warnings,
  })
})

/** Ce que l'agent a déjà déposé, pour qu'il sache où il en est entre deux passages. */
agentRouter.get('/opportunities', async (req: AgentRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null
  const valid = ['NEW', 'KEPT', 'REJECTED', 'IMPORTED']

  const items = await prisma.opportunity.findMany({
    where: {
      userId: req.userId!,
      ...(status && valid.includes(status) ? { status: status as 'NEW' } : {}),
    },
    orderBy: { detectedAt: 'desc' },
    take: 200,
  })

  res.json({ count: items.length, opportunities: items })
})

const signalSchema = z.object({
  /** SOCIAL : réseaux sociaux. MARKET : places de marché, prix, concurrence. */
  kind: z.enum(['SOCIAL', 'MARKET']),
  department: z.string().trim().max(40).optional(),
  platform: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(4000).optional(),
  url: z.string().url().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(120).optional(),
  /**
   * Chiffres libres : GMV, unités vendues, prix moyen, croissance. Aucun schéma
   * imposé, parce qu'aucune plateforme ne publie les mêmes.
   */
  metrics: z.record(z.union([z.number(), z.string()])).optional(),
  /**
   * Scores de 0 à 100. Ce sont des estimations issues de signaux publics, pas
   * des taux de conversion : les plateformes ne les publient pas.
   */
  engagementScore: z.number().int().min(0).max(100).optional(),
  trendScore: z.number().int().min(0).max(100).optional(),
  isNew: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  raw: z.unknown().optional(),
})

const signalsBatchSchema = z.object({ signals: z.array(signalSchema).min(1).max(100) })

/**
 * Empreinte de déduplication.
 *
 * L'URL serait le choix évident, mais la plupart des signaux n'en ont pas : « les
 * bagues connectées percent en France » ne pointe nulle part. Le titre normalisé
 * fait le travail, et un même constat reformulé à la marge crée une ligne de
 * plus — ce qui vaut mieux que d'écraser deux observations distinctes.
 */
function fingerprintOf(s: { kind: string; platform?: string; title: string }) {
  const title = s.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return `${s.kind}:${(s.platform ?? '').toLowerCase()}:${title}`.slice(0, 400)
}

agentRouter.post('/signals', async (req: AgentRequest, res) => {
  const parsed = signalsBatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Lot invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  let created = 0
  let updated = 0
  const warnings: string[] = []
  const rejected: Array<{ title: string; raison: string }> = []

  for (const s of parsed.data.signals) {
    const fingerprint = fingerprintOf(s)
    const dept = await resolveDepartment(req.userId!, s.department)
    if (dept.warning && !warnings.includes(dept.warning)) warnings.push(dept.warning)
    const data = {
      kind: s.kind,
      platform: s.platform ?? null,
      title: s.title,
      summary: s.summary ?? null,
      url: s.url ?? null,
      category: s.category ?? null,
      brand: s.brand ?? null,
      metrics: (s.metrics ?? null) as never,
      engagementScore: s.engagementScore ?? null,
      trendScore: s.trendScore ?? null,
      isNew: s.isNew ?? false,
      notes: s.notes ?? null,
      raw: (s.raw ?? null) as never,
      departmentId: dept.id,
    }

    try {
      const existing = await prisma.signal.findUnique({
        where: { userId_fingerprint: { userId: req.userId!, fingerprint } },
        select: { id: true },
      })

      if (!existing) {
        await prisma.signal.create({ data: { ...data, fingerprint, userId: req.userId! } })
        created++
      } else {
        // Les chiffres sont rafraîchis, l'arbitrage du vendeur reste intact.
        await prisma.signal.update({ where: { id: existing.id }, data })
        updated++
      }
    } catch (e) {
      rejected.push({ title: s.title, raison: (e as Error).message })
    }
  }

  res.status(201).json({
    recus: parsed.data.signals.length,
    crees: created,
    mis_a_jour: updated,
    rejetes: rejected,
    avertissements: warnings,
  })
})

const reportSchema = z.object({
  department: z.string().trim().max(40).optional(),
  /** SOCIAL, SUPPLIERS ou MARKET. */
  section: z.enum(['SOCIAL', 'SUPPLIERS', 'MARKET']),
  /** Jour couvert, AAAA-MM-JJ. Aujourd'hui par défaut. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().trim().min(1).max(200),
  /** Le corps du rapport, en Markdown simple. */
  body: z.string().trim().min(1).max(60000),
  summary: z.record(z.union([z.number(), z.string()])).optional(),
})

/**
 * Le rapport du jour.
 *
 * Un redépôt le même jour, pour la même section et le même rayon, remplace le
 * précédent : un agent qui repasse à 8h puis à 11h corrige son rapport, il n'en
 * publie pas deux. Les jours passés, eux, ne sont jamais touchés.
 */
agentRouter.post('/reports', async (req: AgentRequest, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Rapport invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  const dept = await resolveDepartment(req.userId!, parsed.data.department)
  const day = parsed.data.day ?? new Date().toISOString().slice(0, 10)

  const data = {
    section: parsed.data.section,
    day,
    title: parsed.data.title,
    body: parsed.data.body,
    summary: (parsed.data.summary ?? null) as never,
    departmentId: dept.id,
  }

  // Lecture avant écriture plutôt qu'un upsert : la clé porte un departmentId
  // qui peut être NULL, et Prisma ne sait pas viser une ligne par une clé nulle.
  const existing = await prisma.report.findFirst({
    where: { userId: req.userId!, departmentId: dept.id, section: data.section, day },
    select: { id: true },
  })

  const report = existing
    ? await prisma.report.update({ where: { id: existing.id }, data })
    : await prisma.report.create({ data: { ...data, userId: req.userId! } })

  res.status(201).json({
    id: report.id,
    jour: report.day,
    section: report.section,
    remplace: Boolean(existing),
    avertissement: dept.warning,
  })
})

/**
 * Déclenchement du pilote automatique par un agent extérieur.
 *
 * C'est la seule route de /api/agent qui agit au lieu de déposer, et elle est
 * volontairement sans paramètre : l'agent dit « c'est l'heure », le pilote fait
 * ce que le vendeur a réglé. Un agent ne choisit ni le budget, ni les
 * destinations, ni les seuils.
 */
agentRouter.post('/autopilot/run', async (req: AgentRequest, res) => {
  const result = await runAutopilot(req.userId!)
  res.json(result)
})

/**
 * Ecrit a la main plutot que deduit du schema zod.
 *
 * z.infer rend unknown sur ce schema : la liste des plateformes est un tuple
 * de vingt entrees, et l inference lache au-dela. Le type explicite coute deux
 * lignes et rend les erreurs lisibles.
 */
interface InboundMessage {
  platform: Platform
  externalId?: string
  customerName: string
  customerEmail?: string
  subject?: string
  productId?: string
  department?: string
  body: string
}

const inboundSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  /** Identifiant de la conversation chez la plateforme, quand elle en donne un. */
  externalId: z.string().trim().max(200).optional(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email().optional(),
  subject: z.string().trim().max(200).optional(),
  productId: z.string().optional(),
  department: z.string().trim().max(40).optional(),
  body: z.string().trim().min(1).max(8000),
})

/**
 * Un message d'acheteur récupéré par l'extension ou par un agent.
 *
 * Un identifiant externe évite de rouvrir une conversation à chaque relevé :
 * sans lui, chaque passage créerait un fil de plus pour le même acheteur.
 */
agentRouter.post('/messages', async (req: AgentRequest, res) => {
  const parsed = z.object({ messages: z.array(inboundSchema).min(1).max(50) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Lot invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  let created = 0
  let appended = 0

  // Type explicite : l inference de zod lache sur un schema imbrique de cette
  // taille, et laisse les champs optionnels en unknown.
  for (const m of parsed.data.messages as InboundMessage[]) {
    const dept = await resolveDepartment(req.userId!, m.department)

    const existing = m.externalId
      ? await prisma.conversation.findFirst({
          where: { userId: req.userId!, platform: m.platform, externalId: m.externalId },
          select: { id: true },
        })
      : null

    if (existing) {
      await prisma.customerMessage.create({
        data: { conversationId: existing.id, direction: 'IN', body: m.body, author: m.customerName },
      })
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { lastMessageAt: new Date(), unread: true, status: 'OPEN' },
      })
      appended++
    } else {
      await prisma.conversation.create({
        data: {
          userId: req.userId!,
          platform: m.platform,
          externalId: m.externalId ?? null,
          customerName: m.customerName,
          customerEmail: m.customerEmail ?? null,
          subject: m.subject ?? null,
          productId: m.productId ?? null,
          departmentId: dept.id,
          messages: { create: { direction: 'IN', body: m.body, author: m.customerName } },
        },
      })
      created++
    }
  }

  res.status(201).json({ recus: parsed.data.messages.length, conversations_ouvertes: created, messages_ajoutes: appended })
})
