import { Router } from 'express'
import { imagesPourExport } from '../services/exportImages.js'
import archiver from 'archiver'
import path from 'path'
import { existsSync } from 'fs'
import type { Product } from '@prisma/client'
import { metaCsv, googleRss } from '../services/productFeeds.js'
import { prisma } from '../lib/prisma.js'

export const publicRouter = Router()

// Packages the Chrome extension folder on the fly so the app can offer it as a
// download. Unauthenticated on purpose: it's just client code, and a plain <a>
// link can't carry the Bearer token.
/**
 * Where the extension folder can be, depending on who is running the API.
 *
 * Railway deploys with the service root set to backend/, so the repository's
 * top-level extension/ is simply absent from the container and ../extension
 * resolves to nothing — which is why the download returned a 404 in production.
 */
const EXTENSION_DIRS = ['extension', path.join('..', 'extension'), path.join('..', '..', 'extension')]

/** Scripts de contrôle et de fabrication : utiles au dépôt, inutiles dans Chrome. */
const EXTENSION_TOOLING = ['check.cjs', 'build-store-zip.cjs', 'README.md']

function findExtensionDir(): string | null {
  return EXTENSION_DIRS.map((dir) => path.resolve(dir)).find((dir) => existsSync(dir)) ?? null
}

publicRouter.get('/extension.zip', async (_req, res) => {
  const extensionDir = findExtensionDir()
  if (!extensionDir) {
    // Logged with the paths tried: a bare « introuvable » says nothing about
    // which deployment layout the server actually has.
    console.error('extension introuvable, cherchee dans', EXTENSION_DIRS.map((d) => path.resolve(d)))
    return res.status(404).json({
      error: "L'extension n'est pas disponible sur ce serveur. Contactez le support.",
    })
  }

  res.attachment('dropshipper-ia-extension.zip')
  const archive = archiver('zip')
  archive.on('error', () => res.destroy())
  archive.pipe(res)
  // L'outillage reste au dépôt : le vendeur charge un dossier, pas un atelier.
  archive.glob('**/*', { cwd: extensionDir, ignore: EXTENSION_TOOLING })
  await archive.finalize()
})

/**
 * Tells the extension where the app lives.
 *
 * Without this it kept its localhost default, so after an import it opened a tab
 * on an address that doesn't exist on the user's machine and the listing never
 * appeared. The server already knows the answer through FRONTEND_URL, so nobody
 * has to configure it by hand.
 */
publicRouter.get('/config', (_req, res) => {
  const appUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '')
  res.set('Cache-Control', 'public, max-age=300')
  res.json({ appUrl })
})

/**
 * Published reviews, newest first.
 *
 * Public and unauthenticated: the home page and the reviews page are read by
 * visitors who have no account. Only what is meant to be shown is selected — the
 * email and the account id never leave the server.
 */
publicRouter.get('/reviews', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const reviews = await prisma.review.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, displayName: true, rating: true, comment: true, createdAt: true },
  })

  const all = await prisma.review.findMany({ where: { published: true }, select: { rating: true } })
  const average = all.length ? all.reduce((sum, r) => sum + r.rating, 0) / all.length : null

  res.set('Cache-Control', 'public, max-age=60')
  res.json({ reviews, count: all.length, average })
})

/**
 * Shape returned to a storefront.
 *
 * `price` is the selling price, never the supplier cost: a shop wiring itself to
 * this feed would otherwise sell everything at what it paid for it.
 */
async function toCatalogItem(product: Product, category: string | null) {
  return {
    id: product.id,
    title: product.aiTitle || product.title,
    description: product.aiDescription || product.description,
    price: Number(product.sellingPrice),
    currency: product.currency,
    // Le flux sert les photos marquees : c est une sortie de DropShipper au
    // meme titre qu une publication, et le filigrane se pose au depart.
    images: await imagesPourExport(product),
    variants: product.variants ?? null,
    bulletPoints: product.bulletPoints ?? [],
    attributes: product.attributes ?? {},
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    metaKeywords: product.metaKeywords,
    category,
    updatedAt: product.updatedAt,
  }
}

/**
 * Headless catalog for a merchant's own storefront.
 *
 * Scoped by shopKey: without it the feed returned every account's products, so
 * two merchants using the app would each display the other's catalogue.
 */
publicRouter.get('/shops/:shopKey/products', async (req, res) => {
  // Keys created before shops existed were carried over onto the account's first
  // shop, so an address already wired into a site keeps answering.
  const shop = await prisma.shop.findUnique({ where: { shopKey: req.params.shopKey } })
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })

  const publications = await prisma.publication.findMany({
    where: { platform: 'OWN_SITE', status: 'PUBLISHED', product: { shopId: shop.id } },
    include: { product: true },
    orderBy: { publishedAt: 'desc' },
  })

  // Cached briefly: a storefront may call this on every page view.
  res.set('Cache-Control', 'public, max-age=60')
  res.json({
    shop: { name: shop.name },
    count: publications.length,
    products: await Promise.all(
      publications.map((p) => toCatalogItem(p.product, p.targetCategory)),
    ),
  })
})

publicRouter.get('/shops/:shopKey/products/:id', async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { shopKey: req.params.shopKey } })
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })

  const publication = await prisma.publication.findFirst({
    where: {
      productId: req.params.id,
      platform: 'OWN_SITE',
      status: 'PUBLISHED',
      product: { shopId: shop.id },
    },
    include: { product: true },
  })
  if (!publication) return res.status(404).json({ error: 'Produit introuvable' })

  res.set('Cache-Control', 'public, max-age=60')
  res.json(await toCatalogItem(publication.product, publication.targetCategory))
})

/**
 * Les flux produits que Meta et Google viennent lire eux-mêmes.
 *
 * Instagram n'accepte pas qu'on lui « publie » une annonce : sa boutique et
 * celle de Facebook s'alimentent du catalogue Meta, rempli par un flux relu
 * plusieurs fois par jour. Le vendeur colle l'adresse une fois dans Commerce
 * Manager, et tout ce qu'il publie sur « Mon site » y remonte ensuite tout seul.
 */
async function feedItems(shopKey: string) {
  const shop = await prisma.shop.findUnique({ where: { shopKey } })
  if (!shop) return null

  const publications = await prisma.publication.findMany({
    where: { platform: 'OWN_SITE', status: 'PUBLISHED', product: { shopId: shop.id } },
    include: { product: true },
    orderBy: { publishedAt: 'desc' },
    take: 5000,
  })

  return {
    shop,
    items: publications.map((p) => ({ product: p.product, category: p.targetCategory })),
  }
}

publicRouter.get('/shops/:shopKey/feed/meta.csv', async (req, res) => {
  const data = await feedItems(req.params.shopKey)
  if (!data) return res.status(404).json({ error: 'Boutique introuvable' })

  // Meta relit le flux quelques fois par jour : un cache d'une heure suffit
  // largement et évite de recalculer à chaque passage de leur robot.
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('text/csv; charset=utf-8')
  res.send(metaCsv(data.items, data.shop.shopKey, data.shop.name))
})

publicRouter.get('/shops/:shopKey/feed/google.xml', async (req, res) => {
  const data = await feedItems(req.params.shopKey)
  if (!data) return res.status(404).json({ error: 'Boutique introuvable' })

  res.set('Cache-Control', 'public, max-age=3600')
  res.type('application/xml; charset=utf-8')
  res.send(googleRss(data.items, data.shop.shopKey, data.shop.name, data.shop.name))
})
