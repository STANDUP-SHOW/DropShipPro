/**
 * Ce que coûte un visuel, en crédits images.
 *
 * **Le tarif est ici, et nulle part ailleurs.** Il était implicite — un crédit
 * par appel au modèle, quel que soit le travail — et l'écran le réécrivait de
 * son côté pour l'afficher. Deux endroits qui disent le prix finissent par ne
 * plus dire le même : le vendeur lit un chiffre avant de cliquer et en voit un
 * autre sur son solde.
 *
 * **Pourquoi une publicité vaut deux photos.** Une mise en situation est une
 * image, et rien de plus. Une publicité en est une aussi, mais précédée d'une
 * rédaction — l'accroche est écrite par un modèle de texte, avec un angle
 * imposé — puis suivie d'une composition : logo, prix, bouton, format propre à
 * chaque réseau. Trois travaux là où la photo en demande un.
 */

/** Une mise en situation : un crédit. */
export const COUT_PHOTO = 1

/** Une publicité : deux crédits, pour les trois étapes ci-dessus. */
export const COUT_PUB = 2

/**
 * Combien d'images au plus dans une même demande.
 *
 * Dix, et pas six. Six était un chiffre choisi pour que le bouton dise quelque
 * chose ; le vendeur veut choisir — une seule pour essayer un angle, dix pour
 * refaire une fiche entière. Un plafond demeure parce qu'une demande de cent
 * images tiendrait le modèle plusieurs minutes et ferait tomber la requête.
 */
export const PHOTOS_MAX = 10

export const TARIF_VISUELS = {
  photo: COUT_PHOTO,
  pub: COUT_PUB,
  photosMax: PHOTOS_MAX,
} as const
