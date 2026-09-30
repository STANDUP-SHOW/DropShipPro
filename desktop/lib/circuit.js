'use strict'
/**
 * Le circuit « tout automatique » : un lien reçu devient une annonce en file.
 *
 *   lien partagé (mobile, extension) → import (réécriture IA, photos) →
 *   mise en file sur les plateformes où l'agent est activé → l'exécuteur publie.
 *
 * Aucune validation du vendeur au milieu : il a activé l'agent, l'agent avance.
 * Il insiste sur les pannes passagères (réseau, serveur : 3 essais) et ne s'obstine
 * pas là où rien ne changera — solde de drops vide (stop net, le reste attend le
 * rechargement), page illisible (le lien est classé, l'agent passe au suivant).
 */
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** Une erreur qui vaut la peine d'être retentée : le réseau, une panne du serveur. */
const passagere = (err) => err && (err.statut === 0 || err.statut >= 500) && err.statut !== 502

/**
 * @returns {Promise<{statut: 'en_file'|'importe'|'sans_solde'|'echec', productId?: string, enFile?: string[], raison?: string}>}
 */
async function traiterLien({ api, lien, plateformes = [], essais = 3, pauseEssaiMs = 15_000, dormir = pause }) {
  let produit = null
  let derniere = null
  for (let i = 1; i <= essais; i++) {
    try {
      produit = await api.importer(lien.url, lien.id)
      break
    } catch (err) {
      derniere = err
      if (err.statut === 402) return { statut: 'sans_solde', raison: err.message }
      if (!passagere(err) || i === essais) break
      await dormir(pauseEssaiMs)
    }
  }
  if (!produit) {
    // Classé « pris en charge » : le prochain démarrage ne le réimporte pas en boucle.
    await api.reclamer(lien.id, 'CLAIMED').catch(() => undefined)
    return { statut: 'echec', raison: derniere ? derniere.message : 'Import impossible.' }
  }
  if (!plateformes.length) return { statut: 'importe', productId: produit.id }
  try {
    const r = await api.mettreEnFile(produit.id, plateformes)
    return { statut: 'en_file', productId: produit.id, enFile: r.enFile || [] }
  } catch (err) {
    return { statut: 'importe', productId: produit.id, raison: `Importé, mais la mise en file a échoué : ${err.message}` }
  }
}

module.exports = { traiterLien }
