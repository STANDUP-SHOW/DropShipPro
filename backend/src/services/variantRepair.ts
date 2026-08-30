/**
 * Réparer les options d'achat que le fournisseur a mal rangées.
 *
 * Le défaut vient de la source, pas de nous — mais il arrive jusqu'au client si
 * personne ne le corrige. Un vendeur AliExpress range **tout** sous « Color » :
 * c'est la première dimension de SKU du formulaire, et il ne prend pas la peine
 * d'en ouvrir une seconde. Résultat constaté en base le 27/08/2026, sur un
 * disque dur réellement importé :
 *
 *     { "Couleur": ["1T", "4T", "2T", "128T", "8T", "16T", "64T"] }
 *
 * Ce sont des capacités. Et sur un autre disque du même vendeur :
 *
 *     { "Couleur": ["Black 1T", "Blue 1T", "Red 1T", "Black 4T", …] }
 *
 * Deux dimensions écrasées en une : douze combinaisons là où il fallait deux
 * listes de trois et quatre.
 *
 * Publié tel quel, ça donne une fiche où l'acheteur choisit une « couleur »
 * nommée `128T`. Sur une place de marché, c'est un motif de retrait.
 *
 * La réparation est **déterministe et gratuite** : aucun appel au modèle. Elle
 * tourne donc aussi sur les produits déjà importés, sans rien repayer.
 */

/** Une famille de valeurs reconnaissable, et le nom qu'elle mérite. */
interface Famille {
  nom: string
  reconnait: (valeur: string) => boolean
}

/*
 * Les couleurs sont listées plutôt que devinées.
 *
 * Un motif comme « un mot court » attraperait « XL », « USB » et « 64G ». Une
 * liste fermée se trompe dans l'autre sens — elle rate une couleur exotique —
 * et rater vaut mieux que renommer à tort : une option laissée telle quelle
 * reste juste, une option mal renommée devient fausse.
 */
const COULEURS = new Set(
  [
    'noir', 'black', 'blanc', 'white', 'rouge', 'red', 'bleu', 'blue', 'vert', 'green',
    'jaune', 'yellow', 'gris', 'grey', 'gray', 'rose', 'pink', 'violet', 'purple',
    'orange', 'marron', 'brown', 'beige', 'argent', 'silver', 'or', 'gold', 'dore',
    'bronze', 'kaki', 'khaki', 'turquoise', 'cyan', 'magenta', 'creme', 'cream',
    'ivoire', 'transparent', 'multicolore', 'navy', 'bordeaux', 'champagne',
  ].map((c) => c),
)

/** Retire accents et ponctuation : « Doré » et « dore » sont la même couleur. */
const nu = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const FAMILLES: Famille[] = [
  {
    nom: 'Couleur',
    reconnait: (v) => {
      const mots = nu(v).split(/[\s/-]+/).filter(Boolean)
      // Un ou deux mots, tous des couleurs : « Bleu », « Bleu ciel ».
      return mots.length > 0 && mots.length <= 2 && mots.every((m) => COULEURS.has(m))
    },
  },
  {
    nom: 'Capacité',
    // 64G, 1T, 128 GB, 512Go, 2 To — avec ou sans espace, avec ou sans B.
    reconnait: (v) => /^\d{1,4}\s?(t|g|m|k)(o|b)?$/i.test(v.trim()),
  },
  {
    nom: 'Taille',
    reconnait: (v) => /^(xxs|xs|s|m|l|xl|xxl|3xl|4xl|5xl|[2-6]?x?l)$/i.test(v.trim()),
  },
  {
    nom: 'Pointure',
    reconnait: (v) => /^(3[2-9]|4[0-9]|5[0-2])$/.test(v.trim()),
  },
  {
    nom: 'Longueur',
    reconnait: (v) => /^\d{1,3}([.,]\d+)?\s?(cm|mm|m|in|pouces?|ft)$/i.test(v.trim()),
  },
  {
    nom: 'Puissance',
    reconnait: (v) => /^\d{1,4}\s?(w|kw|mah|v|a)$/i.test(v.trim()),
  },
  {
    nom: 'Prise',
    reconnait: (v) =>
      /^(prise\s+)?(ue|eu|us|uk|au|fr|type[- ]?[a-c]|micro|lightning|usb|usb[- ]?c|jack)$/i.test(v.trim()),
  },
]

/**
 * Les mots de liaison, retirés avant de découper.
 *
 * « black for Type-C » se lit en deux dimensions, pas en trois : « for » n'est
 * ni une couleur ni une prise, et le garder produisait une option « Modèle »
 * dont la seule valeur était « for ».
 */
const LIAISONS = new Set(['for', 'pour', 'with', 'avec', 'and', 'et', 'de', 'du', '-', '/', '+'])

/** La famille d'une valeur, ou `null` quand on ne sait pas. */
function familleDe(valeur: string): string | null {
  return FAMILLES.find((f) => f.reconnait(valeur))?.nom ?? null
}

/**
 * Le nom que méritent ces valeurs, ou `null` pour garder celui du fournisseur.
 *
 * Une majorité franche est exigée — quatre valeurs sur cinq. Sous ce seuil, le
 * doute profite à l'étiquette d'origine : le vendeur a peut-être raison, et une
 * option renommée à tort est pire qu'une option mal nommée, parce qu'elle a
 * l'air juste.
 */
function nomMerite(valeurs: string[]): string | null {
  const comptes = new Map<string, number>()
  for (const v of valeurs) {
    const f = familleDe(v)
    if (f) comptes.set(f, (comptes.get(f) ?? 0) + 1)
  }
  if (!comptes.size) return null

  const [nom, n] = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]
  return n / valeurs.length >= 0.8 ? nom : null
}

/**
 * Sépare une valeur composée en ses dimensions.
 *
 * « Black 1T » rend `{ Couleur: 'Black', Capacité: '1T' }`. Chaque morceau est
 * reconnu par sa famille ; ceux qu'on ne reconnaît pas sont rendus ensemble
 * plutôt que jetés — mieux vaut une dimension imparfaite qu'une valeur perdue.
 */
function separer(valeur: string): Record<string, string> | null {
  const morceaux = valeur
    .split(/\s+/)
    .filter(Boolean)
    .filter((m) => !LIAISONS.has(nu(m)))
  if (morceaux.length < 2) return null

  const trouve: Record<string, string> = {}
  const restes: string[] = []

  // Deux passes : les morceaux composés d'abord (« Bleu ciel »), puis un à un.
  for (let i = 0; i < morceaux.length; i++) {
    const paire = i + 1 < morceaux.length ? `${morceaux[i]} ${morceaux[i + 1]}` : null
    const fPaire = paire ? familleDe(paire) : null
    if (fPaire && !trouve[fPaire]) {
      trouve[fPaire] = paire!
      i++
      continue
    }
    const f = familleDe(morceaux[i])
    if (f && !trouve[f]) trouve[f] = morceaux[i]
    else restes.push(morceaux[i])
  }

  // Il faut au moins deux dimensions reconnues pour que séparer ait un sens.
  if (Object.keys(trouve).length < 2) return null
  if (restes.length) trouve.Modèle = restes.join(' ')
  return trouve
}

/** Ce que la réparation a changé, pour pouvoir le relire. */
export interface Reparation {
  variantes: Record<string, string[]>
  /** Les gestes faits, en clair : « Couleur renommée en Capacité ». */
  changements: string[]
}

/**
 * Répare un jeu d'options.
 *
 * Deux gestes, dans cet ordre : séparer les valeurs composées, puis renommer
 * les options dont les valeurs disent autre chose que leur étiquette. L'ordre
 * compte — séparer d'abord donne des listes homogènes, que renommer traite
 * ensuite correctement.
 */
export function reparerVariantes(brutes: unknown): Reparation {
  const changements: string[] = []
  if (!brutes || typeof brutes !== 'object' || Array.isArray(brutes)) {
    return { variantes: {}, changements }
  }

  const sortie: Record<string, Set<string>> = {}
  const ajouter = (nom: string, valeur: string) => {
    const propre = valeur.trim()
    if (!propre) return
    ;(sortie[nom] ??= new Set()).add(propre)
  }

  for (const [nomSource, valeurs] of Object.entries(brutes as Record<string, unknown>)) {
    if (!Array.isArray(valeurs)) continue
    const liste = valeurs.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    if (!liste.length) continue

    // --- 1. Séparer les valeurs composées ---------------------------------
    const separables = liste.map(separer)
    const combien = separables.filter(Boolean).length

    /*
     * Tout ou rien.
     *
     * Avec un seuil, une valeur qui resiste — « black for Micro » quand « Micro »
     * n est pas reconnu — reste brute a cote de valeurs nettoyees, et la liste
     * melange « black » et « black for Micro ». Une liste incoherente est pire
     * qu une liste non nettoyee : elle a l air juste.
     */
    if (combien === liste.length) {
      for (const [i, parts] of separables.entries()) {
        if (parts) {
          for (const [nom, v] of Object.entries(parts)) ajouter(nom, v)
        } else {
          // Une valeur qui résiste garde sa place sous l'étiquette d'origine.
          ajouter(nomSource, liste[i])
        }
      }
      changements.push(
        `« ${nomSource} » séparée en ${[...new Set(separables.flatMap((p) => (p ? Object.keys(p) : [])))].join(' + ')}`,
      )
      continue
    }

    // --- 2. Renommer quand les valeurs disent autre chose ------------------
    const merite = nomMerite(liste)
    if (merite && nu(merite) !== nu(nomSource)) {
      for (const v of liste) ajouter(merite, v)
      changements.push(`« ${nomSource} » renommée « ${merite} » (ses valeurs sont des ${merite.toLowerCase()}s)`)
      continue
    }

    for (const v of liste) ajouter(nomSource, v)
  }

  // Une option à une seule valeur n'est pas un choix : elle encombre la fiche
  // et fait afficher un sélecteur qui ne sélectionne rien.
  const variantes: Record<string, string[]> = {}
  for (const [nom, valeurs] of Object.entries(sortie)) {
    if (valeurs.size > 1) variantes[nom] = [...valeurs]
    else if (valeurs.size === 1) changements.push(`« ${nom} » retirée : une seule valeur`)
  }

  return { variantes, changements }
}
