import { Router } from 'express'
import { z } from 'zod'
import archiver from 'archiver'
import multer from 'multer'
import path from 'path'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { scrapeProduct, ScrapeBlockedError } from '../services/scraper.js'
import { enhanceListing, extractVariants } from '../services/aiEnhancer.js'
import { watermarkImages, watermarkUploads, type WatermarkOptions, type WatermarkPosition } from '../services/watermark.js'
import type { User } from '@prisma/client'
import { publishToPlatform } from '../services/publisher.js'
import { mapCategory } from '../services/categoryMapping.js'
import { CATEGORY_CATALOG, guessCategoryId } from '../services/categoryCatalog.js'
import { BATCH_PLATFORM_IDS, PLATFORMS, PLATFORM_IDS } from '../services/platforms.js'
import { buildFillPlan } from '../services/formFiller.js'
import { apiBaseUrl } from '../lib/urls.js'

export const productsRouter = Router()
productsRouter.use(requireAuth)

/** Reads the shop's watermark settings; the logo wins over the text when present. */
function watermarkOptionsFor(user: User): WatermarkOptions {
  return {
    text: user.watermarkText || user.shopName || 'DropShip Pro',
    imagePath: user.watermarkImage,
    scale: user.watermarkScale,
    opacity: user.watermarkOpacity,
    position: user.watermarkPosition as WatermarkPosition,
  }
}

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
    const watermarked = await watermarkImages(scraped.images, watermarkOptionsFor(user), enhanced.title)

    const product = await prisma.product.create({
      data: {
        userId: req.userId!,
        sourceUrl: parsed.data.url,
        sourceSite: scraped.sourceSite,
        sourceCategory: scraped.sourceCategory,
        categoryId: guessCategoryId(scraped.sourceCategory) ?? guessCategoryId(scraped.title),
        title: scraped.title,
        description: scraped.description,
        aiTitle: enhanced.title,
        aiDescription: enhanced.description,
        price: scraped.price,
        sellingPrice: scraped.price * 1.5,
        currency: scraped.currency,
        images: watermarked.length ? watermarked : scraped.images,
        metaTitle: enhanced.metaTitle,
        metaDescription: enhanced.metaDescription,
        metaKeywords: enhanced.metaKeywords,
        bulletPoints: enhanced.bulletPoints,
        attributes: enhanced.attributes,
        status: 'READY',
      },
    })
    res.status(201).json(product)
  } catch (err) {
    console.error(err)
    if (err instanceof ScrapeBlockedError) {
      return res.status(422).json({ error: err.message })
    }
    res.status(502).json({ error: "Impossible d'importer ce produit depuis l'URL fournie" })
  }
})

const captureSchema = z.object({
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  description: z.string().default(''),
  price: z.number().default(0),
  currency: z.string().default('EUR'),
  images: z.array(z.string().url()).default([]),
  sourceCategory: z.string().nullable().default(null),
  variants: z.any().optional(),
  pageText: z.string().max(6000).optional(),
})

// Import from the Chrome extension: the page is already rendered in the user's
// browser, so price, gallery and variants arrive filled in — the things the
// server-side scraper can't reach on Temu/JoyBuy. Everything after that (AI
// remix, watermark, category guess) is the same pipeline as /import.
productsRouter.post('/capture', async (req: AuthedRequest, res) => {
  const parsed = captureSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Données de produit invalides' })

  const data = parsed.data
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
    const enhanced = await enhanceListing({
      title: data.title,
      description: data.description,
      category: data.sourceCategory,
    })
    const watermarked = await watermarkImages(data.images, watermarkOptionsFor(user), enhanced.title)

    // The extension rarely finds the option pickers by structure, so the model
    // reads them from the page text instead.
    const variants =
      data.variants ?? (data.pageText ? await extractVariants(data.pageText) : null)

    const product = await prisma.product.create({
      data: {
        userId: req.userId!,
        sourceUrl: data.sourceUrl,
        sourceSite: new URL(data.sourceUrl).hostname.replace('www.', ''),
        sourceCategory: data.sourceCategory,
        categoryId: guessCategoryId(data.sourceCategory) ?? guessCategoryId(data.title),
        title: data.title,
        description: data.description,
        aiTitle: enhanced.title,
        aiDescription: enhanced.description,
        price: data.price,
        sellingPrice: data.price * 1.5,
        currency: data.currency,
        images: watermarked.length ? watermarked : data.images,
        variants: variants ?? undefined,
        metaTitle: enhanced.metaTitle,
        metaDescription: enhanced.metaDescription,
        metaKeywords: enhanced.metaKeywords,
        bulletPoints: enhanced.bulletPoints,
        attributes: enhanced.attributes,
        status: 'READY',
      },
    })
    res.status(201).json(product)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Impossible d'enregistrer ce produit" })
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
      const watermarked = await watermarkImages(scraped.images, watermarkOptionsFor(user), enhanced.title)

      const product = await prisma.product.create({
        data: {
          userId: req.userId!,
          sourceUrl: url,
          sourceSite: scraped.sourceSite,
          sourceCategory: scraped.sourceCategory,
        categoryId: guessCategoryId(scraped.sourceCategory) ?? guessCategoryId(scraped.title),
          title: scraped.title,
          description: scraped.description,
          aiTitle: enhanced.title,
          aiDescription: enhanced.description,
          price: scraped.price,
          sellingPrice: scraped.price * 1.5,
          currency: scraped.currency,
          images: watermarked.length ? watermarked : scraped.images,
          metaTitle: enhanced.metaTitle,
          metaDescription: enhanced.metaDescription,
          metaKeywords: enhanced.metaKeywords,
        bulletPoints: enhanced.bulletPoints,
        attributes: enhanced.attributes,
          status: 'READY',
        },
      })
      results.push({ url, ok: true, product })
    } catch (err) {
      console.error(`import-batch failed for ${url}`, err)
      results.push({
        url,
        ok: false,
        error:
          err instanceof ScrapeBlockedError
            ? err.message
            : "Échec de l'import (URL inaccessible ou page non reconnue)",
      })
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
  shippingCost: z.number().optional(),
  sellingPrice: z.number().optional(),
  markupPercent: z.number().optional(),
  images: z.array(z.string()).optional(),
  variants: z.any().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  bulletPoints: z.array(z.string()).optional(),
  attributes: z.record(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
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
  platforms: z.array(z.enum(PLATFORM_IDS)).min(1),
})

productsRouter.post('/:id/publish', async (req: AuthedRequest, res) => {
  const parsed = publishSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélectionnez au moins une plateforme' })

  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })

  const base = apiBaseUrl(req)
  const publications = await Promise.all(parsed.data.platforms.map((p) => publishToPlatform(owned.id, p, base)))
  // A product whose every destination failed (a refused Shopify token, say) must
  // not be shown as published.
  if (publications.some((p) => p.status !== 'FAILED')) {
    await prisma.product.update({ where: { id: owned.id }, data: { status: 'PUBLISHED' } })
  }
  res.json(publications)
})

const publishBatchSchema = z.object({
  productIds: z.array(z.string()).min(1).max(200),
  // Only API destinations: the extension publishes one browser tab at a time and
  // waits for the seller to press « Publier » himself, which cannot be batched.
  platforms: z.array(z.enum(BATCH_PLATFORM_IDS)).min(1),
})

/**
 * Publishes many listings at once — the "sélectionner puis publier en lot" flow.
 *
 * Runs sequentially on purpose: a hundred selected products would otherwise fire a
 * hundred simultaneous Shopify calls and hit their rate limit. Each result is
 * returned individually so the seller sees exactly what went through.
 */
productsRouter.post('/publish-batch', async (req: AuthedRequest, res) => {
  const parsed = publishBatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: "Sélectionnez au moins une annonce et une plateforme connectable par API.",
    })
  }

  const { productIds, platforms } = parsed.data
  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, userId: req.userId! },
    select: { id: true, title: true, aiTitle: true },
  })
  if (!owned.length) return res.status(404).json({ error: 'Aucune de ces annonces ne vous appartient' })

  const base = apiBaseUrl(req)
  const results: Array<{
    productId: string
    title: string
    platform: string
    status: string
    error: string | null
    externalUrl: string | null
  }> = []

  for (const product of owned) {
    let anyOk = false
    for (const platform of platforms) {
      try {
        const publication = await publishToPlatform(product.id, platform, base)
        if (publication.status !== 'FAILED') anyOk = true
        results.push({
          productId: product.id,
          title: product.aiTitle || product.title,
          platform,
          status: publication.status,
          error: publication.error,
          externalUrl: publication.externalUrl,
        })
      } catch (e) {
        // One unexpected failure must not abort the rest of the batch.
        console.error('publication en lot', product.id, platform, e)
        results.push({
          productId: product.id,
          title: product.aiTitle || product.title,
          platform,
          status: 'FAILED',
          error: e instanceof Error ? e.message : 'Publication impossible',
          externalUrl: null,
        })
      }
    }
    if (anyOk) await prisma.product.update({ where: { id: product.id }, data: { status: 'PUBLISHED' } })
  }

  res.json({
    results,
    published: results.filter((r) => r.status === 'PUBLISHED').length,
    pending: results.filter((r) => r.status === 'PENDING').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    missing: productIds.filter((id) => !owned.some((p) => p.id === id)).length,
  })
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
  const platforms = PLATFORM_IDS
  res.json(Object.fromEntries(platforms.map((p) => [p, mapCategory(product.sourceCategory, p, product.categoryId)])))
})

/** The category taxonomy that powers the dropdown in the back office. */
productsRouter.get('/meta/categories', (_req, res) => {
  res.json(CATEGORY_CATALOG.map(({ id, group, label }) => ({ id, group, label })))
})

// Photos the seller adds by hand: their own shots, or a rescue when the
// extension fails to find the gallery on a hostile supplier page.
const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpe?g|png|webp|avif)$/.test(file.mimetype)),
}).array('photos', 10)

productsRouter.post('/:id/images', (req: AuthedRequest, res) => {
  uploadPhotos(req, res, async (err) => {
    if (err) {
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({ error: tooBig ? 'Photo trop lourde (8 Mo maximum)' : 'Envoi impossible' })
    }
    const files = (req.files as Express.Multer.File[]) ?? []
    if (!files.length) return res.status(400).json({ error: 'Sélectionnez au moins une image (JPEG, PNG ou WebP)' })

    const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
    if (!product) return res.status(404).json({ error: 'Produit introuvable' })

    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
      const existing = (product.images as string[]) ?? []
      const room = Math.max(0, 10 - existing.length)
      if (!room) return res.status(400).json({ error: 'Cette annonce a déjà 10 photos' })

      const saved = await watermarkUploads(
        files.slice(0, room).map((f) => f.buffer),
        watermarkOptionsFor(user),
        product.aiTitle || product.title,
        existing.length,
      )

      const images = [...existing, ...saved]
      await prisma.product.update({ where: { id: product.id }, data: { images } })
      res.json({ images, added: saved.length })
    } catch (e) {
      console.error('ajout de photos impossible', e)
      res.status(500).json({ error: "Ces images n'ont pas pu être traitées" })
    }
  })
})

const fillPlanSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  fields: z
    .array(
      z.object({
        ref: z.string(),
        label: z.string(),
        type: z.string(),
        placeholder: z.string().optional(),
        required: z.boolean().optional(),
        maxLength: z.number().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(120),
})

/**
 * The extension describes the marketplace form it found; Claude maps the product
 * onto it and returns what to type where. This is what lets one extension fill
 * any marketplace without a hand-written selector map per site.
 */
productsRouter.post('/:id/fill-plan', async (req: AuthedRequest, res) => {
  const parsed = fillPlanSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Description du formulaire invalide' })

  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  try {
    const targetCategory = mapCategory(product.sourceCategory, parsed.data.platform, product.categoryId)
    const plan = await buildFillPlan(product, parsed.data.platform, targetCategory, parsed.data.fields)
    res.json(plan)
  } catch (err) {
    console.error('fill-plan failed', err)
    res.status(502).json({ error: "L'IA n'a pas pu analyser ce formulaire" })
  }
})

/** Destination marketplaces, so the back office and extension share one list. */
productsRouter.get('/meta/platforms', (_req, res) => {
  res.json(PLATFORMS)
})
