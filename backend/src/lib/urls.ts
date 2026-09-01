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
  /*
   * Une liste séparée par des virgules est ramenée à sa première adresse, et
   * une valeur qui ne ressemble pas à une adresse est ignorée.
   *
   * **Constaté en production le 02/09/2026** : `PUBLIC_API_URL` portait la même
   * liste que `FRONTEND_URL` — « https://drop-shipper.fr, https://www… » — et
   * tout ce qui compose une adresse absolue produisait cette chaîne collée à un
   * chemin. La vitrine ne chargeait aucun produit, et surtout **les flux Meta et
   * Google servaient des adresses de photos impossibles** depuis le premier
   * jour, sans que rien ne le signale : un article sans photo joignable est
   * rejeté du catalogue, en silence.
   *
   * Les deux variables se ressemblent, on les remplit à la suite, et la faute ne
   * se voit nulle part. Le code la corrige donc plutôt que de compter dessus —
   * c'est la même leçon que `VITE_API_URL` écrasée par une clé Stripe.
   */
  const brut = process.env.PUBLIC_API_URL?.split(',')[0]?.trim().replace(/\/$/, '')
  const configured = brut && /^https?:\/\//.test(brut) ? brut : ''
  if (brut && !configured) {
    console.error("PUBLIC_API_URL ne ressemble pas à une adresse http, elle est ignorée :", brut.slice(0, 40))
  }
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
