import { MODELE_REDACTION } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { sendMail, mailIsConfigured } from './mailer.js'

/**
 * Ecrire a un fournisseur, depuis DropShipper.
 *
 * Jumelle de la messagerie acheteurs (services/messaging.ts), mais dans l autre
 * sens : ici c est le vendeur qui parle a son fournisseur — rupture, delai,
 * facture, litige — et non un acheteur qui pose une question. Table separee,
 * service separe : les deux boites ne se melangent jamais.
 *
 * Meme honnetete que cote acheteurs : toutes les places de sourcing ne laissent
 * pas repondre depuis l exterieur.
 * — Quand on connait l e-mail du fournisseur, le message part vraiment, par
 *   e-mail, depuis l application.
 * — Sinon, il est redige, enregistre, et signale « a coller » : le vendeur le
 *   copie dans la messagerie du fournisseur (AliExpress, CJ…). Croire avoir
 *   ecrit alors que rien n est parti retarderait la resolution d un litige.
 */

export type SupplierChannel = 'email' | 'manuel'

/** Comment un message peut partir vers un fournisseur. */
export function channelForSupplier(supplierEmail: string | null): SupplierChannel {
  if (supplierEmail && mailIsConfigured()) return 'email'
  return 'manuel'
}

/** Ce qu on dit au vendeur, en clair, avant qu il n appuie sur Envoyer. */
export function supplierChannelNotice(supplierName: string, channel: SupplierChannel): string {
  if (channel === 'email') return `Le message part par e-mail a ${supplierName}.`
  return `${supplierName} ne se contacte pas par e-mail ici : votre message est enregistre, a coller dans la messagerie du fournisseur.`
}

export async function deliverToSupplier(params: {
  supplierName: string
  supplierEmail: string | null
  subject: string | null
  body: string
  shopName: string
}): Promise<{ channel: SupplierChannel; delivered: boolean }> {
  const channel = channelForSupplier(params.supplierEmail)
  if (channel !== 'email' || !params.supplierEmail) return { channel, delivered: false }

  try {
    await sendMail({
      to: params.supplierEmail,
      subject: params.subject ? `${params.subject}` : `Message de ${params.shopName}`,
      // Sous l enseigne du vendeur : c est lui qui ecrit a son fournisseur.
      brand: params.shopName,
      heading: `Bonjour,`,
      body: params.body,
      footer: `Message envoye par ${params.shopName} via DropShipper IA.`,
    })
    return { channel, delivered: true }
  } catch (err) {
    console.error('message fournisseur non envoye', err)
    return { channel: 'manuel', delivered: false }
  }
}

/**
 * Fait rediger, par l IA, un message du vendeur a son fournisseur.
 *
 * Le vendeur ecrit a un fournisseur, pas a un client : le ton est courtois mais
 * ferme et precis. Il ne doit rien inventer (references, quantites, prix) qui ne
 * soit pas dans le fil, et il demande des informations concretes — delai,
 * remplacement, avoir — au lieu de promettre quoi que ce soit a la place du
 * fournisseur.
 */
export async function draftSupplierMessage(
  conversationId: string,
  userId: string,
): Promise<{ text: string; agentName: string | null } | null> {
  const conversation = await prisma.supplierConversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
  })
  if (!conversation) return null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const product = conversation.productId
    ? await prisma.product.findFirst({
        where: { id: conversation.productId, userId },
        select: { title: true, aiTitle: true },
      })
    : null

  const system = [
    "Tu aides un vendeur en ligne (dropshipping) a ecrire un message a l un de ses FOURNISSEURS, en francais.",
    `Fournisseur concerne : ${conversation.supplierName}.`,
    'Le ton est professionnel, courtois mais ferme et precis — c est une relation entre professionnels.',
    'Trois interdits absolus :',
    "— n invente aucune reference, quantite, prix ou numero de commande qui ne serait pas dans le fil ;",
    '— ne t engage sur rien a la place du fournisseur (delai, remboursement, remplacement) : tu les DEMANDES ;',
    "— reste concret : demande des informations ou des actions precises (delai d expedition, variante de remplacement, avoir, preuve d envoi).",
    'Reponds uniquement par le texte du message, sans objet ni signature.',
    product
      ? `Produit concerne cote catalogue du vendeur : ${product.aiTitle || product.title}.`
      : "Aucun produit n est rattache a ce fil.",
  ].join('\n')

  // Les fils fournisseurs sont, côté base, entièrement SORTANTS : le vendeur
  // écrit, aucune réponse fournisseur n'est encore enregistrée (aucun IN). On ne
  // peut donc pas alterner user/assistant comme côté acheteurs — un tableau qui
  // commence par « assistant » est refusé par l'API Anthropic (400). On remet
  // tout le fil dans UN SEUL message utilisateur : le tableau commence toujours
  // par « user », que le fil soit vide ou déjà entamé.
  const transcript = conversation.messages
    .map((m) => `${m.direction === 'OUT' ? 'Vous (vendeur)' : conversation.supplierName} : ${m.body}`)
    .join('\n\n')
  const consigne = [
    conversation.subject ? `Objet : ${conversation.subject}.` : null,
    transcript ? `Fil jusqu'ici :\n\n${transcript}` : null,
    transcript
      ? 'Rédige le prochain message du vendeur au fournisseur, dans la continuité du fil.'
      : 'Rédige un premier message du vendeur au fournisseur (prise de contact).',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODELE_REDACTION,
      max_tokens: 600,
      system,
      messages: [{ role: 'user' as const, content: consigne }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return text ? { text, agentName: null } : null
  } catch (err) {
    console.error('redaction de message fournisseur indisponible', err)
    return null
  }
}
