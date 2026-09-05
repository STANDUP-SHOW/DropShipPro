import bibliotheque from './themeSeed.json' with { type: 'json' }

/**
 * La bibliothèque de thèmes, et la résolution d'une boutique en apparence.
 *
 * La bibliothèque est **livrée avec le code**, pas semée en base : 192 palettes
 * et 7 structures qui ne changent qu'au déploiement. En base ne vit que le
 * choix du vendeur — un identifiant de thème, quelques jetons remplacés, ses
 * textes. Un catalogue en double poserait aussitôt la question de savoir lequel
 * fait foi, alors que la réponse est toujours « le code ».
 *
 * `resoudre()` est le seul point d'entrée : il rend tout ce qu'une vitrine doit
 * afficher, déjà fusionné et déjà complété. Une vitrine ne doit jamais avoir à
 * décider quoi faire d'un réglage absent — c'est comme ça qu'on obtient une
 * page d'accueil sans titre.
 */

export interface JetonsTheme {
  primary: string
  onPrimary: string
  secondary: string
  onSecondary: string
  accent: string
  onAccent: string
  background: string
  foreground: string
  card: string
  cardForeground: string
  muted: string
  mutedForeground: string
  border: string
  destructive: string
  onDestructive: string
  ring: string
}

export interface Structure {
  id: string
  nom: string
  pour: string
  photos: { rapport: string; recadrage: string; fond: string }
  blocs: string[]
}

export interface Theme {
  id: string
  nom: string
  structure: string
  palette: number
  typo: number
  secteurs: string[]
}

interface Palette {
  id: number
  nom: string
  note: string | null
  couleurs: JetonsTheme
  corrections?: string[]
}

interface Typographie {
  id: number
  nom: string
  titre: string
  texte: string
  ambiance: string[]
  faitPour: string | null
  sourceGoogle: string | null
}

const LIB = bibliotheque as unknown as {
  version: number
  structures: Structure[]
  palettes: Palette[]
  typographies: Typographie[]
  themes: Theme[]
}

const themeParId = new Map(LIB.themes.map((t) => [t.id, t]))
const structureParId = new Map(LIB.structures.map((s) => [s.id, s]))
const paletteParId = new Map(LIB.palettes.map((p) => [p.id, p]))
const typoParId = new Map(LIB.typographies.map((t) => [t.id, t]))

/**
 * Le thème de repli.
 *
 * Il n'est pas choisi au hasard : « Comptoir » est la structure catalogue avec
 * la palette e-commerce généraliste. C'est ce qui a le plus de chances d'aller
 * à peu près à n'importe quel assortiment, ce qu'on attend d'un défaut.
 */
export const THEME_PAR_DEFAUT = 'comptoir'

/** Les textes de la vitrine, et ce qu'ils valent quand personne ne les a écrits. */
export interface ContenuVitrine {
  annonce: string
  accroche: string
  accrocheSuite: string
  sousTitre: string
  fraisPort: number
  portOffertDes: number
}

/**
 * Les valeurs de repli.
 *
 * Elles disent quelque chose de vrai plutôt que d'être vides : une vitrine sans
 * titre est pire qu'une vitrine au titre générique, parce qu'elle a l'air
 * cassée là où l'autre a seulement l'air neuve.
 */
const CONTENU_PAR_DEFAUT: ContenuVitrine = {
  annonce: '',
  accroche: 'Notre sélection,',
  accrocheSuite: 'choisie pour vous.',
  sousTitre: 'Livraison suivie. Paiement sécurisé. Retours sous 14 jours.',
  fraisPort: 4.9,
  portOffertDes: 79,
}

export interface Apparence {
  theme: { id: string; nom: string }
  structure: Structure
  jetons: JetonsTheme
  polices: { titre: string; texte: string; familles: string[] }
  contenu: ContenuVitrine
  boutique: {
    nom: string
    logo: string | null
    /** Logo de l'en-tête de la vitrine, ou repli sur `logo`. */
    logoEntete: string | null
    /** Grand logo posé au-dessus du titre de l'accueil. */
    logoAccueil: string | null
  }
}

/** Ce que la bibliothèque propose, pour l'écran de choix. */
export function catalogueThemes() {
  return LIB.themes.map((t) => {
    const p = paletteParId.get(t.palette)!
    const typo = typoParId.get(t.typo)!
    const s = structureParId.get(t.structure)!
    return {
      id: t.id,
      nom: t.nom,
      structure: { id: s.id, nom: s.nom, pour: s.pour },
      secteurs: t.secteurs,
      polices: { titre: typo.titre, texte: typo.texte },
      // De quoi dessiner une vignette sans charger toute la palette.
      apercu: {
        background: p.couleurs.background,
        foreground: p.couleurs.foreground,
        primary: p.couleurs.primary,
        accent: p.couleurs.accent,
        card: p.couleurs.card,
      },
    }
  })
}

/**
 * Les thèmes qui vont à un commerce donné.
 *
 * Sert au générateur : il ne propose pas vingt et un thèmes à qui vend des
 * cartes mères, il en propose trois. Le rapprochement est textuel et bête —
 * c'est voulu. Faire trancher le modèle sur ce point coûterait un appel à
 * chaque fois, pour un choix que trois mots-clés suffisent à faire.
 */
export function themesPour(secteurs: string[]): string[] {
  const cherches = secteurs.map((s) => s.toLowerCase().trim()).filter(Boolean)
  if (!cherches.length) return [THEME_PAR_DEFAUT]

  const notes = LIB.themes.map((t) => ({
    id: t.id,
    note: t.secteurs.filter((s) => cherches.some((c) => s.includes(c) || c.includes(s))).length,
  }))

  const retenus = notes.filter((n) => n.note > 0).sort((a, b) => b.note - a.note)
  // Aucun rapprochement ne vaut mieux qu'un mauvais : le défaut est
  // généraliste, un thème « Pastel » proposé à un vendeur de pièces auto ne
  // l'est pas.
  return retenus.length ? retenus.slice(0, 3).map((n) => n.id) : [THEME_PAR_DEFAUT]
}

/** Le thème existe-t-il ? Sert à refuser un identifiant inventé avant de l'écrire. */
export function themeConnu(id: string): boolean {
  return themeParId.has(id)
}

/**
 * L'apparence complète d'une boutique.
 *
 * Tout est résolu ici et rien n'est laissé à la vitrine : un thème inconnu
 * retombe sur le défaut, un jeton absent prend celui de la palette, un texte
 * vide prend le repli. La vitrine reçoit un objet toujours complet.
 */
export function resoudre(boutique: {
  name: string
  logo?: string | null
  vitrineLogoEntete?: string | null
  vitrineLogoAccueil?: string | null
  themeId?: string | null
  themeTokens?: unknown
  storefront?: unknown
}): Apparence {
  /*
   * Un thème inconnu ne fait pas échouer la vitrine.
   *
   * Il y en aura : un identifiant retiré de la bibliothèque, une boutique
   * créée avant un renommage. Rendre une erreur fermerait la boutique du
   * vendeur pour un problème d'apparence.
   */
  const theme = themeParId.get(boutique.themeId ?? '') ?? themeParId.get(THEME_PAR_DEFAUT)!
  const structure = structureParId.get(theme.structure)!
  const palette = paletteParId.get(theme.palette)!
  const typo = typoParId.get(theme.typo)!

  const remplaces = (boutique.themeTokens ?? {}) as Partial<JetonsTheme>
  const jetons = { ...palette.couleurs }
  for (const [cle, valeur] of Object.entries(remplaces)) {
    // Seuls les jetons connus sont repris : un champ inventé côté client ne
    // doit pas se retrouver en variable CSS sur la boutique d'un client.
    if (cle in jetons && typeof valeur === 'string') (jetons as any)[cle] = valeur
  }

  const ecrit = (boutique.storefront ?? {}) as Partial<ContenuVitrine>
  const contenu: ContenuVitrine = { ...CONTENU_PAR_DEFAUT }
  for (const cle of Object.keys(CONTENU_PAR_DEFAUT) as Array<keyof ContenuVitrine>) {
    const v = ecrit[cle]
    if (typeof v === 'number' && Number.isFinite(v)) (contenu as any)[cle] = v
    // Une chaîne vide est une valeur : le vendeur qui efface son bandeau veut
    // qu'il disparaisse, pas qu'il revienne au texte d'usine.
    else if (typeof v === 'string') (contenu as any)[cle] = v
  }

  return {
    theme: { id: theme.id, nom: theme.nom },
    structure,
    jetons,
    polices: {
      titre: typo.titre,
      texte: typo.texte,
      familles: [...new Set([typo.titre, typo.texte])],
    },
    contenu,
    boutique: {
      nom: boutique.name,
      logo: boutique.logo ?? null,
      // L'en-tête préfère son logo dédié, puis retombe sur le logo de filigrane
      // (déjà servi là aujourd'hui) : personne ne perd son logo actuel.
      logoEntete: boutique.vitrineLogoEntete ?? boutique.logo ?? null,
      logoAccueil: boutique.vitrineLogoAccueil ?? null,
    },
  }
}

/**
 * L'apparence en variables CSS, prêtes à être posées sur `:root`.
 *
 * Composé ici et non dans la vitrine : c'est le même contrat pour les sept
 * structures, et une vitrine qui compose ses propres noms de variables finit
 * par en inventer un que le thème suivant n'a pas.
 */
export function enVariablesCss(apparence: Apparence): string {
  const tiret = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  const lignes = Object.entries(apparence.jetons).map(([cle, v]) => `  --${tiret(cle)}: ${v};`)
  lignes.push(`  --police-titre: '${apparence.polices.titre}';`)
  lignes.push(`  --police-texte: '${apparence.polices.texte}';`)
  lignes.push(`  --photo-rapport: ${apparence.structure.photos.rapport};`)
  lignes.push(`  --photo-recadrage: ${apparence.structure.photos.recadrage};`)
  return `:root {\n${lignes.join('\n')}\n}`
}
