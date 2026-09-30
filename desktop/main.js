'use strict'
/**
 * DropShipper Desktop — le processus principal.
 *
 * - Une fenêtre de contrôle (renderer/), sans accès Node : tout passe par le
 *   preload et des canaux IPC nommés.
 * - Une session par plateforme (Vinted, Leboncoin, Facebook) dans une
 *   « partition » persistante : le vendeur s'y connecte LUI-MÊME, une fois, et
 *   ses cookies restent dans ce profil local. Ses identifiants ne passent
 *   jamais chez nous et ne sont jamais lus ici.
 * - La file de travail (liens partagés) sondée à intervalle fixe.
 * - Une surveillance des blocages sur chaque fenêtre de session : au premier
 *   captcha ou avertissement, la plateforme est arrêtée (lib/plafonds.js) et
 *   le vendeur alerté. Aucune évasion, aucun hasard, aucun faux profil.
 */
const path = require('node:path')
const { app, BrowserWindow, ipcMain, safeStorage, shell, Notification } = require('electron')
const config = require('./lib/config')
const { client } = require('./lib/api')
const file = require('./lib/file')
const plafonds = require('./lib/plafonds')
const { traiter } = require('./lib/executeur')
const { creerPilote } = require('./lib/pilote-electron')

let fenetre = null
let cfg = null
let etat = null
let api = null
const dejaVus = new Set()
let liens = []
let annonces = []
const pilotes = new Map()
let occupe = false
let derniereErreur = null
let minuteur = null
const fenetresSession = new Map()

const dossier = () => app.getPath('userData')

function chargerTout() {
  cfg = config.charger(dossier())
  etat = plafonds.lireEtat(dossier())
  const cle = config.lireCle(cfg, safeStorage)
  api = cle ? client({ apiBase: cfg.apiBase, cle }) : null
}

function envoyer(canal, donnees) {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send(canal, donnees)
}

function instantane() {
  return {
    connecte: !!api,
    apiBase: cfg.apiBase,
    liens,
    annonces,
    erreur: derniereErreur,
    plateformes: Object.entries(plafonds.PLATEFORMES).map(([id, p]) => ({
      id,
      nom: p.nom,
      accord: cfg.accords[id] ? cfg.accords[id].at : null,
      arret: etat.arrets[id] || null,
      plafond: plafonds.plafondEffectif(id, cfg),
      espacementMin: p.espacementMin,
      decision: plafonds.decision({ plateforme: id, config: cfg, journal: plafonds.lireJournal(dossier()), etat }),
    })),
    texteAccord: plafonds.TEXTE_ACCORD,
    journal: plafonds.lireJournal(dossier()).slice(-50).reverse(),
  }
}

async function sonder() {
  if (!api) return
  const r = await file.passage(api, dejaVus)
  derniereErreur = r.erreur
  if (r.liens.length) {
    liens = [...r.liens, ...liens].slice(0, 100)
    if (Notification.isSupported()) new Notification({ title: 'DropShipper', body: `${r.liens.length} produit${r.liens.length > 1 ? 's' : ''} reçu${r.liens.length > 1 ? 's' : ''} du mobile.` }).show()
  }
  envoyer('etat', instantane())
}

// ------------------------------------------------- Annonces à publier (exécuteur)

const piloteDe = (id) => {
  if (!pilotes.has(id)) pilotes.set(id, creerPilote())
  return pilotes.get(id)
}

async function lireAnnonces() {
  if (!api) return
  try {
    annonces = await api.publications()
  } catch (err) {
    derniereErreur = err.message
  }
}

/** Traite UNE annonce : `manuel` = le vendeur a cliqué « Préparer », il relira et publiera lui-même. */
async function traiterAnnonce(annonce, { manuel }) {
  if (occupe) return { statut: 'attente', raison: 'Une annonce est déjà en cours.' }
  occupe = true
  try {
    // Un clic « Préparer » ne publie jamais : on retire l'accord du calcul pour cette annonce.
    const configLocale = manuel ? { ...cfg, accords: {} } : cfg
    const r = await traiter({ api, pilote: piloteDe(annonce.platform), plateforme: annonce.platform, annonce, config: configLocale, etat, dossier: dossier() })
    etat = plafonds.lireEtat(dossier())
    if (r.statut === 'publiee') annonces = annonces.filter((a) => a.id !== annonce.id)
    envoyer('etat', instantane())
    return r
  } finally {
    occupe = false
  }
}

/**
 * La tournée du mode automatique : à intervalle fixe, UNE annonce par plateforme
 * au plus, et seulement là où le vendeur a donné son accord. Le plafond et
 * l'espacement sont ceux de lib/plafonds.js.
 */
async function tourneeAuto() {
  if (!api || occupe) return
  await lireAnnonces()
  for (const id of Object.keys(plafonds.PLATEFORMES)) {
    if (!cfg.accords[id] || etat.arrets[id]) continue
    const suivante = annonces.find((a) => a.platform === id)
    if (!suivante) continue
    const d = plafonds.decision({ plateforme: id, config: cfg, journal: plafonds.lireJournal(dossier()), etat })
    if (!d.ok) continue
    await traiterAnnonce(suivante, { manuel: false })
  }
  envoyer('etat', instantane())
}

function demarrerSondage() {
  if (minuteur) clearInterval(minuteur)
  sonder()
  lireAnnonces().then(() => envoyer('etat', instantane()))
  // Intervalle FIXE : ni hasard ni rafale. Le serveur en accepte 120 par minute, on en fait une.
  minuteur = setInterval(async () => {
    await sonder()
    await tourneeAuto()
  }, file.INTERVALLE_MS)
}

// --------------------------------------------------------- Fenêtres de session

/** La surveillance : à chaque chargement, la page est lue pour y chercher un blocage. */
async function surveiller(id, win) {
  if (win.isDestroyed()) return
  try {
    const texte = await win.webContents.executeJavaScript('document.body ? document.body.innerText.slice(0, 4000) : ""', true)
    const b = plafonds.detecterBlocage({ url: win.webContents.getURL(), titre: win.getTitle(), texte })
    if (b.bloque && !etat.arrets[id]) {
      etat = plafonds.arreter(etat, id, `blocage vu sur la page (« ${b.indice} »)`)
      plafonds.ecrireEtat(dossier(), etat)
      plafonds.journaliser(dossier(), { type: 'alerte', plateforme: id, raison: b.indice, url: win.webContents.getURL() })
      if (Notification.isSupported()) new Notification({ title: `${plafonds.PLATEFORMES[id].nom} : arrêt`, body: 'Une vérification est apparue. Le mode automatique est arrêté ; réglez-la vous-même, puis reprenez.' }).show()
      envoyer('etat', instantane())
    }
  } catch {
    /* page en cours de navigation : on relira au prochain chargement */
  }
}

function ouvrirSession(id) {
  const p = plafonds.PLATEFORMES[id]
  if (!p) return
  const existante = fenetresSession.get(id)
  if (existante && !existante.isDestroyed()) return existante.focus()
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    title: p.nom,
    webPreferences: { partition: p.partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (file.adresseSure(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-finish-load', () => surveiller(id, win))
  win.webContents.on('did-navigate-in-page', () => surveiller(id, win))
  win.on('closed', () => fenetresSession.delete(id))
  fenetresSession.set(id, win)
  win.loadURL(p.accueil)
}

function ouvrirLien(url) {
  const sure = file.adresseSure(url)
  if (!sure) return
  const win = new BrowserWindow({ width: 1200, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.loadURL(sure)
}

// ------------------------------------------------------------------------ IPC

function brancherIpc() {
  ipcMain.handle('etat', () => instantane())

  ipcMain.handle('cle:poser', async (_e, { cle, apiBase }) => {
    const essai = client({ apiBase: apiBase || cfg.apiBase, cle: String(cle || '').trim() })
    try {
      const moi = await essai.me()
      cfg = config.poserCle({ ...cfg, apiBase: apiBase || cfg.apiBase }, String(cle).trim(), safeStorage)
      config.enregistrer(dossier(), cfg)
      chargerTout()
      demarrerSondage()
      return { ok: true, compte: moi.email }
    } catch (err) {
      return { ok: false, erreur: err.message }
    }
  })

  ipcMain.handle('cle:retirer', () => {
    cfg = { ...cfg, cle: null, cleChiffree: null }
    config.enregistrer(dossier(), cfg)
    api = null
    liens = []
    return instantane()
  })

  ipcMain.handle('lien:ouvrir', async (_e, id) => {
    const lien = liens.find((l) => l.id === id)
    if (!lien) return
    ouvrirLien(lien.url)
    try {
      await api.reclamer(id, 'CLAIMED')
    } catch (err) {
      derniereErreur = err.message
    }
    return instantane()
  })

  ipcMain.handle('lien:termine', async (_e, id) => {
    try {
      await api.reclamer(id, 'DONE')
      liens = liens.filter((l) => l.id !== id)
    } catch (err) {
      derniereErreur = err.message
    }
    return instantane()
  })

  ipcMain.handle('session:ouvrir', (_e, id) => ouvrirSession(id))

  ipcMain.handle('annonce:preparer', async (_e, id) => {
    const annonce = annonces.find((a) => a.id === id)
    if (!annonce) return { statut: 'echec', raison: 'Annonce introuvable.' }
    return traiterAnnonce(annonce, { manuel: true })
  })

  // Le vendeur a publié lui-même après « Préparer » : il le dit, on le transmet.
  ipcMain.handle('annonce:terminee', async (_e, { id, reussi }) => {
    try {
      await api.resultat(id, reussi ? 'PUBLISHED' : 'FAILED', reussi ? undefined : 'Abandonnée depuis l’application desktop')
      plafonds.journaliser(dossier(), { type: reussi ? 'publication-manuelle' : 'abandon', plateforme: annonces.find((a) => a.id === id)?.platform, publication: id })
      annonces = annonces.filter((a) => a.id !== id)
    } catch (err) {
      derniereErreur = err.message
    }
    return instantane()
  })

  ipcMain.handle('auto:accorder', (_e, id) => {
    cfg = plafonds.accorder(cfg, id)
    config.enregistrer(dossier(), cfg)
    plafonds.journaliser(dossier(), { type: 'accord', plateforme: id })
    return instantane()
  })

  ipcMain.handle('auto:retirer', (_e, id) => {
    cfg = plafonds.retirerAccord(cfg, id)
    config.enregistrer(dossier(), cfg)
    plafonds.journaliser(dossier(), { type: 'accord-retire', plateforme: id })
    return instantane()
  })

  ipcMain.handle('auto:reprendre', (_e, id) => {
    etat = plafonds.reprendre(etat, id)
    plafonds.ecrireEtat(dossier(), etat)
    plafonds.journaliser(dossier(), { type: 'reprise', plateforme: id })
    return instantane()
  })
}

// ------------------------------------------------------------------ Démarrage

app.whenReady().then(() => {
  chargerTout()
  brancherIpc()
  fenetre = new BrowserWindow({
    width: 980,
    height: 780,
    title: 'DropShipper Desktop',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  fenetre.removeMenu()
  fenetre.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  if (api) demarrerSondage()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
