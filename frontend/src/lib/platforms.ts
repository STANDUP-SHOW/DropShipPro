/**
 * Shape of /api/products/meta/platforms — the single source of truth lives in the
 * backend (services/platforms.ts), so nothing here hard-codes a marketplace.
 */
export type PlatformIntegration = 'live' | 'feed' | 'api-ready' | 'extension' | 'none'

export interface PlatformInfo {
  id: string
  label: string
  automatable: boolean
  integration: PlatformIntegration
  /** Can be part of a bulk publication (API destinations only). */
  batchable: boolean
  sellUrl: string | null
  note: string
  /**
   * Vrai quand la vidéo de l'annonce part réellement vers cette destination.
   *
   * Pas « la place de marché accepte les vidéos » : eBay et Facebook les
   * acceptent tous les deux, et nous n'y publions pas encore. Ce drapeau dit ce
   * que le vendeur obtiendra en cliquant.
   */
  video: boolean
  color: string
  /** Le domaine de la marque, d'où l'interface tire son logo. */
  domain?: string | null
  warning?: string
  unavailable?: boolean
}

/** Wording used everywhere a destination's integration is described. */
export const INTEGRATION_LABEL: Record<PlatformIntegration, string> = {
  live: 'Publication automatique',
  feed: 'Par flux produit',
  'api-ready': 'API — compte vendeur requis',
  extension: "Via l'extension",
  none: 'Indisponible',
}

export const INTEGRATION_STYLE: Record<PlatformIntegration, string> = {
  live: 'bg-emerald-500/20 text-emerald-300',
  feed: 'bg-pink-500/20 text-pink-300',
  'api-ready': 'bg-blue-500/20 text-blue-300',
  extension: 'bg-orange-500/20 text-orange-300',
  none: 'bg-red-500/20 text-red-300',
}
