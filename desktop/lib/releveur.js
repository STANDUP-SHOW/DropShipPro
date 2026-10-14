'use strict'
/**
 * Le relevé d'une fiche fournisseur dans le navigateur interne.
 *
 * Les scripts de l'extension Chrome (backend/extension/content, copiés dans
 * extraction/ à la construction) tournent ici tels quels, dans un monde isolé de
 * la page, avec une petite doublure de `chrome.*` : c'est le même relevé que
 * « Importer » dans la file de l'extension, sans réécrire une ligne de lecture.
 *
 * La fenêtre est cachée et prend la session du vendeur chez ce fournisseur
 * (`persist:fournisseur-<hôte>`, la même que la préparation des commandes) : s'il
 * s'y est connecté une fois, la fiche s'ouvre comme chez lui.
 */
const fs = require('node:fs')
const path = require('node:path')
const { BrowserWindow } = require('electron')
const plafonds = require('./plafonds')

const MONDE = 1207
const DOSSIER = path.join(__dirname, '..', 'extraction')
const SCRIPTS = ['config.js', 'fill-helpers.js', 'image-scan.js', 'adapters.js', 'photo-preselect.js', 'capture.js']
const SCRIPT_PAGE = 'aliexpress-sku.js'

const partitionDe = (hote) => `persist:fournisseur-${String(hote).toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '')}`

/** chrome.* as the content scripts use it: storage (button muted), and the message the side panel sends. */
const DOUBLURE = `
window.__dspEcouteurs = [];
window.chrome = {
  storage: { local: {
    get: async (cle) => (cle === 'mutedSites' ? { mutedSites: [location.origin] } : {}),
    set: async () => {}, remove: async () => {},
  } },
  runtime: {
    onMessage: { addListener: (f) => window.__dspEcouteurs.push(f) },
    sendMessage: async () => { throw new Error('Pas de service worker dans le navigateur interne') },
  },
};
true;`

const LANCER = `
window.__dspResultat = null;
(() => {
  const f = window.__dspEcouteurs[window.__dspEcouteurs.length - 1];
  if (!f) { window.__dspResultat = { ok: false, error: 'Lecture de la fiche non chargée' }; return; }
  f({ type: 'dsp-relever-pour-lot' }, null, (r) => { window.__dspResultat = r || { ok: false, error: 'Page muette' }; });
})();
true;`

function lire(nom) {
  return fs.readFileSync(path.join(DOSSIER, nom), 'utf8')
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

function charger(win, url, delai) {
  return new Promise((resolve, reject) => {
    const fin = setTimeout(() => reject(new Error("La page n'a pas fini de charger.")), delai)
    win.webContents.once('did-finish-load', () => {
      clearTimeout(fin)
      resolve()
    })
    win.webContents.once('did-fail-load', (_e, code, description, _u, principal) => {
      if (!principal) return
      clearTimeout(fin)
      reject(new Error(`Page injoignable (${description || code}).`))
    })
    win.loadURL(url).catch(() => undefined)
  })
}

/** Reads one product page; `{ ok, payload }`, `{ bloque, raison }` or `{ ok: false, raison }`. */
async function relever(url, { delaiChargement = 45_000, delaiReleve = 90_000 } = {}) {
  const hote = new URL(url).hostname
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    paintWhenInitiallyHidden: true,
    webPreferences: { partition: partitionDe(hote), sandbox: true, contextIsolation: true, backgroundThrottling: false },
  })
  try {
    await charger(win, url, delaiChargement)
    // Le prix et les options des sites en JavaScript arrivent après le chargement.
    await pause(2500)
    const texte = await win.webContents.executeJavaScript('document.body ? document.body.innerText.slice(0, 4000) : ""', true)
    const b = plafonds.detecterBlocage({ url: win.webContents.getURL(), titre: win.getTitle(), texte })
    if (b.bloque) return { bloque: true, raison: `vérification affichée (« ${b.indice} »)` }

    await win.webContents.executeJavaScript(lire(SCRIPT_PAGE), true).catch(() => undefined)
    await win.webContents.executeJavaScriptInIsolatedWorld(MONDE, [{ code: DOUBLURE }, ...SCRIPTS.map((nom) => ({ code: lire(nom), url: `dsp://extraction/${nom}` })), { code: LANCER }])

    const fin = Date.now() + delaiReleve
    while (Date.now() < fin) {
      await pause(1000)
      const r = await win.webContents.executeJavaScriptInIsolatedWorld(MONDE, [{ code: 'window.__dspResultat' }])
      if (r) return r.ok ? { ok: true, payload: r.payload } : { ok: false, raison: r.error || 'Relevé impossible' }
    }
    return { ok: false, raison: 'La fiche ne s’est pas laissée lire à temps.' }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

module.exports = { relever, partitionDe, SCRIPTS, SCRIPT_PAGE, DOSSIER }
