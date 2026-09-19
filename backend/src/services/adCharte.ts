import {
  accentLisibleSur,
  contraste,
  gammesDepuis,
  hslVersHex,
  rgbVersHsl,
  texteLisibleSur,
  type CouleurLogo,
  type Gamme,
} from './logoCouleurs.js'

/**
 * La charte d'une publicité : ses couleurs, sa mise en page, sa typographie.
 *
 * **Le défaut que ça corrige, demandé par Max le 19/09/2026 :** « je souhaite
 * vraiment quelque chose de très créatif, avec de beaux textes, de beaux
 * designs, création libre IA illimitée, couleurs […] elle extrait code couleur
 * gamme idem création de site DropShop ».
 *
 * Et il a raison sur le fond : toutes les publicités sortaient **du même
 * violet**. Le dégradé du bouton (`#a855f7` → `#ec4899`), le voile noir bleuté
 * (`#0b0a14`), la police et la mise en page étaient écrits en dur dans le
 * composeur. Un vendeur qui signe sa pub d'un logo vert olive recevait un
 * bouton violet : ce n'est pas un défaut de goût, c'est une publicité qui ne
 * ressemble pas à sa marque, donc une publicité qu'il ne publie pas.
 *
 * DropShop savait déjà faire : `logoCouleurs.ts` lit le logo pixel par pixel,
 * en tire les couleurs dominantes puis quatre gammes complètes au contraste
 * vérifié. C'est **exactement** ce qu'il faut ici, et c'est pour ça que ce
 * fichier ne recalcule rien : il traduit une gamme de boutique en palette de
 * visuel, et ajoute ce qu'une publicité a de plus qu'une page — une mise en
 * page et une typographie.
 *
 * Deux principes tiennent tout le fichier :
 *
 * 1. **Le déterminisme d'abord.** La charte se calcule sans aucun appel réseau.
 *    Sans clé, sans modèle, une pub reste aux couleurs du logo et deux pubs du
 *    même produit ne se ressemblent pas — la mise en page et la typographie
 *    tournent avec l'index. La leçon de `photoBriefer` : une variété qui dépend
 *    d'un appel réseau n'est pas une variété, c'est une option.
 * 2. **Le contraste n'est jamais laissé au modèle.** Il a le droit de proposer
 *    ses couleurs — c'est la « création libre » demandée — mais un titre blanc
 *    sur fond crème est illisible quelle que soit l'intention. `normaliser`
 *    reprend la main, et il le fait en silence : le vendeur veut une belle
 *    image, pas un avertissement.
 */

/** Les mises en page, dans l'ordre où on les sert. */
export const MISES_EN_PAGE = ['voile', 'carte', 'bande', 'coin'] as const
export type MiseEnPage = (typeof MISES_EN_PAGE)[number]

/** Ce que chaque mise en page donne à voir, pour la consigne du modèle. */
export const MISES_EN_PAGE_DESCRIPTION: Record<MiseEnPage, string> = {
  voile:
    "voile : un dégradé qui monte du bas de l'image, texte posé dessus. Sobre, marche sur toutes les photos, laisse voir la scène.",
  carte:
    'carte : un bloc plein aux coins arrondis, posé en bas avec une marge, bordé de la couleur accent. Net, très lisible, allure de fiche produit.',
  bande:
    "bande : un bandeau plein sur toute la largeur en bas de l'image, filet d'accent sur son arête. Affirmé, façon affiche.",
  coin: "coin : l'accroche en haut, l'offre et le bouton en bas, la photo dégagée au milieu. Pensé pour les formats verticaux.",
}

/** Les typographies disponibles, avec les seules familles réellement installées. */
export const TYPOGRAPHIES = ['moderne', 'affirme', 'elegant', 'editorial'] as const
export type Typographie = (typeof TYPOGRAPHIES)[number]

export interface JeuDePolices {
  /** La pile du titre, fallbacks compris. */
  titre: string
  /** La pile du reste : prix, argument, bouton. */
  texte: string
  poidsTitre: number
  /** Vrai quand le titre part en capitales. */
  capitales: boolean
  /** Interlettrage du titre, en fraction de la taille de police. */
  espacement: number
  /** Largeur moyenne d'un caractère, en fraction de la taille — pour la coupe. */
  largeurCar: number
}

/**
 * Les familles, et pourquoi celles-là.
 *
 * Le serveur n'a que ce que `nixpacks.toml` installe : DejaVu et Liberation.
 * C'est moins pauvre qu'il n'y paraît — les deux paquets embarquent une
 * **serif**, une **sans** et une **condensée**, soit trois voix différentes.
 * Demander une police de plus se paierait en paquets Nix à installer et en
 * déploiement qui casse, pour un gain qu'un vendeur ne nommerait pas.
 *
 * Chaque pile finit par une famille générique : une police manquante dégrade
 * en quelque chose de lisible, jamais en carrés.
 */
export const POLICES: Record<Typographie, JeuDePolices> = {
  moderne: {
    titre: 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif',
    texte: 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif',
    poidsTitre: 800,
    capitales: false,
    espacement: -0.012,
    largeurCar: 0.54,
  },
  affirme: {
    titre: 'DejaVu Sans Condensed, Liberation Sans Narrow, DejaVu Sans, Arial, sans-serif',
    texte: 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif',
    poidsTitre: 800,
    capitales: true,
    espacement: 0.045,
    largeurCar: 0.6,
  },
  elegant: {
    titre: 'DejaVu Serif, Liberation Serif, Georgia, Times New Roman, serif',
    texte: 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif',
    poidsTitre: 700,
    capitales: false,
    espacement: 0.004,
    largeurCar: 0.55,
  },
  editorial: {
    titre: 'Liberation Serif, DejaVu Serif, Georgia, Times New Roman, serif',
    texte: 'Liberation Sans, DejaVu Sans, Helvetica, Arial, sans-serif',
    poidsTitre: 400,
    capitales: false,
    espacement: 0.01,
    largeurCar: 0.5,
  },
}

export interface PaletteAd {
  /** Le fond du bandeau, de la carte ou de la bande. */
  fond: string
  /** Le titre et le prix. Contraste vérifié contre `fond`. */
  texte: string
  /** L'argument et l'adresse : lisible, mais en retrait. */
  sourd: string
  /** Le début du dégradé du bouton. */
  accent: string
  /** Sa fin. */
  accent2: string
  /** Le texte du bouton, lisible sur le dégradé. */
  surAccent: string
  /** Sombre ou clair : décide l'opacité du voile et la teinte de l'ombre. */
  mode: 'sombre' | 'clair'
}

export interface CharteAd {
  palette: PaletteAd
  miseEnPage: MiseEnPage
  typographie: Typographie
  /** La gamme d'origine, pour l'écrire au vendeur (« Sombre », « Naturelle »). */
  gamme: string
  /** Les couleurs dominantes du logo, en hexadécimal. */
  couleursLogo: string[]
  origine: 'logo' | 'gamme' | 'defaut'
}

/**
 * La charte servie quand il n'y a rien à lire : pas de logo, pas de couleur.
 *
 * C'est l'ancien visuel, à l'identique — le violet de la marque DropShipper.
 * Il n'a rien de mauvais ; ce qui était mauvais, c'est qu'il était le seul.
 */
export const PALETTE_DEFAUT: PaletteAd = {
  fond: '#0b0a14',
  texte: '#ffffff',
  sourd: '#cbd5e1',
  accent: '#a855f7',
  accent2: '#ec4899',
  surAccent: '#ffffff',
  mode: 'sombre',
}

export const CHARTE_DEFAUT: CharteAd = {
  palette: PALETTE_DEFAUT,
  miseEnPage: 'voile',
  typographie: 'moderne',
  gamme: 'Sombre',
  couleursLogo: [],
  origine: 'defaut',
}

/** Vrai pour un `#rrggbb` ou un `#rgb` : tout le reste est refusé sans discuter. */
export function estHex(v: unknown): v is string {
  return typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

/** Ramène `#abc` à `#aabbcc` : le calcul de contraste lit six chiffres. */
export function hexLong(v: string): string {
  const t = v.trim().toLowerCase()
  return t.length === 4 ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : t
}

function versHsl(hex: string): [number, number, number] {
  const h = hexLong(hex)
  return rgbVersHsl(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16))
}

/** La palette d'une publicité, tirée d'une gamme de boutique. */
export function paletteDepuisGamme(g: Gamme): PaletteAd {
  return {
    fond: g.jetons.fond,
    texte: g.jetons.texte,
    sourd: g.jetons.sourd,
    accent: g.jetons.accent,
    accent2: g.jetons.accent2,
    surAccent: texteSurAccent(g.jetons.accent, g.jetons.accent2),
    mode: g.mode,
  }
}

/**
 * Le texte du bouton : blanc ou presque noir, celui des deux qui se lit.
 *
 * **Attrapé par le banc du 19/09/2026, et ce n'était pas le cas tordu qu'on
 * cherchait.** La première version décidait à la clarté : au-dessus de 55 %,
 * texte sombre, sinon blanc. Un vert moyen (`#58c05c`) se range juste
 * au-dessous du seuil, reçoit du blanc, et rend 2,2 : 1 — un bouton qu'on voit
 * sans pouvoir le lire, sur la seule partie de l'image qui demande un geste.
 *
 * La clarté n'est pas la luminance : un jaune très clair et un bleu très clair
 * ne renvoient pas la même lumière. On mesure donc les deux candidats au lieu
 * de les deviner, et sur les DEUX bornes du dégradé — un bouton clair d'un côté
 * et foncé de l'autre laisserait la moitié de son texte illisible.
 */
export function texteSurAccent(accent: string, accent2: string): string {
  const a = hexLong(accent)
  const b = hexLong(accent2)
  const note = (c: string) => Math.min(contraste(c, a), contraste(c, b))
  return note('#ffffff') >= note('#101014') ? '#ffffff' : '#101014'
}

/**
 * La charte d'une publicité.
 *
 * `index` fait tourner mise en page et typographie : deux publicités du même
 * produit ne se ressemblent pas, **même quand le modèle n'a pas répondu**.
 */
export function chartePour(params: {
  couleurs: CouleurLogo[]
  /** L'identifiant d'une gamme (`sombre`, `clair`, `contraste`, `naturel`). */
  gamme?: string | null
  /** Le rang de cette publicité dans la demande. */
  index?: number
  /** Une mise en page imposée, quand le vendeur en a choisi une. */
  miseEnPage?: MiseEnPage | null
  typographie?: Typographie | null
}): CharteAd {
  const index = params.index ?? 0
  const miseEnPage = params.miseEnPage ?? MISES_EN_PAGE[index % MISES_EN_PAGE.length]
  const typographie = params.typographie ?? TYPOGRAPHIES[index % TYPOGRAPHIES.length]

  if (!params.couleurs.length) {
    return { ...CHARTE_DEFAUT, miseEnPage, typographie }
  }

  const gammes = gammesDepuis(params.couleurs)
  // « Sombre » par défaut : un visuel publicitaire pose du texte sur une photo,
  // et un bandeau sombre le tient lisible quelle que soit la photo dessous.
  const choisie = gammes.find((g) => g.id === params.gamme) ?? gammes.find((g) => g.id === 'sombre') ?? gammes[0]

  return {
    palette: paletteDepuisGamme(choisie),
    miseEnPage,
    typographie,
    gamme: choisie.nom,
    couleursLogo: params.couleurs.map((c) => c.hex),
    origine: params.gamme ? 'gamme' : 'logo',
  }
}

/**
 * Reprend la palette proposée par le modèle, et la rend lisible.
 *
 * **Le modèle a le droit de tout proposer, et il n'a pas le dernier mot.** Il
 * connaît la marque et le produit, pas le rapport de contraste WCAG — il écrit
 * volontiers un titre `#f5f5f5` sur un fond `#fefaf0` parce que ça sonne
 * élégant. La règle : on garde ses teintes, on corrige leur clarté jusqu'à ce
 * qu'elles se lisent. Tout ce qui n'est pas un hexadécimal valable retombe sur
 * le repli, sans faire échouer la publicité.
 */
export function normaliserPalette(brut: unknown, repli: PaletteAd): PaletteAd {
  const p = (brut ?? {}) as Record<string, unknown>
  const prendre = (cle: string, defaut: string) => (estHex(p[cle]) ? hexLong(p[cle] as string) : defaut)

  const fond = prendre('fond', repli.fond)
  const [, , lFond] = versHsl(fond)
  const clair = lFond > 0.5

  // Le texte : la teinte proposée si elle se lit, sinon le gris de la gamme.
  let texte = prendre('texte', repli.texte)
  if (contraste(fond, texte) < 4.5) {
    texte = contraste(fond, repli.texte) >= 4.5 ? repli.texte : texteLisibleSur(fond, clair)
  }

  // L'argument est en retrait, donc on lui demande moins — mais pas rien :
  // sous 3 : 1 il disparaît sur un écran de téléphone en plein soleil.
  let sourd = prendre('sourd', repli.sourd)
  if (contraste(fond, sourd) < 3) {
    const [h, s] = versHsl(sourd)
    sourd = hslVersHex(h, Math.min(s, 0.35), clair ? 0.38 : 0.74)
    if (contraste(fond, sourd) < 3) sourd = texte
  }

  const remonter = (hex: string, repliHex: string) => {
    if (contraste(fond, hex) >= 3) return hex
    const [h, s, l] = versHsl(hex)
    const corrige = accentLisibleSur(fond, h, Math.max(s, 0.4), l, clair)
    return contraste(fond, corrige) >= 3 ? corrige : repliHex
  }

  const accent = remonter(prendre('accent', repli.accent), repli.accent)
  const accent2 = remonter(prendre('accent2', repli.accent2), repli.accent2)

  return {
    fond,
    texte,
    sourd,
    accent,
    accent2,
    surAccent: texteSurAccent(accent, accent2),
    mode: clair ? 'clair' : 'sombre',
  }
}

/** La charte écrite pour le modèle : ce qu'il reçoit comme point de départ. */
export function charteEnTexte(c: CharteAd): string {
  const lignes = [
    c.couleursLogo.length
      ? `Couleurs relevées dans le logo de la boutique : ${c.couleursLogo.join(', ')}.`
      : "Cette boutique n'a pas de logo lisible : la palette est libre, mais elle doit rester cohérente d'un bout à l'autre du visuel.",
    `Gamme de départ (${c.gamme}) : fond ${c.palette.fond}, texte ${c.palette.texte}, second texte ${c.palette.sourd}, accent ${c.palette.accent} → ${c.palette.accent2}.`,
  ]
  return lignes.join('\n')
}

/**
 * Les mots d'ambiance d'une palette, pour le brief photo.
 *
 * Le modèle d'image ne reçoit pas d'hexadécimal — il le lit mal, et surtout il
 * repeindrait le produit. Ce qu'on lui donne, c'est le décor : « des tons
 * ocre », « un fond vert profond ». La teinte du logo passe ainsi dans la
 * scène sans jamais toucher au produit, qui doit rester celui du colis.
 */
export function ambianceDe(c: CharteAd): string {
  if (!c.couleursLogo.length) return ''
  const noms = c.couleursLogo.slice(0, 3).map((hex) => nomDeTeinte(hex))
  const uniques = [...new Set(noms)]
  return uniques.length ? `des tons ${uniques.join(' et ')}` : ''
}

/** Le nom français d'une teinte, à la louche : c'est un mot d'ambiance, pas une mesure. */
export function nomDeTeinte(hex: string): string {
  const [h, s, l] = versHsl(hex)
  if (l > 0.9) return 'blanc cassé'
  if (l < 0.12) return 'noir profond'
  if (s < 0.12) return l > 0.55 ? 'gris clair' : 'gris ardoise'
  const teintes: Array<[number, string]> = [
    [15, 'rouge'],
    [40, 'orangé'],
    [65, 'doré'],
    [90, 'vert tendre'],
    [160, 'vert profond'],
    [195, 'turquoise'],
    [250, 'bleu'],
    [290, 'violet'],
    [330, 'rose'],
    [360, 'rouge'],
  ]
  const base = teintes.find(([borne]) => h <= borne)?.[1] ?? 'bleu'
  return l > 0.7 ? `${base} clair` : base
}
