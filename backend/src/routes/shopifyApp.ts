import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import {
  configApp,
  donneesLiaison,
  echangerCode,
  hmacRequeteValide,
  hmacWebhookValide,
  lireEtat,
  lireJetonDeSession,
  souscrireDesinstallation,
} from '../services/shopifyApp.js'
import { pageIntegree } from '../services/shopifyEmbed.js'
import { graphql, normalizeShopDomain, resoudreCredentialsShopify } from '../services/shopify.js'
import { jetonOfflineValide } from '../services/shopifyApp.js'
import {
  AchatRefuse,
  boutiqueDeDeveloppement,
  creerAchatDrops,
  prixShopify,
  regulariserAchats,
} from '../services/shopifyBilling.js'
import { inscrireMouvement } from '../services/billing.js'
import { PACKS_DROPS, type PackDrops } from '../services/tarifs.js'

/**
 * Les deux portes publiques de l'application Shopify.
 *
 * Elles sont publiques au sens strict — Shopify les appelle, pas le navigateur
 * du vendeur connecté — donc **tout y est vérifié par signature**, jamais par
 * un jeton de session. C'est la seule défense possible : l'appelant est un
 * serveur de Shopify, il ne présentera jamais nos identifiants.
 *
 * **Express 4 : chaque handler asynchrone est enveloppé.** Un `async` qui lève
 * ici ne produirait ni erreur ni 500 — la requête PENDRAIT, et Shopify
 * réessaierait jusqu'à désactiver le webhook. C'est la panne du 05/09/2026,
 * consignée dans le mémo, et elle coûterait la fiche App Store.
 */
export const shopifyAppRouter = Router()

/** Enveloppe qui garantit qu'un refus part toujours, même sur une exception. */
function sur(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((err) => {
      console.error('[shopify-app]', req.path, err)
      if (!res.headersSent) res.status(500).json({ error: 'Erreur interne' })
    })
  }
}

/*
 * ---------------------------------------------------------------------------
 * 1. Le retour d'installation.
 * ---------------------------------------------------------------------------
 *
 * Shopify renvoie le marchand ici avec `code`, `shop`, `hmac` et notre `state`.
 * Trois contrôles avant d'échanger quoi que ce soit, et l'ordre compte : le
 * moins cher d'abord, et surtout **la signature avant le code**, pour ne jamais
 * présenter à Shopify un code qu'un tiers nous aurait soufflé.
 */
shopifyAppRouter.get(
  '/callback',
  sur(async (req, res) => {
    const config = configApp()
    if (!config) {
      res.status(503).send("L'application Shopify n'est pas configurée.")
      return
    }

    const params = req.query as Record<string, unknown>
    if (!hmacRequeteValide(config, params)) {
      res.status(401).send('Signature Shopify invalide.')
      return
    }

    const etat = lireEtat(config, String(params.state ?? ''))
    if (!etat) {
      res.status(401).send('Installation expirée ou falsifiée. Relancez-la depuis DropShipper IA.')
      return
    }

    // La boutique annoncée au retour doit être celle pour laquelle l'état a été
    // signé : sinon un marchand pourrait faire écrire chez lui le jeton d'un autre.
    const shop = normalizeShopDomain(String(params.shop ?? ''))
    if (!shop || shop !== etat.shop) {
      res.status(400).send('La boutique du retour ne correspond pas à celle demandée.')
      return
    }

    const code = String(params.code ?? '')
    if (!code) {
      res.status(400).send("Shopify n'a pas fourni de code d'autorisation.")
      return
    }

    const jeton = await echangerCode(config, shop, code)

    // Le compte a pu disparaître entre le départ et le retour : sans ce
    // contrôle, l'écriture lèverait une contrainte de clé étrangère illisible.
    const compte = await prisma.user.findUnique({ where: { id: etat.userId }, select: { id: true } })
    if (!compte) {
      res.status(401).send('Compte introuvable. Reconnectez-vous puis relancez l’installation.')
      return
    }

    /*
     * Exactement la forme que `readShopifyCredentials` attend déjà.
     * Rien en aval ne sait — ni ne doit savoir — d'où vient le jeton.
     */
    await prisma.platformCredential.upsert({
      where: { userId_platform: { userId: etat.userId, platform: 'SHOPIFY' } },
      create: {
        userId: etat.userId,
        platform: 'SHOPIFY',
        label: shop,
        data: donneesLiaison(jeton),
        connected: true,
      },
      update: {
        label: shop,
        data: donneesLiaison(jeton),
        connected: true,
      },
    })

    /*
     * L'abonnement à `app/uninstalled`, en meilleur effort.
     *
     * Il se pose APRÈS l'enregistrement de la liaison et son échec n'annule
     * rien : le marchand vient d'approuver l'installation, la lui refuser
     * parce qu'un abonnement de webhook n'a pas pris serait absurde. Ce qu'on
     * perd alors est la détection automatique de la désinstallation — c'est
     * consigné dans le journal, pas caché.
     */
    souscrireDesinstallation(config, shop, jeton.accessToken, graphql).then(
      (r) => {
        if (!r.pose) console.error('[shopify-app] abonnement app/uninstalled refusé :', r.raison)
      },
      (err) => console.error('[shopify-app] abonnement app/uninstalled', err),
    )

    const site = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.drop-shipper.fr'
    const separateur = etat.retour.includes('?') ? '&' : '?'
    res.redirect(`${site}${etat.retour}${separateur}shopify=connectee`)
  }),
)

/*
 * ---------------------------------------------------------------------------
 * 2. L'application intégrée : la page affichée DANS l'admin Shopify.
 * ---------------------------------------------------------------------------
 *
 * C'est l'« App URL » déclarée dans le Dev Dashboard. Shopify l'ouvre dans une
 * iframe de `admin.shopify.com` avec `shop`, `host`, `timestamp` et `hmac`.
 *
 * **La signature est vérifiée ici comme au retour d'installation**, et pour la
 * même raison : sans elle, n'importe qui afficherait cette page avec le
 * paramètre `shop` de son choix. Elle ne donne aucun accès par elle-même — les
 * chiffres viennent d'un second appel authentifié au jeton de session — mais
 * une page qui affiche « Boutique connectée : victime.myshopify.com » est déjà
 * un outil d'hameçonnage.
 */
shopifyAppRouter.get(
  '/app',
  sur(async (req, res) => {
    const config = configApp()
    if (!config) {
      res.status(503).send("L'application Shopify n'est pas configurée.")
      return
    }

    const params = req.query as Record<string, unknown>
    if (!hmacRequeteValide(config, params)) {
      res.status(401).send('Signature Shopify invalide.')
      return
    }

    const shop = normalizeShopDomain(String(params.shop ?? ''))
    if (!shop) {
      res.status(400).send('Boutique Shopify absente ou invalide.')
      return
    }

    /*
     * `frame-ancestors` : sans cet en-tête, l'admin Shopify refuse d'afficher
     * l'iframe et le marchand voit un cadre vide — c'est le symptôme le plus
     * courant d'une app intégrée qui « ne marche pas ». Il vaut aussi
     * protection : il limite l'affichage à Shopify et à CETTE boutique, donc
     * un tiers ne peut pas encadrer notre page dans la sienne.
     */
    res.setHeader('Content-Security-Policy', `frame-ancestors https://${shop} https://admin.shopify.com`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Le contenu dépend du jeton de session, pas du cache : rien à garder.
    res.setHeader('Cache-Control', 'no-store')

    const site = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.drop-shipper.fr'
    res.send(pageIntegree({ shop, cleApp: config.cle, site }))
  }),
)

/**
 * L'état de la boutique, pour la page intégrée — au jeton de session.
 *
 * **C'est ici que le second portique sert vraiment.** La page elle-même
 * n'affiche aucun chiffre ; elle les demande, et cette route ne répond qu'à un
 * jeton signé du secret de l'app, dont la destination désigne la boutique.
 * Un appelant qui n'a pas ce jeton ne peut pas savoir si une boutique nous est
 * reliée, ni combien d'annonces elle porte.
 *
 * 404 plutôt que 403 quand la boutique n'est rattachée à aucun compte : la
 * page a besoin de distinguer « pas encore relié » de « refusé », et les deux
 * cas appellent le même geste côté marchand — ouvrir DropShipper IA.
 */
shopifyAppRouter.get(
  '/embed/etat',
  sur(async (req, res) => {
    const config = configApp()
    if (!config) {
      res.status(503).json({ error: 'Application Shopify non configurée' })
      return
    }

    const entete = String(req.get('Authorization') ?? '')
    const session = entete.startsWith('Bearer ')
      ? lireJetonDeSession(config, entete.slice('Bearer '.length))
      : null
    if (!session) {
      res.status(401).json({ error: 'Jeton de session invalide' })
      return
    }

    const liaison = await liaisonDeBoutique(session.shop)
    if (!liaison) {
      res.status(404).json({ error: 'Boutique non rattachée' })
      return
    }

    /*
     * Les achats approuvés chez Shopify sont régularisés ICI aussi, pas
     * seulement au retour d'approbation : un onglet fermé pendant l'approbation
     * perdrait le retour, et le marchand rouvrirait l'app pour voir un solde
     * inchangé. En meilleur effort — un Shopify injoignable ne doit pas cacher
     * les chiffres de la page.
     */
    const credites = liaison.connected
      ? await regulariserPour(liaison).catch((err) => {
          console.error('[shopify-app] régularisation des achats', session.shop, err)
          return []
        })
      : []

    /*
     * Les trois chiffres sont comptés, jamais listés : la page n'a pas besoin
     * du catalogue, et un `findMany` enverrait les fiches d'un vendeur dans une
     * iframe qu'on n'a authentifiée que par la boutique.
     */
    const [publiees, catalogue, fournisseurs, compte] = await Promise.all([
      prisma.publication.count({
        where: { platform: 'SHOPIFY', status: 'PUBLISHED', product: { userId: liaison.userId } },
      }),
      prisma.product.count({ where: { userId: liaison.userId } }),
      prisma.supplierConnection.count({ where: { userId: liaison.userId, connected: true } }),
      prisma.user.findUnique({ where: { id: liaison.userId }, select: { credits: true } }),
    ])

    res.json({
      reliee: liaison.connected,
      shop: session.shop,
      publiees,
      catalogue,
      fournisseurs,
      drops: compte?.credits ?? 0,
      packs: PACKS_DROPS.map((p) => ({ id: p.id, drops: p.drops, prix: prixShopify(p) })),
      credites: credites.map((c) => ({ drops: c.pack.drops })),
    })
  }),
)

/*
 * ---------------------------------------------------------------------------
 * 2bis. Les recharges de drops achetées chez Shopify.
 * ---------------------------------------------------------------------------
 *
 * Exigence 1.2.1 de l'App Store : tout ce que l'app vend passe par la Billing
 * API. Le marchand choisit un pack dans la page intégrée ; on ouvre l'achat
 * chez Shopify ; il l'approuve sur LEUR page ; Shopify le renvoie ici ; et on
 * crédite ce que Shopify dit approuvé — jamais ce que l'adresse de retour
 * prétend. Voir `services/shopifyBilling.ts`.
 */

type Liaison = { id: string; userId: string; connected: boolean; data: unknown }

async function liaisonDeBoutique(shop: string): Promise<Liaison | null> {
  return prisma.platformCredential.findFirst({
    where: { platform: 'SHOPIFY', data: { path: ['shopDomain'], equals: shop } },
    select: { id: true, userId: true, connected: true, data: true },
  })
}

/** Le jeton de la boutique, renouvelé s'il expire, quelle que soit la voie de liaison. */
async function credsDeLiaison(liaison: Liaison) {
  const creds =
    (await jetonOfflineValide(liaison.data, async (data) => {
      await prisma.platformCredential.update({ where: { id: liaison.id }, data: { data } })
    })) ?? (await resoudreCredentialsShopify(liaison.data))
  if (!creds) throw new Error("La liaison Shopify n'a pas de jeton utilisable.")
  return creds
}

/**
 * Crédite un achat, une seule fois quoi qu'il arrive.
 *
 * Le paiement est écrit AVANT les drops, sous la clé unique de l'achat : deux
 * régularisations simultanées (le retour d'approbation et la page intégrée
 * qui se rouvre) ne peuvent pas créditer deux fois — la seconde insertion est
 * refusée par la base, et elle rend faux. `grantPack` fait l'inverse (drops
 * puis paiement) parce que Stripe a son propre garde-fou de rejeu ; ici il
 * n'y en a pas d'autre.
 */
async function crediterAchatShopify(userId: string, pack: PackDrops, achatId: string): Promise<boolean> {
  try {
    await prisma.payment.create({
      data: { userId, planId: pack.id, amount: pack.amount, credits: pack.drops, stripeSessionId: achatId },
    })
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return false
    throw err
  }
  const apres = await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: pack.drops } },
    select: { credits: true },
  })
  await inscrireMouvement(userId, pack.drops, apres.credits, `Recharge de ${pack.drops} drops (Shopify)`, achatId)
  return true
}

async function regulariserPour(liaison: Liaison) {
  const creds = await credsDeLiaison(liaison)
  return regulariserAchats(
    graphql,
    creds,
    async (ids) => {
      const connus = await prisma.payment.findMany({
        where: { stripeSessionId: { in: ids } },
        select: { stripeSessionId: true },
      })
      return new Set(connus.map((p) => p.stripeSessionId).filter((x): x is string => !!x))
    },
    (achatId, pack) => crediterAchatShopify(liaison.userId, pack, achatId),
  )
}

/** L'adresse de la page de l'app dans l'admin de la boutique — où le marchand revient. */
function pageDansAdmin(shop: string): string {
  const poignee = process.env.SHOPIFY_APP_HANDLE?.trim() || 'dropshipper-ia'
  return `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, '')}/apps/${poignee}`
}

/** Ouvre un achat de drops chez Shopify — au jeton de session, depuis la page intégrée. */
shopifyAppRouter.post(
  '/embed/achat',
  sur(async (req, res) => {
    const config = configApp()
    if (!config) {
      res.status(503).json({ error: 'Application Shopify non configurée' })
      return
    }
    const entete = String(req.get('Authorization') ?? '')
    const session = entete.startsWith('Bearer ') ? lireJetonDeSession(config, entete.slice('Bearer '.length)) : null
    if (!session) {
      res.status(401).json({ error: 'Jeton de session invalide' })
      return
    }

    // Le corps arrive en octets bruts (express.raw sur ce routeur, pour les webhooks).
    let packId = ''
    try {
      const corps = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body
      packId = String(corps?.packId ?? '')
    } catch {
      res.status(400).json({ error: 'Corps illisible' })
      return
    }

    const liaison = await liaisonDeBoutique(session.shop)
    if (!liaison || !liaison.connected) {
      res.status(404).json({ error: 'Boutique non rattachée' })
      return
    }

    try {
      const creds = await credsDeLiaison(liaison)
      // Sur une boutique de développement, Shopify n'encaisse pas : l'achat doit être marqué test.
      const test = process.env.SHOPIFY_BILLING_TEST === '1' || (await boutiqueDeDeveloppement(graphql, creds))
      const retour = `${config.racine}/api/shopify/billing/retour?shop=${encodeURIComponent(session.shop)}`
      const achat = await creerAchatDrops(graphql, creds, packId, retour, test)
      res.json({ confirmationUrl: achat.confirmationUrl, test })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible d'ouvrir l'achat."
      res.status(err instanceof AchatRefuse ? 400 : 502).json({ error: message })
    }
  }),
)

/**
 * Le retour d'approbation : Shopify y renvoie le marchand (hors iframe, donc
 * sans jeton de session). Rien n'est cru de l'adresse : on régularise d'après
 * Shopify, puis on ramène le marchand sur la page de l'app dans son admin.
 */
shopifyAppRouter.get(
  '/billing/retour',
  sur(async (req, res) => {
    const shop = normalizeShopDomain(String(req.query.shop ?? ''))
    if (!shop) {
      res.status(400).send('Boutique absente ou invalide.')
      return
    }
    const liaison = await liaisonDeBoutique(shop)
    let etat = 'attente'
    if (liaison?.connected) {
      try {
        const credites = await regulariserPour(liaison)
        if (credites.length) etat = 'ok'
      } catch (err) {
        console.error('[shopify-app] retour de facturation', shop, err)
        etat = 'erreur'
      }
    }
    res.redirect(`${pageDansAdmin(shop)}?achat=${etat}`)
  }),
)

/*
 * ---------------------------------------------------------------------------
 * 3. Les webhooks.
 * ---------------------------------------------------------------------------
 *
 * Les trois premiers sujets sont **obligatoires pour toute app publique** :
 * Shopify les envoie même si l'app ne lit aucune donnée client, et une fiche
 * qui n'y répond pas est refusée. Le quatrième ne l'est pas, mais il évite une
 * panne bête : après une désinstallation, le jeton ne vaut plus rien et chaque
 * publication échouerait sans que le vendeur comprenne pourquoi.
 *
 * **Le corps arrive en octets bruts** (`express.raw` monté avant `express.json`
 * dans index.ts, comme pour Stripe) : la signature porte sur les octets, et un
 * JSON ré-encodé ne redonne pas les mêmes.
 */
shopifyAppRouter.post(
  '/webhooks',
  sur(async (req, res) => {
    const config = configApp()
    if (!config) {
      res.status(503).json({ error: 'Application Shopify non configurée' })
      return
    }

    const brut: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}))
    const signature = String(req.get('X-Shopify-Hmac-Sha256') ?? '')
    if (!hmacWebhookValide(config, brut, signature)) {
      // 401 et rien d'autre : ne jamais dire à un appelant non signé ce que
      // l'application sait faire.
      res.status(401).json({ error: 'Signature invalide' })
      return
    }

    const sujet = String(req.get('X-Shopify-Topic') ?? '')
    const shop = normalizeShopDomain(String(req.get('X-Shopify-Shop-Domain') ?? ''))

    /*
     * On répond 200 AVANT de travailler.
     *
     * Shopify attend une réponse en cinq secondes et réessaie huit fois sinon,
     * puis désactive le webhook. Le travail qui suit est court, mais il parle à
     * la base : une lenteur passagère ne doit pas coûter l'abonnement au sujet.
     */
    res.status(200).json({ ok: true })

    try {
      await traiterWebhook(sujet, shop)
    } catch (err) {
      console.error('[shopify-app] webhook', sujet, err)
    }
  }),
)

/**
 * Ce que chaque sujet demande, et ce que nous détenons réellement.
 *
 * **Répondre honnêtement suppose de savoir ce qu'on stocke.** Nous ne recevons
 * aucune donnée des clients d'une boutique Shopify : nous y POUSSONS des
 * fiches produit, et les commandes que nous connaissons viennent de nos propres
 * vitrines, jamais de Shopify. Les deux sujets « clients » n'ont donc rien à
 * livrer ni à effacer, et c'est cette réponse-là qu'il faut écrire dans la
 * fiche App Store — pas une promesse de traitement qui n'existe pas.
 *
 * Le troisième, lui, nous concerne : `shop/redact` arrive 48 h après une
 * désinstallation et nous détenons bien quelque chose de la boutique, son
 * jeton d'accès. Il part.
 */
async function traiterWebhook(sujet: string, shop: string | null): Promise<void> {
  switch (sujet) {
    case 'customers/data_request':
    case 'customers/redact':
      // Aucune donnée personnelle d'acheteur Shopify n'est conservée chez nous.
      console.log(`[shopify-app] ${sujet} pour ${shop ?? 'boutique inconnue'} : aucune donnée détenue.`)
      return

    case 'shop/redact': {
      if (!shop) return
      const { count } = await prisma.platformCredential.deleteMany({
        where: { platform: 'SHOPIFY', data: { path: ['shopDomain'], equals: shop } },
      })
      console.log(`[shopify-app] shop/redact ${shop} : ${count} liaison(s) supprimée(s).`)
      return
    }

    case 'app/uninstalled': {
      if (!shop) return
      // On ne supprime pas : le vendeur réinstalle souvent, et son catalogue et
      // ses publications doivent le retrouver. On marque la liaison éteinte,
      // ce que l'écran des plateformes lit déjà.
      const { count } = await prisma.platformCredential.updateMany({
        where: { platform: 'SHOPIFY', data: { path: ['shopDomain'], equals: shop } },
        data: { connected: false },
      })
      console.log(`[shopify-app] app/uninstalled ${shop} : ${count} liaison(s) éteinte(s).`)
      return
    }

    default:
      console.log(`[shopify-app] sujet non traité : ${sujet}`)
  }
}
