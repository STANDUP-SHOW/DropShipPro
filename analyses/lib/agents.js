'use strict'
/** The 24 categories x 7 themes (agents.json) and the rotation of the day. */
const fs = require('node:fs')
const path = require('node:path')

function charger(fichier = path.join(__dirname, '..', 'data', 'agents.json')) {
  return JSON.parse(fs.readFileSync(fichier, 'utf8'))
}

/** Day of the year, 1..366, from a YYYY-MM-DD string (UTC arithmetic: no DST drift). */
function jourDeLAnnee(date) {
  const [a, m, j] = date.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(a, 0, 0)) / 864e5)
}

/** theme_du_jour = themes[(jour_de_l_annee - 1) % 7] — same for both agents of a category. */
function themeDuJour(categorie, date) {
  return categorie.themes[(jourDeLAnnee(date) - 1) % categorie.themes.length]
}

function rayonsDuJour(agents, date) {
  return agents.categories.map((c) => {
    const t = themeDuJour(c, date)
    return { categorie: c.id, libelleCategorie: c.nom, theme: t.id, libelleTheme: t.nom, date }
  })
}

/**
 * The rayons Max chose for the night. `ids` null (never set) = all of them;
 * a list = only those, in the order of the rotation, unknown ids ignored.
 */
function choisirRayons(rayons, ids) {
  if (!Array.isArray(ids)) return rayons
  const voulus = new Set(ids)
  return rayons.filter((r) => voulus.has(r.categorie))
}

module.exports = { charger, jourDeLAnnee, themeDuJour, rayonsDuJour, choisirRayons }
