import { rangerDansShopify, type CategorieSource } from './src/services/shopifyCatalog.js'

/**
 * Éprouve le rangement d'une fiche dans la taxonomie de Shopify.
 *
 * **La panne qu'il empêche de revenir.** Constatée le 15/09/2026 sur la vraie
 * boutique : mini-PC, SSD, tables de mixage et souris tous rangés dans
 * « Nettoyants pour appareils électroniques ». La cause tenait en une ligne —
 * on prenait la PREMIÈRE feuille rendue par la recherche de Shopify, qui est
 * approximative, sans vérifier qu'elle ressemblait à ce qu'on avait demandé.
 *
 * Le faux serveur écrit le contrat EN DUR (leçon du banc Kaufland) : il rend
 * les réponses telles que Shopify les rend vraiment, la mauvaise feuille en
 * tête, et c'est au code du connecteur de ne pas tomber dedans.
 */
let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const feuille = (id: string, fullName: string) => ({ id: `gid://shopify/TaxonomyCategory/${id}`, fullName, isLeaf: true, isArchived: false })

/**
 * Ce que la recherche de Shopify rend vraiment, relevé sur les cas qui ont
 * échoué. La mauvaise feuille est en PREMIÈRE position : c'est tout le sujet.
 */
const REPONSES: Record<string, Array<ReturnType<typeof feuille>>> = {
  // Le cas de la panne : « Nettoyants » sort en tête parce qu'il partage
  // « appareils électroniques » avec la recherche.
  Laptops: [
    feuille('el-6-1', 'Électronique > Entretien > Nettoyants pour appareils électroniques'),
    feuille('el-4-2', 'Électronique > Informatique > Ordinateurs portables'),
  ],
  'Computer Mice': [
    feuille('el-6-1', 'Électronique > Entretien > Nettoyants pour appareils électroniques'),
    feuille('el-4-9', 'Électronique > Informatique > Accessoires > Souris'),
  ],
  'Audio Mixers': [
    feuille('el-6-1', 'Électronique > Entretien > Nettoyants pour appareils électroniques'),
    feuille('el-7-3', 'Électronique > Sonorisation > Tables de mixage audio'),
  ],
  // Une recherche qui ne trouve rien de proche : aucune feuille ne doit passer.
  Perceuses: [feuille('ho-2-2', 'Maison et jardin > Entretien > Nettoyants pour sols')],
  // Le cas nominal : la bonne feuille est aussi la première.
  'Watch Bands': [feuille('ap-3-1', 'Vêtements et accessoires > Montres > Bracelets de montre')],
}

const appelSimule = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  if (query.includes('dropshipperTaxonomy')) {
    const search = String(variables.search)
    return { taxonomy: { categories: { nodes: REPONSES[search] ?? [] } } } as T
  }
  // Les collections : la boutique n'en a aucune, elles sont créées à la demande.
  if (query.includes('dropshipperFindCollection')) return { collections: { nodes: [] } } as T
  if (query.includes('dropshipperCreateCollection')) {
    const input = variables.input as { title: string }
    return {
      collectionCreate: { collection: { id: `gid://shopify/Collection/${input.title}` }, userErrors: [] },
    } as T
  }
  throw new Error(`requête inattendue : ${query.slice(0, 40)}`)
}

const source = (label: string, google: string, path: string): CategorieSource => ({
  label,
  path,
  google,
  targets: null,
})

const CAS: Array<[string, CategorieSource, string | null]> = [
  [
    'un ordinateur portable ne part pas chez les nettoyants',
    source('Ordinateurs portables', 'Electronics > Computers > Laptops', 'High-tech > Informatique > Portables'),
    'gid://shopify/TaxonomyCategory/el-4-2',
  ],
  [
    'une souris non plus',
    source('Souris', 'Electronics > Computer Accessories > Computer Mice', 'High-tech > Périphériques > Souris'),
    'gid://shopify/TaxonomyCategory/el-4-9',
  ],
  [
    'une table de mixage non plus',
    source('Tables de mixage', 'Electronics > Audio > Audio Mixers', 'High-tech > Son > Mixage'),
    'gid://shopify/TaxonomyCategory/el-7-3',
  ],
  [
    'sans feuille qui ressemble, AUCUNE catégorie plutôt qu’une fausse',
    source('Perceuses', 'Hardware > Tools > Perceuses', 'Bricolage > Outillage > Perceuses'),
    null,
  ],
  [
    'le cas nominal passe toujours',
    source('Bracelets de montre', 'Apparel & Accessories > Watches > Watch Bands', 'Mode > Montres > Bracelets'),
    'gid://shopify/TaxonomyCategory/ap-3-1',
  ],
]

for (const [titre, categorie, attendu] of CAS) {
  const r = await rangerDansShopify(appelSimule, categorie)
  const vu = r.categoryId ?? null
  exige(vu === attendu, `${titre}\n  attendu ${attendu}\n  vu      ${vu}`)
}

// Une correspondance déjà mémorisée n'est jamais recherchée à nouveau.
let appels = 0
const compte = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  if (query.includes('dropshipperTaxonomy')) appels++
  return appelSimule<T>(query, variables)
}
const memorisee: CategorieSource = {
  ...source('Souris', 'Electronics > Computer Accessories > Computer Mice', 'High-tech > Périphériques > Souris'),
  targets: { shopify: { id: 'gid://shopify/TaxonomyCategory/el-4-9', fullName: 'Souris' } },
}
const r = await rangerDansShopify(compte, memorisee)
exige(
  r.categoryId === 'gid://shopify/TaxonomyCategory/el-4-9' && appels === 0,
  `mémoire : ${appels} recherche(s) alors qu’une correspondance était connue`,
)

// Une catégorie sans rangement doit le DIRE, pas échouer en silence.
const sansFeuille = await rangerDansShopify(
  appelSimule,
  source('Perceuses', 'Hardware > Tools > Perceuses', 'Bricolage > Outillage > Perceuses'),
)
exige(
  sansFeuille.notes.length > 0,
  'une catégorie non rangée doit laisser une note lisible sur la publication',
)

console.log(echecs === 0 ? 'Rangement Shopify : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
