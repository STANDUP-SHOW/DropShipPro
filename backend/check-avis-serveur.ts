/**
 * Banc : l'import par adresse (le serveur lit la page) garde les avis que la
 * page DÉCLARE en JSON-LD — et rien d'autre. Sans base : lecture pure.
 */
import { avisJsonLd } from './src/services/scraper.js'
import { normaliser } from './src/services/avisAcheteurs.js'

let echecs = 0
function exige(c: boolean, nom: string, detail = '') {
  console.log(`${c ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!c) echecs++
}

const bruts = avisJsonLd({
  '@type': 'Product',
  review: [
    { '@type': 'Review', author: { '@type': 'Person', name: 'Inès' }, reviewRating: { ratingValue: '4.6' }, reviewBody: 'Solide et bien emballée.', datePublished: '2026-08-02' },
    { '@type': 'Review', author: 'Paul', reviewRating: { ratingValue: 8, bestRating: 10 }, description: 'Fait le travail.' },
    { '@type': 'Review', author: 'Sans note', reviewBody: 'Un avis sans note ne doit pas être repris.' },
    { '@type': 'Review', author: 'Sans texte', reviewRating: { ratingValue: 5 } },
  ],
})
const propres = bruts.map(normaliser).filter((a) => !('refus' in a)) as Array<{ stars: number; author: string; text: string }>
exige(propres.length === 2, 'deux avis gardés, ceux sans note ou sans texte écartés', `gardés : ${propres.length}`)
exige(propres[0]?.stars === 5 && propres[0]?.author === 'Inès', '4,6 sur 5 → 5, auteur en objet')
exige(propres[1]?.stars === 4, '8 sur 10 ramené à 4 sur 5', `lu ${propres[1]?.stars}`)
exige(avisJsonLd({ review: { author: 'Seul', reviewRating: { ratingValue: 3 }, reviewBody: 'Un seul avis, pas une liste.' } }).length === 1, 'un avis unique (objet) est lu')
exige(avisJsonLd(null).length === 0 && avisJsonLd({}).length === 0, 'pas de produit, pas d’avis')

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nAvis déclarés lus par le serveur : tout passe.')
