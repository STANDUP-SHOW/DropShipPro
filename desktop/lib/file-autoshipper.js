'use strict'
/**
 * La file AUTO-SHIPPER : les produits que seul un navigateur lit (Temu,
 * AliExpress, Shein…), mis en file et déjà payés par le pilote du site.
 *
 * À chaque passage (intervalle fixe d'une minute, dans main.js), l'application
 * prend quelques lignes, ouvre chaque fiche dans son navigateur interne (la
 * session du vendeur pour ce fournisseur), la relève comme le ferait l'extension
 * et l'envoie au serveur, qui importe, contrôle et publie.
 *
 * Mêmes règles que la publication automatique (CLAUDE.md, 29/09/2026) : rythme
 * fixe, navigateur normal, aucune évasion. Au premier mur anti-robot ou écran de
 * connexion, le fournisseur est mis en pause une heure et la ligne remise en
 * attente ; le vendeur peut ouvrir la page lui-même. Un refus net (page qui
 * n'est pas une fiche) rend les drops côté serveur.
 */
const PAR_PASSAGE = 5
const ESPACEMENT_MS = 15_000
const PAUSE_BLOCAGE_MS = 3600_000

const hoteDe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Un passage. `relever(url)` rend `{ ok: true, payload }`, `{ bloque: true, raison }`
 * ou `{ ok: false, raison }` ; `pauses` (hôte → échéance) survit d'un passage à l'autre.
 */
async function passageFile({ api, relever, pauses = new Map(), attendre = (ms) => new Promise((r) => setTimeout(r, ms)), maintenant = () => Date.now() }) {
  const bilan = { importes: 0, refuses: 0, bloques: 0, erreur: null, details: [] }
  let lignes
  try {
    lignes = await api.fileAutoShipper()
  } catch (err) {
    bilan.erreur = err.message
    return bilan
  }
  const aFaire = lignes.filter((l) => {
    const h = hoteDe(l.url)
    return h && !(pauses.get(h) > maintenant())
  }).slice(0, PAR_PASSAGE)

  for (const [i, ligne] of aFaire.entries()) {
    const hote = hoteDe(ligne.url)
    if (pauses.get(hote) > maintenant()) continue
    if (i > 0) await attendre(ESPACEMENT_MS)
    try {
      await api.releveFile(ligne.id)
    } catch {
      continue // déjà prise ou rendue ailleurs
    }
    let r
    try {
      r = await relever(ligne.url)
    } catch (err) {
      r = { ok: false, raison: err.message || 'Relevé impossible' }
    }
    if (r.bloque) {
      pauses.set(hote, maintenant() + PAUSE_BLOCAGE_MS)
      bilan.bloques++
      bilan.details.push({ id: ligne.id, hote, statut: 'bloque', raison: r.raison })
      await api.echecFile(ligne.id, `Bloqué sur ${hote} : ${r.raison}. Nouvel essai dans une heure.`, true).catch(() => undefined)
      continue
    }
    if (!r.ok) {
      bilan.refuses++
      bilan.details.push({ id: ligne.id, hote, statut: 'refuse', raison: r.raison })
      await api.echecFile(ligne.id, String(r.raison || 'Relevé impossible').slice(0, 300), false).catch(() => undefined)
      continue
    }
    try {
      await api.captureFile(ligne.id, r.payload)
      bilan.importes++
      bilan.details.push({ id: ligne.id, hote, statut: 'importe' })
    } catch (err) {
      // Une erreur réseau n'a peut-être pas atteint le serveur : la ligne y est rendue après 10 min « en cours ».
      bilan.refuses++
      bilan.details.push({ id: ligne.id, hote, statut: 'refuse', raison: err.message })
    }
  }
  return bilan
}

module.exports = { PAR_PASSAGE, ESPACEMENT_MS, PAUSE_BLOCAGE_MS, hoteDe, passageFile }
