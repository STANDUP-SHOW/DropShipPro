import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { GENRES, ouvrirTicket, repondreAuTicket } from '../services/tickets.js'

/**
 * Les tickets : le vendeur signale, les agents répondent.
 *
 * Un ticket n'est pas une conversation d'agent de plus. Une conversation
 * s'oublie ; un ticket porte un objet, un coût, un état, et se ferme. C'est ce
 * qui permet de dire, dans un mois, combien de publicités ont été refusées et
 * lesquelles — ce qu'un bouton « rendez-moi mon crédit » n'aurait jamais dit.
 */
export const ticketsRouter = Router()
ticketsRouter.use(requireAuth)

const ouverture = z.object({
  subject: z.string().trim().min(3).max(140),
  body: z.string().trim().min(5).max(4000),
  kind: z.enum(GENRES).optional(),
  productId: z.string().trim().optional(),
  generatedImageId: z.string().trim().optional(),
})

ticketsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = ouverture.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Décrivez le problème en quelques mots.' })
  }

  try {
    const ticket = await ouvrirTicket(req.userId!, parsed.data)
    res.status(201).json(ticket)
  } catch (err) {
    console.error("ouverture de ticket impossible", err)
    res.status(500).json({ error: "Le ticket n'a pas pu être ouvert. Réessayez." })
  }
})

/** Les tickets du vendeur, les plus récents d'abord. */
ticketsRouter.get('/', async (req: AuthedRequest, res) => {
  const tickets = await prisma.ticket.findMany({
    where: { userId: req.userId! },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 1 },
      _count: { select: { messages: true } },
    },
  })

  res.json(
    tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      kind: t.kind,
      status: t.status,
      creditsSpent: t.creditsSpent,
      creditKind: t.creditKind,
      refundedCredits: t.refundedCredits,
      messages: t._count.messages,
      extrait: t.messages[0]?.body.slice(0, 160) ?? '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  )
})

ticketsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const ticket = await prisma.ticket.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })
  res.json(ticket)
})

ticketsRouter.post('/:id/messages', async (req: AuthedRequest, res) => {
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
  if (body.length < 2) return res.status(400).json({ error: 'Message vide' })

  try {
    await repondreAuTicket(req.userId!, req.params.id, body)
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId! },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    res.json(ticket)
  } catch (err) {
    console.error('réponse au ticket impossible', err)
    res.status(400).json({ error: "Votre message n'a pas pu être envoyé." })
  }
})

/**
 * Le vendeur ferme lui-même.
 *
 * Un ticket qu'on ne peut pas fermer soi-même s'accumule : la liste devient un
 * cimetière, et le vendeur cesse de la lire. Fermer n'annule aucun avoir déjà
 * accordé — c'est justement pour ça que la trace est sur le ticket et pas dans
 * le fil.
 */
ticketsRouter.post('/:id/close', async (req: AuthedRequest, res) => {
  const { count } = await prisma.ticket.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { status: 'RESOLU' },
  })
  if (!count) return res.status(404).json({ error: 'Ticket introuvable' })
  res.json({ ok: true })
})
