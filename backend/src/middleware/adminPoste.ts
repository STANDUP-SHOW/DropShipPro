import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

/**
 * L'administration générale du site est tenue par le Poste d'analyses (analyses/),
 * l'application de Max, et par rien d'autre : pas de compte « administrateur », pas
 * d'e-mail privilégié, pas de mot de passe qui ouvre la liste des vendeurs.
 *
 * Le Poste fabrique lui-même une clé `dsp_adm_…` (256 bits d'aléa) et la garde
 * dans le coffre de Windows. Le site ne connaît que son EMPREINTE SHA-256, posée
 * par Max dans la variable Railway `POSTE_ADMIN_SHA256` : une fuite du dépôt, de
 * la base ou de Railway ne donne donc pas la clé. Sans cette variable, aucune
 * route d'administration ne répond (503) : pas d'administrateur par défaut.
 *
 * La clé n'est pas une ligne de `ApiKey` et ne rattache à aucun compte : elle
 * n'ouvre que `/api/admin`, jamais une session de vendeur.
 */
export const PREFIXE_ADMIN = 'dsp_adm_'

export function empreinteDe(cle: string): string {
  return crypto.createHash('sha256').update(cle).digest('hex')
}

/** L'empreinte posée par Max, ou null si la variable est absente ou mal formée. */
export function empreinteAttendue(env: NodeJS.ProcessEnv = process.env): string | null {
  const brute = (env.POSTE_ADMIN_SHA256 || '').trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(brute) ? brute : null
}

/** Comparaison à temps constant de l'empreinte de la clé présentée avec l'attendue. */
export function cleAdminValide(presentee: string, attendue: string): boolean {
  if (!presentee.startsWith(PREFIXE_ADMIN)) return false
  const a = Buffer.from(empreinteDe(presentee), 'hex')
  const b = Buffer.from(attendue, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function requireAdminPoste(req: Request, res: Response, next: NextFunction) {
  const attendue = empreinteAttendue()
  if (!attendue) {
    return res.status(503).json({
      error: "L'administration n'est pas activée : posez POSTE_ADMIN_SHA256 (l'empreinte affichée par le Poste d'analyses) dans les variables Railway.",
    })
  }
  const header = req.headers.authorization
  const presentee = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!presentee) return res.status(401).json({ error: "Clé d'administration manquante (en-tête Authorization: Bearer …)." })
  if (!cleAdminValide(presentee, attendue)) return res.status(401).json({ error: "Clé d'administration inconnue : ce n'est pas celle dont l'empreinte est posée sur le site." })
  next()
}
