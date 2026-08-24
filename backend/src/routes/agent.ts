import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireApiKey, type AgentRequest } from '../middleware/apiKey.js'
import { rateLimit } from '../middleware/rateLimit.js'

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

const opportunitySchema = z.object({
  source: z.string().trim().min(1).max(40),
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
  const numbers = text.match(/d+/g)
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
  const rejected: Array<{ sourceUrl: string; raison: string }> = []

  for (const o of parsed.data.opportunities) {
    const delivery = readDelivery(o.deliveryDays)
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

  res.status(201).json({ recues: parsed.data.opportunities.length, creees: created, mises_a_jour: updated, rejetees: rejected })
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
