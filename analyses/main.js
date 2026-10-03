'use strict'
/**
 * DropShipper Poste d'analyses — main process.
 *
 * One Electron app on a dedicated (weak, GPU-less) Windows PC:
 *  - the agents (lib/rayon.js, lib/orchestrateur.js), ported from n8n, same
 *    specifications and same reports;
 *  - a private Chromium with one persistent session per data site Max adds
 *    (lib/sources.js, lib/veille.js) — Max logs in himself, once;
 *  - the deposit folder created by the installer (reports, readings, logs).
 *
 * Rules that hold here (CLAUDE.md and Max, 03/10/2026):
 *  - nothing runs on its own until Max switched the night on himself, after
 *    a validated test rayon; every costly launch asks him in a native dialog;
 *  - keys are typed by Max in this app, encrypted by the OS vault, never shown;
 *  - never an invented URL or price (lib/validation.js);
 *  - no anti-bot evasion: normal browser, fixed intervals, stop at first block.
 */
const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { app, BrowserWindow, WebContentsView, ipcMain, safeStorage, shell, dialog, Tray, Menu, Notification, powerSaveBlocker, nativeImage } = require('electron')

const config = require('./lib/config')
const { racineDepot, creerArborescence, jourLocal } = require('./lib/chemins')
const { creerJournal } = require('./lib/journal')
const agents = require('./lib/agents')
const { creerSerper } = require('./lib/serper')
const { creerClaude } = require('./lib/claude')
const { lirePage } = require('./lib/pages')
const { executerRayon } = require('./lib/rayon')
const signauxPublics = require('./lib/signaux')
const serperEtendu = require('./lib/serper-etendu')
const { controleCredits, lancerNuit, rapportValide } = require('./lib/orchestrateur')
const depot = require('./lib/depot')
const sourcesLib = require('./lib/sources')
const veille = require('./lib/veille')
const { planifier } = require('./lib/planificateur')

// A weak PC without a GPU: do not ask Chromium for one.
app.disableHardwareAcceleration()

const BANC = process.env.DROPSHIPPER_POSTE_BANC === '1'
if (process.env.DROPSHIPPER_POSTE_PROFIL) app.setPath('userData', process.env.DROPSHIPPER_POSTE_PROFIL)

let fenetre = null
let tray = null
let vueNavigateur = null
let sourceAffichee = null
let cfg = null
let racine = null
let journal = null
let quitter = false
const nuit = { enCours: false, arret: { demande: false }, progression: null, dernierBilan: null }
let etatsSources = {}
let relevesCache = { date: null, at: 0, lectures: [] }
let bloqueurVeille = null

const dossierDonnees = () => app.getPath('userData')
const sauver = () => config.enregistrer(dossierDonnees(), cfg)
const secret = (nom) => config.lireSecret(cfg, nom, safeStorage)

// ---- providers (keys read at use time: Max may change them)
function fournisseurs() {
  const serper = creerSerper({ cle: secret('serper'), url: process.env.POSTE_URL_SERPER || undefined })
  const claude = creerClaude({ cle: secret('anthropic'), modele: cfg.modele, espace: cfg.espaceAnthropic, url: process.env.POSTE_URL_CLAUDE || undefined })
  return { serper, claude }
}

const lecteur = () => veille.lecteurElectron({ BrowserWindow })

async function lectureSources(date) {
  const frais = relevesCache.date === date && Date.now() - relevesCache.at < 6 * 3600e3
  if (frais) return relevesCache.lectures
  const actives = cfg.sources.filter((s) => s.actif && s.pages.length)
  if (!actives.length) return []
  const { lectures, etats } = await veille.releverSources({ sources: cfg.sources, lire: lecteur(), racine, date, journal })
  etatsSources = { ...etatsSources, ...etats }
  relevesCache = { date, at: Date.now(), lectures }
  prevenirSiSession(etats)
  envoyerEtat()
  return lectures
}

function prevenirSiSession(etats) {
  for (const s of cfg.sources) {
    const e = etats[s.id]
    if (e && (e.etat === 'deconnecte' || e.etat === 'bloque')) notifier(`Source « ${s.nom} »`, `${e.etat === 'bloque' ? 'Blocage' : 'Session perdue'} : ${e.raison}. Ouvrez l'onglet Sources pour reprendre la main.`)
  }
}

function notifier(titre, corps) {
  try { if (Notification.isSupported()) new Notification({ title: titre, body: corps }).show() } catch { /* best effort */ }
}

// Block memory for the night: a block stops that source for every later rayon of the day.
let suiviSignaux = { date: null, meta: null, trends: null }

function signauxDuRayon(date) {
  const c = cfg.signauxPublics || {}
  if (!c.meta && !c.trends) return null
  if (suiviSignaux.date !== date) suiviSignaux = { date, meta: null, trends: null }
  const lire = signauxPublics.lecteurSignaux({ BrowserWindow })
  const bases = { meta: process.env.POSTE_URL_META || 'https://www.facebook.com', trends: process.env.POSTE_URL_TRENDS || 'https://trends.google.com' }
  const pause = process.env.POSTE_PAUSE_SIGNAUX_MS ? Number(process.env.POSTE_PAUSE_SIGNAUX_MS) : undefined
  return ({ rayon, noms }) => signauxPublics.releverSignaux({ rayon, noms, lire, config: c, bases, journal, suivi: suiviSignaux, pause })
}

// Extra Serper readings (Shopping, autocomplete, images); null when Max switched all three off.
function serperEtenduActif() {
  const c = { ...serperEtendu.PAR_DEFAUT, ...(cfg.serperEtendu || {}) }
  return c.shopping || c.autocomplete || c.images ? c : null
}

// Serper credits one rayon may spend at most: 20 wave-1 + 26 wave-2 searches, plus the extra readings.
function creditsSerperParRayon() {
  const c = serperEtenduActif()
  return 20 + (cfg.plafondDeuxiemeVague || 26) + (c ? (c.autocomplete ? 7 : 0) + (c.shopping ? c.plafondShopping : 0) + (c.images ? c.plafondImages : 0) : 0)
}

// The rayons of the night, as chosen by Max (all of them until he chooses).
const rayonsDeLaNuit = (date) => agents.choisirRayons(agents.rayonsDuJour(agents.charger(), date), cfg.rayonsNuit)

function depsRayon(date) {
  const { serper, claude } = fournisseurs()
  return {
    serper,
    claude,
    signaux: signauxDuRayon(date),
    serperEtendu: serperEtenduActif(),
    pages: (u) => lirePage(u),
    releves: () => lectureSources(date),
    journal,
    racine,
  }
}

/**
 * The agent's prompt lives in <depot>/prompts/rayon.md so Max can replace it by
 * his original one (the one of the n8n agent) without touching the app.
 */
const fichierPrompt = () => path.join(racine, 'prompts', 'rayon.md')
function preparerPrompt() {
  const cible = fichierPrompt()
  if (!fs.existsSync(cible)) fs.copyFileSync(path.join(__dirname, 'prompts', 'rayon.md'), cible)
}

function optionsRayon() {
  const cleAgent = secret('agent')
  return {
    fichierPrompt: fichierPrompt(),
    plafondPages: cfg.plafondPages,
    plafondDeuxiemeVague: cfg.plafondDeuxiemeVague,
    modele: cfg.modele,
    envoyer: cfg.envoiAuSite && cleAgent ? (markdown) => depot.envoyerAuSite({ apiBase: cfg.apiBase, cle: cleAgent, markdown }) : null,
  }
}

// ---- hard gate: a costly launch needs Max's explicit yes, in a native dialog
async function accord(message, detail) {
  if (BANC) return true
  const r = await dialog.showMessageBox(fenetre, {
    type: 'question',
    buttons: ['Non', 'Oui, lancer'],
    defaultId: 0,
    cancelId: 0,
    title: 'Accord requis',
    message,
    detail,
  })
  return r.response === 1
}

function progression(p) {
  nuit.progression = p
  envoyer('progression', p)
}

async function lancerUnRayon(rayonChoisi) {
  if (nuit.enCours) throw new Error('Une exécution est déjà en cours.')
  const date = jourLocal()
  const rayon = rayonChoisi || agents.rayonsDuJour(agents.charger(), date)[0]
  const ok = await accord(`Lancer UN rayon test (${rayon.libelleCategorie} › ${rayon.libelleTheme}) ?`, `Coût estimé : environ 0,39 € chez Anthropic et jusqu’à ${creditsSerperParRayon()} crédits Serper.`)
  if (!ok) return { annule: true }
  nuit.enCours = true
  nuit.arret = { demande: false }
  progression({ courant: `${rayon.categorie}/${rayon.theme}`, index: 1, attendus: 1 })
  try {
    const res = await executerRayon({ rayon, deps: depsRayon(date), options: optionsRayon() })
    nuit.dernierBilan = { date, test: true, rayon: `${rayon.categorie}/${rayon.theme}`, statut: res.statut, problemes: res.validation.problemes, stats: res.validation.stats }
    return nuit.dernierBilan
  } catch (err) {
    journal.erreur(`Rayon test échoué`, { raison: String(err.message || err) })
    nuit.dernierBilan = { date, test: true, rayon: `${rayon.categorie}/${rayon.theme}`, statut: 'erreur', problemes: [String(err.message || err)] }
    return nuit.dernierBilan
  } finally {
    nuit.enCours = false
    progression(null)
    envoyerEtat()
  }
}

async function lancerLaNuit({ automatique = false } = {}) {
  if (nuit.enCours) throw new Error('Une exécution est déjà en cours.')
  const date = jourLocal()
  const choisis = rayonsDeLaNuit(date)
  if (!choisis.length) {
    journal.erreur('Nuit non lancée', { raison: 'aucun rayon coché' })
    nuit.dernierBilan = { date, annulee: 'Aucun rayon coché : cochez au moins un rayon dans « Rayons du jour ».' }
    envoyerEtat()
    return nuit.dernierBilan
  }
  if (!automatique) {
    const n = choisis.length
    const ok = await accord(
      n === 24 ? 'Lancer la nuit complète (24 rayons, un à la fois) ?' : `Lancer ${n} rayon${n > 1 ? 's' : ''} sur 24, un à la fois ?`,
      `Coût estimé : environ ${(n * 0.39).toFixed(2).replace('.', ',')} € chez Anthropic et jusqu’à ${n * creditsSerperParRayon()} crédits Serper. ${choisis.map((r) => r.libelleCategorie).join(', ')}.${n === 24 ? ' Faites d’abord un rayon test.' : ''}`,
    )
    if (!ok) return { annule: true }
  }
  nuit.enCours = true
  nuit.arret = { demande: false }
  try {
    const rayons = choisis
    const { serper, claude } = fournisseurs()
    const bilan = await lancerNuit({
      rayons,
      date,
      racine,
      journal,
      arret: nuit.arret,
      surProgres: (p) => progression({ ...p, attendus: rayons.length }),
      controle: () => controleCredits({ serper, claude }),
      executer: (rayon) => executerRayon({ rayon, deps: depsRayon(date), options: optionsRayon() }),
    })
    nuit.dernierBilan = bilan
    notifier('Nuit terminée', bilan.annulee ? 'Nuit annulée avant dépense — voir le journal.' : `${bilan.ok} rapports validés, ${bilan.aRevoir} à revoir, ${bilan.erreurs.length} erreur(s).`)
    return bilan
  } catch (err) {
    // Missing key etc.: say it, spend nothing.
    journal.erreur('Nuit non lancée', { raison: String(err.message || err) })
    nuit.dernierBilan = { date, annulee: String(err.message || err) }
    return nuit.dernierBilan
  } finally {
    nuit.enCours = false
    progression(null)
    envoyerEtat()
  }
}

// ---- state sent to the screen (never a secret value)
function listeRapports(date) {
  const out = []
  try {
    const base = path.join(racine, 'rapports', date)
    for (const c of fs.readdirSync(base)) {
      for (const f of fs.readdirSync(path.join(base, c)).filter((x) => x.endsWith('.json'))) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(base, c, f), 'utf8'))
          out.push({ categorie: c, theme: f.replace(/\.json$/, ''), statut: (j.poste && j.poste.statut) || '?', produits: (j.products || []).length, problemes: (j.poste && j.poste.problemes) || [] })
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* no report yet */ }
  return out
}

function etat() {
  const date = jourLocal()
  return {
    version: app.getVersion(),
    depot: racine,
    date,
    secrets: config.etatSecrets(cfg),
    reglages: {
      modele: cfg.modele, espaceAnthropic: cfg.espaceAnthropic || '', heureNuit: cfg.heureNuit, nuitActivee: cfg.nuitActivee, envoiAuSite: cfg.envoiAuSite, apiBase: cfg.apiBase,
      plafondPages: cfg.plafondPages, plafondDeuxiemeVague: cfg.plafondDeuxiemeVague,
      signauxPublics: { meta: true, trends: true, plafondPubsParRayon: 6, plafondTendancesParRayon: 2, ...(cfg.signauxPublics || {}) },
      serperEtendu: { ...serperEtendu.PAR_DEFAUT, ...(cfg.serperEtendu || {}) },
      creditsSerperParRayon: creditsSerperParRayon(),
    },
    nuit: { enCours: nuit.enCours, progression: nuit.progression, dernierBilan: nuit.dernierBilan },
    rayonsDuJour: agents.rayonsDuJour(agents.charger(), date).map((r) => ({ ...r, fait: rapportValide(racine, date, r.categorie, r.theme), choisi: !Array.isArray(cfg.rayonsNuit) || cfg.rayonsNuit.includes(r.categorie) })),
    rapports: listeRapports(date),
    sources: cfg.sources.map((s) => ({ ...s, session: etatsSources[s.id] || null })),
    journal: journal.lire(120),
  }
}

function envoyer(canal, donnees) {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send(canal, donnees)
}
function envoyerEtat() { envoyer('etat', etat()) }

// ---- the private browser (one view, one source at a time: light on RAM)
function fermerNavigateur() {
  if (vueNavigateur) {
    try { fenetre.contentView.removeChildView(vueNavigateur) } catch { /* already gone */ }
    try { vueNavigateur.webContents.close() } catch { /* already gone */ }
    vueNavigateur = null
  }
  sourceAffichee = null
}

function afficherSource(id, bounds) {
  const s = cfg.sources.find((x) => x.id === id)
  if (!s) throw new Error('Source inconnue.')
  if (!vueNavigateur || sourceAffichee !== id) {
    fermerNavigateur()
    vueNavigateur = new WebContentsView({ webPreferences: { partition: sourcesLib.partition(s), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    fenetre.contentView.addChildView(vueNavigateur)
    sourceAffichee = id
    vueNavigateur.webContents.on('did-navigate', (_e, url) => envoyer('nav', { url }))
    vueNavigateur.webContents.on('did-navigate-in-page', (_e, url) => envoyer('nav', { url }))
    vueNavigateur.webContents.setWindowOpenHandler(({ url }) => { vueNavigateur.webContents.loadURL(url); return { action: 'deny' } })
    vueNavigateur.webContents.loadURL(s.urlConnexion)
  }
  if (bounds) vueNavigateur.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) })
}

// ---- Windows: restart by itself after a crash or a kill (answer to "Docker never came back")
function chienDeGarde() {
  if (process.platform !== 'win32' || !app.isPackaged) return
  // Every 10 minutes: starting a second instance is harmless (single-instance lock) and relaunches a dead one.
  execFile('schtasks', ['/Create', '/F', '/SC', 'MINUTE', '/MO', '10', '/TN', 'DropShipper Poste d analyses', '/TR', `"${process.execPath}"`], () => {})
}

function demarrageAuto() {
  if (process.platform === 'win32' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: true })
}

// ---- IPC
function brancher() {
  const h = (canal, fn) => ipcMain.handle(canal, async (_e, arg) => {
    try { return { ok: true, valeur: await fn(arg) } } catch (err) { return { ok: false, erreur: String((err && err.message) || err) } }
  })
  h('etat', () => etat())
  h('reglages', (r) => {
    const permis = ['modele', 'espaceAnthropic', 'heureNuit', 'envoiAuSite', 'apiBase', 'plafondPages', 'plafondDeuxiemeVague']
    for (const k of permis) if (r[k] !== undefined) cfg[k] = r[k]
    if (!/^\d{2}:\d{2}$/.test(cfg.heureNuit)) throw new Error('Heure invalide (HH:MM).')
    cfg.espaceAnthropic = String(cfg.espaceAnthropic || '').trim()
    if (cfg.espaceAnthropic && !/^[A-Za-z0-9_-]{6,80}$/.test(cfg.espaceAnthropic)) throw new Error('Identifiant d’espace de travail invalide (lettres, chiffres, _ et - seulement).')
    cfg.plafondPages = Math.max(5, Math.min(60, Number(cfg.plafondPages) || 25))
    cfg.plafondDeuxiemeVague = Math.max(5, Math.min(40, Number(cfg.plafondDeuxiemeVague) || 26))
    if (r.signauxPublics) {
      const a = cfg.signauxPublics || {}
      cfg.signauxPublics = {
        ...a,
        meta: Boolean(r.signauxPublics.meta),
        trends: Boolean(r.signauxPublics.trends),
        plafondPubsParRayon: Math.max(1, Math.min(12, Number(r.signauxPublics.plafondPubsParRayon) || a.plafondPubsParRayon || 6)),
      }
    }
    if (r.serperEtendu) {
      const a = { ...serperEtendu.PAR_DEFAUT, ...(cfg.serperEtendu || {}) }
      cfg.serperEtendu = {
        shopping: Boolean(r.serperEtendu.shopping),
        autocomplete: Boolean(r.serperEtendu.autocomplete),
        images: Boolean(r.serperEtendu.images),
        plafondShopping: Math.max(1, Math.min(40, Number(r.serperEtendu.plafondShopping) || a.plafondShopping)),
        plafondImages: Math.max(1, Math.min(40, Number(r.serperEtendu.plafondImages) || a.plafondImages)),
      }
    }
    sauver()
    return etat()
  })
  // Which rayons the night runs: `ids` = list of category ids, or null for all of them.
  h('rayons-nuit', ({ ids }) => {
    if (ids === null) cfg.rayonsNuit = null
    else {
      const connus = new Set(agents.charger().categories.map((c) => c.id))
      if (!Array.isArray(ids)) throw new Error('Liste de rayons invalide.')
      const choisis = [...new Set(ids.map(String))].filter((id) => connus.has(id))
      cfg.rayonsNuit = choisis.length === connus.size ? null : choisis
    }
    sauver()
    return etat()
  })
  h('secret', ({ nom, valeur }) => { cfg = config.poserSecret(cfg, nom, String(valeur || '').trim(), safeStorage); sauver(); return etat() })
  h('credits', async () => {
    const { serper, claude } = fournisseurs()
    return controleCredits({ serper, claude })
  })
  h('rayon-test', (r) => lancerUnRayon(r))
  h('nuit-lancer', () => lancerLaNuit())
  h('nuit-arreter', () => { nuit.arret.demande = true; return true })
  h('nuit-auto', async ({ actif }) => {
    if (actif) {
      const n = rayonsDeLaNuit(jourLocal()).length
      if (!n) throw new Error('Aucun rayon coché : cochez au moins un rayon dans « Rayons du jour ».')
      const ok = await accord('Activer la nuit automatique à ' + cfg.heureNuit + ' ?', `Le poste lancera seul ${n === 24 ? 'les 24 rayons' : `les ${n} rayon${n > 1 ? 's' : ''} cochés`} chaque nuit (≈ ${(n * 0.39).toFixed(2).replace('.', ',')} € par nuit). Vous pouvez la couper ici à tout moment.`)
      if (!ok) return etat()
      cfg.accordNuitLe = new Date().toISOString()
    }
    cfg.nuitActivee = Boolean(actif)
    sauver()
    return etat()
  })
  h('source-ajouter', (brut) => {
    const s = sourcesLib.normaliser(brut, cfg.sources)
    cfg.sources = [...cfg.sources.filter((x) => x.id !== s.id), s]
    sauver()
    return etat()
  })
  h('source-supprimer', (id) => { cfg.sources = cfg.sources.filter((s) => s.id !== id); if (sourceAffichee === id) fermerNavigateur(); sauver(); return etat() })
  h('source-verifier', async (id) => {
    const s = cfg.sources.find((x) => x.id === id)
    if (!s) throw new Error('Source inconnue.')
    const e = await veille.verifierSession(s, lecteur())
    etatsSources[id] = e
    prevenirSiSession({ [id]: e })
    envoyerEtat()
    return e
  })
  h('nav-afficher', ({ id, bounds }) => { afficherSource(id, bounds); return true })
  h('nav-placer', (bounds) => { if (vueNavigateur) vueNavigateur.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) }); return true })
  h('nav-masquer', () => { fermerNavigateur(); return true })
  h('nav-action', ({ action, url }) => {
    if (!vueNavigateur) return false
    const wc = vueNavigateur.webContents
    if (action === 'retour' && wc.canGoBack()) wc.goBack()
    else if (action === 'avance' && wc.canGoForward()) wc.goForward()
    else if (action === 'recharger') wc.reload()
    else if (action === 'aller') {
      const u = /^https?:\/\//i.test(url) ? url : `https://${url}`
      wc.loadURL(u)
    }
    return true
  })
  if (BANC) h('banc-quitter', () => { quitter = true; setTimeout(() => app.quit(), 200); return true })
  h('depot-ouvrir', () => shell.openPath(racine))
  h('rapport-ouvrir', ({ categorie, theme, type }) => {
    const c = depot.cheminsRapport(racine, jourLocal(), categorie, theme)
    return shell.openPath(type === 'marketing' ? c.marketing : type === 'json' ? c.json : c.rayon)
  })
}

// ---- window, tray
function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'DropShipper Poste d’analyses',
    show: !process.argv.includes('--cache'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  fenetre.setMenuBarVisibility(false)
  fenetre.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  fenetre.on('close', (e) => {
    if (!quitter && !BANC) { e.preventDefault(); fenetre.hide() } // the agents keep living in the tray
  })
}

function creerTray() {
  try {
    const icone = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 })
    tray = new Tray(icone)
    tray.setToolTip('DropShipper Poste d’analyses')
    const montrer = () => { fenetre.show(); fenetre.focus() }
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir', click: montrer },
      { label: 'Ouvrir le dossier de dépôt', click: () => shell.openPath(racine) },
      { type: 'separator' },
      { label: 'Quitter', click: () => { quitter = true; app.quit() } },
    ]))
    tray.on('click', montrer)
  } catch { /* no tray on this system */ }
}

// ---- scheduler: the night only if Max switched it on; sessions kept warm on a fixed cadence
function demarrerPlanificateur() {
  return planifier({
    maintenant: () => new Date(),
    config: () => cfg,
    nuitEnCours: () => nuit.enCours,
    dejaFaiteAujourdhui: () => rapportsDuJourTousValides(),
    lancerNuit: () => lancerLaNuit({ automatique: true }),
    garderSessions: async () => {
      for (const s of cfg.sources.filter((x) => x.actif)) {
        if (nuit.enCours) return
        try {
          const e = await veille.verifierSession(s, lecteur())
          etatsSources[s.id] = e
          prevenirSiSession({ [s.id]: e })
        } catch (err) {
          etatsSources[s.id] = { etat: 'injoignable', raison: String(err.message || err) }
        }
      }
      envoyerEtat()
    },
    journal,
  })
}

function rapportsDuJourTousValides() {
  const date = jourLocal()
  return agents.rayonsDuJour(agents.charger(), date).every((r) => rapportValide(racine, date, r.categorie, r.theme))
}

if (!app.requestSingleInstanceLock() && !BANC) {
  app.quit()
} else {
  app.on('second-instance', () => { if (fenetre) { fenetre.show(); fenetre.focus() } })
  app.whenReady().then(() => {
    cfg = config.charger(dossierDonnees())
    try {
      racine = creerArborescence(racineDepot(cfg))
    } catch {
      // C:\ not writable for this user: fall back to Documents rather than not starting
      racine = creerArborescence(path.join(app.getPath('documents'), 'DropShipper-Analyses'))
    }
    cfg.depot = racine
    sauver()
    preparerPrompt()
    journal = creerJournal(racine)
    journal.info('Poste démarré', { version: app.getVersion() })
    // Keeps the app (and its timers) running when nobody is looking; the screen may still sleep.
    bloqueurVeille = powerSaveBlocker.start('prevent-app-suspension')
    brancher()
    creerFenetre()
    creerTray()
    demarrageAuto()
    chienDeGarde()
    demarrerPlanificateur()
  })
  app.on('before-quit', () => { quitter = true })
  app.on('window-all-closed', () => { if (BANC) app.quit() })
}
