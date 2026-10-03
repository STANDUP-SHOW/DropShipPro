'use strict'
/**
 * Reading the connected data sites. The browser itself is injected (`lire`), so
 * the logic is testable without Electron; `lecteurElectron` is the real one: a
 * hidden window on the source's persistent partition, one at a time, closed
 * right after the read (a weak PC without a GPU cannot afford idle windows).
 */
const fs = require('node:fs')
const path = require('node:path')
const { partition, etatSession } = require('./sources')

const PAUSE_ENTRE_PAGES_MS = 3000 // fixed interval, never random

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

function lecteurElectron({ BrowserWindow, delaiMs = 30000, rendu = 2500 }) {
  return async function lire(source, url) {
    const fen = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { partition: partition(source), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    })
    try {
      const charge = new Promise((resolve) => {
        fen.webContents.once('did-finish-load', resolve)
        fen.webContents.once('did-fail-load', (_e, code, desc) => resolve({ erreur: `${code} ${desc}` }))
      })
      fen.loadURL(url).catch(() => {})
      const fin = await Promise.race([charge, attendre(delaiMs).then(() => ({ erreur: 'délai dépassé' }))])
      if (fin && fin.erreur) return { url, urlFinale: fen.webContents.getURL() || url, texte: '', champMotDePasse: false, erreur: fin.erreur }
      await attendre(rendu) // let the page build itself in JavaScript
      const page = await fen.webContents.executeJavaScript(
        '({ texte: (document.body && document.body.innerText) || "", pw: !!document.querySelector("input[type=password]"), titre: document.title, url: location.href })',
      )
      return { url, urlFinale: page.url, titre: page.titre, texte: page.texte, champMotDePasse: page.pw }
    } finally {
      if (!fen.isDestroyed()) fen.destroy()
    }
  }
}

/**
 * Visits one light page of a source to keep its session alive and learn its state.
 * @returns {{etat, raison}}
 */
async function verifierSession(source, lire) {
  const page = await lire(source, source.pages[0] || source.urlConnexion)
  if (page.erreur) return { etat: 'injoignable', raison: page.erreur }
  return etatSession(source, { url: page.urlFinale, texte: page.texte, champMotDePasse: page.champMotDePasse })
}

/**
 * Reads the pages Max asked for, from each active, connected source.
 * Stops a source at the first block. Saves every reading under releves/.
 * @returns {{lectures: Array, etats: object}}
 */
async function releverSources({ sources, lire, racine, date, journal, pause = PAUSE_ENTRE_PAGES_MS }) {
  const lectures = []
  const etats = {}
  for (const s of sources.filter((x) => x.actif)) {
    const aLire = s.pages.slice(0, s.plafondPagesParNuit)
    if (!aLire.length) { etats[s.id] = { etat: 'sans_pages', raison: 'aucune page à relever' }; continue }
    let n = 0
    for (const url of aLire) {
      let page
      try {
        page = await lire(s, url)
      } catch (err) {
        etats[s.id] = { etat: 'injoignable', raison: String(err.message || err) }
        journal.erreur(`Source ${s.nom} : lecture impossible`, { url, raison: etats[s.id].raison })
        break
      }
      if (page.erreur) { etats[s.id] = { etat: 'injoignable', raison: page.erreur }; journal.erreur(`Source ${s.nom} : ${page.erreur}`, { url }); break }
      const e = etatSession(s, { url: page.urlFinale, texte: page.texte, champMotDePasse: page.champMotDePasse })
      etats[s.id] = e
      if (e.etat !== 'connecte') {
        journal.erreur(`Source ${s.nom} : ${e.etat} — ${e.raison}`, { url })
        break
      }
      n++
      const dossier = path.join(racine, 'releves', date, s.id)
      fs.mkdirSync(dossier, { recursive: true })
      fs.writeFileSync(
        path.join(dossier, `${String(n).padStart(3, '0')}.txt`),
        `URL: ${page.urlFinale || url}\nLu le: ${new Date().toISOString()}\nSource: ${s.nom}\n\n${page.texte}`,
      )
      lectures.push({ source: s.nom, url: page.urlFinale || url, texte: page.texte })
      if (n < aLire.length) await attendre(pause)
    }
    if (etats[s.id] && etats[s.id].etat === 'connecte') journal.info(`Source ${s.nom} : ${n} page(s) relevée(s)`)
  }
  return { lectures, etats }
}

module.exports = { lecteurElectron, verifierSession, releverSources }
