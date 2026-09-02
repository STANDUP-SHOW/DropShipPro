/**
 * L'enseigne posée sur une publicité : le nom et le logo, de la même boutique.
 *
 * **Ils se dissociaient**, signalé le 02/09/2026. Choisir une boutique changeait
 * le logo, mais le nom restait celui de la boutique où l'annonce était rangée.
 * Un vendeur qui tient quatre sites recevait donc le logo de l'un sous le nom
 * d'un autre — une publicité qui ne correspond à aucune de ses enseignes, et
 * qu'il ne peut donc pas publier.
 *
 * La règle tient en une phrase : **on ne mélange jamais deux niveaux**. Dès
 * qu'une boutique est retenue, son nom et son logo viennent d'elle, y compris
 * quand l'un des deux manque. Retomber sur le compte pour le seul logo
 * remettrait exactement le défaut qu'on corrige — et il ne se verrait qu'une
 * fois la publicité sortie.
 */

export interface Enseigne {
  nom: string | null
  logo: string | null
  /** D'où elle vient, pour l'écrire dans une réponse ou un journal. */
  origine: 'boutique-choisie' | 'boutique-de-l-annonce' | 'compte'
}

export interface SourcesEnseigne {
  /** La boutique demandée pour cette publicité-ci. */
  choisie?: { name: string; logo: string | null } | null
  /** Celle où l'annonce est rangée. */
  duProduit?: { name: string; logo: string | null } | null
  /** Le compte, dernier recours. */
  compte: { shopName: string | null; watermarkImage: string | null }
}

export function enseignePour(s: SourcesEnseigne): Enseigne {
  const boutique = s.choisie ?? s.duProduit ?? null

  if (boutique) {
    return {
      nom: boutique.name,
      // Volontairement `null` et non le logo du compte : une boutique sans logo
      // sort sans logo. Mieux vaut une publicité sobre qu'une publicité qui
      // signe une enseigne avec la marque d'une autre.
      logo: boutique.logo ?? null,
      origine: s.choisie ? 'boutique-choisie' : 'boutique-de-l-annonce',
    }
  }

  /*
   * Aucune boutique : le compte prend la main.
   *
   * C'est le cas du vendeur qui ne fait que des places de marché et n'a jamais
   * créé de site. Son nom de boutique et le logo de son filigrane sont alors la
   * seule marque qu'il ait — et ils vont ensemble, eux aussi.
   */
  return {
    nom: s.compte.shopName ?? null,
    logo: s.compte.watermarkImage ?? null,
    origine: 'compte',
  }
}
