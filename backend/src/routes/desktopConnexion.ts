import { Router } from 'express'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { requireAuth, signToken, type AuthedRequest } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'

/**
 * Sign-in handoff for DropShipper Desktop.
 *
 * Google refuses its sign-in inside an embedded Electron view, so the app opens
 * /connexion-desktop in the seller's own browser. Once signed in there, the page
 * asks for a short-lived single-use code and hands it to the app through
 * dropshipper://connexion?code=…&etat=…; the app trades it here for a session
 * token. The code never carries a credential itself, lives two minutes, is bound
 * to the `etat` the app generated, and only its hash is kept (in memory: a code
 * lost to a restart just means clicking again).
 */
export const desktopConnexionRouter = Router()

const DUREE_MS = 2 * 60 * 1000
const codes = new Map<string, { userId: string; etat: string; expire: number }>()
const empreinte = (code: string) => createHash('sha256').update(code).digest('hex')
const etatSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)

function purger() {
  const maintenant = Date.now()
  for (const [cle, v] of codes) if (v.expire < maintenant) codes.delete(cle)
}

desktopConnexionRouter.post('/code', requireAuth, (req: AuthedRequest, res) => {
  const etat = etatSchema.safeParse(req.body?.etat)
  if (!etat.success) return res.status(400).json({ error: 'Lien de connexion invalide : relancez la connexion depuis l’application.' })
  purger()
  const code = randomBytes(32).toString('hex')
  codes.set(empreinte(code), { userId: req.userId!, etat: etat.data, expire: Date.now() + DUREE_MS })
  res.json({ code })
})

desktopConnexionRouter.post('/echange', rateLimit({ name: 'desktop-echange', windowMs: 900_000, max: 30 }), (req, res) => {
  const corps = z.object({ code: z.string().regex(/^[0-9a-f]{64}$/), etat: etatSchema }).safeParse(req.body)
  if (!corps.success) return res.status(400).json({ error: 'Code de connexion invalide.' })
  purger()
  const cle = empreinte(corps.data.code)
  const entree = codes.get(cle)
  codes.delete(cle)
  if (!entree || entree.etat !== corps.data.etat) {
    return res.status(401).json({ error: 'Code de connexion expiré ou déjà utilisé : relancez la connexion depuis l’application.' })
  }
  res.json({ token: signToken(entree.userId) })
})
