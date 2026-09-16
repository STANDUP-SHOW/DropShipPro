import type { Product } from '@prisma/client'

/**
 * L'export du catalogue au format de Faire.
 *
 * **Faire n'a pas d'API d'annonces**, et n'en propose pas. Son portail marque
 * offre quatre voies : raccorder Shopify, déposer une feuille de calcul, coller
 * jusqu'à dix adresses de fiches, ou saisir à la main. La feuille de calcul est
 * la seule qui passe à l'échelle, et c'est celle-ci.
 *
 * **Le gabarit n'est pas inventé.** Les quarante-neuf colonnes ci-dessous ont
 * été lues dans le modèle officiel téléchargé depuis le portail marque le
 * 16/09/2026 (`/api/brand/…/bulk-products/import-template`), un XLSX dont la
 * deuxième ligne porte les intitulés et la première la mention « Obligatoire »
 * ou « Facultatif ». C'est la leçon Kaufland : un contrat écrit de mémoire
 * valide une faute des deux côtés.
 *
 * ---
 *
 * **Ce que ce fichier oblige à regarder en face : Faire est du B2B.**
 *
 * Trois colonnes obligatoires n'existent nulle part dans notre catalogue, et
 * aucune ne s'invente :
 *
 * - **Prix revendeur** — le prix de GROS, celui que paie le détaillant. Nous
 *   stockons un prix d'achat fournisseur et un prix de vente au public. Le prix
 *   de gros est un troisième prix, et c'est une décision commerciale du vendeur,
 *   pas un calcul. Par défaut on applique la convention du métier — la moitié du
 *   prix de vente — et on le DIT, parce qu'un défaut silencieux sur un prix est
 *   la meilleure façon de vendre à perte sans s'en apercevoir.
 * - **Quantité minimale par commande** et **unités par carton** — un détaillant
 *   n'achète pas à l'unité. Défauts à 1, à ajuster.
 * - **Méthode de vente** — à l'unité ou par carton.
 *
 * **Et le garde-fou qui compte** : une ligne dont le prix de gros descend sous
 * le prix d'achat fournisseur n'est pas exportée. Vendre à perte en gros, c'est
 * perdre sur chaque carton, pas sur chaque pièce.
 */

/**
 * Les quarante-neuf colonnes, dans l'ordre exact du modèle officiel.
 *
 * L'ordre compte : Faire lit la position autant que l'intitulé. Ne pas
 * réordonner, ne pas « nettoyer » les intitulés — les deux-points et les
 * espaces de « Prix revendeur : (EUR) » sont les leurs.
 */
export const COLONNES_FAIRE = [
  'Nom du produit',
  'Description',
  'Images du produit',
  'Prix revendeur : (EUR)',
  'Prix de vente (EUR)',
  'Prix revendeur : (USD)',
  'Prix de vente (USD)',
  'Prix revendeur : (CAD)',
  'Prix de vente (CAD)',
  'Prix revendeur : (GBP)',
  'Prix de vente (GBP)',
  'Prix revendeur : (AUD)',
  'Prix de vente (AUD)',
  'Méthode de vente',
  'Unités par carton',
  'Quantité minimale par commande',
  "Poids de l'article",
  "Unité de poids de l'article",
  "Longueur de l'article",
  "Largeur de l'article",
  "Hauteur de l'article",
  "Unités de mesure pour les dimensions de l'article",
  "Poids avec l'emballage",
  "Unité de mesure pour le poids avec l'emballage",
  "Longueur avec l'emballage",
  "Largeur avec l'emballage",
  "Hauteur avec l'emballage",
  "Unité de mesure pour les dimensions avec l'emballage",
  "Type d'option",
  'Option(s)',
  "Type d'option 2",
  'Option(s) 2',
  "Type d'option 3",
  'Option(s) 3',
  'UGS',
  'GTIN',
  'Types de produits',
  'Statut du produit',
  'Pays de fabrication',
  "Prix de l'échantillon (EUR)",
  "Prix de l'échantillon (USD)",
  "Prix de l'échantillon (CAD)",
  "Prix de l'échantillon (GBP)",
  "Prix de l'échantillon (AUD)",
  "Prix de l'échantillon (SEK)",
  'Précommande',
  "Date d'expédition",
  "Date d'expédition finale",
  'Date limite de commande',
] as const

/** Les colonnes que Faire refuse vides. Sert au contrôle avant dépôt. */
export const OBLIGATOIRES_FAIRE = [
  'Nom du produit',
  'Description',
  'Images du produit',
  'Prix revendeur : (EUR)',
  'Prix de vente (EUR)',
  'Méthode de vente',
  'Unités par carton',
  'Quantité minimale par commande',
] as const

export interface OptionsFaire {
  /**
   * La part du prix de vente que paie le détaillant. 0,5 est la convention du
   * commerce de gros — le détaillant double pour revendre. C'est un DÉFAUT, pas
   * une recommandation : le vendeur doit le revoir produit par produit.
   */
  remiseGros?: number
  unitesParCarton?: number
  quantiteMinimale?: number
  /** « Par unité » ou « Par carton », dans les mots de Faire. */
  methodeVente?: string
  paysFabrication?: string
}

const DEFAUTS: Required<Omit<OptionsFaire, 'paysFabrication'>> = {
  remiseGros: 0.5,
  unitesParCarton: 1,
  quantiteMinimale: 1,
  methodeVente: 'Par unité',
}

/** Un champ CSV, échappé selon la règle du format : guillemets doublés. */
function champ(valeur: string | number | null | undefined): string {
  const v = valeur === null || valeur === undefined ? '' : String(valeur)
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function deuxDecimales(n: number): string {
  return n.toFixed(2)
}

/** Les images, telles que Faire les attend : des adresses séparées par des virgules. */
function imagesDe(produit: Product): string[] {
  const brut = (produit.exportImages ?? produit.images) as unknown
  if (!Array.isArray(brut)) return []
  return brut
    .map((i) => (typeof i === 'string' ? i : typeof i === 'object' && i && 'url' in i ? String((i as { url: unknown }).url) : ''))
    .filter((u) => /^https?:\/\//i.test(u))
}

/**
 * Les trois premières dimensions de variantes, au format de Faire.
 *
 * Faire prend un NOM d'option et la LISTE de ses valeurs, et fabrique les
 * combinaisons lui-même — l'inverse de Shopify, qui veut une ligne par
 * combinaison. Au-delà de trois dimensions il ignore le reste ; on tronque
 * plutôt que d'échouer, et le contrôle le signale.
 */
function optionsDe(produit: Product): Array<{ nom: string; valeurs: string }> {
  const v = produit.variants as unknown
  if (!v || typeof v !== 'object' || Array.isArray(v)) return []
  return Object.entries(v as Record<string, unknown>)
    .filter(([, valeurs]) => Array.isArray(valeurs) && valeurs.length > 0)
    .slice(0, 3)
    .map(([nom, valeurs]) => ({ nom, valeurs: (valeurs as unknown[]).map(String).join(', ') }))
}

export interface LigneFaire {
  valeurs: string[]
  /** Renseigné quand la ligne est écartée : la raison, dans les mots du vendeur. */
  refus?: string
}

export function ligneFaire(produit: Product, options: OptionsFaire = {}): LigneFaire {
  const o = { ...DEFAUTS, ...options }
  const vente = Number(produit.sellingPrice)
  const achat = Number(produit.price) + Number(produit.shippingCost)
  const gros = Math.round(vente * o.remiseGros * 100) / 100
  const images = imagesDe(produit)
  const opts = optionsDe(produit)

  const vide = new Array(COLONNES_FAIRE.length).fill('')

  /*
   * Les refus, du plus grave au plus bête. Chacun dit quoi corriger : « erreur »
   * ne répare rien, et un dépôt refusé par Faire arrive des heures plus tard,
   * loin de l'écran où le vendeur aurait pu agir.
   */
  if (!vente) return { valeurs: vide, refus: "aucun prix de vente : Faire refuse une ligne sans prix." }
  if (!images.length) {
    return { valeurs: vide, refus: 'aucune photo en adresse absolue : Faire exige au moins une image par produit.' }
  }
  if (gros <= achat) {
    return {
      valeurs: vide,
      refus: `prix de gros ${deuxDecimales(gros)} € sous le prix d'achat ${deuxDecimales(achat)} € : chaque carton vendu perdrait de l'argent.`,
    }
  }

  const ligne = [...vide]
  const mettre = (colonne: (typeof COLONNES_FAIRE)[number], valeur: string) => {
    ligne[COLONNES_FAIRE.indexOf(colonne)] = valeur
  }

  mettre('Nom du produit', produit.aiTitle || produit.title)
  /*
   * Les balises deviennent des espaces, puis les espaces se resserrent. Sans le
   * second passage, « <p>Un <b>bon</b> produit</p> » sort en « Un  bon  produit »
   * — Faire l'enregistre tel quel et le détaillant le lit tel quel.
   */
  mettre(
    'Description',
    (produit.aiDescription || produit.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  )
  mettre('Images du produit', images.join(', '))
  mettre('Prix revendeur : (EUR)', deuxDecimales(gros))
  mettre('Prix de vente (EUR)', deuxDecimales(vente))
  mettre('Méthode de vente', o.methodeVente)
  mettre('Unités par carton', String(o.unitesParCarton))
  mettre('Quantité minimale par commande', String(o.quantiteMinimale))
  mettre('UGS', produit.supplierRef || produit.id)
  mettre('Statut du produit', 'Publié')
  if (options.paysFabrication) mettre('Pays de fabrication', options.paysFabrication)

  if (opts[0]) { mettre("Type d'option", opts[0].nom); mettre('Option(s)', opts[0].valeurs) }
  if (opts[1]) { mettre("Type d'option 2", opts[1].nom); mettre('Option(s) 2', opts[1].valeurs) }
  if (opts[2]) { mettre("Type d'option 3", opts[2].nom); mettre('Option(s) 3', opts[2].valeurs) }

  return { valeurs: ligne }
}

export interface CatalogueFaire {
  csv: string
  retenus: number
  /** Ce qui a été écarté, produit par produit, avec la raison. */
  ecartes: Array<{ id: string; titre: string; raison: string }>
}

export function catalogueFaire(produits: Product[], options: OptionsFaire = {}): CatalogueFaire {
  const lignes: string[] = [COLONNES_FAIRE.map(champ).join(',')]
  const ecartes: CatalogueFaire['ecartes'] = []

  for (const p of produits) {
    const l = ligneFaire(p, options)
    if (l.refus) {
      ecartes.push({ id: p.id, titre: p.aiTitle || p.title, raison: l.refus })
      continue
    }
    lignes.push(l.valeurs.map(champ).join(','))
  }

  /*
   * Le BOM, et ce n'est pas un détail : Faire accepte le .csv, et Excel — par
   * lequel passent beaucoup de vendeurs avant de déposer — lit un fichier UTF-8
   * sans BOM comme du latin-1. « Écouteurs » y devient « Ã‰couteurs », et c'est
   * ce que Faire enregistre.
   */
  return { csv: '﻿' + lignes.join('\r\n') + '\r\n', retenus: lignes.length - 1, ecartes }
}
