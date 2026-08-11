import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { saveWatermarkLogo } from '../services/watermark.js'

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

// PNG for transparency, SVG for a crisp mark at any size. JPEG is refused on
// purpose: it has no alpha channel, so it would paste an opaque rectangle.
const ACCEPTED_LOGO = ['image/png', 'image/svg+xml']

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
    if (!req.file) return res.status(400).json({ error: 'Envoyez un fichier PNG à fond transparent ou SVG' })

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
  res.json(creds.map((c) => ({ id: c.id, platform: c.platform, label: c.label, connected: c.connected })))
})

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

  const cred = await prisma.platformCredential.upsert({
    where: { userId_platform: { userId: req.userId!, platform: parsed.data.platform } },
    create: { ...parsed.data, userId: req.userId!, connected: Object.keys(parsed.data.data).length > 0 },
    update: { ...parsed.data, connected: Object.keys(parsed.data.data).length > 0 },
  })
  res.json({ id: cred.id, platform: cred.platform, label: cred.label, connected: cred.connected })
})
