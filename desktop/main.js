'use strict'
/**
 * DropShipper Desktop — le processus principal.
 *
 * - Une fenêtre : une barre à gauche (renderer/coque.html), et à droite LE SITE
 *   drop-shipper.fr lui-même (tableau de bord, Auto-Shipper, commandes, drops…)
 *   dans son propre navigateur, ou les panneaux locaux (renderer/index.html).
 *   Le vendeur se connecte au site dans cette fenêtre ; ce poste se relie alors
 *   tout seul (clé desktop créée avec sa session, gardée chiffrée ici).
 * - Partage d'un produit vers la liste à importer : lien collé ou déposé sur la
 *   fenêtre, presse-papiers capturé (au choix du vendeur), adresse
 *   `dropshipper://partager?url=…`. Le mobile partage vers la même liste.
 * - Aucun écran n'a accès à Node : tout passe par les preloads et des canaux nommés.
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
const { app, BrowserWindow, WebContentsView, ipcMain, safeStorage, shell, Notification, clipboard, Tray, Menu } = require('electron')
const config = require('./lib/config')
const { client } = require('./lib/api')
const file = require('./lib/file')
const plafonds = require('./lib/plafonds')
const { traiter } = require('./lib/executeur')
const { creerPilote } = require('./lib/pilote-electron')
const { creerPiloteAchat } = require('./lib/pilote-achat')
const { preparer: preparerAchat } = require('./lib/commande')
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
let achats = []
/** Une fenêtre de fournisseur par vente en cours : elle reste ouverte pour que le vendeur paie. */
const pilotesAchat = new Map()
const resultatsAchat = new Map()
const pilotes = new Map()
let occupe = false
let derniereErreur = null
let minuteur = null
const fenetresSession = new Map()
const SITE = 'https://www.drop-shipper.fr'
const LARGEUR_BARRE = 220
let vueSite = null
let vuePanneau = null
let panneauVisible = false
let tray = null
let dernierPresse = null
let dernierPartage = null
let liaisonEnCours = false
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
  if (vuePanneau && !vuePanneau.webContents.isDestroyed()) vuePanneau.webContents.send(canal, donnees)
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send('coque', etatCoque())
}

function etatCoque() {
  return { compte: cfg.compte || null, connecte: !!api, nbLiens: liens.length, nbAnnonces: annonces.length, nbAchats: achats.length, capture: Boolean(cfg.capturePressePapiers), dernierPartage }
}

function instantane() {
  return {
    connecte: !!api,
    apiBase: cfg.apiBase,
    liens,
    annonces,
    achats: achats.map((a) => ({ ...a, resultat: resultatsAchat.get(a.id) || null })),
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
    achats = await api.achats()
    for (const id of [...resultatsAchat.keys()]) if (!achats.some((a) => a.id === id)) resultatsAchat.delete(id)
  } catch (err) {
    derniereErreur = err.message
  }
}

/**
 * Préparer une vente chez son fournisseur (mémo auto-fulfillment § III) : dans la
 * session du vendeur, jusqu'à l'écran de paiement, jamais plus loin. La fenêtre
 * reste ouverte : c'est là qu'il paie, puis il dit « J'ai payé ».
 */
async function preparerVente(id) {
  const achat = achats.find((a) => a.id === id)
  if (!achat || !api) return { statut: 'echec', raison: 'Vente introuvable.' }
  if (!pilotesAchat.has(id)) pilotesAchat.set(id, creerPiloteAchat())
  const r = await preparerAchat({ api, pilote: pilotesAchat.get(id), achat })
  resultatsAchat.set(id, { statut: r.statut, raison: r.raison, at: new Date().toISOString() })
  plafonds.journaliser(dossier(), { type: 'achat', publication: id, plateforme: achat.produit.fournisseur || undefined, raison: `${r.statut} — ${r.raison}`.slice(0, 300), resultat: r.statut })
  if (Notification.isSupported()) {
    new Notification({ title: r.statut === 'preparee' ? 'Saisie automatique terminée' : 'Commande fournisseur : à vous', body: r.statut === 'preparee' ? 'Validez le paiement vous-même dans la fenêtre du fournisseur.' : r.raison }).show()
  }
  envoyer('etat', instantane())
  return r
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

// ------------------------------------------------------------- La fenêtre

function placerVues() {
  if (!fenetre || fenetre.isDestroyed()) return
  const [largeur, hauteur] = fenetre.getContentSize()
  const zone = { x: LARGEUR_BARRE, y: 0, width: Math.max(0, largeur - LARGEUR_BARRE), height: hauteur }
  const cache = { x: 0, y: 0, width: 0, height: 0 }
  vueSite.setBounds(panneauVisible ? cache : zone)
  vuePanneau.setBounds(panneauVisible ? zone : cache)
}

function montrerSite(chemin) {
  panneauVisible = false
  const cible = new URL(chemin, SITE).href
  if (vueSite.webContents.getURL() !== cible) vueSite.webContents.loadURL(cible)
  placerVues()
}

function montrerPanneau(section) {
  panneauVisible = true
  placerVues()
  vuePanneau.webContents.send('section', section)
}

/**
 * Le site est connecté dans la fenêtre : ce poste se relie tout seul. La session du
 * site (son jeton, dans sa propre page) sert UNE fois, pour créer la clé desktop ;
 * c'est la clé, chiffrée ici, qui sert ensuite. Jamais de mot de passe lu ni gardé.
 */
async function relierDepuisLeSite() {
  if (api || liaisonEnCours || !vueSite) return
  liaisonEnCours = true
  try {
    const jeton = await vueSite.webContents.executeJavaScript('(() => { try { return localStorage.getItem("droppost_token") } catch { return null } })()', true)
    if (!jeton) return
    const r = await fetch(`${cfg.apiBase}/api/settings/api-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', 'User-Agent': 'DropShipperDesktop' },
      body: JSON.stringify({ name: `DropShipper Desktop (${require('node:os').hostname()})`.slice(0, 60), type: 'desktop' }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.key) {
      derniereErreur = j.error || `Impossible de relier ce poste (HTTP ${r.status}).`
      return
    }
    cfg = config.poserCle(cfg, j.key, safeStorage)
    config.enregistrer(dossier(), cfg)
    chargerTout()
    const moi = await api.me().catch(() => null)
    if (moi && moi.compte) {
      cfg = { ...cfg, compte: moi.compte }
      config.enregistrer(dossier(), cfg)
    }
    plafonds.journaliser(dossier(), { type: 'liaison', raison: 'poste relié depuis la session du site' })
    demarrerSondage()
    envoyer('etat', instantane())
  } catch (err) {
    derniereErreur = err.message
  } finally {
    liaisonEnCours = false
  }
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DropShipper Desktop',
    webPreferences: { preload: path.join(__dirname, 'coque-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  fenetre.removeMenu()
  fenetre.loadFile(path.join(__dirname, 'renderer', 'coque.html'))

  // Le site, dans son propre navigateur (session persistante « persist:site », le vendeur s'y connecte lui-même).
  vueSite = new WebContentsView({ webPreferences: { partition: 'persist:site', contextIsolation: true, nodeIntegration: false, sandbox: true } })
  vueSite.webContents.setWindowOpenHandler(({ url }) => {
    // Le site reste dans la fenêtre ; les liens extérieurs (fournisseurs, places de marché) s'ouvrent dans le navigateur du poste.
    if (url.startsWith(SITE)) vueSite.webContents.loadURL(url)
    else if (file.adresseSure(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  vueSite.webContents.on('did-finish-load', () => {
    if (!api) relierDepuisLeSite()
  })
  vueSite.webContents.on('did-navigate-in-page', () => {
    if (!api) relierDepuisLeSite()
  })

  vuePanneau = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  vuePanneau.webContents.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  fenetre.contentView.addChildView(vueSite)
  fenetre.contentView.addChildView(vuePanneau)
  fenetre.on('resize', placerVues)
  fenetre.on('close', (e) => {
    // Fermer la fenêtre ne coupe pas l'agent : l'application reste dans la zone de notification.
    if (!app.quitter) {
      e.preventDefault()
      fenetre.hide()
    }
  })
  montrerSite('/dashboard')
}

function creerTray() {
  try {
    tray = new Tray(path.join(__dirname, 'build', 'icon.png'))
    tray.setToolTip('DropShipper Desktop')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir DropShipper Desktop', click: () => fenetre.show() },
        { label: 'Partager le lien copié', click: () => partagerLien(clipboard.readText()) },
        { type: 'separator' },
        {
          label: 'Quitter',
          click: () => {
            app.quitter = true
            app.quit()
          },
        },
      ]),
    )
    tray.on('click', () => fenetre.show())
  } catch {
    /* pas d'icône : l'application vit sans zone de notification */
  }
}

// ------------------------------------------------------------- Le partage

/** Un lien partagé rejoint la liste à importer (la même que celle du mobile). */
async function partagerLien(texte, origine = 'desktop') {
  const url = file.adresseSure(String(texte || '').trim())
  if (!url) return { ok: false, erreur: 'Ce n’est pas une adresse web.' }
  if (url.includes('drop-shipper.fr')) return { ok: false, erreur: 'C’est une page du site, pas un produit.' }
  if (!api) return { ok: false, erreur: 'Connectez-vous d’abord sur le site, dans cette fenêtre.' }
  try {
    await api.partager(url, origine)
    dernierPartage = `Ajouté : ${url.slice(0, 60)}`
    plafonds.journaliser(dossier(), { type: 'partage', raison: url.slice(0, 200) })
    if (Notification.isSupported() && origine !== 'desktop') new Notification({ title: 'DropShipper', body: 'Produit ajouté à la liste à importer.' }).show()
    await sonder()
    return { ok: true }
  } catch (err) {
    return { ok: false, erreur: err.message }
  }
}

/** Le presse-papiers, lu à intervalle fixe quand le vendeur l'a demandé : un lien copié devient un partage. */
function surveillerPressePapiers() {
  setInterval(() => {
    if (!cfg.capturePressePapiers || !api) return
    const texte = clipboard.readText().trim()
    if (!texte || texte === dernierPresse) return
    dernierPresse = texte
    if (/^https?:\/\/\S+$/i.test(texte) && !texte.includes('drop-shipper.fr')) partagerLien(texte, 'presse-papiers')
  }, 1500)
}

/** `dropshipper://partager?url=…` : depuis un raccourci, un autre programme, ou le site. */
function traiterArguments(argv) {
  const brut = argv.find((a) => a.startsWith('dropshipper://'))
  if (!brut) return
  try {
    const u = new URL(brut)
    const url = u.searchParams.get('url')
    if (url) partagerLien(url, 'protocole')
  } catch {
    /* adresse illisible */
  }
}

// ------------------------------------------------------------------------ IPC

function brancherIpc() {
  ipcMain.handle('etat', () => instantane())

  ipcMain.handle('coque:etat', () => etatCoque())
  ipcMain.handle('coque:naviguer', (_e, ou) => {
    if (ou && ou.site) montrerSite(String(ou.site))
    else montrerPanneau(String((ou && ou.panneau) || 'partages'))
  })
  ipcMain.handle('coque:partager', (_e, url) => partagerLien(url, 'desktop'))
  ipcMain.handle('coque:capture', (_e, actif) => {
    cfg = { ...cfg, capturePressePapiers: Boolean(actif) }
    config.enregistrer(dossier(), cfg)
    dernierPresse = clipboard.readText().trim() // ce qui est déjà copié ne compte pas
    return etatCoque()
  })

  // « Importer » sur un lien partagé : le circuit, à la demande, même quand le mode automatique est coupé.
  ipcMain.handle('lien:importer', async (_e, id) => {
    const lien = liens.find((l) => l.id === id)
    if (!lien || !api) return instantane()
    const plateformes = Object.keys(plafonds.PLATEFORMES).filter((p) => cfg.accords[p])
    const r = await traiterLien({ api, lien, plateformes, reseaux: Boolean(cfg.circuit && cfg.circuit.reseaux) })
    plafonds.journaliser(dossier(), { type: 'import', publication: lien.id, produit: r.productId, raison: r.raison, resultat: r.statut })
    if (r.statut === 'echec' || r.statut === 'sans_solde') derniereErreur = r.raison
    else liens = liens.filter((l) => l.id !== id)
    await lireAnnonces()
    return instantane()
  })

  ipcMain.handle('cle:poser', async (_e, { cle, apiBase }) => {
    const essai = client({ apiBase: apiBase || cfg.apiBase, cle: String(cle || '').trim() })
    try {
      const moi = await essai.me()
      cfg = config.poserCle({ ...cfg, apiBase: apiBase || cfg.apiBase, compte: moi.compte || null }, String(cle).trim(), safeStorage)
      config.enregistrer(dossier(), cfg)
      chargerTout()
      demarrerSondage()
      return { ok: true, compte: moi.compte }
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

  ipcMain.handle('achat:preparer', (_e, id) => preparerVente(id))

  // « J'ai payé » : dit après coup, jamais avant. La fenêtre du fournisseur se ferme.
  ipcMain.handle('achat:paye', async (_e, id) => {
    try {
      await api.achatsPayes([id], (resultatsAchat.get(id) || {}).url)
      achats = achats.filter((a) => a.id !== id)
      resultatsAchat.delete(id)
      const p = pilotesAchat.get(id)
      if (p) p.fermer()
      pilotesAchat.delete(id)
      plafonds.journaliser(dossier(), { type: 'achat-paye', publication: id })
    } catch (err) {
      derniereErreur = err.message
    }
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

// Une seule instance : un second lancement (raccourci, adresse dropshipper://) parle à la première.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (fenetre) fenetre.show()
    traiterArguments(argv)
  })
  if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient('dropshipper', process.execPath, [path.resolve(process.argv[1])])
  } else app.setAsDefaultProtocolClient('dropshipper')

  app.whenReady().then(() => {
    chargerTout()
    brancherIpc()
    creerFenetre()
    creerTray()
    surveillerPressePapiers()
    if (api) demarrerSondage()
    traiterArguments(process.argv)
  })

  app.on('before-quit', () => {
    app.quitter = true
  })
  app.on('window-all-closed', () => undefined) // la zone de notification garde l'agent en vie
}
