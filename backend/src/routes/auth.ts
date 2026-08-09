import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { signToken, requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const authRouter = Router()

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

authRouter.post('/register', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email ou mot de passe invalide (8 caractères min.)' })

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' })

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  const user = await prisma.user.create({ data: { email: parsed.data.email, passwordHash } })

  res.status(201).json({ token: signToken(user.id), user: { id: user.id, email: user.email } })
})

authRouter.post('/login', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email ou mot de passe invalide' })

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' })
  }

  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email } })
})

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  res.json({ id: user.id, email: user.email, shopName: user.shopName, watermarkText: user.watermarkText })
})
