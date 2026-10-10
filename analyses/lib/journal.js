'use strict'
/** One JSON line per event, one file per day, in <depot>/journaux. */
const fs = require('node:fs')
const path = require('node:path')
const { jourLocal } = require('./chemins')

function creerJournal(racine) {
  const dossier = path.join(racine, 'journaux')
  function ecrire(niveau, message, extra) {
    const ligne = JSON.stringify({ t: new Date().toISOString(), niveau, message, ...(extra || {}) })
    try {
      fs.mkdirSync(dossier, { recursive: true })
      fs.appendFileSync(path.join(dossier, `${jourLocal()}.jsonl`), ligne + '\n')
    } catch {
      /* the journal must never break a run */
    }
    return ligne
  }
  function lire(n = 200) {
    try {
      const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.jsonl')).sort().slice(-3)
      const lignes = []
      for (const f of fichiers) lignes.push(...fs.readFileSync(path.join(dossier, f), 'utf8').split('\n').filter(Boolean))
      return lignes.slice(-n).map((l) => {
        try { return JSON.parse(l) } catch { return { t: '', niveau: 'info', message: l } }
      })
    } catch {
      return []
    }
  }
  return { info: (m, e) => ecrire('info', m, e), erreur: (m, e) => ecrire('erreur', m, e), lire }
}

module.exports = { creerJournal }
