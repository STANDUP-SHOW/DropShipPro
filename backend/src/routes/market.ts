import express, { Router, type Request, type Response, type NextFunction } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../lib/prisma.js'
import { annonces, arbreMarket, boutiqueUrlDe, marketUrl, marketHosts, type Annonce } from '../services/market.js'
import { googleMarketRss, metaMarketCsv, comparateurCsv, googleAdsEditorCsv } from '../services/marketFeeds.js'
import { pageListe, pageProduit, pageMessage, pageVendre, cheminCategorie } from '../services/marketPages.js'
import { confirmerCommandeMarket } from '../services/marketStripe.js'
import { ecrirePanier } from '../services/marketPanier.js'
import { clientConnecte } from '../services/marketClients.js'
import { marketClientRouter } from './marketClient.js'

/**
 * DropShop Market, les pages publiques et les flux.
 *
 * Servi à la racine de drop-shop.cloud (le domaine pointe sur ce service
 * Railway, voir `marketHostRouter`) et sous `/market` sur l'adresse de l'API,
 * pour l'aperçu. `req.baseUrl` donne le préfixe des liens dans les deux cas.
 */
export const marketRouter = Router()

const PAR_PAGE = 48

/**
 * The DropShop brand images (charte du 10/10/2026), served from backend/marque.
 * Resolved from this module, never from the cwd: src/routes under tsx and
 * dist/routes in production are both two levels below backend/.
 */
const DOSSIER_MARQUE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../marque')
marketRouter.use('/marque', express.static(DOSSIER_MARQUE, { maxAge: '7d', fallthrough: false, index: false }))

/** Le côté client : panier, commande, compte, suivi, retours, contact, pages d'information. */
marketRouter.use(marketClientRouter)

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

/**
 * Les produits en vedette (repris de la PR #37) : les articles Prime d'abord,
 * puis les mieux notés (la note pèse avec le nombre d'avis), puis les plus
 * récents. Douze au plus, pris parmi les soixante dernières annonces : pas de
 * classement stocké, donc rien à entretenir.
 */
async function vedettesDuMarket(): Promise<Annonce[]> {
  const recentes = await annonces({ limite: 60 })
  const score = (a: Annonce) => (a.prime ? 1000 : 0) + (a.avis?.moyenne != null ? a.avis.moyenne * Math.log(1 + a.avis.nombre) : 0)
  return recentes
    .map((a, i) => ({ a, i }))
    .sort((x, y) => score(y.a) - score(x.a) || x.i - y.i)
    .slice(0, 12)
    .map((x) => x.a)
}

/**
 * Les filtres et tris de recherche, comme sur Amazon : prix, note, Prime, ordre.
 * Le prix d'une annonce dépend de ses variantes (calculé, pas stocké) : quand un
 * filtre est posé, on trie en mémoire sur les 2 000 annonces les plus récentes.
 */
const TRIS = { nouveautes: 'Nouveautés', 'prix-asc': 'Prix croissant', 'prix-desc': 'Prix décroissant', notes: 'Mieux notés' } as const
type TriCle = keyof typeof TRIS

function lireFiltres(req: Request) {
  const nombre = (v: unknown) => {
    const n = Number.parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const tri = (String(req.query.tri ?? '') in TRIS ? String(req.query.tri) : 'nouveautes') as TriCle
  const f = { tri, min: nombre(req.query.min), max: nombre(req.query.max), prime: req.query.prime === '1', note4: req.query.note4 === '1' }
  const actif = f.tri !== 'nouveautes' || f.min != null || f.max != null || f.prime || f.note4
  return { ...f, actif }
}

function prixDe(a: Annonce): number {
  const dispo = a.offres.filter((o) => o.disponible)
  return Math.min(...(dispo.length ? dispo : a.offres).map((o) => o.prix))
}

async function liste(req: Request, filtre: Parameters<typeof annonces>[0]) {
  const n = numeroPage(req)
  const f = lireFiltres(req)
  if (!f.actif) {
    const res = await annonces({ ...filtre, limite: PAR_PAGE + 1, decalage: (n - 1) * PAR_PAGE })
    return { page: n, annonces: res.slice(0, PAR_PAGE), suivante: res.length > PAR_PAGE, filtres: f }
  }
  let res = await annonces({ ...filtre, ...(f.prime ? { prime: true } : {}), limite: 2000 })
  if (f.min != null) res = res.filter((a) => prixDe(a) >= f.min!)
  if (f.max != null) res = res.filter((a) => prixDe(a) <= f.max!)
  if (f.note4) res = res.filter((a) => (a.avis?.moyenne ?? 0) >= 4)
  if (f.tri === 'prix-asc') res.sort((a, b) => prixDe(a) - prixDe(b))
  if (f.tri === 'prix-desc') res.sort((a, b) => prixDe(b) - prixDe(a))
  if (f.tri === 'notes') res.sort((a, b) => (b.avis?.moyenne ?? 0) * Math.log(1 + (b.avis?.nombre ?? 0)) - (a.avis?.moyenne ?? 0) * Math.log(1 + (a.avis?.nombre ?? 0)))
  const debut = (n - 1) * PAR_PAGE
  // Une page filtrée n'est pas indexée : c'est une vue, pas un contenu.
  return { page: n, annonces: res.slice(debut, debut + PAR_PAGE), suivante: res.length > debut + PAR_PAGE, filtres: f, indexable: false }
}

function html(res: Response, corps: string, cache = 300) {
  res.set('Cache-Control', `public, max-age=${cache}`)
  res.type('html').send(corps)
}

marketRouter.get(
  '/',
  page(async (req, res) => {
    const [l, { rayons: r }, vedettes] = await Promise.all([liste(req, {}), arbreMarket(), vedettesDuMarket()])
    html(
      res,
      pageListe({
        base: req.baseUrl,
        accueil: true,
        vedettes: l.page === 1 ? vedettes : [],
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
    const shop = await prisma.shop.findUnique({ where: { slug: req.params.slug }, select: { name: true, slug: true, siteUrl: true } })
    if (!shop) return res.status(404).type('html').send(pageMessage(req.baseUrl, 'Vendeur introuvable', "Cette boutique n'est pas (ou plus) sur DropShop Market."))
    const [l, { rayons: r }] = await Promise.all([liste(req, { shopSlug: shop.slug! }), arbreMarket()])
    html(
      res,
      pageListe({
        base: req.baseUrl,
        titre: `${shop.name} sur DropShop Market`,
        h1: shop.name,
        intro: 'Tous les produits de cette boutique sur DropShop Market.',
        boutique: boutiqueUrlDe(shop) ? { nom: shop.name, url: boutiqueUrlDe(shop)! } : undefined,
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
  const [{ rayons: r }, voisins] = await Promise.all([
    arbreMarket(),
    annonce.categorie ? annonces({ categoryIds: [annonce.categorie.id], limite: 9 }) : Promise.resolve([] as Annonce[]),
  ])
  html(res, pageProduit(req.baseUrl, annonce, courante, r, voisins.filter((a) => a.product.id !== annonce.product.id).slice(0, 8)))
}

marketRouter.get('/p/:id', page(ficheProduit))
marketRouter.get('/p/:id/:slug', page(ficheProduit))
marketRouter.get('/p/:id/:slug/:variante', page(ficheProduit))

marketRouter.get('/vendre', (req, res) => html(res, pageVendre(req.baseUrl), 3600))

marketRouter.get(
  '/merci',
  page(async (req, res) => {
    const session = String(req.query.session_id ?? '')
    res.set('Cache-Control', 'no-store')
    if (!/^cs_[A-Za-z0-9_]+$/.test(session)) return res.status(400).type('html').send(pageMessage(req.baseUrl, 'Commande introuvable', 'Le lien de confirmation est incomplet.'))
    const r = await confirmerCommandeMarket(session)
    if (r.paye && req.query.panier === '1') ecrirePanier(req, res, [])
    if (!r.paye) {
      return res.type('html').send(pageMessage(req.baseUrl, 'Paiement en attente', "Stripe ne nous a pas encore confirmé le paiement. Vous recevrez un email dès qu'il le sera.", { libelle: "Retour à l'accueil", href: `${req.baseUrl}/` }))
    }
    const client = await clientConnecte(req)
    const suivi = r.numero ? (client ? `${req.baseUrl}/compte/commandes/${encodeURIComponent(r.numero)}` : `${req.baseUrl}/suivi`) : `${req.baseUrl}/`
    res.type('html').send(
      pageMessage(
        req.baseUrl,
        'Merci pour votre commande !',
        `${r.numero ? `Commande ${r.numero} : votre` : 'Votre'} paiement est confirmé. Chaque vendeur prépare son colis et vous recevrez le numéro de suivi par email. Un email de confirmation vous a été envoyé.`,
        { libelle: r.numero ? 'Suivre ma commande' : 'Continuer mes achats', href: suivi },
      ),
    )
  }),
)

// ——— Référencement : robots, plan du site ———

marketRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400')
  res.send(`User-agent: *\nAllow: /\nDisallow: /recherche\nDisallow: /acheter\nDisallow: /merci\nDisallow: /panier\nDisallow: /commande\nDisallow: /compte\nDisallow: /suivi\n\nSitemap: ${marketUrl()}/sitemap.xml\n`)
})

marketRouter.get(
  '/sitemap.xml',
  page(async (_req, res) => {
    const [liste, { rayons: r }] = await Promise.all([annonces({ limite: 5000 }), arbreMarket()])
    const vendeurs = new Set(liste.map((a) => a.vendeur.slug).filter((s): s is string => Boolean(s)))
    const urls: Array<{ loc: string; lastmod?: Date; image?: string | null }> = [{ loc: '/' }, { loc: '/prime' }, { loc: '/vendre' }, ...['aide', 'contact', 'livraison', 'retours', 'cgv', 'mentions-legales', 'confidentialite'].map((p) => ({ loc: `/${p}` }))]
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
