import type { Platform } from '@prisma/client'

export interface PlatformInfo {
  id: Platform
  label: string
  /** true when publishing can go through an API once credentials are connected. */
  automatable: boolean
  /** Where the user creates a listing by hand (drives the extension's launcher). */
  sellUrl: string | null
  /** Shown in Réglages so the user knows what to expect from each integration. */
  note: string
  /** Set when there is a policy or eligibility caveat the seller must know before publishing. */
  warning?: string
  /** Listed for completeness but no publication path exists at all (not a marketplace). */
  unavailable?: boolean
  /** Brand colour, used for that platform's button in the diffusion dialog. */
  color: string
}

/** Brand colours, kept next to the list so the UI never hard-codes them. */
const COLORS: Record<string, string> = {
  OWN_SITE: '#a855f7',
  EBAY: '#e53238',
  GOOGLE_SHOPPING: '#4285f4',
  AMAZON: '#ff9900',
  CDISCOUNT: '#e2001a',
  TIKTOK_SHOP: '#000000',
  WISH: '#2fb7ec',
  LA_REDOUTE: '#e5004f',
  LECLERC: '#0055a4',
  BHV: '#e2001a',
  KIABI: '#e5007d',
  BRANDALLEY: '#1a1a1a',
  SPARTOO: '#ff6600',
  MIINTO: '#000000',
  ETSY: '#f56400',
  ATLAS_FOR_MEN: '#004b8d',
  FACEBOOK: '#1877f2',
  LEBONCOIN: '#ff6e14',
  VINTED: '#007782',
}

/**
 * Single source of truth for destinations. Everything else — zod enums, the
 * category preview, the back office and the extension — reads this list, so a new
 * marketplace only has to be declared here (plus its category paths in
 * categoryCatalog.ts and the Prisma enum).
 */
const PLATFORM_DEFS: Array<Omit<PlatformInfo, 'color'>> = [
  {
    id: 'OWN_SITE',
    label: 'Mon site',
    automatable: true,
    sellUrl: null,
    note: 'Catalogue public servi par /api/public/products — publication immédiate.',
  },
  {
    id: 'EBAY',
    label: 'eBay',
    automatable: true,
    sellUrl: 'https://www.ebay.fr/sl/sell',
    note: 'API Sell disponible en self-service — connectez votre token OAuth eBay.',
  },
  {
    id: 'GOOGLE_SHOPPING',
    label: 'Google Shopping',
    automatable: true,
    sellUrl: 'https://merchants.google.com',
    note: 'Content API for Shopping via un compte Merchant Center (gratuit). Utilise la taxonomie produit Google.',
  },
  {
    id: 'AMAZON',
    label: 'Amazon',
    automatable: true,
    sellUrl: 'https://sellercentral.amazon.fr',
    note: 'Selling Partner API — nécessite un compte vendeur Pro payant et validé par Amazon.',
  },
  {
    id: 'CDISCOUNT',
    label: 'Cdiscount',
    automatable: true,
    sellUrl: 'https://seller.cdiscount.com',
    note: 'API Marketplace Cdiscount — nécessite un compte vendeur validé.',
  },
  {
    id: 'TIKTOK_SHOP',
    label: 'TikTok Shop',
    automatable: true,
    sellUrl: 'https://seller.tiktokglobalshop.com',
    note: 'Partner API — nécessite une boutique TikTok Shop approuvée.',
  },
  {
    id: 'WISH',
    label: 'Wish',
    automatable: true,
    sellUrl: 'https://merchant.wish.com',
    note: 'Wish Merchant API — inscription vendeur en self-service.',
  },
  // La Redoute, Leclerc, BHV, Kiabi and BrandAlley all run their marketplace on
  // Mirakl, so a single Mirakl connector covers them: only the operator's base URL
  // and API key change from one to the next.
  {
    id: 'LA_REDOUTE',
    label: 'La Redoute',
    automatable: true,
    sellUrl: 'https://www.laredoute.fr/vendre-sur-la-redoute',
    note: 'Marketplace Mirakl — candidature vendeur à valider par La Redoute.',
  },
  {
    id: 'LECLERC',
    label: 'E.Leclerc',
    automatable: true,
    sellUrl: 'https://www.e.leclerc/vendeurs',
    note: 'Marketplace Mirakl — candidature vendeur à valider.',
  },
  {
    id: 'BHV',
    label: 'BHV Marais',
    automatable: true,
    sellUrl: 'https://www.bhv.fr',
    note: 'Marketplace Mirakl — sélection éditoriale, candidature à valider.',
  },
  {
    id: 'KIABI',
    label: 'Kiabi',
    automatable: true,
    sellUrl: 'https://www.kiabi.com',
    note: 'Marketplace Mirakl — mode uniquement, candidature à valider.',
  },
  {
    id: 'BRANDALLEY',
    label: 'BrandAlley',
    automatable: true,
    sellUrl: 'https://www.brandalley.fr',
    note: 'Ventes privées — fonctionne par opérations de déstockage de marques.',
    warning: 'Positionnement marques : les produits sans marque identifiée sont rarement acceptés.',
  },
  {
    id: 'SPARTOO',
    label: 'Spartoo',
    automatable: true,
    sellUrl: 'https://www.spartoo.com',
    note: 'Marketplace spécialisée chaussures, maroquinerie et mode.',
    warning: 'Catalogue limité à la chaussure et aux accessoires mode.',
  },
  {
    id: 'MIINTO',
    label: 'Miinto',
    automatable: true,
    sellUrl: 'https://www.miinto.fr',
    note: 'Marketplace mode réservée aux boutiques et marques référencées.',
    warning: 'Réservé aux boutiques physiques et marques établies — candidature exigeante.',
  },
  {
    id: 'ETSY',
    label: 'Etsy',
    automatable: true,
    sellUrl: 'https://www.etsy.com/sell',
    note: 'API Etsy publique et self-service.',
    warning:
      "Etsy interdit la revente de produits manufacturés achetés en gros : seuls le fait main, le vintage de plus de 20 ans et les fournitures créatives sont autorisés. Publier des produits Temu ou JoyBuy expose à la fermeture de la boutique.",
  },
  {
    id: 'ATLAS_FOR_MEN',
    label: 'Atlas For Men',
    automatable: false,
    sellUrl: 'https://www.atlasformen.fr',
    unavailable: true,
    note: "Détaillant en marque propre — il n'existe pas d'espace vendeur tiers.",
    warning:
      "Atlas For Men n'est pas une marketplace : l'enseigne vend sa propre marque et n'accepte pas de vendeurs tiers. Aucune publication n'est possible.",
  },
  {
    id: 'FACEBOOK',
    label: 'Facebook Marketplace',
    automatable: false,
    sellUrl: 'https://www.facebook.com/marketplace/create/item',
    note: "Pas d'API publique pour les annonces Marketplace : publication assistée via l'extension.",
  },
  {
    id: 'LEBONCOIN',
    label: 'Leboncoin',
    automatable: false,
    sellUrl: 'https://www.leboncoin.fr/deposer-une-annonce',
    note: "API réservée aux partenaires pros : publication assistée via l'extension.",
  },
  {
    id: 'VINTED',
    label: 'Vinted',
    automatable: false,
    sellUrl: 'https://www.vinted.fr/items/new',
    note: "Pas d'API publique : publication assistée via l'extension.",
  },
]

// Colours live in their own table so adding a platform above can't forget one:
// anything missing falls back to the app's purple.
export const PLATFORMS: PlatformInfo[] = PLATFORM_DEFS.map((p) => ({ ...p, color: COLORS[p.id] ?? '#a855f7' }))

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [Platform, ...Platform[]]

export function platformInfo(id: Platform): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.id === id)
}
