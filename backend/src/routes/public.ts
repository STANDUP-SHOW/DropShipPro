import { Router } from 'express'
import archiver from 'archiver'
import path from 'path'
import { existsSync } from 'fs'
import type { Product } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

export const publicRouter = Router()

// Packages the Chrome extension folder on the fly so the app can offer it as a
// download. Unauthenticated on purpose: it's just client code, and a plain <a>
// link can't carry the Bearer token.
publicRouter.get('/extension.zip', async (_req, res) => {
  const extensionDir = path.resolve('..', 'extension')
  if (!existsSync(extensionDir)) {
    return res.status(404).json({ error: 'Extension introuvable sur le serveur' })
  }

  res.attachment('dropshipper-ia-extension.zip')
  const archive = archiver('zip')
  archive.on('error', () => res.destroy())
  archive.pipe(res)
  archive.directory(extensionDir, false)
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
 * Shape returned to a storefront.
 *
 * `price` is the selling price, never the supplier cost: a shop wiring itself to
 * this feed would otherwise sell everything at what it paid for it.
 */
function toCatalogItem(product: Product, category: string | null) {
  return {
    id: product.id,
    title: product.aiTitle || product.title,
    description: product.aiDescription || product.description,
    price: Number(product.sellingPrice),
    currency: product.currency,
    images: product.images,
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
  const shop = await prisma.user.findUnique({ where: { shopKey: req.params.shopKey } })
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })

  const publications = await prisma.publication.findMany({
    where: { platform: 'OWN_SITE', status: 'PUBLISHED', product: { userId: shop.id } },
    include: { product: true },
    orderBy: { publishedAt: 'desc' },
  })

  // Cached briefly: a storefront may call this on every page view.
  res.set('Cache-Control', 'public, max-age=60')
  res.json({
    shop: { name: shop.shopName ?? 'Ma boutique' },
    count: publications.length,
    products: publications.map((p) => toCatalogItem(p.product, p.targetCategory)),
  })
})

publicRouter.get('/shops/:shopKey/products/:id', async (req, res) => {
  const shop = await prisma.user.findUnique({ where: { shopKey: req.params.shopKey } })
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })

  const publication = await prisma.publication.findFirst({
    where: {
      productId: req.params.id,
      platform: 'OWN_SITE',
      status: 'PUBLISHED',
      product: { userId: shop.id },
    },
    include: { product: true },
  })
  if (!publication) return res.status(404).json({ error: 'Produit introuvable' })

  res.set('Cache-Control', 'public, max-age=60')
  res.json(toCatalogItem(publication.product, publication.targetCategory))
})
