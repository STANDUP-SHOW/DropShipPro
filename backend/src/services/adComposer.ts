import sharp from 'sharp'
import { fetchSourceImage } from './watermark.js'
import { CHARTE_DEFAUT, POLICES, type CharteAd } from './adCharte.js'

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
 *
 * **Ce qui change le 19/09/2026 : la charte.** Les couleurs, la mise en page et
 * la typographie étaient écrites en dur — le même violet, le même voile noir,
 * la même police, sur toutes les publicités de tous les vendeurs. Elles
 * arrivent désormais dans une `CharteAd` tirée du logo de la boutique (voir
 * `adCharte.ts`), et quatre mises en page se partagent le même contenu.
 *
 * **La leçon de mise en page, apprise deux fois.** L'ancienne version empilait
 * du haut vers le bas, et le prix barré passait sous le bouton ; elle a été
 * corrigée en empilant du bas vers le haut, ce qui a réglé ce cas et rendu tous
 * les autres illisibles à écrire. On mesure maintenant le bloc d'offre AVANT de
 * le poser : chaque élément connaît sa hauteur, la boîte est de la taille de son
 * contenu, et plus rien ne peut se chevaucher — quel que soit le format, la
 * longueur du titre ou la mise en page.
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
 * Approximation volontaire : la largeur d'un caractère est une fraction de la
 * taille de police, propre à chaque typographie (une condensée tient plus de
 * lettres qu'une serif). Mesurer exactement demanderait de charger la police et
 * de sommer les avances — pour un gain invisible sur deux lignes de titre.
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

/** Un morceau du bloc d'offre : sa hauteur, puis son dessin une fois sa place connue. */
interface Bloc {
  h: number
  dessin: (haut: number) => string
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
  charte: CharteAd = CHARTE_DEFAUT,
): Promise<Buffer> {
  // Sans police, tout le texte sortirait en carrés : on refuse plutôt que de
  // livrer — et de facturer — un fichier inutilisable.
  if (!(await policeDisponible())) throw new SansPolice()

  const fondImage = await sharp(base)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .toBuffer()

  const p = charte.palette
  const police = POLICES[charte.typographie] ?? POLICES.moderne
  const paysage = width / height >= 1.4

  const cote = Math.min(width, height)
  const marge = Math.round(cote * 0.05)
  const interligne = Math.round(cote * 0.022)

  const tailleTitre = Math.round(cote * (paysage ? 0.062 : 0.058))
  const taillePrix = Math.round(cote * 0.1)
  const tailleCta = Math.round(cote * 0.046)
  const tailleArg = Math.round(cote * 0.038)

  /* ---------- La boîte : où le bloc d'offre a le droit de s'écrire -------- */

  const pad = Math.round(cote * (charte.miseEnPage === 'voile' ? 0 : 0.045))
  /*
   * En paysage, la carte et la bande ne prennent pas toute la largeur.
   *
   * Une bannière 1200×628 dont le texte court d'un bord à l'autre ne laisse
   * plus voir le produit — or c'est lui qu'on vend. Deux tiers pour l'offre,
   * un tiers dégagé : la photo respire et le titre reste sur deux lignes.
   */
  const largeurUtile =
    charte.miseEnPage === 'carte' && paysage
      ? Math.round(width * 0.62) - pad * 2
      : width - marge * 2 - pad * 2

  const capitales = police.capitales
  const titreEcrit = capitales ? copy.title.toLocaleUpperCase('fr-FR') : copy.title
  const largeurCar = tailleTitre * (police.largeurCar + Math.max(0, police.espacement))
  const lignes = wrap(titreEcrit, Math.max(8, Math.floor(largeurUtile / largeurCar)), 2)

  const familleTitre = xml(police.titre)
  const familleTexte = xml(police.texte)
  const espacement = Math.round(tailleTitre * police.espacement * 100) / 100

  /* ---------- Les blocs, mesurés avant d'être posés ----------------------- */

  const blocs: Bloc[] = []
  const hauteurLigne = Math.round(tailleTitre * 1.2)

  blocs.push({
    h: lignes.length * hauteurLigne,
    dessin: (haut) =>
      lignes
        .map(
          (l, i) =>
            `<text x="${'{X}'}" y="${haut + i * hauteurLigne + Math.round(tailleTitre * 0.82)}" font-family="${familleTitre}" font-size="${tailleTitre}" font-weight="${police.poidsTitre}" letter-spacing="${espacement}" fill="${p.texte}">${xml(l)}</text>`,
        )
        .join(''),
  })

  // Le filet d'accent : il n'appartient qu'aux mises en page à fond plein, où il
  // sépare le titre de l'offre. Sur un voile il ferait une barre en l'air.
  if (charte.miseEnPage === 'carte' || charte.miseEnPage === 'bande') {
    const largeurFilet = Math.round(Math.min(largeurUtile, tailleTitre * 2.6))
    const epaisseur = Math.max(3, Math.round(cote * 0.007))
    blocs.push({
      h: epaisseur + interligne,
      dessin: (haut) =>
        `<rect x="${'{X}'}" y="${haut + Math.round(interligne / 2)}" width="${largeurFilet}" height="${epaisseur}" rx="${Math.round(epaisseur / 2)}" fill="url(#accent)"/>`,
    })
  } else {
    blocs.push({ h: Math.round(interligne * 0.8), dessin: () => '' })
  }

  /*
   * Le prix est facultatif, et son absence doit se refermer.
   *
   * Un vendeur peut choisir de ne pas l'afficher — gamme à prix variables, test
   * de positionnement. Un bloc de hauteur nulle fait exactement ça : le titre
   * et l'argument se rejoignent, sans trou réservé à rien.
   */
  const aPrix = Boolean(copy.price?.trim())
  if (aPrix) {
    const largeurPrix = copy.price.length * taillePrix * 0.58
    blocs.push({
      h: Math.round(taillePrix * 1.06) + interligne,
      dessin: (haut) => {
        const ligne = haut + Math.round(taillePrix * 0.86)
        const prix = `<text x="${'{X}'}" y="${ligne}" font-family="${familleTexte}" font-size="${taillePrix}" font-weight="800" fill="${p.texte}">${xml(copy.price)}</text>`
        const barre = copy.priceBefore
          ? `<text x="${`{X+${Math.round(largeurPrix + taillePrix * 0.28)}}`}" y="${ligne}" font-family="${familleTexte}" font-size="${Math.round(taillePrix * 0.5)}" fill="${p.sourd}" text-decoration="line-through">${xml(copy.priceBefore)}</text>`
          : ''
        return prix + barre
      },
    })
  }

  if (copy.argument) {
    blocs.push({
      h: Math.round(tailleArg * 1.35) + Math.round(interligne * 0.6),
      dessin: (haut) =>
        `<text x="${'{X}'}" y="${haut + Math.round(tailleArg * 0.95)}" font-family="${familleTexte}" font-size="${tailleArg}" fill="${p.sourd}">${xml(copy.argument!)}</text>`,
    })
  }

  const largeurBouton = Math.round(copy.ctaLabel.length * tailleCta * 0.62 + tailleCta * 1.8)
  const hauteurBouton = Math.round(tailleCta * 2.1)
  blocs.push({
    h: hauteurBouton + Math.round(interligne * 0.4),
    dessin: (haut) => {
      const y = haut + Math.round(interligne * 0.4)
      const bouton = `<rect x="${'{X}'}" y="${y}" width="${largeurBouton}" height="${hauteurBouton}" rx="${Math.round(hauteurBouton / 2)}" fill="url(#accent)"/>
    <text x="${`{X+${Math.round(largeurBouton / 2)}}`}" y="${y + Math.round(hauteurBouton / 2 + tailleCta * 0.36)}" text-anchor="middle" font-family="${familleTexte}" font-size="${tailleCta}" font-weight="700" fill="${p.surAccent}">${xml(copy.ctaLabel)}</text>`
      // L'adresse se pose à droite du bouton, sur sa ligne : au-dessus elle
      // heurtait le titre, au-dessous elle sortait de l'image.
      const url = copy.ctaUrl
        ? `<text x="${`{X+${largeurBouton + Math.round(tailleCta * 0.6)}}`}" y="${y + Math.round(hauteurBouton / 2 + tailleArg * 0.36)}" font-family="${familleTexte}" font-size="${tailleArg}" fill="${p.sourd}">${xml(copy.ctaUrl)}</text>`
        : ''
      return bouton + url
    },
  })

  /* ---------- Chaque mise en page place cette boîte à sa façon ------------ */

  // Le titre part seul en haut dans la mise en page « coin » : le reste de
  // l'offre descend au bas de l'image, et la photo garde tout le milieu.
  const coin = charte.miseEnPage === 'coin'
  const blocTitre = coin ? blocs.slice(0, 2) : []
  const blocOffre = coin ? blocs.slice(2) : blocs
  const hauteurTitre = blocTitre.reduce((s, b) => s + b.h, 0)
  const hauteurOffre = blocOffre.reduce((s, b) => s + b.h, 0)

  const x = charte.miseEnPage === 'voile' || coin ? marge : marge + pad
  const basOffre = charte.miseEnPage === 'bande' ? height - Math.round(pad * 0.9) : height - marge
  const hautOffre = basOffre - hauteurOffre
  // La mise en page « coin » réserve le haut au titre, sous le logo.
  const hautTitre = marge + Math.round(cote * 0.13)

  const opaciteFond = p.mode === 'clair' ? 0.9 : 0.93

  let fondSvg = ''
  if (charte.miseEnPage === 'voile') {
    // Le voile commence au-dessus de la première ligne de titre, avec de quoi
    // fondre : il s'ajuste au contenu au lieu d'une fraction fixe de la hauteur,
    // qui laissait le texte déborder sur la photo en bannière.
    const haut = Math.max(0, hautOffre - Math.round(cote * 0.12))
    fondSvg = `<rect x="0" y="${haut}" width="${width}" height="${height - haut}" fill="url(#voile)"/>`
  } else if (charte.miseEnPage === 'carte') {
    const carteHaut = hautOffre - pad
    const carteLargeur = largeurUtile + pad * 2
    fondSvg = `<rect x="${marge}" y="${carteHaut}" width="${carteLargeur}" height="${height - marge - carteHaut}" rx="${Math.round(cote * 0.04)}" fill="${p.fond}" fill-opacity="${opaciteFond}" stroke="${p.accent}" stroke-opacity="0.45" stroke-width="${Math.max(1, Math.round(cote * 0.0035))}"/>`
  } else if (charte.miseEnPage === 'bande') {
    const bandeHaut = hautOffre - pad
    const epaisseur = Math.max(3, Math.round(cote * 0.008))
    fondSvg = `<rect x="0" y="${bandeHaut}" width="${width}" height="${height - bandeHaut}" fill="${p.fond}" fill-opacity="${Math.min(0.97, opaciteFond + 0.04)}"/>
    <rect x="0" y="${bandeHaut}" width="${width}" height="${epaisseur}" fill="url(#accent)"/>`
  } else {
    const hautVoile = Math.max(0, hautOffre - Math.round(cote * 0.12))
    fondSvg = `<rect x="0" y="0" width="${width}" height="${hautTitre + hauteurTitre + Math.round(cote * 0.08)}" fill="url(#coiffe)"/>
    <rect x="0" y="${hautVoile}" width="${width}" height="${height - hautVoile}" fill="url(#voile)"/>`
  }

  /* ---------- Le dessin, une fois les places connues ---------------------- */

  const poser = (liste: Bloc[], depart: number) => {
    let y = depart
    return liste
      .map((b) => {
        const dessin = b.dessin(y)
        y += b.h
        return dessin
      })
      .join('')
      // Les blocs écrivent leur abscisse en clair : ils ne savent pas encore où
      // la mise en page les posera quand ils se mesurent.
      .replace(/\{X\+(\d+)\}/g, (_, d: string) => String(x + Number(d)))
      .replace(/\{X\}/g, String(x))
  }

  const contenuSvg = (coin ? poser(blocTitre, hautTitre) : '') + poser(blocOffre, hautOffre)

  // Le nom de la boutique n'est écrit que faute de logo : les deux ensemble
  // font doublon et mangent la photo. Dans la mise en page « coin », le titre
  // occupe le coin haut gauche : l'enseigne passe à droite.
  const enseigneADroite = coin
  const nomSvg =
    !copy.logo && copy.shopName
      ? `<text x="${enseigneADroite ? width - marge : marge}" ${enseigneADroite ? 'text-anchor="end"' : ''} y="${marge + Math.round(tailleArg * 1.1)}" font-family="${familleTexte}" font-size="${Math.round(tailleArg * 1.1)}" font-weight="700" fill="#ffffff" opacity="0.95">${xml(copy.shopName)}</text>`
      : ''

  const calque = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="voile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.fond}" stop-opacity="0"/>
      <stop offset="35%" stop-color="${p.fond}" stop-opacity="${(opaciteFond * 0.78).toFixed(2)}"/>
      <stop offset="100%" stop-color="${p.fond}" stop-opacity="${opaciteFond}"/>
    </linearGradient>
    <linearGradient id="coiffe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.fond}" stop-opacity="${(opaciteFond * 0.92).toFixed(2)}"/>
      <stop offset="100%" stop-color="${p.fond}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${p.accent}"/>
      <stop offset="100%" stop-color="${p.accent2}"/>
    </linearGradient>
  </defs>
  ${fondSvg}
  ${nomSvg}
  ${contenuSvg}
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
        const taille = await sharp(logo).metadata()
        const gauche = enseigneADroite ? Math.max(marge, width - marge - (taille.width ?? hauteurLogo)) : marge
        couches.push({ input: logo, top: marge, left: gauche })
      } catch {
        // Un logo illisible ne doit pas emporter la publicité entière : elle
        // sort sans lui, ce qui vaut mieux que pas de publicité du tout.
      }
    }
  }

  return sharp(fondImage).composite(couches).jpeg({ quality: 90 }).toBuffer()
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
/**
 * Vrai quand une publicité peut être composée lisiblement.
 *
 * Ce contrôle cherchait un fichier `.ttf` et s'arrêtait là. Il répondait donc
 * « tout va bien » sur un serveur où les polices existaient sans que fontconfig
 * les connaisse — et les publicités sortaient quand même en carrés, cette fois
 * sans avertissement et avec les crédits débités. Trouver une police ne suffit
 * pas : encore faut-il l'avoir déclarée. Voir `services/fonts.ts`.
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
