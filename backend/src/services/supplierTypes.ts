/**
 * Le contrat commun à tous les connecteurs fournisseurs.
 *
 * Dans son propre module parce que les connecteurs et le registre qui les
 * rassemble ne peuvent pas s'importer l'un l'autre : le cycle laisse le tableau
 * des connecteurs vide au chargement, et la veille ne trouve plus personne.
 */

export interface SupplierPrice {
  /** L'identifiant du produit chez le fournisseur. */
  ref: string
  /** Prix d'achat hors port, dans la devise du fournisseur. */
  price: number | null
  currency: string
  /** Quantité disponible. Zéro veut dire rupture, null veut dire « non dit ». */
  stock: number | null
  /** Vrai quand le fournisseur déclare le produit vendable. */
  available: boolean
}

/**
 * Ce que le connecteur peut demander à l'appelant pendant un relevé.
 *
 * Un seul besoin pour l'instant, mais il est réel : AliExpress renouvelle son
 * jeton d'accès en cours de route, et un jeton renouvelé qui n'est pas
 * réenregistré est un jeton perdu — le relevé suivant repart du périmé.
 */
export interface SupplierContext {
  /** Fusionne ces champs dans la liaison enregistrée du vendeur. */
  saveCredentials(patch: Record<string, string>): Promise<void>
}

export interface SupplierConnector {
  id: string
  label: string
  /** Relève prix et stock pour un lot de références. */
  fetchPrices(
    refs: string[],
    credentials: Record<string, string>,
    ctx?: SupplierContext,
  ): Promise<SupplierPrice[]>
}

/**
 * Une erreur qui dit ce qu'il faut faire.
 *
 * « 401 » ne répare rien. Le vendeur doit savoir si sa clé est refusée, si son
 * abonnement a expiré, ou si le fournisseur est simplement en panne — les trois
 * appellent trois gestes différents.
 */
export class SupplierError extends Error {
  constructor(
    message: string,
    /** Vrai quand le vendeur peut corriger lui-même (clé, abonnement). */
    readonly actionnable = false,
  ) {
    super(message)
    this.name = 'SupplierError'
  }
}
