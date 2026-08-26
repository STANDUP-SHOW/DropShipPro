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

/** Ce qu'il faut savoir pour commander : quoi, combien, et où l'envoyer. */
export interface SupplierOrderRequest {
  /** Notre propre numéro de commande, renvoyé au fournisseur pour s'y retrouver. */
  reference: string
  /** La variante à commander chez le fournisseur. */
  variantRef: string
  quantity: number
  destinataire: {
    nom: string
    /** Le pays en deux lettres — la plupart des fournisseurs n'acceptent que ça. */
    paysCode: string
    pays?: string
    region?: string
    ville?: string
    adresse: string
    complement?: string
    codePostal?: string
    telephone?: string
    email?: string
  }
}

export interface SupplierOrderResult {
  /** L'identifiant de la commande chez le fournisseur. */
  supplierOrderId: string
  /** L'état donné par le fournisseur, dans ses propres mots. */
  status: string | null
  /** Ce que la commande coûte, port compris, quand le fournisseur le dit. */
  cost: number | null
  currency: string
  /** Où le vendeur va la payer ou la consulter. */
  url: string | null
}

export interface SupplierTracking {
  supplierOrderId: string
  status: string | null
  trackingNumber: string | null
  carrier: string | null
  /** Vrai quand le fournisseur déclare le colis parti. */
  expedie: boolean
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

  /**
   * Dépose la commande chez le fournisseur, **sans la payer**.
   *
   * Facultatif : tous les fournisseurs ne l'autorisent pas, et un connecteur qui
   * ne sait pas commander doit le dire en ne l'implémentant pas plutôt qu'en
   * levant une erreur au dernier moment, quand la vente est déjà encaissée.
   *
   * Le paiement reste au vendeur. C'est la même règle que pour la publication :
   * l'application remplit, l'humain valide. Un logiciel qui débite un compte
   * fournisseur tout seul sur une référence mal lue peut commander cent fois le
   * mauvais article avant que quiconque s'en aperçoive.
   */
  placeOrder?(
    commande: SupplierOrderRequest,
    credentials: Record<string, string>,
    ctx?: SupplierContext,
  ): Promise<SupplierOrderResult>

  /** Relève l'état et le numéro de suivi de commandes déjà passées. */
  fetchTracking?(
    supplierOrderIds: string[],
    credentials: Record<string, string>,
    ctx?: SupplierContext,
  ): Promise<SupplierTracking[]>

  /** Les variantes commandables d'un produit, pour savoir laquelle envoyer. */
  fetchVariants?(
    ref: string,
    credentials: Record<string, string>,
    ctx?: SupplierContext,
  ): Promise<Array<{ ref: string; label: string; price: number | null; stock: number | null }>>
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
