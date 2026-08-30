import { optionsShopify, combinaisons, metachampsShopify } from './src/services/shopify.js'
import { reparerVariantes } from './src/services/variantRepair.js'

/**
 * Éprouve ce que Shopify recevra vraiment.
 *
 * Le défaut corrigé ici n'était pas un bug de données : `productCreate`
 * n'envoyait tout simplement aucune option. Shopify créait un produit à variante
 * unique, affichait son option par défaut, et le vendeur croyait ses couleurs
 * montées. Constaté le 27/08/2026 sur la première publication réelle.
 *
 * Les bornes de Shopify sont dures : trois options au plus, cent valeurs par
 * option, et un dépassement fait refuser **le produit entier**, pas l'option en
 * trop.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- La chaîne complète, sur le cas réel ------------------------------------
const reparees = reparerVariantes({
  Couleur: ['Black 1T', 'Blue 1T', 'Red 1T', 'Black 4T', 'Blue 4T', 'Red 4T'],
}).variantes
const options = optionsShopify(reparees)

exige(options.length === 2, `${options.length} options, attendu 2`)
// La couleur en premier : c'est ce que l'acheteur regarde.
exige(options[0].name === 'Couleur', `premiere option : ${options[0]?.name}, attendu Couleur`)
exige(options[0].values.length === 3, `${options[0]?.values.length} couleurs, attendu 3`)
console.log('options :', JSON.stringify(options))

const combos = combinaisons(options)
exige(combos.length === 6, `${combos.length} combinaisons, attendu 6 (3 x 2)`)
exige(
  combos.every((c) => c.length === 2),
  'chaque combinaison doit porter une valeur par option',
)
console.log('combinaisons :', JSON.stringify(combos))

// --- Les bornes de Shopify, qui font refuser le produit entier --------------
const quatre = optionsShopify({
  Couleur: ['a', 'b'], Taille: ['S', 'M'], 'Capacité': ['1T', '2T'], Prise: ['UE', 'US'],
})
exige(quatre.length === 3, `${quatre.length} options transmises, Shopify en refuse plus de 3`)
exige(
  quatre.map((o) => o.name).join(',') === 'Couleur,Taille,Capacité',
  `ordre retenu : ${quatre.map((o) => o.name).join(',')}`,
)

const cent = optionsShopify({ Couleur: Array.from({ length: 150 }, (_, i) => `c${i}`) })
exige(cent[0].values.length === 100, `${cent[0]?.values.length} valeurs, plafond 100`)

// Mille combinaisons feraient refuser le lot : on borne.
const enorme = optionsShopify({
  Couleur: Array.from({ length: 12 }, (_, i) => `c${i}`),
  Taille: Array.from({ length: 12 }, (_, i) => `t${i}`),
  'Capacité': Array.from({ length: 12 }, (_, i) => `${i}T`),
})
exige(combinaisons(enorme).length <= 100, `${combinaisons(enorme).length} combinaisons, plafond 100`)

// --- Ce qui ne doit rien produire ------------------------------------------
exige(optionsShopify(null).length === 0, 'null ne doit produire aucune option')
exige(optionsShopify({}).length === 0, 'un objet vide ne doit produire aucune option')
// Une option a une seule valeur affiche un selecteur qui ne selectionne rien.
exige(optionsShopify({ Couleur: ['Noir'] }).length === 0, 'une valeur unique n est pas une option')
exige(combinaisons([]).length === 0, 'sans option, aucune combinaison')
// --- Les métachamps ---------------------------------------------------------
const meta = metachampsShopify({
  'Matière du bracelet': 'Acier inoxydable',
  'Étanchéité': '5 ATM',
  Compatibilité: ['iOS', 'Android'],
  Vide: '',
})
exige(meta.length === 3, `${meta.length} metachamps, attendu 3 (le vide est ecarte)`)
exige(meta[0].key === 'matiere_du_bracelet', `cle : ${meta[0]?.key}`)
exige(meta[2].value === 'iOS, Android', `une liste doit etre jointe : ${meta[2]?.value}`)
exige(
  meta.every((m) => m.namespace === 'dropshipper'),
  'le namespace « custom » est partage avec les autres apps : il faut le notre',
)
exige(
  meta.every((m) => /^[a-z0-9_]{1,30}$/.test(m.key)),
  'une cle invalide fait refuser le produit entier, pas seulement le metachamp',
)

// Deux libelles voisins produisent la meme cle, et un doublon fait tout refuser.
const doublons = metachampsShopify({ 'Taille (FR)': '42', 'Taille  FR': '43' })
exige(doublons.length === 1, `${doublons.length} metachamps, les doublons de cle doivent etre ecartes`)
exige(metachampsShopify(null).length === 0, 'null ne doit rien produire')

console.log('metachamps :', JSON.stringify(meta.slice(0, 2)))



console.log(echecs === 0 ? '\nVariantes Shopify : tout passe.' : `\n${echecs} echec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
