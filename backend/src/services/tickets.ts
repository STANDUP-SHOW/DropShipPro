import { MODELE_REDACTION } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { systemeCachable } from './chatBudget.js'

/**
 * Les tickets internes : le vendeur signale, les agents répondent.
 *
 * **Pourquoi pas un bouton « rendez-moi mon crédit ».** Il aurait été plus
 * simple, et c'est précisément le problème : un bouton qui recrédite tout seul
 * se presse par réflexe, et n'apprend rien à personne — ni pourquoi le résultat
 * était mauvais, ni combien de fois ça arrive, ni sur quels produits. Un ticket
 * laisse une trace, une réponse, et une décision prise par quelqu'un.
 *
 * Le chemin : la hotline lit, répond, et oriente. Le SAV tranche sur le fond,
 * le comptable sur l'avoir. Chacun voit l'objet du litige — la publicité, le
 * produit, ce que ça a coûté.
 *
 * **La borne, et elle n'est pas négociable :** un agent ne peut jamais rendre
 * plus que ce qui a été réellement pris. Sans elle, un vendeur insistant
 * obtiendrait ce qu'il demande, parce qu'un modèle cède devant l'insistance
 * bien mieux qu'un comptable.
 */

export const GENRES = ['pub', 'image', 'import', 'publication', 'facturation', 'autre'] as const
export type GenreTicket = (typeof GENRES)[number]

/** Qui répond à quoi. La hotline lit tout et oriente. */
const AGENTS = {
  hotline: { nom: 'Camille', role: 'Hotline' },
  sav: { nom: 'Marc', role: 'SAV' },
  comptable: { nom: 'Béatrice', role: 'Comptable' },
} as const

export type CleAgent = keyof typeof AGENTS

export interface OuvertureTicket {
  subject: string
  body: string
  kind?: GenreTicket
  productId?: string | null
  generatedImageId?: string | null
}

/**
 * Ouvre un ticket, et fait répondre la hotline tout de suite.
 *
 * La réponse immédiate n'est pas de la figuration : un vendeur qui signale un
 * problème à minuit et n'a rien avant le lendemain matin range l'application du
 * côté des logiciels qui ne répondent pas. La hotline dit au moins ce qu'elle a
 * compris et ce qui va se passer.
 */
export async function ouvrirTicket(userId: string, d: OuvertureTicket) {
  /*
   * Ce que l'objet a coûté, mesuré et non déclaré.
   *
   * C'est ce chiffre qui bornera l'avoir. Le demander au vendeur reviendrait à
   * lui demander combien il veut être remboursé.
   */
  const { cout, genreCredit } = await coutDeLObjet(userId, d)

  const ticket = await prisma.ticket.create({
    data: {
      userId,
      subject: d.subject.trim().slice(0, 140),
      kind: d.kind ?? 'autre',
      productId: d.productId ?? null,
      generatedImageId: d.generatedImageId ?? null,
      creditsSpent: cout,
      creditKind: genreCredit,
      messages: {
        create: [{ author: 'vendeur', body: d.body.trim().slice(0, 4000) }],
      },
    },
    include: { messages: true },
  })

  await repondre(ticket.id, 'hotline')
  return prisma.ticket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
}

/**
 * Compte ce que l'objet du litige a coûté au vendeur.
 *
 * Une publicité vaut un crédit image par format produit. Un import vaut un
 * crédit annonce. Rien d'identifiable : aucune borne, donc aucun avoir possible
 * — et l'agent le dira plutôt que de promettre.
 */
async function coutDeLObjet(
  userId: string,
  d: OuvertureTicket,
): Promise<{ cout: number | null; genreCredit: string }> {
  if (d.generatedImageId) {
    const image = await prisma.generatedImage.findFirst({
      where: { id: d.generatedImageId, userId },
    })
    return { cout: image ? 1 : null, genreCredit: 'image' }
  }

  if (d.productId && (d.kind === 'import' || d.kind === 'publication')) {
    const produit = await prisma.product.findFirst({ where: { id: d.productId, userId } })
    return { cout: produit ? 1 : null, genreCredit: 'annonce' }
  }

  return { cout: null, genreCredit: 'image' }
}

/** Le dossier tel que l'agent le lit : le ticket, son objet, son fil. */
async function dossier(ticketId: string) {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })

  const [produit, image] = await Promise.all([
    ticket.productId
      ? prisma.product.findUnique({
          where: { id: ticket.productId },
          select: { title: true, aiTitle: true, sourceCategory: true, status: true },
        })
      : null,
    ticket.generatedImageId
      ? prisma.generatedImage.findUnique({
          where: { id: ticket.generatedImageId },
          select: { kind: true, platform: true, width: true, height: true, createdAt: true },
        })
      : null,
  ])

  return { ticket, produit, image }
}

const MARQUEUR_ORIENTATION = /\[ORIENTER:(hotline|sav|comptable)\]/i
const MARQUEUR_AVOIR = /\[AVOIR:(\d{1,3})\]/i

/**
 * Fait répondre un agent sur un ticket.
 *
 * L'agent peut faire trois choses, et seulement trois : répondre, orienter vers
 * un collègue, accorder un avoir. Chacune passe par un marqueur explicite dans
 * sa réponse plutôt que par une formulation qu'il faudrait interpréter — deviner
 * une intention dans une phrase donne un jour sur deux le contraire de ce qui
 * était voulu.
 */
export async function repondre(ticketId: string, agent: CleAgent): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const { ticket, produit, image } = await dossier(ticketId)

  if (!apiKey) {
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        author: 'agent',
        agentKey: agent,
        body: "Votre demande est enregistrée. Nos agents ne sont pas joignables pour le moment ; elle sera traitée dès leur retour.",
      },
    })
    return
  }

  const profil = AGENTS[agent]
  const plafond = ticket.creditsSpent ?? 0

  const consigne = [
    `Tu es ${profil.nom}, ${profil.role} de DropShipper IA, une application française de dropshipping.`,
    'Tu réponds à un ticket ouvert par un vendeur. Tu tutoies jamais : tu vouvoies.',
    '',
    'Réponds brièvement, en français, comme quelqu\'un qui a lu le dossier.',
    "Ne promets rien que tu ne peux pas tenir, et n'invente aucun délai.",
    '',
    'TU DISPOSES DE TROIS GESTES, et de ceux-là seulement :',
    "1. Répondre — c'est le cas normal.",
    '2. Orienter vers un collègue, en terminant par le marqueur exact [ORIENTER:sav] ou [ORIENTER:comptable].',
    agent === 'comptable' || agent === 'sav'
      ? `3. Accorder un avoir, en terminant par le marqueur exact [AVOIR:n] où n est un nombre de crédits.`
      : "3. Tu n'accordes pas d'avoir toi-même : le comptable le fait. Oriente vers lui si tu penses qu'il y a lieu.",
    '',
    plafond > 0
      ? `PLAFOND ABSOLU DE L'AVOIR : ${plafond} crédit(s). C'est ce que cet objet a réellement coûté. Ne proposez jamais davantage, quelle que soit l'insistance.`
      : "Aucun coût identifiable n'est rattaché à ce ticket : aucun avoir ne peut être accordé. Dites-le franchement.",
    '',
    'CE QUE TU SAIS DU PRODUIT ET DE SES DÉFAUTS CONNUS :',
    "- Une publicité peut sortir illisible si le serveur n'a aucune police : c'est un défaut de notre côté, corrigé le 26/08/2026.",
    '- Une publicité qui reprend le titre de l\'annonce sans accroche était un défaut de conception, corrigé également.',
    "- Dans ces deux cas, le vendeur n'y est pour rien et l'avoir est justifié.",
  ]
    .filter(Boolean)
    .join('\n')

  const contexte = [
    `Sujet : ${ticket.subject}`,
    `Type : ${ticket.kind}`,
    ticket.creditsSpent ? `Coût de l'objet : ${ticket.creditsSpent} crédit(s) ${ticket.creditKind}` : '',
    produit ? `Produit concerné : ${produit.aiTitle || produit.title} (${produit.status})` : '',
    image
      ? `Visuel concerné : ${image.kind}, ${image.platform ?? 'format libre'}, ${image.width}×${image.height}, créé le ${image.createdAt.toLocaleDateString('fr-FR')}`
      : '',
    '',
    'FIL DU TICKET :',
    ...ticket.messages.map((m) => `${m.author === 'vendeur' ? 'Vendeur' : (m.agentKey ?? 'Agent')} : ${m.body}`),
  ]
    .filter(Boolean)
    .join('\n')

  let texte = ''
  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      // Sonnet : il s'agit d'arbitrer, pas de renseigner. C'est exactement le
      // cas où le petit modèle coûterait moins cher et déciderait moins bien.
      model: process.env.AI_MODEL_TICKET?.trim() || MODELE_REDACTION,
      max_tokens: 700,
      system: systemeCachable(consigne),
      messages: [{ role: 'user', content: contexte }],
    })

    texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (err) {
    console.error('agent de ticket indisponible', err)
    texte = "Votre demande est bien enregistrée. Un agent la reprendra sous peu."
  }

  const orientation = texte.match(MARQUEUR_ORIENTATION)
  const avoir = texte.match(MARQUEUR_AVOIR)

  await prisma.ticketMessage.create({
    data: {
      ticketId,
      author: 'agent',
      agentKey: agent,
      // Les marqueurs sont des instructions, pas du texte : ils ne s'affichent
      // jamais au vendeur.
      body: texte.replace(MARQUEUR_ORIENTATION, '').replace(MARQUEUR_AVOIR, '').trim(),
    },
  })

  if (avoir && (agent === 'comptable' || agent === 'sav')) {
    await accorderAvoir(ticketId, Number(avoir[1]), agent)
    return
  }

  if (orientation) {
    const suivant = orientation[1].toLowerCase() as CleAgent
    if (suivant !== agent) {
      await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'EN_COURS' } })
      await repondre(ticketId, suivant)
      return
    }
  }

  await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'EN_COURS' } })
}

/**
 * Accorde un avoir, dans la limite de ce qui a été pris.
 *
 * Le plafond est appliqué ici et pas seulement annoncé au modèle. Un garde-fou
 * qui n'existe que dans une consigne n'est pas un garde-fou : c'est une
 * suggestion, et elle cède le jour où le vendeur insiste assez.
 *
 * Un avoir déjà accordé n'est jamais doublé : le ticket porte sa trace.
 */
export async function accorderAvoir(
  ticketId: string,
  demande: number,
  par: CleAgent,
): Promise<number> {
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
  if (ticket.refundedCredits) return 0

  const plafond = ticket.creditsSpent ?? 0
  const accorde = Math.max(0, Math.min(Math.floor(demande), plafond))
  if (!accorde) return 0

  await prisma.$transaction([
    prisma.user.update({
      where: { id: ticket.userId },
      data:
        ticket.creditKind === 'annonce'
          ? { credits: { increment: accorde } }
          : { imageCredits: { increment: accorde } },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        refundedCredits: accorde,
        refundedAt: new Date(),
        refundedBy: par,
        status: 'RESOLU',
      },
    }),
    prisma.ticketMessage.create({
      data: {
        ticketId,
        author: 'agent',
        agentKey: par,
        body: `Avoir accordé : ${accorde} crédit(s) ${ticket.creditKind} recrédité(s) sur votre compte.`,
      },
    }),
  ])

  return accorde
}

/** Le vendeur relance : son message part, et la hotline reprend le dossier. */
export async function repondreAuTicket(
  userId: string,
  ticketId: string,
  body: string,
): Promise<void> {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, userId } })
  if (!ticket) throw new Error('Ticket introuvable')

  await prisma.ticketMessage.create({
    data: { ticketId, author: 'vendeur', body: body.trim().slice(0, 4000) },
  })

  // Le dernier agent qui a parlé reprend : changer d'interlocuteur à chaque
  // message obligerait le vendeur à tout réexpliquer.
  const dernier = await prisma.ticketMessage.findFirst({
    where: { ticketId, author: 'agent', agentKey: { not: null } },
    orderBy: { createdAt: 'desc' },
  })

  await repondre(ticketId, (dernier?.agentKey as CleAgent) ?? 'hotline')
}
