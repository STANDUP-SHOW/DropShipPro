'use strict'
/**
 * The Poste is the general administrator of drop-shipper.fr — for every user, for
 * Max only (decision of 04/10/2026). There is no administrator ACCOUNT on the site.
 *
 * The Poste makes its own admin key (`dsp_adm_…`, 256 random bits), keeps it in the
 * Windows vault and never shows it. The site knows only its SHA-256 fingerprint,
 * which Max pastes once in the Railway variable POSTE_ADMIN_SHA256. A leak of the
 * repo, the database or Railway therefore does not give the key.
 */
const crypto = require('node:crypto')

const PREFIXE = 'dsp_adm_'

function fabriquerCle() {
  return `${PREFIXE}${crypto.randomBytes(32).toString('base64url')}`
}

/** What Max pastes in Railway. Not a secret by itself: it cannot be turned back into the key. */
function empreinte(cle) {
  return crypto.createHash('sha256').update(cle).digest('hex')
}

/** Human message for a refusal of the admin routes, so Max knows which side to fix. */
function expliquer(statut, raison) {
  if (statut === 503) return `${raison} Posez l’empreinte affichée dans l’onglet Administration dans la variable Railway POSTE_ADMIN_SHA256, puis attendez le redémarrage du site.`
  if (statut === 401) return `${raison} L’empreinte posée dans Railway n’est pas celle de la clé de ce Poste : recopiez celle de l’onglet Administration.`
  return raison
}

/** One call to /api/admin with the Poste's key. Throws a readable error, never returns an error body as data. */
async function appelerAdmin({ apiBase, cle, chemin, corps, fetchImpl = fetch }) {
  const rep = await fetchImpl(`${apiBase.replace(/\/$/, '')}/api/admin${chemin}`, {
    method: corps === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await rep.text()
  let donnees = null
  try { donnees = JSON.parse(texte) } catch { /* handled below */ }
  if (!rep.ok) {
    const raison = (donnees && (donnees.error || donnees.message)) || texte.slice(0, 200) || `HTTP ${rep.status}`
    throw new Error(`Le site a refusé (${rep.status}) : ${expliquer(rep.status, raison)}`)
  }
  if (!donnees || typeof donnees !== 'object') throw new Error(`Réponse du site illisible : ${texte.slice(0, 120)}`)
  return donnees
}

module.exports = { PREFIXE, fabriquerCle, empreinte, appelerAdmin, expliquer }
