/**
 * Keepa — l'historique de prix et de ventes Amazon, quand la clé est là.
 *
 * Voulu le 10/09/2026 : la donnée qui manquait aux analyses de marché. Keepa est
 * une API OFFICIELLE et payante (pas du scraping) : elle donne le prix Amazon
 * actuel et moyen, le classement des ventes (Sales Rank) et, quand il existe, le
 * nombre vendu par mois. C'est le vrai « prix de vente constaté » et un signal
 * de demande réel.
 *
 * Tout est DERRIÈRE `KEEPA_API_KEY` et défensif : sans clé, sans correspondance,
 * ou sur la moindre panne réseau, on rend `null` et l'analyse reste best-effort —
 * jamais une erreur remontée au vendeur pour une donnée d'appoint.
 *
 * Coût : chaque appel consomme des tokens Keepa (facturés à l'abonnement). Le
 * coût est fondu dans les drops déjà facturés pour l'analyse ; on n'appelle donc
 * Keepa que là où le vendeur a payé une analyse, et de façon bornée dans les
 * tournées automatiques.
 */

/** L'identifiant du domaine Amazon France chez Keepa. */
const DOMAINE_FR = 4

export function keepaConfigure(): boolean {
  return Boolean(process.env.KEEPA_API_KEY)
}

export interface KeepaResume {
  asin: string
  titre: string
  /** Prix Amazon actuel, en euros. */
  prixActuel: number | null
  /** Prix moyen sur 90 jours, en euros. */
  prixMoyen90: number | null
  /** Classement des ventes Amazon (plus petit = vend plus). */
  salesRank: number | null
  /** Unités vendues le mois dernier, quand Keepa le donne. */
  ventesMois: number | null
  url: string
}

/** Les prix Keepa sont en centimes ; -1 (ou absent) veut dire « pas de donnée ». */
function centsVersEuros(v: unknown): number | null {
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n) / 100
}

interface KeepaProduit {
  asin?: string
  title?: string
  monthlySold?: number
  stats?: { current?: number[]; avg90?: number[] }
}

/**
 * Cherche un produit par son titre et rend son résumé Keepa, ou `null`.
 *
 * Deux appels au plus : la recherche (rend des ASIN), puis la fiche du meilleur
 * candidat si la recherche n'a pas déjà rendu l'objet complet.
 */
export async function keepaProduit(term: string): Promise<KeepaResume | null> {
  const key = process.env.KEEPA_API_KEY
  const terme = term.trim()
  if (!key || !terme) return null

  try {
    const recherche = await fetch(
      `https://api.keepa.com/search?key=${key}&domain=${DOMAINE_FR}&type=product&term=${encodeURIComponent(terme.slice(0, 300))}&stats=90`,
    )
    if (!recherche.ok) return null
    const data = (await recherche.json()) as { products?: KeepaProduit[]; asinList?: string[] }

    let produit: KeepaProduit | null = Array.isArray(data.products) && data.products.length ? data.products[0] : null
    if (!produit && Array.isArray(data.asinList) && data.asinList[0]) {
      const fiche = await fetch(`https://api.keepa.com/product?key=${key}&domain=${DOMAINE_FR}&asin=${data.asinList[0]}&stats=90`)
      if (!fiche.ok) return null
      const pd = (await fiche.json()) as { products?: KeepaProduit[] }
      produit = Array.isArray(pd.products) && pd.products.length ? pd.products[0] : null
    }
    if (!produit?.asin) return null

    const cur = Array.isArray(produit.stats?.current) ? produit.stats!.current : []
    const avg = Array.isArray(produit.stats?.avg90) ? produit.stats!.avg90 : []
    // Index Keepa : 0 = prix Amazon, 1 = neuf, 3 = Sales Rank, 18 = Buy Box.
    const prixActuel = centsVersEuros(cur[18]) ?? centsVersEuros(cur[0]) ?? centsVersEuros(cur[1])
    const prixMoyen90 = centsVersEuros(avg[18]) ?? centsVersEuros(avg[0]) ?? centsVersEuros(avg[1])
    const salesRank = typeof cur[3] === 'number' && cur[3] > 0 ? cur[3] : null
    const ventesMois = typeof produit.monthlySold === 'number' && produit.monthlySold > 0 ? produit.monthlySold : null

    return {
      asin: produit.asin,
      titre: typeof produit.title === 'string' ? produit.title : terme,
      prixActuel,
      prixMoyen90,
      salesRank,
      ventesMois,
      url: `https://www.amazon.fr/dp/${produit.asin}`,
    }
  } catch {
    return null
  }
}

/** Le résumé Keepa en une phrase française, pour le corps d'une analyse. */
export function keepaTexte(r: KeepaResume): string {
  const bouts: string[] = []
  if (r.prixActuel !== null) bouts.push(`prix Amazon ${r.prixActuel.toFixed(2)} €`)
  if (r.prixMoyen90 !== null) bouts.push(`moyenne 90 j ${r.prixMoyen90.toFixed(2)} €`)
  if (r.salesRank !== null) bouts.push(`classement des ventes n°${r.salesRank.toLocaleString('fr-FR')}`)
  if (r.ventesMois !== null) bouts.push(`~${r.ventesMois.toLocaleString('fr-FR')} vendus/mois`)
  const detail = bouts.length ? bouts.join(' · ') : 'aucune donnée de prix relevée'
  return `📊 Données Amazon (Keepa) — ${r.titre.slice(0, 80)} : ${detail}. Fiche : ${r.url}`
}
