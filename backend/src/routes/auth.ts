import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { signToken, requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { issueToken, consumeToken } from '../services/authTokens.js'
import { sendMail, appUrl } from '../services/mailer.js'
import { rateLimit } from '../middleware/rateLimit.js'
import {
  verifierIdTokenGoogle,
  googleConfigure,
  GoogleAuthError,
  type GoogleIdentite,
} from '../services/googleAuth.js'

export const authRouter = Router()

// L'email est normalisé (rogné + minuscules) partout où on le lit ou l'écrit :
// Google renvoie l'adresse en minuscules, et sans ça « Max@… » à l'inscription
// et « max@… » via Google créeraient deux comptes distincts.
const emailNormalise = z
  .string()
  .email()
  .transform((e) => e.trim().toLowerCase())

const credsSchema = z.object({
  email: emailNormalise,
  password: z.string().min(8),
})

/** Recherche d'un compte par email, insensible à la casse — couvre les comptes
 *  déjà en base avec une majuscule, que `findUnique` (exact) manquerait. */
function trouverParEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
}

authRouter.post('/register', rateLimit({ name: 'register', windowMs: 3600_000, max: 5 }), async (req, res) => {
  const parsed = credsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email ou mot de passe invalide (8 caractères min.)' })

  const existing = await trouverParEmail(parsed.data.email)
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

  const user = await trouverParEmail(parsed.data.email)
  // Un seul et même message dans les trois cas — email inconnu, compte Google
  // (sans mot de passe), mot de passe faux — pour ne rien révéler de l'existence
  // ni de la méthode d'authentification d'un compte. Le bouton « Continuer avec
  // Google » reste visible sur la page pour orienter sans que le serveur divulgue.
  if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' })
  }

  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email } })
})

/* ---------------------------------------------------------------- *
 * Connexion via Google (Sign in with Google)
 * ---------------------------------------------------------------- */

authRouter.post('/google', rateLimit({ name: 'google', windowMs: 900_000, max: 30 }), async (req, res) => {
  if (!googleConfigure()) {
    return res.status(503).json({ error: "La connexion Google n'est pas disponible pour le moment." })
  }

  const parsed = z.object({ idToken: z.string().min(10) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Jeton Google manquant.' })

  // Express 4 fait PENDRE la requête sur une exception async non attrapée
  // (panne du 05/09) : la vérification et la création restent sous try/catch.
  let identite: GoogleIdentite
  try {
    identite = await verifierIdTokenGoogle(parsed.data.idToken)
  } catch (err) {
    const message = err instanceof GoogleAuthError ? err.message : 'Connexion Google impossible, réessayez.'
    return res.status(401).json({ error: message })
  }

  if (!identite.emailVerified) {
    return res.status(401).json({ error: "Votre adresse Google n'est pas vérifiée." })
  }

  try {
    const user = await trouverOuCreerCompteGoogle(identite)
    res.json({ token: signToken(user.id), user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error('connexion Google : création/liaison du compte impossible', err)
    res.status(500).json({ error: 'Connexion Google impossible, réessayez plus tard.' })
  }
})

/**
 * Retrouve ou crée le compte d'un utilisateur Google, en trois cas.
 *
 * 1. Déjà lié par `googleId` — on le prend tel quel.
 * 2. Un compte existe avec le même email — on rattache le `googleId`. La casse
 *    est ignorée (Google renvoie en minuscules, un compte a pu être créé en
 *    « Max@… »), sinon on créerait un doublon silencieux. **Piège de sécurité,
 *    évité ici** : ne PAS faire confiance à un compte dont l'email n'a jamais
 *    été prouvé par notre propre flux (`emailVerifiedAt` nul). Sans ce garde,
 *    un tiers pré-inscrit `victime@gmail.com` avec un mot de passe qu'il connaît
 *    (l'inscription ne prouve pas la possession de l'adresse), puis la vraie
 *    victime « Continue avec Google » : son `googleId` se greffe sur le compte
 *    de l'attaquant, qui garde son accès par mot de passe et voit tout. Google
 *    vient de prouver la possession de l'adresse : on adopte donc le compte pour
 *    Google et on **révoque le mot de passe non prouvé** (`passwordHash: null`).
 *    Un compte déjà vérifié, lui, garde son mot de passe : son propriétaire a
 *    prouvé l'adresse, les deux moyens de connexion coexistent.
 * 3. Inconnu — on crée, sans mot de passe, email déjà vérifié. La création passe
 *    par le même `prisma.user.create` que /register, donc les 120 drops, les 9
 *    crédits image, le plan FREE et le shopKey arrivent seuls (valeurs par
 *    défaut). Une course concurrente (double clic) lève P2002 sur un unique :
 *    on relit et on renvoie le compte que l'autre requête vient de créer.
 */
async function trouverOuCreerCompteGoogle(identite: GoogleIdentite) {
  const parGoogle = await prisma.user.findUnique({ where: { googleId: identite.googleId } })
  if (parGoogle) return parGoogle

  const parEmail = await trouverParEmail(identite.email)
  if (parEmail) {
    const dejaVerifie = Boolean(parEmail.emailVerifiedAt)
    return prisma.user.update({
      where: { id: parEmail.id },
      data: {
        googleId: identite.googleId,
        emailVerifiedAt: parEmail.emailVerifiedAt ?? new Date(),
        // Adresse jamais prouvée par notre flux : Google la prouve maintenant, on
        // coupe un éventuel mot de passe planté par un tiers.
        ...(dejaVerifie ? {} : { passwordHash: null }),
      },
    })
  }

  try {
    return await prisma.user.create({
      data: {
        email: identite.email,
        googleId: identite.googleId,
        emailVerifiedAt: new Date(),
      },
    })
  } catch (err) {
    // Course : une requête concurrente a créé le même compte entre-temps (P2002
    // sur email ou googleId uniques). On relit et on renvoie ce compte-là.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const rattrape =
        (await prisma.user.findUnique({ where: { googleId: identite.googleId } })) ??
        (await trouverParEmail(identite.email))
      if (rattrape) return rattrape
    }
    throw err
  }
}

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
  const parsed = z.object({ email: emailNormalise }).safeParse(req.body)
  // Always answer the same thing, valid address or not: a differing response
  // would let anyone test which emails have an account here.
  const generic = { ok: true, message: 'Si un compte existe pour cette adresse, un email vient d\'être envoyé.' }
  if (!parsed.success) return res.json(generic)

  const user = await trouverParEmail(parsed.data.email)
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
  if (!user.passwordHash) {
    return res
      .status(400)
      .json({ error: "Ce compte utilise la connexion Google et n'a pas de mot de passe à changer." })
  }
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
