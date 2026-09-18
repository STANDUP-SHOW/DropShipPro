/**
 * Banc : le prix qu'une fiche DÉCLARE passe devant celui qu'on devine.
 *
 * reichelt.com, 19/09/2026. Son prix s'écrit « 100,<sup>83</sup> € » : l'élément
 * a un enfant, donc le relevé visuel — qui ne regarde que des feuilles — le
 * sautait, et retenait la plus grande FEUILLE ressemblant à un prix : « 9,09 € »,
 * un accessoire proposé sous la fiche, ou le prix barré. Mesuré sur la vraie
 * page avant d'écrire le correctif. La fiche, elle, déclare le bon prix en
 * microdonnées schema.org : c'est lui qu'on lit.
 *
 * Le bloc de prix ci-dessous est le HTML réel de la fiche 125116, recopié.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function monter(corps, url = 'https://www.reichelt.com/fr/fr/shop/produit/network_isolator_med_mi_1005_external-125116') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${corps}</body></html>`, {
    runScripts: 'dangerously',
    url,
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
    const s = w.document.createElement('script')
    s.textContent = fs.readFileSync(path.join(__dirname, 'extension', f), 'utf8')
    w.document.head.appendChild(s)
  }
  return w
}

const PRIX_REICHELT = `
  <div itemscope itemtype="http://schema.org/Product">
    <h1 itemprop="name">Network isolator, MED MI 1005 - external</h1>
    <div itemprop="offers" itemscope="itemscope" itemtype="http://schema.org/Offer" class="productPriceArea">
      <p class="highprice">109,92&nbsp;€</p>
      <p class="productPrice productSpecialPrice">100,<sup class="productPriceUp">83</sup>&nbsp;€</p>
      <meta itemprop="price" content="100.83">
      <meta itemprop="priceCurrency" content="EUR">
    </div>
  </div>
  <ul class="accessoires"><li><span style="font-size:19px">9,09 €</span></li></ul>`

console.log('La fiche reichelt : prix coupé en deux balises, prix barré, accessoire dessous')
{
  const w = monter(PRIX_REICHELT)
  verifier('le relevé de prix est exposé par capture.js', typeof w.__dspReleverPrix === 'function')
  const r = w.__dspReleverPrix()
  verifier('le prix déclaré est retenu', r.prix === 100.83, `lu ${r.prix}`)
  verifier('ni le prix barré ni l’accessoire', r.prix !== 109.92 && r.prix !== 9.09)
  verifier('la devise déclarée suit', r.devise === 'EUR', `lu ${r.devise}`)
}

console.log('\nLes recommandations sont aussi des Product : seule la première fiche compte')
{
  const w = monter(`
    <div itemscope itemtype="https://schema.org/Product"><span itemprop="price" content="49.90">49,90</span><meta itemprop="priceCurrency" content="eur"></div>
    <div itemscope itemtype="https://schema.org/Product"><span itemprop="price" content="5.00">5,00</span></div>`)
  const r = w.__dspReleverPrix()
  verifier('la première fiche l’emporte', r.prix === 49.9, `lu ${r.prix}`)
  verifier('la devise est rendue en majuscules', r.devise === 'EUR', `lu ${r.devise}`)
}

console.log('\nUn prix écrit par une machine : la virgule y sépare les milliers')
{
  const w = monter(`<div itemscope itemtype="http://schema.org/Product"><meta itemprop="price" content="1,865.55"><meta itemprop="priceCurrency" content="EUR"></div>`)
  verifier('« 1,865.55 » vaut 1865,55', w.__dspReleverPrix().prix === 1865.55, `lu ${w.__dspReleverPrix().prix}`)
}

console.log('\nRien ne change pour qui ne déclare rien, ou déclare par balise meta')
{
  const w = monter(`<meta property="product:price:amount" content="12.50"><meta property="product:price:currency" content="USD">
    <div itemscope itemtype="http://schema.org/Product"><meta itemprop="price" content="99"></div>`)
  const r = w.__dspReleverPrix()
  verifier('la balise product:price passe toujours devant', r.prix === 12.5 && r.devise === 'USD', `lu ${r.prix} ${r.devise}`)

  const vide = monter(`<div itemscope itemtype="http://schema.org/Product"><meta itemprop="price" content=""></div><p>rien à vendre</p>`)
  verifier('une déclaration vide ne rend pas un faux prix', vide.__dspReleverPrix().prix === 0, `lu ${vide.__dspReleverPrix().prix}`)
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nPrix déclaré : tout passe.')
