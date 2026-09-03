import type { Platform } from '@prisma/client'
import { SECTOR_CATEGORIES, SECTOR_RULES } from './categorySectors.js'

export interface CategoryEntry {
  /**
   * Le rayon auquel cette catégorie appartient.
   *
   * Le catalogue ne couvrait que la mode homme : un vendeur de high-tech ouvrait
   * la liste et n'y trouvait que des chemises. Le secteur relie une catégorie au
   * rayon correspondant (voir services/departments.ts) et permet de filtrer.
   */
  sector: string
  /** Stable id stored on the product — labels can be reworded without breaking data. */
  id: string
  group: string
  label: string
  /** Marketplaces whose category names are hand-picked per platform. */
  targets: Partial<Record<Platform, string>>
  /**
   * Google Product Taxonomy path. Used by Google Shopping, and by Facebook /
   * Instagram which accept `google_product_category` in their catalog feeds —
   * so one value covers three destinations instead of three hand-written ones.
   */
  google: string
  /** Generic French fashion category path, shared by Cdiscount and every Mirakl operator. */
  frFashion: string
  /** TikTok Shop category path. */
  tiktok: string
}

const APPAREL = 'Apparel & Accessories'

const FASHION_CATALOG: CategoryEntry[] = [
  // ---------- Chaussures ----------
  {
    sector: 'mode-homme',
    id: 'shoes-sneakers',
    group: 'Chaussures',
    label: 'Baskets / Sneakers',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Baskets', EBAY: "Men's Sneakers", AMAZON: 'Chaussures homme › Baskets', FACEBOOK: 'Chaussures homme' },
    google: `${APPAREL} > Shoes`,
    frFashion: 'Chaussures > Homme > Baskets',
    tiktok: 'Shoes > Men Shoes > Sneakers',
  },
  {
    sector: 'mode-homme',
    id: 'shoes-formal',
    group: 'Chaussures',
    label: 'Chaussures de ville',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Chaussures de ville', EBAY: "Men's Dress Shoes", AMAZON: 'Chaussures homme › Ville', FACEBOOK: 'Chaussures homme' },
    google: `${APPAREL} > Shoes`,
    frFashion: 'Chaussures > Homme > Ville',
    tiktok: 'Shoes > Men Shoes > Formal Shoes',
  },
  {
    sector: 'mode-homme',
    id: 'shoes-boots',
    group: 'Chaussures',
    label: 'Bottes / Boots',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Bottes', EBAY: "Men's Boots", AMAZON: 'Chaussures homme › Bottes', FACEBOOK: 'Chaussures homme' },
    google: `${APPAREL} > Shoes`,
    frFashion: 'Chaussures > Homme > Boots',
    tiktok: 'Shoes > Men Shoes > Boots',
  },
  {
    sector: 'mode-homme',
    id: 'shoes-sandals',
    group: 'Chaussures',
    label: 'Sandales / Claquettes',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Sandales', EBAY: "Men's Sandals", AMAZON: 'Chaussures homme › Sandales', FACEBOOK: 'Chaussures homme' },
    google: `${APPAREL} > Shoes`,
    frFashion: 'Chaussures > Homme > Sandales',
    tiktok: 'Shoes > Men Shoes > Sandals',
  },
  {
    sector: 'mode-homme',
    id: 'shoes-sport',
    group: 'Chaussures',
    label: 'Chaussures de sport',
    targets: { LEBONCOIN: 'Sport & Plein Air', VINTED: 'Hommes › Chaussures › Sport', EBAY: "Men's Athletic Shoes", AMAZON: 'Chaussures homme › Sport', FACEBOOK: 'Sport et loisirs' },
    google: `${APPAREL} > Shoes`,
    frFashion: 'Sport > Chaussures de sport homme',
    tiktok: 'Sports & Outdoor > Sports Shoes',
  },

  // ---------- Hauts ----------
  {
    sector: 'mode-homme',
    id: 'top-tshirt',
    group: 'Hauts',
    label: 'T-shirts',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › T-shirts', EBAY: "Men's T-Shirts", AMAZON: 'Vêtements homme › T-shirts', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Shirts & Tops`,
    frFashion: 'Mode > Homme > T-shirt',
    tiktok: 'Menswear & Underwear > Tops > T-Shirts',
  },
  {
    sector: 'mode-homme',
    id: 'top-shirt',
    group: 'Hauts',
    label: 'Chemises',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Chemises', EBAY: "Men's Casual Shirts", AMAZON: 'Vêtements homme › Chemises', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Shirts & Tops`,
    frFashion: 'Mode > Homme > Chemise',
    tiktok: 'Menswear & Underwear > Tops > Shirts',
  },
  {
    sector: 'mode-homme',
    id: 'top-polo',
    group: 'Hauts',
    label: 'Polos',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Polos', EBAY: "Men's Polos", AMAZON: 'Vêtements homme › Polos', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Shirts & Tops`,
    frFashion: 'Mode > Homme > Polo',
    tiktok: 'Menswear & Underwear > Tops > Polo Shirts',
  },
  {
    sector: 'mode-homme',
    id: 'top-sweater',
    group: 'Hauts',
    label: 'Pulls / Gilets',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Pulls', EBAY: "Men's Sweaters", AMAZON: 'Vêtements homme › Pulls', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Shirts & Tops`,
    frFashion: 'Mode > Homme > Pull',
    tiktok: 'Menswear & Underwear > Tops > Sweaters',
  },
  {
    sector: 'mode-homme',
    id: 'top-hoodie',
    group: 'Hauts',
    label: 'Sweats / Hoodies',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Sweats et sweats à capuche', EBAY: "Men's Hoodies & Sweatshirts", AMAZON: 'Vêtements homme › Sweats', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Shirts & Tops`,
    frFashion: 'Mode > Homme > Sweat',
    tiktok: 'Menswear & Underwear > Tops > Hoodies & Sweatshirts',
  },

  // ---------- Vestes & Manteaux ----------
  {
    sector: 'mode-homme',
    id: 'outer-jacket',
    group: 'Vestes & Manteaux',
    label: 'Vestes / Blousons',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Vestes', EBAY: "Men's Coats & Jackets", AMAZON: 'Vêtements homme › Vestes', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Outerwear > Coats & Jackets`,
    frFashion: 'Mode > Homme > Blouson',
    tiktok: 'Menswear & Underwear > Outerwear > Jackets',
  },
  {
    sector: 'mode-homme',
    id: 'outer-coat',
    group: 'Vestes & Manteaux',
    label: 'Manteaux / Parkas',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Manteaux', EBAY: "Men's Coats & Jackets", AMAZON: 'Vêtements homme › Manteaux', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Outerwear > Coats & Jackets`,
    frFashion: 'Mode > Homme > Manteau',
    tiktok: 'Menswear & Underwear > Outerwear > Coats',
  },

  // ---------- Bas ----------
  {
    sector: 'mode-homme',
    id: 'bottom-pants',
    group: 'Bas',
    label: 'Pantalons',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Pantalons', EBAY: "Men's Pants", AMAZON: 'Vêtements homme › Pantalons', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Pants`,
    frFashion: 'Mode > Homme > Pantalon',
    tiktok: 'Menswear & Underwear > Bottoms > Pants',
  },
  {
    sector: 'mode-homme',
    id: 'bottom-jeans',
    group: 'Bas',
    label: 'Jeans',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Jeans', EBAY: "Men's Jeans", AMAZON: 'Vêtements homme › Jeans', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Pants`,
    frFashion: 'Mode > Homme > Jean',
    tiktok: 'Menswear & Underwear > Bottoms > Jeans',
  },
  {
    sector: 'mode-homme',
    id: 'bottom-shorts',
    group: 'Bas',
    label: 'Shorts / Bermudas',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Shorts', EBAY: "Men's Shorts", AMAZON: 'Vêtements homme › Shorts', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Shorts`,
    frFashion: 'Mode > Homme > Short',
    tiktok: 'Menswear & Underwear > Bottoms > Shorts',
  },
  {
    sector: 'mode-homme',
    id: 'bottom-tracksuit',
    group: 'Bas',
    label: 'Survêtements / Joggings',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Survêtements', EBAY: "Men's Activewear", AMAZON: 'Vêtements homme › Survêtements', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Activewear`,
    frFashion: 'Mode > Homme > Survêtement',
    tiktok: 'Menswear & Underwear > Bottoms > Sweatpants',
  },
  {
    sector: 'mode-homme',
    id: 'bottom-suit',
    group: 'Bas',
    label: 'Costumes / Ensembles',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Costumes', EBAY: "Men's Suits", AMAZON: 'Vêtements homme › Costumes', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Suits`,
    frFashion: 'Mode > Homme > Costume',
    tiktok: 'Menswear & Underwear > Suits & Sets',
  },

  // ---------- Accessoires ----------
  {
    sector: 'mode-homme',
    id: 'acc-watch',
    group: 'Accessoires',
    label: 'Montres',
    targets: { LEBONCOIN: 'Montres & Bijoux', VINTED: 'Hommes › Accessoires › Montres', EBAY: "Men's Watches", AMAZON: 'Montres homme', FACEBOOK: 'Bijoux et montres' },
    google: `${APPAREL} > Jewelry > Watches`,
    frFashion: 'Bijouterie > Montre homme',
    tiktok: 'Jewelry Accessories & Derivatives > Watches',
  },
  {
    sector: 'mode-homme',
    id: 'acc-sunglasses',
    group: 'Accessoires',
    label: 'Lunettes de soleil',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Lunettes de soleil', EBAY: "Men's Sunglasses", AMAZON: 'Lunettes de soleil homme', FACEBOOK: 'Accessoires' },
    google: `${APPAREL} > Clothing Accessories > Sunglasses`,
    frFashion: 'Mode > Accessoires > Lunettes de soleil',
    tiktok: 'Fashion Accessories > Eyewear > Sunglasses',
  },
  {
    sector: 'mode-homme',
    id: 'acc-belt',
    group: 'Accessoires',
    label: 'Ceintures',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Ceintures', EBAY: "Men's Belts", AMAZON: 'Ceintures homme', FACEBOOK: 'Accessoires' },
    google: `${APPAREL} > Clothing Accessories > Belts`,
    frFashion: 'Mode > Accessoires > Ceinture',
    tiktok: 'Fashion Accessories > Belts',
  },
  {
    sector: 'mode-homme',
    id: 'acc-cap',
    group: 'Accessoires',
    label: 'Casquettes / Chapeaux',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Chapeaux et casquettes', EBAY: "Men's Hats", AMAZON: 'Chapeaux et casquettes homme', FACEBOOK: 'Accessoires' },
    google: `${APPAREL} > Clothing Accessories > Hats`,
    frFashion: 'Mode > Accessoires > Casquette',
    tiktok: 'Fashion Accessories > Hats & Caps',
  },
  {
    sector: 'mode-homme',
    id: 'acc-scarf',
    group: 'Accessoires',
    label: 'Écharpes / Gants / Bonnets',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Écharpes', EBAY: "Men's Scarves & Gloves", AMAZON: 'Écharpes et gants homme', FACEBOOK: 'Accessoires' },
    google: `${APPAREL} > Clothing Accessories > Scarves & Shawls`,
    frFashion: 'Mode > Accessoires > Écharpe',
    tiktok: 'Fashion Accessories > Scarves & Gloves',
  },
  {
    sector: 'mode-homme',
    id: 'acc-bag',
    group: 'Accessoires',
    label: 'Sacs / Sacoches',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Sacs', EBAY: "Men's Bags & Briefcases", AMAZON: 'Sacs homme', FACEBOOK: 'Sacs et bagages' },
    google: `${APPAREL} > Handbags, Wallets & Cases > Handbags`,
    frFashion: 'Bagagerie > Sac homme',
    tiktok: 'Luggage & Bags > Men Bags',
  },
  {
    sector: 'mode-homme',
    id: 'acc-wallet',
    group: 'Accessoires',
    label: 'Portefeuilles',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Portefeuilles', EBAY: "Men's Wallets", AMAZON: 'Portefeuilles homme', FACEBOOK: 'Accessoires' },
    google: `${APPAREL} > Handbags, Wallets & Cases > Wallets & Money Clips`,
    frFashion: 'Bagagerie > Portefeuille',
    tiktok: 'Luggage & Bags > Wallets & Card Holders',
  },
  {
    sector: 'mode-homme',
    id: 'acc-jewelry',
    group: 'Accessoires',
    label: 'Bijoux homme (colliers, bagues, bracelets)',
    targets: { LEBONCOIN: 'Montres & Bijoux', VINTED: 'Hommes › Accessoires › Bijoux', EBAY: "Men's Jewelry", AMAZON: 'Bijoux homme', FACEBOOK: 'Bijoux et montres' },
    google: `${APPAREL} > Jewelry`,
    frFashion: 'Bijouterie > Bijou homme',
    tiktok: 'Jewelry Accessories & Derivatives > Fashion Jewelry',
  },
  {
    sector: 'mode-homme',
    id: 'acc-tie',
    group: 'Accessoires',
    label: 'Cravates / Nœuds papillon',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Accessoires › Cravates', EBAY: "Men's Ties", AMAZON: 'Cravates homme', FACEBOOK: 'Accessoires' },
    google: `${APPAREL} > Clothing Accessories > Neckties`,
    frFashion: 'Mode > Accessoires > Cravate',
    tiktok: 'Fashion Accessories > Ties',
  },

  // ---------- Sous-vêtements ----------
  {
    sector: 'mode-homme',
    id: 'under-underwear',
    group: 'Sous-vêtements',
    label: 'Sous-vêtements',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Sous-vêtements', EBAY: "Men's Underwear", AMAZON: 'Sous-vêtements homme', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Underwear & Socks > Underwear`,
    frFashion: 'Mode > Homme > Sous-vêtement',
    tiktok: 'Menswear & Underwear > Underwear',
  },
  {
    sector: 'mode-homme',
    id: 'under-socks',
    group: 'Sous-vêtements',
    label: 'Chaussettes',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Chaussettes', EBAY: "Men's Socks", AMAZON: 'Chaussettes homme', FACEBOOK: 'Vêtements homme' },
    google: `${APPAREL} > Clothing > Underwear & Socks > Socks`,
    frFashion: 'Mode > Homme > Chaussettes',
    tiktok: 'Menswear & Underwear > Socks',
  },

  // ---------- Divers ----------
  {
    // Sans rayon : c'est le refuge de ce qui n'entre nulle part, et il doit
    // rester proposé quel que soit le secteur choisi par le vendeur.
    sector: 'tous',
    id: 'other',
    group: 'Divers',
    label: 'Autre / Non classé',
    targets: { LEBONCOIN: 'Autres', VINTED: 'Autres', EBAY: 'Everything Else', AMAZON: 'Divers', FACEBOOK: 'Divers' },
    google: 'Apparel & Accessories',
    frFashion: 'Divers',
    tiktok: 'Others',
  },
]

export function findCategory(id: string | null | undefined): CategoryEntry | undefined {
  if (!id) return undefined
  return CATEGORY_CATALOG.find((c) => c.id === id)
}

/**
 * French marketplaces sharing the same taxonomy shape. Cdiscount plus the Mirakl
 * operators (La Redoute, Leclerc, BHV, Kiabi, BrandAlley) and the fashion
 * specialists all take a "Rayon > Genre > Type" path, so one value serves them all
 * instead of nine near-identical strings per category.
 */
const FRENCH_MARKETPLACES: Platform[] = [
  'CDISCOUNT',
  'LA_REDOUTE',
  'LECLERC',
  'BHV',
  'KIABI',
  'BRANDALLEY',
  'KAUFLAND',
  'SPARTOO',
  'MIINTO',
]

/**
 * Le catalogue complet : la mode d'origine, puis les autres rayons.
 *
 * Réunis ici plutôt que dans un seul fichier de mille lignes : la mode a des
 * chemins par place de marché écrits à la main, les autres rayons partent d'une
 * taxonomie générique. Les mélanger rendrait les deux illisibles.
 */
export const CATEGORY_CATALOG: CategoryEntry[] = [...FASHION_CATALOG, ...SECTOR_CATEGORIES]

/** Les secteurs réellement représentés, avec leur nombre de catégories. */
export function categorySectors() {
  const counts = new Map<string, number>()
  for (const entry of CATEGORY_CATALOG) {
    counts.set(entry.sector, (counts.get(entry.sector) ?? 0) + 1)
  }
  return [...counts.entries()].map(([sector, count]) => ({ sector, count }))
}

/** Resolves the destination category name for one platform. */
export function categoryFor(entry: CategoryEntry, platform: Platform): string {
  switch (platform) {
    // Shopify's product_type is free text shown to the merchant's own customers,
    // so the French label of the catalogue is exactly the right value.
    case 'OWN_SITE':
    case 'SHOPIFY':
      return entry.label
    case 'GOOGLE_SHOPPING':
      return entry.google
    case 'TIKTOK_SHOP':
      return entry.tiktok
    // Wish and Etsy use broad English taxonomies close to Google's, and neither
    // demands an exact operator path at listing time.
    case 'WISH':
    case 'ETSY':
      return entry.google
    default:
      if (FRENCH_MARKETPLACES.includes(platform)) return entry.frFashion
      return entry.targets[platform] || entry.label
  }
}

/** Guesses a catalog entry from the free-text category scraped on the source site. */
export function guessCategoryId(sourceCategory: string | null): string | null {
  if (!sourceCategory) return null
  const text = sourceCategory.toLowerCase()

  const RULES: Array<[RegExp, string]> = [
    [/basket|sneaker|running/, 'shoes-sneakers'],
    [/botte|boot/, 'shoes-boots'],
    [/sandale|claquette|tong/, 'shoes-sandals'],
    [/chaussure/, 'shoes-formal'],
    [/t-?shirt|tee/, 'top-tshirt'],
    [/chemise/, 'top-shirt'],
    [/polo/, 'top-polo'],
    [/pull|gilet|sweater/, 'top-sweater'],
    [/sweat|hoodie|capuche/, 'top-hoodie'],
    [/veste|blouson|jacket/, 'outer-jacket'],
    [/manteau|parka|coat/, 'outer-coat'],
    [/jean/, 'bottom-jeans'],
    [/short|bermuda/, 'bottom-shorts'],
    [/jogging|survêtement|survetement|tracksuit/, 'bottom-tracksuit'],
    [/costume|suit/, 'bottom-suit'],
    [/pantalon|trouser/, 'bottom-pants'],
    [/montre|watch/, 'acc-watch'],
    [/lunette|sunglass/, 'acc-sunglasses'],
    [/ceinture|belt/, 'acc-belt'],
    [/casquette|chapeau|bonnet|cap\b|hat/, 'acc-cap'],
    [/écharpe|echarpe|gant|scarf|glove/, 'acc-scarf'],
    [/sac|bag/, 'acc-bag'],
    [/portefeuille|wallet/, 'acc-wallet'],
    [/cravate|tie\b/, 'acc-tie'],
    [/bijou|collier|bague|bracelet|jewel|pendentif/, 'acc-jewelry'],
    [/chaussette|sock/, 'under-socks'],
    [/sous-vêtement|sous-vetement|underwear|bo(x|xer)/, 'under-underwear'],
  ]

  return SECTOR_RULES.find(([re]) => re.test(text))?.[1] ?? RULES.find(([re]) => re.test(text))?.[1] ?? null
}
