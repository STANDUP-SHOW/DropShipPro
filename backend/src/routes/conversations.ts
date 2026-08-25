import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { channelFor, channelNotice, deliver, draftReply } from '../services/messaging.js'
import { reserveCredits } from '../services/billing.js'

/**
 * La boîte de réception unifiée.
 *
 * Une seule liste pour les questions venues de toutes les plateformes, afin que
 * le vendeur cesse d'ouvrir cinq back-offices par jour. Ce qui y arrive dépend
 * de ce que chaque plateforme laisse sortir : l'extension et les agents y
 * déposent, notre propre site y écrit directement.
 */
export const conversationsRouter = Router()
conversationsRouter.use(requireAuth)

conversationsRouter.get('/', async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null
  const valid = ['OPEN', 'WAITING', 'CLOSED']

  const conversations = await prisma.conversation.findMany({
    where: {
      userId: req.userId!,
      ...(status && valid.includes(status) ? { status: status as 'OPEN' } : {}),
      ...(typeof req.query.department === 'string' ? { departmentId: req.query.department } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
    include: {
      department: { select: { agentName: true, key: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  res.json({
    count: conversations.length,
    unread: conversations.filter((c) => c.unread).length,
    conversations: conversations.map((c) => ({
      id: c.id,
      platform: c.platform,
      customerName: c.customerName,
      customerEmail: c.customerEmail,
      subject: c.subject,
      status: c.status,
      unread: c.unread,
      agentName: c.department?.agentName ?? null,
      lastMessageAt: c.lastMessageAt,
      preview: c.messages[0]?.body.slice(0, 140) ?? '',
      // Dit d'avance si une réponse pourra vraiment partir d'ici.
      channel: channelFor(c.platform, c.customerEmail),
    })),
  })
})

conversationsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      department: { select: { id: true, agentName: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  })
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' })

  // Ouvrir vaut lecture : le compteur de non-lus doit refléter ce que le vendeur
  // a réellement vu, pas ce qu'il a reçu.
  if (conversation.unread) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { unread: false } })
  }

  const channel = channelFor(conversation.platform, conversation.customerEmail)

  res.json({
    ...conversation,
    unread: false,
    agentName: conversation.department?.agentName ?? null,
    channel,
    notice: channelNotice(conversation.platform, channel),
  })
})

const createSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email().optional(),
  subject: z.string().trim().max(200).optional(),
  productId: z.string().optional(),
  orderId: z.string().optional(),
  departmentId: z.string().optional(),
  /** Le premier message du client, quand il y en a un. */
  body: z.string().trim().max(8000).optional(),
})

conversationsRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Conversation invalide' })

  const { body, ...data } = parsed.data
  const conversation = await prisma.conversation.create({
    data: {
      ...data,
      userId: req.userId!,
      // Une conversation que le vendeur ouvre lui-même est déjà lue.
      unread: Boolean(body),
      messages: body
        ? { create: { direction: 'IN', body, author: parsed.data.customerName } }
        : undefined,
    },
  })

  res.status(201).json({ id: conversation.id })
})

const replySchema = z.object({ body: z.string().trim().min(1).max(8000), drafted: z.boolean().optional() })

/**
 * Envoyer une réponse.
 *
 * Elle est enregistrée dans tous les cas, et l'on dit franchement comment elle
 * est partie : par e-mail, ou « à coller » chez la plateforme. Un vendeur qui
 * croirait avoir répondu alors que rien n'est parti perdrait son acheteur, puis
 * sa note vendeur.
 */
conversationsRouter.post('/:id/messages', async (req: AuthedRequest, res) => {
  const parsed = replySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Écrivez votre réponse' })

  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

  const sent = await deliver({
    platform: conversation.platform,
    customerEmail: conversation.customerEmail,
    customerName: conversation.customerName,
    subject: conversation.subject,
    body: parsed.data.body,
    shopName: user.shopName || 'Votre boutique',
  })

  const message = await prisma.customerMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUT',
      body: parsed.data.body,
      author: user.shopName || 'Vous',
      sentVia: sent.delivered ? 'email' : 'manuel',
      drafted: parsed.data.drafted ?? false,
    },
  })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), status: 'WAITING', unread: false },
  })

  res.status(201).json({
    message,
    delivered: sent.delivered,
    channel: sent.channel,
    notice: sent.delivered
      ? "Réponse envoyée par e-mail."
      : "Réponse enregistrée. Copiez-la dans la messagerie de la plateforme : elle ne permet pas d'y répondre depuis l'extérieur.",
  })
})

/** Faire rédiger la réponse par le chef de rayon. Un crédit, comme une question. */
conversationsRouter.post('/:id/draft', async (req: AuthedRequest, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true },
  })
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' })

  const credit = await reserveCredits(req.userId!, 1)
  if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

  const draft = await draftReply(conversation.id, req.userId!)
  if (!draft) {
    // Rien rendu, rien facturé.
    await prisma.user.update({ where: { id: req.userId! }, data: { credits: { increment: 1 } } })
    return res.status(503).json({ error: "La rédaction est momentanément indisponible." })
  }

  res.json(draft)
})

/**
 * Le statut, et l'état lu ou non lu.
 *
 * Marquer non lu est un geste de boîte mail : on ouvre un message, on n'a pas
 * le temps de le traiter, et on le remet dans la pile pour ce soir. Sans lui,
 * ouvrir une conversation la faisait disparaître des non-lus définitivement —
 * et c'est comme ça qu'on oublie de répondre à un acheteur.
 */
const statusSchema = z
  .object({
    status: z.enum(['OPEN', 'WAITING', 'CLOSED']).optional(),
    unread: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.unread !== undefined, {
    message: 'Rien à changer',
  })

conversationsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Statut invalide' })

  const { count } = await prisma.conversation.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.unread !== undefined ? { unread: parsed.data.unread } : {}),
    },
  })
  if (!count) return res.status(404).json({ error: 'Conversation introuvable' })
  res.json({ ok: true })
})
