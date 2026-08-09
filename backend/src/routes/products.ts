import { Router } from 'express'
import { z } from 'zod'
import archiver from 'archiver'
import path from 'path'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { scrapeProduct } from '../services/scraper.js'
import { enhanceListing } from '../services/aiEnhancer.js'
import { watermarkImages } from '../services/watermark.js'
import { publishToPlatform } from '../services/publisher.js'
import { mapCategory } from '../services/categoryMapping.js'

export const productsRouter = Router()
productsRouter.use(requireAuth)

const importSchema = z.object({ url: z.string().url() })

// Paste any product URL: scrape it, remix the copy with AI, watermark the photos,
// and land it in the back office as a DRAFT the user reviews before publishing.
productsRouter.post('/import', async (req: AuthedRequest, res) => {
  const parsed = importSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'URL invalide' })

  try {
    const scraped = await scrapeProduct(parsed.data.url)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
    const enhanced = await enhanceListing({
      title: scraped.title,
      description: scraped.description,
      category: scraped.sourceCategory,
    })
    const watermarked = await watermarkImages(scraped.images, user.watermarkText || user.shopName || 'DropShip Pro')

    const product = await prisma.product.create({
      data: {
        userId: req.userId!,
        sourceUrl: parsed.data.url,
        sourceSite: scraped.sourceSite,
        sourceCategory: scraped.sourceCategory,
        title: scraped.title,
        description: scraped.description,
        aiTitle: enhanced.title,
        aiDescription: enhanced.description,
        price: scraped.price,
        currency: scraped.currency,
        images: watermarked.length ? watermarked : scraped.images,
        metaTitle: enhanced.metaTitle,
        metaDescription: enhanced.metaDescription,
        metaKeywords: enhanced.metaKeywords,
        status: 'READY',
      },
    })
    res.status(201).json(product)
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: "Impossible d'importer ce produit depuis l'URL fournie" })
  }
})

const batchImportSchema = z.object({ urls: z.array(z.string().url()).min(1).max(25) })

// Same pipeline as /import but for up to 25 URLs at once. Processed sequentially
// and each URL succeeds/fails independently so one bad link doesn't drop the batch.
productsRouter.post('/import-batch', async (req: AuthedRequest, res) => {
  const parsed = batchImportSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Envoyez entre 1 et 25 URLs valides' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  const results: Array<{ url: string; ok: boolean; product?: unknown; error?: string }> = []

  for (const url of parsed.data.urls) {
    try {
      const scraped = await scrapeProduct(url)
      const enhanced = await enhanceListing({
        title: scraped.title,
        description: scraped.description,
        category: scraped.sourceCategory,
      })
      const watermarked = await watermarkImages(scraped.images, user.watermarkText || user.shopName || 'DropShip Pro')

      const product = await prisma.product.create({
        data: {
          userId: req.userId!,
          sourceUrl: url,
          sourceSite: scraped.sourceSite,
          sourceCategory: scraped.sourceCategory,
          title: scraped.title,
          description: scraped.description,
          aiTitle: enhanced.title,
          aiDescription: enhanced.description,
          price: scraped.price,
          currency: scraped.currency,
          images: watermarked.length ? watermarked : scraped.images,
          metaTitle: enhanced.metaTitle,
          metaDescription: enhanced.metaDescription,
          metaKeywords: enhanced.metaKeywords,
          status: 'READY',
        },
      })
      results.push({ url, ok: true, product })
    } catch (err) {
      console.error(`import-batch failed for ${url}`, err)
      results.push({ url, ok: false, error: "Échec de l'import (URL inaccessible ou page non reconnue)" })
    }
  }

  res.status(207).json({ results, imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length })
})

productsRouter.get('/', async (req: AuthedRequest, res) => {
  const products = await prisma.product.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { publications: true },
  })
  res.json(products)
})

productsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { publications: true },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })
  res.json(product)
})

const updateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  aiTitle: z.string().optional(),
  aiDescription: z.string().optional(),
  price: z.number().optional(),
  markupPercent: z.number().optional(),
  images: z.array(z.string()).optional(),
  variants: z.any().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
})

productsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })

  const product = await prisma.product.update({ where: { id: req.params.id }, data: parsed.data })
  res.json(product)
})

productsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })
  await prisma.product.delete({ where: { id: req.params.id } })
  res.status(204).send()
})

const publishSchema = z.object({
  platforms: z.array(z.enum(['OWN_SITE', 'LEBONCOIN', 'VINTED', 'EBAY', 'AMAZON'])).min(1),
})

productsRouter.post('/:id/publish', async (req: AuthedRequest, res) => {
  const parsed = publishSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélectionnez au moins une plateforme' })

  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })

  const publications = await Promise.all(parsed.data.platforms.map((p) => publishToPlatform(owned.id, p)))
  await prisma.product.update({ where: { id: owned.id }, data: { status: 'PUBLISHED' } })
  res.json(publications)
})

// Bundles the watermarked photos into a zip for the manual Leboncoin/Vinted flow
// (no API on those platforms, so the user drags these into the native upload widget).
productsRouter.get('/:id/photos.zip', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  res.attachment(`droppost-${product.id}.zip`)
  const archive = archiver('zip')
  archive.pipe(res)

  const images = (product.images as string[]) || []
  images.forEach((img, i) => {
    if (img.startsWith('/storage/')) {
      const filePath = path.resolve(img.replace(/^\//, ''))
      archive.file(filePath, { name: `photo-${i + 1}${path.extname(filePath) || '.jpg'}` })
    }
  })
  await archive.finalize()
})

productsRouter.get('/:id/category-preview', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })
  const platforms = ['OWN_SITE', 'LEBONCOIN', 'VINTED', 'EBAY', 'AMAZON'] as const
  res.json(Object.fromEntries(platforms.map((p) => [p, mapCategory(product.sourceCategory, p)])))
})
