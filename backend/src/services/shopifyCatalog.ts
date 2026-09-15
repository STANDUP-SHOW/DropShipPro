/**
 * Ranger la fiche dans Shopify : sa catégorie officielle et ses collections.
 *
 * Deux choses différentes que l'administration de Shopify affiche côte à côte,
 * et qu'on avait confondues :
 *
 * - **La catégorie de produit** est une entrée de la taxonomie de Shopify, avec
 *   son identifiant. C'est elle qui décide des attributs proposés, du taux de
 *   TVA suggéré et de ce que Shopify transmet aux canaux — Google, Meta, TikTok.
 *   Jusqu'ici on ne remplissait que `productType`, un champ de texte libre : le
 *   vendeur voyait « ordinateur » écrit quelque part et croyait la fiche rangée.
 *   Elle ne l'était pas, et aucun canal ne recevait rien.
 * - **Les collections** sont les rayons de la boutique, ce dans quoi l'acheteur
 *   navigue. Sans elles, une boutique de trois cents produits n'a qu'une seule
 *   page, et le vendeur crée ses rayons à la main, un par un.
 *
 * Le référentiel maison sert de pivot pour les deux. Il porte déjà le chemin
 * Google — une chaîne anglaise stable, alignée sur la taxonomie de Shopify.
 * C'est elle qu'on cherche, **pas le libellé français** : « Souris » renvoie
 * n'importe quoi dans un index anglais, « Mice » renvoie la bonne feuille.
 *
 * La correspondance trouvée est mémorisée dans le référentiel. Mille produits
 * d'une même catégorie coûtent une recherche, pas mille.
 */

/** Un appel GraphQL déjà authentifié. Passé en paramètre : le banc en fournit un faux. */
export type AppelShopify = <T>(query: string, variables: Record<string, unknown>) => Promise<T>

/** Ce que le référentiel maison sait de la catégorie d'un produit. */
export interface CategorieSource {
  label: string
  /** « High-tech > Périphériques > Souris ». */
  path: string
  /** Le pivot : le chemin dans la taxonomie produit de Google. */
  google: string
  /** Les correspondances déjà établies, par plateforme. */
  targets: unknown
}

/** Ce que Shopify doit recevoir, une fois la fiche rangée. */
export interface RangementShopify {
  /** L'identifiant de taxonomie, quand une feuille correspond. */
  categoryId?: string
  /** Les collections à rejoindre, du rayon à la sous-catégorie. */
  collections: string[]
  /** Ce qui n'a pas pu être rangé, en clair, pour la publication. */
  notes: string[]
  /** La correspondance à mémoriser, quand elle vient d'être trouvée. */
  aRetenir?: { id: string; fullName: string }
}

const CHERCHER_CATEGORIE = /* GraphQL */ `
  query dropshipperTaxonomy($search: String!) {
    taxonomy {
      categories(search: $search, first: 5) {
        nodes {
          id
          fullName
          isLeaf
          isArchived
        }
      }
    }
  }
`

const CHERCHER_COLLECTION = /* GraphQL */ `
  query dropshipperFindCollection($q: String!) {
    collections(first: 10, query: $q) {
      nodes {
        id
        title
      }
    }
  }
`

const CREER_COLLECTION = /* GraphQL */ `
  mutation dropshipperCreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`

interface ReponseTaxonomie {
  taxonomy: {
    categories: {
      nodes: Array<{ id: string; fullName: string; isLeaf: boolean; isArchived: boolean }>
    }
  }
}

/** La correspondance Shopify déjà mémorisée, si elle a la bonne forme. */
function dejaConnue(targets: unknown): { id: string; fullName: string } | null {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) return null
  const shopify = (targets as Record<string, unknown>).shopify
  if (!shopify || typeof shopify !== 'object') return null
  const { id, fullName } = shopify as Record<string, unknown>
  return typeof id === 'string' && id.startsWith('gid://shopify/TaxonomyCategory/')
    ? { id, fullName: typeof fullName === 'string' ? fullName : id }
    : null
}

/** Sans accents, sans ponctuation, en minuscules : pour comparer deux libellés. */
function motsDe(texte: string): string[] {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m))
}

/** Les mots qui ne prouvent rien : ils sont dans la moitié de la taxonomie. */
const MOTS_VIDES = new Set([
  'and', 'the', 'for', 'with', 'other', 'accessories', 'accessoires', 'produits', 'products',
  'appareils', 'devices', 'equipment', 'equipement', 'materiel', 'supplies', 'fournitures',
  'articles', 'les', 'des', 'aux', 'pour', 'sur', 'par',
])

/**
 * À quel point cette feuille répond à la catégorie demandée, de 0 à 1.
 *
 * On compare le DERNIER segment du nom complet — « Electronics > Computers >
 * Laptops » se juge sur « Laptops », pas sur « Electronics », sinon toute
 * l'électronique se ressemble.
 *
 * **Et on compare à TOUS les noms que nous connaissons de cette catégorie**, pas
 * au seul terme cherché : le chemin Google est en anglais (« Laptops ») alors
 * qu'une boutique française rend ses feuilles en français (« Ordinateurs
 * portables »). Ne juger que sur le terme cherché donnerait zéro à la bonne
 * feuille, et l'on retomberait à ne rien ranger du tout.
 */
function pertinence(categorie: CategorieSource, fullName: string): number {
  const feuille = fullName.split('>').pop() ?? fullName
  const trouves = new Set(motsDe(feuille))
  const noms = [categorie.google.split('>').pop() ?? '', categorie.label, categorie.path.split('>').pop() ?? '']

  let meilleur = 0
  for (const nom of noms) {
    const attendus = motsDe(nom)
    if (!attendus.length) continue
    const communs = attendus.filter((m) => trouves.has(m)).length
    // Un nom de feuille identique vaut 1 ; la moitié des mots, 0,5.
    meilleur = Math.max(meilleur, communs / attendus.length)
  }
  return meilleur
}

/**
 * Cherche la feuille de taxonomie qui correspond à cette catégorie.
 *
 * Deux essais, dans l'ordre du plus fiable au moins fiable : le dernier segment
 * du chemin Google, puis le libellé français. Le second ne marche que si la
 * boutique est en français, et il est là pour ça — une boutique française
 * trouve, une boutique anglaise a déjà trouvé au premier essai.
 *
 * **Seules les feuilles sont retenues.** Shopify refuse la fiche quand la
 * catégorie n'est pas une feuille, et un refus ici perdrait tout le produit.
 *
 * **Et la feuille retenue doit RESSEMBLER à ce qu'on a cherché.** La recherche
 * de Shopify est approximative, exactement comme celle des collections quarante
 * lignes plus bas — et le piège qui y est documenté nous est tombé dessus ici :
 * prendre `nodes.find(isLeaf)`, c'est prendre la première feuille que Shopify
 * propose, quelle qu'elle soit. Constaté le 15/09/2026 sur la boutique de Max :
 * mini-PC, SSD, tables de mixage et souris rangés dans **« Nettoyants pour
 * appareils électroniques »** — la feuille partage « appareils électroniques »
 * avec la recherche, Shopify la sort en tête, et personne ne vérifiait.
 *
 * On note donc les cinq candidats et on ne garde le meilleur que s'il atteint
 * la moitié des mots demandés. Sinon rien : `productType` affiche quand même le
 * chemin, et une fiche sans catégorie vaut mieux qu'une fiche mal rangée — c'est
 * déjà la règle du référentiel maison (« rien ne tombe dans Divers »).
 */
const PERTINENCE_MINIMALE = 0.5

async function chercherCategorie(
  appel: AppelShopify,
  categorie: CategorieSource,
): Promise<{ id: string; fullName: string } | null> {
  const feuilleGoogle = categorie.google.split('>').pop()?.trim()
  const essais = [feuilleGoogle, categorie.label].filter(
    (t): t is string => typeof t === 'string' && t.length > 1,
  )

  for (const search of essais) {
    const { taxonomy } = await appel<ReponseTaxonomie>(CHERCHER_CATEGORIE, { search })
    const candidats = taxonomy.categories.nodes
      .filter((n) => n.isLeaf && !n.isArchived)
      .map((n) => ({ n, score: pertinence(categorie, n.fullName) }))
      .sort((a, b) => b.score - a.score)

    const meilleur = candidats[0]
    if (meilleur && meilleur.score >= PERTINENCE_MINIMALE) {
      return { id: meilleur.n.id, fullName: meilleur.n.fullName }
    }
  }
  return null
}

/** Échappe un titre pour la syntaxe de recherche de Shopify. */
function requeteTitre(titre: string): string {
  return `title:"${titre.replace(/["\\]/g, ' ')}"`
}

/**
 * La collection portant ce titre, créée si elle n'existe pas.
 *
 * La recherche de Shopify est approximative : chercher « Souris » rend aussi
 * « Souris et claviers ». Sans la vérification du titre exact, chaque
 * publication rangerait le produit dans la première collection qui ressemble, et
 * un vendeur retrouverait ses souris dans ses claviers.
 */
async function collectionNommee(appel: AppelShopify, titre: string): Promise<string | null> {
  const propre = titre.trim()
  if (!propre) return null

  const { collections } = await appel<{ collections: { nodes: Array<{ id: string; title: string }> } }>(
    CHERCHER_COLLECTION,
    { q: requeteTitre(propre) },
  )
  const exacte = collections.nodes.find((c) => c.title.trim().toLowerCase() === propre.toLowerCase())
  if (exacte) return exacte.id

  const creation = await appel<{
    collectionCreate: {
      collection: { id: string } | null
      userErrors: Array<{ message: string }>
    }
  }>(CREER_COLLECTION, { input: { title: propre } })

  if (creation.collectionCreate.userErrors.length) {
    throw new Error(creation.collectionCreate.userErrors.map((e) => e.message).join(' '))
  }
  return creation.collectionCreate.collection?.id ?? null
}

/**
 * Range la fiche : catégorie officielle et collections de la boutique.
 *
 * **Rien de ce qui échoue ici n'empêche la publication.** Un refus de collection
 * — l'app n'a pas `write_products` sur les collections, la boutique en a atteint
 * la limite — laisserait sinon perdre une fiche entière avec ses photos et sa
 * description, pour un rangement. La note le dit, le vendeur range à la main.
 */
export async function rangerDansShopify(
  appel: AppelShopify,
  categorie: CategorieSource | null,
): Promise<RangementShopify> {
  const resultat: RangementShopify = { collections: [], notes: [] }
  if (!categorie) {
    resultat.notes.push(
      "Aucune catégorie : la fiche part sans catégorie Shopify ni collection. Rangez le produit dans DropShipper, puis republiez.",
    )
    return resultat
  }

  // --- La catégorie officielle ----------------------------------------------
  try {
    const connue = dejaConnue(categorie.targets)
    if (connue) {
      resultat.categoryId = connue.id
    } else {
      const trouvee = await chercherCategorie(appel, categorie)
      if (trouvee) {
        resultat.categoryId = trouvee.id
        resultat.aRetenir = trouvee
      } else {
        resultat.notes.push(
          `Catégorie Shopify introuvable pour « ${categorie.label} » : la fiche garde son type de produit en texte.`,
        )
      }
    }
  } catch (e) {
    resultat.notes.push(
      `Catégorie Shopify non transmise (${e instanceof Error ? e.message : 'refus Shopify'}).`,
    )
  }

  /*
   * Les collections : le rayon, puis la sous-catégorie.
   *
   * Deux niveaux et pas davantage. Une collection par segment donnerait à une
   * boutique de trois cents produits une centaine de rayons dont la moitié à un
   * seul article — un menu que personne ne parcourt. Le rayon rassemble, la
   * feuille précise.
   */
  const segments = categorie.path
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean)
  const aRejoindre = [...new Set([segments[0], segments[segments.length - 1]].filter(Boolean))]

  for (const titre of aRejoindre) {
    try {
      const id = await collectionNommee(appel, titre)
      if (id) resultat.collections.push(id)
    } catch (e) {
      resultat.notes.push(
        `Collection « ${titre} » non créée (${e instanceof Error ? e.message : 'refus Shopify'}).`,
      )
    }
  }

  return resultat
}
