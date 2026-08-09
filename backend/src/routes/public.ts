import { Router } from 'express'
import archiver from 'archiver'
import path from 'path'
import { existsSync } from 'fs'
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

  res.attachment('dropship-pro-extension.zip')
  const archive = archiver('zip')
  archive.on('error', () => res.destroy())
  archive.pipe(res)
  archive.directory(extensionDir, false)
  await archive.finalize()
})

// Headless catalog API for the user's own future storefront ("mon site - que je
// vais créer pour ça"): no auth required, only exposes products published to OWN_SITE.
publicRouter.get('/products', async (_req, res) => {
  const publications = await prisma.publication.findMany({
    where: { platform: 'OWN_SITE', status: 'PUBLISHED' },
    include: { product: true },
    orderBy: { publishedAt: 'desc' },
  })
  res.json(
    publications.map((p) => ({
      id: p.product.id,
      title: p.product.aiTitle || p.product.title,
      description: p.product.aiDescription || p.product.description,
      price: p.product.price,
      currency: p.product.currency,
      images: p.product.images,
      variants: p.product.variants,
      metaTitle: p.product.metaTitle,
      metaDescription: p.product.metaDescription,
      metaKeywords: p.product.metaKeywords,
      category: p.targetCategory,
    })),
  )
})

publicRouter.get('/products/:id', async (req, res) => {
  const publication = await prisma.publication.findFirst({
    where: { productId: req.params.id, platform: 'OWN_SITE', status: 'PUBLISHED' },
    include: { product: true },
  })
  if (!publication) return res.status(404).json({ error: 'Produit introuvable' })
  const p = publication.product
  res.json({
    id: p.id,
    title: p.aiTitle || p.title,
    description: p.aiDescription || p.description,
    price: p.price,
    currency: p.currency,
    images: p.images,
    variants: p.variants,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    metaKeywords: p.metaKeywords,
  })
})
