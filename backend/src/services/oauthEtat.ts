import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Le paramètre `state` des autorisations OAuth, signé.
 *
 * Il porte le vendeur et la plateforme d'un aller-retour chez TikTok, Pinterest,
 * Allegro… et il est signé, pas seulement transporté : un `state` qui ne serait
 * que l'identifiant du vendeur laisserait n'importe qui rattacher SON compte
 * TikTok au compte DropShipper d'un autre en rejouant l'adresse de retour (la
 * faille CSRF classique d'OAuth). Il expire au bout d'une heure : une
 * autorisation ne prend pas plus longtemps, et un lien vieux d'une semaine qui
 * traîne dans un historique ne doit plus rien ouvrir.
 */

const DUREE_MS = 60 * 60 * 1000

function secret(): string {
  const s = process.env.JWT_SECRET?.trim()
  if (!s) throw new Error('JWT_SECRET manque : impossible de signer une autorisation.')
  return s
}

function signature(charge: string): string {
  return createHmac('sha256', secret()).update(`oauth-etat:${charge}`).digest('base64url')
}

export function signerEtat(userId: string, plateforme: string): string {
  const charge = Buffer.from(JSON.stringify({ u: userId, p: plateforme, t: Date.now() })).toString('base64url')
  return `${charge}.${signature(charge)}`
}

/** Le vendeur et la plateforme, ou `null` si le `state` est faux, altéré ou périmé. */
export function lireEtat(etat: string): { userId: string; plateforme: string } | null {
  const [charge, signe] = etat.split('.')
  if (!charge || !signe) return null
  const a = Buffer.from(signe)
  const b = Buffer.from(signature(charge))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const { u, p, t } = JSON.parse(Buffer.from(charge, 'base64url').toString()) as { u?: string; p?: string; t?: number }
    if (!u || !p || typeof t !== 'number' || Date.now() - t > DUREE_MS) return null
    return { userId: u, plateforme: p }
  } catch {
    return null
  }
}
