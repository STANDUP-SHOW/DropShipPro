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

/** Optional: the Markdown RAYON report to the site (admin agent key). */
async function envoyerAuSite({ apiBase, cle, markdown, fetchImpl = fetch }) {
  const rep = await fetchImpl(`${apiBase.replace(/\/$/, '')}/api/agent/market-reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })
  const texte = await rep.text()
  if (!rep.ok) throw new Error(`Le site a refusé le rapport (${rep.status}) : ${texte.slice(0, 200)}`)
  return texte
}

module.exports = { cheminsRapport, ecrireRapport, rapportExiste, ecrireDiagnostic, envoyerAuSite }
