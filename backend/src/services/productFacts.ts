import type { Product } from '@prisma/client'

/**
 * Lire dans une fiche les faits qu'une boutique attend en champs, pas en prose.
 *
 * Le poids, le pays d'origine, le code douanier et le code-barres arrivent de la
 * source noyés dans les caractéristiques : « Poids : 450 g », « Fabriqué en
 * Chine ». Écrits là, ils se lisent ; rangés dans les champs de Shopify, ils
 * calculent les frais de port, remplissent la déclaration douanière et
 * rapprochent le produit de sa fiche Google.
 *
 * **Rien n'est deviné.** Un pays d'origine inventé est une mention légale
 * fausse ; un code-barres inventé fait rejeter le produit par Google Shopping,
 * ce qui est pire que de ne pas en envoyer. Chaque lecture ci-dessous exige une
 * forme reconnaissable, et rend `undefined` au moindre doute.
 *
 * Déterministe et gratuit : aucun appel au modèle, donc utilisable sur les
 * produits déjà importés sans rien repayer.
 */

/** Retire accents et casse : « Fabriqué en Chine » et « fabrique en chine ». */
const nu = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

/** Les caractéristiques d'un produit, sous leur forme brute. */
function caracteristiques(product: Pick<Product, 'attributes'>): Array<[string, string]> {
  const brut = product.attributes
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return []
  return Object.entries(brut as Record<string, unknown>).filter(
    (paire): paire is [string, string] => typeof paire[1] === 'string' && paire[1].trim().length > 0,
  )
}

/** La première caractéristique dont l'intitulé contient un de ces mots. */
function valeurPour(product: Pick<Product, 'attributes'>, mots: string[]): string | undefined {
  for (const [cle, valeur] of caracteristiques(product)) {
    const c = nu(cle)
    if (mots.some((m) => c.includes(m))) return valeur.trim()
  }
  return undefined
}

// --- Le poids ---------------------------------------------------------------

export interface Poids {
  value: number
  unit: 'GRAMS' | 'KILOGRAMS' | 'POUNDS' | 'OUNCES'
}

const UNITES: Array<[RegExp, Poids['unit'], number]> = [
  [/^(kg|kgs|kilo|kilos|kilogramme?s?)$/, 'KILOGRAMS', 1],
  [/^(g|gr|grammes?|grams?)$/, 'GRAMS', 1],
  [/^(mg|milligrammes?)$/, 'GRAMS', 0.001],
  [/^(lb|lbs|pounds?|livres?)$/, 'POUNDS', 1],
  [/^(oz|ounces?|onces?)$/, 'OUNCES', 1],
]

/**
 * Le poids du produit, quand il est écrit et lisible.
 *
 * La virgule décimale française est acceptée : « 1,2 kg » est le format que
 * rendent la moitié des fiches, et le lire comme « 1 » ferait sous-facturer le
 * port sur chaque commande.
 */
export function poidsDe(product: Pick<Product, 'attributes'>): Poids | undefined {
  const texte = valeurPour(product, ['poids', 'weight', 'masse'])
  if (!texte) return undefined

  const m = /^([\d]+(?:[.,]\d+)?)\s*([a-zA-Zéè]+)/.exec(texte.trim())
  if (!m) return undefined

  const value = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return undefined

  const unite = UNITES.find(([motif]) => motif.test(nu(m[2])))
  if (!unite) return undefined

  const [, unit, facteur] = unite
  const converti = value * facteur
  // Un poids nul après conversion (« 0,4 mg ») n'est pas un poids d'expédition.
  return converti > 0 ? { value: Number(converti.toFixed(3)), unit } : undefined
}

// --- Le pays d'origine ------------------------------------------------------

/*
 * Les pays qu'on rencontre vraiment sur une fiche de dropshipping.
 *
 * La liste est courte exprès. Elle rate un pays exotique ; le manquer laisse le
 * champ vide, ce qui est vrai. Le deviner écrirait une mention d'origine fausse
 * sur une fiche commerciale, et c'est une infraction, pas une imprécision.
 */
const PAYS: Array<[string[], string]> = [
  [['chine', 'china', 'cn', 'prc'], 'CN'],
  [['france', 'francais', 'francaise'], 'FR'],
  [['allemagne', 'germany', 'deutschland'], 'DE'],
  [['italie', 'italy', 'italia'], 'IT'],
  [['espagne', 'spain'], 'ES'],
  [['portugal'], 'PT'],
  [['pologne', 'poland'], 'PL'],
  [['royaume-uni', 'royaume uni', 'angleterre', 'united kingdom'], 'GB'],
  [['etats-unis', 'etats unis', 'united states', 'usa'], 'US'],
  [['japon', 'japan'], 'JP'],
  [['coree du sud', 'coree', 'south korea', 'korea'], 'KR'],
  [['taiwan', 'taiwan'], 'TW'],
  [['vietnam', 'viet nam'], 'VN'],
  [['inde', 'india'], 'IN'],
  [['turquie', 'turkey', 'turkiye'], 'TR'],
  [['bangladesh'], 'BD'],
  [['indonesie', 'indonesia'], 'ID'],
  [['thailande', 'thailand'], 'TH'],
  [['maroc', 'morocco'], 'MA'],
  [['pays-bas', 'pays bas', 'netherlands'], 'NL'],
]

/** Le pays de fabrication en deux lettres, quand la fiche le nomme. */
export function paysOrigineDe(product: Pick<Product, 'attributes'>): string | undefined {
  const texte = valeurPour(product, ['origine', 'fabriqu', 'made in', 'pays', 'provenance'])
  if (!texte) return undefined
  const t = nu(texte)
  // Le plus long d'abord : « coree du sud » avant « coree ».
  const trouve = PAYS.flatMap(([noms, code]) => noms.map((n) => [n, code] as const))
    .sort((a, b) => b[0].length - a[0].length)
    .find(([nom]) => new RegExp(`(^|[^a-z])${nom}([^a-z]|$)`).test(t))
  return trouve?.[1]
}

// --- Le code douanier -------------------------------------------------------

/** Le code SH, quand la fiche le porte : six à treize chiffres, rien d'autre. */
export function codeDouanierDe(product: Pick<Product, 'attributes'>): string | undefined {
  const texte = valeurPour(product, ['code sh', 'code douanier', 'hs code', 'harmonized', 'douane'])
  if (!texte) return undefined
  const chiffres = texte.replace(/\D/g, '')
  return chiffres.length >= 6 && chiffres.length <= 13 ? chiffres : undefined
}

// --- Le code-barres ---------------------------------------------------------

/**
 * La clé de contrôle d'un EAN/UPC, vérifiée plutôt que crue.
 *
 * Un code-barres faux ne se voit nulle part : Shopify l'accepte, la boutique
 * l'affiche, et c'est Google Shopping qui rejette la fiche des semaines plus
 * tard en désignant un « GTIN invalide ». La clé se recalcule en trois lignes,
 * et un chiffre transposé se voit tout de suite.
 */
function cleValide(code: string): boolean {
  const chiffres = [...code].map(Number)
  const cle = chiffres.pop()!
  const somme = chiffres
    .reverse()
    .reduce((total, n, i) => total + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (somme % 10)) % 10 === cle
}

/** Le code-barres du produit, quand il est présent **et** cohérent. */
export function codeBarresDe(product: Pick<Product, 'attributes'>): string | undefined {
  const texte = valeurPour(product, ['ean', 'gtin', 'upc', 'code-barres', 'code barres', 'barcode', 'isbn'])
  if (!texte) return undefined
  const chiffres = texte.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(chiffres.length)) return undefined
  return cleValide(chiffres) ? chiffres : undefined
}

// --- L'adresse de la fiche --------------------------------------------------

/**
 * Le `handle` : le morceau d'adresse sous lequel la fiche vivra.
 *
 * Laissé à Shopify, il est construit à partir du titre — et nos titres font
 * jusqu'à deux cents caractères pour le référencement des places de marché. La
 * fiche prend alors une adresse de deux lignes, illisible dans un partage, et
 * que plus personne n'ose changer une fois qu'elle a des liens entrants.
 *
 * Coupé au mot : une adresse tronquée au milieu d'un mot se lit mal et n'aide
 * pas au référencement.
 */
export function handleDe(titre: string, max = 70): string {
  const base = nu(titre)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (base.length <= max) return base
  const coupe = base.slice(0, max)
  const dernier = coupe.lastIndexOf('-')
  return (dernier > max / 2 ? coupe.slice(0, dernier) : coupe).replace(/-+$/, '')
}

/**
 * L'UGS : la référence sous laquelle le vendeur retrouve son produit.
 *
 * La référence fournisseur est la bonne clé quand elle existe — c'est elle qui
 * relie l'annonce à ce qu'il faut commander, et c'est ce qu'on veut lire sur un
 * bon de commande. Sinon, l'identifiant interne : moins parlant, mais unique et
 * stable, ce qu'une UGS doit être avant tout.
 */
export function ugsDe(product: Pick<Product, 'id' | 'supplierId' | 'supplierRef'>): string {
  if (product.supplierRef) {
    const prefixe = product.supplierId ? `${product.supplierId.toUpperCase()}-` : ''
    return `${prefixe}${product.supplierRef}`.slice(0, 60)
  }
  return `DSP-${product.id.slice(-10).toUpperCase()}`
}
