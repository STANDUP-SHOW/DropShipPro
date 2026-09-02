/**
 * Ce que le sélecteur de photos coche, sur une fiche qui ressemble aux vraies.
 *
 *   cd backend && node check-preselection.cjs
 *
 * **Le défaut que ce banc empêche de revenir.** « On tape tout le temps à côté
 * des images réelles du produit », signalé trois jours de suite. Deux causes,
 * toutes deux dans le sélecteur : un `sort` par surface qui effaçait le
 * classement d'amont, et une présélection fondée sur le format le plus
 * représenté — donc sur les produits recommandés, toujours plus nombreux que
 * les photos de la fiche.
 *
 * La règle vit maintenant dans `content/photo-preselect.js`, seule, et ce banc
 * la confronte à une page bâtie comme celles qui posaient problème : six photos
 * de galerie, vingt recommandations au même format, trois bannières plus
 * grandes que tout le reste, et des vignettes de navigation servies par le même
 * CDN.
 *
 * **Le banc charge le fichier livré**, jamais une copie de la règle : une copie
 * éprouverait ce qu'on aurait aimé écrire, pas ce qui tourne dans le navigateur.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

const SOURCE = path.join(__dirname, 'extension', 'content', 'photo-preselect.js')

const dom = new JSDOM('', { runScripts: 'dangerously', url: 'https://exemple.test/' })
const script = dom.window.document.createElement('script')
script.textContent = fs.readFileSync(SOURCE, 'utf8')
dom.window.document.head.appendChild(script)
const preselectionner = dom.window.__dspPreselectionnerPhotos

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

// ---------------------------------------------------------------------------
// La page d'essai, dans l'ordre où l'étape de mesure la rend.
//
// Cet ordre n'est pas décoratif : il porte le travail de classement — d'abord
// ce que la page déclare comme photos de sa fiche, puis les vraies balises
// <img>, puis le CDN dominant. C'est précisément ce qu'un tri par surface
// détruisait.
// ---------------------------------------------------------------------------

const galerie = Array.from({ length: 6 }, (_, i) => ({
  url: `https://ae01.alicdn.com/kf/galerie-${i + 1}.jpg`,
  width: 800,
  height: 800,
}))

/** Vingt voisines, au même format, et donc majoritaires. */
const recommandations = Array.from({ length: 20 }, (_, i) => ({
  url: `https://ae01.alicdn.com/kf/reco-${i + 1}.jpg`,
  width: 800,
  height: 800,
}))

/** Plus grandes que tout le reste : c'est ce qui les faisait passer devant. */
const bannieres = [
  { url: 'https://ae01.alicdn.com/kf/banniere-soldes.jpg', width: 1600, height: 900 },
  { url: 'https://ae01.alicdn.com/kf/banniere-livraison.jpg', width: 1920, height: 640 },
]

/** Servies par le même CDN, donc bien classées, mais trop petites. */
const vignettes = Array.from({ length: 8 }, (_, i) => ({
  url: `https://ae01.alicdn.com/kf/vignette-${i + 1}.jpg`,
  width: 120,
  height: 120,
}))

// L'ordre rendu par la mesure : galerie d'abord (déclarée par la page), puis
// les vignettes de sa propre galerie, puis le voisinage, puis le mobilier.
const classes = [...galerie, ...vignettes, ...recommandations, ...bannieres]

const { ordre, coches } = preselectionner(classes, { max: 15, coteMin: 400 })

// --- L'ordre reçu survit ---------------------------------------------------
console.log("\nL'ordre du classement")
verifier(
  "l'ordre affiché est celui reçu, sans retouche",
  ordre.map((i) => i.url).join('|') === classes.map((i) => i.url).join('|'),
)
verifier(
  'la bannière la plus grande reste en dernier',
  ordre[ordre.length - 1].url.includes('banniere'),
  ordre[ordre.length - 1].url.split('/').pop(),
)

// --- Ce qui est coché ------------------------------------------------------
console.log('\nLes cases cochées')
const cochees = new Set(coches)
verifier(
  'les six photos de la galerie sont cochées',
  galerie.every((g) => cochees.has(g.url)),
  `${galerie.filter((g) => cochees.has(g.url)).length} sur 6`,
)
verifier(
  'aucune bannière n’est cochée',
  bannieres.every((b) => !cochees.has(b.url)),
)
verifier(
  'aucune vignette de navigation n’est cochée',
  vignettes.every((v) => !cochees.has(v.url)),
)
verifier('le plafond de quinze est tenu', coches.length <= 15, `${coches.length} cochée(s)`)

/*
 * Les recommandations complètent, elles ne remplacent pas.
 *
 * Six photos ne remplissent pas quinze cases, et le reste du classement est
 * cohérent : mieux vaut proposer les voisines en fin de sélection — le vendeur
 * décoche — que de laisser neuf cases vides. Ce qui comptait était l'ordre :
 * la galerie d'abord, toujours.
 */
verifier(
  'la galerie occupe les six premières cases',
  coches.slice(0, 6).join('|') === galerie.map((g) => g.url).join('|'),
)

// ---------------------------------------------------------------------------
// Le cas qui cassait vraiment : la galerie n'a pas le format majoritaire.
//
// C'est la situation d'AliExpress, et c'est elle qu'il fallait éprouver. La
// fiche sert ses photos en 480×480 ; les vingt produits recommandés autour sont
// en 800×800. « Le format le plus représenté parmi les grandes images » désigne
// alors les recommandations, et **pas une seule photo du produit** n'était
// cochée — le vendeur cochait à la main, à chaque import, en se demandant à
// quoi servait la présélection.
//
// Vérifié : sur cette page, l'ancienne règle cochait 0 photo de galerie et
// 10 recommandations.
// ---------------------------------------------------------------------------
console.log('\nLa galerie est minoritaire (le cas AliExpress)')
{
  const galerie480 = Array.from({ length: 6 }, (_, i) => ({
    url: `https://ae01.alicdn.com/kf/fiche-${i + 1}.jpg`,
    width: 480,
    height: 480,
  }))
  const voisines800 = Array.from({ length: 20 }, (_, i) => ({
    url: `https://ae01.alicdn.com/kf/voisine-${i + 1}.jpg`,
    width: 800,
    height: 800,
  }))

  const r = preselectionner([...galerie480, ...voisines800], { max: 15, coteMin: 400 })
  const prises = new Set(r.coches)
  verifier(
    'les six photos de la fiche sont cochées malgré leur format minoritaire',
    galerie480.every((g) => prises.has(g.url)),
    `${galerie480.filter((g) => prises.has(g.url)).length} sur 6`,
  )
  verifier(
    'et elles passent avant les voisines',
    r.coches.slice(0, 6).every((u) => u.includes('fiche-')),
  )
}

// --- Le cas d'une page pauvre ----------------------------------------------
console.log('\nUne page sans grande photo')
const petit = preselectionner(vignettes, { max: 15, coteMin: 400 })
verifier(
  'rien n’est coché plutôt que n’importe quoi',
  petit.coches.length === 0,
  `${petit.coches.length} cochée(s)`,
)
verifier('mais tout reste proposé', petit.ordre.length === vignettes.length)

// --- Et le cas dégénéré ----------------------------------------------------
console.log('\nAucun candidat')
const vide = preselectionner([], { max: 15, coteMin: 400 })
verifier('ni erreur ni sélection', vide.coches.length === 0 && vide.ordre.length === 0)
verifier(
  'une entrée invalide ne fait pas tomber le sélecteur',
  preselectionner(null, {}).ordre.length === 0,
)

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
