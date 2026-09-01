import {
  validerReleve,
  prixDeVente,
  prixDAppel,
  resumeGrille,
  ReleveInvalide,
  type LigneTarif,
} from './src/services/printPricing.js'

/**
 * Éprouve la grille tarifaire d un produit d imprimerie.
 *
 * Ce qui est vérifié tient en une phrase : **un relevé à moitié bon doit être
 * refusé, pas rangé**. Une ligne sans prix lisible passerait la validation, se
 * rangerait en base, et ne se verrait qu au moment où un client commande une
 * carte de visite à `NaN` euro.
 *
 * Ne touche aucune base : la tarification est arithmétique, et le banc doit
 * tourner sans connexion.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const refuse = (brut: unknown, pourquoi: string) => {
  try {
    validerReleve(brut)
    echecs++
    console.log(`ECHEC : ${pourquoi} — accepté alors qu il devait être refusé`)
  } catch (err) {
    exige(err instanceof ReleveInvalide, `${pourquoi} — refusé, mais avec la mauvaise erreur`)
  }
}

// --- Un relevé plausible, tel qu un configurateur d imprimeur en produit -----

const releve = {
  sourceUrl: 'https://exemple.fr/cartes-de-visite/',
  name: 'Cartes de visite classiques',
  dimensions: [
    { cle: 'grammage', libelle: 'Grammage', options: [{ valeur: '250' }, { valeur: '350' }] },
    { cle: 'orientation', libelle: 'Orientation', options: ['horizontale', 'verticale'] },
  ],
  priceRows: [
    { combo: { grammage: '250', orientation: 'horizontale' }, quantite: 100, delaiJours: 5, prixHt: 19.9 },
    { combo: { grammage: '250', orientation: 'horizontale' }, quantite: 100, delaiJours: 2, prixHt: 27.5 },
    { combo: { grammage: '350', orientation: 'verticale' }, quantite: 500, delaiJours: 5, prixHt: 48.5 },
    { combo: { grammage: '350', orientation: 'verticale' }, quantite: 7500, delaiJours: 5, prixHt: 412 },
  ],
}

console.log('Un relevé complet :')
const { dimensions, rows } = validerReleve(releve)
exige(dimensions.length === 2, `2 dimensions attendues, ${dimensions.length} lues`)
// Une option écrite en chaîne simple vaut une option : un configurateur qui ne
// donne que des valeurs ne doit pas faire échouer le relevé entier.
exige(
  dimensions[1].options[0].valeur === 'horizontale',
  `option en chaîne mal lue : ${JSON.stringify(dimensions[1].options[0])}`,
)
exige(rows.length === 4, `4 lignes attendues, ${rows.length} lues`)

// --- La marge ---------------------------------------------------------------

console.log('\nLa marge, appliquée à la lecture et jamais écrite dans la grille :')
exige(prixDeVente(rows[0], 40) === 27.86, `19,90 + 40 % = 27,86 ; obtenu ${prixDeVente(rows[0], 40)}`)
exige(prixDeVente(rows[0], 0) === 19.9, `marge nulle : le prix ne bouge pas`)
// L arrondi au centime doit être franc : 48,50 + 33 % = 64,505, qui ne
// s affiche pas. Un prix à trois décimales est refusé par Stripe et par Google.
exige(prixDeVente(rows[2], 33) === 64.51, `arrondi au centime ; obtenu ${prixDeVente(rows[2], 33)}`)
// La grille garde le prix fournisseur intact : c est ce qui permet de changer
// de marge sans tout relever.
exige(rows[0].prixHt === 19.9, 'le prix fournisseur ne doit jamais être modifié')

// --- Le prix d appel --------------------------------------------------------

console.log("\nLe prix d appel, et sa quantité — sans elle il est trompeur :")
const appel = prixDAppel(rows, 40)!
exige(appel.prix === 27.86, `le moins cher de la grille ; obtenu ${appel.prix}`)
exige(appel.quantite === 100, `la quantité qui produit ce prix ; obtenu ${appel.quantite}`)
exige(appel.delaiJours === 5, `le délai qui produit ce prix ; obtenu ${appel.delaiJours}`)
exige(prixDAppel([], 40) === null, 'une grille vide n a pas de prix d appel')

// --- Le résumé --------------------------------------------------------------

console.log('\nLe résumé, qui doit rendre un relevé tronqué visible :')
const resume = resumeGrille(rows, 40)
exige(resume.lignes === 4, `4 lignes ; obtenu ${resume.lignes}`)
exige(resume.min === 27.86 && resume.max === 576.8, `bornes : ${resume.min} → ${resume.max}`)
exige(
  JSON.stringify(resume.quantites) === '[100,500,7500]',
  `quantités dédoublonnées et triées ; obtenu ${JSON.stringify(resume.quantites)}`,
)
exige(
  JSON.stringify(resume.delais) === '[2,5]',
  `délais dédoublonnés et triés ; obtenu ${JSON.stringify(resume.delais)}`,
)

// --- Ce qui doit être refusé ------------------------------------------------
//
// C est la partie qui compte. Un relevé vient de l extérieur : extension,
// script du vendeur, copier-coller. Rien n est supposé.

console.log('\nLes relevés qui doivent être refusés :')
refuse({}, 'aucune grille')
refuse({ priceRows: [] }, 'grille vide')
refuse({ priceRows: [{ combo: {}, quantite: 100 }] }, 'ligne sans prix')
refuse({ priceRows: [{ combo: {}, quantite: 100, prixHt: 'gratuit' }] }, 'prix non numérique')
refuse({ priceRows: [{ combo: {}, quantite: 100, prixHt: 0 }] }, 'prix nul')
refuse({ priceRows: [{ combo: {}, quantite: 100, prixHt: -5 }] }, 'prix négatif')
refuse({ priceRows: [{ combo: {}, prixHt: 19.9 }] }, 'ligne sans quantité')
refuse({ priceRows: [{ combo: {}, quantite: 0, prixHt: 19.9 }] }, 'quantité nulle')
refuse({ priceRows: [{ combo: {}, quantite: 100, prixHt: 19.9 }], dimensions: [{ libelle: 'X' }] }, 'dimension sans clé')

// Le délai absent ne fait pas échouer, mais il prend la valeur la plus longue :
// annoncer « livré demain » sur une supposition est la promesse qu on ne tient
// pas.
const sansDelai = validerReleve({ priceRows: [{ combo: {}, quantite: 100, prixHt: 19.9 }] })
exige(sansDelai.rows[0].delaiJours === 10, `délai absent → 10 jours ; obtenu ${sansDelai.rows[0].delaiJours}`)

// Le format anglais du mémo doit passer : c est celui que produira un script de
// relevé écrit d après lui.
const anglais = validerReleve({
  rows: [{ combo: { g: '250' }, quantity: 250, delay_days: 3, price_ht: 31.2, shipping_price: 6.9 }],
} as unknown)
exige(anglais.rows[0].quantite === 250, 'quantity → quantite')
exige(anglais.rows[0].delaiJours === 3, 'delay_days → delaiJours')
exige(anglais.rows[0].prixHt === 31.2, 'price_ht → prixHt')
exige(anglais.rows[0].port === 6.9, 'shipping_price → port')

// --- La taille réelle d une fiche -------------------------------------------
//
// Trois cent lignes n est pas une hypothèse d école : c est ce que donne un
// configurateur à quatre dimensions avec dix quantités et trois délais.

const grosse: LigneTarif[] = []
for (let q = 0; q < 10; q++) {
  for (let d = 0; d < 3; d++) {
    for (let c = 0; c < 12; c++) {
      grosse.push({ combo: { c: String(c) }, quantite: (q + 1) * 100, delaiJours: d + 2, prixHt: 10 + c })
    }
  }
}
console.log(`\nUne fiche à ${grosse.length} lignes :`)
const gros = resumeGrille(grosse, 40)
exige(gros.lignes === 360, `360 lignes ; obtenu ${gros.lignes}`)
exige(gros.quantites.length === 10, `10 paliers de quantité ; obtenu ${gros.quantites.length}`)

console.log(
  echecs === 0 ? '\nGrille tarifaire : tout passe.' : `\nGrille tarifaire : ${echecs} echec(s).`,
)
process.exit(echecs === 0 ? 0 : 1)
