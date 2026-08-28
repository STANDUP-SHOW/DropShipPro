/**
 * Le contrat du raccordement social et publicitaire.
 *
 * Écrit avant tout adaptateur, et c'est délibéré. Le rapport recommande de
 * s'appuyer sur un moteur tiers plutôt que de reconstruire sept intégrations
 * publicitaires à la main — et il a raison : nous venons de passer une soirée
 * sur Shopify, la plus simple des sept, et 141 annonces attendent toujours.
 *
 * Mais s'appuyer sur un tiers ne veut pas dire s'y attacher. Deux choses restent
 * chez nous quoi qu'il arrive :
 *
 * - **La correspondance vendeur ↔ profil ↔ comptes**, en base. Changer de moteur
 *   revient alors à réécrire un adaptateur, pas à redemander à mille vendeurs de
 *   reconnecter leurs comptes.
 * - **Ce contrat**, qui ne parle jamais du moteur. Le reste de l'application
 *   demande « publie ceci », « crée cette campagne » ; elle ne sait pas qui le
 *   fait, et n'a pas à le savoir.
 *
 * C'est la même leçon que pour les fournisseurs : une interface, des
 * adaptateurs. Elle a tenu sur trois connecteurs, elle tiendra ici.
 */

/** Les réseaux où l'on publie du contenu. */
export const RESEAUX = [
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'pinterest',
  'threads',
] as const

/** Les régies où l'on achète de la publicité. */
export const REGIES = [
  'meta-ads',
  'google-ads',
  'tiktok-ads',
  'linkedin-ads',
  'pinterest-ads',
  'x-ads',
] as const

export type Reseau = (typeof RESEAUX)[number]
export type Regie = (typeof REGIES)[number]
export type Plateforme = Reseau | Regie

/** Vrai pour une régie publicitaire, faux pour un réseau. */
export function estRegie(p: string): boolean {
  return (REGIES as readonly string[]).includes(p)
}

/**
 * Une erreur qui dit ce qu'il faut faire.
 *
 * Même règle que pour les fournisseurs : « 401 » ne répare rien. Le vendeur doit
 * savoir si son compte est déconnecté, si le moteur est en panne, ou si nous
 * n'avons rien branché — les trois appellent trois gestes différents, et un seul
 * le concerne.
 */
export class SocialError extends Error {
  constructor(
    message: string,
    /** Vrai quand le vendeur peut corriger lui-même : reconnecter son compte. */
    readonly actionnable = false,
  ) {
    super(message)
    this.name = 'SocialError'
  }
}

/** Un compte raccordé, tel que l'application le connaît. */
export interface CompteRaccorde {
  /** L'identifiant du compte chez le moteur. */
  externalId: string
  platform: string
  label: string | null
  connected: boolean
  isAdAccount: boolean
}

/** Une publication à envoyer, sur un ou plusieurs comptes à la fois. */
export interface Publication {
  /** Les comptes visés, par leur identifiant chez le moteur. */
  comptes: string[]
  texte: string
  /** Adresses des médias, déjà accessibles depuis Internet. */
  medias?: string[]
  /** Quand publier. Absent : tout de suite. */
  quand?: Date | null
}

export interface ResultatPublication {
  /** L'identifiant de la publication chez le moteur. */
  externalId: string
  /** planifiee, publiee, partielle, echouee. */
  etat: string
  /** Le détail par compte : une publication peut réussir ici et manquer là. */
  parCompte: Array<{ compte: string; etat: string; url: string | null; erreur: string | null }>
}

/** Une campagne publicitaire, réduite à ce que le vendeur décide. */
export interface Campagne {
  /** Le compte publicitaire qui la porte. */
  compte: string
  nom: string
  /** trafic, notoriete, conversions, engagement. */
  objectif: string
  /** Budget quotidien en centimes, dans la devise du compte publicitaire. */
  budgetJour: number
  /** Le visuel et le texte de l'annonce. */
  creative: {
    image: string
    titre: string
    texte: string
    /** Où le clic mène. */
    url: string
    boutonLabel?: string
  }
  /** Le ciblage, volontairement minimal : le reste se règle chez la régie. */
  ciblage?: {
    paysCodes?: string[]
    ageMin?: number
    ageMax?: number
  }
}

export interface ResultatCampagne {
  externalId: string
  /** brouillon, en_revue, active, refusee, terminee. */
  etat: string
  /** Où la voir chez la régie, quand le moteur donne une adresse. */
  url: string | null
}

/** Ce qu'une campagne a produit, tel que la régie le rend. */
export interface Performances {
  externalId: string
  impressions: number
  clics: number
  /** Dépense en centimes. */
  depense: number
  conversions: number | null
  devise: string
}

/**
 * Le moteur qui tient les raccordements.
 *
 * Chaque geste est facultatif sauf les deux premiers : un moteur qui ne saurait
 * que publier reste utile, et doit pouvoir le dire en n'implémentant pas le
 * reste — plutôt qu'en levant une erreur au moment où le vendeur clique.
 */
export interface SocialProvider {
  id: string
  label: string

  /** Crée le profil du vendeur chez le moteur, et rend son identifiant. */
  creerProfil(userId: string, nom: string): Promise<string>

  /** Les comptes déjà raccordés à ce profil. */
  listerComptes(profilId: string): Promise<CompteRaccorde[]>

  /**
   * L'adresse où envoyer le vendeur pour raccorder un compte.
   *
   * En marque blanche : le vendeur s'authentifie chez Meta ou TikTok, jamais
   * chez le moteur. Le jeton ne passe donc jamais par nous — c'est ce qui
   * distingue ce raccordement d'un mot de passe confié à un tiers.
   */
  lienDeConnexion?(profilId: string, platform: string, retour: string): Promise<string>

  publier?(profilId: string, p: Publication): Promise<ResultatPublication>

  creerCampagne?(profilId: string, c: Campagne): Promise<ResultatCampagne>
  listerCampagnes?(profilId: string): Promise<ResultatCampagne[]>
  performances?(profilId: string, externalIds: string[]): Promise<Performances[]>
}
