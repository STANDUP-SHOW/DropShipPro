/**
 * La grille tarifaire d un produit d imprimerie, et ce qu on en fait.
 *
 * Un imprimeur en ligne ne vend pas un produit à un prix : il vend un devis.
 * Le prix d une carte de visite dépend du format, du grammage, de
 * l orientation, du recto-verso, **de la quantité** et **du délai choisi** —
 * six dimensions dont deux ne sont pas des variantes au sens des places de
 * marché. Une seule fiche fait couramment plusieurs centaines de lignes.
 *
 * Ce fichier ne relève rien. Il définit la forme que doit prendre un relevé,
 * la vérifie, et sait en tirer les deux chiffres dont une boutique a besoin :
 * le prix d appel (« à partir de ») et le prix d une sélection précise.
 *
 * **Pourquoi la marge est appliquée ici et pas au relevé :** un nouveau relevé
 * remplace la grille en bloc. Si les prix de vente y étaient écrits, chaque
 * rafraîchissement des tarifs fournisseur écraserait la politique de prix du
 * vendeur, et changer de marge obligerait à tout relever.
 */

export interface DimensionImprimerie {
  cle: string
  libelle: string
  options: Array<{ valeur: string; libelle?: string }>
}

export interface LigneTarif {
  /** La combinaison d options, par clé de dimension. */
  combo: Record<string, string>
  quantite: number
  /** Le délai, en jours ouvrés. C est lui qui fait varier le prix du simple au double. */
  delaiJours: number
  /** Le prix hors taxes du fournisseur, avant notre marge. */
  prixHt: number
  /** La remise que le fournisseur affiche sur ce délai, à titre indicatif. */
  remisePct?: number
  /** Le port, quand il est connu. Séparé du prix : tous les délais ne l incluent pas. */
  port?: number
}

export class ReleveInvalide extends Error {}

/**
 * Vérifie et normalise un relevé.
 *
 * Un relevé arrive de l extérieur — extension, script du vendeur — donc rien
 * n est supposé. Un relevé à moitié valide est pire qu un relevé refusé : il
 * publierait une boutique dont certains prix sont `NaN`, ce qui ne se voit
 * qu au moment où un client commande.
 */
export function validerReleve(brut: unknown): { dimensions: DimensionImprimerie[]; rows: LigneTarif[] } {
  const source = brut as { dimensions?: unknown; priceRows?: unknown; rows?: unknown }
  const dimsBrutes = Array.isArray(source?.dimensions) ? source.dimensions : []
  const rowsBrutes = Array.isArray(source?.priceRows)
    ? source.priceRows
    : Array.isArray(source?.rows)
      ? source.rows
      : null

  if (!rowsBrutes) throw new ReleveInvalide('Le relevé ne contient aucune grille de prix (`priceRows`).')
  if (!rowsBrutes.length) throw new ReleveInvalide('La grille de prix est vide.')

  const dimensions: DimensionImprimerie[] = dimsBrutes.map((d: any, i: number) => {
    if (!d?.cle || !Array.isArray(d?.options)) {
      throw new ReleveInvalide(`Dimension ${i + 1} : il faut une « cle » et une liste « options ».`)
    }
    return {
      cle: String(d.cle),
      libelle: String(d.libelle ?? d.cle),
      options: d.options.map((o: any) =>
        typeof o === 'string'
          ? { valeur: o }
          : { valeur: String(o.valeur ?? o.value), libelle: o.libelle ? String(o.libelle) : undefined },
      ),
    }
  })

  const rows: LigneTarif[] = rowsBrutes.map((r: any, i: number) => {
    const prix = Number(r?.prixHt ?? r?.price_ht ?? r?.prix)
    const quantite = Number(r?.quantite ?? r?.quantity)
    if (!Number.isFinite(prix) || prix <= 0) {
      throw new ReleveInvalide(`Ligne ${i + 1} : prix illisible (« ${r?.prixHt ?? r?.price_ht} »).`)
    }
    if (!Number.isFinite(quantite) || quantite <= 0) {
      throw new ReleveInvalide(`Ligne ${i + 1} : quantité illisible (« ${r?.quantite ?? r?.quantity} »).`)
    }
    return {
      combo: (r?.combo ?? {}) as Record<string, string>,
      quantite,
      // Sans délai lisible, on prend le plus long plutôt que zéro : annoncer
      // « livré demain » sur une supposition est la promesse qu on ne tient pas.
      delaiJours: Number.isFinite(Number(r?.delaiJours ?? r?.delay_days))
        ? Number(r.delaiJours ?? r.delay_days)
        : 10,
      prixHt: prix,
      remisePct: Number.isFinite(Number(r?.remisePct)) ? Number(r.remisePct) : undefined,
      port: Number.isFinite(Number(r?.port ?? r?.shipping_price)) ? Number(r.port ?? r.shipping_price) : undefined,
    }
  })

  return { dimensions, rows }
}

/** Le prix de vente d une ligne : prix fournisseur plus marge, arrondi au centime. */
export function prixDeVente(ligne: LigneTarif, margePct: number): number {
  return Math.round(ligne.prixHt * (1 + margePct / 100) * 100) / 100
}

/**
 * Le prix d appel : le moins cher de toute la grille.
 *
 * C est le seul chiffre qu un flux produit sait porter — Google Shopping, Meta
 * et toutes les places de marché veulent **un** prix par article. Il est donné
 * pour ce qu il est, « à partir de », avec la quantité et le délai qui le
 * produisent : un prix d appel sans sa quantité est trompeur, et se retourne en
 * litige quand l acheteur découvre qu il vaut pour 7 500 exemplaires.
 */
export function prixDAppel(rows: LigneTarif[], margePct: number) {
  if (!rows.length) return null
  const moinsCher = rows.reduce((a, b) => (b.prixHt < a.prixHt ? b : a))
  return {
    prix: prixDeVente(moinsCher, margePct),
    quantite: moinsCher.quantite,
    delaiJours: moinsCher.delaiJours,
    combo: moinsCher.combo,
  }
}

/**
 * Ce que la grille contient, en une phrase.
 *
 * Sert la liste du back-office : « 3 dimensions, 288 lignes, de 19,90 € à
 * 412,00 € » dit d un coup d œil si le relevé a réussi. Une fiche à quatre
 * lignes est un relevé qui s est arrêté en route, et sans ce résumé ça ne se
 * voit qu en ouvrant le JSON.
 */
export function resumeGrille(rows: LigneTarif[], margePct: number) {
  if (!rows.length) return { lignes: 0, min: null, max: null, quantites: [], delais: [] }
  const prix = rows.map((r) => prixDeVente(r, margePct))
  return {
    lignes: rows.length,
    min: Math.min(...prix),
    max: Math.max(...prix),
    quantites: [...new Set(rows.map((r) => r.quantite))].sort((a, b) => a - b),
    delais: [...new Set(rows.map((r) => r.delaiJours))].sort((a, b) => a - b),
  }
}
