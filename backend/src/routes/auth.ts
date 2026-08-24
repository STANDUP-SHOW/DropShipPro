import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { signToken, requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { issueToken, consumeToken } from '../services/authTokens.js'
import { sendMail, appUrl } from '../services/mailer.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const authRouter = Router()

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

authRouter.post('/register', rateLimit({ name: 'register', windowMs: 3600_000, max: 5 }), async (req, res) => {
  const parsed = credsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email ou mot de passe invalide (8 caractères min.)' })

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' })

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  // No shop is created here. Plenty of sellers only work through marketplaces
  // and never run a site of their own; handing them a "Ma boutique" they did not
  // ask for suggests they are missing a step they are not. A shop appears the
  // first time one is actually needed — see resolveShopId in routes/products.ts.
  const user = await prisma.user.create({ data: { email: parsed.data.email, passwordHash } })

  // The account is usable straight away; confirming the address is a follow-up
  // step, so a mail outage never blocks a sign-up.
  await sendVerificationEmail(user.id, user.email).catch((err) =>
    console.error('email de vérification non envoyé', err),
  )

  res.status(201).json({ token: signToken(user.id), user: { id: user.id, email: user.email } })
})

async function sendVerificationEmail(userId: string, email: string) {
  const token = await issueToken(userId, 'EMAIL_VERIFICATION')
  await sendMail({
    to: email,
    subject: 'Confirmez votre adresse email',
    heading: 'Bienvenue sur DropShip Pro',
    body: "Confirmez votre adresse pour sécuriser votre compte et pouvoir réinitialiser votre mot de passe en cas d'oubli.",
    actionLabel: 'Confirmer mon adresse',
    actionUrl: `${appUrl()}/verify-email?token=${token}`,
    footer: 'Ce lien est valable 24 heures.',
  })
}

authRouter.post('/login', rateLimit({ name: 'login', windowMs: 900_000, max: 15 }), async (req, res) => {
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
  res.json({
    id: user.id,
    email: user.email,
    shopName: user.shopName,
    watermarkText: user.watermarkText,
    emailVerified: Boolean(user.emailVerifiedAt),
    shopKey: user.shopKey,
    controlAgent: user.controlAgent,
  })
})

/* ---------------------------------------------------------------- *
 * Mot de passe oublié
 * ---------------------------------------------------------------- */

authRouter.post('/password/forgot', rateLimit({ name: 'forgot', windowMs: 3600_000, max: 5 }), async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
  // Always answer the same thing, valid address or not: a differing response
  // would let anyone test which emails have an account here.
  const generic = { ok: true, message: 'Si un compte existe pour cette adresse, un email vient d\'être envoyé.' }
  if (!parsed.success) return res.json(generic)

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user) return res.json(generic)

  try {
    const token = await issueToken(user.id, 'PASSWORD_RESET')
    await sendMail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      heading: 'Réinitialisez votre mot de passe',
      body: "Vous avez demandé un nouveau mot de passe pour votre compte DropShip Pro. Ce lien ne fonctionne qu'une seule fois.",
      actionLabel: 'Choisir un nouveau mot de passe',
      actionUrl: `${appUrl()}/reset-password?token=${token}`,
      footer: "Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
    })
  } catch (err) {
    console.error('email de réinitialisation non envoyé', err)
  }

  res.json(generic)
})

authRouter.post('/password/reset', async (req, res) => {
  const parsed = z
    .object({ token: z.string().min(10), password: z.string().min(8) })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum)' })

  const userId = await consumeToken(parsed.data.token, 'PASSWORD_RESET')
  if (!userId) return res.status(400).json({ error: 'Ce lien est invalide, expiré ou déjà utilisé' })

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email } })
})

/* ---------------------------------------------------------------- *
 * Changement de mot de passe (connecté)
 * ---------------------------------------------------------------- */

authRouter.post('/password/change', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Nouveau mot de passe trop court (8 caractères minimum)' })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' })
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l\'actuel' })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  })

  // A password change is exactly when a pending reset link must stop working.
  await prisma.authToken.deleteMany({ where: { userId: user.id, type: 'PASSWORD_RESET' } })

  res.json({ ok: true })
})

/* ---------------------------------------------------------------- *
 * Vérification d'adresse email
 * ---------------------------------------------------------------- */

authRouter.post('/email/verify', async (req, res) => {
  const parsed = z.object({ token: z.string().min(10) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Lien invalide' })

  const userId = await consumeToken(parsed.data.token, 'EMAIL_VERIFICATION')
  if (!userId) return res.status(400).json({ error: 'Ce lien est invalide, expiré ou déjà utilisé' })

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
  res.json({ ok: true })
})

authRouter.post('/email/resend', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true })

  try {
    await sendVerificationEmail(user.id, user.email)
  } catch (err) {
    console.error('renvoi du mail de vérification impossible', err)
    return res.status(502).json({ error: "L'email n'a pas pu être envoyé, réessayez plus tard" })
  }
  res.json({ ok: true })
})
