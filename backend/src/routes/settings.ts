import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

const profileSchema = z.object({
  shopName: z.string().optional(),
  watermarkText: z.string().optional(),
})

settingsRouter.patch('/profile', async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })
  const user = await prisma.user.update({ where: { id: req.userId! }, data: parsed.data })
  res.json({ id: user.id, email: user.email, shopName: user.shopName, watermarkText: user.watermarkText })
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
