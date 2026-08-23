import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { saveWatermarkLogo } from '../services/watermark.js'
import { normalizeShopDomain } from '../services/shopify.js'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

const profileSchema = z.object({
  shopName: z.string().optional(),
  watermarkText: z.string().optional(),
  watermarkScale: z.number().int().min(5).max(60).optional(),
  watermarkOpacity: z.number().int().min(10).max(100).optional(),
  watermarkPosition: z
    .enum(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'center'])
    .optional(),
})

settingsRouter.patch('/profile', async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })
  const user = await prisma.user.update({ where: { id: req.userId! }, data: parsed.data })
  res.json({ id: user.id, email: user.email, shopName: user.shopName, watermarkText: user.watermarkText, watermarkImage: user.watermarkImage, watermarkScale: user.watermarkScale, watermarkOpacity: user.watermarkOpacity, watermarkPosition: user.watermarkPosition, shopKey: user.shopKey })
})

// JPEG is accepted now that a flat light background is cleared on upload: most
// sellers only have their logo as a JPEG, and refusing it sent them away.
const ACCEPTED_LOGO = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ACCEPTED_LOGO.includes(file.mimetype))
  },
}).single('logo')

settingsRouter.put('/watermark-logo', (req: AuthedRequest, res) => {
  uploadLogo(req, res, async (err) => {
    if (err) {
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({ error: tooBig ? 'Fichier trop lourd (2 Mo maximum)' : "Envoi impossible" })
    }
    if (!req.file) return res.status(400).json({ error: 'Envoyez une image de logo (PNG, SVG, JPEG ou WebP)' })

    try {
      const watermarkImage = await saveWatermarkLogo(req.file.buffer, req.file.mimetype)
      await prisma.user.update({ where: { id: req.userId! }, data: { watermarkImage } })
      res.json({ watermarkImage })
    } catch (e) {
      console.error('logo de filigrane illisible', e)
      res.status(400).json({ error: "Ce fichier n'a pas pu être lu comme une image" })
    }
  })
})

settingsRouter.delete('/watermark-logo', async (req: AuthedRequest, res) => {
  // The file itself is left on disk: older products still reference it.
  await prisma.user.update({ where: { id: req.userId! }, data: { watermarkImage: null } })
  res.json({ ok: true })
})

settingsRouter.get('/credentials', async (req: AuthedRequest, res) => {
  const creds = await prisma.platformCredential.findMany({ where: { userId: req.userId! } })
  res.json(
    creds.map((c) => ({
      id: c.id,
      platform: c.platform,
      label: c.label,
      connected: c.connected,
      // Enough to show *which* shop is connected, never the token itself.
      hint: shopDomainOf(c.data),
    })),
  )
})

function shopDomainOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const domain = (data as Record<string, unknown>).shopDomain
  return typeof domain === 'string' ? domain : null
}

const credSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  label: z.string().optional(),
  data: z.record(z.string()).default({}),
})

// Stores platform API credentials (e.g. eBay OAuth token) once the user has them.
// `connected` flips to true only once real credentials are saved — that's the
// signal publisher.ts / orders webhooks use to know a platform is live vs. stubbed.
settingsRouter.put('/credentials', async (req: AuthedRequest, res) => {
  const parsed = credSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  let data = parsed.data.data

  // Shopify is the one destination that really publishes, so its credentials are
  // checked here rather than discovered as a failure at publication time.
  if (parsed.data.platform === 'SHOPIFY' && Object.keys(data).length > 0) {
    const shopDomain = normalizeShopDomain(data.shopDomain ?? '')
    const accessToken = (data.accessToken ?? '').trim()
    if (!shopDomain) {
      return res.status(400).json({
        error: "Adresse de boutique invalide : attendu quelque chose comme ma-boutique.myshopify.com",
      })
    }
    if (!accessToken) return res.status(400).json({ error: "Collez le jeton d'accès de l'app personnalisée" })
    if (!/^shpat_/.test(accessToken)) {
      return res.status(400).json({
        error: "Ce jeton ne ressemble pas à un jeton d'accès Admin (il commence par shpat_).",
      })
    }
    data = { shopDomain, accessToken }
  }

  const cred = await prisma.platformCredential.upsert({
    where: { userId_platform: { userId: req.userId!, platform: parsed.data.platform } },
    create: { ...parsed.data, data, userId: req.userId!, connected: Object.keys(data).length > 0 },
    update: { ...parsed.data, data, connected: Object.keys(data).length > 0 },
  })
  res.json({ id: cred.id, platform: cred.platform, label: cred.label, connected: cred.connected })
})
