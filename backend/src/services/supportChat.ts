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

/**
 * Les agents qui doivent chercher plutôt que se souvenir.
 *
 * Le comptable et l'avocat répondent sur des règles datées : seuils de TVA,
 * taux, délais légaux. De mémoire, le modèle se trompe — et pas à la marge :
 * interrogé sur la franchise en base, il a d'abord cité le seuil des services
 * pour celui des marchandises, puis, une fois le chiffre interdit, affirmé
 * qu'aucune franchise n'existait. Deux réponses fausses, toutes deux
 * plausibles, toutes deux coûteuses pour un vendeur qui les applique.
 *
 * Ils consultent donc les sources officielles avant de répondre. C'est plus
 * lent et plus cher qu'une réponse de mémoire ; c'est aussi la différence entre
 * un conseil et un piège.
 */
const AGENTS_QUI_CHERCHENT = ['comptable', 'avocat']

/** Assez pour croiser deux sources, sans faire attendre une minute. */
const MAX_RECHERCHES = 4

/**
 * L'outil de recherche, ou rien pour les agents qui n'en ont pas besoin.
 *
 * À vérifier de temps en temps : ces deux constantes ont d'abord été écrites
 * sans jamais être branchées ici. Le commentaire annonçait la recherche, le
 * mémo la disait livrée, et les deux agents continuaient de répondre de
 * mémoire — exactement le défaut que la correction devait supprimer.
 */
function outilsPour(key: string): Anthropic.Messages.MessageCreateParams['tools'] {
  if (!AGENTS_QUI_CHERCHENT.includes(key)) return undefined
  return [
    {
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: MAX_RECHERCHES,
      user_location: { type: 'approximate', country: 'FR' },
    },
  ]
}

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

  if (key === 'comptable') {
    const [user, payments, orders, products] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { credits: true, imageCredits: true, plan: true, premiumUntil: true },
      }),
      prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.order.findMany({
        where: { userId },
        include: { product: { select: { price: true, shippingCost: true } } },
      }),
      prisma.product.count({ where: { userId } }),
    ])

    const vendus = orders.filter((o) => o.status !== 'REFUNDED')
    const chiffre = vendus.reduce((n, o) => n + Number(o.amount), 0)
    const achats = vendus.reduce(
      (n, o) => n + Number(o.product.price) + Number(o.product.shippingCost),
      0,
    )
    const rembourses = orders.filter((o) => o.status === 'REFUNDED')
    const depense = payments.reduce((n, p) => n + p.amount, 0) / 100

    const parPlateforme = new Map<string, { commandes: number; chiffre: number }>()
    for (const o of vendus) {
      const ligne = parPlateforme.get(o.platform) ?? { commandes: 0, chiffre: 0 }
      ligne.commandes++
      ligne.chiffre += Number(o.amount)
      parPlateforme.set(o.platform, ligne)
    }

    return [
      `Formule : ${user.plan}${user.premiumUntil ? ` jusqu'au ${user.premiumUntil.toLocaleDateString('fr-FR')}` : ''}`,
      `Annonces au catalogue : ${products}`,
      `Chiffre d'affaires : ${chiffre.toFixed(2)} € sur ${vendus.length} vente(s)`,
      `Coût d'achat des produits vendus : ${achats.toFixed(2)} €`,
      `Marge brute : ${(chiffre - achats).toFixed(2)} €`,
      `Remboursements : ${rembourses.length} commande(s)`,
      `Dépensé dans l'application : ${depense.toFixed(2)} € sur ${payments.length} paiement(s)`,
      `Crédits restants : ${user.credits} annonce(s), ${user.imageCredits} image(s)`,
      parPlateforme.size
        ? `Par plateforme :\n${[...parPlateforme.entries()]
            .map(([p, l]) => `- ${p} : ${l.commandes} vente(s), ${l.chiffre.toFixed(2)} €`)
            .join('\n')}`
        : 'Aucune vente enregistrée par plateforme.',
      // Dit explicitement, sinon l'agent additionne des chiffres incomplets et
      // le vendeur croit tenir sa comptabilité.
      "Ces chiffres ne comptent ni la TVA, ni les frais de plateforme, ni les frais de port facturés à l'acheteur : rien de tout cela n'est encore saisi dans l'application.",
    ].join('\n')
  }

  if (key === 'avocat') {
    const [products, orders, conversations, shops] = await Promise.all([
      prisma.product.count({ where: { userId } }),
      prisma.order.count({ where: { userId } }),
      prisma.conversation.count({ where: { userId, status: 'OPEN' } }),
      prisma.shop.findMany({ where: { userId }, select: { name: true } }),
    ])

    return [
      `Le vendeur exploite ${shops.length} boutique(s) : ${shops.map((s) => s.name).join(', ') || 'aucune déclarée'}.`,
      `${products} annonce(s) au catalogue, ${orders} commande(s), ${conversations} litige(s) ou message(s) acheteur ouvert(s).`,
      "Activité : revente de produits achetés à des fournisseurs, principalement hors Union européenne, expédiés directement à l'acheteur.",
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

  if (key === 'marketing') {
    /**
     * Ce qu'il faut pour conseiller un budget : la marge et ce qui se vend.
     *
     * Une campagne se juge sur la marge unitaire, pas sur le prix de vente :
     * un produit à 40 € qui en coûte 36 ne supporte aucun coût d'acquisition,
     * et le dire d'avance évite de brûler un budget pour l'apprendre.
     */
    const [products, ventes] = await Promise.all([
      prisma.product.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          title: true,
          aiTitle: true,
          price: true,
          shippingCost: true,
          sellingPrice: true,
          currency: true,
        },
      }),
      prisma.order.findMany({
        where: { userId },
        select: { platform: true, product: { select: { title: true, aiTitle: true } } },
      }),
    ])

    const parProduit = new Map<string, number>()
    for (const o of ventes) {
      const nom = o.product.aiTitle || o.product.title
      parProduit.set(nom, (parProduit.get(nom) ?? 0) + 1)
    }
    const meilleurs = [...parProduit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    return [
      products.length
        ? `Catalogue (les 25 plus récents), avec la marge unitaire :\n${products
            .map((p) => {
              const revient = Number(p.price) + Number(p.shippingCost)
              const marge = Number(p.sellingPrice) - revient
              return `- ${p.aiTitle || p.title} · vendu ${Number(p.sellingPrice).toFixed(2)} ${p.currency}, revient à ${revient.toFixed(2)}, marge ${marge.toFixed(2)}`
            })
            .join('\n')}`
        : 'Aucune annonce au catalogue : il n’y a rien à mettre en publicité pour l’instant.',
      meilleurs.length
        ? `Ce qui se vend déjà :\n${meilleurs.map(([nom, n]) => `- ${nom} : ${n} vente(s)`).join('\n')}`
        : "Aucune vente enregistrée : personne ne sait encore ce qui marche sur ce catalogue.",
      // Dit franchement, sinon l'agent raisonne sur un ROAS qu'il n'a pas.
      "Aucune donnée de campagne n'est reliée : ni dépense publicitaire, ni impressions, ni clics, ni coût par acquisition. Ne raisonne jamais comme si tu les avais.",
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
    /**
     * Le garde-fou qui compte le plus.
     *
     * Interrogé sur la TVA, l'agent a cité « 36 800 € pour la vente de
     * marchandises » — c'est le seuil des prestations de services, pas celui des
     * marchandises. Un vendeur qui s'immatricule six mois trop tôt sur cette
     * phrase perd de l'argent à cause de nous. Les seuils, taux et délais légaux
     * changent presque chaque année : expliquer le mécanisme est utile, réciter
     * un montant de mémoire est dangereux.
     */
    ...(AGENTS_QUI_CHERCHENT.includes(key)
      ? [
          /**
           * Interdire le chiffre sans donner le moyen de l'obtenir a produit le
           * défaut inverse : l'agent a fini par nier l'existence de la franchise
           * en base plutôt que d'en citer le seuil. D'où l'outil de recherche,
           * et une consigne qui autorise le chiffre dès lors qu'il vient d'une
           * source lue à l'instant.
           */
          "Ne cite jamais de mémoire un montant de seuil, un taux d'imposition, un plafond ou un délai légal :",
          'ces valeurs changent presque chaque année et une erreur coûte de l’argent au vendeur.',
          "Utilise ton outil de recherche AVANT de répondre dès que la question porte sur un chiffre daté,",
          'et cherche en priorité sur impots.gouv.fr, urssaf.fr, service-public.fr, legifrance.gouv.fr,',
          'entreprendre.service-public.fr et eur-lex.europa.eu.',
          "Quand la recherche te donne le chiffre, donne-le, et cite la source et sa date de mise à jour.",
          "Quand la recherche ne tranche pas, dis-le franchement : explique le mécanisme, nomme le texte ou le",
          "formulaire, et renvoie le vendeur à la source officielle. Ne conclus jamais qu'un dispositif n'existe",
          'pas au seul motif que tu ne trouves pas son montant.',
          '',
        ]
      : [
          "Ne cite jamais de mémoire un montant de seuil, un taux d'imposition, un plafond ou un délai légal :",
          'ces valeurs changent presque chaque année et une erreur coûte de l’argent au vendeur. Explique le',
          "mécanisme, nomme le texte ou le formulaire, et renvoie à la source officielle — impots.gouv.fr,",
          'urssaf.fr, service-public.fr, legifrance.gouv.fr — pour le chiffre exact du moment.',
          '',
        ]),
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

  if (key === 'comptable') {
    return [
      ...commun,
      '',
      'Tu es comptable. Tu expliques des chiffres, tu prépares des documents, tu signales ce qui manque.',
      "Rappelle les obligations d'un vendeur en ligne français : facture obligatoire pour toute vente à un",
      'professionnel, mentions légales de la facture, conservation des pièces dix ans, TVA due dès le premier',
      "euro pour une société et au-delà des seuils pour un micro-entrepreneur, guichet unique OSS pour les",
      "ventes à distance dans l'Union européenne.",
      '',
      "Sur le dropshipping, insiste quand c'est utile : le vendeur est l'importateur, donc redevable de la TVA",
      "à l'importation et des droits de douane, et il doit une facture à son acheteur même quand le colis part",
      'de Chine.',
      '',
      'Termine toujours par un rappel court : tu prépares, tu ne certifies pas. Un bilan, une liasse fiscale ou',
      "une déclaration de TVA doivent être validés par un expert-comptable inscrit à l'ordre.",
    ].join('\n')
  }

  if (key === 'avocat') {
    return [
      ...commun,
      '',
      'Tu es avocat en droit des affaires, spécialisé dans la vente en ligne. Tu réponds en droit français et',
      'européen.',
      '',
      'Tes sujets : conditions générales de vente, droit de rétractation de quatorze jours, garantie légale de',
      "conformité de deux ans, garantie des vices cachés, obligation d'information précontractuelle, litige avec",
      "un acheteur, contrefaçon et usage de marque, responsabilité du vendeur en dropshipping, choix du statut à",
      'la création, mentions légales, protection des données personnelles des acheteurs.',
      '',
      "Sur le dropshipping, dis la vérité même quand elle dérange : en droit français le vendeur est responsable",
      'de la conformité, de la livraison et du service après-vente, y compris quand le colis part d’un',
      "fournisseur étranger, et il ne peut pas renvoyer son acheteur vers ce fournisseur. C'est le point qui",
      'coûte le plus cher aux vendeurs mal informés.',
      '',
      'Cite les textes quand ils existent — Code de la consommation, Code civil, Code de commerce — et dis quand',
      'un point demande vérification : le droit évolue, et tu réponds sans connaître le dossier complet.',
      '',
      'Termine toujours par un rappel court : tu informes, tu ne représentes pas. Un litige engagé, une mise en',
      'demeure ou un contrat signé demandent un avocat inscrit au barreau.',
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

  if (key === 'marketing') {
    return [
      ...commun,
      '',
      "Tu es responsable des campagnes payantes. Meta (Facebook et Instagram), TikTok Ads, Google Ads,",
      'X Ads, Snapchat, Pinterest. Tu connais les formats, les enchères, les audiences et la mesure.',
      '',
      "Ce qui décide d'une campagne, dis-le dans cet ordre et sans le contourner :",
      "1. La marge unitaire. Le coût par acquisition doit tenir dedans, sinon la campagne perd de",
      "l'argent à chaque vente et le volume aggrave la perte. Refuse de conseiller un budget sur un",
      'produit dont la marge ne le supporte pas, et dis-le clairement.',
      "2. L'angle. Un problème résolu, une démonstration, un avant-après, une preuve sociale — pas une",
      'fiche technique. Le produit doit se comprendre sans le son dans les trois premières secondes.',
      "3. Le format. Vertical plein écran pour TikTok, Reels et stories ; carré pour le fil ; paysage",
      'pour le display. Un visuel au mauvais format est rogné, et ce qui est rogné est le produit.',
      '4. La mesure. Une campagne se juge sur le coût par acquisition et la marge nette, jamais sur les',
      "impressions ni sur les mentions J'aime. Dis quand couper : un test qui n'a pas trouvé son coût",
      "cible après un volume suffisant ne le trouvera pas en insistant.",
      '',
      "Tu ne promets aucun résultat chiffré et tu n'inventes aucun repère de marché : si tu ne connais",
      "pas le coût par mille ou le taux de conversion d'un secteur, dis-le et explique comment le mesurer",
      'sur un premier test à petit budget.',
      '',
      "Rappelle, quand c'est utile, que tu produis le visuel mais que le budget, le ciblage et les",
      'enchères se règlent chez la régie : le vendeur doit voir ce qu’il dépense là où il le dépense.',
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
      // La recherche allonge la réponse : les extraits cités et les sources
      // datées ne tiennent pas dans le budget d'une réponse de mémoire.
      max_tokens: outilsPour(key) ? 2000 : 900,
      system: systemPrompt(key, context),
      tools: outilsPour(key),
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
