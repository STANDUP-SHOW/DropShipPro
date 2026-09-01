import type { Platform } from '@prisma/client'

/**
 * L'état du produit, dit dans le vocabulaire de chaque destination.
 *
 * Chaque place de marché a le sien, et ils ne se recouvrent pas. Vinted
 * distingue « neuf avec étiquette » de « neuf sans étiquette » ; Leboncoin a
 * quatre paliers dont aucun ne s'appelle « reconditionné » ; eBay et Google
 * n'en connaissent que trois. Traduire à la publication est la seule façon de
 * n'avoir qu'une valeur à tenir.
 *
 * **Ce que ça corrige :** le remplissage Leboncoin cochait « État neuf »
 * d'office. C'est vrai d'un produit importé de Chine, faux dès qu'on revend du
 * reconditionné — et une annonce dont l'état est faux se retire, quand elle ne
 * se termine pas en litige.
 */

export const ETATS = [
  {
    id: 'neuf',
    label: 'Neuf',
    aide: "Jamais utilisé, dans son emballage d'origine.",
  },
  {
    id: 'reconditionne',
    label: 'Reconditionné',
    aide: 'Remis à neuf et testé par un professionnel, avec garantie.',
  },
  {
    id: 'occasion',
    label: 'Occasion',
    aide: 'Déjà utilisé, vendu en l’état.',
  },
] as const

export type Etat = (typeof ETATS)[number]['id']

/** Vrai quand la valeur reçue est un état connu. */
export function estUnEtat(valeur: unknown): valeur is Etat {
  return typeof valeur === 'string' && ETATS.some((e) => e.id === valeur)
}

/*
 * Les libellés attendus par chaque destination, mot pour mot.
 *
 * Ce sont des chaînes à recopier dans un formulaire ou à envoyer dans un flux :
 * une approximation ne passe pas. « Très bon état » et « Très bon » ne sont pas
 * la même option chez Leboncoin.
 */
const TRADUCTIONS: Record<string, Record<Etat, string>> = {
  // Quatre paliers, et aucun ne s'appelle « reconditionné » : un reconditionné
  // se déclare au mieux « Très bon état », jamais neuf.
  LEBONCOIN: { neuf: 'État neuf', reconditionne: 'Très bon état', occasion: 'Bon état' },
  // Vinted sépare le neuf avec et sans étiquette. Sans information, « sans
  // étiquette » est le choix sûr : l'annoncer avec et ne pas la fournir est un
  // motif de litige.
  VINTED: { neuf: 'Neuf sans étiquette', reconditionne: 'Très bon état', occasion: 'Bon état' },
  EBAY: { neuf: 'Neuf', reconditionne: 'Reconditionné', occasion: 'Occasion' },
  AMAZON: { neuf: 'Neuf', reconditionne: 'Reconditionné', occasion: 'Occasion' },
  FACEBOOK: { neuf: 'Neuf', reconditionne: 'Comme neuf', occasion: "Bon état" },
  CDISCOUNT: { neuf: 'Neuf', reconditionne: 'Reconditionné', occasion: 'Occasion' },
}

/** Les trois valeurs que Google et Meta acceptent dans un flux produit. */
const FLUX: Record<Etat, string> = {
  neuf: 'new',
  reconditionne: 'refurbished',
  occasion: 'used',
}

/**
 * L'état, tel que cette destination l'attend.
 *
 * Les flux — Google Shopping, catalogue Meta — reçoivent la valeur anglaise
 * normalisée ; les formulaires reçoivent le libellé exact de leur liste
 * déroulante ; le reste reçoit le libellé français, qui se lit.
 */
export function etatPour(etat: string, platform: Platform | 'flux'): string {
  const valeur: Etat = estUnEtat(etat) ? etat : 'neuf'

  if (platform === 'flux' || platform === 'GOOGLE_SHOPPING' || platform === 'INSTAGRAM') {
    return FLUX[valeur]
  }

  const table = TRADUCTIONS[platform]
  if (table) return table[valeur]

  return ETATS.find((e) => e.id === valeur)!.label
}
