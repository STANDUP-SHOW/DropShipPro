import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

/**
 * La boîte à opportunités, côté vendeur.
 *
 * L'agent y dépose (voir routes/agent.ts), le vendeur y arbitre. Rien ne part
 * en import sans qu'il l'ait demandé : un import consomme un crédit et remplit
 * son catalogue, ce n'est pas une décision de machine.
 */
export const opportunitiesRouter = Router()
opportunitiesRouter.use(requireAuth)

/**
 * Les sites dont la fiche se construit en JavaScript : le serveur n'y reçoit
 * qu'une coquille vide, il faut passer par l'extension. Autant le dire ici
 * plutôt que de laisser le vendeur découvrir l'échec après le clic.
 */
const EXTENSION_ONLY = ['temu.', 'aliexpress.', 'joybuy.', 'shein.']

function needsExtension(sourceUrl: string) {
  const host = (() => {
    try {
      return new URL(sourceUrl).hostname
    } catch {
      return ''
    }
  })()
  return EXTENSION_ONLY.some((s) => host.includes(s))
}

opportunitiesRouter.get('/', async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null
  const valid = ['NEW', 'KEPT', 'REJECTED', 'IMPORTED']

  const items = await prisma.opportunity.findMany({
    where: {
      userId: req.userId!,
      ...(status && valid.includes(status) ? { status: status as 'NEW' } : {}),
    },
    orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
    take: 300,
  })

  res.json({
    count: items.length,
    opportunities: items.map((o) => ({
      ...o,
      sourcePrice: Number(o.sourcePrice),
      marketPrice: o.marketPrice === null ? null : Number(o.marketPrice),
      // Calculée ici plutôt que stockée : elle dépend de deux prix qui bougent.
      marginPercent:
        o.marketPrice && Number(o.sourcePrice) > 0
          ? Math.round(((Number(o.marketPrice) - Number(o.sourcePrice)) / Number(o.sourcePrice)) * 100)
          : null,
      needsExtension: needsExtension(o.sourceUrl),
      // Le delai lisible : le texte de la plateforme prime sur le nombre extrait.
      delivery: o.deliveryText ?? (o.deliveryDays === null ? null : String(o.deliveryDays) + " jours"),
    })),
  })
})

const patchSchema = z.object({
  status: z.enum(['NEW', 'KEPT', 'REJECTED', 'IMPORTED']),
  /** Renseigné quand l'arbitrage a donné lieu à un import. */
  productId: z.string().optional(),
})

opportunitiesRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Statut invalide' })

  const { count } = await prisma.opportunity.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { status: parsed.data.status, productId: parsed.data.productId ?? undefined },
  })
  if (!count) return res.status(404).json({ error: 'Opportunité introuvable' })
  res.json({ ok: true })
})

opportunitiesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.opportunity.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!count) return res.status(404).json({ error: 'Opportunité introuvable' })
  res.status(204).send()
})
