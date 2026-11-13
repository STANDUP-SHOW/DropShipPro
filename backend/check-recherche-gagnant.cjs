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

console.log(`check-recherche-gagnant : ${n} vérifications passées`)
