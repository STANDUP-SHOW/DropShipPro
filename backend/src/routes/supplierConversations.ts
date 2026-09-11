import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  channelForSupplier,
  supplierChannelNotice,
  deliverToSupplier,
  draftSupplierMessage,
} from '../services/supplierMessaging.js'
import { reserveCredits, refundCredits } from '../services/billing.js'

/**
 * La messagerie fournisseurs.
 *
 * Jumelle de /conversations (messagerie acheteurs), mais dans l autre sens :
 * les echanges du vendeur avec ses fournisseurs. Table separee, routeur separe,
 * meme forme d ecran — un litige fournisseur ne se traite ni au meme moment ni
 * avec les memes armes qu un litige acheteur (decoupe du 03/09/2026).
 *
 * REGLE EXPRESS 4 : chaque handler async est enveloppe d un try/catch. Un async
 * qui leve de lui-meme, sous Express 4, fait PENDRE la requete (panne du
 * 05/09/2026) — le gestionnaire global ne rattrape que les erreurs transmises
 * par next(). Ici, une base momentanement injoignable rend un code lisible.
 */
export const supplierConversationsRouter = Router()
supplierConversationsRouter.use(requireAuth)

supplierConversationsRouter.get('/', async (req: AuthedRequest, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null
    const valid = ['OPEN', 'WAITING', 'CLOSED']

    const conversations = await prisma.supplierConversation.findMany({
      where: {
        userId: req.userId!,
        ...(status && valid.includes(status) ? { status: status as 'OPEN' } : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    res.json({
      count: conversations.length,
      unread: conversations.filter((c) => c.unread).length,
      conversations: conversations.map((c) => ({
        id: c.id,
        supplierName: c.supplierName,
        supplierEmail: c.supplierEmail,
        subject: c.subject,
        status: c.status,
        unread: c.unread,
        lastMessageAt: c.lastMessageAt,
        preview: c.messages[0]?.body.slice(0, 140) ?? '',
        // Dit d avance si un message pourra vraiment partir d ici.
        channel: channelForSupplier(c.supplierEmail),
      })),
    })
  } catch (err) {
    console.error('lecture des fils fournisseurs impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

supplierConversationsRouter.get('/:id', async (req: AuthedRequest, res) => {
  try {
    const conversation = await prisma.supplierConversation.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    })
    if (!conversation) return res.status(404).json({ error: 'Fil introuvable' })

    // Ouvrir vaut lecture.
    if (conversation.unread) {
      await prisma.supplierConversation.update({
        where: { id: conversation.id },
        data: { unread: false },
      })
    }

    const channel = channelForSupplier(conversation.supplierEmail)
    res.json({
      ...conversation,
      unread: false,
      agentName: null,
      channel,
      notice: supplierChannelNotice(conversation.supplierName, channel),
    })
  } catch (err) {
    console.error('lecture du fil fournisseur impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

const createSchema = z.object({
  supplierName: z.string().trim().min(1).max(120),
  supplierEmail: z.string().trim().email().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  productId: z.string().optional(),
  orderId: z.string().optional(),
  /** Le premier message du vendeur, quand il en écrit un tout de suite. */
  body: z.string().trim().max(8000).optional(),
})

supplierConversationsRouter.post('/', async (req: AuthedRequest, res) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Message fournisseur invalide' })

    const { body, ...data } = parsed.data

    // Un premier message ecrit par le vendeur est un OUT : on tente de le livrer
    // (e-mail si l adresse fournisseur est connue), comme une reponse.
    let firstMessage: { body: string; author: string; sentVia: string } | null = null
    if (body) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
      const sent = await deliverToSupplier({
        supplierName: data.supplierName,
        supplierEmail: data.supplierEmail ?? null,
        subject: data.subject ?? null,
        body,
        shopName: user.shopName || 'Votre boutique',
      })
      firstMessage = {
        body,
        author: user.shopName || 'Vous',
        sentVia: sent.delivered ? 'email' : 'manuel',
      }
    }

    const conversation = await prisma.supplierConversation.create({
      data: {
        ...data,
        userId: req.userId!,
        // Un fil que le vendeur ouvre lui-même est déjà lu ; s'il envoie un
        // premier message, le fil passe en attente d'une réponse du fournisseur.
        unread: false,
        status: firstMessage ? 'WAITING' : 'OPEN',
        lastMessageAt: new Date(),
        messages: firstMessage
          ? { create: { direction: 'OUT', ...firstMessage } }
          : undefined,
      },
    })

    res.status(201).json({ id: conversation.id })
  } catch (err) {
    console.error('création du fil fournisseur impossible', err)
    res.status(502).json({ error: 'Le message n’a pas pu être enregistré.' })
  }
})

const replySchema = z.object({
  body: z.string().trim().min(1).max(8000),
  drafted: z.boolean().optional(),
})

supplierConversationsRouter.post('/:id/messages', async (req: AuthedRequest, res) => {
  try {
    const parsed = replySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Écrivez votre message' })

    const conversation = await prisma.supplierConversation.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    })
    if (!conversation) return res.status(404).json({ error: 'Fil introuvable' })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })

    const sent = await deliverToSupplier({
      supplierName: conversation.supplierName,
      supplierEmail: conversation.supplierEmail,
      subject: conversation.subject,
      body: parsed.data.body,
      shopName: user.shopName || 'Votre boutique',
    })

    const message = await prisma.supplierMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        body: parsed.data.body,
        author: user.shopName || 'Vous',
        sentVia: sent.delivered ? 'email' : 'manuel',
        drafted: parsed.data.drafted ?? false,
      },
    })

    await prisma.supplierConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: 'WAITING', unread: false },
    })

    res.status(201).json({
      message,
      delivered: sent.delivered,
      channel: sent.channel,
      notice: sent.delivered
        ? 'Message envoyé par e-mail au fournisseur.'
        : "Message enregistré. Copiez-le dans la messagerie du fournisseur : elle ne permet pas de répondre depuis l'extérieur.",
    })
  } catch (err) {
    console.error('envoi du message fournisseur impossible', err)
    res.status(502).json({ error: 'Le message n’a pas pu être envoyé.' })
  }
})

/** Faire rédiger le message par l'IA. Un drop, comme la messagerie acheteurs. */
supplierConversationsRouter.post('/:id/draft', async (req: AuthedRequest, res) => {
  // Faux tant que le drop n'a pas été débité : sert à le rendre si quoi que ce
  // soit échoue APRÈS la réservation. Rien rendu → rien facturé, dans tous les
  // chemins (retour null comme exception).
  let debite = false
  try {
    const conversation = await prisma.supplierConversation.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      select: { id: true },
    })
    if (!conversation) return res.status(404).json({ error: 'Fil introuvable' })

    const credit = await reserveCredits(req.userId!, 1, 'Rédaction message fournisseur', conversation.id)
    if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })
    debite = true

    const draft = await draftSupplierMessage(conversation.id, req.userId!)
    if (!draft) {
      // Rien rendu, rien facturé — via refundCredits pour que le remboursement
      // figure au relevé (invariant de billing.ts : le solde reste explicable
      // ligne à ligne).
      await refundCredits(req.userId!, 1, 'Remboursement rédaction fournisseur', conversation.id)
      return res.status(503).json({ error: 'La rédaction est momentanément indisponible.' })
    }

    res.json(draft)
  } catch (err) {
    console.error('rédaction du message fournisseur impossible', err)
    // Une panne survenue après le débit ne doit pas coûter un drop au vendeur,
    // et le remboursement passe par le relevé comme le débit.
    if (debite) {
      await refundCredits(req.userId!, 1, 'Remboursement rédaction fournisseur', req.params.id).catch(
        () => undefined,
      )
    }
    res.status(503).json({ error: 'La rédaction est momentanément indisponible.' })
  }
})

const statusSchema = z
  .object({
    status: z.enum(['OPEN', 'WAITING', 'CLOSED']).optional(),
    unread: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.unread !== undefined, { message: 'Rien à changer' })

supplierConversationsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  try {
    const parsed = statusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Statut invalide' })

    const { count } = await prisma.supplierConversation.updateMany({
      where: { id: req.params.id, userId: req.userId! },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.unread !== undefined ? { unread: parsed.data.unread } : {}),
      },
    })
    if (!count) return res.status(404).json({ error: 'Fil introuvable' })
    res.json({ ok: true })
  } catch (err) {
    console.error('mise à jour du fil fournisseur impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})
