/**
 * Banc : choix d'un résultat fournisseur pour un gagnant de synthèse (13/11/2026).
 * Un résultat ne remplit une annonce que s'il porte vraiment le nom du gagnant.
 *   npx tsx check-syntheses-completion.ts
 */
import { meilleurResultat, pertinent } from './src/services/synthesesCompletion.js'

let fautes = 0
const exige = (ok: boolean, quoi: string) => {
  console.log(`${ok ? 'OK ' : 'KO '} ${quoi}`)
  if (!ok) fautes++
}
const ligne = (ref: string, titre: string) => ({ ref, titre, prix: 10, devise: 'EUR', image: null, url: `https://fr.aliexpress.com/item/${ref}.html`, entrepot: null })

exige(pertinent('Écouteurs sans fil Bluetooth', 'Ecouteur Bluetooth 5.3 sans fil, réduction de bruit'), 'accents et pluriel tolérés')
exige(!pertinent('Mini PC Intel N100', 'Station météo mini écran couleur'), 'une station météo n’est pas un mini PC')
exige(!pertinent('', 'Quelque chose'), 'nom vide : jamais pertinent')
exige(pertinent('Aspirateur voiture portable', 'Aspirateur de voiture sans fil 12000Pa'), 'deux mots sur trois suffisent')
exige(!pertinent('Aspirateur voiture portable', 'Housse de siège voiture'), 'un mot sur trois ne suffit pas')

const lignes = [ligne('1', 'Housse de siège voiture'), ligne('', 'Aspirateur voiture sans ref'), ligne('3', 'Aspirateur voiture portable sans fil')]
exige(meilleurResultat('Aspirateur voiture portable', lignes)?.ref === '3', 'le premier résultat pertinent AVEC référence est gardé')
exige(meilleurResultat('Lampe de bureau LED', lignes) === null, 'aucun résultat pertinent : rien n’est rempli')

console.log(fautes ? `\n${fautes} faute(s)` : '\nTout est conforme.')
process.exit(fautes ? 1 : 0)
