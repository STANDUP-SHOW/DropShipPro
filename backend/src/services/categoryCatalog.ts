import type { Platform } from '@prisma/client'

export interface CategoryEntry {
  /** Stable id stored on the product — labels can be reworded without breaking data. */
  id: string
  group: string
  label: string
  targets: Partial<Record<Platform, string>>
}

/**
 * Men's fashion taxonomy, with the equivalent category on each marketplace.
 *
 * The destination names mirror what each platform actually calls the section in
 * its own listing form, so they can be pasted (or auto-filled by the extension)
 * into the category picker without translation.
 */
export const CATEGORY_CATALOG: CategoryEntry[] = [
  // ---------- Chaussures ----------
  {
    id: 'shoes-sneakers',
    group: 'Chaussures',
    label: 'Baskets / Sneakers',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Baskets', EBAY: "Men's Sneakers", AMAZON: 'Chaussures homme › Baskets' },
  },
  {
    id: 'shoes-formal',
    group: 'Chaussures',
    label: 'Chaussures de ville',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Chaussures de ville', EBAY: "Men's Dress Shoes", AMAZON: 'Chaussures homme › Ville' },
  },
  {
    id: 'shoes-boots',
    group: 'Chaussures',
    label: 'Bottes / Boots',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Bottes', EBAY: "Men's Boots", AMAZON: 'Chaussures homme › Bottes' },
  },
  {
    id: 'shoes-sandals',
    group: 'Chaussures',
    label: 'Sandales / Claquettes',
    targets: { LEBONCOIN: 'Chaussures', VINTED: 'Hommes › Chaussures › Sandales', EBAY: "Men's Sandals", AMAZON: 'Chaussures homme › Sandales' },
  },
  {
    id: 'shoes-sport',
    group: 'Chaussures',
    label: 'Chaussures de sport',
    targets: { LEBONCOIN: 'Sport & Plein Air', VINTED: 'Hommes › Chaussures › Sport', EBAY: "Men's Athletic Shoes", AMAZON: 'Chaussures homme › Sport' },
  },

  // ---------- Hauts ----------
  {
    id: 'top-tshirt',
    group: 'Hauts',
    label: 'T-shirts',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › T-shirts', EBAY: "Men's T-Shirts", AMAZON: 'Vêtements homme › T-shirts' },
  },
  {
    id: 'top-shirt',
    group: 'Hauts',
    label: 'Chemises',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Chemises', EBAY: "Men's Casual Shirts", AMAZON: 'Vêtements homme › Chemises' },
  },
  {
    id: 'top-polo',
    group: 'Hauts',
    label: 'Polos',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Polos', EBAY: "Men's Polos", AMAZON: 'Vêtements homme › Polos' },
  },
  {
    id: 'top-sweater',
    group: 'Hauts',
    label: 'Pulls / Gilets',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Pulls', EBAY: "Men's Sweaters", AMAZON: 'Vêtements homme › Pulls' },
  },
  {
    id: 'top-hoodie',
    group: 'Hauts',
    label: 'Sweats / Hoodies',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Sweats et sweats à capuche', EBAY: "Men's Hoodies & Sweatshirts", AMAZON: 'Vêtements homme › Sweats' },
  },

  // ---------- Vestes & Manteaux ----------
  {
    id: 'outer-jacket',
    group: 'Vestes & Manteaux',
    label: 'Vestes / Blousons',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Vestes', EBAY: "Men's Coats & Jackets", AMAZON: 'Vêtements homme › Vestes' },
  },
  {
    id: 'outer-coat',
    group: 'Vestes & Manteaux',
    label: 'Manteaux / Parkas',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Manteaux', EBAY: "Men's Coats & Jackets", AMAZON: 'Vêtements homme › Manteaux' },
  },

  // ---------- Bas ----------
  {
    id: 'bottom-pants',
    group: 'Bas',
    label: 'Pantalons',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Pantalons', EBAY: "Men's Pants", AMAZON: 'Vêtements homme › Pantalons' },
  },
  {
    id: 'bottom-jeans',
    group: 'Bas',
    label: 'Jeans',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Jeans', EBAY: "Men's Jeans", AMAZON: 'Vêtements homme › Jeans' },
  },
  {
    id: 'bottom-shorts',
    group: 'Bas',
    label: 'Shorts / Bermudas',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Shorts', EBAY: "Men's Shorts", AMAZON: 'Vêtements homme › Shorts' },
  },
  {
    id: 'bottom-tracksuit',
    group: 'Bas',
    label: 'Survêtements / Joggings',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Survêtements', EBAY: "Men's Activewear", AMAZON: 'Vêtements homme › Survêtements' },
  },
  {
    id: 'bottom-suit',
    group: 'Bas',
    label: 'Costumes / Ensembles',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Costumes', EBAY: "Men's Suits", AMAZON: 'Vêtements homme › Costumes' },
  },

  // ---------- Accessoires ----------
  {
    id: 'acc-watch',
    group: 'Accessoires',
    label: 'Montres',
    targets: { LEBONCOIN: 'Montres & Bijoux', VINTED: 'Hommes › Accessoires › Montres', EBAY: "Men's Watches", AMAZON: 'Montres homme' },
  },
  {
    id: 'acc-sunglasses',
    group: 'Accessoires',
    label: 'Lunettes de soleil',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Lunettes de soleil', EBAY: "Men's Sunglasses", AMAZON: 'Lunettes de soleil homme' },
  },
  {
    id: 'acc-belt',
    group: 'Accessoires',
    label: 'Ceintures',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Ceintures', EBAY: "Men's Belts", AMAZON: 'Ceintures homme' },
  },
  {
    id: 'acc-cap',
    group: 'Accessoires',
    label: 'Casquettes / Chapeaux',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Chapeaux et casquettes', EBAY: "Men's Hats", AMAZON: 'Chapeaux et casquettes homme' },
  },
  {
    id: 'acc-scarf',
    group: 'Accessoires',
    label: 'Écharpes / Gants / Bonnets',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Écharpes', EBAY: "Men's Scarves & Gloves", AMAZON: 'Écharpes et gants homme' },
  },
  {
    id: 'acc-bag',
    group: 'Accessoires',
    label: 'Sacs / Sacoches',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Sacs', EBAY: "Men's Bags & Briefcases", AMAZON: 'Sacs homme' },
  },
  {
    id: 'acc-wallet',
    group: 'Accessoires',
    label: 'Portefeuilles',
    targets: { LEBONCOIN: 'Accessoires & Bagagerie', VINTED: 'Hommes › Accessoires › Portefeuilles', EBAY: "Men's Wallets", AMAZON: 'Portefeuilles homme' },
  },
  {
    id: 'acc-jewelry',
    group: 'Accessoires',
    label: 'Bijoux homme (colliers, bagues, bracelets)',
    targets: { LEBONCOIN: 'Montres & Bijoux', VINTED: 'Hommes › Accessoires › Bijoux', EBAY: "Men's Jewelry", AMAZON: 'Bijoux homme' },
  },
  {
    id: 'acc-tie',
    group: 'Accessoires',
    label: 'Cravates / Nœuds papillon',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Accessoires › Cravates', EBAY: "Men's Ties", AMAZON: 'Cravates homme' },
  },

  // ---------- Sous-vêtements ----------
  {
    id: 'under-underwear',
    group: 'Sous-vêtements',
    label: 'Sous-vêtements',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Sous-vêtements', EBAY: "Men's Underwear", AMAZON: 'Sous-vêtements homme' },
  },
  {
    id: 'under-socks',
    group: 'Sous-vêtements',
    label: 'Chaussettes',
    targets: { LEBONCOIN: 'Vêtements', VINTED: 'Hommes › Vêtements › Chaussettes', EBAY: "Men's Socks", AMAZON: 'Chaussettes homme' },
  },

  // ---------- Divers ----------
  {
    id: 'other',
    group: 'Divers',
    label: 'Autre / Non classé',
    targets: { LEBONCOIN: 'Autres', VINTED: 'Autres', EBAY: 'Everything Else', AMAZON: 'Divers' },
  },
]

export function findCategory(id: string | null | undefined): CategoryEntry | undefined {
  if (!id) return undefined
  return CATEGORY_CATALOG.find((c) => c.id === id)
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

  return RULES.find(([re]) => re.test(text))?.[1] ?? null
}
