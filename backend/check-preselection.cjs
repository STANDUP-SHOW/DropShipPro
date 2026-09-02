/**
 * Ce que le sélecteur de photos propose, et ce qu'il ne coche pas.
 *
 *   cd backend && node check-preselection.cjs
 *
 * **Décision du 02/09/2026 : plus aucune présélection.** Trois règles avaient
 * été essayées en trois jours — le format le plus représenté, puis le classement
 * d'amont — et toutes trois cochaient des images qui n'étaient pas le produit :
 * des tondeuses sur une fiche de souris Bluetooth. Chacune se défendait en
 * théorie ; aucune ne tenait sur une vraie page.
 *
 * Ce n'est pas seulement du décochage : c'est un import qui part avec les photos
 * d'un autre article quand le vendeur ne relit pas. Une aide qui se trompe coûte
 * plus qu'une absence d'aide.
 *
 * **Ce qui reste, et que ce banc protège :** l'ordre. Les candidats arrivent
 * classés — ce que la page déclare comme photos de sa fiche, puis les vraies
 * balises `<img>`, puis le CDN dominant — et un `sort` par surface le détruisait
 * en remontant la bannière de soldes en tête de grille. Proposer dans le bon
 * ordre reste une aide honnête.
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
verifier('toutes les images restent proposées', ordre.length === classes.length, `${ordre.length}`)

// --- Rien n'est coché ------------------------------------------------------
console.log('\nLa sélection')
verifier('aucune case cochée', coches.length === 0, `${coches.length} cochée(s)`)

// Et sur les pages qui piégeaient les anciennes règles, toujours rien.
for (const [nom, page] of [
  ['une galerie majoritaire', classes],
  ['une galerie minoritaire (le cas AliExpress)', [
    ...Array.from({ length: 6 }, (_, i) => ({ url: `fiche-${i}`, width: 480, height: 480 })),
    ...Array.from({ length: 20 }, (_, i) => ({ url: `voisine-${i}`, width: 800, height: 800 })),
  ]],
  ['une page sans grande photo', vignettes],
  ['aucun candidat', []],
]) {
  const r = preselectionner(page, { max: 15, coteMin: 400 })
  verifier(`rien de coché sur ${nom}`, r.coches.length === 0, `${r.coches.length}`)
  verifier(`tout reste proposé sur ${nom}`, r.ordre.length === page.length, `${r.ordre.length}`)
}

// --- Le cas dégénéré -------------------------------------------------------
console.log('\nUne entrée invalide')
verifier(
  'ne fait pas tomber le sélecteur',
  preselectionner(null, {}).ordre.length === 0 && preselectionner(undefined, {}).coches.length === 0,
)

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
