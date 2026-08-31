import { rangerDansShopify } from './src/services/shopifyCatalog.js'
import {
  codeBarresDe,
  codeDouanierDe,
  handleDe,
  paysOrigineDe,
  poidsDe,
  ugsDe,
} from './src/services/productFacts.js'

/**
 * Éprouve ce que Shopify reçoit vraiment, champ par champ.
 *
 * Le reproche du 31/08/2026 : « pour Shopify aussi nous devons trop
 * ré-intervenir sur l'annonce, rien d'automatique ». Ce n'était pas un défaut du
 * modèle. La catégorie officielle, les collections, l'UGS, le coût d'achat, le
 * poids, le pays d'origine, le code douanier, le code-barres et l'adresse de la
 * fiche existaient déjà en base et ne partaient nulle part — la fiche arrivait
 * chez le marchand à moitié vide, à remplir à la main.
 *
 * Ce banc porte sur un faux Shopify : il capture les appels et vérifie ce qu'on
 * lui envoie. C'est le seul moyen de prouver le contenu d'un payload sans
 * publier un produit chez un vrai marchand à chaque exécution.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Les faits lus dans les caractéristiques --------------------------------

const fiche = (attributes: Record<string, string>) => ({ attributes })

exige(poidsDe(fiche({ Poids: '450 g' }))?.value === 450, 'poids en grammes')
exige(poidsDe(fiche({ Poids: '450 g' }))?.unit === 'GRAMS', 'unité grammes')

// La virgule décimale française : la moitié des fiches l'écrivent ainsi, et la
// lire comme « 1 » ferait sous-facturer le port sur chaque commande.
const virgule = poidsDe(fiche({ 'Poids du produit': '1,2 kg' }))
exige(virgule?.value === 1.2 && virgule.unit === 'KILOGRAMS', `virgule décimale : ${JSON.stringify(virgule)}`)

exige(poidsDe(fiche({ Poids: 'léger' })) === undefined, 'un poids illisible ne s’invente pas')
exige(poidsDe(fiche({ Matière: 'acier' })) === undefined, 'aucun poids déclaré, aucun poids envoyé')

exige(paysOrigineDe(fiche({ Origine: 'Fabriqué en Chine' })) === 'CN', 'pays d’origine : Chine')
exige(paysOrigineDe(fiche({ 'Pays de fabrication': 'France' })) === 'FR', 'pays d’origine : France')
// Le plus long d'abord, sinon « Corée du Sud » tomberait sur « Corée ».
exige(paysOrigineDe(fiche({ Origine: 'Corée du Sud' })) === 'KR', 'Corée du Sud')
exige(paysOrigineDe(fiche({ Origine: 'Atlantide' })) === undefined, 'un pays inconnu reste vide')
exige(
  paysOrigineDe(fiche({ Matière: 'coton' })) === undefined,
  "rien ne se devine : une mention d'origine fausse est une infraction",
)

exige(codeDouanierDe(fiche({ 'Code SH': '8471.60.60' })) === '84716060', 'code douanier nettoyé')
exige(codeDouanierDe(fiche({ 'Code SH': '84' })) === undefined, 'un code trop court est refusé')

// Un code-barres faux ne se voit nulle part : Shopify l'accepte, et c'est Google
// Shopping qui rejette la fiche des semaines plus tard.
exige(codeBarresDe(fiche({ EAN: '4006381333931' })) === '4006381333931', 'EAN-13 valide accepté')
exige(codeBarresDe(fiche({ EAN: '4006381333932' })) === undefined, 'clé de contrôle fausse refusée')
exige(codeBarresDe(fiche({ GTIN: '12345' })) === undefined, 'longueur impossible refusée')

// --- L'adresse de la fiche --------------------------------------------------

const titreLong =
  'Mini PC Gaming Intel Core i9-10980HK 16 Go DDR4 SSD 1 To Windows 11 UHD Graphics 4K HDMI Ordinateur de Bureau Compact'
const handle = handleDe(titreLong)
exige(handle.length <= 70, `handle de ${handle.length} caractères, plafond 70`)
exige(!handle.endsWith('-'), 'un handle ne finit pas par un tiret')
// Coupé au mot : une adresse tronquée au milieu d'un mot se lit mal.
exige(titreLong.toLowerCase().includes(handle.split('-').pop()!), `dernier mot tronqué : ${handle}`)
console.log('handle :', handle)

exige(handleDe('Câble USB-C 2 m — Noir') === 'cable-usb-c-2-m-noir', `accents et tirets : ${handleDe('Câble USB-C 2 m — Noir')}`)

// --- L'UGS ------------------------------------------------------------------

exige(
  ugsDe({ id: 'cm123456789abcdef', supplierId: 'bigbuy', supplierRef: 'S4102030' }) === 'BIGBUY-S4102030',
  'UGS tirée de la référence fournisseur',
)
const sansRef = ugsDe({ id: 'cm123456789abcdef', supplierId: null, supplierRef: null })
exige(sansRef.startsWith('DSP-') && sansRef.length > 4, `UGS de repli : ${sansRef}`)

// --- Le rangement : catégorie officielle et collections ---------------------

/** Un faux Shopify qui note ce qu'on lui demande. */
function fauxShopify(options: { taxonomie?: unknown[]; collections?: Array<{ id: string; title: string }> } = {}) {
  const appels: Array<{ query: string; variables: Record<string, unknown> }> = []
  const creees: string[] = []
  const existantes = options.collections ?? []

  const appel = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    appels.push({ query, variables })

    if (query.includes('taxonomy')) {
      return { taxonomy: { categories: { nodes: options.taxonomie ?? [] } } } as T
    }
    if (query.includes('collections(')) {
      const cherche = String(variables.q).replace(/^title:"|"$/g, '')
      return {
        collections: { nodes: existantes.filter((c) => c.title.toLowerCase().includes(cherche.toLowerCase())) },
      } as T
    }
    if (query.includes('collectionCreate')) {
      const titre = (variables.input as { title: string }).title
      creees.push(titre)
      const id = `gid://shopify/Collection/${creees.length}`
      existantes.push({ id, title: titre })
      return { collectionCreate: { collection: { id, title: titre }, userErrors: [] } } as T
    }
    throw new Error(`requête inattendue : ${query.slice(0, 40)}`)
  }

  return { appel, appels, creees }
}

const souris = {
  label: 'Souris',
  path: 'High-tech > Périphériques > Souris',
  google: 'Electronics > Computers > Computer Accessories > Input Devices > Mice',
  targets: null,
}

{
  const faux = fauxShopify({
    taxonomie: [
      { id: 'gid://shopify/TaxonomyCategory/el-4-8-5', fullName: 'Electronics > … > Mice', isLeaf: true, isArchived: false },
    ],
  })
  const rangement = await rangerDansShopify(faux.appel, souris)

  exige(rangement.categoryId === 'gid://shopify/TaxonomyCategory/el-4-8-5', 'catégorie de taxonomie trouvée')
  exige(rangement.aRetenir?.id === rangement.categoryId, 'la correspondance est rendue pour être mémorisée')

  // La recherche part de l'anglais : « Souris » ne rend rien dans un index anglais.
  const recherche = faux.appels.find((a) => a.query.includes('taxonomy'))
  exige(recherche?.variables.search === 'Mice', `recherche avec « ${recherche?.variables.search} », attendu « Mice »`)

  // Deux collections : le rayon rassemble, la feuille précise. Une par segment
  // donnerait cent rayons dont la moitié à un seul article.
  exige(rangement.collections.length === 2, `${rangement.collections.length} collections, attendu 2`)
  exige(
    faux.creees.join(' | ') === 'High-tech | Souris',
    `collections créées : ${faux.creees.join(' | ')}`,
  )
  exige(rangement.notes.length === 0, `notes inattendues : ${rangement.notes.join(' ')}`)
}

// La correspondance déjà mémorisée ne repart pas chercher.
{
  const faux = fauxShopify()
  const rangement = await rangerDansShopify(faux.appel, {
    ...souris,
    targets: { shopify: { id: 'gid://shopify/TaxonomyCategory/el-4-8-5', fullName: 'Mice' } },
  })
  exige(rangement.categoryId === 'gid://shopify/TaxonomyCategory/el-4-8-5', 'correspondance relue du référentiel')
  exige(
    !faux.appels.some((a) => a.query.includes('taxonomy')),
    'une catégorie déjà connue ne relance aucune recherche',
  )
  exige(rangement.aRetenir === undefined, 'rien à réécrire quand rien n’a changé')
}

/*
 * La recherche de Shopify est approximative : chercher « Souris » rend aussi
 * « Souris et claviers ». Sans vérification du titre exact, chaque publication
 * rangerait le produit dans la première collection qui ressemble, et le vendeur
 * retrouverait ses souris dans ses claviers.
 */
{
  const faux = fauxShopify({
    collections: [{ id: 'gid://shopify/Collection/99', title: 'Souris et claviers' }],
  })
  const rangement = await rangerDansShopify(faux.appel, souris)
  exige(
    !rangement.collections.includes('gid://shopify/Collection/99'),
    'une collection au titre approchant ne doit pas être réutilisée',
  )
  exige(faux.creees.includes('Souris'), 'la vraie collection « Souris » est créée à côté')
}

// Une taxonomie muette n'empêche pas de publier : la fiche part avec son type
// de produit en texte, et la note le dit.
{
  const faux = fauxShopify({ taxonomie: [] })
  const rangement = await rangerDansShopify(faux.appel, souris)
  exige(rangement.categoryId === undefined, 'aucune catégorie inventée')
  exige(rangement.notes.some((n) => n.includes('introuvable')), `note attendue, reçu : ${rangement.notes.join(' ')}`)
  exige(rangement.collections.length === 2, 'les collections partent quand même')
}

// Une catégorie non-feuille est refusée par Shopify et perdrait le produit entier.
{
  const faux = fauxShopify({
    taxonomie: [
      { id: 'gid://shopify/TaxonomyCategory/el', fullName: 'Electronics', isLeaf: false, isArchived: false },
      { id: 'gid://shopify/TaxonomyCategory/el-old', fullName: 'Mice', isLeaf: true, isArchived: true },
    ],
  })
  const rangement = await rangerDansShopify(faux.appel, souris)
  exige(rangement.categoryId === undefined, 'ni les branches ni les catégories archivées ne sont retenues')
}

// Un refus de collection ne doit pas perdre une fiche avec ses photos et sa
// description, pour un rangement.
{
  const appel = async <T>(query: string): Promise<T> => {
    if (query.includes('taxonomy')) return { taxonomy: { categories: { nodes: [] } } } as T
    if (query.includes('collections(')) return { collections: { nodes: [] } } as T
    return { collectionCreate: { collection: null, userErrors: [{ message: 'Accès refusé' }] } } as T
  }
  const rangement = await rangerDansShopify(appel, souris)
  exige(rangement.collections.length === 0, 'aucune collection quand Shopify refuse')
  exige(rangement.notes.some((n) => n.includes('Accès refusé')), 'le refus est écrit en clair')
}

// Un produit sans catégorie le dit, plutôt que de partir en silence.
{
  const faux = fauxShopify()
  const rangement = await rangerDansShopify(faux.appel, null)
  exige(faux.appels.length === 0, 'aucun appel sans catégorie')
  exige(rangement.notes.length === 1, 'le vendeur est prévenu que la fiche part sans rangement')
}

console.log(
  echecs === 0
    ? 'Fiche Shopify complète : tout passe.'
    : `Fiche Shopify complète : ${echecs} echec(s).`,
)
process.exit(echecs === 0 ? 0 : 1)
