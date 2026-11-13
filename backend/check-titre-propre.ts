/**
 * Banc : le titre d'une fiche sans le nom du site ni ses badges (13/11/2026).
 *   npx tsx check-titre-propre.ts
 */
import assert from 'node:assert/strict'
import { titrePropre } from './src/services/sourceQuality.js'

const cas: Array<[string, string]> = [
  ['VGGate Icar Pro 2 AliExpress Best Deal, Verified', 'VGGate Icar Pro 2'],
  ['Écouteurs Bluetooth sans fil TWS 5.3 - AliExpress 44', 'Écouteurs Bluetooth sans fil TWS 5.3'],
  ['Lampe de chevet LED tactile | Temu France', 'Lampe de chevet LED tactile'],
  ['Robe longue fleurie – SHEIN FR', 'Robe longue fleurie'],
  ['Montre connectée étanche IP68, livraison gratuite', 'Montre connectée étanche IP68'],
  ['Support téléphone voiture magnétique', 'Support téléphone voiture magnétique'],
  ['AliExpress', 'AliExpress'],
]
for (const [entree, attendu] of cas) assert.equal(titrePropre(entree), attendu, entree)
console.log(`check-titre-propre : ${cas.length} titres vérifiés`)

// Une ligne de la file relevée avant la fin du chargement : refusée avant tout drop et tout appel IA.
const { releveConforme } = await import('./src/services/fileImport.js')
const ligne = { url: 'https://fr.aliexpress.com/item/1005006123456789.html', titre: null }
const maigre = releveConforme(ligne, {
  sourceUrl: ligne.url,
  title: 'Lampe de chevet LED tactile',
  description: 'Lampe de chevet LED tactile',
  pageText: 'Accepter les cookies Panier Connexion Lampe de chevet LED tactile',
})
assert.ok(maigre && /pas fini de charger/.test(maigre), 'relevé maigre refusé')
const motsFiche = Array.from({ length: 60 }, (_, i) => `caracteristique${i}`).join(' ')
assert.equal(
  releveConforme(ligne, { sourceUrl: ligne.url, title: 'Lampe de chevet LED tactile', description: '', pageText: motsFiche }),
  null,
  'fiche lue pour de vrai acceptée',
)
assert.equal(releveConforme(ligne, { sourceUrl: ligne.url, title: 'Lampe' }), null, 'sans texte transmis : pas de jugement')
console.log('check-titre-propre : relevé maigre refusé avant import')
