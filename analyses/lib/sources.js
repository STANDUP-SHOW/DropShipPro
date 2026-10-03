'use strict'
/**
 * Data-site sources (Ads Libraries, trend sites…) that Max adds himself.
 *
 * Each source = one persistent browser partition (`persist:source-<id>`), where
 * Max logs in HIMSELF, once. Nothing here reads or stores a password.
 *
 * "Never disconnected" is honest only up to what the site allows: the app keeps
 * the profile on disk and revisits a light page on a fixed cadence, detects the
 * moment a session is gone and tells Max. He logs in again himself.
 *
 * No anti-bot evasion: normal browser, fixed intervals, no fake profile, no
 * captcha solving. The first captcha or block stops the source for the night.
 */

function identifiant(nom) {
  return String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'source'
}

function partition(source) {
  return `persist:source-${source.id}`
}

/** Validates and completes a source typed in the UI. */
function normaliser(brut, existantes = []) {
  const nom = String(brut.nom || '').trim()
  if (!nom) throw new Error('Donnez un nom à la source.')
  let urlConnexion
  try {
    urlConnexion = new URL(String(brut.urlConnexion || '').trim())
    if (!/^https?:$/.test(urlConnexion.protocol)) throw new Error('x')
  } catch {
    throw new Error('Adresse de connexion invalide (https://…).')
  }
  let id = identifiant(brut.id || nom)
  let n = 2
  while (existantes.some((s) => s.id === id && s.id !== brut.id)) id = `${identifiant(nom)}-${n++}`
  const pages = (Array.isArray(brut.pages) ? brut.pages : String(brut.pages || '').split('\n'))
    .map((p) => String(p).trim()).filter(Boolean)
  for (const p of pages) {
    try { new URL(p) } catch { throw new Error(`Page à relever invalide : ${p}`) }
  }
  return {
    id,
    nom,
    urlConnexion: urlConnexion.href,
    // Pages read each night for the analyses (e.g. a saved search of an Ads Library).
    pages,
    // Optional text that proves "logged out" on this site, in addition to the generic signs.
    texteDeconnecte: String(brut.texteDeconnecte || '').trim(),
    plafondPagesParNuit: Math.max(1, Math.min(60, Number(brut.plafondPagesParNuit) || 10)),
    actif: brut.actif !== false,
  }
}

const MOTS_CONNEXION = /(login|log-in|signin|sign-in|connexion|identifier|authenticate|auth\/|account\/login|checkpoint)/i
const MOTS_BLOCAGE = /(captcha|verify you are human|vérif(iez|ication) (que )?vous (êtes|etes)|unusual traffic|trafic inhabituel|access denied|too many requests|temporarily blocked)/i

/**
 * Reads the signs left by a page, no network involved.
 * @param {{url:string, texte:string, champMotDePasse:boolean}} page
 * @returns {{etat:'connecte'|'deconnecte'|'bloque', raison:string}}
 */
function etatSession(source, page) {
  if (MOTS_BLOCAGE.test(page.texte || '') || MOTS_BLOCAGE.test(page.url || '')) {
    return { etat: 'bloque', raison: 'captcha ou vérification détecté — la source est arrêtée, reprenez la main' }
  }
  if (source.texteDeconnecte && (page.texte || '').toLowerCase().includes(source.texteDeconnecte.toLowerCase())) {
    return { etat: 'deconnecte', raison: `texte « ${source.texteDeconnecte} » présent` }
  }
  if (page.champMotDePasse) return { etat: 'deconnecte', raison: 'champ mot de passe affiché' }
  try {
    const u = new URL(page.url)
    const conn = new URL(source.urlConnexion)
    if (MOTS_CONNEXION.test(u.pathname) && u.pathname !== conn.pathname) return { etat: 'deconnecte', raison: 'redirigé vers une page de connexion' }
  } catch { /* ignore */ }
  return { etat: 'connecte', raison: 'aucun signe de déconnexion' }
}

module.exports = { identifiant, partition, normaliser, etatSession }
