import sharp from 'sharp'
import { fetchSourceImage } from './watermark.js'
import { CHARTE_DEFAUT, POLICES, type CharteAd, type JeuDePolices, type PaletteAd } from './adCharte.js'

/**
 * La publicité, composée ici et non demandée au modèle.
 *
 * Un visuel publicitaire n'est pas une belle photo : c'est une photo QUI PORTE
 * une offre — la marque, une accroche, le prix, un appel au clic. Le modèle
 * d'images écrit mal (lettres inventées, prix faux, logo approximatif) : la
 * scène vient donc de lui, et tout ce qui porte du sens est dessiné ici, au
 * pixel près, à partir des vraies données de l'annonce.
 *
 * **Refait le 15/10/2026, sur la capture de Max** : « on ne voit même pas le
 * produit, toujours un texte avec un bouton, dégradé, un aplat, aucune
 * création ». Il avait raison, et pour trois causes mesurables :
 *
 * 1. **Le produit était recouvert.** Le bloc d'offre (logo, titre, filet, prix,
 *    argument, bouton) était empilé sur un aplat qui prenait jusqu'à la moitié
 *    de l'image — exactement là où le modèle posait le produit.
 * 2. **Les quatre mises en page n'en faisaient qu'une** : le même bloc, sur un
 *    voile, une carte, une bande ou en deux morceaux, avec le même bouton
 *    pilule en dégradé.
 * 3. **Les polices étaient celles de secours de Linux** (DejaVu), d'où l'air
 *    de formulaire, et le titre trop long était coupé par « … ».
 *
 * Désormais : quatre directions artistiques qui montrent le produit chacune à
 * sa façon (voir `MISES_EN_PAGE_DESCRIPTION`), aucune ne couvre plus d'un tiers
 * de la photo ; le prix devient une pastille, une étiquette ou un chiffre de
 * magazine ; l'appel au clic change de forme ; les polices d'affiche sont
 * embarquées ; et le titre est **mesuré** puis ajusté en taille au lieu d'être
 * coupé.
 */

/** Échappe le texte pour le SVG : une esperluette dans un titre casse tout le calque. */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface AdCopy {
  title: string
  /** Déjà formaté, devise comprise : « 24,90 € ». Vide : pas de prix affiché. */
  price: string
  /** Barré à côté du prix, quand le vendeur affiche une remise. */
  priceBefore?: string | null
  shopName?: string | null
  /** Chemin ou URL du logo de la boutique. */
  logo?: string | null
  ctaLabel: string
  /** Affiché près du bouton, tel quel. Aucune adresse n'est inventée. */
  ctaUrl?: string | null
  /** Une ligne courte : livraison offerte, garantie deux ans… */
  argument?: string | null
}

/* ========================================================================== */
/*  Mesurer le texte                                                          */
/* ========================================================================== */

interface Voix {
  famille: string
  poids: number
  /** Interlettrage, en fraction de la taille. */
  espacement?: number
}

/**
 * La largeur réelle d'un texte, en pixels, pour une taille de 100.
 *
 * Mesurée et non estimée : la version précédente supposait une largeur moyenne
 * par caractère, et c'est ce qui coupait « LA TOUR SOUS LE BUREAU A FAIT SON… »
 * alors que la place existait. On rend le texte une fois, à blanc, et on lit la
 * largeur de l'encre. La largeur est proportionnelle à la taille : une seule
 * mesure sert pour toutes les tailles essayées.
 */
const mesures = new Map<string, number>()

async function largeur100(texte: string, v: Voix): Promise<number> {
  if (!texte.trim()) return 0
  const cle = `${v.famille}|${v.poids}|${v.espacement ?? 0}|${texte}`
  const connue = mesures.get(cle)
  if (connue !== undefined) return connue

  const largeurToile = Math.ceil(texte.length * 110 + 200)
  const svg = `<svg width="${largeurToile}" height="200" xmlns="http://www.w3.org/2000/svg"><text x="20" y="140" font-family="${xml(v.famille)}" font-weight="${v.poids}" font-size="100" letter-spacing="${(v.espacement ?? 0) * 100}" fill="#000">${xml(texte)}</text></svg>`
  let w: number
  try {
    const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true })
    w = info.width
  } catch {
    // Rien d'imprimable (des espaces seuls) : une estimation suffit.
    w = texte.length * 55
  }
  if (mesures.size > 4000) mesures.clear()
  mesures.set(cle, w)
  return w
}

async function largeur(texte: string, v: Voix, taille: number): Promise<number> {
  return ((await largeur100(texte, v)) * taille) / 100
}

/** La hauteur d'une capitale, en fraction de la taille : où poser la ligne de base. */
const capitales = new Map<string, number>()

async function hauteurCapitale(v: Voix): Promise<number> {
  const cle = `${v.famille}|${v.poids}`
  const connue = capitales.get(cle)
  if (connue !== undefined) return connue
  const svg = `<svg width="300" height="240" xmlns="http://www.w3.org/2000/svg"><text x="20" y="180" font-family="${xml(v.famille)}" font-weight="${v.poids}" font-size="100" fill="#000">H</text></svg>`
  let h = 0.72
  try {
    const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true })
    h = info.height / 100
  } catch {
    // On garde la valeur moyenne d'une linéale.
  }
  capitales.set(cle, h)
  return h
}

/** Coupe un texte en lignes mesurées. `null` quand il ne tient pas dans `lignesMax`. */
async function couper(
  texte: string,
  v: Voix,
  taille: number,
  largeurMax: number,
  lignesMax: number,
): Promise<string[] | null> {
  const mots = texte.split(/\s+/).filter(Boolean)
  const lignes: string[] = []
  let courante = ''
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot
    if ((await largeur(essai, v, taille)) <= largeurMax) {
      courante = essai
      continue
    }
    if (!courante) return null // un seul mot plus large que la place
    lignes.push(courante)
    courante = mot
    if ((await largeur(mot, v, taille)) > largeurMax) return null
  }
  if (courante) lignes.push(courante)
  return lignes.length <= lignesMax ? lignes : null
}

interface Ajuste {
  taille: number
  lignes: string[]
}

/**
 * La plus grande taille à laquelle le texte tient en entier.
 *
 * Un titre ne se coupe plus : il rapetisse. Ce n'est qu'au plancher — un texte
 * que le modèle aurait écrit trois fois trop long — qu'on se résout à
 * l'ellipse, sur un mot entier.
 */
async function ajuster(
  texte: string,
  v: Voix,
  bornes: { max: number; min: number; largeur: number; lignes: number; hauteur?: number; interligne?: number },
): Promise<Ajuste> {
  const il = bornes.interligne ?? 1.1
  for (let t = Math.round(bornes.max); t >= bornes.min; t = Math.floor(t * 0.94)) {
    const lignes = await couper(texte, v, t, bornes.largeur, bornes.lignes)
    if (!lignes) continue
    if (bornes.hauteur && t * (il * (lignes.length - 1) + 1) > bornes.hauteur) continue
    return { taille: t, lignes }
  }

  // Le plancher : on garde ce qui tient, et la fin se signale.
  const t = Math.round(bornes.min)
  const mots = texte.split(/\s+/).filter(Boolean)
  const lignes: string[] = []
  let courante = ''
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot
    if ((await largeur(essai, v, t)) <= bornes.largeur || !courante) {
      courante = essai
      continue
    }
    lignes.push(courante)
    courante = mot
    if (lignes.length === bornes.lignes) break
  }
  if (courante && lignes.length < bornes.lignes) lignes.push(courante)
  if (lignes.join(' ').length < mots.join(' ').length) {
    lignes[lignes.length - 1] = `${lignes[lignes.length - 1].replace(/[\s.,;:]+$/, '')}…`
  }
  return { taille: t, lignes }
}

/* ========================================================================== */
/*  Les pièces dessinées                                                      */
/* ========================================================================== */

function texteSvg(p: {
  x: number
  y: number
  texte: string
  v: Voix
  taille: number
  couleur: string
  ancre?: 'start' | 'middle' | 'end'
  opacite?: number
  barre?: boolean
}): string {
  return `<text x="${Math.round(p.x)}" y="${Math.round(p.y)}" font-family="${xml(p.v.famille)}" font-weight="${p.v.poids}" font-size="${Math.round(p.taille)}" letter-spacing="${((p.v.espacement ?? 0) * p.taille).toFixed(2)}"${p.ancre && p.ancre !== 'start' ? ` text-anchor="${p.ancre}"` : ''}${p.opacite !== undefined ? ` fill-opacity="${p.opacite}"` : ''}${p.barre ? ' text-decoration="line-through"' : ''} fill="${p.couleur}">${xml(p.texte)}</text>`
}

/** Une flèche dessinée : les polices n'ont pas toutes la même, et certaines n'en ont pas. */
function fleche(x: number, yMilieu: number, taille: number, couleur: string): string {
  const l = taille * 0.78
  const e = Math.max(2, taille * 0.11)
  const t = taille * 0.3
  return `<path d="M ${x} ${yMilieu} H ${x + l} M ${x + l - t} ${yMilieu - t} L ${x + l} ${yMilieu} L ${x + l - t} ${yMilieu + t}" stroke="${couleur}" stroke-width="${e.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
}

/** Un titre de plusieurs lignes, haut de la première capitale à `haut`. */
async function blocTitre(p: {
  x: number
  haut: number
  a: Ajuste
  v: Voix
  interligne: number
  couleur: string
  ancre?: 'start' | 'middle' | 'end'
}): Promise<{ svg: string; bas: number }> {
  const cap = await hauteurCapitale(p.v)
  const pas = p.a.taille * p.interligne
  const svg = p.a.lignes
    .map((l, i) =>
      texteSvg({ x: p.x, y: p.haut + cap * p.a.taille + i * pas, texte: l, v: p.v, taille: p.a.taille, couleur: p.couleur, ancre: p.ancre }),
    )
    .join('')
  return { svg, bas: p.haut + cap * p.a.taille + (p.a.lignes.length - 1) * pas }
}

/** « 642,51 € » → « 642 », « ,51 », « € » : le chiffre se lit d'abord, les centimes après. */
export function decouperPrix(prix: string): { entier: string; decimales: string; devise: string } {
  const propre = prix.replace(/[  ]/g, ' ').trim()
  const m = propre.match(/^([^\d]*?)(\d[\d\s.]*?)([,.]\d{1,2})?\s*([^\d]*)$/)
  if (!m) return { entier: propre, decimales: '', devise: '' }
  const devise = `${m[1].trim()}${m[4].trim()}`.trim()
  // Les centimes passent en exposant, sans virgule : « 642⁵¹ € », l'écriture des affiches.
  return { entier: m[2].trim(), decimales: (m[3] ?? '').slice(1), devise }
}

type FormeAppel = 'pilule' | 'lien' | 'contour'

/** Le bouton, sous trois formes : la pilule pleine, le lien souligné, le contour. */
async function appel(p: {
  x: number
  haut: number
  libelle: string
  forme: FormeAppel
  taille: number
  palette: PaletteAd
  voix: Voix
  /** Couleur du texte pour le lien et le contour (posés sur une photo ou un panneau). */
  couleur?: string
  ancre?: 'start' | 'end'
}): Promise<{ svg: string; largeur: number; hauteur: number }> {
  const v = p.voix
  const libelle = p.forme === 'lien' ? p.libelle.toLocaleUpperCase('fr-FR') : p.libelle
  const t = p.forme === 'lien' ? p.taille * 0.82 : p.taille
  const lt = await largeur(libelle, v, t)
  const cap = await hauteurCapitale(v)
  const tf = t * 1.05
  const gap = t * 0.5

  if (p.forme === 'lien') {
    const couleur = p.couleur ?? p.palette.accent
    const total = lt + gap + tf * 0.78
    const x0 = p.ancre === 'end' ? p.x - total : p.x
    const base = p.haut + cap * t
    const trait = Math.max(2, t * 0.09)
    const svg =
      texteSvg({ x: x0, y: base, texte: libelle, v, taille: t, couleur }) +
      fleche(x0 + lt + gap, base - (cap * t) / 2, tf, couleur) +
      `<rect x="${Math.round(x0)}" y="${Math.round(base + t * 0.32)}" width="${Math.round(total)}" height="${trait.toFixed(1)}" fill="${couleur}"/>`
    return { svg, largeur: total, hauteur: cap * t + t * 0.32 + trait }
  }

  const hauteur = Math.round(t * 2.2)
  const pad = t * 1.15
  const largeurBouton = Math.round(pad * 2 + lt + gap + tf * 0.78)
  const x0 = p.ancre === 'end' ? p.x - largeurBouton : p.x
  const base = p.haut + hauteur / 2 + (cap * t) / 2
  const plein = p.forme === 'pilule'
  const couleurTexte = plein ? p.palette.surAccent : (p.couleur ?? p.palette.texte)
  const fond = plein
    ? `<rect x="${Math.round(x0)}" y="${Math.round(p.haut)}" width="${largeurBouton}" height="${hauteur}" rx="${Math.round(hauteur / 2)}" fill="${p.palette.accent}"/>`
    : `<rect x="${Math.round(x0 + 1.5)}" y="${Math.round(p.haut + 1.5)}" width="${largeurBouton - 3}" height="${hauteur - 3}" rx="${Math.round(hauteur / 2)}" fill="none" stroke="${couleurTexte}" stroke-width="${Math.max(2, t * 0.09).toFixed(1)}"/>`
  const svg =
    fond +
    texteSvg({ x: x0 + pad, y: base, texte: libelle, v, taille: t, couleur: couleurTexte }) +
    fleche(x0 + pad + lt + gap, p.haut + hauteur / 2, tf, couleurTexte)
  return { svg, largeur: largeurBouton, hauteur }
}

/**
 * Le prix en pastille ronde, inclinée : la pièce qui fait « publicité » au
 * premier regard, et qui ne cache qu'un coin de la photo.
 */
async function pastille(p: {
  cx: number
  cy: number
  r: number
  prix: string
  avant?: string | null
  police: JeuDePolices
  palette: PaletteAd
  angle?: number
}): Promise<string> {
  const { entier, decimales, devise } = decouperPrix(p.prix)
  const v: Voix = { famille: p.police.prix, poids: p.police.poidsPrix }
  const petit: Voix = { famille: p.police.texte, poids: 800 }
  const couleur = p.palette.surAccent

  let t = p.r * 0.92
  let le = 0
  let ld = 0
  const ecartement = () => p.r * 0.05
  for (; t > p.r * 0.3; t *= 0.93) {
    le = await largeur(entier, v, t)
    ld = Math.max(await largeur(decimales, v, t * 0.42), await largeur(devise, petit, t * 0.3))
    if (le + (ld ? ecartement() + ld : 0) <= p.r * 1.45) break
  }
  const cap = await hauteurCapitale(v)
  const total = le + (ld ? ecartement() + ld : 0)
  const x0 = p.cx - total / 2
  const base = p.cy + (cap * t) / 2 + (p.avant ? p.r * 0.1 : 0)
  const xd = x0 + le + ecartement()
  const angle = p.angle ?? -8

  const morceaux = [
    `<circle cx="${p.cx}" cy="${p.cy + p.r * 0.06}" r="${p.r}" fill="#000" fill-opacity="0.28" filter="url(#flou)"/>`,
    `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.palette.accent}"/>`,
    `<circle cx="${p.cx}" cy="${p.cy}" r="${(p.r * 0.88).toFixed(1)}" fill="none" stroke="${couleur}" stroke-opacity="0.35" stroke-width="${Math.max(1.5, p.r * 0.012).toFixed(1)}" stroke-dasharray="${(p.r * 0.04).toFixed(1)} ${(p.r * 0.03).toFixed(1)}"/>`,
    texteSvg({ x: x0, y: base, texte: entier, v, taille: t, couleur }),
  ]
  if (decimales) morceaux.push(texteSvg({ x: xd, y: base - cap * t + cap * t * 0.42, texte: decimales, v, taille: t * 0.42, couleur }))
  if (devise) morceaux.push(texteSvg({ x: xd, y: base, texte: devise, v: petit, taille: t * 0.3, couleur }))
  if (p.avant) {
    morceaux.push(
      texteSvg({ x: p.cx, y: base - cap * t - p.r * 0.12, texte: p.avant, v: petit, taille: p.r * 0.17, couleur, ancre: 'middle', opacite: 0.8, barre: true }),
    )
  }
  return `<g transform="rotate(${angle} ${p.cx} ${p.cy})">${morceaux.join('')}</g>`
}

/** Le prix écrit en ligne, chiffre fort et centimes en exposant : pour les panneaux et les étiquettes. */
async function prixEnLigne(p: {
  x: number
  haut: number
  prix: string
  avant?: string | null
  taille: number
  police: JeuDePolices
  couleur: string
  sourd: string
  ancre?: 'start' | 'end'
}): Promise<{ svg: string; largeur: number; hauteur: number }> {
  const { entier, decimales, devise } = decouperPrix(p.prix)
  const v: Voix = { famille: p.police.prix, poids: p.police.poidsPrix }
  const petit: Voix = { famille: p.police.texte, poids: 700 }
  const t = p.taille
  const cap = await hauteurCapitale(v)
  const le = await largeur(entier, v, t)
  const ld = await largeur(decimales, v, t * 0.45)
  const lv = devise ? await largeur(devise, petit, t * 0.34) : 0
  const ecart = t * 0.06
  const la = p.avant ? await largeur(p.avant, petit, t * 0.32) : 0
  const total = le + ecart + Math.max(ld, lv) + (la ? t * 0.35 + la : 0)
  const x0 = p.ancre === 'end' ? p.x - total : p.x
  const base = p.haut + cap * t
  const xd = x0 + le + ecart
  let svg = texteSvg({ x: x0, y: base, texte: entier, v, taille: t, couleur: p.couleur })
  if (decimales) svg += texteSvg({ x: xd, y: base - cap * t + cap * t * 0.45, texte: decimales, v, taille: t * 0.45, couleur: p.couleur })
  if (devise) svg += texteSvg({ x: xd, y: base, texte: devise, v: petit, taille: t * 0.34, couleur: p.couleur })
  if (p.avant) {
    svg += texteSvg({ x: xd + Math.max(ld, lv) + t * 0.35, y: base, texte: p.avant, v: petit, taille: t * 0.32, couleur: p.sourd, barre: true })
  }
  return { svg, largeur: total, hauteur: cap * t }
}

/** Le logo, à la hauteur voulue. `null` s'il est illisible : la pub sort sans lui. */
async function chargerLogo(source: string | null | undefined, hauteur: number): Promise<{ buffer: Buffer; largeur: number } | null> {
  if (!source) return null
  const brut = await fetchSourceImage(source)
  if (!brut) return null
  try {
    const buffer = await sharp(brut, { density: 300 })
      .resize({ height: Math.round(hauteur), fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer()
    const m = await sharp(buffer).metadata()
    // Un logo très large se ramène à trois fois sa hauteur : il signe, il ne titre pas.
    if ((m.width ?? 0) > hauteur * 3.2) {
      const reduit = await sharp(buffer).resize({ width: Math.round(hauteur * 3.2), fit: 'inside' }).png().toBuffer()
      return { buffer: reduit, largeur: Math.round(hauteur * 3.2) }
    }
    return { buffer, largeur: m.width ?? Math.round(hauteur) }
  } catch {
    return null
  }
}

/** La photo recadrée sur son sujet, à la taille d'une zone, coins arrondis si demandé. */
async function photoDans(base: Buffer, w: number, h: number, rayon = 0): Promise<Buffer> {
  const img = sharp(base).resize(Math.round(w), Math.round(h), { fit: 'cover', position: 'attention' })
  if (!rayon) return img.png().toBuffer()
  const masque = Buffer.from(
    `<svg width="${Math.round(w)}" height="${Math.round(h)}" xmlns="http://www.w3.org/2000/svg"><rect width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(rayon)}" fill="#fff"/></svg>`,
  )
  return img.composite([{ input: masque, blend: 'dest-in' }]).png().toBuffer()
}

/* ========================================================================== */
/*  Les quatre directions artistiques                                         */
/* ========================================================================== */

interface Contexte {
  base: Buffer
  W: number
  H: number
  cote: number
  marge: number
  paysage: boolean
  vertical: boolean
  copy: AdCopy
  p: PaletteAd
  police: JeuDePolices
  titre: Voix
  texte: Voix
  /** Le titre tel qu'il s'imprime (capitales ou non). */
  accroche: string
  aPrix: boolean
}

interface Rendu {
  /** Le fond de la toile : la photo plein cadre, ou une couleur unie. */
  toile: { photo: true } | { couleur: string }
  /** Les photos posées sur la toile, hors plein cadre. */
  photos: Array<{ input: Buffer; left: number; top: number }>
  svg: string
  logo?: { left: number; top: number; hauteur: number; aDroite?: boolean }
}

const DEFS = (p: PaletteAd) => `
  <defs>
    <filter id="flou" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
    <linearGradient id="haut" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.fond}" stop-opacity="0.88"/>
      <stop offset="55%" stop-color="${p.fond}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${p.fond}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bas" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.fond}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${p.fond}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${p.fond}" stop-opacity="0.86"/>
    </linearGradient>
    <linearGradient id="gauche" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${p.fond}" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="${p.fond}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${p.fond}" stop-opacity="0"/>
    </linearGradient>
  </defs>`

/**
 * AFFICHE — l'accroche en très grand en haut, le produit au centre, le prix en
 * pastille inclinée. Les voiles ne montent que sous le texte.
 */
async function affiche(c: Contexte): Promise<Rendu> {
  const { W, H, cote, marge, p } = c
  const hLogo = Math.round(cote * 0.07)
  const morceaux: string[] = []

  // La zone de l'accroche : le haut de l'image (la moitié gauche en bannière).
  const largeurTitre = c.paysage ? W * 0.5 - marge : W - marge * 2
  const hautTitre = marge + hLogo + Math.round(cote * 0.035)
  const a = await ajuster(c.accroche, c.titre, {
    max: cote * (c.paysage ? 0.13 : c.vertical ? 0.15 : 0.125),
    min: cote * 0.055,
    largeur: largeurTitre,
    lignes: c.paysage ? 4 : 3,
    hauteur: c.paysage ? H * 0.5 : H * (c.vertical ? 0.22 : 0.27),
    interligne: c.police.interligne,
  })
  const titre = await blocTitre({ x: marge, haut: hautTitre, a, v: c.titre, interligne: c.police.interligne, couleur: p.texte })

  let basTexte = titre.bas
  let argSvg = ''
  const tArg = cote * 0.034
  if (c.copy.argument) {
    const arg = await ajuster(c.copy.argument, { famille: c.police.texte, poids: 600 }, { max: tArg, min: tArg * 0.75, largeur: largeurTitre, lignes: 2 })
    const b = await blocTitre({ x: marge, haut: basTexte + cote * 0.03, a: arg, v: { famille: c.police.texte, poids: 600 }, interligne: 1.3, couleur: p.texte })
    argSvg = b.svg
    basTexte = b.bas
  }

  // L'appel : sous l'accroche en bannière, au pied de l'image sinon.
  const tCta = cote * (c.paysage ? 0.042 : c.vertical ? 0.046 : 0.038)
  const hCta = Math.round(tCta * 2.2)
  const hautCta = c.paysage ? basTexte + cote * 0.06 : H - marge - hCta
  const bouton = await appel({ x: marge, haut: hautCta, libelle: c.copy.ctaLabel, forme: 'pilule', taille: tCta, palette: p, voix: { famille: c.police.texte, poids: 800 } })
  let urlSvg = ''
  if (c.copy.ctaUrl) {
    urlSvg = texteSvg({ x: marge + bouton.largeur + tCta * 0.7, y: hautCta + hCta / 2 + tCta * 0.3, texte: c.copy.ctaUrl, v: { famille: c.police.texte, poids: 600 }, taille: tCta * 0.75, couleur: p.texte, opacite: 0.85 })
  }

  // Les voiles, à la taille du texte qu'ils portent.
  if (c.paysage) {
    morceaux.push(`<rect x="0" y="0" width="${Math.round(W * 0.66)}" height="${H}" fill="url(#gauche)"/>`)
  } else {
    morceaux.push(`<rect x="0" y="0" width="${W}" height="${Math.round(basTexte + cote * 0.12)}" fill="url(#haut)"/>`)
    const hautVoile = Math.round(hautCta - cote * 0.1)
    morceaux.push(`<rect x="0" y="${hautVoile}" width="${W}" height="${H - hautVoile}" fill="url(#bas)"/>`)
  }
  morceaux.push(titre.svg, argSvg, bouton.svg, urlSvg)

  if (c.aPrix) {
    const r = Math.round(c.paysage ? H * 0.2 : cote * (c.vertical ? 0.16 : 0.145))
    const cx = W - marge - r * (c.paysage ? 1 : 0.92)
    const cy = c.paysage ? H - marge - r * 1.05 : H * (c.vertical ? 0.72 : 0.66)
    morceaux.push(await pastille({ cx, cy, r, prix: c.copy.price, avant: c.copy.priceBefore, police: c.police, palette: p }))
  }

  return { toile: { photo: true }, photos: [], svg: morceaux.join(''), logo: { left: marge, top: marge, hauteur: hLogo } }
}

/**
 * ÉDITORIAL — la photo intacte d'un côté, un panneau de couleur de l'autre. Le
 * produit n'a plus rien par-dessus lui : c'est la réponse la plus directe à
 * « on ne voit même pas le produit ».
 */
async function editorial(c: Contexte): Promise<Rendu> {
  const { W, H, cote, p } = c
  // Le panneau : à gauche en bannière, en bas en vertical, à droite en carré.
  const sens = c.paysage ? 'gauche' : c.vertical ? 'bas' : 'droite'
  const partPanneau = c.paysage ? 0.42 : c.vertical ? 0.36 : 0.4
  const panneau =
    sens === 'gauche'
      ? { x: 0, y: 0, w: Math.round(W * partPanneau), h: H }
      : sens === 'droite'
        ? { x: Math.round(W * (1 - partPanneau)), y: 0, w: W - Math.round(W * (1 - partPanneau)), h: H }
        : { x: 0, y: Math.round(H * (1 - partPanneau)), w: W, h: H - Math.round(H * (1 - partPanneau)) }
  const photo =
    sens === 'gauche'
      ? { x: panneau.w, y: 0, w: W - panneau.w, h: H }
      : sens === 'droite'
        ? { x: 0, y: 0, w: panneau.x, h: H }
        : { x: 0, y: 0, w: W, h: panneau.y }

  const pad = Math.round(cote * 0.06)
  const largeurUtile = panneau.w - pad * 2
  const hLogo = Math.round(cote * 0.055)
  const voixPetite: Voix = { famille: c.police.texte, poids: 800, espacement: 0.16 }

  // On mesure la colonne entière avant de la poser, pour la centrer.
  const tEnseigne = cote * 0.024
  const enseigne = !c.copy.logo && c.copy.shopName ? c.copy.shopName.toLocaleUpperCase('fr-FR') : ''
  const hEntete = c.copy.logo ? hLogo : enseigne ? tEnseigne : 0
  const tPrix = cote * (c.vertical ? 0.1 : 0.085)
  const capPrix = await hauteurCapitale({ famille: c.police.prix, poids: c.police.poidsPrix })
  const hPrix = c.aPrix ? capPrix * tPrix : 0
  const tCta = cote * 0.034
  const hCta = tCta * 1.2
  const tArg = cote * 0.03
  const ecart = cote * 0.035

  const fixe = hEntete + (hEntete ? ecart : 0) + ecart * 0.8 + (c.aPrix ? hPrix + ecart : 0) + hCta
  const arg = c.copy.argument
    ? await ajuster(c.copy.argument, { famille: c.police.texte, poids: 500 }, { max: tArg, min: tArg * 0.8, largeur: largeurUtile, lignes: 2 })
    : null
  const capArg = await hauteurCapitale({ famille: c.police.texte, poids: 500 })
  const hArg = arg ? capArg * arg.taille + (arg.lignes.length - 1) * arg.taille * 1.35 + ecart * 0.8 : 0
  const a = await ajuster(c.accroche, c.titre, {
    max: cote * (c.vertical ? 0.1 : 0.09),
    min: cote * 0.045,
    largeur: largeurUtile,
    lignes: c.vertical ? 3 : c.paysage ? 4 : 5,
    hauteur: panneau.h - pad * 2 - fixe - hArg,
    interligne: c.police.interligne,
  })
  const capTitre = await hauteurCapitale(c.titre)
  const hTitre = capTitre * a.taille + (a.lignes.length - 1) * a.taille * c.police.interligne
  const hTotal = fixe + hArg + hTitre
  let y = panneau.y + Math.max(pad, (panneau.h - hTotal) / 2)
  const x = panneau.x + pad

  const morceaux: string[] = [`<rect x="${panneau.x}" y="${panneau.y}" width="${panneau.w}" height="${panneau.h}" fill="${p.fond}"/>`]
  // Le filet qui coud la photo au panneau.
  const filet = Math.max(4, Math.round(cote * 0.008))
  morceaux.push(
    sens === 'gauche'
      ? `<rect x="${panneau.w - filet}" y="0" width="${filet}" height="${H}" fill="${p.accent}"/>`
      : sens === 'droite'
        ? `<rect x="${panneau.x}" y="0" width="${filet}" height="${H}" fill="${p.accent}"/>`
        : `<rect x="0" y="${panneau.y}" width="${W}" height="${filet}" fill="${p.accent}"/>`,
  )

  let logo: Rendu['logo']
  if (c.copy.logo) {
    logo = { left: x, top: Math.round(y), hauteur: hLogo }
    y += hLogo + ecart
  } else if (enseigne) {
    morceaux.push(texteSvg({ x, y: y + tEnseigne * 0.75, texte: enseigne, v: voixPetite, taille: tEnseigne, couleur: p.accent }))
    y += tEnseigne + ecart
  }

  const t = await blocTitre({ x, haut: y, a, v: c.titre, interligne: c.police.interligne, couleur: p.texte })
  morceaux.push(t.svg)
  y = t.bas + ecart * 0.8
  const largeurFilet = Math.round(cote * 0.07)
  morceaux.push(`<rect x="${x}" y="${Math.round(y - ecart * 0.4)}" width="${largeurFilet}" height="${Math.max(3, Math.round(cote * 0.005))}" fill="${p.accent}"/>`)
  y += ecart * 0.2

  if (arg) {
    const b = await blocTitre({ x, haut: y, a: arg, v: { famille: c.police.texte, poids: 500 }, interligne: 1.35, couleur: p.sourd })
    morceaux.push(b.svg)
    y = b.bas + ecart * 0.8
  }
  if (c.aPrix) {
    const pr = await prixEnLigne({ x, haut: y, prix: c.copy.price, avant: c.copy.priceBefore, taille: tPrix, police: c.police, couleur: p.texte, sourd: p.sourd })
    morceaux.push(pr.svg)
    y += pr.hauteur + ecart
  }
  const b = await appel({ x, haut: y, libelle: c.copy.ctaLabel, forme: 'lien', taille: tCta, palette: p, voix: { famille: c.police.texte, poids: 800, espacement: 0.08 } })
  morceaux.push(b.svg)
  if (c.copy.ctaUrl) {
    morceaux.push(texteSvg({ x, y: y + b.hauteur + tCta * 1.3, texte: c.copy.ctaUrl, v: { famille: c.police.texte, poids: 500 }, taille: tCta * 0.75, couleur: p.sourd }))
  }

  return {
    toile: { couleur: p.fond },
    photos: [{ input: await photoDans(c.base, photo.w, photo.h), left: photo.x, top: photo.y }],
    svg: morceaux.join(''),
    logo,
  }
}

/**
 * ÉPURE — la photo seule, plein cadre. Une étiquette de prix en haut à droite,
 * l'accroche et le lien en bas à gauche sur un voile léger. Rien sur le produit.
 */
async function epure(c: Contexte): Promise<Rendu> {
  const { W, H, cote, marge, p } = c
  const hLogo = Math.round(cote * 0.065)
  const morceaux: string[] = []

  const largeurTitre = (c.paysage ? W * 0.55 : W * 0.78) - marge
  const a = await ajuster(c.accroche, c.titre, {
    max: cote * (c.vertical ? 0.085 : 0.075),
    min: cote * 0.045,
    largeur: largeurTitre,
    lignes: 2,
    interligne: c.police.interligne,
  })
  const capTitre = await hauteurCapitale(c.titre)
  const hTitre = capTitre * a.taille + (a.lignes.length - 1) * a.taille * c.police.interligne
  const tCta = cote * (c.vertical ? 0.036 : 0.03)
  const hCta = tCta * 1.3
  const hautCta = H - marge - hCta
  const hautTitre = hautCta - cote * 0.045 - hTitre
  const voile = Math.round(hautTitre - cote * 0.16)
  morceaux.push(`<rect x="0" y="${voile}" width="${W}" height="${H - voile}" fill="url(#bas)"/>`)
  morceaux.push((await blocTitre({ x: marge, haut: hautTitre, a, v: c.titre, interligne: c.police.interligne, couleur: p.texte })).svg)
  const b = await appel({ x: marge, haut: hautCta, libelle: c.copy.ctaLabel, forme: 'lien', taille: tCta, palette: p, couleur: p.texte, voix: { famille: c.police.texte, poids: 800, espacement: 0.1 } })
  morceaux.push(b.svg)
  // L'argument et l'adresse se rangent à droite de l'appel, en petit.
  const complement = [c.copy.argument, c.copy.ctaUrl].filter(Boolean).join('  ·  ')
  if (complement) {
    const v: Voix = { famille: c.police.texte, poids: 500 }
    const dispo = W - marge * 2 - b.largeur - cote * 0.04
    const ac = await ajuster(complement, v, { max: tCta * 0.9, min: tCta * 0.6, largeur: dispo, lignes: 1 })
    morceaux.push(texteSvg({ x: W - marge, y: hautCta + (await hauteurCapitale(v)) * ac.taille, texte: ac.lignes[0] ?? '', v, taille: ac.taille, couleur: p.texte, ancre: 'end', opacite: 0.85 }))
  }

  // L'étiquette : le prix en haut à droite, inversé (le texte de la palette en fond).
  if (c.aPrix) {
    const t = cote * (c.vertical ? 0.075 : c.paysage ? 0.085 : 0.07)
    const pr = await prixEnLigne({ x: 0, haut: 0, prix: c.copy.price, avant: c.copy.priceBefore, taille: t, police: c.police, couleur: p.fond, sourd: p.fond })
    const padX = t * 0.45
    const padY = t * 0.38
    const w = pr.largeur + padX * 2
    const h = pr.hauteur + padY * 2
    const x = W - marge - w
    const y = marge
    const etiquette = await prixEnLigne({ x: x + padX, haut: y + padY, prix: c.copy.price, avant: c.copy.priceBefore, taille: t, police: c.police, couleur: p.fond, sourd: p.fond })
    morceaux.push(
      `<rect x="${Math.round(x)}" y="${Math.round(y + t * 0.08)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(t * 0.22)}" fill="#000" fill-opacity="0.22" filter="url(#flou)"/>`,
      `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(t * 0.22)}" fill="${p.texte}"/>`,
      `<rect x="${Math.round(x)}" y="${Math.round(y + h - Math.max(4, t * 0.1))}" width="${Math.round(w)}" height="${Math.round(Math.max(4, t * 0.1))}" fill="${p.accent}"/>`,
      etiquette.svg,
    )
  }

  return { toile: { photo: true }, photos: [], svg: morceaux.join(''), logo: { left: marge, top: marge, hauteur: hLogo } }
}

/**
 * CADRE — la photo encadrée d'une large marge de couleur, l'accroche dans la
 * marge du haut, le prix en macaron qui déborde du cadre, l'appel en pied.
 */
async function cadre(c: Contexte): Promise<Rendu> {
  const { W, H, cote, p } = c
  const m = Math.round(cote * 0.055)
  const morceaux: string[] = []

  const a = await ajuster(c.accroche, c.titre, {
    max: cote * (c.vertical ? 0.1 : c.paysage ? 0.085 : 0.085),
    min: cote * 0.045,
    largeur: W - m * 2,
    lignes: c.paysage ? 1 : 2,
    hauteur: H * (c.vertical ? 0.16 : 0.2),
    interligne: c.police.interligne,
  })
  const hautTitre = m * (c.paysage ? 0.8 : 1.1)
  const t = await blocTitre({ x: W / 2, haut: hautTitre, a, v: c.titre, interligne: c.police.interligne, couleur: p.texte, ancre: 'middle' })
  morceaux.push(t.svg)

  // Le pied : logo ou enseigne à gauche, l'appel à droite.
  const tCta = cote * 0.034
  const hCta = Math.round(tCta * 2.2)
  const hautPied = H - m * (c.paysage ? 0.7 : 0.9) - hCta
  const hautPhoto = Math.round(t.bas + m * 0.8)
  const basPhoto = Math.round(hautPied - m * 0.7)
  const photo = { x: m, y: hautPhoto, w: W - m * 2, h: Math.max(10, basPhoto - hautPhoto) }

  const b = await appel({ x: W - m, haut: hautPied, libelle: c.copy.ctaLabel, forme: 'pilule', taille: tCta, palette: p, voix: { famille: c.police.texte, poids: 800 }, ancre: 'end' })
  morceaux.push(b.svg)

  let logo: Rendu['logo']
  const hLogo = Math.round(hCta * 0.85)
  let xTexte = m
  if (c.copy.logo) {
    logo = { left: m, top: Math.round(hautPied + (hCta - hLogo) / 2), hauteur: hLogo }
    xTexte = m + hLogo * 1.25
  }
  const complement = [!c.copy.logo ? c.copy.shopName : null, c.copy.argument, c.copy.ctaUrl].filter(Boolean).join('  ·  ')
  if (complement) {
    const v: Voix = { famille: c.police.texte, poids: 600 }
    const dispo = W - m - b.largeur - cote * 0.03 - xTexte
    if (dispo > cote * 0.12) {
      const ac = await ajuster(complement, v, { max: tCta * 0.85, min: tCta * 0.55, largeur: dispo, lignes: 2 })
      const capV = await hauteurCapitale(v)
      const hBloc = capV * ac.taille + (ac.lignes.length - 1) * ac.taille * 1.3
      morceaux.push(
        (await blocTitre({ x: xTexte, haut: hautPied + (hCta - hBloc) / 2, a: ac, v, interligne: 1.3, couleur: p.sourd })).svg,
      )
    }
  }

  if (c.aPrix) {
    const r = Math.round(Math.min(cote * (c.vertical ? 0.14 : 0.12), photo.h * 0.32))
    morceaux.push(
      // Elle déborde du cadre, jamais sur l'appel du pied.
      await pastille({ cx: photo.x + photo.w - r * 0.7, cy: Math.min(photo.y + photo.h - r * 0.55, hautPied - r * 1.08), r, prix: c.copy.price, avant: c.copy.priceBefore, police: c.police, palette: p, angle: 7 }),
    )
  }

  return {
    toile: { couleur: p.fond },
    photos: [{ input: await photoDans(c.base, photo.w, photo.h, cote * 0.022), left: photo.x, top: photo.y }],
    svg: morceaux.join(''),
    logo,
  }
}

const DIRECTIONS = { affiche, editorial, epure, cadre } as const

/* ========================================================================== */
/*  L'assemblage                                                              */
/* ========================================================================== */

/**
 * Pose l'offre sur la scène, dans la direction artistique de la charte.
 *
 * Tout est proportionnel au plus petit côté : une story tient debout, une
 * bannière display est large et basse, et un texte en pixels fixes serait
 * illisible sur l'une ou démesuré sur l'autre.
 */
export async function composeAd(
  base: Buffer,
  width: number,
  height: number,
  copy: AdCopy,
  charte: CharteAd = CHARTE_DEFAUT,
): Promise<Buffer> {
  // Sans police, tout le texte sortirait en carrés : on refuse plutôt que de
  // livrer — et de facturer — un fichier inutilisable.
  if (!(await policeDisponible())) throw new SansPolice()

  const police = POLICES[charte.typographie] ?? POLICES.moderne
  const cote = Math.min(width, height)
  const titreBrut = copy.title.trim()
  const contexte: Contexte = {
    base,
    W: width,
    H: height,
    cote,
    marge: Math.round(cote * 0.06),
    paysage: width / height >= 1.4,
    vertical: height / width >= 1.4,
    copy,
    p: charte.palette,
    police,
    titre: { famille: police.titre, poids: police.poidsTitre, espacement: police.espacement },
    texte: { famille: police.texte, poids: 500 },
    accroche: police.capitales ? titreBrut.toLocaleUpperCase('fr-FR') : titreBrut,
    aPrix: Boolean(copy.price?.trim()),
  }

  const direction = DIRECTIONS[charte.miseEnPage] ?? affiche
  const rendu = await direction(contexte)

  const calque = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${DEFS(charte.palette)}${rendu.svg}</svg>`,
  )

  const toile =
    'photo' in rendu.toile
      ? sharp(await sharp(base).resize(width, height, { fit: 'cover', position: 'attention' }).toBuffer())
      : sharp({ create: { width, height, channels: 3, background: rendu.toile.couleur } })

  const couches: sharp.OverlayOptions[] = [...rendu.photos, { input: calque, top: 0, left: 0 }]

  // Faute de logo, l'enseigne s'écrit à sa place sur les directions plein cadre.
  if (!copy.logo && copy.shopName && rendu.logo && 'photo' in rendu.toile) {
    const v: Voix = { famille: police.texte, poids: 800, espacement: 0.14 }
    const t = rendu.logo.hauteur * 0.4
    const cap = await hauteurCapitale(v)
    couches.push({
      input: Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${texteSvg({ x: rendu.logo.left, y: rendu.logo.top + rendu.logo.hauteur / 2 + (cap * t) / 2, texte: copy.shopName.toLocaleUpperCase('fr-FR'), v, taille: t, couleur: charte.palette.texte })}</svg>`,
      ),
      top: 0,
      left: 0,
    })
  }

  if (copy.logo && rendu.logo) {
    // Un logo illisible n'emporte pas la publicité : elle sort sans lui.
    const logo = await chargerLogo(copy.logo, rendu.logo.hauteur)
    if (logo) {
      couches.push({
        input: logo.buffer,
        top: Math.round(rendu.logo.top),
        left: Math.round(rendu.logo.aDroite ? width - rendu.logo.left - logo.largeur : rendu.logo.left),
      })
    }
  }

  return toile.composite(couches).jpeg({ quality: 90 }).toBuffer()
}

/**
 * Vrai quand une publicité peut être composée lisiblement.
 *
 * L'image par défaut d'un hébergeur n'embarque aucune police : librsvg dessine
 * alors **un carré vide par caractère**, sans erreur. Trouver un `.ttf` ne
 * suffit pas, encore faut-il l'avoir déclaré à fontconfig (constaté le
 * 26/08/2026 : trois publicités facturées, trois publicités en carrés). Voir
 * `services/fonts.ts`.
 */
export async function policeDisponible(): Promise<boolean> {
  const { preparerPolices } = await import('./fonts.js')
  return (await preparerPolices()).pretes
}

/** Le message d'un serveur sans police, dit au vendeur et pas au journal. */
export class SansPolice extends Error {
  constructor() {
    super(
      "La composition de publicités est indisponible : aucune police n'est installée sur le serveur. Aucun crédit n'a été débité. Le diagnostic (Réglages › état des services) dit où elles sont cherchées.",
    )
    this.name = 'SansPolice'
  }
}
