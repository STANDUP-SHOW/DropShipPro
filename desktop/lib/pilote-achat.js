'use strict'
/**
 * Le pilote réel des achats : une fenêtre Electron par fournisseur, dans la
 * session persistante du vendeur (`persist:fournisseur-<hôte>`), où il s'est
 * connecté lui-même une fois. La fenêtre RESTE OUVERTE à la fin : c'est là qu'il
 * relit et paie.
 *
 * Il pose des valeurs et clique, rien d'autre : pas de geste simulé, pas de délai
 * aléatoire, pas de contournement (CLAUDE.md, décision du 29/09/2026). Il ne
 * touche jamais un champ de carte (page.js ne remplit que l'adresse).
 */
const { BrowserWindow, shell } = require('electron')
const page = require('./page')
const { SIGNES_PAIEMENT } = require('./achats')
const file = require('./file')

function creerPiloteAchat({ attendreMs = 3000 } = {}) {
  let win = null
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const exec = (code) => win.webContents.executeJavaScript(code, true)
  const appel = (fonction, ...args) => exec(page.appelPage(fonction, ...args))
  const partitionDe = (hote) => `persist:fournisseur-${String(hote).toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '')}`

  return {
    async ouvrir(url, fournisseur) {
      const sure = file.adresseSure(url)
      if (!sure) throw new Error('adresse du fournisseur invalide')
      const hote = new URL(sure).hostname
      if (!win || win.isDestroyed()) {
        win = new BrowserWindow({ width: 1240, height: 880, title: `Commande chez ${fournisseur || hote}`, webPreferences: { partition: partitionDe(hote), contextIsolation: true, nodeIntegration: false, sandbox: true } })
        win.webContents.setWindowOpenHandler(({ url: u }) => {
          // Une boutique qui ouvre un onglet (avis, aide) : dans le navigateur du poste, jamais une fenêtre de plus ici.
          if (file.adresseSure(u)) shell.openExternal(u)
          return { action: 'deny' }
        })
      }
      win.focus()
      try {
        await win.loadURL(sure)
      } catch (err) {
        if (!/^https?:/.test(win.webContents.getURL())) throw err
      }
      await pause(attendreMs)
    },

    signes: () => appel(page.signesPage, { champs: SIGNES_PAIEMENT.champs, textes: SIGNES_PAIEMENT.textes.map((re) => re.source) }),
    cliquerTexte: (mots, interdits, exact) => appel(page.cliquerTexte, mots, interdits, Boolean(exact)),
    remplirAdresse: (champs) => appel(page.remplirAdresse, champs),

    fermer() {
      if (win && !win.isDestroyed()) win.close()
    },
  }
}

module.exports = { creerPiloteAchat }
