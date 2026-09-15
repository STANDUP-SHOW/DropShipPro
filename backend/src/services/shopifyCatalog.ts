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
 * Le référentiel maison sert de pivot pour les deux — mais **pas de la façon
 * qu'on avait crue.** Le premier jet cherchait la taxonomie de Shopify avec le
 * chemin Google, supposé être une chaîne anglaise précise alignée sur elle.
 * Vérifié le 15/09/2026 : **143 de nos 249 catégories n'ont qu'un seul segment
 * de chemin Google**. « Vehicles & Parts » désigne trente-deux catégories
 * automobiles différentes, « Electronics » treize. Ce n'est pas un pivot vers
 * une feuille, c'est un rayon.
 *
 * D'où la construction actuelle, en trois étages : le chemin Google **filtre**
 * par département, le libellé français **cherche**, et le modèle **traduit puis
 * tranche dans la liste que Shopify a rendue** quand les deux premiers ne
 * suffisent pas. La correspondance trouvée est mémorisée dans le référentiel :
 * mille produits d'une même catégorie coûtent cette recherche une fois.
 */
import Anthropic from '@anthropic-ai/sdk'
import { MODELE_RAPIDE, modele } from './aiModels.js'

/** Un appel GraphQL déjà authentifié. Passé en paramètre : le banc en fournit un faux. */
export type AppelShopify = <T>(query: string, variables: Record<string, unknown>) => Promise<T>

/**
 * Un appel court au modele, injectable.
 *
 * Injecte pour la meme raison que `AppelShopify` : un banc ne doit ni depenser
 * de jetons ni dependre d une reponse qui change d un jour a l autre. La
 * production passe la vraie fonction, le banc en passe une fausse au contrat
 * ecrit en dur.
 */
export type DemandeModele = (consigne: string, question: string, jetons: number) => Promise<string>

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
      categories(search: $search, first: 10) {
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
 * Le département : le premier segment d'un chemin de taxonomie.
 *
 * C'est la seule chose que notre chemin Google donne à coup sûr. Relevé le
 * 15/09/2026 : **143 de nos 249 catégories n'ont qu'un segment** — « Vehicles &
 * Parts » sert à trente-deux catégories automobiles différentes, « Electronics »
 * à treize. Le chemin Google n'est donc pas un pivot vers une feuille, c'est un
 * rayon. Il ne sert pas à chercher, il sert à **écarter**.
 */
function departement(chemin: string): string {
  return chemin.split('>')[0]?.trim() ?? ''
}

/** Deux départements se recouvrent-ils assez pour parler du même rayon ? */
function memeDepartement(google: string, candidat: string): boolean {
  const attendus = motsDe(departement(google))
  const trouves = new Set(motsDe(departement(candidat)))
  if (!attendus.length || !trouves.size) return true // rien à vérifier : on laisse passer
  return attendus.filter((m) => trouves.has(m)).length / attendus.length >= 0.5
}

/**
 * À quel point cette feuille répond à la catégorie demandée, de 0 à 1.
 *
 * Trois garde-fous, et chacun répond à une feuille réellement proposée par
 * Shopify le 15/09/2026 sur la boutique de Max :
 *
 * 1. **Le département doit être le bon.** Chercher « Electronics » rend
 *    `Toys & Games > Toys > Pretend Play > Pretend Electronics` — une dînette.
 *    Notre rayon est la seule information fiable du chemin Google : il filtre.
 * 2. **On compare le DERNIER segment**, pas le chemin entier : « Electronics >
 *    Computers > Laptops » se juge sur « Laptops », sinon toute l'électronique
 *    se ressemble. Et on compare à TOUS les noms connus de la catégorie — le
 *    chemin Google est anglais, une boutique française rend ses feuilles en
 *    français ; ne juger que sur le terme cherché donnerait zéro à la bonne.
 * 3. **Un mot de la feuille que rien n'explique est une spécialisation**, et
 *    elle disqualifie. C'est le correctif du 15/09/2026, et le premier essai
 *    ne l'avait pas : « Electronics » couvre 100 % de ce qu'on attendait dans
 *    `Electronics > Electronics Accessories > Electronics Cleaners`, et
 *    pourtant « cleaners » change le produit du tout au tout. On note donc la
 *    couverture dans les DEUX sens et on garde la plus faible. Les qualificatifs
 *    hérités de la branche sont gratuits (« Computer » dans « Computer Mice »
 *    est déjà dans les ancêtres) : ils précisent sans changer de produit.
 *
 * `nomsSupplementaires` porte ce que le modèle a traduit de notre libellé
 * français — sans lui, « Informatique et accessoires PC » ne partage aucun mot
 * avec « Computer Accessories » et la bonne feuille serait notée zéro.
 */
export function pertinence(
  categorie: CategorieSource,
  fullName: string,
  nomsSupplementaires: string[] = [],
): number {
  if (!memeDepartement(categorie.google, fullName)) return 0

  const segments = fullName.split('>').map((s) => s.trim()).filter(Boolean)
  const motsFeuille = motsDe(segments[segments.length - 1] ?? fullName)
  if (!motsFeuille.length) return 0

  /*
   * Le premier mot du libellé compte comme un nom à part entière.
   *
   * Nos libellés sont des phrases de rayon — « Drones et modélisme
   * électronique », « Batteries externes (powerbanks) ». Noté sur la phrase
   * entière, `Electronics > Drones & RC Aircraft > Drones` n'obtient qu'un mot
   * sur trois, soit 0,33 : la feuille parfaite est recalée par la longueur de
   * notre propre libellé. Le nom de tête est ce que la catégorie désigne
   * vraiment ; le reste précise.
   */
  const tete = categorie.label.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0] ?? ''

  const noms = [
    categorie.google.split('>').pop() ?? '',
    categorie.label,
    tete,
    categorie.path.split('>').pop() ?? '',
    ...nomsSupplementaires,
  ]
  const trouves = new Set(motsFeuille)
  const attendusTous = new Set(noms.flatMap(motsDe))
  const ancetres = new Set(segments.slice(0, -1).flatMap(motsDe))

  // Sens 1 : combien de ce que nous attendions la feuille porte-t-elle ?
  let couvertureAttendue = 0
  for (const nom of noms) {
    const attendus = motsDe(nom)
    if (!attendus.length) continue
    const communs = attendus.filter((m) => trouves.has(m)).length
    couvertureAttendue = Math.max(couvertureAttendue, communs / attendus.length)
  }

  // Sens 2 : combien de la feuille savons-nous expliquer ?
  const expliques = motsFeuille.filter((m) => attendusTous.has(m) || ancetres.has(m)).length
  const couvertureFeuille = expliques / motsFeuille.length

  return Math.min(couvertureAttendue, couvertureFeuille)
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
const PERTINENCE_MINIMALE = 0.6

/**
 * Cette feuille est-elle un rangement acceptable pour cette catégorie ?
 *
 * Exporté pour que le script de réparation juge la mémoire déjà gravée avec
 * EXACTEMENT la même règle que la publication. Recopier le seuil là-bas ferait
 * deux versions qui divergeraient, et le script validerait un jour ce que le
 * connecteur refuse.
 */
export function estPertinente(categorie: CategorieSource, fullName: string): boolean {
  return pertinence(categorie, fullName) >= PERTINENCE_MINIMALE
}

/** Une feuille de taxonomie retenue comme candidate. */
type Feuille = { id: string; fullName: string }

/**
 * Le texte rendu par le modèle, ou une chaîne vide s'il n'y a pas de clé.
 *
 * Aucune de ces deux aides n'est indispensable : sans clé d'API, le rangement
 * retombe sur la recherche locale, qui trouve encore la moitié des feuilles.
 * Une catégorie non trouvée laisse la fiche partir avec son `productType` — ce
 * n'est jamais un motif d'échec de publication.
 */
async function demanderAuModele(consigne: string, question: string, jetons: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''
  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      // Haiku : traduire deux mots et choisir dans une liste fermée ne demande
      // aucun raisonnement. Et cet appel n'a lieu qu'UNE fois par catégorie,
      // jamais par produit — le résultat est gravé dans le référentiel.
      model: modele('AI_MODEL_CATEGORY', MODELE_RAPIDE),
      max_tokens: jetons,
      system: consigne,
      messages: [{ role: 'user', content: question }],
    })
    return reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  } catch (e) {
    console.error('[shopify] catégorie, appel au modèle refusé :', e instanceof Error ? e.message : e)
    return ''
  }
}

/**
 * Traduit notre libellé en termes de la taxonomie Shopify, qui est anglaise.
 *
 * Ce n'est pas du confort : `motsDe` compare des chaînes, et « Informatique »
 * n'a aucune lettre en commun avec « Computers ». Sans cette étape, 143 de nos
 * catégories — celles dont le chemin Google se réduit à un rayon — n'ont
 * strictement aucun terme anglais à soumettre.
 */
async function traduirePourShopify(categorie: CategorieSource, demander: DemandeModele): Promise<string[]> {
  const texte = await demander(
    [
      "Tu traduis un nom de catégorie de produits français vers les termes de la taxonomie produit de Shopify, qui est en anglais.",
      'Réponds UNIQUEMENT par un tableau JSON de 1 à 3 termes courts, du plus précis au plus général.',
      'Exemple : ["Computer Accessories","Computers"]',
      "N'invente pas de catégorie : donne les mots qu'un catalogue anglais emploierait.",
    ].join('\n'),
    `Rayon : ${departement(categorie.google) || '—'}\nChemin : ${categorie.path}\nCatégorie : ${categorie.label}`,
    120,
  )
  const brut = texte.match(/\[[\s\S]*\]/)
  if (!brut) return []
  try {
    const liste = JSON.parse(brut[0]) as unknown[]
    return liste.filter((t): t is string => typeof t === 'string' && t.trim().length > 2).slice(0, 3)
  } catch {
    return []
  }
}

/**
 * Le dernier recours : le modèle tranche parmi les feuilles réellement rendues.
 *
 * **Liste fermée, et droit de refuser.** C'est la règle déjà posée pour le
 * référentiel maison, et elle vaut doublement ici : une catégorie Shopify
 * inventée serait refusée par l'API et ferait perdre la fiche entière, tandis
 * qu'une catégorie plausible mais fausse range le produit là où personne ne le
 * cherche. Sans catégorie, le `productType` reste affiché et le vendeur range à
 * la main — c'est le moins mauvais des trois.
 */
async function choisirParModele(
  categorie: CategorieSource,
  feuilles: Feuille[],
  demander: DemandeModele,
): Promise<Feuille | null> {
  if (!feuilles.length) return null

  const texte = await demander(
    [
      "Tu ranges un produit dans la taxonomie de Shopify.",
      'Réponds UNIQUEMENT par un JSON : {"id":"<identifiant exact d\'une feuille de la liste>"} ou {"aucune":true}.',
      "Choisis la feuille qui désigne LE MÊME type de produit. Un accessoire se range avec les accessoires, pas avec l'appareil.",
      "Si aucune feuille ne convient vraiment, réponds {\"aucune\":true} : une catégorie fausse est pire que pas de catégorie.",
      '',
      'FEUILLES :',
      feuilles.map((f) => `${f.id} = ${f.fullName}`).join('\n'),
    ].join('\n'),
    `Rayon : ${departement(categorie.google) || '—'}\nChemin : ${categorie.path}\nCatégorie : ${categorie.label}`,
    150,
  )

  const brut = texte.match(/\{[\s\S]*\}/)
  if (!brut) return null
  try {
    const choix = JSON.parse(brut[0]) as { id?: string; aucune?: boolean }
    if (!choix.id) return null
    // Jamais un identifiant que le modèle aurait composé : il doit être dans la liste.
    return feuilles.find((f) => f.id === choix.id) ?? null
  } catch {
    return null
  }
}

/**
 * Les termes à soumettre à la recherche de Shopify, sans le modèle.
 *
 * **Jamais le département seul.** Chercher « Electronics » ou « Vehicles &
 * Parts » rend les huit premières feuilles du rayon, qui n'ont rien à voir avec
 * le produit — c'est exactement ce qui rangeait les mini-PC dans « Nettoyants
 * pour appareils électroniques ». Le dernier segment du chemin Google n'est un
 * terme de recherche que s'il y en a plusieurs.
 */
function termesLocaux(categorie: CategorieSource): string[] {
  const termes: string[] = [categorie.label]

  /*
   * Le premier mot du libellé, quand le libellé en compte plusieurs.
   *
   * La recherche de Shopify ne pardonne pas les phrases : « Drones et modélisme
   * électronique » ne rend RIEN, « Drones » rend la bonne feuille du premier
   * coup. Et en français le nom de tête est en première position — « Batteries
   * externes », « Souris sans fil ». C'est un essai gratuit qui évite un appel
   * au modèle chaque fois que les deux langues emploient le même mot.
   */
  const premier = categorie.label.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0]
  if (premier && premier.toLowerCase() !== categorie.label.toLowerCase()) termes.push(premier)

  const segmentsGoogle = categorie.google.split('>').map((s) => s.trim()).filter(Boolean)
  if (segmentsGoogle.length > 1) termes.push(segmentsGoogle[segmentsGoogle.length - 1])

  return termes.filter((t) => t.length > 2)
}

/** Interroge Shopify et retient les feuilles vivantes du bon département. */
async function feuillesPour(
  appel: AppelShopify,
  categorie: CategorieSource,
  termes: string[],
  dans: Map<string, Feuille>,
): Promise<void> {
  for (const search of termes) {
    const { taxonomy } = await appel<ReponseTaxonomie>(CHERCHER_CATEGORIE, { search })
    for (const n of taxonomy.categories.nodes) {
      // Shopify refuse la fiche quand la catégorie n'est pas une feuille, et
      // une archivée disparaîtra : ni l'une ni l'autre n'est proposable.
      if (!n.isLeaf || n.isArchived) continue
      if (!memeDepartement(categorie.google, n.fullName)) continue
      dans.set(n.id, { id: n.id, fullName: n.fullName })
    }
  }
}

/** La meilleure feuille du lot, si elle atteint le seuil. */
function meilleureFeuille(
  categorie: CategorieSource,
  feuilles: Feuille[],
  nomsAnglais: string[],
): Feuille | null {
  const notees = feuilles
    .map((f) => ({ f, note: pertinence(categorie, f.fullName, nomsAnglais) }))
    .sort((a, b) => b.note - a.note)
  const tete = notees[0]
  return tete && tete.note >= PERTINENCE_MINIMALE ? tete.f : null
}

/**
 * Cherche la feuille de taxonomie qui correspond à cette catégorie.
 *
 * Trois étages, du gratuit au payant, et on s'arrête au premier qui répond.
 *
 * 1. **La recherche locale.** Le libellé français et, quand il est précis, le
 *    dernier segment du chemin Google. Ça suffit quand les deux taxonomies
 *    emploient le même mot (« Drones », « Smartwatches »).
 * 2. **La traduction.** « Informatique et accessoires PC » ne partage aucun mot
 *    avec « Computer Accessories » : aucune comparaison de chaînes ne franchira
 *    jamais la barrière de langue. Un appel court à Haiku rend deux ou trois
 *    termes anglais, qui servent à la fois de requêtes ET de noms connus pour la
 *    notation.
 * 3. **Le choix dans la liste fermée.** Si rien n'atteint le seuil, le modèle
 *    tranche — mais seulement parmi les feuilles que Shopify a réellement
 *    rendues, et il a le droit de refuser. C'est la règle du référentiel maison,
 *    appliquée ici : le modèle choisit, il n'invente pas.
 *
 * Le résultat est mémorisé par l'appelant dans `Category.targets.shopify` :
 * mille produits d'une même catégorie coûtent cette recherche une fois.
 */
async function chercherCategorie(
  appel: AppelShopify,
  categorie: CategorieSource,
  demander: DemandeModele,
): Promise<Feuille | null> {
  const feuilles = new Map<string, Feuille>()

  await feuillesPour(appel, categorie, termesLocaux(categorie), feuilles)
  const local = meilleureFeuille(categorie, [...feuilles.values()], [])
  if (local) return local

  const nomsAnglais = await traduirePourShopify(categorie, demander)
  if (nomsAnglais.length) {
    await feuillesPour(appel, categorie, nomsAnglais, feuilles)
    const traduit = meilleureFeuille(categorie, [...feuilles.values()], nomsAnglais)
    if (traduit) return traduit
  }

  return choisirParModele(categorie, [...feuilles.values()], demander)
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
  demander: DemandeModele = demanderAuModele,
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
      const trouvee = await chercherCategorie(appel, categorie, demander)
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
