'use strict'
/**
 * La file de travail : les liens partagés depuis le mobile ou l'extension.
 *
 * Sondage à intervalle FIXE (une minute) : le serveur limite à 120 requêtes par
 * minute par clé, on en fait une. Un lien vu n'est pas rouvert au passage
 * suivant ; il se marque « pris en charge » côté serveur quand le vendeur
 * l'ouvre, « terminé » quand il l'a importé.
 */
const INTERVALLE_MS = 60_000

/** Les liens du serveur qu'on n'a pas encore présentés au vendeur. */
function nouveaux(liens, dejaVus) {
  return liens.filter((l) => !dejaVus.has(l.id))
}

/** Un lien n'est ouvert que s'il est en http(s) : une adresse `file:` ou `javascript:` ne sort jamais du serveur vers le navigateur. */
function adresseSure(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * Le passage : lit la file, ressort les liens nouveaux. Une erreur ne casse pas
 * la boucle — elle est rendue pour l'écran, le passage suivant réessaie.
 */
async function passage(api, dejaVus) {
  try {
    const tous = await api.liensNouveaux()
    const frais = nouveaux(tous, dejaVus).filter((l) => adresseSure(l.url))
    frais.forEach((l) => dejaVus.add(l.id))
    return { liens: frais, erreur: null, total: tous.length }
  } catch (err) {
    return { liens: [], erreur: err.message, total: 0 }
  }
}

module.exports = { INTERVALLE_MS, nouveaux, adresseSure, passage }
