import express, { Router, type Request, type Response, type NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { annonces, arbreMarket, marketUrl, marketHosts, type Annonce } from '../services/market.js'
import { googleMarketRss, metaMarketCsv, comparateurCsv, googleAdsEditorCsv } from '../services/marketFeeds.js'
import { pageListe, pageProduit, pageMessage, pageVendre, cheminCategorie } from '../services/marketPages.js'
import { ouvrirPaiementMarket, confirmerCommandeMarket, MarketIndisponible } from '../services/marketStripe.js'

/**
 * DropShop Market, les pages publiques et les flux.
 *
 * Servi à la racine de drop-shop.cloud (le domaine pointe sur ce service
 * Railway, voir `marketHostRouter`) et sous `/market` sur l'adresse de l'API,
 * pour l'aperçu. `req.baseUrl` donne le préfixe des liens dans les deux cas.
 */
export const marketRouter = Router()

const PAR_PAGE = 48

/** Express 4 : un handler async qui lève fait pendre la requête. On attrape tout. */
function page(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      console.error('[market]', req.path, err instanceof Error ? err.message : err)
      if (res.headersSent) return next(err)
      res.status(500).type('html').send(pageMessage(req.baseUrl, 'Un incident est survenu', "La page n'a pas pu être affichée. Réessayez dans un instant."))
    })
  }
}

function numeroPage(req: Request) {
  const n = Number.parseInt(String(req.query.page ?? '1'), 10)
  return Number.isFinite(n) && n > 0 && n < 500 ? n : 1
}

/** L'adresse absolue du Market tel que l'acheteur le voit (retours de Stripe). */
function baseAbsolue(req: Request) {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0].trim()
  const hote = String(req.headers['x-forwarded-host'] ?? req.get('host') ?? '').split(',')[0].trim()
  return hote ? `${proto}://${hote}${req.baseUrl}` : `${marketUrl()}${req.baseUrl}`
}

async function liste(req: Request, filtre: Parameters<typeof annonces>[0]) {
  const n = numeroPage(req)
  const res = await annonces({ ...filtre, limite: PAR_PAGE + 1, decalage: (n - 1) * PAR_PAGE })
  return { page: n, annonces: res.slice(0, PAR_PAGE), suivante: res.length > PAR_PAGE }
}

function html(res: Response, corps: string, cache = 300) {
  res.set('Cache-Control', `public, max-age=${cache}`)
  res.type('html').send(corps)
}

marketRouter.get(
  '/',
  page(async (req, res) => {
    const [l, { rayons: r }] = await Promise.all([liste(req, {}), arbreMarket()])
    html(
      res,
      pageListe({
        base: req.baseUrl,
        accueil: true,
        titre: 'DropShop Market : la place de marché des boutiques DropShop',
        h1: 'Les nouveautés des boutiques DropShop',
        intro: 'Des milliers de produits, vendus par des boutiques indépendantes. Livraison comprise, paiement sécurisé par Stripe.',
        description: 'DropShop Market réunit les produits des boutiques DropShop : mode, maison, high-tech, beauté… Livraison comprise et paiement sécurisé par Stripe.',
        chemin: '/',
        rayons: r,
        hero: l.page === 1,
        ...l,
      }),
    )
  }),
)

marketRouter.get(
  '/recherche',
  page(async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 100)
    const [l, r] = await Promise.all([q ? liste(req, { recherche: q }) : liste(req, {}), arbreMarket().then((a) => a.rayons)])
    html(
      res,
      pageListe({
        base: req.baseUrl,
        titre: q ? `« ${q} » | DropShop Market` : 'Recherche | DropShop Market',
        h1: q ? `Résultats pour « ${q} »` : 'Tous les produits',
        description: `Les produits DropShop Market pour « ${q} ».`,
        chemin: null,
        indexable: false,
        recherche: q,
        rayons: r,
        vide: 'Aucun produit ne correspond à cette recherche.',
        ...l,
      }),
      60,
    )
  }),
)

/**
 * Les 24 catégories et leurs sous-catégories : toujours en ligne, même vides.
 * Une page vide n'est pas indexée (contenu mince) ; elle le devient dès sa
 * première annonce.
 */
async function pageCategorie(req: Request, res: Response) {
  const { rayons: r } = await arbreMarket()
  const rayon = r.find((x) => x.id === req.params.rayon)
  if (!rayon) return res.status(404).type('html').send(pageMessage(req.baseUrl, 'Catégorie introuvable', "Cette catégorie n'existe pas.", { libelle: "Retour à l'accueil", href: `${req.baseUrl}/` }))
  const sous = req.params.sous ? rayon.sousCategories.find((c) => c.id === req.params.sous) : null
  if (req.params.sous && !sous) return res.redirect(301, `${req.baseUrl}${cheminCategorie(rayon.id)}`)
  const ids = sous ? [sous.id] : rayon.ids
  const l = await liste(req, { categoryIds: ids })
  const nom = sous ? sous.label : rayon.label
  html(
    res,
    pageListe({
      base: req.baseUrl,
      titre: `${nom}${sous ? ` – ${rayon.label}` : ''} : achat en ligne | DropShop Market`,
      h1: `${rayon.icone && !sous ? `${rayon.icone} ` : ''}${nom}`,
      description: `${nom} sur DropShop Market : les produits des boutiques DropShop, livraison comprise, paiement sécurisé par Stripe.`,
      chemin: cheminCategorie(rayon.id, sous?.id),
      rayons: r,
      puces: { rayon, courante: sous?.id ?? null },
      indexable: l.annonces.length > 0,
      vide: 'Pas encore de produit dans cette catégorie : les premiers arrivent bientôt.',
      ...l,
    }),
  )
}
marketRouter.get('/c/:rayon', page(pageCategorie))
marketRouter.get('/c/:rayon/:sous', page(pageCategorie))

/** Le mode Prime : les articles livrés en 24 h. */
marketRouter.get(
  '/prime',
  page(async (req, res) => {
    const [l, { rayons: r }] = await Promise.all([liste(req, { prime: true }), arbreMarket()])
    html(
      res,
      pageListe({
        base: req.baseUrl,
        titre: 'Prime : livraison en 24 h | DropShop Market',
        h1: '⚡ Prime : livré en 24 h',
        intro: 'Des articles en stock en France, expédiés le jour même et livrés en 24 h. Livraison offerte.',
        description: 'Les articles Prime de DropShop Market : en stock en France, expédiés le jour même, livrés en 24 h, livraison offerte.',
        chemin: '/prime',
        rayons: r,
        hero: true,
        vide: 'Les premiers articles Prime arrivent bientôt.',
        ...l,
      }),
    )
  }),
)

marketRouter.get(
  '/vendeur/:slug',
  page(async (req, res) => {
    const shop = await prisma.shop.findUnique({ where: { slug: req.params.slug }, select: { name: true, slug: true } })
    if (!shop) return res.status(404).type('html').send(pageMessage(req.baseUrl, 'Vendeur introuvable', "Cette boutique n'est pas (ou plus) sur DropShop Market."))
    const [l, { rayons: r }] = await Promise.all([liste(req, { shopSlug: shop.slug! }), arbreMarket()])
    html(
      res,
      pageListe({
        base: req.baseUrl,
        titre: `${shop.name} sur DropShop Market`,
        h1: shop.name,
        intro: 'Tous les produits de cette boutique sur DropShop Market.',
        description: `Les produits de la boutique ${shop.name} sur DropShop Market : livraison comprise, paiement sécurisé par Stripe.`,
        chemin: `/vendeur/${encodeURIComponent(shop.slug!)}`,
        rayons: r,
        ...l,
      }),
    )
  }),
)

/**
 * La fiche produit et les pages de variantes.
 *
 *   /p/<id>/<titre>               la fiche (toutes variantes)
 *   /p/<id>/<titre>/<valeurs>-<clé>  une variante, sa propre page indexable
 *
 * Seuls l'identifiant et la clé comptent ; un titre réécrit depuis redirige
 * (301) vers la nouvelle adresse, pour ne pas perdre le référencement acquis.
 */
async function ficheProduit(req: Request, res: Response) {
  const [annonce] = await annonces({ productId: req.params.id, limite: 1 })
  if (!annonce) {
    return res.status(404).type('html').send(pageMessage(req.baseUrl, 'Produit introuvable', "Ce produit n'est plus en vente sur DropShop Market.", { libelle: 'Voir les nouveautés', href: `${req.baseUrl}/` }))
  }
  const brut = req.params.variante
  let courante = null
  if (brut) {
    const cle = brut.slice(-8)
    courante = annonce.offres.find((o) => o.cle === cle) ?? null
    if (!courante) return res.redirect(301, `${req.baseUrl}${annonce.offres[0].cheminProduit}`)
  }
  const attendu = courante ? courante.chemin : annonce.offres[0].cheminProduit
  if (decodeURIComponent(req.path) !== attendu) return res.redirect(301, `${req.baseUrl}${attendu}`)
  const { rayons: r } = await arbreMarket()
  html(res, pageProduit(req.baseUrl, annonce, courante, r))
}

marketRouter.get('/p/:id', page(ficheProduit))
marketRouter.get('/p/:id/:slug', page(ficheProduit))
marketRouter.get('/p/:id/:slug/:variante', page(ficheProduit))

marketRouter.get('/vendre', (req, res) => html(res, pageVendre(req.baseUrl), 3600))

/** L'achat : une offre, une quantité, et l'acheteur part chez Stripe. */
marketRouter.post(
  '/acheter',
  express.urlencoded({ extended: false, limit: '4kb' }),
  rateLimit({ name: 'market-achat', windowMs: 3600_000, max: 30 }),
  page(async (req, res) => {
    const id = String(req.body?.offre ?? '').slice(0, 80)
    const quantite = Math.min(10, Math.max(1, Number.parseInt(String(req.body?.quantite ?? '1'), 10) || 1))
    const productId = id.split('-')[0]
    const [annonce] = productId ? await annonces({ productId, limite: 1 }) : []
    const offre = annonce?.offres.find((o) => o.id === id)
    if (!annonce || !offre) return res.status(404).type('html').send(pageMessage(req.baseUrl, 'Produit introuvable', "Ce produit n'est plus en vente."))
    if (!offre.disponible) return res.status(409).type('html').send(pageMessage(req.baseUrl, 'Variante épuisée', 'Cette variante est épuisée. Choisissez-en une autre.', { libelle: 'Revenir au produit', href: `${req.baseUrl}${offre.cheminProduit}` }))
    try {
      const url = await ouvrirPaiementMarket({ annonce, offre, quantite, base: baseAbsolue(req) })
      res.redirect(303, url)
    } catch (err) {
      if (err instanceof MarketIndisponible) {
        return res.status(409).type('html').send(pageMessage(req.baseUrl, 'Vente pas encore ouverte', err.message, { libelle: 'Revenir au produit', href: `${req.baseUrl}${offre.chemin}` }))
      }
      throw err
    }
  }),
)

marketRouter.get(
  '/merci',
  page(async (req, res) => {
    const session = String(req.query.session_id ?? '')
    res.set('Cache-Control', 'no-store')
    if (!/^cs_[A-Za-z0-9_]+$/.test(session)) return res.status(400).type('html').send(pageMessage(req.baseUrl, 'Commande introuvable', 'Le lien de confirmation est incomplet.'))
    const r = await confirmerCommandeMarket(session)
    if (!r.paye) {
      return res.type('html').send(pageMessage(req.baseUrl, 'Paiement en attente', "Stripe ne nous a pas encore confirmé le paiement. Vous recevrez un email dès qu'il le sera.", { libelle: "Retour à l'accueil", href: `${req.baseUrl}/` }))
    }
    res.type('html').send(
      pageMessage(req.baseUrl, 'Merci pour votre commande !', `Votre paiement${r.titre ? ` pour « ${r.titre} »` : ''} est confirmé. Le vendeur prépare votre colis ; un email de confirmation vous a été envoyé.`, { libelle: 'Continuer mes achats', href: `${req.baseUrl}/` }),
    )
  }),
)

// ——— Référencement : robots, plan du site ———

marketRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400')
  res.send(`User-agent: *\nAllow: /\nDisallow: /recherche\nDisallow: /acheter\nDisallow: /merci\n\nSitemap: ${marketUrl()}/sitemap.xml\n`)
})

marketRouter.get(
  '/sitemap.xml',
  page(async (_req, res) => {
    const [liste, { rayons: r }] = await Promise.all([annonces({ limite: 5000 }), arbreMarket()])
    const vendeurs = new Set(liste.map((a) => a.vendeur.slug).filter((s): s is string => Boolean(s)))
    const urls: Array<{ loc: string; lastmod?: Date; image?: string | null }> = [{ loc: '/' }, { loc: '/prime' }, { loc: '/vendre' }]
    // Seules les catégories qui ont des annonces : une page vide n'a rien à faire dans le plan du site.
    const pleines = new Set(liste.flatMap((a) => (a.categorie ? [a.categorie.id, a.categorie.rayon.id] : [])))
    for (const x of r) {
      if (pleines.has(x.id)) urls.push({ loc: cheminCategorie(x.id) })
      for (const c of x.sousCategories) if (pleines.has(c.id)) urls.push({ loc: cheminCategorie(x.id, c.id) })
    }
    for (const v of vendeurs) urls.push({ loc: `/vendeur/${encodeURIComponent(v)}` })
    for (const a of liste) {
      urls.push({ loc: a.offres[0].cheminProduit, lastmod: a.product.updatedAt, image: a.offres[0].image })
      for (const o of a.offres) if (o.cle) urls.push({ loc: o.chemin, lastmod: a.product.updatedAt, image: o.image })
    }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600')
    res.send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
        ...urls.slice(0, 50000).map(
          (u) =>
            `<url><loc>${esc(marketUrl() + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ''}${u.image ? `<image:image><image:loc>${esc(u.image)}</image:loc></image:image>` : ''}</url>`,
        ),
        '</urlset>',
      ].join('\n'),
    )
  }),
)

// ——— Les flux : Google Merchant Center, Meta, comparateurs, Google Ads ———

/** `?vendeur=<adresse>` limite un flux à une boutique. */
async function annoncesDuFlux(req: Request): Promise<Annonce[]> {
  const vendeur = typeof req.query.vendeur === 'string' ? req.query.vendeur.slice(0, 80) : undefined
  return annonces({ limite: 5000, ...(vendeur ? { shopSlug: vendeur } : {}) })
}

function flux(type: string, rendu: (a: Annonce[]) => string, nomFichier?: string) {
  return page(async (req, res) => {
    const contenu = rendu(await annoncesDuFlux(req))
    res.set('Cache-Control', 'public, max-age=3600').type(type)
    if (nomFichier) res.attachment(nomFichier)
    res.send(contenu)
  })
}

marketRouter.get('/flux/google.xml', flux('application/xml; charset=utf-8', googleMarketRss))
marketRouter.get('/flux/meta.csv', flux('text/csv; charset=utf-8', metaMarketCsv))
marketRouter.get('/flux/comparateurs.csv', flux('text/csv; charset=utf-8', comparateurCsv))
marketRouter.get('/flux/google-ads.csv', flux('text/csv; charset=utf-8', googleAdsEditorCsv, 'dropshop-market-google-ads.csv'))

/**
 * Sur drop-shop.cloud, le Market est servi à la RACINE. Ce routeur-là ne
 * répond qu'aux noms d'hôte du Market et laisse tout le reste (l'API, les
 * fichiers /storage) au reste de l'application.
 */
export function marketHostRouter(req: Request, res: Response, next: NextFunction) {
  const hote = String(req.headers['x-forwarded-host'] ?? req.hostname ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
  if (!marketHosts().includes(hote)) return next()
  if (req.path.startsWith('/api/') || req.path.startsWith('/storage/')) return next()
  // www → domaine nu : une seule adresse par page pour Google.
  const canonique = new URL(marketUrl()).hostname
  if (hote !== canonique && req.method === 'GET') return res.redirect(301, `${marketUrl()}${req.originalUrl}`)
  return marketRouter(req, res, next)
}
