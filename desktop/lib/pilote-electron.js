'use strict'
/**
 * Le pilote réel : une fenêtre Electron dans la session du vendeur (partition
 * persistante), remplie par script.
 *
 * Il n'imite personne : il pose des valeurs dans des champs et clique, comme
 * l'extension le fait déjà. Pas de faux profil, pas de mouvement de souris
 * simulé, pas de délai aléatoire (CLAUDE.md, décision du 29/09/2026).
 *
 * **Jamais lancé contre une vraie page** (voir adaptateurs.js).
 */
const { BrowserWindow } = require('electron')
const { PLATEFORMES } = require('./plafonds')
const { ADAPTATEURS } = require('./adaptateurs')
const file = require('./file')

/** Le script posé dans la page : pose une valeur comme le ferait une saisie, pour que React la voie. */
const SCRIPT_CHAMP = `(function (selecteurs, valeur) {
  const el = selecteurs.map((s) => document.querySelector(s)).find(Boolean)
  if (!el) return false
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valeur)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})`

const SCRIPT_CLIC = `(function (selecteurs) {
  const el = selecteurs.map((s) => document.querySelector(s)).find(Boolean)
  if (!el || el.disabled) return false
  el.click()
  return true
})`

function creerPilote({ telecharger = fetch, attendreMs = 4000 } = {}) {
  let win = null
  let plateforme = null
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const exec = (code) => win.webContents.executeJavaScript(code, true)
  const appel = (script, ...args) => exec(`${script}(${args.map((a) => JSON.stringify(a)).join(',')})`)

  return {
    async ouvrir(id) {
      plateforme = id
      const p = PLATEFORMES[id]
      const a = ADAPTATEURS[id]
      if (!win || win.isDestroyed()) {
        win = new BrowserWindow({ width: 1200, height: 850, title: p.nom, webPreferences: { partition: p.partition, contextIsolation: true, nodeIntegration: false, sandbox: true } })
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      }
      await win.loadURL(a.formulaire)
      await pause(attendreMs) // le formulaire se monte après le chargement
    },

    async lirePage() {
      const texte = await exec('document.body ? document.body.innerText.slice(0, 4000) : ""')
      return { url: win.webContents.getURL(), titre: win.getTitle(), texte }
    },

    async remplir(annonce) {
      const a = ADAPTATEURS[plateforme]
      const rempli = []
      for (const [nom, valeur] of [['titre', annonce.title], ['description', annonce.description], ['prix', String(annonce.price)]]) {
        if (valeur && (await appel(SCRIPT_CHAMP, a.champs[nom], valeur))) rempli.push(nom)
      }
      if (annonce.images?.length && (await this._photos(annonce.images.slice(0, 10)))) rempli.push('photos')
      return { rempli }
    },

    /** Les photos : téléchargées, écrites en temp, posées sur le champ fichier par le protocole de débogage (le seul moyen de remplir un `<input type=file>`). */
    async _photos(urls) {
      const fs = require('node:fs')
      const os = require('node:os')
      const path = require('node:path')
      const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-photos-'))
      const fichiers = []
      for (const [i, url] of urls.entries()) {
        if (!file.adresseSure(url)) continue
        try {
          const r = await telecharger(url)
          if (!r.ok) continue
          const f = path.join(dossier, `photo-${i + 1}${/\.png(\?|$)/i.test(url) ? '.png' : '.jpg'}`)
          fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()))
          fichiers.push(f)
        } catch {
          /* une photo qui ne vient pas n'annule pas les autres */
        }
      }
      if (!fichiers.length) return false
      const dbg = win.webContents.debugger
      try {
        dbg.attach('1.3')
        const { root } = await dbg.sendCommand('DOM.getDocument')
        for (const sel of ADAPTATEURS[plateforme].photos) {
          const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: sel })
          if (nodeId) {
            await dbg.sendCommand('DOM.setFileInputFiles', { nodeId, files: fichiers })
            return true
          }
        }
        return false
      } finally {
        try {
          dbg.detach()
        } catch {
          /* déjà détaché */
        }
      }
    },

    async publier() {
      const a = ADAPTATEURS[plateforme]
      if (!(await appel(SCRIPT_CLIC, a.publier))) throw new Error('Bouton « Publier » introuvable ou désactivé')
      await pause(attendreMs)
      return { url: win.webContents.getURL() }
    },

    fermer() {
      if (win && !win.isDestroyed()) win.close()
    },
  }
}

module.exports = { creerPilote }
