import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const publicRouter = Router()

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
