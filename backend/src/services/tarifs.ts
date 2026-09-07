/**
 * Le tarif de chaque action, en drops — la monnaie unique de DropShipper.
 *
 * **Le modèle, décidé le 07/09/2026 :** plus d'abonnement, plus de location
 * d'agent. Le vendeur accède à tout et paie ce qu'il consomme. Un seul
 * portefeuille (les anciennes réserves « crédits annonce » et « crédits images »
 * fusionnent), une seule monnaie.
 *
 *   1 drop = 0,01 € à l'achat.
 *   Prix d'une action = 5 × son coût réel  ⇒  marge de 80 % garantie.
 *
 * Comme 1 drop coûte 0,01 € et représente 0,002 € de coût réel, le prix en drops
 * d'une action vaut « coût réel en euros × 500 », arrondi au-dessus pour ne jamais
 * repasser sous le multiple 5. Les coûts réels viennent du relevé du 07/09/2026
 * (voir l'artefact « Coûts IA réels ») : ils bougent si un tarif Anthropic/Google
 * change — c'est ICI qu'on ajuste, à un seul endroit.
 */
export const DROPS = {
  /** Importer une annonce : scraper + réécrire. Coût ~0,021 € → 12. */
  import: 12,
  /** Importer en lot (par annonce) : réécriture différée en Batch −50 %. ~0,012 €. */
  importLot: 8,
  /** Refaire la réécriture d'une annonce existante. ~0,018 €. */
  reecriture: 10,
  /** Analyse de marché, par produit : Opus→Sonnet + recherches web. ~0,06 €. */
  analyse: 30,
  /** Question à un agent de comptoir (hotline, SAV, commercial…), sans recherche. ~0,003 €. */
  questionComptoir: 5,
  /** Question à un chef de rayon / avocat / comptable (recherche web bornée). ~0,05 €. */
  questionChef: 25,
  /** Conseil produit approfondi d'un chef (5 recherches). ~0,076 €. */
  conseilProduit: 40,
  /** Générer une image (photo en situation). ~0,033 €. */
  image: 18,
  /** Créer une publicité (accroche + visuel composé). ~0,035 €. */
  pub: 20,
  /** AUTO-MODE : un passage d'un rayon (analyse + 10 gagnants). ~0,14 €. */
  autoModePassage: 75,
  /** AUTO-SHIPPER : une annonce importée automatiquement (orchestration gratuite). ~0,051 €. */
  autoShipperImport: 14,
} as const

/** Ce que vaut un drop, à l'achat, en euros. Sert à afficher l'équivalent. */
export const EURO_PAR_DROP = 0.01

/**
 * Ce que vaut un drop en dollars US, pour afficher les deux monnaies dans la
 * grille tarifaire. Au taux ~1 € = 1,08 $ ; c'est un repère d'affichage, pas un
 * taux de change à la seconde — le paiement, lui, se fait en euros.
 */
export const USD_PAR_DROP = 0.011

/** Drops offerts à l'inscription — de quoi essayer sans payer. */
export const DROPS_INSCRIPTION = 120

/**
 * Les recharges, en drops, au prix unique de 0,01 €/drop.
 *
 * Prix unique volontaire : toute remise de volume entamerait la marge ×5, que le
 * modèle promet de tenir partout. Un « bonus » de bienvenue se ferait en drops
 * offerts, pas en cassant le prix unitaire.
 */
export interface PackDrops {
  id: string
  /** Prix en centimes (Stripe). */
  amount: number
  /** Drops crédités. amount/100 × 100 = amount (1 drop = 1 centime). */
  drops: number
}

export const PACKS_DROPS: PackDrops[] = [
  { id: 'drops-500', amount: 500, drops: 500 },
  { id: 'drops-1000', amount: 1000, drops: 1000 },
  { id: 'drops-2000', amount: 2000, drops: 2000 },
  { id: 'drops-5000', amount: 5000, drops: 5000 },
  { id: 'drops-10000', amount: 10000, drops: 10000 },
  { id: 'drops-20000', amount: 20000, drops: 20000 },
]
