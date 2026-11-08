'use strict'
/**
 * « Connecter avec Google » for the Synthèses AIMARKET screen (08/11/2026).
 *
 * Google refuses its sign-in inside an Electron window, and pretending to be another browser is out of the
 * question. So KANTIX opens the site's /connexion-desktop page in Max's own browser (app=kantix); once he is
 * signed in there (Google or password), the page hands a two-minute single-use code back through
 * kantix://connexion?code=…&etat=…. KANTIX trades the code for a session token, reads the account's e-mail
 * with it, and drops the token at once: only the e-mail is kept, to name the account that receives the
 * winners. Nothing here sees a password.
 */
const crypto = require('crypto')

const PROTOCOLE = 'kantix'
const SITE = 'https://www.drop-shipper.fr'
const DUREE_MS = 3 * 60 * 1000

const nouvelEtat = () => crypto.randomBytes(24).toString('base64url')

function lienConnexion(etat, site = SITE) {
  return `${site.replace(/\/$/, '')}/connexion-desktop?${new URLSearchParams({ etat, app: PROTOCOLE })}`
}

/** The kantix:// address among a process argv (Windows passes it to the second instance). */
function adresseDansArgv(argv) {
  return (argv || []).find((a) => typeof a === 'string' && a.toLowerCase().startsWith(`${PROTOCOLE}://`)) || null
}

/** { code, etat } from kantix://connexion?…, or null when it is anything else. */
function lireRetour(adresse) {
  let u
  try { u = new URL(adresse) } catch { return null }
  if (u.protocol !== `${PROTOCOLE}:` || u.hostname !== 'connexion') return null
  const code = u.searchParams.get('code') || ''
  const etat = u.searchParams.get('etat') || ''
  if (!/^[0-9a-f]{64}$/.test(code) || !/^[A-Za-z0-9_-]{16,128}$/.test(etat)) return null
  return { code, etat }
}

async function lireJson(rep) {
  const texte = await rep.text()
  try { return JSON.parse(texte) } catch { return { error: texte.slice(0, 160) } }
}

/** Code → session token → e-mail of the account. The token is never returned nor kept. */
async function emailDuCompte({ apiBase, code, etat, fetchImpl = fetch }) {
  const base = apiBase.replace(/\/$/, '')
  const r1 = await fetchImpl(`${base}/api/desktop/echange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, etat }) })
  const d1 = await lireJson(r1)
  if (!r1.ok || !d1.token) throw new Error(d1.error || `Connexion refusée par le site (${r1.status}).`)
  const r2 = await fetchImpl(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${d1.token}` } })
  const d2 = await lireJson(r2)
  if (!r2.ok || typeof d2.email !== 'string') throw new Error(d2.error || `Compte illisible (${r2.status}).`)
  return { email: d2.email.trim().toLowerCase(), boutique: d2.shopName || null }
}

/**
 * One sign-in at a time: attendre() opens the page and waits for the kantix:// return (or the timeout);
 * recevoir(adresse) is called by the main process when Windows hands the address over.
 */
function creerAttente({ ouvrir, apiBase, fetchImpl, dureeMs = DUREE_MS }) {
  let enCours = null
  return {
    attendre() {
      if (enCours) enCours.rejeter(new Error('Connexion remplacée par une nouvelle demande.'))
      const etat = nouvelEtat()
      return new Promise((resoudre, rejeter) => {
        const minuteur = setTimeout(() => { enCours = null; rejeter(new Error('Pas de retour du navigateur après 3 minutes : relancez « Connecter avec Google ».')) }, dureeMs)
        enCours = {
          etat,
          resoudre: (v) => { clearTimeout(minuteur); enCours = null; resoudre(v) },
          rejeter: (e) => { clearTimeout(minuteur); enCours = null; rejeter(e) },
        }
        Promise.resolve(ouvrir(lienConnexion(etat))).catch((e) => enCours && enCours.rejeter(e))
      })
    },
    async recevoir(adresse) {
      const r = lireRetour(adresse)
      if (!r || !enCours) return false
      if (r.etat !== enCours.etat) return false
      const attente = enCours
      try { attente.resoudre(await emailDuCompte({ apiBase: apiBase(), code: r.code, etat: r.etat, fetchImpl })) } catch (e) { attente.rejeter(e) }
      return true
    },
  }
}

module.exports = { PROTOCOLE, SITE, nouvelEtat, lienConnexion, adresseDansArgv, lireRetour, emailDuCompte, creerAttente }
