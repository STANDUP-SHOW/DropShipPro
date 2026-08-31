import type { Request } from 'express'

/**
 * Absolute address of this API, used whenever a third party has to fetch our own
 * files (Shopify downloads the watermarked photos itself, for instance).
 *
 * PUBLIC_API_URL wins when set; otherwise it is rebuilt from the incoming request,
 * honouring the proxy headers Railway puts in front of the app — without them the
 * protocol reads as http and Shopify refuses the mixed-content image.
 */
export function apiBaseUrl(req?: Request): string {
  const configured = process.env.PUBLIC_API_URL?.trim().replace(/\/$/, '')
  if (configured) return configured

  if (req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
    const host = String(req.headers['x-forwarded-host'] ?? req.get('host') ?? '').split(',')[0].trim()
    if (host) return `${forwardedProto || req.protocol}://${host}`
  }

  return `http://localhost:${process.env.PORT || 4000}`
}

/**
 * Rend absolue une adresse servie par cette API.
 *
 * Meta et Google téléchargent les photos eux-mêmes : un chemin `/storage/…` ne
 * leur dit rien, et un article sans photo joignable est rejeté du catalogue.
 */
export function absoluteUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * L'adresse du site, pour y renvoyer le vendeur après une autorisation.
 *
 * `FRONTEND_URL` accepte une liste séparée par des virgules — les trois
 * origines doivent y figurer pour le CORS. La première est l'adresse
 * canonique : c'est celle vers laquelle on redirige.
 */
export function frontendUrl(): string {
  const brut = process.env.FRONTEND_URL?.split(',')[0]?.trim().replace(/\/$/, '')
  return brut || 'https://www.drop-shipper.fr'
}

/**
 * L'adresse de retour de l'autorisation Meta.
 *
 * Elle doit être **identique au caractère près** entre la demande et l'échange
 * du code, et déclarée telle quelle dans les réglages de l'app Meta : une barre
 * oblique de différence fait échouer l'échange avec un message qui ne l'explique
 * pas. La calculer à un seul endroit évite d'avoir à s'en souvenir.
 */
export function callbackMeta(): string {
  return `${apiBaseUrl()}/api/public/social/meta/callback`
}
