'use strict'
/**
 * Banc : un lien de RECHERCHE (gagnant de synthèse) mène à la fiche qui porte le nom.
 * backend/extension/content/recherche.js, partagé par l'extension et le desktop.
 *   node check-recherche-gagnant.cjs
 */
const assert = require('node:assert/strict')
// backend/ est en ESM (package.json type module) : le fichier pose alors globalThis.__dspRecherche.
const charge = require('./extension/content/recherche.js')
const R = charge.estRecherche ? charge : globalThis.__dspRecherche

let n = 0
const ok = (c, m) => { assert.ok(c, m); n++ }

// estRecherche
ok(R.estRecherche('https://fr.aliexpress.com/w/wholesale-ecouteurs-bluetooth.html'), 'AliExpress /w/wholesale-')
ok(R.estRecherche('https://www.aliexpress.com/wholesale?SearchText=lampe'), 'AliExpress SearchText')
ok(R.estRecherche('https://www.temu.com/search_result.html?search_key=lampe'), 'Temu search_result')
ok(R.estRecherche('https://fr.shein.com/pdsearch/robe/'), 'Shein pdsearch')
ok(!R.estRecherche('https://fr.aliexpress.com/item/1005006123456789.html'), 'fiche AliExpress')
ok(!R.estRecherche('https://www.temu.com/lampe-g-601099512345678.html'), 'fiche Temu')
ok(!R.estRecherche('pas une adresse'), 'adresse illisible')

// pertinent (même règle que synthesesCompletion.ts)
ok(R.pertinent('Écouteurs Bluetooth sans fil', 'Ecouteur bluetooth TWS sans fil réduction de bruit'), 'accents, pluriel')
ok(!R.pertinent('Écouteurs Bluetooth sans fil', 'Station météo intérieure'), 'hors sujet refusé')
ok(!R.pertinent('mini pro max', 'mini pro max'), 'que des mots vides : refusé')

// choisirResultat sur un faux document
function lien(href, texte) {
  return { getAttribute: (k) => (k === 'href' ? href : null), innerText: texte, querySelector: () => null, closest: () => null }
}
function doc(hote, liens) {
  return { location: { hostname: hote, href: `https://${hote}/w/wholesale-x.html` }, querySelectorAll: () => liens }
}
const d = doc('fr.aliexpress.com', [
  lien('/category/123.html', 'Écouteurs Bluetooth catégorie'),
  lien('//fr.aliexpress.com/item/1005000000000001.html?spm=1', 'Station météo intérieure avec écran'),
  lien('//fr.aliexpress.com/item/1005000000000002.html#avis', 'Écouteurs Bluetooth sans fil TWS 5.3'),
  lien('//fr.aliexpress.com/item/1005000000000003.html', 'Écouteurs Bluetooth sans fil pro'),
])
const c = R.choisirResultat('Écouteurs Bluetooth sans fil', d)
assert.equal(c.url, 'https://fr.aliexpress.com/item/1005000000000002.html', 'premier résultat pertinent, sans paramètres')
n++
const vide = R.choisirResultat('Robot aspirateur laveur', d)
assert.equal(vide.url, null, 'aucun pertinent : rien de choisi')
assert.equal(vide.vus, 3, 'trois fiches vues')
n += 2

// versRecherche (13/11/2026) : catégorie ou adresse sans fiche → recherche du nom chez le même fournisseur
assert.equal(
  R.versRecherche('https://inbusiness.aliexpress.com/category/fr/d%C3%A9coration-int%C3%A9rieure.html', 'Lampe LED de chevet'),
  'https://fr.aliexpress.com/w/wholesale-lampe-led-chevet.html',
  'catégorie AliExpress → recherche',
)
assert.equal(
  R.versRecherche('https://www.temu.com/fr/produit/etagere-metallique-avec-tiroirs', 'Étagère métallique avec tiroirs'),
  'https://www.temu.com/search_result.html?search_key=%C3%89tag%C3%A8re%20m%C3%A9tallique%20avec%20tiroirs',
  'adresse Temu sans fiche → recherche',
)
ok(R.estRecherche(R.versRecherche('https://www.temu.com/fr/produit/x', 'Lampe de bureau')), 'la recherche Temu produite est reconnue')
ok(R.estRecherche(R.versRecherche('https://fr.shein.com/Women-Dresses-c-1727.html', 'Robe longue fleurie')), 'la recherche Shein produite est reconnue')
ok(R.versRecherche('https://fr.aliexpress.com/item/1005006123456789.html', 'Lampe') === null, 'fiche AliExpress gardée')
ok(R.versRecherche('https://www.temu.com/lampe-g-601099512345678.html', 'Lampe') === null, 'fiche Temu gardée')
ok(R.versRecherche('https://www.temu.com/goods.html?goods_id=601099512345678', 'Lampe') === null, 'fiche Temu goods.html gardée')
ok(R.versRecherche('https://fr.aliexpress.com/w/wholesale-lampe.html', 'Lampe de chevet') === null, 'recherche gardée')
ok(R.versRecherche('https://www.bigbuy.eu/fr/lampe.html', 'Lampe de chevet') === null, 'autre site : inchangé')
ok(R.versRecherche('https://inbusiness.aliexpress.com/category/x.html', '') === null, 'sans nom : inchangé')

// Même règle côté serveur (services/fileImport.ts) : les deux doivent rester d'accord.
const { execFileSync } = require('node:child_process')
const urls = [
  ['https://inbusiness.aliexpress.com/category/fr/x.html', 'Lampe LED de chevet'],
  ['https://www.temu.com/fr/produit/etagere-metallique-avec-tiroirs', 'Étagère métallique avec tiroirs'],
  ['https://fr.shein.com/Women-Dresses-c-1727.html', 'Robe longue fleurie'],
  ['https://fr.aliexpress.com/item/1005006123456789.html', 'Lampe'],
  ['https://www.temu.com/goods.html?goods_id=601099512345678', 'Lampe'],
  ['https://www.bigbuy.eu/fr/lampe.html', 'Lampe'],
]
const serveur = JSON.parse(
  execFileSync('npx', ['tsx', '-e', `import('./src/services/fileImport.ts').then(m=>console.log(JSON.stringify(${JSON.stringify(urls)}.map(([u,t])=>m.versRecherche(u,t)))))`], {
    cwd: __dirname,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_BANC || 'postgresql://banc:banc@127.0.0.1:1/banc' },
  }).trim().split('\n').pop(),
)
assert.deepEqual(serveur, urls.map(([u, t]) => R.versRecherche(u, t)), 'serveur et navigateurs donnent la même adresse')
n++

console.log(`check-recherche-gagnant : ${n} vérifications passées`)
