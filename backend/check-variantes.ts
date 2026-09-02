import { lireSkuAliExpress, lirePrix } from './src/services/aliexpressSku.js'
import {
  validerMatrice,
  optionsDepuisCombinaisons,
  resumeMatrice,
  prixDeVenteDe,
  prixDe,
  MatriceInvalide,
} from './src/services/variantMatrix.js'

/**
 * Éprouve la lecture des SKU AliExpress et la matrice de combinaisons.
 *
 * **Ce que ça corrige.** `Product.variants` ne portait que des noms d'options et
 * des listes de valeurs. La publication Shopify envoyait donc le même prix pour
 * toutes les variantes et aucune image — non pas parce que l'appel était mal
 * écrit, mais parce qu'il n'y avait rien à transmettre.
 *
 * Le jeu d'essai vient d'un relevé réel du 02/09/2026 sur la version React du
 * site (produit : tondeuse T9), avec **le piège qui coûte une demi-journée** :
 * `skuId` est identique sur toutes les entrées, seul `skuIdStr` distingue les
 * combinaisons. Se fier au premier donne le même prix partout.
 *
 * Ne touche aucune base et n'appelle aucun modèle.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Le relevé réel ----------------------------------------------------------

const RELEVE = {
  SKU: {
    skuPaths: {
      '0': {
        skuId: 12000058975660912,
        skuIdStr: '12000058975660912',
        path: '14:175',
        skuAttr: '14:175#069-Blue',
        salable: true,
        skuStock: 666,
      },
      // Meme `skuId`, `skuIdStr` different : c est tout le piege.
      '1': {
        skuId: 12000058975660912,
        skuIdStr: '12000058975660913',
        path: '14:193',
        skuAttr: '14:193#069-White',
        salable: true,
        skuStock: 666,
      },
      // Une troisieme, epuisee, pour verifier qu elle est marquee indisponible.
      '2': {
        skuId: 12000058975660912,
        skuIdStr: '12000058975660914',
        path: '14:200',
        salable: true,
        skuStock: 0,
      },
    },
    skuProperties: {
      '0': {
        skuPropertyId: 14,
        skuPropertyName: 'Couleur',
        skuPropertyValues: {
          '0': {
            propertyValueIdLong: 175,
            propertyValueName: '069-Blue',
            propertyValueDisplayName: 'Bleu',
            skuPropertyImagePath: 'https://ae-pic-a1.aliexpress-media.com/kf/S6902ea7b.jpg',
          },
          '1': {
            propertyValueIdLong: 193,
            propertyValueName: '069-White',
            propertyValueDisplayName: 'Blanc',
            skuPropertyImagePath: 'https://ae-pic-a1.aliexpress-media.com/kf/Sab961313.jpg',
          },
          '2': {
            propertyValueIdLong: 200,
            propertyValueName: '069-Black',
            propertyValueDisplayName: 'Noir',
            skuPropertyImagePath: 'https://ae-pic-a1.aliexpress-media.com/kf/Sccc00000.jpg',
          },
        },
      },
    },
  },
  PRICE: {
    skuIdStrPriceInfoMap: {
      '12000058975660912': {
        originalPrice: { currency: 'EUR', formatedAmount: '8,63€', value: 8.63 },
        salePriceString: '8,49€',
      },
      '12000058975660913': {
        originalPrice: { currency: 'EUR', formatedAmount: '9,90€', value: 9.9 },
        salePriceString: '9,50€',
      },
      '12000058975660914': {
        originalPrice: { currency: 'EUR', formatedAmount: '8,63€', value: 8.63 },
        salePriceString: '8,49€',
      },
    },
  },
}

console.log('Le relevé réel, joint sur skuIdStr :')
const combos = lireSkuAliExpress(RELEVE)
exige(combos.length === 3, `3 combinaisons attendues, ${combos.length} lues`)

const bleu = combos.find((c) => c.combo.Couleur === 'Bleu')
const blanc = combos.find((c) => c.combo.Couleur === 'Blanc')
const noir = combos.find((c) => c.combo.Couleur === 'Noir')

exige(Boolean(bleu && blanc && noir), 'les trois couleurs doivent être nommées en clair')

// LE point du banc : deux prix differents. Une jointure sur `skuId` les rendrait
// identiques, et c est exactement le defaut qu on corrige.
exige(bleu?.prix === 8.49, `bleu : ${bleu?.prix} au lieu de 8,49`)
exige(blanc?.prix === 9.5, `blanc : ${blanc?.prix} au lieu de 9,50`)
exige(bleu?.prix !== blanc?.prix, 'deux combinaisons ne doivent pas partager le même prix')

console.log('  bleu', bleu?.prix, '| blanc', blanc?.prix, '| noir', noir?.prix)

console.log('\nChaque combinaison porte sa propre photo :')
exige(bleu?.image !== blanc?.image, 'deux couleurs ne peuvent pas avoir la même photo')
exige(Boolean(bleu?.image?.startsWith('https://')), `photo bleue : ${bleu?.image}`)
exige(combos.every((c) => Boolean(c.image)), 'une combinaison sans photo subsiste')

console.log('\nLe nom lisible l emporte sur le code fournisseur :')
// « 069-Blue » est le code interne : publier ça remplirait la boutique de
// references, pas de couleurs.
exige(bleu?.combo.Couleur === 'Bleu', `obtenu « ${bleu?.combo.Couleur} »`)
exige(!combos.some((c) => /^\d{3}-/.test(c.combo.Couleur ?? '')), 'un code fournisseur est passé')

console.log('\nLe prix barré n est garde que s il est vraiment superieur :')
exige(bleu?.prixOriginal === 8.63, `prix barré bleu : ${bleu?.prixOriginal}`)
exige(blanc?.prixOriginal === 9.9, `prix barré blanc : ${blanc?.prixOriginal}`)

console.log('\nLe stock nul rend la combinaison indisponible :')
exige(noir?.disponible === false, 'la couleur épuisée doit être marquée indisponible')
exige(bleu?.disponible === true, 'une couleur en stock doit rester disponible')

console.log('\nLa reference fournisseur est celle qui sert a commander :')
exige(bleu?.sku === '12000058975660912', `sku : ${bleu?.sku}`)
exige(blanc?.sku === '12000058975660913', `sku : ${blanc?.sku}`)
exige(bleu?.sku !== blanc?.sku, 'deux combinaisons ne peuvent pas partager la même référence')

// --- La lecture des prix -----------------------------------------------------

console.log('\nLes prix, dans les formats qu AliExpress melange :')
exige(lirePrix(8.49) === 8.49, 'un nombre passe tel quel')
// Le piege francais : Number('8,49') vaut NaN, et la combinaison retomberait
// silencieusement sur le prix du produit.
exige(lirePrix('8,49€') === 8.49, `virgule décimale : ${lirePrix('8,49€')}`)
exige(lirePrix('€8.49') === 8.49, `point décimal : ${lirePrix('€8.49')}`)
exige(lirePrix('1 299,90 €') === 1299.9, `milliers + virgule : ${lirePrix('1 299,90 €')}`)
exige(lirePrix('1,299.90') === 1299.9, `milliers + point : ${lirePrix('1,299.90')}`)
exige(lirePrix('') === undefined, 'une chaîne vide ne vaut aucun prix')
exige(lirePrix('gratuit') === undefined, 'un texte sans chiffre ne vaut aucun prix')
exige(lirePrix(0) === undefined, 'zéro n est pas un prix')

// --- Les options dérivées ----------------------------------------------------

console.log('\nLes options d affichage sont derivees, jamais saisies deux fois :')
const options = optionsDepuisCombinaisons(combos)
exige(JSON.stringify(options) === JSON.stringify({ Couleur: ['Bleu', 'Blanc', 'Noir'] }), JSON.stringify(options))
// L ordre du fournisseur est conserve : trier alphabetiquement mettrait les
// tailles dans le desordre -- L avant M avant S.
exige(options.Couleur[0] === 'Bleu', "l ordre de la source doit être conservé")

// --- Les prix de vente -------------------------------------------------------

console.log('\nLa marge se reporte proportionnellement :')
// Le vendeur achete 8,49 et vend 12,74 : un rapport de 1,5. La combinaison a
// 9,50 doit se vendre 14,25, pas 12,74 -- sinon la plus chere part a perte.
exige(prixDeVenteDe(bleu!, 8.49, 12.74) === 12.74, `bleu : ${prixDeVenteDe(bleu!, 8.49, 12.74)}`)
exige(prixDeVenteDe(blanc!, 8.49, 12.74) === 14.26, `blanc : ${prixDeVenteDe(blanc!, 8.49, 12.74)}`)
// Sans prix d achat de reference, on ne divise pas par zero.
exige(prixDeVenteDe(bleu!, 0, 12.74) === 12.74, 'un prix d achat nul ne doit pas faire diverger')
// Une combinaison sans prix retombe sur celui du produit, jamais sur zero : une
// variante a zero euro chez Shopify est une commande gratuite.
exige(prixDe({ combo: {}, disponible: true }, 9.9) === 9.9, 'le repli doit être le prix du produit')

// --- La validation ------------------------------------------------------------

console.log('\nCe qui doit etre refuse ou nettoye :')
const refuse = (brut: unknown, pourquoi: string) => {
  try {
    validerMatrice(brut)
    echecs++
    console.log(`ECHEC : ${pourquoi} — accepté alors qu il devait être refusé`)
  } catch (e) {
    exige(e instanceof MatriceInvalide, `${pourquoi} — mauvaise erreur`)
  }
}
refuse('pas une liste', 'une chaîne')
refuse([], 'une liste vide')
refuse([{ prix: 9 }], 'une combinaison sans options')
refuse([{ combo: { Couleur: 42 } }], 'une valeur qui n est pas du texte')

// Le doublon est ecarte sans faire echouer les trente lignes valides autour.
const dedoublonne = validerMatrice([
  { combo: { Couleur: 'Bleu' }, prix: 8.49, disponible: true },
  { combo: { Couleur: 'Bleu' }, prix: 9.99, disponible: true },
  { combo: { Couleur: 'Noir' }, prix: 8.49, disponible: true },
])
exige(dedoublonne.length === 2, `doublon non écarté : ${dedoublonne.length} lignes`)
exige(dedoublonne[0].prix === 8.49, 'la première occurrence doit gagner')

// --- Le resume ----------------------------------------------------------------

console.log('\nLe resume, qui rend un releve tronque visible :')
const r = resumeMatrice(combos)
exige(r.combinaisons === 3, `${r.combinaisons} combinaisons`)
exige(r.avecPrix === 3 && r.avecPhoto === 3, `prix ${r.avecPrix}, photos ${r.avecPhoto}`)
exige(r.indisponibles === 1, `${r.indisponibles} indisponible(s)`)
exige(r.prixMin === 8.49 && r.prixMax === 9.5, `de ${r.prixMin} à ${r.prixMax}`)

// --- Les releves incomplets ----------------------------------------------------

console.log('\nUn releve partiel ne fait pas echouer la lecture :')
exige(lireSkuAliExpress({}).length === 0, 'des modules absents ne doivent rien lever')
const sansPrix = lireSkuAliExpress({ SKU: RELEVE.SKU })
// Sans le module PRICE, les combinaisons restent lisibles : elles gardent leurs
// options, leurs photos et leur stock, et n ont simplement pas de prix.
exige(sansPrix.length === 3, )
exige(sansPrix.every((c) => Boolean(c.image)), 'les photos ne dependent pas du module des prix')
// Et sans les proprietes, une combinaison n a aucune option donc aucune cle :
// mieux vaut zero ligne que des lignes anonymes.
exige(
  lireSkuAliExpress({ SKU: { skuPaths: RELEVE.SKU.skuPaths } }).length === 0,
  'une combinaison sans option identifiee doit etre ecartee',
)
exige(sansPrix.every((c) => c.prix === undefined), 'aucun prix ne doit être inventé')

// --- La jointure avec le produit cartesien de Shopify ------------------------

/**
 * La cle de jointure, recopiee de `shopify.ts`.
 *
 * Le produit cartesien des options et la matrice relevee decrivent les memes
 * choix, mais rien ne garantit le meme ordre ni la meme casse. Une jointure
 * ratee ne leve pas : elle rend le prix du produit pour toutes les variantes --
 * exactement le defaut qu on corrige, et sans le moindre message.
 */
const cleValeurs = (valeurs: string[]) =>
  valeurs.map((v) => String(v).trim().toLowerCase()).sort().join('|')

console.log('\nLa jointure Shopify tient malgre l ordre et la casse :')
const matrice = new Map(combos.map((c) => [cleValeurs(Object.values(c.combo)), c]))

exige(matrice.get(cleValeurs(['Bleu']))?.prix === 8.49, 'jointure simple')
exige(matrice.get(cleValeurs(['bleu']))?.prix === 8.49, 'la casse ne doit pas casser la jointure')
exige(matrice.get(cleValeurs([' Bleu ']))?.prix === 8.49, 'les espaces non plus')

// Deux options : Shopify peut les rendre dans l ordre inverse du releve.
const deuxOptions = [
  { combo: { Couleur: 'Noir', Taille: 'M' }, prix: 12, disponible: true },
  { combo: { Couleur: 'Noir', Taille: 'L' }, prix: 14, disponible: true },
]
const m2 = new Map(deuxOptions.map((c) => [cleValeurs(Object.values(c.combo)), c]))
exige(m2.get(cleValeurs(['M', 'Noir']))?.prix === 12, "l ordre des options ne doit pas compter")
exige(m2.get(cleValeurs(['Noir', 'M']))?.prix === 12, 'ni dans un sens ni dans l autre')
exige(m2.get(cleValeurs(['Noir', 'L']))?.prix === 14, 'la seconde taille garde son prix')
// Et deux tailles differentes ne doivent surtout pas se confondre.
exige(
  m2.get(cleValeurs(['Noir', 'M']))?.prix !== m2.get(cleValeurs(['Noir', 'L']))?.prix,
  'deux combinaisons distinctes ont fusionne',
)

console.log('\nUne combinaison absente de la matrice retombe sur le prix du produit :')
const absente = matrice.get(cleValeurs(['Vert']))
exige(absente === undefined, 'une couleur inconnue ne doit rien rendre')
// C est le repli : sans lui, Shopify recevrait une variante a zero euro, donc
// une commande gratuite.
exige(prixDeVenteDe(absente ?? { combo: {}, disponible: true }, 8.49, 12.74) === 12.74, 'repli du prix')

console.log(echecs === 0 ? '\nJointure : tout passe.' : `\nJointure : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
