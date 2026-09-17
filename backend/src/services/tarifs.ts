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
  /** Analyse réseaux sociaux, par produit (suggestions, ad-library, TikTok). 30. */
  analyseSociale: 30,
  /** Produit gagnant extrait à la demande, archivé non publié. 5 / produit. */
  gagnantExtrait: 5,
  /** Produit gagnant extrait ET publié (+ coût d'import habituel). 6 / produit. */
  gagnantPublie: 6,
  /** Question à un agent de comptoir (hotline, SAV, commercial…), sans recherche. ~0,003 €. */
  questionComptoir: 5,
  /** Question à un chef de rayon / avocat / comptable (recherche web bornée). ~0,05 €. */
  questionChef: 25,
  /** Conseil produit approfondi d'un chef (5 recherches). ~0,076 €. */
  conseilProduit: 40,
  /** Générer une image (photo en situation). ~0,033 €. */
  image: 18,
  /**
   * Contrôle photo d'Iris, par annonce contrôlée : vision Sonnet sur les photos
   * importées sans œil humain (import en lot, AUTO-SHIPPER). ~0,02 € → 10.
   */
  controle: 10,
  /** Créer une publicité (accroche + visuel composé). ~0,035 €. */
  pub: 20,
  /**
   * AUTO-MODE d'un chef de rayon : GRATUIT depuis le 17/09/2026. Les analyses de
   * marché et les produits gagnants viennent des 48 agents locaux
   * (MARKET-ANALYSES/), qui ne coûtent rien ; le chef reste en mode auto sans
   * frais d'activation. La clé reste pour l'écran et pour les bancs.
   */
  autoModePassage: 0,
  /**
   * L'agent extension : relève UNE fiche fournisseur dans le navigateur du
   * vendeur (file d'import servie par le serveur, exécutée par l'extension), puis
   * la remet à l'import. Le relevé seul ; la réécriture est l'annonce (12).
   * Un produit importé par l'agent coûte donc 6 + 12 = 18.
   */
  agentExtension: 6,
  /**
   * AUTO-SHIPPER : la journée, 1 €. Débitée une fois par 24 h, à la tournée du
   * jour : analyse, choix des produits, relevé, import, annonces, publications,
   * back-office — le vendeur ne fait rien. Rendue si la journée n'a rien
   * importé ni publié. Nombre de produits conseillé : 50 ; jusqu'à 480 (24
   * catégories × 20 produits) si le vendeur a de quoi se l'offrir.
   */
  autoShipperJour: 100,
  /** AUTO-SHIPPER : un produit importé ET publié automatiquement — agent (6) + annonce (12). */
  autoShipperImport: 18,
  /**
   * DropShop IA (17/09/2026) : la boutique écrite par le modèle — design
   * unique, responsive, emails, paiement Stripe pré-branché, gestion depuis
   * DropShipper — et 10 demandes de modification comprises. 2 € : création
   * (~0,40 € de Sonnet 5, une réparation comprise), hébergement, trafic.
   */
  boutiqueCreation: 200,
  /** Une demande de modification de la boutique au-delà des 10 comprises (Haiku, édition ciblée). */
  boutiqueModification: 10,
  /**
   * Extension « Back Office » d'une boutique DropShop (17/09/2026) : une
   * administration indépendante à l'adresse de la boutique, avec identifiant et
   * mot de passe, pour gérer commandes, produits et réglages sans compte
   * DropShipper. Une fois par boutique. Pas de coût de modèle : le prix paie
   * l'hébergement et le support de l'admin.
   */
  extensionBackOffice: 300,
  /**
   * Extension « Paiement en drops » : la boutique accepte les drops comme
   * monnaie de fidélité. Gratuite — c'est notre programme, et la boutique qui
   * l'installe devient Premium Member de Dropshop Cloud.
   */
  extensionPaiementDrops: 0,
} as const

/** Modifications de boutique comprises dans le prix de création. */
export const BOUTIQUE_MODIFS_INCLUSES = 10

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
 * Remise de volume sur les gros forfaits (10/09/2026) : le prix des ACTIONS en
 * drops ne bouge pas — c'est le drop qui coûte moins cher quand on en achète
 * beaucoup. Ça fidélise sans casser le modèle : à 0,0075 €/drop (forfait 20 000),
 * la marge reste largement positive (le coût réel d'un drop est ~0,002 €). Les
 * petits forfaits restent au tarif plein, la remise récompense l'engagement.
 */
export interface PackDrops {
  id: string
  /** Prix en centimes (Stripe). */
  amount: number
  /** Drops crédités. Le rapport amount/drops décroît sur les gros forfaits. */
  drops: number
}

export const PACKS_DROPS: PackDrops[] = [
  // Tarif plein : 1 drop = 1 centime.
  { id: 'drops-500', amount: 500, drops: 500 },
  { id: 'drops-1000', amount: 1000, drops: 1000 },
  { id: 'drops-2000', amount: 2000, drops: 2000 },
  // Remise de volume : le drop coûte moins cher.
  { id: 'drops-5000', amount: 4500, drops: 5000 }, // 0,009 €/drop (−10 %)
  { id: 'drops-10000', amount: 8000, drops: 10000 }, // 0,008 €/drop (−20 %)
  { id: 'drops-20000', amount: 15000, drops: 20000 }, // 0,0075 €/drop (−25 %)
]
