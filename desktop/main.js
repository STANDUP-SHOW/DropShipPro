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
const { traiterLien, importGroupe, importesAujourdhui, plafondImports } = require('./lib/circuit')

// Bancs : un profil jetable (config, journal, sessions) au lieu de celui du vendeur.
if (process.env.DROPSHIPPER_DESKTOP_PROFIL) app.setPath('userData', process.env.DROPSHIPPER_DESKTOP_PROFIL)

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
/** Plateformes vues sans session : la tournée automatique n'y retourne pas tant que le vendeur n'a pas rouvert la plateforme. */
const sansSession = new Set()

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
    circuit: Boolean(cfg.circuit && cfg.circuit.actif),
    reseaux: Boolean(cfg.circuit && cfg.circuit.reseaux),
    plafondImports: Number.isFinite(plafondImports(cfg)) ? plafondImports(cfg) : null,
    margeMin: margeMin(),
    rayons: cfg.rayonsConnus || [],
    rayonsChoisis: (cfg.circuit && cfg.circuit.categories) || [],
    importsAujourdhui: importesAujourdhui(plafonds.lireJournal(dossier())),
    texteAccord: plafonds.TEXTE_ACCORD,
    journal: plafonds.lireJournal(dossier()).slice(-50).reverse(),
  }
}

/**
 * Le circuit automatique : chaque lien reçu est importé puis mis en file sur les
 * plateformes où l'agent est activé (l'accord donné dans l'écran). Aucune
 * validation entre les deux. Solde de drops vide : on s'arrête et on le dit.
 */
async function circuitAuto(nouveaux) {
  const plateformes = Object.keys(plafonds.PLATEFORMES).filter((id) => cfg.accords[id])
  const restants = []
  for (let i = 0; i < nouveaux.length; i++) {
    const lien = nouveaux[i]
    const r = await traiterLien({ api, lien, plateformes, reseaux: Boolean(cfg.circuit && cfg.circuit.reseaux) })
    plafonds.journaliser(dossier(), { type: 'import', publication: lien.id, produit: r.productId, raison: r.raison, resultat: r.statut })
    if (r.statut === 'sans_solde') {
      derniereErreur = r.raison
      // Rien n'a été débité : ces liens repartent au prochain passage, quand le solde sera rechargé.
      nouveaux.slice(i).forEach((l) => dejaVus.delete(l.id))
      break
    }
    if (r.statut === 'echec') restants.push(lien)
  }
  await lireAnnonces()
  return restants
}

const jourLocalMain = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * L'import groupé de la liste du jour des produits gagnants : une fois par jour
 * (et le reste du plafond s'il reste des places), quand le circuit est actif. Chaque
 * adresse devient une annonce, mise en file sur les plateformes où l'agent est
 * activé. Plafond d'imports par jour : protège le solde de drops.
 */
const margeMin = () => {
  const m = Number(cfg.circuit && cfg.circuit.margeMin)
  return Number.isFinite(m) && m >= 0 && m <= 100 ? m : 20
}

/** Les rayons du jour, pour l'écran : lus sans rien importer (max=1), au plus une fois par jour. */
async function lireRayons() {
  if (!api || cfg.rayonsLus === jourLocalMain()) return
  try {
    const liste = await api.gagnants({ margeMin: 0, max: 1 })
    cfg = { ...cfg, rayonsConnus: liste.categories || [], rayonsLus: jourLocalMain() }
    config.enregistrer(dossier(), cfg)
  } catch {
    /* compte sous le seuil de drops ou hors ligne : l'écran garde les derniers rayons connus */
  }
}

async function journeeGagnants() {
  if (!api || !cfg.circuit || !cfg.circuit.actif || cfg.dernierGagnants === jourLocalMain()) return
  const plateformes = Object.keys(plafonds.PLATEFORMES).filter((id) => cfg.accords[id])
  try {
    const bilan = await importGroupe({
      api,
      plateformes,
      reseaux: Boolean(cfg.circuit && cfg.circuit.reseaux),
      plafond: plafondImports(cfg),
      dejaFaits: importesAujourdhui(plafonds.lireJournal(dossier())),
      margeMin: margeMin(),
      categories: (cfg.circuit && cfg.circuit.categories) || [],
      surProduit: (produit, r) => plafonds.journaliser(dossier(), { type: 'import', publication: produit.url, produit: r.productId, raison: r.raison, resultat: r.statut, reseaux: r.reseaux ? r.reseaux.publies : undefined }),
    })
    plafonds.journaliser(dossier(), { type: 'gagnants', raison: `${bilan.importes} importé(s) sur ${bilan.lus} de la liste du ${bilan.jour}${bilan.sansSolde ? ' — solde de drops vide' : ''}` })
    if (bilan.rayons.length) cfg = { ...cfg, rayonsConnus: bilan.rayons }
    // « Fait pour aujourd'hui » sauf si le solde a coupé le lot : il reprendra au prochain passage.
    if (!bilan.sansSolde) {
      cfg = { ...cfg, dernierGagnants: jourLocalMain() }
      config.enregistrer(dossier(), cfg)
    } else {
      derniereErreur = 'Solde de drops vide : les produits gagnants attendent votre rechargement.'
    }
  } catch (err) {
    derniereErreur = err.message
  }
  await lireAnnonces()
}

async function sonder() {
  if (!api) return
  const r = await file.passage(api, dejaVus)
  derniereErreur = r.erreur
  // Circuit actif : ce qui a été importé n'apparaît plus dans la liste, seul reste ce qui n'a pas pu l'être.
  const aMontrer = r.liens.length && cfg.circuit && cfg.circuit.actif ? await circuitAuto(r.liens) : r.liens
  if (aMontrer.length) {
    liens = [...aMontrer, ...liens].slice(0, 100)
    if (Notification.isSupported()) new Notification({ title: 'DropShipper', body: `${aMontrer.length} produit${aMontrer.length > 1 ? 's' : ''} reçu${aMontrer.length > 1 ? 's' : ''} du mobile.` }).show()
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
    if (r.manque && r.manque.includes('connexion')) {
      sansSession.add(annonce.platform)
      derniereErreur = r.raison
    } else sansSession.delete(annonce.platform)
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
    // Une plateforme en pause n'est pas sautée ici : `decision` connaît l'échéance et, passée la pause, l'agent retente seul.
    if (!cfg.accords[id] || sansSession.has(id)) continue
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
  lireRayons().then(() => envoyer('etat', instantane()))
  // Intervalle FIXE : ni hasard ni rafale. Le serveur en accepte 120 par minute, on en fait une.
  minuteur = setInterval(async () => {
    await sonder()
    await lireRayons()
    await journeeGagnants()
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
  sansSession.delete(id) // le vendeur va se connecter : la tournée automatique y retournera
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

  ipcMain.handle('circuit:reseaux', (_e, actif) => {
    cfg = { ...cfg, circuit: { ...(cfg.circuit || {}), reseaux: Boolean(actif) } }
    config.enregistrer(dossier(), cfg)
    return instantane()
  })

  ipcMain.handle('circuit:plafond', (_e, n) => {
    // Vide ou nul : illimité. Une limite est un réglage du vendeur, jamais une décision de l'application.
    cfg = { ...cfg, plafondImports: Number(n) > 0 ? Math.floor(Number(n)) : null }
    config.enregistrer(dossier(), cfg)
    return instantane()
  })

  // Un réglage de sélection change la liste : l'import groupé du jour repart avec le nouveau choix.
  ipcMain.handle('circuit:marge', (_e, n) => {
    const m = Number(n)
    cfg = { ...cfg, circuit: { ...(cfg.circuit || {}), margeMin: Number.isFinite(m) && m >= 0 && m <= 100 ? m : 20 }, dernierGagnants: null }
    config.enregistrer(dossier(), cfg)
    return instantane()
  })

  ipcMain.handle('circuit:rayons', (_e, choisis) => {
    const connus = new Set(cfg.rayonsConnus || [])
    const categories = Array.isArray(choisis) ? choisis.filter((c) => typeof c === 'string' && connus.has(c)) : []
    cfg = { ...cfg, circuit: { ...(cfg.circuit || {}), categories }, dernierGagnants: null }
    config.enregistrer(dossier(), cfg)
    return instantane()
  })

  ipcMain.handle('circuit:regler', (_e, actif) => {
    cfg = { ...cfg, circuit: { ...(cfg.circuit || {}), actif: Boolean(actif) } }
    // Réactiver le circuit relance l'import groupé du jour, même s'il a déjà tourné.
    if (actif) cfg.dernierGagnants = null
    config.enregistrer(dossier(), cfg)
    plafonds.journaliser(dossier(), { type: actif ? 'circuit-active' : 'circuit-coupe' })
    return instantane()
  })

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
