/**
 * L'isolation de la galerie en import de lot, par le format.
 *
 *   cd backend && node check-galerie-lot.cjs
 *
 * **Pourquoi ce banc.** Le vendeur l'a signalé le 06/09/2026 : un lot de
 * chaussures Temu ressortait avec des photos de tondeuses et d'aspirateurs. En
 * import à l'unité il choisit à l'œil (donc c'est bon) ; en lot personne ne
 * relit. Sur Temu galerie, panier et recommandations sortent du même CDN :
 * l'adaptateur ne les sépare pas, et le filtre par lien rate les carrousels qui
 * ne sont pas de simples `<a href>`. Le seul signal robuste est le **format** :
 * une fiche sert ses photos produit à une seule taille, les recommandations à
 * d'autres. `galerieDominante` isole ce format.
 *
 * `check-recommandations.cjs` teste le filtre par LIEN (l'adaptateur). Celui-ci
 * teste le filet par FORMAT, indépendant de la structure de la page — celui qui
 * attrape les recommandations que le lien ne voyait pas.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

// Monte capture.js (et ses dépendances) dans une page avec un faux `chrome`,
// pour atteindre le helper exposé sur `self`.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  url: 'https://www.temu.com/fr/chaussures.html',
})
const w = dom.window
w.chrome = {
  runtime: { onMessage: { addListener() {} }, sendMessage() {}, getURL: (p) => p, id: 'test' },
  storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
}
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

for (const f of [
  'config.js',
  'content/fill-helpers.js',
  'content/image-scan.js',
  'content/adapters.js',
  'content/photo-preselect.js',
  'content/capture.js',
]) {
  try {
    const code = fs.readFileSync(path.join(__dirname, 'extension', f), 'utf8')
    const s = w.document.createElement('script')
    s.textContent = code
    w.document.head.appendChild(s)
  } catch (e) {
    console.error(`chargement de ${f} impossible :`, e.message)
  }
}

const galerie = w.__dspGalerieDominante
verifier('le helper est exposé par capture.js', typeof galerie === 'function')

if (typeof galerie === 'function') {
  console.log('\nUn lot Temu : galerie 800×800, recommandations et panier ailleurs')
  const img = (url, width, height) => ({ url, width, height })
  const jeu = [
    // La galerie du produit : six photos, toutes au même format.
    img('https://img.kwcdn.com/product/chaussure-1.jpg', 800, 800),
    img('https://img.kwcdn.com/product/chaussure-2.jpg', 800, 800),
    img('https://img.kwcdn.com/product/chaussure-3.jpg', 800, 800),
    img('https://img.kwcdn.com/product/chaussure-4.jpg', 800, 800),
    img('https://img.kwcdn.com/product/chaussure-5.jpg', 800, 800),
    img('https://img.kwcdn.com/product/chaussure-6.jpg', 800, 800),
    // Les recommandations : même CDN, mais un autre format. C'est le cas que le
    // filtre par lien ratait.
    img('https://img.kwcdn.com/product/tondeuse-1.jpg', 300, 300),
    img('https://img.kwcdn.com/product/tondeuse-2.jpg', 300, 300),
    img('https://img.kwcdn.com/product/aspirateur-1.jpg', 300, 300),
    img('https://img.kwcdn.com/product/aspirateur-2.jpg', 300, 300),
    // Le panier flottant : plus petit encore.
    img('https://img.kwcdn.com/product/collier-boussole.jpg', 120, 120),
  ]
  const retenues = galerie(jeu).map((i) => i.url)
  verifier(
    'seule la galerie 800×800 est gardée',
    retenues.length === 6 && retenues.every((u) => /chaussure-/.test(u)),
    `${retenues.length} gardée(s)`,
  )
  verifier(
    'aucune tondeuse, aucun aspirateur',
    !retenues.some((u) => /tondeuse|aspirateur/.test(u)),
    retenues.filter((u) => /tondeuse|aspirateur/.test(u)).length + ' intrus',
  )
  verifier('le panier flottant est écarté', !retenues.some((u) => /collier-boussole/.test(u)))

  console.log('\nLes garde-fous : ne pas vider une galerie légitime')
  // Trop peu de grandes pour trancher : on rend tout.
  const maigre = [img('a.jpg', 800, 800), img('b.jpg', 900, 900)]
  verifier('deux grandes seulement : rien n\'est retranché', galerie(maigre).length === 2)

  // Aucun format ne se dégage (toutes différentes) : on rend tout plutôt que
  // d'en garder une au hasard.
  const eparpille = [img('a.jpg', 800, 800), img('b.jpg', 900, 900), img('c.jpg', 1000, 1000), img('d.jpg', 1100, 1100)]
  verifier('aucun format dominant : rien n\'est retranché', galerie(eparpille).length === 4)

  // Une galerie AliExpress 1000×1000 avec une seule vignette parasite.
  const ali = [
    img('m1.jpg', 1000, 1000), img('m2.jpg', 1000, 1000), img('m3.jpg', 1000, 1000),
    img('m4.jpg', 1000, 1000), img('parasite.jpg', 640, 640),
  ]
  const gardeAli = galerie(ali).map((i) => i.url)
  verifier('AliExpress : les 1000×1000 restent, le parasite 640 sort', gardeAli.length === 4 && !gardeAli.includes('parasite.jpg'))
}

console.log('')
if (echecs) {
  console.log(`${echecs} attente(s) non tenue(s).`)
  process.exitCode = 1
} else {
  console.log('Isolation de galerie en lot : tout passe.')
}
