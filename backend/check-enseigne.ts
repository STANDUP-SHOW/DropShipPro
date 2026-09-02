import { enseignePour } from './src/services/adBrand.js'

/**
 * Éprouve l'enseigne posée sur une publicité.
 *
 * **Le défaut qui a motivé ce banc, signalé le 02/09/2026 :** « elle marque le
 * mauvais nom de boutique et le mauvais logo ». Le choix de boutique existait
 * déjà côté serveur, mais il ne décidait **que du logo** — le nom continuait de
 * venir de la boutique où l'annonce était rangée. Un vendeur qui tient quatre
 * sites recevait donc le logo de l'un sous le nom d'un autre.
 *
 * La règle vérifiée ici tient en une phrase : **on ne mélange jamais deux
 * niveaux**. Dès qu'une boutique est retenue, son nom et son logo viennent
 * d'elle, y compris quand l'un des deux manque.
 *
 * Ne touche aucune base : c'est une règle de choix, pas une lecture.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const MODE = { name: 'OGGUS Mode', logo: '/storage/logos/mode.png' }
const TECH = { name: 'OGGUS High-Tech', logo: '/storage/logos/tech.png' }
const COMPTE = { shopName: 'Mon compte', watermarkImage: '/storage/logos/compte.png' }

console.log('La boutique choisie l emporte, nom ET logo :')
const choisie = enseignePour({ choisie: TECH, duProduit: MODE, compte: COMPTE })
exige(choisie.nom === TECH.name, `nom : ${choisie.nom}`)
exige(choisie.logo === TECH.logo, `logo : ${choisie.logo}`)
// Le defaut exact du 02/09 : le logo suivait le choix, le nom non.
exige(choisie.nom !== MODE.name, 'le nom est reste celui de la boutique de l annonce')
exige(choisie.origine === 'boutique-choisie', `origine : ${choisie.origine}`)

console.log("\nSans choix, la boutique de l annonce prend la main :")
const parDefaut = enseignePour({ duProduit: MODE, compte: COMPTE })
exige(parDefaut.nom === MODE.name && parDefaut.logo === MODE.logo, 'la boutique de l annonce doit servir')
exige(parDefaut.origine === 'boutique-de-l-annonce', `origine : ${parDefaut.origine}`)

console.log('\nUne boutique sans logo sort sans logo, jamais avec celui du compte :')
const sansLogo = enseignePour({ choisie: { name: 'OGGUS Cuisine', logo: null }, compte: COMPTE })
exige(sansLogo.nom === 'OGGUS Cuisine', `nom : ${sansLogo.nom}`)
/*
 * C'est le cœur de la correction. Retomber sur le logo du compte remettrait
 * exactement le défaut corrigé — le nom d'une enseigne sous la marque d'une
 * autre — et il ne se verrait qu'une fois la publicité sortie.
 */
exige(sansLogo.logo === null, `logo emprunte au compte : ${sansLogo.logo}`)
exige(sansLogo.logo !== COMPTE.watermarkImage, 'le logo du compte a ete emprunte')

console.log("\nAucune boutique : le compte fournit les deux, et ensemble :")
const compte = enseignePour({ compte: COMPTE })
exige(compte.nom === COMPTE.shopName, `nom : ${compte.nom}`)
exige(compte.logo === COMPTE.watermarkImage, `logo : ${compte.logo}`)
exige(compte.origine === 'compte', `origine : ${compte.origine}`)

console.log("\nUn compte sans rien ne fait pas echouer la publicite :")
const rien = enseignePour({ compte: { shopName: null, watermarkImage: null } })
exige(rien.nom === null && rien.logo === null, 'aucune marque ne doit etre inventee')

console.log("\nUne boutique choisie qui n a ni nom ni logo n emprunte rien non plus :")
const vide = enseignePour({ choisie: { name: 'Sans marque', logo: null }, duProduit: MODE, compte: COMPTE })
exige(vide.nom === 'Sans marque', `nom : ${vide.nom}`)
exige(vide.logo === null, `logo repris ailleurs : ${vide.logo}`)

console.log(echecs === 0 ? '\nEnseigne des publicites : tout passe.' : `\nEnseigne : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
