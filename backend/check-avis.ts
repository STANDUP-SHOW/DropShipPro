/**
 * Banc : avis d'acheteurs (CSV à trois colonnes, notes, réimport) et code-barres.
 *
 * Tourne contre la vraie base, sur un compte jetable créé et détruit ici — la
 * suppression du compte emporte son produit et ses avis (onDelete: Cascade).
 */
import { prisma } from './src/lib/prisma.js'
import { avisDepuisCsv, enregistrerAvis, lireCsv, lireNote, normaliser, synthese } from './src/services/avisAcheteurs.js'
import { codeBarresDe, eanDeLaFiche, eanValide } from './src/services/productFacts.js'

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

console.log('La note, quelle que soit son écriture')
exige(lireNote('5') === 5 && lireNote(3) === 3, 'un chiffre')
exige(lireNote('4,5') === 5 && lireNote('4.4') === 4, 'une décimale, virgule ou point, arrondie')
exige(lireNote('4/5') === 4 && lireNote('3 étoiles') === 3, '« 4/5 », « 3 étoiles »')
exige(lireNote('★★★★☆') === 4, 'des étoiles en caractères')
exige(lireNote('80%') === 4, 'un pourcentage')
exige(lireNote('') === null && lireNote('bien') === null && lireNote('0') === null, 'illisible : null, jamais 5 par défaut')
exige(lireNote('10') === null, '« 10 » n’est pas une note sur cinq')

console.log('\nLe fichier du vendeur : stars, User, Avis')
{
  const { avis, refus } = avisDepuisCsv('stars,User,Avis\n5,Camille,"Très bien, livré vite"\n2,Jean,"Déçu : ""fragile"", renvoyé"\n')
  exige(avis.length === 2 && !refus.length, 'deux lignes lues', `${avis.length} avis, ${refus.length} refus`)
  exige(avis[0].text === 'Très bien, livré vite', 'la virgule dans un texte entre guillemets ne coupe pas', avis[0].text)
  exige(avis[1].text === 'Déçu : "fragile", renvoyé', 'les guillemets doublés sont rendus', avis[1].text)
}
{
  // Excel en français : points-virgules, BOM, retours Windows, en-têtes traduits et dans un autre ordre.
  const { avis } = avisDepuisCsv('﻿Utilisateur;Commentaire;Étoiles\r\nSofia;"Bien, mais le câble est court";4\r\n')
  exige(avis.length === 1 && avis[0].stars === 4 && avis[0].author === 'Sofia', 'point-virgule, BOM, en-têtes français dans le désordre', JSON.stringify(avis[0] ?? null))
}
{
  const { avis } = avisDepuisCsv('5,Léa,Parfait pour mon bureau\n3,,Correct sans plus\n')
  exige(avis.length === 2, 'sans en-tête, l’ordre convenu s’applique')
  exige(avis[1].author === 'Client', 'un nom vide devient « Client », pas un nom inventé')
}
{
  const { avis, refus } = avisDepuisCsv('stars,User,Avis\nsuper,Paul,Très bien\n4,Nina,\n5,Marc,Un avis valable\n')
  exige(avis.length === 1 && refus.length === 2, 'une ligne illisible est refusée avec son numéro', refus.join(' | '))
  exige(/Ligne 2/.test(refus[0]) && /Ligne 3/.test(refus[1]), 'le numéro est celui du fichier')
}
{
  const { avis, refus } = avisDepuisCsv('Produit,Prix\nLampe,12\n')
  exige(!avis.length && /stars, User, Avis/.test(refus[0] ?? ''), 'un fichier qui n’est pas un fichier d’avis est refusé en le disant')
}
exige(lireCsv('a,"b\nc",d\n').length === 1 && lireCsv('a,"b\nc",d\n')[0][1] === 'b\nc', 'un retour à la ligne dans un champ ne fait pas deux lignes')
exige('refus' in normaliser({ stars: 5, text: '' }), 'un avis sans texte est refusé')

console.log('\nLe code-barres')
exige(eanValide('4260182240052') === '4260182240052', 'un EAN-13 juste (relevé sur reichelt)')
exige(eanValide('4260182240053') === undefined, 'un chiffre faux fait tomber la clé')
exige(eanValide('4260 1822 40052') === '4260182240052', 'les espaces sont tolérés')
exige(eanValide('0000000000000') === undefined && eanValide('12345') === undefined, 'ni zéros, ni longueur fantaisiste')
exige(eanDeLaFiche(null, 'Marque : BAASKE\nEAN/GTIN: 4260182240052\nRéférence 2005674') === '4260182240052', 'lu derrière l’étiquette « EAN/GTIN »')
exige(eanDeLaFiche(null, 'Téléphone 4260182240052, référence 4006381333931') === undefined, 'un nombre sans étiquette n’est pas un code-barres')
exige(eanDeLaFiche('4006381333931', 'EAN: 4260182240052') === '4006381333931', 'ce que la page déclare passe devant son texte')
exige(codeBarresDe({ ean: '4006381333931', attributes: { EAN: '4260182240052' } }) === '4006381333931', 'la colonne passe devant les caractéristiques')
exige(codeBarresDe({ ean: null, attributes: { EAN: '4260182240052' } }) === '4260182240052', 'les annonces d’avant gardent le leur')

console.log('\nL’écriture : idempotente, bornée au produit')
const marque = `banc-avis-${Date.now()}`
const compte = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x' } })
try {
  const produit = await prisma.product.create({
    data: { userId: compte.id, sourceUrl: 'https://exemple.test/p/1', title: 'Lampe de banc', description: 'x', images: [] },
  })
  const { avis } = avisDepuisCsv('stars,User,Avis\n5,Camille,Très bien\n5,Camille,Très bien\n2,Jean,Déçu par la finition\n')
  const premier = await enregistrerAvis(produit, avis, { source: 'csv' })
  exige(premier.ajoutes === 2, 'la ligne en double du fichier n’est écrite qu’une fois', `ajoutés : ${premier.ajoutes}`)
  const second = await enregistrerAvis(produit, avis, { source: 'csv' })
  exige(second.ajoutes === 0 && second.dejaPresents === 2, 'redéposer le même fichier ne double rien', JSON.stringify(second))
  const extension = await enregistrerAvis(produit, [{ stars: 4, author: 'Sofia', text: 'Bien pour le prix', photos: ['https://exemple.test/a.jpg'], reviewedAt: null }], { source: 'extension', sourceSite: 'exemple.test' })
  exige(extension.ajoutes === 1, 'un avis relevé par l’extension s’ajoute aux autres')
  const lus = await prisma.buyerReview.findMany({ where: { productId: produit.id } })
  const s = synthese(lus.map((a) => a.stars))
  exige(s.nombre === 3 && s.moyenne === 3.7 && s.repartition[5] === 1, 'la synthèse : 3 avis, 3,7 de moyenne', JSON.stringify(s))
  exige(lus.find((a) => a.source === 'extension')?.sourceSite === 'exemple.test', 'l’origine est gardée, pour pouvoir l’afficher')
} finally {
  await prisma.user.delete({ where: { id: compte.id } })
  const reste = await prisma.buyerReview.count({ where: { userId: compte.id } })
  exige(reste === 0, 'le compte jetable emporte ses avis')
  await prisma.$disconnect()
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nAvis d’acheteurs et code-barres : tout passe.')
