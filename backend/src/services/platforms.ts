import type { Platform } from '@prisma/client'

/**
 * How a destination actually receives a listing.
 *
 * - `live`      : the API really creates the product now (own catalogue, Shopify)
 * - `feed`      : the channel reads a product feed we expose and refreshes itself
 *                 (Instagram, boutique Facebook, Google Shopping). The seller pastes
 *                 the address once ; there is no per-listing call to make.
 * - `api-ready` : an API exists but no seller account is connected yet — recorded as "en attente"
 * - `extension` : no public API at all, the Chrome extension fills the form
 * - `none`      : not a marketplace, nothing can be published
 *
 * Bulk publishing only makes sense for the first two: the extension drives one
 * browser tab at a time, with the seller clicking « Publier » himself.
 */
export type PlatformIntegration = 'live' | 'feed' | 'api-ready' | 'extension' | 'none'

export interface PlatformInfo {
  id: Platform
  label: string
  integration: PlatformIntegration
  /** True when this destination can be published to for many products at once. */
  batchable: boolean
  /** true when publishing can go through an API once credentials are connected. */
  automatable: boolean
  /** Where the user creates a listing by hand (drives the extension's launcher). */
  sellUrl: string | null
  /** Shown in Réglages so the user knows what to expect from each integration. */
  note: string
  /** Set when there is a policy or eligibility caveat the seller must know before publishing. */
  warning?: string
  /**
   * Vrai quand **nous** savons y envoyer la vidéo de l'annonce aujourd'hui.
   *
   * Pas « la place de marché accepte les vidéos » : eBay et Facebook les
   * acceptent tous les deux, et nous ne publions encore chez eux ni l'un ni
   * l'autre. Ce drapeau dit ce que le vendeur obtiendra en cliquant, ce qui est
   * la seule chose qu'il puisse vérifier — et la seule que nous ayons le droit
   * de lui promettre.
   */
  video: boolean
  /** Listed for completeness but no publication path exists at all (not a marketplace). */
  unavailable?: boolean
  /** Brand colour, used for that platform's button in the diffusion dialog. */
  color: string
  /**
   * Le domaine de la marque, d'où l'interface tire son logo.
   *
   * Déduit de `sellUrl` : le déclarer une seconde fois ferait deux vérités à
   * tenir, et c'est toujours la seconde qu'on oublie de corriger.
   */
  domain: string | null
}

/** Le domaine d'une adresse, ou `null` quand il n'y en a pas. */
function domaineDe(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www./, '')
  } catch {
    return null
  }
}

/** Brand colours, kept next to the list so the UI never hard-codes them. */
const COLORS: Record<string, string> = {
  OWN_SITE: '#a855f7',
  SHOPIFY: '#95bf47',
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
  KAUFLAND: '#e10915',
  SPARTOO: '#ff6600',
  MIINTO: '#000000',
  ETSY: '#f56400',
  INSTAGRAM: '#e1306c',
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
const PLATFORM_DEFS: Array<Omit<PlatformInfo, 'color' | 'integration' | 'batchable' | 'domain' | 'video'>> = [
  {
    id: 'OWN_SITE',
    label: 'Mon site',
    automatable: true,
    sellUrl: null,
    note: 'Catalogue public servi par /api/public/products — publication immédiate.',
  },
  // Shopify is not a marketplace: it's the seller's own store, so there is no
  // application to be accepted and no listing form to fill — sellUrl stays null so
  // the extension never opens a tab for it.
  {
    id: 'SHOPIFY',
    label: 'Shopify',
    automatable: true,
    sellUrl: null,
    note: "Publication réelle via l'API Admin. Créez une app personnalisée dans votre boutique (Réglages › Apps et canaux de vente › Développer des apps), autorisez write_products, et collez l'adresse .myshopify.com avec le jeton d'accès.",
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
    note: "Alimenté par un flux produit : collez l'adresse une fois dans Merchant Center (gratuit), Google la relit tous les jours.",
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
  /*
   * Kaufland Global Marketplace — allemande, presente en France depuis 2026.
   *
   * Une seule inscription ouvre les sept vitrines du groupe (DE, AT, PL, CZ,
   * SK, FR, IT), ce qui en fait la porte d entree la moins chere vers l Europe
   * pour un vendeur francais.
   *
   * Le `warning` n est pas decoratif : c est la seule chose qui compte avant de
   * payer un abonnement vendeur. Kaufland apparie chaque offre a sa fiche
   * catalogue **par l EAN**, et l EAN doit venir du fabricant ou de GS1. Un
   * produit importe de Temu ou d AliExpress n en a generalement aucun.
   */
  {
    id: 'KAUFLAND',
    label: 'Kaufland',
    automatable: true,
    sellUrl: 'https://www.kauflandglobalmarketplace.com/fr/seller-registration/',
    note: "Seller API documentée (sellerapi.kaufland.com), inscription vendeur en self-service. Une seule inscription ouvre les sept pays du groupe, dont Kaufland.fr.",
    warning:
      "EAN/GTIN officiel obligatoire : Kaufland apparie chaque offre à sa fiche catalogue par le code-barres, et il doit venir du fabricant ou de GS1. Un produit importé sans EAN sera refusé.",
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
    id: 'INSTAGRAM',
    label: 'Instagram & boutique Facebook',
    automatable: true,
    sellUrl: 'https://business.facebook.com/commerce',
    note: "Alimentées par un flux produit : collez l'adresse une fois dans Commerce Manager, Meta la relit plusieurs fois par jour.",
    warning:
      "Meta exige une boutique validée : compte professionnel, page Facebook liée et domaine vérifié. La validation prend quelques jours et ne dépend pas de nous.",
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
  {
    /*
     * Bol, comme Allegro, est une destination de vente et non un fournisseur.
     *
     * Onze millions de clients actifs aux Pays-Bas et en Belgique, ouverte aux
     * vendeurs tiers depuis 2011, et une API vendeur documentée. Le marché
     * néerlandophone est proche, solvable, et très peu travaillé depuis la
     * France.
     */
    id: 'BOL',
    label: 'Bol',
    automatable: true,
    sellUrl: 'https://partnerplatform.bol.com/',
    note: "Première place de marché des Pays-Bas et de Belgique, avec une API vendeur (Retailer API).",
    warning:
      "Les annonces, le service client et les retours se font en néerlandais. Un numéro de TVA européen et un compte bancaire SEPA sont exigés, et Bol impose ses propres délais de livraison — les tenir depuis un fournisseur chinois est impossible.",
  },
  {
    /*
     * Allegro figurait dans une liste de « fournisseurs » relevée sur un forum.
     * C'en est l'inverse : la première place de marché de Pologne, quarante
     * millions d'acheteurs, et très peu de vendeurs français dessus.
     */
    id: 'ALLEGRO',
    label: 'Allegro',
    automatable: true,
    sellUrl: 'https://allegro.pl/moje-allegro/sprzedaz/oferty',
    note: "Première place de marché de Pologne, avec une API vendeur ouverte (REST + OAuth).",
    warning:
      "Le compte vendeur exige une entreprise enregistrée dans l'Union européenne et une validation d'identité. Les annonces, le service client et les retours se font en polonais.",
  },
]

/** The two destinations publisher.ts really pushes to today. */
const LIVE: Platform[] = ['OWN_SITE', 'SHOPIFY']

/**
 * Destinations qui viennent lire un flux au lieu qu'on leur pousse une annonce.
 *
 * C'est la seule voie propre vers Instagram : sa boutique n'a pas d'API de
 * publication, elle se remplit du catalogue Meta, lui-même rempli par un flux.
 */
const FEED: Platform[] = ['INSTAGRAM', 'GOOGLE_SHOPPING']

function integrationOf(p: Omit<PlatformInfo, 'color' | 'integration' | 'batchable' | 'domain' | 'video'>): PlatformIntegration {
  if (p.unavailable) return 'none'
  if (!p.automatable) return 'extension'
  if (FEED.includes(p.id)) return 'feed'
  return LIVE.includes(p.id) ? 'live' : 'api-ready'
}

/**
 * Où la vidéo de l'annonce part réellement aujourd'hui.
 *
 * Liste courte, et volontairement : elle ne dit pas qui *accepte* les vidéos —
 * eBay et Facebook les acceptent, nous ne publions encore chez eux ni l'un ni
 * l'autre — mais où nous savons l'envoyer. Une ligne s'ajoute ici le jour où le
 * chemin est écrit **et** constaté, pas le jour où il est espéré.
 *
 * `OWN_SITE` : le flux catalogue la porte, notre vitrine la joue. Éprouvé.
 * `SHOPIFY` : envoyée après la création du produit, en meilleur effort — comme
 * la mise en ligne l'est déjà. Écrite, jamais confrontée à une vraie boutique,
 * exactement comme le reste de l'intégration Shopify.
 */
const ACCEPTE_VIDEO: Platform[] = ['OWN_SITE', 'SHOPIFY']

// Colours live in their own table so adding a platform above can't forget one:
// anything missing falls back to the app's purple.
export const PLATFORMS: PlatformInfo[] = PLATFORM_DEFS.map((p) => {
  const integration = integrationOf(p)
  return {
    ...p,
    integration,
    domain: domaineDe(p.sellUrl),
    batchable: integration === 'live' || integration === 'feed' || integration === 'api-ready',
    color: COLORS[p.id] ?? '#a855f7',
    video: ACCEPTE_VIDEO.includes(p.id),
  }
})

/** Destinations a bulk publication may target. */
export const BATCH_PLATFORM_IDS = PLATFORMS.filter((p) => p.batchable).map((p) => p.id) as [Platform, ...Platform[]]

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [Platform, ...Platform[]]

export function platformInfo(id: Platform): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.id === id)
}
