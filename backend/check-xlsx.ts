import fs from 'fs'
import { lireClasseur, colonneAdresses } from './src/services/xlsx.js'
import { supplierFields } from './src/services/suppliers.js'

/**
 * Éprouve le lecteur de classeur sur un vrai export AliExpress Business.
 *
 * Le fichier d'essai est celui d'un vendeur, quatre produits. Ce qu'il faut
 * prouver n'est pas « on lit un xlsx » mais « on lit *celui-là* » : AliExpress
 * l'écrit en flux, et un lecteur qui se fie aux en-têtes locaux du zip rend un
 * classeur vide sans lever la moindre erreur. C'est exactement ce qu'a fait la
 * première version.
 */
const CHEMIN = process.argv[2] ?? 'C:/Users/maxma/Downloads/S35c61fa997f94759a22e43336bcd7364d.xlsx'

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

if (!fs.existsSync(CHEMIN)) {
  console.log(`Fichier d'essai absent (${CHEMIN}) — banc ignoré.`)
  process.exit(0)
}

const classeur = lireClasseur(fs.readFileSync(CHEMIN))

exige(classeur.lignes.length === 4, `${classeur.lignes.length} produits lus, attendu 4`)
exige(
  classeur.entetes.includes('productUrl'),
  `en-têtes lues : ${classeur.entetes.join(', ')}`,
)

const colonne = colonneAdresses(classeur)
exige(colonne === 'productUrl', `colonne d'adresses trouvée : ${colonne}`)

// Le point qui rend le fichier exploitable : chaque adresse doit livrer une
// référence fournisseur, sinon on ne sait pas quoi demander à l'API.
for (const ligne of classeur.lignes) {
  const champs = supplierFields(ligne[colonne!])
  exige(champs.supplierId === 'aliexpress', `fournisseur non reconnu : ${ligne[colonne!]}`)
  exige(Boolean(champs.supplierRef), `référence illisible dans ${ligne[colonne!]}`)
}

console.log(`\n${classeur.lignes.length} produits, colonne « ${colonne} » :`)
for (const l of classeur.lignes) {
  const champs = supplierFields(l[colonne!])
  console.log(`  ${champs.supplierRef}  ${(l['productName'] ?? '').slice(0, 60)}…`)
}

// Ce que le fichier ne contient PAS, et qu'il faut donc aller chercher.
const manquants = ['image', 'price', 'prix', 'description'].filter((mot) =>
  classeur.entetes.some((e) => e.toLowerCase().includes(mot)),
)
exige(
  manquants.length === 0,
  `le fichier contiendrait ${manquants.join(', ')} : le commentaire du code est à corriger`,
)
console.log('\nAucune colonne image, prix ni description : confirmé.')

console.log(echecs === 0 ? '\nLecture de classeur : tout passe.' : `\n${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
