import sharp from 'sharp'
import { fetchSourceImage } from './watermark.js'

/**
 * La publicité, composée ici et non demandée au modèle.
 *
 * Un visuel publicitaire n'est pas une belle photo : c'est une photo QUI PORTE
 * une offre — le logo de la boutique, le nom du produit, le prix, et un bouton
 * qui dit où aller. Demander tout cela au modèle d'images donnait une photo
 * recomposée sans rien dessus, parce qu'un modèle d'images écrit mal : lettres
 * inventées, prix faux, logo approximatif. Un prix faux sur une publicité n'est
 * pas un défaut d'esthétique, c'est une promesse qu'on ne tiendra pas.
 *
 * La scène vient donc du modèle, et tout ce qui porte du sens est dessiné ici,
 * au pixel près, à partir des vraies données de l'annonce.
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

/**
 * Coupe un titre en lignes qui tiennent dans la largeur.
 *
 * Approximation volontaire : la largeur d'un caractère vaut environ 0,52 fois
 * la taille de police sur une graisse demi-grasse. Mesurer exactement
 * demanderait de charger la police et de sommer les avances — pour un gain
 * invisible sur deux lignes de titre.
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const mots = text.split(/\s+/).filter(Boolean)
  const lignes: string[] = []
  let courante = ''

  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot
    if (essai.length <= maxChars) {
      courante = essai
      continue
    }
    if (courante) lignes.push(courante)
    courante = mot
    if (lignes.length === maxLines) break
  }
  if (courante && lignes.length < maxLines) lignes.push(courante)

  // Le dernier mot coupé se signale, plutôt que de disparaître sans bruit.
  if (lignes.length === maxLines) {
    const reste = mots.join(' ').length
    const montre = lignes.join(' ').length
    if (reste > montre) lignes[maxLines - 1] = `${lignes[maxLines - 1].replace(/[\s.]+$/, '')}…`
  }

  return lignes
}

export interface AdCopy {
  title: string
  /** Déjà formaté, devise comprise : « 24,90 € ». */
  price: string
  /** Barré à côté du prix, quand le vendeur affiche une remise. */
  priceBefore?: string | null
  shopName?: string | null
  /** Chemin ou URL du logo de la boutique. */
  logo?: string | null
  ctaLabel: string
  /** Affiché sous le bouton, tel quel. Aucune adresse n'est inventée. */
  ctaUrl?: string | null
  /** Une ligne courte : livraison offerte, garantie deux ans… */
  argument?: string | null
}

/**
 * Pose l'offre sur la scène.
 *
 * Le bandeau est proportionnel au format : une story tient debout, une bannière
 * display est large et basse, et un texte calculé en pixels fixes serait illisible
 * sur l'une ou démesuré sur l'autre.
 */
export async function composeAd(
  base: Buffer,
  width: number,
  height: number,
  copy: AdCopy,
): Promise<Buffer> {
  // Sans police, tout le texte sortirait en carrés : on refuse plutôt que de
  // livrer — et de facturer — un fichier inutilisable.
  if (!(await policeDisponible())) throw new SansPolice()

  const fond = await sharp(base)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .toBuffer()

  const cote = Math.min(width, height)
  const marge = Math.round(cote * 0.05)

  const tailleTitre = Math.round(cote * 0.058)
  const taillePrix = Math.round(cote * 0.1)
  const tailleCta = Math.round(cote * 0.046)
  const tailleArg = Math.round(cote * 0.038)

  const largeurTexte = width - marge * 2
  const lignes = wrap(copy.title, Math.floor(largeurTexte / (tailleTitre * 0.52)), 2)

  /*
   * La mise en page se calcule du bas vers le haut.
   *
   * Posée du haut vers le bas, chaque élément dépendait de la hauteur du
   * précédent : le prix barré passait sous le bouton, et l'adresse mordait la
   * deuxième ligne du titre. En partant du bas, le bouton est ancré à sa marge
   * et tout le reste s'empile au-dessus — plus rien ne peut se chevaucher, quel
   * que soit le format ou la longueur du titre.
   */
  const interligne = Math.round(cote * 0.022)

  const largeurBouton = Math.round(copy.ctaLabel.length * tailleCta * 0.62 + tailleCta * 1.8)
  const hauteurBouton = Math.round(tailleCta * 2.1)
  const boutonX = marge
  const boutonY = height - marge - hauteurBouton

  const ctaSvg = `
    <rect x="${boutonX}" y="${boutonY}" width="${largeurBouton}" height="${hauteurBouton}" rx="${Math.round(hauteurBouton / 2)}" fill="url(#bouton)"/>
    <text x="${boutonX + largeurBouton / 2}" y="${boutonY + hauteurBouton / 2 + tailleCta * 0.36}" text-anchor="middle" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${tailleCta}" font-weight="700" fill="#ffffff">${xml(copy.ctaLabel)}</text>`

  // L'adresse se pose à droite du bouton, sur sa ligne : au-dessus elle heurtait
  // le titre, au-dessous elle sortait de l'image.
  const urlSvg = copy.ctaUrl
    ? `<text x="${boutonX + largeurBouton + Math.round(tailleCta * 0.6)}" y="${boutonY + hauteurBouton / 2 + tailleArg * 0.36}" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${tailleArg}" fill="#cbd5e1">${xml(copy.ctaUrl)}</text>`
    : ''

  const argBase = boutonY - interligne
  const argSvg = copy.argument
    ? `<text x="${marge}" y="${argBase}" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${tailleArg}" fill="#d1d5db">${xml(copy.argument)}</text>`
    : ''

  /*
   * Le prix est facultatif, et son absence doit se refermer.
   *
   * Un vendeur peut choisir de ne pas l'afficher — gamme à prix variables, test
   * de positionnement. Dessiner un texte vide laisserait la place réservée : un
   * trou entre le titre et l'argument, qui se voit d'autant plus que le reste
   * est aligné. La ligne est donc retirée, et le titre redescend.
   */
  const aPrix = Boolean(copy.price?.trim())
  const prixBase = argBase - (copy.argument ? tailleArg + interligne : 0)
  const prixSvg = aPrix
    ? `<text x="${marge}" y="${prixBase}" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${taillePrix}" font-weight="800" fill="#ffffff">${xml(copy.price)}</text>`
    : ''

  const largeurPrix = aPrix ? copy.price.length * taillePrix * 0.58 : 0
  const barreSvg =
    aPrix && copy.priceBefore
      ? `<text x="${Math.round(marge + largeurPrix + taillePrix * 0.28)}" y="${prixBase}" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${Math.round(taillePrix * 0.5)}" fill="#cbd5e1" text-decoration="line-through">${xml(copy.priceBefore)}</text>`
      : ''

  const titreBas = aPrix ? prixBase - Math.round(taillePrix * 0.82) - interligne : prixBase
  const hauteurLigne = Math.round(tailleTitre * 1.18)
  const titreHaut = titreBas - (lignes.length - 1) * hauteurLigne

  const titreSvg = lignes
    .map((l, i) => {
      const ligneY = titreHaut + i * hauteurLigne
      return `<text x="${marge}" y="${ligneY}" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${tailleTitre}" font-weight="700" fill="#ffffff">${xml(l)}</text>`
    })
    .join('')

  // Le voile commence au-dessus de la première ligne de titre, avec de quoi
  // fondre : il s'ajuste au contenu au lieu d'une fraction fixe de la hauteur,
  // qui laissait le texte déborder sur la photo en bannière.
  const hautBandeau = Math.max(0, titreHaut - tailleTitre - Math.round(cote * 0.09))
  const hauteurBandeau = height - hautBandeau

  // Le nom de la boutique n'est écrit que faute de logo : les deux ensemble
  // font doublon et mangent la photo.
  const nomSvg =
    !copy.logo && copy.shopName
      ? `<text x="${marge}" y="${marge + Math.round(tailleArg * 1.1)}" font-family="DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif" font-size="${Math.round(tailleArg * 1.1)}" font-weight="700" fill="#ffffff" opacity="0.95">${xml(copy.shopName)}</text>`
      : ''

  const calque = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="voile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0a14" stop-opacity="0"/>
      <stop offset="35%" stop-color="#0b0a14" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#0b0a14" stop-opacity="0.93"/>
    </linearGradient>
    <linearGradient id="bouton" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${hautBandeau}" width="${width}" height="${hauteurBandeau}" fill="url(#voile)"/>
  ${nomSvg}
  ${titreSvg}
  ${prixSvg}
  ${barreSvg}
  ${argSvg}
  ${urlSvg}
  ${ctaSvg}
</svg>`)

  const couches: sharp.OverlayOptions[] = [{ input: calque, top: 0, left: 0 }]

  if (copy.logo) {
    const brut = await fetchSourceImage(copy.logo)
    if (brut) {
      try {
        const hauteurLogo = Math.round(cote * 0.09)
        const logo = await sharp(brut, { density: 300 })
          .resize({ height: hauteurLogo, fit: 'inside', withoutEnlargement: false })
          .png()
          .toBuffer()
        couches.push({ input: logo, top: marge, left: marge })
      } catch {
        // Un logo illisible ne doit pas emporter la publicité entière : elle
        // sort sans lui, ce qui vaut mieux que pas de publicité du tout.
      }
    }
  }

  return sharp(fond).composite(couches).jpeg({ quality: 90 }).toBuffer()
}

/**
 * Y a-t-il seulement une police sur cette machine ?
 *
 * Question qui paraît absurde et qui ne l'est pas : l'image par défaut d'un
 * hébergeur n'embarque aucune police. `sharp` compose ses textes par librsvg,
 * qui en demande une à fontconfig, n'en trouve aucune, et dessine **un carré
 * vide par caractère**. Le visuel sort parfaitement composé — cadre, dégradé,
 * bouton à sa place — et totalement illisible.
 *
 * Le pire est qu'on ne le voit pas en développement : Windows et macOS ont des
 * polices. Le défaut n'apparaît qu'en production, sur des images déjà payées.
 * Constaté le 26/08/2026 : trois publicités facturées, trois publicités en
 * carrés.
 *
 * D'où ce contrôle, fait une fois et gardé : mieux vaut refuser de produire que
 * facturer un fichier inutilisable.
 */
let policesVues: boolean | null = null

export async function policeDisponible(): Promise<boolean> {
  if (policesVues !== null) return policesVues

  // Hors Linux, le système en fournit toujours.
  if (process.platform !== 'linux') {
    policesVues = true
    return true
  }

  const { readdir } = await import('fs/promises')
  const dossiers = [
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    '/nix/var/nix/profiles/default/share/fonts',
    `${process.env.HOME ?? ''}/.fonts`,
  ]

  for (const dossier of dossiers) {
    try {
      // Récursif : les distributions rangent par famille, jamais à plat.
      const entrees = await readdir(dossier, { recursive: true } as never)
      if ((entrees as string[]).some((f) => /\.(ttf|otf|ttc|pfb)$/i.test(f))) {
        policesVues = true
        return true
      }
    } catch {
      // Dossier absent : on essaie le suivant.
    }
  }

  policesVues = false
  return false
}

/** Le message d'un serveur sans police, dit au vendeur et pas au journal. */
export class SansPolice extends Error {
  constructor() {
    super(
      "La composition de publicités est momentanément indisponible sur le serveur (aucune police installée). Aucun crédit n'a été débité.",
    )
    this.name = 'SansPolice'
  }
}
