'use strict'
/**
 * The deposit folder: rapports/AAAA-MM-JJ/<categorie>/<theme>.json (+ .rayon.md,
 * .marketing.md). A re-run on the same day replaces the report (an agent that
 * passes again at 8h corrects its report, it does not publish two).
 */
const fs = require('node:fs')
const path = require('node:path')

function cheminsRapport(racine, date, categorie, theme) {
  const dossier = path.join(racine, 'rapports', date, categorie)
  return {
    dossier,
    json: path.join(dossier, `${theme}.json`),
    rayon: path.join(dossier, `${theme}.rayon.md`),
    marketing: path.join(dossier, `${theme}.marketing.md`),
  }
}

/** Written to a temp file then renamed: a power cut never leaves half a report. */
function ecrireAtomique(chemin, contenu) {
  const tmp = `${chemin}.tmp`
  fs.writeFileSync(tmp, contenu)
  fs.renameSync(tmp, chemin)
}

function ecrireRapport(racine, { date, categorie, theme, json, rayonMd, marketingMd }) {
  const c = cheminsRapport(racine, date, categorie, theme)
  fs.mkdirSync(c.dossier, { recursive: true })
  ecrireAtomique(c.json, JSON.stringify(json, null, 2))
  ecrireAtomique(c.rayon, rayonMd)
  ecrireAtomique(c.marketing, marketingMd)
  return c
}

function rapportExiste(racine, date, categorie, theme) {
  return fs.existsSync(cheminsRapport(racine, date, categorie, theme).json)
}

/** Raw API answers / failed reports, for a diagnosis in thirty seconds. */
function ecrireDiagnostic(racine, nom, contenu) {
  const dossier = path.join(racine, 'diagnostics')
  fs.mkdirSync(dossier, { recursive: true })
  const f = path.join(dossier, nom)
  fs.writeFileSync(f, typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 2))
  return f
}

/**
 * Sends a whole report (the MarketSpy JSON) to the site. ONE call files both the
 * RAYON report (analysis + products) and the MARKETING report (prompts, trends)
 * where the site's screens read them. The internal `poste` block (status,
 * usage) stays on this PC.
 */
async function envoyerRapportAuSite({ apiBase, cle, rapport, fetchImpl = fetch }) {
  const { poste, ...pourLeSite } = rapport
  const rep = await fetchImpl(`${apiBase.replace(/\/$/, '')}/api/agent/rapports-poste`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rapport: pourLeSite }),
  })
  const texte = await rep.text()
  let corps = null
  try { corps = JSON.parse(texte) } catch { /* handled below */ }
  if (!rep.ok) {
    const raison = (corps && (corps.error || corps.message)) || texte.slice(0, 200) || `HTTP ${rep.status}`
    const aide = rep.status === 401 || rep.status === 403 ? ' (la clé d’agent doit être celle du compte administrateur)' : ''
    throw new Error(`Le site a refusé le rapport (${rep.status}) : ${raison}${aide}`)
  }
  if (!corps || corps.ok !== true) throw new Error(`Réponse du site illisible : ${texte.slice(0, 120)}`)
  return corps
}

/** Sidecar next to the report: proof the site answered 201, tied to THAT version of the report. */
function cheminEnvoi(racine, date, categorie, theme) {
  const c = cheminsRapport(racine, date, categorie, theme)
  return path.join(c.dossier, `${theme}.envoi.json`)
}

function marquerEnvoye(racine, date, categorie, theme, { rapportEcritLe, reponse }) {
  ecrireAtomique(cheminEnvoi(racine, date, categorie, theme), JSON.stringify({ envoyeLe: new Date().toISOString(), rapportEcritLe, reponse }, null, 2))
}

/** The sent-state of a report: null if never sent, or if it was rewritten since (a re-run replaces it). */
function lireEnvoi(racine, date, categorie, theme) {
  try {
    const envoi = JSON.parse(fs.readFileSync(cheminEnvoi(racine, date, categorie, theme), 'utf8'))
    const rapport = JSON.parse(fs.readFileSync(cheminsRapport(racine, date, categorie, theme).json, 'utf8'))
    return rapport.poste && envoi.rapportEcritLe === rapport.poste.ecritLe ? envoi : null
  } catch {
    return null
  }
}

/** Validated reports (statut ok) of the last `jours` days that the site has not received yet. */
function rapportsAEnvoyer(racine, { jours = 7 } = {}) {
  const sortie = []
  let dates = []
  try { dates = fs.readdirSync(path.join(racine, 'rapports')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(0, jours) } catch { return sortie }
  for (const date of dates) {
    let categories = []
    try { categories = fs.readdirSync(path.join(racine, 'rapports', date)) } catch { continue }
    for (const categorie of categories) {
      let fichiers = []
      try { fichiers = fs.readdirSync(path.join(racine, 'rapports', date, categorie)).filter((f) => f.endsWith('.json') && !f.endsWith('.envoi.json')) } catch { continue }
      for (const f of fichiers) {
        const theme = f.replace(/\.json$/, '')
        let rapport
        try { rapport = JSON.parse(fs.readFileSync(path.join(racine, 'rapports', date, categorie, f), 'utf8')) } catch { continue }
        if (!rapport.poste || rapport.poste.statut !== 'ok') continue
        if (lireEnvoi(racine, date, categorie, theme)) continue
        sortie.push({ date, categorie, theme, rapport })
      }
    }
  }
  return sortie
}

module.exports = { cheminsRapport, ecrireRapport, rapportExiste, ecrireDiagnostic, envoyerRapportAuSite, marquerEnvoye, lireEnvoi, rapportsAEnvoyer }
