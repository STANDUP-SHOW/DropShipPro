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
 * Plusieurs PC de Max (et de son équipe) : plusieurs empreintes séparées par des
 * virgules (ou espaces, points-virgules) dans la même variable ; chacune ouvre.
 *
 * La clé n'est pas une ligne de `ApiKey` et ne rattache à aucun compte : elle
 * n'ouvre que `/api/admin`, jamais une session de vendeur.
 */
export const PREFIXE_ADMIN = 'dsp_adm_'

export function empreinteDe(cle: string): string {
  return crypto.createHash('sha256').update(cle).digest('hex')
}

/** Every well-formed fingerprint set by Max (comma, semicolon or space separated). Malformed entries are ignored. */
export function empreintesAttendues(env: NodeJS.ProcessEnv = process.env): string[] {
  const brute = (env.POSTE_ADMIN_SHA256 || '').trim().toLowerCase()
  return [...new Set(brute.split(/[\s,;]+/).filter((e) => /^[0-9a-f]{64}$/.test(e)))]
}

/** The first fingerprint set by Max, or null if none is set or well-formed. */
export function empreinteAttendue(env: NodeJS.ProcessEnv = process.env): string | null {
  return empreintesAttendues(env)[0] ?? null
}

/** Constant-time comparison of the presented key's fingerprint with each expected one. */
export function cleAdminValide(presentee: string, attendues: string | string[]): boolean {
  if (!presentee.startsWith(PREFIXE_ADMIN)) return false
  const a = Buffer.from(empreinteDe(presentee), 'hex')
  let ok = false
  for (const attendue of Array.isArray(attendues) ? attendues : [attendues]) {
    const b = Buffer.from(attendue, 'hex')
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) ok = true
  }
  return ok
}

export function requireAdminPoste(req: Request, res: Response, next: NextFunction) {
  const attendues = empreintesAttendues()
  if (!attendues.length) {
    return res.status(503).json({
      error: "L'administration n'est pas activée : posez POSTE_ADMIN_SHA256 (l'empreinte affichée par le Poste d'analyses) dans les variables Railway.",
    })
  }
  const header = req.headers.authorization
  const presentee = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!presentee) return res.status(401).json({ error: "Clé d'administration manquante (en-tête Authorization: Bearer …)." })
  if (!cleAdminValide(presentee, attendues)) return res.status(401).json({ error: "Clé d'administration inconnue : aucune des empreintes posées sur le site ne lui correspond." })
  next()
}
