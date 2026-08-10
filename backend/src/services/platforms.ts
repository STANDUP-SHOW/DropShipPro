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
}

/**
 * Single source of truth for destinations. Everything else — zod enums, the
 * category preview, the back office and the extension — reads this list, so a new
 * marketplace only has to be declared here (plus its category paths in
 * categoryCatalog.ts and the Prisma enum).
 */
export const PLATFORMS: PlatformInfo[] = [
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

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [Platform, ...Platform[]]

export function platformInfo(id: Platform): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.id === id)
}
