import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import {
  configApp,
  echangerCode,
  hmacRequeteValide,
  hmacWebhookValide,
  lireEtat,
} from '../services/shopifyApp.js'
import { normalizeShopDomain } from '../services/shopify.js'

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
        data: { shopDomain: shop, accessToken: jeton.accessToken, scope: jeton.scope, via: 'oauth' },
        connected: true,
      },
      update: {
        label: shop,
        data: { shopDomain: shop, accessToken: jeton.accessToken, scope: jeton.scope, via: 'oauth' },
        connected: true,
      },
    })

    const site = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.drop-shipper.fr'
    const separateur = etat.retour.includes('?') ? '&' : '?'
    res.redirect(`${site}${etat.retour}${separateur}shopify=connectee`)
  }),
)

/*
 * ---------------------------------------------------------------------------
 * 2. Les webhooks.
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
