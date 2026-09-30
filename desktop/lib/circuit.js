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
async function traiterLien({ api, lien, plateformes = [], reseaux = false, essais = 3, pauseEssaiMs = 15_000, dormir = pause }) {
  const r = await importerEtMettreEnFile({ api, lien, plateformes, essais, pauseEssaiMs, dormir })
  // Les réseaux sociaux : une fois par produit importé, jamais rejoués. Un refus n'annule rien du reste.
  if (reseaux && r.productId && (r.statut === 'en_file' || r.statut === 'importe')) {
    try {
      const s = await api.publierReseaux(r.productId)
      r.reseaux = { publies: s.publies || 0, raison: s.raison, erreurs: s.erreurs || [] }
    } catch (err) {
      r.reseaux = { publies: 0, raison: err.message, erreurs: [] }
    }
  }
  return r
}

async function importerEtMettreEnFile({ api, lien, plateformes, essais, pauseEssaiMs, dormir }) {
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
    // Classé « pris en charge » : le prochain démarrage ne le réimporte pas en boucle (un gagnant du jour n'a pas de lien à classer).
    if (lien.id) await api.reclamer(lien.id, 'CLAIMED').catch(() => undefined)
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

/** Aucune limite d'imports par défaut : le solde de drops du vendeur est la seule borne, et c'est son choix. */

const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Les imports réussis aujourd'hui, lus au journal (liens reçus ET gagnants du jour). */
function importesAujourdhui(journal, maintenant = new Date()) {
  return journal.filter((e) => e.type === 'import' && (e.resultat === 'en_file' || e.resultat === 'importe') && jourLocal(new Date(e.at)) === jourLocal(maintenant)).length
}

function plafondImports(config = {}) {
  const voulu = Number(config.plafondImports)
  return Number.isFinite(voulu) && voulu > 0 ? Math.floor(voulu) : Infinity // facultatif : vide = illimité
}

/**
 * L'import groupé de la liste du jour : chaque adresse devient une annonce, mise
 * en file sur les plateformes activées. S'arrête au plafond du jour (protège le
 * solde de drops) ou net si le solde est vide.
 *
 * @returns {Promise<{jour: string|null, lus: number, importes: number, echecs: number, sansSolde: boolean, plafondAtteint: boolean, resultats: object[]}>}
 */
async function importGroupe({ api, plateformes = [], reseaux = false, plafond, dejaFaits = 0, margeMin = 20, essais, pauseEssaiMs, dormir, surProduit = () => {} }) {
  const restant = Math.max(0, plafond - dejaFaits)
  const bilan = { jour: null, lus: 0, importes: 0, echecs: 0, sansSolde: false, plafondAtteint: restant === 0, resultats: [] }
  if (restant === 0) return bilan
  const liste = await api.gagnants({ margeMin, max: Math.min(restant, 1000) })
  bilan.jour = liste.jour
  bilan.lus = (liste.produits || []).length
  for (const produit of liste.produits || []) {
    if (bilan.importes >= restant) {
      bilan.plafondAtteint = true
      break
    }
    const r = await traiterLien({ api, lien: { url: produit.url }, plateformes, reseaux, essais, pauseEssaiMs, dormir })
    surProduit(produit, r)
    bilan.resultats.push({ url: produit.url, statut: r.statut })
    if (r.statut === 'sans_solde') {
      bilan.sansSolde = true
      break
    }
    if (r.statut === 'echec') bilan.echecs++
    else bilan.importes++
  }
  if (bilan.importes >= restant) bilan.plafondAtteint = true
  return bilan
}

module.exports = { traiterLien, importGroupe, importesAujourdhui, plafondImports }
