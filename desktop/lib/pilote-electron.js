'use strict'
/**
 * Le pilote réel : une fenêtre Electron dans la session du vendeur (partition
 * persistante), remplie par script.
 *
 * Il n'imite personne : il pose des valeurs dans des champs et clique, comme
 * l'extension le fait déjà. Pas de faux profil, pas de mouvement de souris
 * simulé, pas de délai aléatoire (CLAUDE.md, décision du 29/09/2026).
 *
 * Facebook : structure relevée sur la vraie page (voir adaptateurs.js) ; la
 * fenêtre Electron elle-même n'a pas encore publié une annonce réelle.
 */
const { BrowserWindow } = require('electron')
const { PLATEFORMES } = require('./plafonds')
const { ADAPTATEURS } = require('./adaptateurs')
const file = require('./file')
const page = require('./page')
const { choisirCategorie, choisirEtat, formaterPrix } = require('./choix')

function creerPilote({ telecharger = fetch, attendreMs = 4000 } = {}) {
  let win = null
  let plateforme = null
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const exec = (code) => win.webContents.executeJavaScript(code, true)
  const appel = (fonction, ...args) => exec(page.appelPage(fonction, ...args))
  const cible = (a, nom) => (a.libelles ? { libelles: a.libelles[nom] } : { selecteurs: a.champs[nom] })

  /** Une liste déroulante : lire ce que la page propose, choisir, cliquer. Faux si rien ne convient. */
  async function regler(liste, choisir) {
    const options = await appel(page.lireOptions, liste, attendreMs)
    const voulu = options ? choisir(options) : null
    if (!voulu || !(await appel(page.cliquerOption, liste, voulu))) return false
    await pause(1000) // la page redessine le formulaire après un choix
    return true
  }

  return {
    async ouvrir(id) {
      plateforme = id
      const p = PLATEFORMES[id]
      const a = ADAPTATEURS[id]
      if (!win || win.isDestroyed()) {
        win = new BrowserWindow({ width: 1200, height: 850, title: p.nom, webPreferences: { partition: p.partition, contextIsolation: true, nodeIntegration: false, sandbox: true } })
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      }
      try {
        await win.loadURL(a.formulaire)
      } catch (err) {
        // Une redirection (page de connexion, ERR_ABORTED) interrompt le chargement demandé sans que ce soit
        // une panne : la page est là, on la lit. Tout autre échec est un échec ordinaire, retenté.
        if (err.code !== 'ERR_ABORTED' && err.errno !== -3) throw new Error(String(err.message).replace(/ loading .*$/, ''))
      }
      await pause(attendreMs) // le formulaire se monte après le chargement
    },

    async lirePage() {
      const texte = await exec('document.body ? document.body.innerText.slice(0, 4000) : ""')
      const motDePasse = await exec('!!document.querySelector(\'input[type="password"]\')')
      return { url: win.webContents.getURL(), titre: win.getTitle(), texte, motDePasse }
    },

    async remplir(annonce) {
      const a = ADAPTATEURS[plateforme]
      const rempli = []
      const poser = async (nom, valeur) => {
        if (valeur && (await appel(page.poserValeur, cible(a, nom), valeur))) rempli.push(nom)
      }
      await poser('titre', annonce.title)
      await poser('prix', formaterPrix(annonce.price, a.prix))
      if (annonce.images?.length && (await this._photos(annonce.images.slice(0, 10)))) rempli.push('photos')
      // Catégorie et état avant la description : sur Facebook elle n'apparaît qu'une fois la catégorie choisie.
      if (a.categorie && (await regler(a.categorie, (options) => choisirCategorie(options, annonce, a.categorie.fourreTout)))) rempli.push('categorie')
      if (a.etat && (await regler(a.etat, (options) => choisirEtat(options, annonce.condition)))) rempli.push('etat')
      await poser('description', annonce.description)
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

    /**
     * Un seul clic sur « Publier », jamais deux. Les écrans intermédiaires (« Suivant » sur Facebook) sont
     * passés d'abord ; un bouton grisé est attendu (les photos finissent de monter), puis c'est un échec ordinaire.
     */
    async publier() {
      const a = ADAPTATEURS[plateforme]
      const attendre = async (selecteurs) => {
        let vu = 'absent'
        for (let i = 0; i < 10; i++) {
          vu = await appel(page.cliquerBouton, selecteurs)
          if (vu !== 'inactif') return vu
          await pause(attendreMs / 2)
        }
        return vu
      }
      for (let etape = 0; etape < 4 && a.etapes; etape++) {
        const vu = await attendre(a.etapes)
        if (vu === 'absent') break
        if (vu === 'inactif') throw new Error('Bouton « Suivant » resté grisé : le formulaire est incomplet')
        await pause(attendreMs / 2)
      }
      const vu = await attendre(a.publier)
      if (vu !== 'clic') throw new Error('Bouton « Publier » introuvable ou désactivé')
      await pause(attendreMs)
      return { url: win.webContents.getURL() }
    },

    fermer() {
      if (win && !win.isDestroyed()) win.close()
    },
  }
}

module.exports = { creerPilote }
