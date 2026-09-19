import sharp from 'sharp'
import {
  CHARTE_DEFAUT,
  MISES_EN_PAGE,
  PALETTE_DEFAUT,
  TYPOGRAPHIES,
  ambianceDe,
  chartePour,
  normaliserPalette,
  type MiseEnPage,
} from './src/services/adCharte.js'
import { composeAd, policeDisponible } from './src/services/adComposer.js'
import { charteProposee } from './src/services/adCopywriter.js'
import { contraste, couleursDuLogo, rgbVersHsl } from './src/services/logoCouleurs.js'

/**
 * Éprouve que la publicité prend VRAIMENT les couleurs du logo.
 *
 * **Le défaut, signalé par Max le 19/09/2026 :** toutes les publicités
 * sortaient du même violet, parce que le dégradé du bouton et le voile étaient
 * écrits en dur dans le composeur. Un vendeur qui signe d'un logo vert olive
 * recevait un bouton violet — ce n'est pas un défaut de goût, c'est une
 * publicité qui ne ressemble pas à sa marque, donc une publicité qu'il jette.
 *
 * **Ce que ce banc vérifie, et c'est tout son objet : il compte les pixels.**
 * Un banc qui se contenterait de lire la charte rendue par `chartePour` aurait
 * passé le jour même de la panne — la charte était juste, c'est le composeur
 * qui l'ignorait. La leçon est déjà écrite dans `CLAUDE.md` à propos de
 * `check-recommandations.cjs`, qui passait pendant que la réalité échouait :
 * **un banc doit éprouver la sortie, pas l'intention.** On compose donc deux
 * publicités à partir de deux logos de couleurs opposées, et on compte la part
 * de pixels de chaque teinte dans l'image finale.
 *
 * Éprouvé contre la version fautive : avec le composeur d'avant, les deux
 * images sortent identiques et le contrôle tombe.
 *
 * N'appelle aucun modèle, ne touche ni la base ni le réseau.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

/* ---------- Deux logos, deux mondes ---------------------------------------- */

/** Un faux logo : deux aplats, une teinte dominante et une seconde. */
async function faireLogo(principale: string, seconde: string): Promise<Buffer> {
  return sharp({
    create: { width: 240, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg">
             <rect x="0" y="0" width="240" height="170" fill="${principale}"/>
             <rect x="0" y="170" width="240" height="70" fill="${seconde}"/>
           </svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer()
}

const VERT = '#2f7d32'
const ROUGE = '#c0231f'

const couleursVertes = await couleursDuLogo(await faireLogo(VERT, '#8bc34a'))
const couleursRouges = await couleursDuLogo(await faireLogo(ROUGE, '#ff7043'))

exige(couleursVertes.length > 0, 'aucune couleur lue dans le logo vert')
exige(couleursRouges.length > 0, 'aucune couleur lue dans le logo rouge')
console.log(`logo vert  : ${couleursVertes.map((c) => c.hex).join(' ')}`)
console.log(`logo rouge : ${couleursRouges.map((c) => c.hex).join(' ')}`)

/* ---------- La charte : lisible, et pas celle d'à côté --------------------- */

const charteVerte = chartePour({ couleurs: couleursVertes })
const charteRouge = chartePour({ couleurs: couleursRouges })

for (const [nom, c] of [
  ['verte', charteVerte],
  ['rouge', charteRouge],
] as const) {
  const p = c.palette
  exige(
    contraste(p.fond, p.texte) >= 4.5,
    `charte ${nom} : titre sur fond à ${contraste(p.fond, p.texte).toFixed(2)} : 1, il faut 4,5`,
  )
  exige(
    contraste(p.fond, p.accent) >= 3,
    `charte ${nom} : accent sur fond à ${contraste(p.fond, p.accent).toFixed(2)} : 1, il faut 3`,
  )
  exige(
    contraste(p.accent, p.surAccent) >= 3,
    `charte ${nom} : le texte du bouton ne se lit pas sur le bouton`,
  )
  exige(p.accent !== PALETTE_DEFAUT.accent, `charte ${nom} : l'accent est resté le violet par défaut`)
  console.log(`charte ${nom} : fond ${p.fond} texte ${p.texte} accent ${p.accent} → ${p.accent2}`)
}

exige(
  charteVerte.palette.accent !== charteRouge.palette.accent,
  'deux logos opposés donnent le même accent : la charte ne lit pas le logo',
)

// Sans logo, on ne refuse pas : on sert la gamme de la maison.
const charteSansLogo = chartePour({ couleurs: [] })
exige(charteSansLogo.origine === 'defaut', 'sans couleur, la charte doit se dire « defaut »')
exige(
  charteSansLogo.palette.accent === PALETTE_DEFAUT.accent,
  'sans couleur, la charte doit retomber sur la palette de la maison',
)

/* ---------- La variété sans réseau ----------------------------------------- */

console.log('\nQuatre publicités de suite : quatre mises en page, quatre typographies.')
const mises = new Set<string>()
const typos = new Set<string>()
for (let i = 0; i < MISES_EN_PAGE.length; i++) {
  const c = chartePour({ couleurs: couleursVertes, index: i })
  mises.add(c.miseEnPage)
  typos.add(c.typographie)
  console.log(`  ${i + 1}. ${c.miseEnPage} / ${c.typographie}`)
}
exige(mises.size === MISES_EN_PAGE.length, `${mises.size} mises en page sur ${MISES_EN_PAGE.length}`)
exige(typos.size === TYPOGRAPHIES.length, `${typos.size} typographies sur ${TYPOGRAPHIES.length}`)

/* ---------- Ce que le modèle propose passe par un filtre -------------------- */

console.log('\nLa palette proposée par le modèle est reprise, puis rendue lisible :')

// Un titre presque blanc sur un fond crème : joli à dire, illisible à voir.
const illisible = normaliserPalette(
  { fond: '#fdfaf3', texte: '#f5f0e6', sourd: '#efe9dd', accent: '#fbf4e8', accent2: '#f7eedd' },
  charteVerte.palette,
)
exige(
  contraste(illisible.fond, illisible.texte) >= 4.5,
  `un titre illisible n'a pas été corrigé (${contraste(illisible.fond, illisible.texte).toFixed(2)} : 1)`,
)
exige(
  contraste(illisible.fond, illisible.accent) >= 3,
  "un accent illisible n'a pas été corrigé",
)
exige(illisible.mode === 'clair', 'un fond crème doit basculer la charte en mode clair')
console.log(`  crème : fond ${illisible.fond} → texte ${illisible.texte}, accent ${illisible.accent}`)

// Ce qui n'est pas une couleur est ignoré, sans faire échouer la publicité.
const nimporte = normaliserPalette(
  { fond: 'bleu nuit', texte: 42, accent: '#nope', accent2: null },
  charteVerte.palette,
)
exige(
  nimporte.fond === charteVerte.palette.fond && nimporte.accent === charteVerte.palette.accent,
  'une palette fantaisiste doit retomber sur la charte de départ, pas la casser',
)

// Une palette franche et valable est gardée telle quelle.
const gardee = normaliserPalette(
  { fond: '#101820', texte: '#ffffff', sourd: '#9aa5b1', accent: '#00b894', accent2: '#0984e3' },
  charteVerte.palette,
)
exige(gardee.accent === '#00b894', "une palette valable ne doit pas être réécrite")

// Une mise en page inventée ne fait jamais échouer : on garde la nôtre.
const propose = charteProposee(charteVerte, { miseEnPage: 'diagonale', typographie: 'gothique' })
exige(
  propose.miseEnPage === charteVerte.miseEnPage && propose.typographie === charteVerte.typographie,
  'une mise en page inconnue doit être ignorée, pas retenue',
)

/* ---------- L'ambiance : des mots, jamais un code couleur ------------------ */

const ambiance = ambianceDe(charteVerte)
exige(Boolean(ambiance), 'aucun mot d\'ambiance tiré du logo vert')
exige(!/#[0-9a-f]{3,6}/i.test(ambiance), `l'ambiance ne doit porter aucun hexadécimal : « ${ambiance} »`)
console.log(`\nambiance transmise au brief photo : « ${ambiance} »`)

/* ---------- Les pixels : la charte arrive-t-elle jusqu'à l'image ? --------- */

/** La part des pixels d'une teinte donnée, parmi les pixels saturés. */
async function partTeinte(image: Buffer, teinte: number): Promise<number> {
  const { data, info } = await sharp(image).resize(160, 160, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  let vus = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const [h, s, l] = rgbVersHsl(data[i], data[i + 1], data[i + 2])
    if (s < 0.3 || l < 0.12 || l > 0.92) continue
    // La distance circulaire entre deux teintes : 350° et 10° sont voisins.
    const ecart = Math.abs(((h - teinte + 540) % 360) - 180)
    if (ecart <= 30) vus++
  }
  return vus / (info.width * info.height)
}

const teinteDe = (hex: string) => rgbVersHsl(
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
)[0]

const police = await policeDisponible()
console.log(`\npolices detectees sur cette machine (${process.platform}) : ${police ? 'oui' : 'NON'}`)

if (!police) {
  console.log('Sans police, la composition est volontairement refusee : le reste du banc est saute.')
} else {
  const fond = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 120, g: 120, b: 120 } },
  })
    .jpeg()
    .toBuffer()

  const copy = {
    title: 'Rangez enfin votre atelier en dix minutes',
    price: '39,90 EUR',
    priceBefore: '59,90 EUR',
    shopName: 'Atelier No',
    ctaLabel: 'Commander',
    ctaUrl: 'boutique.test/outils',
    argument: 'Livraison offerte des 39 EUR',
  }

  console.log('\nLa couleur du logo se retrouve dans les pixels de la publicite :')
  const verte = await composeAd(fond, 1080, 1080, copy, { ...charteVerte, miseEnPage: 'bande' })
  const rouge = await composeAd(fond, 1080, 1080, copy, { ...charteRouge, miseEnPage: 'bande' })

  const vertDansVerte = await partTeinte(verte, teinteDe(charteVerte.palette.accent))
  const vertDansRouge = await partTeinte(rouge, teinteDe(charteVerte.palette.accent))
  const rougeDansRouge = await partTeinte(rouge, teinteDe(charteRouge.palette.accent))
  const rougeDansVerte = await partTeinte(verte, teinteDe(charteRouge.palette.accent))

  console.log(`  teinte du logo vert  : ${(vertDansVerte * 100).toFixed(2)} % dans la pub verte, ${(vertDansRouge * 100).toFixed(2)} % dans la rouge`)
  console.log(`  teinte du logo rouge : ${(rougeDansRouge * 100).toFixed(2)} % dans la pub rouge, ${(rougeDansVerte * 100).toFixed(2)} % dans la verte`)

  exige(vertDansVerte > 0.01, "la publicite du logo vert ne porte pas sa teinte : la charte n'atteint pas les pixels")
  exige(rougeDansRouge > 0.01, "la publicite du logo rouge ne porte pas sa teinte")
  exige(
    vertDansVerte > vertDansRouge * 3,
    'les deux publicites portent autant de vert : le composeur ignore la charte',
  )
  exige(
    rougeDansRouge > rougeDansVerte * 3,
    'les deux publicites portent autant de rouge : le composeur ignore la charte',
  )

  // Et la palette de la maison reste celle de la maison quand il n'y a pas de logo.
  const defaut = await composeAd(fond, 1080, 1080, copy, CHARTE_DEFAUT)
  const violetDansDefaut = await partTeinte(defaut, teinteDe(PALETTE_DEFAUT.accent))
  exige(violetDansDefaut > 0.005, 'la charte par defaut a perdu son violet')

  /* ---------- Quatre mises en page, trois formats, rien qui casse ---------- */

  console.log('\nChaque mise en page tient dans chaque format :')
  const formats: Array<[string, number, number]> = [
    ['carre', 1080, 1080],
    ['story', 1080, 1920],
    ['banniere', 1200, 628],
  ]
  const rendus = new Map<string, Buffer>()

  for (const mise of MISES_EN_PAGE) {
    for (const [nomFormat, largeur, hauteur] of formats) {
      const image = await composeAd(fond, largeur, hauteur, copy, { ...charteVerte, miseEnPage: mise as MiseEnPage })
      const meta = await sharp(image).metadata()
      exige(
        meta.width === largeur && meta.height === hauteur,
        `${mise}/${nomFormat} : ${meta.width}×${meta.height} au lieu de ${largeur}×${hauteur}`,
      )
      if (nomFormat === 'carre') rendus.set(mise, image)
    }
    console.log(`  ${mise} : les trois formats sont sortis`)
  }

  // Quatre mises en page qui rendraient la même image ne serviraient à rien.
  const { createHash } = await import('crypto')
  const empreintes = new Set([...rendus.values()].map((b) => createHash('sha1').update(b).digest('hex')))
  exige(
    empreintes.size === MISES_EN_PAGE.length,
    `${empreintes.size} images distinctes pour ${MISES_EN_PAGE.length} mises en page`,
  )

  /* ---------- Les cas qui débordaient ------------------------------------- */

  console.log('\nLes cas qui faisaient se chevaucher le texte :')
  const extremes = [
    { nom: 'titre tres long', copy: { ...copy, title: 'Un titre volontairement beaucoup trop long pour tenir sur deux lignes meme en petit' } },
    { nom: 'sans prix', copy: { ...copy, price: '', priceBefore: null } },
    { nom: 'sans argument ni adresse', copy: { ...copy, argument: null, ctaUrl: null } },
    { nom: 'bouton bavard', copy: { ...copy, ctaLabel: 'Profiter de loffre' } },
    { nom: 'titre a esperluette', copy: { ...copy, title: 'Outils & rangement <atelier>' } },
  ]
  for (const cas of extremes) {
    for (const mise of MISES_EN_PAGE) {
      const image = await composeAd(fond, 1080, 1920, cas.copy, { ...charteVerte, miseEnPage: mise as MiseEnPage })
      const meta = await sharp(image).metadata()
      exige(meta.width === 1080 && meta.height === 1920, `${cas.nom} en ${mise} : format perdu`)
    }
    console.log(`  ${cas.nom} : quatre mises en page passees`)
  }

  // La sortie d'un exemple, pour regarder de ses yeux quand on le demande.
  const cible = process.argv[2]
  if (cible) {
    const { writeFile } = await import('fs/promises')
    for (const mise of MISES_EN_PAGE) {
      await writeFile(`${cible}/pub-${mise}.jpg`, rendus.get(mise)!)
    }
    console.log(`\nQuatre exemples ecrits dans ${cible}`)
  }
}

console.log(echecs ? `\n${echecs} echec(s)` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
