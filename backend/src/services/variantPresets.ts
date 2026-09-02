/**
 * Les jeux d'options tout prêts, à poser sur un lot d'annonces.
 *
 * **Pourquoi des valeurs figées plutôt qu'un champ libre.** Un vendeur qui
 * ajoute « Pointure » à trente chaussures ne veut pas taper douze pointures
 * trente fois — et surtout, il les taperait différemment : « 42 », « 42 EU »,
 * « T.42 ». Trois écritures pour une même pointure, ce sont trois options chez
 * Shopify, trois filtres sur la boutique, et un acheteur qui ne trouve pas sa
 * taille.
 *
 * **La couleur n'a volontairement aucune valeur.** Contrairement aux tailles et
 * aux pointures, elle dépend du produit : proposer une liste de couleurs
 * standard ferait poser « Rouge, Bleu, Vert » sur une chaussure qui n'existe
 * qu'en noir. L'option est créée vide, et l'écran dit qu'elle reste à remplir
 * annonce par annonce.
 */

export interface JeuOptions {
  id: string
  /** Le nom de l'option, tel qu'il partira chez Shopify et sur les places de marché. */
  nom: string
  valeurs: string[]
  /** Ce que l'écran affiche pour expliquer ce que le clic va faire. */
  aide: string
}

export const JEUX_OPTIONS: JeuOptions[] = [
  {
    id: 'pointure',
    nom: 'Pointure',
    /*
     * Du 36 au 47, en pointures européennes.
     *
     * Les demi-pointures sont écartées : elles n'existent presque pas sur les
     * fiches des fournisseurs, et vingt-quatre valeurs au lieu de douze
     * doubleraient les combinaisons pour des choix que personne ne propose.
     */
    valeurs: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'],
    aide: 'Du 36 au 47. Retirez ensuite les pointures que vous ne vendez pas.',
  },
  {
    id: 'taille',
    nom: 'Taille',
    valeurs: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    aide: 'De S à XXXL. Retirez ensuite les tailles que vous ne vendez pas.',
  },
  {
    id: 'couleur',
    nom: 'Couleur',
    // Vide, et c'est le point : voir l'en-tête.
    valeurs: [],
    aide: "L'option est créée vide : les couleurs dépendent du produit et se renseignent annonce par annonce.",
  },
]

export function trouverJeu(id: string): JeuOptions | null {
  return JEUX_OPTIONS.find((j) => j.id === id) ?? null
}

/**
 * Pose un jeu d'options sur les variantes d'une annonce.
 *
 * **Ce qui existe n'est jamais écrasé.** Une annonce qui porte déjà des tailles
 * relevées chez le fournisseur — parce qu'elles sont justes, elles viennent de
 * lui — garde les siennes. Les remplacer par la liste standard ferait perdre un
 * relevé exact au profit d'une supposition, et sur un lot de trente annonces
 * personne ne s'en apercevrait.
 *
 * Rend `null` quand il n'y a rien à changer : l'appelant évite ainsi une
 * écriture inutile, et peut dire au vendeur combien d'annonces ont vraiment
 * bougé.
 */
export function poserJeu(
  variantes: Record<string, string[]> | null | undefined,
  jeu: JeuOptions,
): Record<string, string[]> | null {
  const actuelles = { ...(variantes ?? {}) }

  const dejaLa = actuelles[jeu.nom]
  if (Array.isArray(dejaLa) && dejaLa.length) return null

  actuelles[jeu.nom] = [...jeu.valeurs]
  return actuelles
}
