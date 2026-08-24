import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { findSupportAgent } from './agentRoster.js'
import { DEPARTMENTS } from './departments.js'

/**
 * Les agents de comptoir.
 *
 * Un vendeur qui demande « où est le colis de madame Dubois » n'attend pas un
 * conseil général sur la logistique : il attend qu'on regarde. Ces agents
 * reçoivent donc, avant de répondre, un état réel du compte — commandes en
 * cours, litiges, factures, crédits — limité à ce qui les concerne.
 *
 * Sans cela on obtient un assistant poli qui invente des délais, et un vendeur
 * qui répète à son acheteur une information fausse.
 */

const MODEL = 'claude-sonnet-4-5'

/** Marqueur d'orientation : la hotline renvoie vers un collègue. */
const ROUTE = /\[ORIENTER:([a-z-]+)\]/i

export interface SupportAnswer {
  content: string
  /** Clé de l'agent ou du rayon vers lequel la hotline oriente. */
  route: string | null
  failed: boolean
}

/**
 * L'état du compte, taillé pour l'agent qui va lire.
 *
 * Chacun ne reçoit que son domaine : le SAV n'a pas besoin des factures, le
 * commercial n'a pas besoin des numéros de suivi. Moins de contexte, moins
 * d'occasions de répondre à côté.
 */
async function contextFor(key: string, userId: string): Promise<string> {
  if (key === 'livraisons') {
    const orders = await prisma.order.findMany({
      where: { userId, status: { in: ['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { product: { select: { title: true, aiTitle: true } } },
    })
    if (!orders.length) return 'Aucune commande en cours.'
    return [
      `${orders.length} commande(s) en cours :`,
      ...orders.map(
        (o) =>
          `- ${o.buyerName} · ${o.product.aiTitle || o.product.title} · ${o.platform} · ${o.status}` +
          (o.trackingNumber ? ` · suivi ${o.trackingNumber}` : ' · aucun numéro de suivi'),
      ),
    ].join('\n')
  }

  if (key === 'commercial') {
    const [user, payments, orders] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { credits: true, plan: true, premiumUntil: true },
      }),
      prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.order.findMany({ where: { userId }, select: { amount: true, status: true } }),
    ])

    const chiffre = orders
      .filter((o) => o.status !== 'REFUNDED')
      .reduce((n, o) => n + Number(o.amount), 0)

    return [
      `Formule : ${user.plan}${user.premiumUntil ? ` jusqu'au ${user.premiumUntil.toLocaleDateString('fr-FR')}` : ''}`,
      `Crédits restants : ${user.credits}`,
      `Chiffre d'affaires enregistré : ${chiffre.toFixed(2)} € sur ${orders.length} commande(s)`,
      payments.length
        ? `Derniers paiements :\n${payments.map((p) => `- ${(p.amount / 100).toFixed(2)} € · ${p.planId} · ${p.createdAt.toLocaleDateString('fr-FR')}${p.credits ? ` · ${p.credits} crédits` : ''}`).join('\n')}`
        : 'Aucun paiement enregistré.',
    ].join('\n')
  }

  if (key === 'sav') {
    const orders = await prisma.order.findMany({
      where: { userId, status: { in: ['SHIPPED', 'DELIVERED', 'REFUNDED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: { product: { select: { title: true, aiTitle: true } } },
    })
    const conversations = await prisma.conversation.count({ where: { userId, status: 'OPEN' } })

    return [
      orders.length
        ? `Commandes livrées ou expédiées :\n${orders.map((o) => `- ${o.buyerName} · ${o.product.aiTitle || o.product.title} · ${o.platform} · ${o.status}`).join('\n')}`
        : 'Aucune commande expédiée ou livrée.',
      `${conversations} conversation(s) acheteur ouverte(s).`,
    ].join('\n')
  }

  // Hotline : de quoi orienter, pas de quoi traiter.
  const [departments, orders, conversations, user] = await Promise.all([
    prisma.department.findMany({ where: { userId }, select: { key: true, agentName: true } }),
    prisma.order.count({ where: { userId, status: { in: ['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED'] } } }),
    prisma.conversation.count({ where: { userId, status: 'OPEN' } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } }),
  ])

  return [
    departments.length
      ? `Chefs de rayon en poste : ${departments.map((d) => `${d.agentName} (${DEPARTMENTS.find((x) => x.key === d.key)?.label ?? d.key})`).join(', ')}`
      : "Aucun chef de rayon n'est en poste.",
    `${orders} commande(s) en cours, ${conversations} message(s) acheteur ouvert(s), ${user.credits} crédit(s).`,
  ].join('\n')
}

function systemPrompt(key: string, context: string) {
  const profile = findSupportAgent(key)!
  const rayons = DEPARTMENTS.map((d) => `${d.agentName} (${d.label}, clé ${d.key})`).join(', ')

  const commun = [
    `Tu es ${profile.name}, ${profile.role.toLowerCase()} chez DropShipper, une application française de dropshipping.`,
    'Tu parles au vendeur qui utilise cette application, pas à ses clients.',
    'Réponds en français, brièvement, concrètement. Pas de formule creuse.',
    '',
    "N'invente jamais un chiffre, une date ou un statut. Tout ce que tu sais du compte est ci-dessous ;",
    'si la réponse ne s\'y trouve pas, dis-le et explique où la trouver.',
    '',
    'ÉTAT DU COMPTE :',
    context,
  ]

  if (key === 'hotline') {
    return [
      ...commun,
      '',
      "Ton rôle est d'orienter. Écoute la demande, réponds en une ou deux phrases, puis oriente en",
      'terminant ta réponse par un marqueur exact, seul sur sa ligne :',
      '[ORIENTER:commercial] pour une facture, un paiement, un abonnement, des crédits ou des chiffres ;',
      '[ORIENTER:sav] pour un produit non conforme, un litige, un remboursement ;',
      '[ORIENTER:livraisons] pour un colis, un délai, un numéro de suivi ;',
      `[ORIENTER:rayon] pour une question sur un produit ou un marché — précise alors quel chef de rayon parmi : ${rayons}.`,
      "N'oriente pas si tu peux répondre toi-même en une phrase.",
    ].join('\n')
  }

  if (key === 'commercial') {
    return [
      ...commun,
      '',
      "Tu traites les factures, les crédits, l'abonnement et les chiffres.",
      "Rappelle au besoin qu'un import coûte un crédit et que la publication est gratuite.",
      "Tu n'accordes aucun remboursement et ne promets aucun geste commercial : cela appartient au",
      "responsable de l'application, à qui le vendeur peut écrire.",
    ].join('\n')
  }

  if (key === 'sav') {
    return [
      ...commun,
      '',
      'Tu aides à traiter un problème après vente : produit non conforme, colis abîmé, demande de',
      'remboursement. Tu aides à formuler la réclamation auprès du fournisseur et la réponse à',
      "l'acheteur.",
      "Rappelle les délais légaux français quand ils s'appliquent : quatorze jours de rétractation sur",
      'une vente à distance, deux ans de garantie légale de conformité.',
      "Tu ne décides jamais d'un remboursement à la place du vendeur.",
    ].join('\n')
  }

  return [
    ...commun,
    '',
    "Tu suis les colis. Tu dis où en est une commande d'après l'état ci-dessus, et ce qu'il faut faire",
    "quand un colis n'avance plus : relancer le transporteur, prévenir l'acheteur, ouvrir une enquête.",
    "Tu ne promets jamais une date de livraison : tu ne l'as pas.",
  ].join('\n')
}

export async function askSupportAgent(
  key: string,
  userId: string,
  history: Array<{ role: string; content: string }>,
  question: string,
): Promise<SupportAnswer> {
  const profile = findSupportAgent(key)
  if (!profile) return { content: "Cet agent n'existe pas.", route: null, failed: true }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      content: "L'assistant est momentanément indisponible. Réessayez dans quelques minutes.",
      route: null,
      failed: true,
    }
  }

  try {
    const context = await contextFor(key, userId)
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: systemPrompt(key, context),
      messages: [
        ...history.slice(-10).map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        })),
        { role: 'user' as const, content: question },
      ],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!text) return { content: "Je n'ai pas de réponse à vous donner.", route: null, failed: true }

    const match = text.match(ROUTE)
    return {
      content: text.replace(ROUTE, '').trim(),
      route: match ? match[1].toLowerCase() : null,
      failed: false,
    }
  } catch (err) {
    console.error('agent de comptoir indisponible', err)
    return {
      content: "L'assistant est momentanément indisponible. Réessayez dans quelques minutes.",
      route: null,
      failed: true,
    }
  }
}
