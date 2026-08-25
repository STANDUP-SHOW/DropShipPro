import http from 'http'
import { scrapeProduct } from './src/services/scraper.js'
import { selectProductImages } from './src/services/imageSelect.js'

/**
 * Éprouve le tri des photos sur une page bâtie comme les vraies.
 *
 * Le piège reproduit ici est celui que décrit le vendeur : les photos du
 * produit sont dans de vraies balises <img>, en .jpg, en grande taille — et
 * pourtant l'import automatique en ramenait d'autres. La page contient donc,
 * toutes servies par le même CDN et sous le même chemin /product/ :
 *
 * — la galerie, déclarée en JSON-LD et og:image ;
 * — la bannière de l'en-tête, plus grande que tout le reste.
 *
 * Sans les signaux ajoutés, la bannière avait exactement le même score que la
 * galerie et gagnait sur la taille — puis, une fois écartée du classement, elle
 * revenait quand même pour combler le quota de cinq photos.
 *
 * Une limite du banc, dite plutôt que masquée : les produits conseillés cachés
 * dans le JSON embarqué ne sont pas repris ici, parce que le ratissage du
 * source n'accepte que les adresses en https et que ce serveur d'essai parle en
 * http. Le scénario couvre donc le mobilier de page, pas les recommandations.
 */
const CDN = 'http://127.0.0.1:8791/cdn'

const PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Montre automatique acier">
<meta property="og:image" content="${CDN}/product/montre-face.jpg">
<script type="application/ld+json">${JSON.stringify({
  '@type': 'Product',
  name: 'Montre automatique acier',
  description: 'Montre mecanique a remontage automatique.',
  image: [`${CDN}/product/montre-face.jpg`, `${CDN}/product/montre-profil.jpg`],
  offers: { price: '129.90', priceCurrency: 'EUR' },
})}</script>
</head><body>
<header><img src="${CDN}/product/banniere-soldes-ete.jpg" alt="Soldes"></header>
<main>
  <h1>Montre automatique acier</h1>
  <div class="gallery">
    <img src="${CDN}/product/montre-face.jpg" alt="">
    <img src="${CDN}/product/montre-profil.jpg" alt="">
    <img src="${CDN}/product/montre-dos.jpg" alt="">
  </div>
  <div class="price">129,90 €</div>
</main>
<script>window.__DATA__ = ${JSON.stringify({
  recommended: [
  ],
})}</script>
</body></html>`

/** Chaque image est servie à une taille réelle : c'est mesuré, pas déclaré. */
const TAILLES: Record<string, [number, number]> = {
  'montre-face': [1200, 1200],
  'montre-profil': [1000, 1000],
  'montre-dos': [1000, 1000],
  // Plus grande que la galerie : c'est ce qui la faisait gagner.
  'banniere-soldes-ete': [1600, 1600],
  'voisin-1': [1400, 1400],
  'voisin-2': [1400, 1400],
  'voisin-3': [1400, 1400],
  'voisin-4': [1400, 1400],
}

const sharp = (await import('sharp')).default

const serveur = http.createServer(async (req, res) => {
  const chemin = req.url ?? '/'
  if (chemin === '/fiche') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(PAGE)
  }
  const nom = chemin.split('/').pop()?.replace('.jpg', '') ?? ''
  const taille = TAILLES[nom]
  if (!taille) {
    res.writeHead(404)
    return res.end()
  }
  const jpeg = await sharp({
    create: { width: taille[0], height: taille[1], channels: 3, background: { r: 90, g: 90, b: 120 } },
  })
    .jpeg()
    .toBuffer()
  res.writeHead(200, { 'content-type': 'image/jpeg' })
  res.end(jpeg)
})

await new Promise<void>((r) => serveur.listen(8791, '127.0.0.1', r))

try {
  const scraped = await scrapeProduct('http://127.0.0.1:8791/fiche')

  console.log(`candidates : ${scraped.images.length}`)
  console.log(`declarees  : ${scraped.declaredImages.length}`)
  console.log(`dans le DOM: ${scraped.domImages.length}`)
  console.log(`mobilier   : ${scraped.chromeImages.length}`)
  for (const c of scraped.chromeImages) console.log(`   mobilier -> ${c}`)

  const choisies = await selectProductImages(
    scraped.images,
    5,
    scraped.declaredImages,
    scraped.domImages,
    scraped.chromeImages,
  )

  console.log('\nRetenues, dans l ordre :')
  for (const c of choisies) console.log(`  ${c.split('/').pop()}`)

  let echecs = 0
  const exige = (condition: boolean, message: string) => {
    if (!condition) {
      echecs++
      console.log(`ECHEC : ${message}`)
    }
  }

  const noms = choisies.map((c) => c.split('/').pop() ?? '')
  exige(noms[0] === 'montre-face.jpg', `la photo principale est ${noms[0]}, attendu montre-face.jpg`)
  exige(!noms.some((n) => n.startsWith('banniere')), 'la banniere de l en-tete a ete retenue')
  exige(!noms.some((n) => n.startsWith('voisin')), 'un produit conseille a ete retenu')
  exige(noms.length === 3, `${noms.length} photo(s) retenues, attendu les 3 de la galerie`)

  console.log(echecs === 0 ? '\nTri : tout passe.' : `\n${echecs} echec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  serveur.close()
}
