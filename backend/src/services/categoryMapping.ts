import type { Platform } from '@prisma/client'
import { findCategory, categoryFor } from './categoryCatalog.js'

/**
 * Best-effort mapping from a free-text source category (scraped from the origin
 * site) to each destination platform's own category taxonomy. Real taxonomies are
 * large and platform-specific (Leboncoin ~700 categories, Amazon browse nodes, etc.);
 * this keyword table covers common cases and always falls back to a safe default
 * so publishing never blocks on an unmapped category.
 */
const RULES: Array<{ keywords: string[]; targets: Partial<Record<Platform, string>> }> = [
  {
    keywords: ['vetement', 'vêtement', 'mode', 'shirt', 'robe', 'pantalon', 'chaussure', 'clothing', 'apparel'],
    targets: {
      LEBONCOIN: 'Vêtements',
      VINTED: 'Vêtements',
      EBAY: 'Clothing, Shoes & Accessories',
      AMAZON: 'Vêtements et accessoires',
    },
  },
  {
    keywords: ['electronique', 'électronique', 'phone', 'telephone', 'ordinateur', 'laptop', 'electronics', 'gadget'],
    targets: {
      LEBONCOIN: 'Informatique',
      VINTED: 'Électronique',
      EBAY: 'Consumer Electronics',
      AMAZON: 'Informatique',
    },
  },
  {
    keywords: ['maison', 'deco', 'décoration', 'furniture', 'meuble', 'home', 'kitchen', 'cuisine'],
    targets: {
      LEBONCOIN: 'Maison & Jardin',
      VINTED: 'Maison',
      EBAY: 'Home & Garden',
      AMAZON: 'Maison et cuisine',
    },
  },
  {
    keywords: ['jouet', 'toy', 'enfant', 'kids', 'bebe', 'bébé'],
    targets: {
      LEBONCOIN: 'Enfants',
      VINTED: 'Enfants',
      EBAY: 'Toys & Hobbies',
      AMAZON: 'Jeux et Jouets',
    },
  },
  {
    keywords: ['bijou', 'jewelry', 'montre', 'watch', 'accessoire'],
    targets: {
      LEBONCOIN: 'Accessoires & Bijoux',
      VINTED: 'Accessoires',
      EBAY: 'Jewelry & Watches',
      AMAZON: 'Bijoux',
    },
  },
]

const DEFAULT_TARGETS: Partial<Record<Platform, string>> = {
  LEBONCOIN: 'Autres',
  VINTED: 'Autres',
  EBAY: 'Everything Else',
  AMAZON: 'Divers',
  FACEBOOK: 'Divers',
  CDISCOUNT: 'Divers',
  GOOGLE_SHOPPING: 'Apparel & Accessories',
  TIKTOK_SHOP: 'Others',
}

export function mapCategory(sourceCategory: string | null, platform: Platform, categoryId?: string | null): string {
  // An explicit pick in the back office always wins over the scraped free text.
  const chosen = findCategory(categoryId)
  if (chosen) return categoryFor(chosen, platform)

  // Both serve the merchant's own storefront: the source wording is kept as is.
  if (platform === 'OWN_SITE' || platform === 'SHOPIFY') return sourceCategory || 'Divers'
  const normalized = (sourceCategory || '').toLowerCase()
  const rule = RULES.find((r) => r.keywords.some((k) => normalized.includes(k)))
  return rule?.targets[platform] || DEFAULT_TARGETS[platform] || 'Divers'
}
