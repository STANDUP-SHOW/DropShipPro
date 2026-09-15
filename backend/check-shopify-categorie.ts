import { rangerDansShopify, pertinence, type CategorieSource, type DemandeModele } from './src/services/shopifyCatalog.js'

/**
 * Éprouve le rangement d'une fiche dans la taxonomie de Shopify.
 *
 * **La panne qu'il empêche de revenir**, et la leçon de méthode qui va avec.
 * Le 15/09/2026, mini-PC, SSD, tables de mixage et souris se sont tous
 * retrouvés dans « Nettoyants pour appareils électroniques » : on prenait la
 * PREMIÈRE feuille rendue par la recherche de Shopify, qui est approximative.
 *
 * Un premier correctif a été écrit, et **ce banc l'a validé alors que la
 * réalité échouait encore** — exactement le piège déjà consigné pour
 * `check-recommandations.cjs`. Ses fausses réponses étaient des chemins
 * français inventés (« Électronique > Entretien > Nettoyants… ») pendant que
 * Shopify rend des chemins ANGLAIS, et ses catégories d'essai portaient un
 * chemin Google précis (« Electronics > Computers > Laptops ») alors que
 * **143 de nos 249 catégories n'ont qu'un rayon** (« Electronics » tout court).
 * Le banc éprouvait un cas confortable qui n'existe pas dans la base.
 *
 * Les réponses ci-dessous sont donc **celles relevées sur la vraie boutique**
 * (`sonder-taxonomie.ts`, oguss-france, 15/09/2026), recopiées telles quelles,
 * ordre compris. Le contrat est écrit en dur, y compris les deux recherches
 * françaises qui ne rendent RIEN — c'est ce vide qui oblige à traduire.
 */
let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const noeud = (id: string, fullName: string, isLeaf = true) => ({
  id: `gid://shopify/TaxonomyCategory/${id}`,
  fullName,
  isLeaf,
  isArchived: false,
})

/** Mot pour mot ce que la taxonomie de Shopify a répondu le 15/09/2026. */
const REPONSES: Record<string, Array<ReturnType<typeof noeud>>> = {
  // Le rayon seul : huit feuilles du bon rayon et une d'un autre, aucune juste.
  // C'est la recherche qui rangeait les mini-PC chez les nettoyants.
  Electronics: [
    noeud('el-0', 'Electronics', false),
    noeud('el-cleaners', 'Electronics > Electronics Accessories > Electronics Cleaners'),
    noeud('el-acc', 'Electronics > Electronics Accessories', false),
    noeud('el-films', 'Electronics > Electronics Accessories > Electronics Films & Shields', false),
    noeud('el-stickers', 'Electronics > Electronics Accessories > Electronics Films & Shields > Electronics Stickers & Decals'),
    noeud('el-conn', 'Electronics > Components > Electronics Component Connectors'),
    noeud('el-marine', 'Electronics > Marine Electronics', false),
    noeud('tg-pretend', 'Toys & Games > Toys > Pretend Play > Pretend Electronics'),
  ],
  Telephony: [
    noeud('el-tel', 'Electronics > Communications > Telephony', false),
    noeud('el-telcable', 'Electronics > Electronics Accessories > Cables > Telephone Cables'),
    noeud('el-telacc', 'Electronics > Communications > Telephony > Telephone Accessories', false),
  ],
  'Batteries externes (powerbanks)': [
    noeud('veh-bat', 'Vehicles & Parts > Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Power & Electrical Systems > Batteries'),
    noeud('el-power', 'Electronics > Electronics Accessories > Power > Batteries', false),
  ],
  // Les deux libellés français qui ne rendent RIEN : sans traduction, rien à juger.
  'Informatique et accessoires PC': [],
  'Drones et modélisme électronique': [],
  // Ce que la traduction permet d'atteindre.
  'Computer Accessories': [
    noeud('el-compacc', 'Electronics > Computers > Computer Accessories', false),
    noeud('el-comphub', 'Electronics > Computers > Computer Accessories > Computer Port Hubs'),
  ],
  Computers: [
    noeud('el-comp', 'Electronics > Computers', false),
    noeud('el-desktop', 'Electronics > Computers > Desktop Computers'),
    noeud('el-laptop', 'Electronics > Computers > Laptops'),
  ],
  'Portable Power Banks': [
    noeud('el-pb', 'Electronics > Electronics Accessories > Power > Portable Power Banks'),
  ],
  // Le cas nominal : le libellé français est le même mot qu'en anglais.
  Drones: [noeud('el-drone', 'Electronics > Drones & RC Aircraft > Drones')],
}

let recherches = 0
const appelSimule = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
  if (query.includes('dropshipperTaxonomy')) {
    recherches++
    const search = String(variables.search)
    return { taxonomy: { categories: { nodes: REPONSES[search] ?? [] } } } as T
  }
  if (query.includes('dropshipperFindCollection')) return { collections: { nodes: [] } } as T
  if (query.includes('dropshipperCreateCollection')) {
    const input = variables.input as { title: string }
    return {
      collectionCreate: { collection: { id: `gid://shopify/Collection/${input.title}` }, userErrors: [] },
    } as T
  }
  throw new Error(`requête inattendue : ${query.slice(0, 40)}`)
}

/**
 * Le faux modèle, contrat écrit en dur.
 *
 * Il traduit ce qu'un vrai Haiku traduirait et **choisit honnêtement** : sur la
 * batterie externe il désigne la bonne feuille, sur le robot chien il refuse.
 * Aucun appel réel : un banc ne dépense pas de jetons et ne dépend pas d'une
 * réponse qui change d'un jour à l'autre.
 */
const TRADUCTIONS: Record<string, string[]> = {
  'Informatique et accessoires PC': ['Computer Accessories', 'Computers'],
  'Drones et modélisme électronique': ['Drones'],
  'Batteries externes (powerbanks)': ['Portable Power Banks'],
  'Robot chien': ['Robot Dog'],
}
/** Ce que le modèle répond quand il doit trancher — et quand il refuse. */
const CHOIX: Record<string, string | null> = {
  'Informatique et accessoires PC': 'gid://shopify/TaxonomyCategory/el-desktop',
  'Batteries externes (powerbanks)': 'gid://shopify/TaxonomyCategory/el-pb',
  'Robot chien': null,
}
let traductions = 0
let choix = 0
const fauxModele: DemandeModele = async (consigne, question) => {
  const label = question.match(/Catégorie : (.+)$/m)?.[1]?.trim() ?? ''
  if (consigne.includes('vers les termes de la taxonomie produit de Shopify')) {
    traductions++
    return JSON.stringify(TRADUCTIONS[label] ?? [])
  }
  choix++
  const retenu = CHOIX[label] ?? null
  // Le modèle ne voit QUE les feuilles soumises : si le banc lui fait désigner
  // autre chose, c'est le banc qui ment, et il doit le dire.
  exige(
    retenu === null || consigne.includes(retenu),
    `le faux modèle désigne « ${retenu} », absent de la liste soumise pour « ${label} »`,
  )
  return retenu ? JSON.stringify({ id: retenu }) : JSON.stringify({ aucune: true })
}

/** Un modèle indisponible (pas de clé d'API) : tout doit continuer sans lui. */
const modeleMuet: DemandeModele = async () => ''

const source = (label: string, google: string, path: string): CategorieSource => ({
  label,
  path,
  google,
  targets: null,
})

// ── 1. La notation, éprouvée sur les vraies feuilles ────────────────────────
const electronique = source('Électronique', 'Electronics', 'Électronique')
exige(
  pertinence(electronique, 'Electronics > Electronics Accessories > Electronics Cleaners') < 0.6,
  'les nettoyants ne doivent PLUS passer pour de l’électronique générique',
)
exige(
  pertinence(electronique, 'Toys & Games > Toys > Pretend Play > Pretend Electronics') === 0,
  'une dînette est dans un autre rayon : le département doit l’écarter d’office',
)
const souris = source('Souris', 'Electronics > Computers > Computer Mice', 'High-tech > Périphériques > Souris')
exige(
  pertinence(souris, 'Electronics > Computers > Computer Accessories > Computer Mice') >= 0.6,
  'un qualificatif hérité de la branche (« Computer ») ne doit pas disqualifier la bonne feuille',
)

// ── 2. Le rangement de bout en bout, sur les quatre fiches réellement publiées ──
const CAS: Array<[string, CategorieSource, string | null]> = [
  [
    'un mini-PC ne part plus chez les nettoyants',
    source('Informatique et accessoires PC', 'Electronics', 'Électronique > Informatique et accessoires PC'),
    'gid://shopify/TaxonomyCategory/el-desktop',
  ],
  [
    'un drone se trouve par son libellé, sans traduction',
    source('Drones et modélisme électronique', 'Electronics', 'Électronique > Drones et modélisme électronique'),
    'gid://shopify/TaxonomyCategory/el-drone',
  ],
  [
    'une batterie externe : le modèle tranche dans la liste rendue',
    source(
      'Batteries externes (powerbanks)',
      'Electronics > Communications > Telephony',
      'Téléphones portables et accessoires > Batteries externes (powerbanks)',
    ),
    'gid://shopify/TaxonomyCategory/el-pb',
  ],
  [
    'sans feuille qui convienne, AUCUNE catégorie plutôt qu’une fausse',
    source('Robot chien', 'Electronics', 'Électronique > Robot chien'),
    null,
  ],
]

for (const [titre, categorie, attendu] of CAS) {
  const r = await rangerDansShopify(appelSimule, categorie, fauxModele)
  const vu = r.categoryId ?? null
  exige(vu === attendu, `${titre}\n  attendu ${attendu}\n  vu      ${vu}`)
}

exige(traductions > 0 && choix > 0, 'les deux étages du modèle doivent avoir servi au moins une fois')

// ── 3. Sans modèle, on dégrade — on ne casse pas ────────────────────────────
const sansModele = await rangerDansShopify(
  appelSimule,
  source('Drones et modélisme électronique', 'Electronics', 'Électronique > Drones et modélisme électronique'),
  modeleMuet,
)
exige(
  sansModele.categoryId === 'gid://shopify/TaxonomyCategory/el-drone',
  'sans clé d’API, la recherche locale doit encore trouver ce qu’elle sait trouver',
)
const muetEtIntrouvable = await rangerDansShopify(
  appelSimule,
  source('Informatique et accessoires PC', 'Electronics', 'Électronique > Informatique et accessoires PC'),
  modeleMuet,
)
exige(
  !muetEtIntrouvable.categoryId && muetEtIntrouvable.notes.length > 0,
  'sans clé d’API et sans feuille trouvable : aucune catégorie, et une note lisible',
)

// ── 4. La mémoire : une correspondance connue ne se recherche jamais ────────
recherches = 0
const memorisee: CategorieSource = {
  ...source('Souris', 'Electronics > Computers > Computer Mice', 'High-tech > Périphériques > Souris'),
  targets: { shopify: { id: 'gid://shopify/TaxonomyCategory/el-4-9', fullName: 'Computer Mice' } },
}
const r = await rangerDansShopify(appelSimule, memorisee, fauxModele)
exige(
  r.categoryId === 'gid://shopify/TaxonomyCategory/el-4-9' && recherches === 0,
  `mémoire : ${recherches} recherche(s) alors qu’une correspondance était connue`,
)

console.log(echecs === 0 ? 'Rangement Shopify : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
