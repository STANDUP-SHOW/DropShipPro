'use strict'
/**
 * The night: credit check first (1 Serper credit + 4 Claude tokens), then the
 * rayons one at a time (never in parallel: dozens of pages each would saturate
 * the network and draw refusals from the search engines).
 *
 * - A refused credit check cancels the night before anything is spent.
 * - A provider failure mid-night stops it (it is systemic: the next rayon would
 *   burn the same quota against the same wall); any other failure only loses
 *   that rayon.
 * - A rayon already written and valid today is skipped: after a power cut the
 *   night resumes where it stopped.
 */
const fs = require('node:fs')
const { ErreurFournisseur } = require('./erreurs')
const depot = require('./depot')

async function controleCredits({ serper, claude }) {
  const res = { serper: { ok: true, message: 'ok' }, claude: { ok: true, message: 'ok' } }
  try {
    await serper.chercher('test', { num: 1 })
  } catch (err) {
    res.serper = { ok: false, message: String(err.message || err) }
  }
  try {
    await claude.message({ utilisateur: 'ok', maxTokens: 4, effort: 'low', flux: false })
  } catch (err) {
    res.claude = { ok: false, message: String(err.message || err) }
  }
  res.ok = res.serper.ok && res.claude.ok
  return res
}

const PREFIXE_ANNULATION = 'NUIT ANNULEE AVANT DE DEPENSER QUOI QUE CE SOIT'

/** Throws with the provider's own message when a credit check failed. */
function verdict(res) {
  if (res.ok) return
  const l = []
  if (!res.serper.ok) l.push(res.serper.message)
  if (!res.claude.ok) l.push(res.claude.message)
  throw new Error(`${PREFIXE_ANNULATION} — ${l.join(' | ')}`)
}

function rapportValide(racine, date, categorie, theme) {
  try {
    const j = JSON.parse(fs.readFileSync(depot.cheminsRapport(racine, date, categorie, theme).json, 'utf8'))
    return Boolean(j.poste && j.poste.statut === 'ok')
  } catch {
    return false
  }
}

/**
 * @param {object} p
 * @param {Array} p.rayons  from agents.rayonsDuJour
 * @param {(rayon)=>Promise<object>} p.executer
 * @param {()=>Promise<object>} p.controle  credit check
 * @param {{demande:boolean}} p.arret  set .demande = true to stop after the current rayon
 */
async function lancerNuit({ rayons, executer, controle, journal, racine, date, arret = { demande: false }, surProgres = () => {}, sauter = true }) {
  const bilan = { date, attendus: rayons.length, ok: 0, aRevoir: 0, erreurs: [], ignores: 0, arretee: null, annulee: null }
  journal.info(`Nuit ${date} : contrôle des crédits`)
  const res = await controle()
  try {
    verdict(res)
  } catch (err) {
    bilan.annulee = String(err.message)
    journal.erreur(bilan.annulee)
    surProgres({ ...bilan, fin: true })
    return bilan
  }
  journal.info(`Nuit ${date} : crédits confirmés, ${rayons.length} rayons`)

  for (let i = 0; i < rayons.length; i++) {
    const r = rayons[i]
    if (arret.demande) {
      bilan.arretee = 'arrêt demandé'
      break
    }
    if (sauter && rapportValide(racine, date, r.categorie, r.theme)) {
      bilan.ignores++
      continue
    }
    surProgres({ ...bilan, courant: `${r.categorie}/${r.theme}`, index: i + 1 })
    try {
      const out = await executer(r)
      if (out.statut === 'ok') bilan.ok++
      else bilan.aRevoir++
    } catch (err) {
      const msg = String((err && err.message) || err)
      bilan.erreurs.push({ rayon: `${r.categorie}/${r.theme}`, message: msg })
      journal.erreur(`${r.categorie}/${r.theme} : échec`, { raison: msg })
      if (err instanceof ErreurFournisseur) {
        bilan.arretee = `fournisseur en échec : ${msg}`
        break
      }
    }
  }
  journal.info(`Nuit ${date} terminée`, { ok: bilan.ok, aRevoir: bilan.aRevoir, erreurs: bilan.erreurs.length, ignores: bilan.ignores, arretee: bilan.arretee })
  surProgres({ ...bilan, fin: true })
  return bilan
}

module.exports = { controleCredits, verdict, lancerNuit, rapportValide, PREFIXE_ANNULATION }
