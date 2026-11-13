/**
 * Banc : les liens produit de l'agent d'analyses ne s'ouvrent que vérifiés (13/11/2026).
 *
 * Constaté ce jour-là depuis MAX-PC : sur les 24 gagnants de la synthèse, 14 liens AliExpress
 * et 20 liens Amazon menaient à un autre produit. Tant que l'agent n'écrit pas le titre de la
 * page qu'il a ouverte (`url_page_title`), le site ouvre la recherche du nom sur le même site.
 *
 *   npx tsx check-liens-verifies.ts
 */
import { lienAOuvrir, titrePorteLeNom } from './src/services/lienVerifie.js'
import { lireSyntheseJson, LECTEUR_SYNTHESE } from './src/services/synthesesQuotidiennes.js'

let echecs = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) echecs++
}

const rechaud = 'Réchaud de camping à gaz ultra-compact pliable coupe-vent piézo'
const r1 = lienAOuvrir('https://fr.aliexpress.com/item/1005012830855581.html', rechaud)
ok(r1.startsWith('https://fr.aliexpress.com/w/wholesale-rechaud-camping'), `fiche AliExpress non vérifiée → recherche du nom (${r1})`)
const r2 = lienAOuvrir('https://www.amazon.fr/dp/B0H9RPNYY3', rechaud)
ok(r2.startsWith('https://www.amazon.fr/s?k=R'), `fiche Amazon non vérifiée → recherche Amazon (${r2})`)
ok(lienAOuvrir('https://www.temu.com/fr/x-g-601099512345678.html', 'Lampe frontale LED rechargeable').includes('search_result'), 'fiche Temu → recherche Temu')
ok(lienAOuvrir('https://fr.aliexpress.com/w/wholesale-rechaud.html', rechaud) === 'https://fr.aliexpress.com/w/wholesale-rechaud.html', 'une recherche reste telle quelle')
ok(lienAOuvrir('https://www.cdiscount.com/x/f-1.html', rechaud) === 'https://www.cdiscount.com/x/f-1.html', 'un site non cherchable reste tel quel')

// Vérifié : le titre lu sur la page porte le nom (cas réel du thermomètre, 13/11).
const thermo = 'Thermomètre à viande sonde sans fil Bluetooth 5.2 IP67'
ok(titrePorteLeNom('Thermomètre à viande sans fil Bluetooth 2 sondes', thermo), 'titre de page qui porte le nom = vérifié')
ok(!titrePorteLeNom('Matelas gonflable autogonflant pour camping en plein air', rechaud), 'titre d’un autre produit = non vérifié')
ok(
  lienAOuvrir('https://fr.aliexpress.com/item/1005008686214269.html', thermo, 'Thermomètre à viande sans fil Bluetooth 2 sondes') ===
    'https://fr.aliexpress.com/item/1005008686214269.html',
  'fiche vérifiée gardée',
)

// La synthèse au format du 09/11 : liens remplacés, originaux gardés à part.
const lue = lireSyntheseJson({
  metadata: { date: '2026-11-13' },
  hero_products_by_category: [
    { category_id: 'voyage-plein-air', theme_id: 'camping', hero_product: { name: rechaud, sourcing_url: 'https://fr.aliexpress.com/item/1005012830855581.html', amazon_url: 'https://www.amazon.fr/dp/B0H9RPNYY3' } },
    { category_id: 'electromenager', theme_id: 'cuisson', hero_product: { name: thermo, url_page_title: 'Thermomètre à viande sans fil Bluetooth 2 sondes', sourcing_url: 'https://fr.aliexpress.com/item/1005008686214269.html' } },
  ],
  top_25_immediate_opportunities: [],
})
const pR = lue?.produits.find((p) => p.nom === rechaud)
const pT = lue?.produits.find((p) => p.nom === thermo)
ok(!!pR && /wholesale/.test(pR.liens.sourcing) && pR.liensAnnonces?.sourcing === 'https://fr.aliexpress.com/item/1005012830855581.html', 'synthèse : lien non vérifié remplacé, original gardé')
ok(!!pT && pT.liens.sourcing === 'https://fr.aliexpress.com/item/1005008686214269.html' && !pT.liensAnnonces, 'synthèse : lien vérifié gardé')
ok(LECTEUR_SYNTHESE >= 3, 'lecteur 3 : les synthèses déjà importées sont relues')

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
