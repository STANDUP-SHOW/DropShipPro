import { supplierFields } from './src/services/suppliers.js'

/**
 * Éprouve la lecture de la référence fournisseur sur des adresses réelles.
 *
 * Ce qui est vérifié n'est pas « on trouve quelque chose » mais « on ne trouve
 * rien plutôt que n'importe quoi » : une référence inventée ferait relever le
 * prix d'un autre produit, et le vendeur verrait sa marge changer sans raison.
 */
const CAS: Array<[string, string | null, string | null]> = [
  ['https://fr.aliexpress.com/item/1005006123456789.html?spm=a2g0o', 'aliexpress', '1005006123456789'],
  ['https://www.aliexpress.com/item/32912345678.html', 'aliexpress', '32912345678'],
  // Une page de catégorie AliExpress : fournisseur reconnu, pas de référence.
  ['https://fr.aliexpress.com/category/205000000/apparel.html', 'aliexpress', null],
  ['https://www.bigbuy.eu/fr/product/S1234567.html', 'bigbuy', 'S1234567'],
  ['https://www.cjdropshipping.com/product/montre-acier-p-2A3B4C5D6E.html', 'cjdropshipping', '2A3B4C5D6E'],
  ['https://www.dhgate.com/product/mens-watch/987654321.html', 'dhgate', '987654321'],
  ['https://www.banggood.com/Smart-Watch-p-1987654.html', 'banggood', '1987654'],
  // Un site qui n'est pas un fournisseur connu : rien du tout.
  ['https://www.decathlon.fr/p/montre/_/R-p-123', null, null],
  ['pas une adresse', null, null],
]

let echecs = 0
for (const [url, supplier, ref] of CAS) {
  const lu = supplierFields(url)
  const vuS = lu.supplierId ?? null
  const vuR = lu.supplierRef ?? null
  if (vuS !== supplier || vuR !== ref) {
    echecs++
    console.log(`ECHEC ${url}\n  attendu ${supplier} / ${ref}\n  lu      ${vuS} / ${vuR}`)
  }
}

console.log(echecs === 0 ? 'Références fournisseur : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
