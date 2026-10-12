import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Product } from '@prisma/client'
import { CHEMIN_MODELE_FAIRE, ModeleFaireIllisible, classeurFaire, zipper } from './src/services/faireXlsx.js'
import { entrees } from './src/services/xlsx.js'

/**
 * Éprouve l'export Faire au format XLSX : le modèle officiel (fourni par Max le
 * 03/10/2026, `assets/faire-modele.xlsx`) rempli à partir de la ligne 6.
 *
 * Le contrat est écrit à la main ici, par clé machine de la ligne 5 du modèle
 * et non par la constante du code : `eu_price_wholesale` doit porter le prix de
 * gros, `selling_method` une valeur de la liste « Options de données ».
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = ''): void {
  if (!condition) {
    echecs++
    console.log(`ECHEC ${nom}${detail ? `\n  ${detail}` : ''}`)
  }
}

function produit(p: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Écouteurs sans fil',
    aiTitle: 'Écouteurs <sans fil> & étui',
    description: '<p>Un <b>bon</b> produit</p>',
    aiDescription: null,
    price: 10 as unknown as Product['price'],
    shippingCost: 2 as unknown as Product['shippingCost'],
    sellingPrice: 40 as unknown as Product['sellingPrice'],
    images: ['https://exemple.test/a.jpg', 'https://exemple.test/b.jpg'],
    exportImages: null,
    variants: { Couleur: ['Rouge', 'Bleu'] } as unknown as Product['variants'],
    supplierRef: 'REF-1',
    ...p,
  } as unknown as Product
}

const decoder = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** Cells of one row, by column letter, text or number. */
function cellules(feuille: string, r: number): Record<string, string> {
  const ligne = feuille.match(new RegExp(`<row r="${r}"[^>]*>([\\s\\S]*?)</row>`))
  const sortie: Record<string, string> = {}
  if (!ligne) return sortie
  for (const m of ligne[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
    const t = m[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) ?? m[2].match(/<v>([\s\S]*?)<\/v>/)
    sortie[m[1]] = t ? decoder(t[1]) : ''
  }
  return sortie
}

const modele = fs.readFileSync(CHEMIN_MODELE_FAIRE)
const resultat = classeurFaire([produit(), produit({ id: 'p2', images: [] }), produit({ id: 'p3', supplierRef: 'REF-3' })])

verifier('deux produits sur trois retenus', resultat.retenus === 2, `retenus : ${resultat.retenus}`)
verifier('le produit sans photo est nommé', resultat.ecartes.length === 1 && resultat.ecartes[0].id === 'p2')

const avant = entrees(modele)
const apres = entrees(resultat.xlsx)
verifier('le zip se relit avec toutes ses entrées', Object.keys(apres).join() === Object.keys(avant).join())
for (const nom of Object.keys(avant)) {
  if (nom === 'xl/worksheets/sheet1.xml') continue
  verifier(`${nom} repart à l’octet près`, Boolean(apres[nom]) && apres[nom].equals(avant[nom]))
}

const feuille = apres['xl/worksheets/sheet1.xml'].toString('utf8')
const cles = cellules(feuille, 5)
const parCle = (r: number) => {
  const c = cellules(feuille, r)
  const o: Record<string, string> = {}
  for (const [lettre, cle] of Object.entries(cles)) if (c[lettre] !== undefined) o[cle] = c[lettre]
  return o
}

verifier('les lignes 1 à 5 du modèle sont intactes', [1, 2, 3, 4, 5].every((r) =>
  JSON.stringify(cellules(feuille, r)) === JSON.stringify(cellules(avant['xl/worksheets/sheet1.xml'].toString('utf8'), r))))

const l6 = parCle(6)
verifier('nom (échappé puis relu)', l6.info_product_name === 'Écouteurs <sans fil> & étui', l6.info_product_name)
verifier('description sans balises', l6.info_product_description === 'Un bon produit')
verifier('images séparées par une espace', l6.product_images_for_validation === 'https://exemple.test/a.jpg https://exemple.test/b.jpg')
verifier('prix de gros EUR', l6.eu_price_wholesale === '20.00' || l6.eu_price_wholesale === '20', l6.eu_price_wholesale)
verifier('prix de vente EUR', Number(l6.eu_price_retail) === 40, l6.eu_price_retail)
verifier('prix écrits en nombres', /<c r="D6"><v>/.test(feuille) && /<c r="E6"><v>/.test(feuille))
verifier('méthode de vente', l6.selling_method === 'Par article', l6.selling_method)
verifier('unités par carton', Number(l6.case_quantity) === 1)
verifier('quantité minimale', Number(l6.minimum_order_quantity) === 1)
verifier('option 1', l6.option_1_name === 'Couleur' && l6.option_1_value === 'Rouge, Bleu')
verifier('UGS', l6.sku === 'REF-1')
verifier('statut', l6.info_status_v2 === 'Publié')
verifier('deuxième produit en ligne 7', parCle(7).sku === 'REF-3')
verifier('rien en ligne 8', Object.keys(parCle(8)).length === 0)
verifier('dimension mise à jour', feuille.includes('<dimension ref="A1:AW7"/>'))

/* Our values must sit in the template's own drop-down lists (sheet 4). */
const options = apres['xl/worksheets/sheet4.xml'].toString('utf8')
const colonne = (lettre: string) =>
  [...options.matchAll(new RegExp(`<c r="${lettre}(\\d+)"[^>]*>([\\s\\S]*?)</c>`, 'g'))]
    .filter((m) => Number(m[1]) > 1)
    .map((m) => decoder((m[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) ?? ['', ''])[1]))
verifier('« Par article » est dans la liste du modèle', colonne('A').includes('Par article'), colonne('A').join(' | '))
verifier('« Publié » est dans la liste du modèle', colonne('H').includes('Publié'), colonne('H').join(' | '))
verifier('« Couleur » est un nom d’option recommandé', colonne('F').includes('Couleur'))

/* An independent reader: Info-ZIP's `unzip -t` checks every CRC. */
try {
  const tmp = path.join(os.tmpdir(), `faire-banc-${process.pid}.xlsx`)
  fs.writeFileSync(tmp, resultat.xlsx)
  const sortie = execFileSync('unzip', ['-t', tmp], { encoding: 'utf8' })
  fs.unlinkSync(tmp)
  verifier('unzip -t : aucune erreur', /No errors detected/.test(sortie), sortie.slice(-300))
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') verifier('unzip -t', false, String(e))
}

/* A different template must stop the export, not produce a file Faire refuses. */
const autres = entrees(modele)
autres['xl/worksheets/sheet1.xml'] = Buffer.from(
  autres['xl/worksheets/sheet1.xml'].toString('utf8').replace('eu_price_wholesale', 'prix_gros'),
)
let refuse = false
try {
  classeurFaire([produit()], {}, zipper(Object.entries(autres)))
} catch (e) {
  refuse = e instanceof ModeleFaireIllisible
}
verifier('un modèle dont la ligne 5 a changé arrête l’export', refuse)

console.log(echecs === 0 ? 'Export Faire XLSX : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
