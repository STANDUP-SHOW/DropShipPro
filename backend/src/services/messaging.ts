import type { Platform } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { findDepartment } from './departments.js'
import { sendMail, mailIsConfigured } from './mailer.js'

/**
 * Répondre à un acheteur, depuis DropShipper.
 *
 * L'ambition est que le vendeur n'ouvre plus cinq back-offices pour répondre à
 * cinq questions. Elle se heurte à une réalité qu'il vaut mieux afficher que
 * masquer : toutes les plateformes ne laissent pas répondre depuis l'extérieur.
 *
 * — Quand l'acheteur a une adresse e-mail connue, la réponse part vraiment, par
 *   e-mail, depuis l'application.
 * — Sinon, la réponse est rédigée, enregistrée, et signalée « à coller » : le
 *   vendeur la copie dans la messagerie de la plateforme. C'est un aller-retour,
 *   mais c'est honnête, et ça reste plus rapide que de tout écrire soi-même.
 *
 * Prétendre l'inverse serait le pire des deux mondes : le vendeur croirait avoir
 * répondu, l'acheteur attendrait, et la sanction tomberait sur son compte.
 */

export type SendChannel = 'email' | 'manuel'

/** Comment une réponse peut partir, plateforme par plateforme. */
export function channelFor(platform: Platform, customerEmail: string | null): SendChannel {
  // Aucune messagerie tierce n'est pilotée à ce jour. Là où l'acheteur a laissé
  // une adresse — notre propre site, Shopify — l'e-mail fait le travail.
  if (customerEmail && mailIsConfigured()) return 'email'
  return 'manuel'
}

/** Ce qu'on dit au vendeur, en clair, avant qu'il n'appuie sur Envoyer. */
export function channelNotice(platform: Platform, channel: SendChannel): string {
  if (channel === 'email') return "La réponse part par e-mail à l'acheteur."
  return `${platformLabel(platform)} ne permet pas de répondre depuis l'extérieur : votre réponse sera enregistrée ici, à coller dans leur messagerie.`
}

function platformLabel(platform: Platform) {
  const labels: Partial<Record<Platform, string>> = {
    VINTED: 'Vinted',
    LEBONCOIN: 'Leboncoin',
    FACEBOOK: 'Facebook Marketplace',
    EBAY: 'eBay',
    AMAZON: 'Amazon',
    CDISCOUNT: 'Cdiscount',
    SHOPIFY: 'Shopify',
    OWN_SITE: 'Votre site',
  }
  return labels[platform] ?? 'Cette plateforme'
}

export async function deliver(params: {
  platform: Platform
  customerEmail: string | null
  customerName: string
  subject: string | null
  body: string
  shopName: string
}): Promise<{ channel: SendChannel; delivered: boolean }> {
  const channel = channelFor(params.platform, params.customerEmail)
  if (channel !== 'email' || !params.customerEmail) return { channel, delivered: false }

  try {
    await sendMail({
      to: params.customerEmail,
      subject: params.subject ? `Re : ${params.subject}` : `Votre message — ${params.shopName}`,
      // Sous l'enseigne du vendeur : son acheteur ne nous connaît pas, et
      // recevoir « DropShip Pro » à la place de la boutique inquiète.
      brand: params.shopName,
      heading: `Bonjour ${params.customerName},`,
      body: params.body,
      footer: `Ce message vous est adressé par ${params.shopName}.`,
    })
    return { channel, delivered: true }
  } catch (err) {
    console.error("réponse acheteur non envoyée", err)
    return { channel: 'manuel', delivered: false }
  }
}

/**
 * Fait rédiger la réponse par le chef de rayon concerné.
 *
 * Il répond à un client, pas au vendeur : le ton change, et il ne doit jamais
 * promettre un délai ou un remboursement que le vendeur n'a pas décidé.
 */
export async function draftReply(
  conversationId: string,
  userId: string,
): Promise<{ text: string; agentName: string | null } | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      department: true,
      messages: { orderBy: { createdAt: 'asc' }, take: 20 },
    },
  })
  if (!conversation) return null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const profile = conversation.department ? findDepartment(conversation.department.key) : null
  const agentName = conversation.department?.agentName ?? null

  const product = conversation.productId
    ? await prisma.product.findFirst({
        where: { id: conversation.productId, userId },
        select: { title: true, aiTitle: true, aiDescription: true, description: true },
      })
    : null

  const system = [
    agentName && profile
      ? `Tu es ${agentName}, chef du rayon « ${profile.label} » chez un vendeur en ligne.`
      : "Tu es le service client d'un vendeur en ligne.",
    "Tu rédiges une réponse à un client, en français, courtoise, directe, sans formule creuse.",
    'Trois interdits absolus :',
    "— ne promets aucun délai de livraison précis : tu ne le connais pas ;",
    '— ne promets ni remboursement, ni geste commercial, ni retour gratuit : cela appartient au vendeur seul ;',
    "— n'invente aucune caractéristique produit qui ne serait pas dans les informations fournies.",
    "Si la question demande une décision commerciale, propose une réponse qui reste ouverte et invite le vendeur à trancher.",
    'Réponds uniquement par le texte du message, sans objet ni signature.',
    product
      ? `Produit concerné : ${product.aiTitle || product.title}. ${(product.aiDescription || product.description || '').slice(0, 600)}`
      : "Aucun produit n'est rattaché à cette conversation.",
  ].join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system,
      messages: conversation.messages.length
        ? conversation.messages.map((m) => ({
            role: m.direction === 'IN' ? ('user' as const) : ('assistant' as const),
            content: m.body,
          }))
        : [{ role: 'user' as const, content: conversation.subject ?? 'Bonjour' }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    return text ? { text, agentName } : null
  } catch (err) {
    console.error('rédaction de réponse indisponible', err)
    return null
  }
}
