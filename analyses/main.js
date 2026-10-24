'use strict'
/**
 * KANTIX ANALYSER (formerly the DropShipper Poste d'analyses) — main process.
 *
 * Since 0.5.0 (24/10/2026) the app is a producer of market analyses for several
 * projects (sites) of Max and his team: API keys of ~10 providers, projects with
 * a signed feed and a folder, analyses written with Claude and scheduled, a
 * browser whose tabs stay open and logged in. DropShipper is one connector among
 * others: everything below about rayons, the night and the site's admin is the
 * DropShipper connector, unchanged.
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
const { app, BrowserWindow, WebContentsView, ipcMain, safeStorage, shell, dialog, Tray, Menu, Notification, powerSaveBlocker, nativeImage, clipboard } = require('electron')

const config = require('./lib/config')
const admin = require('./lib/admin')
const { racineDepot, creerArborescence, jourLocal } = require('./lib/chemins')
const { creerJournal } = require('./lib/journal')
const agents = require('./lib/agents')
const { creerSerper } = require('./lib/serper')
const { creerClaude } = require('./lib/claude')
const { creerRechercheClaude, coutDollars } = require('./lib/recherche-claude')
const { lirePage } = require('./lib/pages')
const { executerRayon } = require('./lib/rayon')
const signauxPublics = require('./lib/signaux')
const serperEtendu = require('./lib/serper-etendu')
const { controleCredits, lancerNuit, rapportValide } = require('./lib/orchestrateur')
const depot = require('./lib/depot')
const sourcesLib = require('./lib/sources')
const veille = require('./lib/veille')
const { planifier } = require('./lib/planificateur')
const kantix = require('./lib/kantix')
const ia = require('./lib/fournisseurs-ia')
const recurrence = require('./lib/recurrence')
const fluxLib = require('./lib/flux')
const briefLib = require('./lib/brief')
const { executerAnalyse } = require('./lib/executer-analyse')

// A weak PC without a GPU: do not ask Chromium for one.
app.disableHardwareAcceleration()

const BANC = process.env.DROPSHIPPER_POSTE_BANC === '1'
if (process.env.DROPSHIPPER_POSTE_PROFIL) app.setPath('userData', process.env.DROPSHIPPER_POSTE_PROFIL)
// The app was renamed KANTIX ANALYSER (0.5.0): its data folder keeps the old name, or the keys,
// the settings and every logged-in browser session of the Poste would be lost.
else app.setPath('userData', path.join(app.getPath('appData'), "DropShipper Poste d'analyses"))
const NOM_APP = 'KANTIX ANALYSER'

let fenetre = null
let tray = null
// browser tabs: one live view per site, kept open between visits (KANTIX, 0.5.0)
const vues = new Map()
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
// The DropShipper connector's Anthropic key is chosen among KANTIX's keys; the old slot stays as a fallback.
function secret(nom) {
  if (nom === 'anthropic') {
    const id = cfg.connecteurs && cfg.connecteurs.dropshipper && cfg.connecteurs.dropshipper.cleId
    const v = id ? config.lireSecret(cfg, kantix.nomSecretCle(id), safeStorage) : null
    if (v) return v
  }
  return config.lireSecret(cfg, nom, safeStorage)
}

// ---- providers (keys read at use time: Max may change them)
// Serper is only built when Max chose it: without a Serper key the Poste searches with Claude.
const moteurSerper = () => cfg.moteurRecherche === 'serper'
function fournisseurs() {
  const claude = creerClaude({ cle: secret('anthropic'), modele: cfg.modele, espace: cfg.espaceAnthropic, url: process.env.POSTE_URL_CLAUDE || undefined })
  if (moteurSerper()) return { serper: creerSerper({ cle: secret('serper'), url: process.env.POSTE_URL_SERPER || undefined }), recherche: null, claude }
  const recherche = creerRechercheClaude({ cle: secret('anthropic'), modele: modeleRecherche(), espace: cfg.espaceAnthropic, url: process.env.POSTE_URL_CLAUDE || undefined })
  return { serper: null, recherche, claude }
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

// last state notified per source: a lost session is said once, not again at every 30-minute check (16/10/2026)
const etatsNotifies = {}
function prevenirSiSession(etats) {
  for (const s of cfg.sources) {
    const e = etats[s.id]
    if (!e) continue
    const avant = etatsNotifies[s.id]
    etatsNotifies[s.id] = e.etat
    if (avant === e.etat) continue
    if (e.etat === 'deconnecte' || e.etat === 'bloque') notifier(`Source « ${s.nom} »`, `${e.etat === 'bloque' ? 'Blocage' : 'Session perdue'} : ${e.raison}. Ouvrez son onglet dans « Navigateur » pour vous reconnecter.`)
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

// Extra Serper readings (Shopping, autocomplete, images); null when Max switched all three off or searches with Claude.
function serperEtenduActif() {
  if (!moteurSerper()) return null
  const c = { ...serperEtendu.PAR_DEFAUT, ...(cfg.serperEtendu || {}) }
  return c.shopping || c.autocomplete || c.images ? c : null
}

// Serper credits one rayon may spend at most: 20 wave-1 + 26 wave-2 searches, plus the extra readings.
function creditsSerperParRayon() {
  const c = serperEtenduActif()
  return 20 + (cfg.plafondDeuxiemeVague || 26) + (c ? (c.autocomplete ? 7 : 0) + (c.shopping ? c.plafondShopping : 0) + (c.images ? c.plafondImages : 0) : 0)
}

// The search lots only run the queries and cite the pages: the cheapest model does it, unless Max names one.
// (Measured 11/10 with Sonnet 5.5: 505 k input tokens for 46 searches = 1,01 $, more than the searches themselves.)
const MODELE_RECHERCHE_DEFAUT = 'claude-haiku-5-5'
const modeleRecherche = () => cfg.modeleRecherche || MODELE_RECHERCHE_DEFAUT

// What one rayon costs, said before Max says yes. Claude search: $0.01 per search (Anthropic's price)
// plus the tokens of the results read (estimated; the real amount is written in the journal).
const EUR = (n) => n.toFixed(2).replace('.', ',')
function coutParRayon(n = 1) {
  if (moteurSerper()) return `environ ${EUR(n * 0.39)} € chez Anthropic et jusqu’à ${n * creditsSerperParRayon()} crédits Serper`
  // wave 1 + wave 2 (selling prices) + sourcing on supplier sites (at most 20)
  const recherches = 20 + (cfg.plafondDeuxiemeVague || 26) + Math.min(20, cfg.plafondDeuxiemeVague || 26)
  // measured on the first real rayon (electromenager/sols, 11/10): per search ~11 000 tokens read and ~700
  // written; the report call 69 000 read and 21 000 written
  const dollars = coutDollars({ recherches, entree: recherches * 11000, sortie: recherches * 700 }, modeleRecherche()) + coutDollars({ entree: 72000, sortie: 21500 }, cfg.modele)
  return `environ ${EUR(n * dollars * 0.86)} € chez Anthropic, tout compris (${n * recherches} recherches web à 0,01 $ chacune, la lecture des résultats et le rapport ; aucun Serper). Le montant réel s’inscrit dans le journal`
}

// The rayons of the night, as chosen by Max (all of them until he chooses).
const rayonsDeLaNuit = (date) => agents.choisirRayons(agents.rayonsDuJour(agents.charger(), date), cfg.rayonsNuit)

function depsRayon(date) {
  const { serper, recherche, claude } = fournisseurs()
  return {
    serper,
    recherche,
    claude,
    signaux: signauxDuRayon(date),
    serperEtendu: serperEtenduActif(),
    pages: (u) => lirePage(u),
    releves: () => lectureSources(date),
    // Google keyword volumes go through the site (its Railway variables hold Google's key)
    appelerAdmin: secret('admin') && cfg.apiBase ? ({ chemin, corps }) => admin.appelerAdmin({ apiBase: cfg.apiBase, cle: secret('admin'), chemin, corps }) : null,
    journal,
    racine,
  }
}

/**
 * The agent's prompt lives in <depot>/prompts/rayon.md so Max can replace it by
 * his original one (the one of the n8n agent) without touching the app.
 */
const fichierPrompt = () => path.join(racine, 'prompts', 'rayon.md')
// SHA-256 of the prompts shipped by earlier versions: a copy Max never edited is upgraded, an edited one is left alone.
const PROMPTS_LIVRES = new Set([
  '121cb3a0bab83bd6afe620ae8e3f8066df8b28ad7a7af948ad953f45fac47b96',
  'b0b3e1ad096127c0efafabf4ab1d9eb7504509b457d232ac659b083939b506d0',
  'eefed451c162c5bcc4da39e35ac29f3693f4ad8a7f8ba7ff286f99feebe90716',
  'bc3eb85696999a9e5b75469082845ec926bc7a3935dcd3abf9747a6d1b050ef0',
])
function preparerPrompt() {
  const cible = fichierPrompt()
  const source = path.join(__dirname, 'prompts', 'rayon.md')
  if (!fs.existsSync(cible)) return fs.copyFileSync(source, cible)
  const empreinte = require('node:crypto').createHash('sha256').update(fs.readFileSync(cible)).digest('hex')
  if (PROMPTS_LIVRES.has(empreinte)) fs.copyFileSync(source, cible)
}

function optionsRayon() {
  const cleAdmin = secret('admin')
  return {
    fichierPrompt: fichierPrompt(),
    plafondPages: cfg.plafondPages,
    plafondDeuxiemeVague: cfg.plafondDeuxiemeVague,
    // the bench's fake web lives on 127.0.0.1 and stands for the supplier sites
    domainesFournisseurs: BANC ? ['127.0.0.1'] : Array.isArray(cfg.domainesFournisseurs) && cfg.domainesFournisseurs.length ? cfg.domainesFournisseurs : undefined,
    modele: cfg.modele,
    envoyer: cfg.envoiAuSite && cleAdmin ? (rapport) => depot.envoyerRapportAuSite({ apiBase: cfg.apiBase, cle: cleAdmin, rapport }) : null,
  }
}

// ---- hard gate: a costly launch needs Max's explicit yes, in a native dialog
async function accord(message, detail, bouton = 'Oui, lancer') {
  if (BANC) return true
  const r = await dialog.showMessageBox(fenetre, {
    type: 'question',
    buttons: ['Non', bouton],
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

// The rayon Max picked on the dashboard ({categorie, theme} ids, checked against agents.json);
// without a choice, the first rayon of the day.
function rayonDuTest(choix, date) {
  const tous = agents.charger()
  if (!choix || !choix.categorie) return agents.rayonsDuJour(tous, date)[0]
  const c = tous.categories.find((x) => x.id === choix.categorie)
  if (!c) throw new Error('Rayon inconnu : ' + choix.categorie)
  const t = c.themes.find((x) => x.id === choix.theme) || agents.themeDuJour(c, date)
  return { categorie: c.id, libelleCategorie: c.nom, theme: t.id, libelleTheme: t.nom, date }
}

async function lancerUnRayon(choix) {
  if (nuit.enCours) throw new Error('Une exécution est déjà en cours.')
  const date = jourLocal()
  const rayon = rayonDuTest(choix, date)
  const ok = await accord(`Lancer UN rayon test (${rayon.libelleCategorie} › ${rayon.libelleTheme}) ?`, `Coût estimé : ${coutParRayon(1)}.`)
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
      `Coût estimé : ${coutParRayon(n)}. ${choisis.map((r) => r.libelleCategorie).join(', ')}.${n === 24 ? ' Faites d’abord un rayon test.' : ''}`,
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
    // Reports whose sending failed during the night (site restarting...) go out now.
    try { await envoyerEnAttente() } catch (err) { journal.erreur('Envoi au site interrompu', { raison: String((err && err.message) || err) }) }
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

// ---- reports to the site: every validated report, rayon AND marketing in one call, filed by the site itself
let envoiEnCours = false

/**
 * Sends the validated reports (last 7 days) the site has not received yet.
 * Idempotent: a report already sent (and not rewritten since) is skipped, and the
 * site replaces a re-sent one. A failure never loses a report: it stays on disk
 * and is retried at the end of the next run or by the button.
 */
async function envoyerEnAttente() {
  if (envoiEnCours) return { envoyes: 0, echecs: [], occupe: true }
  const cle = secret('admin')
  if (!cfg.envoiAuSite) return { envoyes: 0, echecs: [], raison: 'L’envoi au site est coupé dans Réglages.' }
  if (!cle) return { envoyes: 0, echecs: [], raison: 'Clé d’administration du Poste absente (l’onglet Administration).' }
  envoiEnCours = true
  const bilan = { envoyes: 0, echecs: [] }
  try {
    for (const r of depot.rapportsAEnvoyer(racine)) {
      try {
        const reponse = await depot.envoyerRapportAuSite({ apiBase: cfg.apiBase, cle, rapport: r.rapport })
        depot.marquerEnvoye(racine, r.date, r.categorie, r.theme, { rapportEcritLe: r.rapport.poste.ecritLe, reponse })
        journal.info(`${r.categorie}/${r.theme} : envoyé au site (rayon et marketing)`, { jour: r.date })
        bilan.envoyes++
      } catch (err) {
        const message = String((err && err.message) || err)
        bilan.echecs.push({ rayon: `${r.categorie}/${r.theme}`, jour: r.date, message })
        journal.erreur(`${r.categorie}/${r.theme} : envoi au site refusé`, { raison: message })
        // A refusal about the key or the server itself is systemic: the next report would hit the same wall.
        if (/\((401|403|5\d\d)\)|fetch failed/.test(message)) break
      }
    }
  } finally {
    envoiEnCours = false
    envoyerEtat()
  }
  return bilan
}

// ---- the Poste as general administrator of the site (Max only)
// The key is made here, kept in the OS vault and never sent to the screen: only its fingerprint is shown.
function adminEtat() {
  const cle = secret('admin')
  return { cle: Boolean(cle), empreinte: cle ? admin.empreinte(cle) : null, apiBase: cfg.apiBase }
}
function cleAdminOuErreur() {
  const cle = secret('admin')
  if (!cle) throw new Error('Pas encore de clé d’administration : créez-la dans l’onglet Administration.')
  return cle
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
          const theme = f.replace(/\.json$/, '')
          const envoi = depot.lireEnvoi(racine, date, c, theme)
          out.push({ categorie: c, theme, envoyeLe: envoi ? envoi.envoyeLe : null, statut: (j.poste && j.poste.statut) || '?', produits: (j.products || []).length, problemes: (j.poste && j.poste.problemes) || [] })
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* no report yet */ }
  return out
}

function etat() {
  const date = jourLocal()
  return {
    nom: NOM_APP,
    version: app.getVersion(),
    depot: racine,
    date,
    // « anthropic » = the key the DropShipper connector will use (chosen in KANTIX's keys, or the old slot)
    secrets: { ...config.etatSecrets(cfg), anthropic: Boolean(secret('anthropic')) },
    kantix: etatKantix(),
    reglages: {
      modele: cfg.modele, modeleRecherche: cfg.modeleRecherche || '', moteurRecherche: moteurSerper() ? 'serper' : 'claude', coutParRayon: coutParRayon(1), espaceAnthropic: cfg.espaceAnthropic || '', heureNuit: cfg.heureNuit, nuitActivee: cfg.nuitActivee, envoiAuSite: cfg.envoiAuSite, apiBase: cfg.apiBase,
      plafondPages: cfg.plafondPages, plafondDeuxiemeVague: cfg.plafondDeuxiemeVague,
      signauxPublics: { meta: true, trends: true, plafondPubsParRayon: 6, plafondTendancesParRayon: 2, ...(cfg.signauxPublics || {}) },
      serperEtendu: { ...serperEtendu.PAR_DEFAUT, ...(cfg.serperEtendu || {}) },
      creditsSerperParRayon: creditsSerperParRayon(),
    },
    admin: adminEtat(),
    envoi: { actif: Boolean(cfg.envoiAuSite), cle: Boolean(secret('admin')), apiBase: cfg.apiBase, enAttente: depot.rapportsAEnvoyer(racine).length },
    nuit: { enCours: nuit.enCours, progression: nuit.progression, dernierBilan: nuit.dernierBilan },
    // every category and its 7 themes, for the rayon test picker
    catalogue: agents.charger().categories.map((c) => ({ id: c.id, nom: c.nom, themeDuJour: agents.themeDuJour(c, date).id, themes: c.themes.map((t) => ({ id: t.id, nom: t.nom })) })),
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

// ---- the browser: one tab (live view) per site, kept open and logged in (KANTIX 0.5.0).
// Only the tab on screen is attached to the window; the others stay alive behind it. Their state is read
// from the page they show (no reload, no extra traffic) at each load and every 5 minutes.
const INSPECTION = '({ texte: ((document.body && document.body.innerText) || "").slice(0, 20000), pw: !!document.querySelector("input[type=password]"), url: location.href })'
const CADENCE_ONGLETS_MS = 5 * 60e3

async function inspecterOnglet(id) {
  const v = vues.get(id)
  const s = cfg.sources.find((x) => x.id === id)
  if (!v || !s || v.webContents.isDestroyed() || v.webContents.isLoading()) return
  try {
    const page = await v.webContents.executeJavaScript(INSPECTION)
    const e = sourcesLib.etatSession(s, { url: page.url, texte: page.texte, champMotDePasse: page.pw })
    etatsSources[id] = { ...e, vuLe: new Date().toISOString() }
    prevenirSiSession({ [id]: e })
    envoyerEtat()
  } catch { /* page in transition */ }
}

function ouvrirOnglet(s) {
  if (vues.has(s.id)) return vues.get(s.id)
  const v = new WebContentsView({ webPreferences: { partition: sourcesLib.partition(s), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  vues.set(s.id, v)
  const wc = v.webContents
  const navigue = (_e, url) => { if (sourceAffichee === s.id) envoyer('nav', { url }) }
  wc.on('did-navigate', navigue)
  wc.on('did-navigate-in-page', navigue)
  wc.on('did-finish-load', () => setTimeout(() => inspecterOnglet(s.id), 1500))
  wc.on('render-process-gone', () => { vues.delete(s.id); if (sourceAffichee === s.id) sourceAffichee = null; envoyerEtat() })
  // a link that opens a new window stays in this tab (its session)
  wc.setWindowOpenHandler(({ url }) => { wc.loadURL(url); return { action: 'deny' } })
  wc.loadURL(s.urlConnexion).catch(() => {})
  return v
}

function fermerOnglet(id) {
  const v = vues.get(id)
  if (!v) return
  try { fenetre.contentView.removeChildView(v) } catch { /* not attached */ }
  try { v.webContents.close() } catch { /* already gone */ }
  vues.delete(id)
  if (sourceAffichee === id) sourceAffichee = null
}

// hides the tab on screen; it keeps living (and stays logged in)
function fermerNavigateur() {
  const v = sourceAffichee && vues.get(sourceAffichee)
  if (v) try { fenetre.contentView.removeChildView(v) } catch { /* not attached */ }
  sourceAffichee = null
}

function afficherSource(id, bounds) {
  const s = cfg.sources.find((x) => x.id === id)
  if (!s) throw new Error('Onglet inconnu.')
  if (sourceAffichee !== id) {
    fermerNavigateur()
    fenetre.contentView.addChildView(ouvrirOnglet(s))
    sourceAffichee = id
    envoyer('nav', { url: vues.get(id).webContents.getURL() || s.urlConnexion })
  }
  if (bounds) vues.get(id).setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) })
}

// tabs kept open start with the app, one every 3 s (a weak PC)
function ouvrirOngletsGardes() {
  const gardes = cfg.sources.filter((s) => s.actif && s.garderOuvert !== false)
  gardes.forEach((s, i) => setTimeout(() => { try { ouvrirOnglet(s) } catch { /* window gone */ } }, 2000 + i * 3000))
  const t = setInterval(() => { for (const id of vues.keys()) inspecterOnglet(id) }, CADENCE_ONGLETS_MS)
  if (t.unref) t.unref()
}

// ---- Windows: start with the session and restart after a crash, ONLY while the automatic night is on.
// Until 0.3.5 both were always on and not discreet (12/10, BIGWORK): a scheduled task launched the exe every
// 10 minutes, each launch brought the window back to the front, and a « Quitter » was undone within 10 minutes.
// Launches made by the watchdog or at login now carry an argument and stay in the tray.
const ARG_GARDE = '--garde'
const ARG_DEMARRAGE = '--demarrage'
const lancementDiscret = (argv) => [ARG_GARDE, ARG_DEMARRAGE, '--cache'].some((a) => argv.includes(a))
// written by « Quitter »: the watchdog respects it, a launch by hand or at login removes it
const fichierArretVolontaire = () => path.join(dossierDonnees(), 'arret-volontaire')

const NOM_LANCEMENT = 'DropShipper Poste d analyses'

function lancementsAutomatiques() {
  if (process.platform !== 'win32' || !app.isPackaged) return
  // 0.3.5 and older wrote a Run entry under the generic name « electron.app.Electron »: always removed
  app.setLoginItemSettings({ openAtLogin: false })
  // KANTIX: a scheduled analysis needs the app running too
  const actif = Boolean(cfg.nuitActivee) || cfg.analyses.some((a) => a.recurrence && a.recurrence.type !== 'aucune')
  app.setLoginItemSettings({ openAtLogin: actif, name: NOM_LANCEMENT, args: [ARG_DEMARRAGE] })
  // Every 10 minutes: a running Poste only sees a discreet second instance; a dead one comes back in the tray.
  const tache = actif
    ? ['/Create', '/F', '/SC', 'MINUTE', '/MO', '10', '/TN', NOM_LANCEMENT, '/TR', `"${process.execPath}" ${ARG_GARDE}`]
    : ['/Delete', '/F', '/TN', NOM_LANCEMENT]
  execFile('schtasks', tache, () => {})
}

function quitterVolontairement() {
  try { fs.writeFileSync(fichierArretVolontaire(), new Date().toISOString()) } catch { /* the watchdog will relaunch it, hidden */ }
  quitter = true
  app.quit()
}

// ---- KANTIX ANALYSER: keys, projects, analyses, briefs, connectors (0.5.0)
const secretCle = (id) => config.lireSecret(cfg, kantix.nomSecretCle(id), safeStorage)
const secretFlux = (id) => config.lireSecret(cfg, kantix.nomSecretFlux(id), safeStorage)
// The bench points every provider at its fake server.
const cleAppelable = (c) => (BANC && process.env.KANTIX_URL_IA ? { ...c, base: process.env.KANTIX_URL_IA } : c)
const espaceDe = (c) => (c.fournisseur === 'anthropic' ? cfg.espaceAnthropic || '' : '')

// a project or an analysis without its own folder writes under the deposit, so a run never has nowhere to go
const dossierParDefaut = (projet) => path.join(racine, 'projets', projet.id)
function dossierDe(analyse, projet) {
  const d = (analyse && analyse.dossier) || (projet && projet.dossier)
  return d && d.chemin ? d.chemin : dossierParDefaut(projet)
}

const executions = { file: [], enCours: null, historique: [] }
const fichierHistorique = () => path.join(dossierDonnees(), 'executions.json')
function chargerHistorique() {
  try { executions.historique = JSON.parse(fs.readFileSync(fichierHistorique(), 'utf8')) } catch { executions.historique = [] }
}
function noterExecution(ligne) {
  executions.historique = [ligne, ...executions.historique].slice(0, 300)
  try { fs.writeFileSync(fichierHistorique(), JSON.stringify(executions.historique, null, 1)) } catch { /* the journal has it too */ }
}

async function lireOnglets(ids) {
  const choisies = cfg.sources.filter((s) => ids.includes(s.id)).map((s) => {
    const v = vues.get(s.id)
    const courante = v && !v.webContents.isDestroyed() ? v.webContents.getURL() : ''
    return { ...s, actif: true, pages: s.pages.length ? s.pages : [courante || s.urlConnexion] }
  })
  if (!choisies.length) return { lectures: [], problemes: ['Les onglets de cette analyse n’existent plus.'] }
  const { lectures, etats } = await veille.releverSources({ sources: choisies, lire: lecteur(), racine, date: jourLocal(), journal })
  etatsSources = { ...etatsSources, ...etats }
  prevenirSiSession(etats)
  const problemes = choisies.filter((s) => etats[s.id] && etats[s.id].etat !== 'connecte').map((s) => `Onglet « ${s.nom} » non lu : ${etats[s.id].etat} — ${etats[s.id].raison}`)
  return { lectures, problemes }
}

async function envoyerAuFlux(projet, rapport) {
  const adresse = projet.flux && projet.flux.adresse
  if (!adresse) return { statut: 'sans-adresse' }
  try {
    const r = await fluxLib.envoyerRapport({ adresse, secret: secretFlux(projet.id), rapport })
    journal.info(`Flux ${projet.nom} : rapport « ${rapport.analyse.nom} » reçu par le site`, { code: r.statut })
    return { statut: 'envoye', code: r.statut, le: new Date().toISOString() }
  } catch (err) {
    const message = String((err && err.message) || err)
    journal.erreur(`Flux ${projet.nom} : envoi refusé`, { raison: message })
    return { statut: 'echec', message, le: new Date().toISOString() }
  }
}

async function executerUne(analyseId, creneau, origine) {
  const a = cfg.analyses.find((x) => x.id === analyseId)
  if (!a) return
  const debut = new Date()
  const ligne = { id: `${analyseId}-${debut.getTime()}`, analyseId, analyse: a.nom, projetId: a.projetId, debut: debut.toISOString(), origine, creneau: creneau ? creneau.toISOString() : null }
  executions.enCours = { analyseId, nom: a.nom, debut: debut.toISOString() }
  envoyerEtat()
  try {
    const projet = cfg.projets.find((p) => p.id === a.projetId)
    if (!projet) throw new Error('Projet supprimé : reliez l’analyse à un projet.')
    const cleInfo = cfg.cles.find((c) => c.id === projet.cleId)
    if (!cleInfo) throw new Error(`Le projet « ${projet.nom} » n’a pas de clé API (onglet Projets).`)
    const f = ia.fournisseur(cleInfo.fournisseur)
    const res = await executerAnalyse({
      analyse: a,
      projet,
      dossierSortie: dossierDe(a, projet),
      generer: (args) => ia.generer({ ...args, cleInfo: cleAppelable(cleInfo), cle: secretCle(cleInfo.id), espace: espaceDe(cleInfo) }),
      rechercheDisponible: Boolean(f && f.recherche),
      lireOnglets,
      journal,
    })
    // « à revoir » never goes to the site by itself (same rule as the DropShipper reports)
    const flux = res.rapport.statut === 'ok' ? await envoyerAuFlux(projet, res.rapport) : { statut: 'retenu', message: 'rapport à revoir : envoi à faire à la main après lecture' }
    Object.assign(ligne, { statut: res.rapport.statut, problemes: res.rapport.problemes, fichier: res.fichiers.md, json: res.fichiers.json, flux, usage: res.rapport.moteur.usage, moteur: `${res.rapport.moteur.fournisseur}/${res.rapport.moteur.modele}` })
    notifier(`Analyse « ${a.nom} »`, res.rapport.statut === 'ok' ? `Rapport validé${flux.statut === 'envoye' ? ' et reçu par le site' : flux.statut === 'echec' ? ', mais le site a refusé le flux' : ''}.` : `Rapport à revoir : ${res.rapport.problemes[0] || ''}`)
  } catch (err) {
    const message = String((err && err.message) || err)
    Object.assign(ligne, { statut: 'erreur', problemes: [message] })
    journal.erreur(`Analyse « ${a.nom} » échouée`, { raison: message })
    notifier(`Analyse « ${a.nom} » échouée`, message.slice(0, 180))
  } finally {
    ligne.fin = new Date().toISOString()
    noterExecution(ligne)
    // the slot is spent even on failure: a broken analysis is retried at the next slot, not every minute
    a.derniere = { le: ligne.fin, creneau: ligne.creneau, statut: ligne.statut, fichier: ligne.fichier || null }
    sauver()
    executions.enCours = null
    envoyerEtat()
  }
}

// one analysis at a time, in the order asked
async function viderFile() {
  if (executions.enCours) return
  while (executions.file.length) {
    const { id, creneau, origine } = executions.file.shift()
    await executerUne(id, creneau, origine)
  }
}
function mettreEnFile(id, creneau, origine) {
  if ((executions.enCours && executions.enCours.analyseId === id) || executions.file.some((x) => x.id === id)) return false
  executions.file.push({ id, creneau, origine })
  viderFile()
  return true
}

function demarrerPlanificateurAnalyses() {
  const tick = () => {
    const maintenant = new Date()
    for (const a of cfg.analyses) {
      const c = recurrence.creneauDu(a, maintenant)
      if (c && mettreEnFile(a.id, c, 'planifiée')) journal.info(`Planificateur : analyse « ${a.nom} » lancée (${recurrence.libelle(a.recurrence)})`)
    }
  }
  const t = setInterval(tick, BANC ? 2000 : 60e3)
  if (t.unref) t.unref()
  setTimeout(tick, BANC ? 500 : 15e3)
}

// Google Drive for desktop shows the Drive as a folder: « Mon Drive » / « My Drive » on a drive letter, or under the home folder.
function dossiersDrive() {
  const candidats = []
  const noms = ['Mon Drive', 'My Drive', 'Mein Ablage', 'Mi unidad']
  if (process.platform === 'win32') {
    for (const l of 'DEFGHIJKLMNOPQRSTUVWXYZ') for (const n of noms) candidats.push(`${l}:\\${n}`)
  }
  const maison = app.getPath('home')
  for (const n of noms) candidats.push(path.join(maison, 'Google Drive', n), path.join(maison, n))
  candidats.push(path.join(maison, 'Google Drive'))
  return [...new Set(candidats)].filter((c) => { try { return fs.statSync(c).isDirectory() } catch { return false } })
}

function etatKantix() {
  const maintenant = new Date()
  const avecSecret = (nom) => Boolean(cfg.secrets && cfg.secrets[nom])
  return {
    fournisseurs: ia.FOURNISSEURS.map(({ id, nom, type, recherche, console: c, modele, base }) => ({ id, nom, type, recherche, console: c, modele, base })),
    cles: cfg.cles.map((c) => ({ ...c, posee: avecSecret(kantix.nomSecretCle(c.id)), recherche: Boolean((ia.fournisseur(c.fournisseur) || {}).recherche) })),
    projets: cfg.projets.map((p) => ({ ...p, secretFlux: avecSecret(kantix.nomSecretFlux(p.id)), dossierEffectif: p.dossier && p.dossier.chemin ? p.dossier.chemin : dossierParDefaut(p) })),
    analyses: cfg.analyses.map((a) => {
      const p = cfg.projets.find((x) => x.id === a.projetId)
      return { ...a, quand: recurrence.libelle(a.recurrence), prochaine: (() => { const x = recurrence.prochainCreneau(a.recurrence, maintenant); return x ? x.toISOString() : null })(), dossierEffectif: p ? dossierDe(a, p) : null, enFile: executions.file.some((x) => x.id === a.id) }
    }),
    connecteurs: cfg.connecteurs || { dropshipper: { actif: false, cleId: null } },
    cleBriefId: cfg.cleBriefId || null,
    enCours: executions.enCours,
    historique: executions.historique.slice(0, 60),
    onglets: cfg.sources.map((s) => ({ id: s.id, ouvert: vues.has(s.id) })),
    jours: recurrence.JOURS,
  }
}

// the Anthropic key of the brief: the project's own if it is an Anthropic one, else the one chosen for briefs, else the first
function cleDuBrief(projet) {
  const anth = cfg.cles.filter((c) => c.fournisseur === 'anthropic')
  const p = projet && anth.find((c) => c.id === projet.cleId)
  return p || anth.find((c) => c.id === cfg.cleBriefId) || anth[0] || null
}

function brancherKantix(h) {
  // ---- keys
  h('cle-enregistrer', (brut) => {
    const c = kantix.normaliserCle(brut || {}, cfg.cles)
    const valeur = String((brut && brut.valeur) || '').trim()
    if (!brut.id && !valeur) throw new Error('Collez la clé API.')
    if (valeur) { cfg = config.poserSecret(cfg, kantix.nomSecretCle(c.id), valeur, safeStorage); c.verifieeLe = null }
    cfg.cles = [...cfg.cles.filter((x) => x.id !== c.id), c]
    sauver()
    journal.info(`Clé API « ${c.nom} » enregistrée`, { fournisseur: c.fournisseur })
    return etat()
  })
  h('cle-supprimer', async (id) => {
    const c = cfg.cles.find((x) => x.id === id)
    if (!c) throw new Error('Clé inconnue.')
    const projets = cfg.projets.filter((p) => p.cleId === id).map((p) => p.nom)
    const ok = await accord(`Supprimer la clé « ${c.nom} » ?`, projets.length ? `Projets qui l’utilisent et n’auront plus de clé : ${projets.join(', ')}.` : 'Aucun projet ne l’utilise.', 'Oui, supprimer')
    if (!ok) return etat()
    cfg = config.poserSecret(cfg, kantix.nomSecretCle(id), '', safeStorage)
    cfg.cles = cfg.cles.filter((x) => x.id !== id)
    for (const p of cfg.projets) if (p.cleId === id) p.cleId = null
    if (cfg.connecteurs && cfg.connecteurs.dropshipper && cfg.connecteurs.dropshipper.cleId === id) cfg.connecteurs.dropshipper.cleId = null
    if (cfg.cleBriefId === id) cfg.cleBriefId = null
    sauver()
    return etat()
  })
  // « connectée » only after a real call that worked: the provider's own model list
  h('cle-tester', async (id) => {
    const c = cfg.cles.find((x) => x.id === id)
    if (!c) throw new Error('Clé inconnue.')
    const r = await ia.listerModeles({ cleInfo: cleAppelable(c), cle: secretCle(id), espace: espaceDe(c) })
    c.verifieeLe = new Date().toISOString()
    c.modelesConnus = r.modeles.slice(0, 300)
    sauver()
    journal.info(`Clé API « ${c.nom} » vérifiée`, { modeles: r.modeles.length, nonListable: r.nonListable || undefined })
    return { ...r, etat: etat() }
  })
  h('cle-brief', ({ id }) => { cfg.cleBriefId = id || null; sauver(); return etat() })

  // ---- projects
  h('projet-enregistrer', (brut) => {
    const p = kantix.normaliserProjet(brut || {}, cfg.projets, cfg.cles)
    cfg.projets = [...cfg.projets.filter((x) => x.id !== p.id), p]
    if (p.dossier.chemin) fs.mkdirSync(p.dossier.chemin, { recursive: true })
    sauver()
    journal.info(`Projet « ${p.nom} » enregistré`)
    return etat()
  })
  h('projet-supprimer', async (id) => {
    const p = cfg.projets.find((x) => x.id === id)
    if (!p) throw new Error('Projet inconnu.')
    if (p.connecteur) throw new Error('Ce projet est celui du connecteur DropShipper : coupez le connecteur au lieu de le supprimer.')
    const liees = cfg.analyses.filter((a) => a.projetId === id)
    if (liees.length) throw new Error(`Reliez d’abord ces analyses à un autre projet ou supprimez-les : ${liees.map((a) => a.nom).join(', ')}.`)
    const ok = await accord(`Supprimer le projet « ${p.nom} » ?`, 'Ses rapports déjà écrits restent dans son dossier.', 'Oui, supprimer')
    if (!ok) return etat()
    cfg = config.poserSecret(cfg, kantix.nomSecretFlux(id), '', safeStorage)
    cfg.projets = cfg.projets.filter((x) => x.id !== id)
    sauver()
    return etat()
  })
  h('projet-secret-generer', async (id) => {
    const p = cfg.projets.find((x) => x.id === id)
    if (!p) throw new Error('Projet inconnu.')
    if (secretFlux(id)) {
      const ok = await accord('Remplacer le secret du flux ?', `Le site de ${p.nom} refusera les rapports jusqu’à ce que le NOUVEAU secret soit posé de son côté.`, 'Oui, remplacer')
      if (!ok) return etat()
    }
    cfg = config.poserSecret(cfg, kantix.nomSecretFlux(id), kantix.fabriquerSecretFlux(), safeStorage)
    sauver()
    journal.info(`Projet « ${p.nom} » : secret du flux créé`)
    return etat()
  })
  h('projet-secret-copier', (id) => {
    const v = secretFlux(id)
    if (!v) throw new Error('Pas encore de secret : « Générer le secret ».')
    clipboard.writeText(v)
    return true
  })
  h('projet-flux-tester', async (id) => {
    const p = cfg.projets.find((x) => x.id === id)
    if (!p) throw new Error('Projet inconnu.')
    const r = await fluxLib.envoyerTest({ adresse: p.flux.adresse, secret: secretFlux(id), projet: p })
    p.fluxVerifieLe = new Date().toISOString()
    sauver()
    journal.info(`Flux ${p.nom} : test reçu par le site`, { code: r.statut })
    return { ...r, etat: etat() }
  })
  // the developer's page, written in the project folder (no secret in it)
  h('projet-fiche', (id) => {
    const p = cfg.projets.find((x) => x.id === id)
    if (!p) throw new Error('Projet inconnu.')
    const dossier = p.dossier && p.dossier.chemin ? p.dossier.chemin : dossierParDefaut(p)
    fs.mkdirSync(dossier, { recursive: true })
    const fichier = path.join(dossier, 'KANTIX-FLUX.md')
    fs.writeFileSync(fichier, fluxLib.ficheTechnique(p))
    shell.openPath(fichier)
    return fichier
  })
  h('dossier-choisir', async ({ titre, depart }) => {
    if (BANC) return process.env.KANTIX_DOSSIER_BANC || null
    const r = await dialog.showOpenDialog(fenetre, { title: titre || 'Choisir un dossier', defaultPath: depart || undefined, properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  h('drive-detecter', () => dossiersDrive())
  h('dossier-ouvrir', (chemin) => { fs.mkdirSync(chemin, { recursive: true }); return shell.openPath(chemin) })
  h('fichier-ouvrir', (chemin) => shell.openPath(chemin))

  // ---- analyses
  h('analyse-enregistrer', async (brut) => {
    const a = kantix.normaliserAnalyse(brut || {}, cfg.analyses, cfg.projets, cfg.sources)
    const avant = cfg.analyses.find((x) => x.id === a.id)
    const nouvelleRecurrence = a.recurrence.type !== 'aucune' && (!avant || JSON.stringify(avant.recurrence) !== JSON.stringify(a.recurrence))
    if (nouvelleRecurrence) {
      const ok = await accord(`Planifier « ${a.nom} » : ${recurrence.libelle(a.recurrence)} ?`, 'KANTIX lancera seul cette analyse avec la clé API du projet, tant que l’application est ouverte (zone de notification). Chaque lancement est payé au fournisseur IA et s’inscrit dans le journal. Vous pouvez la passer « à la demande » à tout moment.', 'Oui, planifier')
      if (!ok) return { annule: true, etat: etat() }
      a.accordLe = new Date().toISOString()
    } else if (avant && avant.accordLe) a.accordLe = avant.accordLe
    cfg.analyses = [...cfg.analyses.filter((x) => x.id !== a.id), a]
    sauver()
    lancementsAutomatiques()
    journal.info(`Analyse « ${a.nom} » enregistrée`, { quand: recurrence.libelle(a.recurrence) })
    return { id: a.id, etat: etat() }
  })
  h('analyse-supprimer', async (id) => {
    const a = cfg.analyses.find((x) => x.id === id)
    if (!a) throw new Error('Analyse inconnue.')
    const ok = await accord(`Supprimer l’analyse « ${a.nom} » ?`, 'Ses rapports déjà écrits restent dans leur dossier.', 'Oui, supprimer')
    if (!ok) return etat()
    cfg.analyses = cfg.analyses.filter((x) => x.id !== id)
    executions.file = executions.file.filter((x) => x.id !== id)
    sauver()
    lancementsAutomatiques()
    return etat()
  })
  h('analyse-lancer', async (id) => {
    const a = cfg.analyses.find((x) => x.id === id)
    if (!a) throw new Error('Analyse inconnue.')
    const p = cfg.projets.find((x) => x.id === a.projetId)
    const c = p && cfg.cles.find((x) => x.id === p.cleId)
    if (!c) throw new Error('Le projet de cette analyse n’a pas de clé API (onglet Projets).')
    const ok = await accord(`Lancer « ${a.nom} » maintenant ?`, `Un appel à ${c.nom}${a.rechercheWeb ? ' avec recherche web' : ''}${a.onglets.length ? `, après lecture de ${a.onglets.length} onglet(s)` : ''}. Le coût réel (jetons, recherches) s’inscrit dans le journal.`)
    if (!ok) return { annule: true }
    mettreEnFile(id, null, 'à la main')
    return etat()
  })
  // sends a report again (or for the first time after review) to its project's feed
  h('rapport-envoyer', async (idExecution) => {
    const l = executions.historique.find((x) => x.id === idExecution)
    if (!l || !l.json) throw new Error('Rapport introuvable.')
    const rapport = JSON.parse(fs.readFileSync(l.json, 'utf8'))
    const projet = cfg.projets.find((p) => p.id === rapport.projet.id)
    if (!projet) throw new Error('Projet supprimé.')
    if (rapport.statut !== 'ok') {
      const ok = await accord('Envoyer un rapport « à revoir » au site ?', `Problèmes relevés : ${(rapport.problemes || []).join(' ; ').slice(0, 600)}`, 'Oui, envoyer')
      if (!ok) return { annule: true }
    }
    l.flux = await envoyerAuFlux(projet, rapport)
    if (l.flux.statut === 'echec') throw new Error(l.flux.message)
    if (l.flux.statut === 'sans-adresse') throw new Error('Ce projet n’a pas d’adresse de réception (onglet Projets).')
    noterExecution({ ...l, id: `${l.id}-renvoi-${Date.now()}`, origine: 'renvoi au site', debut: new Date().toISOString(), fin: new Date().toISOString() })
    return etat()
  })

  // ---- brief with Claude
  h('brief-nouveau', () => briefLib.nouveau(dossierDonnees()))
  h('brief-charger', (id) => ({ brief: briefLib.charger(dossierDonnees(), id), prompt: briefLib.dernierPrompt(briefLib.charger(dossierDonnees(), id)) }))
  h('brief-joindre', async () => {
    if (BANC) return (process.env.KANTIX_PIECES_BANC || '').split('|').filter(Boolean)
    const r = await dialog.showOpenDialog(fenetre, { title: 'Joindre des documents ou des images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documents et images', extensions: Object.keys(briefLib.TYPES).map((x) => x.slice(1)) }] })
    return r.canceled ? [] : r.filePaths
  })
  h('brief-envoyer', async ({ id, texte, fichiers, projetId, cleMoteurId }) => {
    const racineBriefs = dossierDonnees()
    const b = briefLib.charger(racineBriefs, id)
    const pieces = (fichiers || []).map((f) => briefLib.ajouterPiece(racineBriefs, b, f))
    if (!String(texte || '').trim() && !pieces.length) throw new Error('Écrivez quelque chose ou joignez un document.')
    const projet = cfg.projets.find((p) => p.id === projetId) || null
    const cleInfo = cleDuBrief(projet)
    if (!cleInfo) throw new Error('Le brief se fait avec Claude : ajoutez une clé Anthropic dans « Clés API ».')
    b.messages.push({ role: 'user', texte: String(texte || '').trim(), pieces, le: new Date().toISOString() })
    briefLib.enregistrer(racineBriefs, b)
    const moteur = cfg.cles.find((c) => c.id === (cleMoteurId || (projet && projet.cleId)))
    const r = await ia.generer({
      cleInfo: cleAppelable(cleInfo),
      cle: secretCle(cleInfo.id),
      espace: espaceDe(cleInfo),
      modele: cleInfo.modele || briefLib.MODELE_BRIEF,
      systeme: briefLib.systeme({
        projet,
        analysesDuProjet: cfg.analyses.filter((a) => projet && a.projetId === projet.id).map((a) => a.nom),
        onglets: cfg.sources.map((s) => s.nom),
        fournisseurMoteur: moteur ? `${moteur.nom}${(ia.fournisseur(moteur.fournisseur) || {}).recherche ? ' (avec recherche web)' : ' (sans recherche web)'}` : '',
      }),
      messages: briefLib.messagesPourIA(racineBriefs, b),
      maxTokens: 16000,
      cache: true,
    })
    if (!r.texte.trim()) throw new Error(`Claude n’a rien répondu (arrêt : ${r.arret || 'inconnu'}). Réessayez.`)
    b.messages.push({ role: 'assistant', texte: r.texte, le: new Date().toISOString(), usage: r.usage })
    briefLib.enregistrer(racineBriefs, b)
    journal.info('Brief : réponse de Claude', { brief: id, usage: r.usage })
    return { brief: b, prompt: briefLib.dernierPrompt(b) }
  })

  // ---- connectors
  h('connecteur-activer', ({ id, actif }) => {
    if (id !== 'dropshipper') throw new Error('Connecteur inconnu.')
    cfg.connecteurs = { ...(cfg.connecteurs || {}), dropshipper: { ...((cfg.connecteurs || {}).dropshipper || {}), actif: Boolean(actif) } }
    if (actif && !cfg.projets.some((p) => p.connecteur === 'dropshipper')) {
      cfg.projets.push({ id: kantix.idUnique('dropshipper', cfg.projets), nom: 'DropShipper', url: 'https://www.drop-shipper.fr', cleId: cfg.connecteurs.dropshipper.cleId || null, dossier: { type: 'local', chemin: '' }, flux: { adresse: '' }, connecteur: 'dropshipper', creeLe: new Date().toISOString() })
    }
    // coupé: the DropShipper night stops too (nothing of DropShipper runs from a disconnected connector)
    if (!actif && cfg.nuitActivee) { cfg.nuitActivee = false; lancementsAutomatiques() }
    sauver()
    journal.info(`Connecteur DropShipper ${actif ? 'connecté' : 'coupé'}`)
    return etat()
  })
  h('connecteur-cle', ({ cleId }) => {
    if (cleId && !cfg.cles.some((c) => c.id === cleId && c.fournisseur === 'anthropic')) throw new Error('Choisissez une clé Anthropic : les rayons DropShipper cherchent avec la recherche web de Claude.')
    cfg.connecteurs = { ...(cfg.connecteurs || {}), dropshipper: { ...((cfg.connecteurs || {}).dropshipper || {}), cleId: cleId || null } }
    sauver()
    return etat()
  })
}

// ---- IPC
function brancher() {
  const h = (canal, fn) => ipcMain.handle(canal, async (_e, arg) => {
    try { return { ok: true, valeur: await fn(arg) } } catch (err) { return { ok: false, erreur: String((err && err.message) || err) } }
  })
  h('etat', () => etat())
  brancherKantix(h)
  h('reglages', (r) => {
    const permis = ['modele', 'modeleRecherche', 'moteurRecherche', 'espaceAnthropic', 'heureNuit', 'envoiAuSite', 'apiBase', 'plafondPages', 'plafondDeuxiemeVague']
    for (const k of permis) if (r[k] !== undefined) cfg[k] = r[k]
    cfg.moteurRecherche = cfg.moteurRecherche === 'serper' ? 'serper' : 'claude'
    cfg.modeleRecherche = String(cfg.modeleRecherche || '').trim()
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
  // Creating (or replacing) the admin key: the old fingerprint on Railway stops working, so a replacement asks first.
  h('admin-creer', async () => {
    if (secret('admin')) {
      const ok = await accord('Remplacer la clé d’administration ?', 'L’ancienne clé cesse de fonctionner : l’envoi des rapports et l’administration du site sont coupés jusqu’à ce que la NOUVELLE empreinte soit posée dans la variable Railway POSTE_ADMIN_SHA256.')
      if (!ok) return etat()
    }
    cfg = config.poserSecret(cfg, 'admin', admin.fabriquerCle(), safeStorage)
    sauver()
    journal.info('Clé d’administration du site créée (empreinte à poser dans Railway)')
    return etat()
  })
  h('admin-copier', () => { const cle = cleAdminOuErreur(); clipboard.writeText(admin.empreinte(cle)); return true })
  h('admin-tester', async () => {
    const r = await admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/moi' })
    return { ok: r.ok === true }
  })
  // Everything the site knows about its sellers. Kept in memory on the screen only, never written to disk.
  h('admin-utilisateurs', () => admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/utilisateurs' }))
  h('admin-newsletter', () => admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/newsletter' }))
  // Back-office moved from the site into the Poste (PR #17): Drive import and affiliate payouts, same /api/admin routes.
  h('admin-drive-lister', ({ adresse }) => admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/analyses-drive/lister', corps: { adresse } }))
  h('admin-drive-importer', async ({ adresse, dates, essai }) => {
    const r = await admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/analyses-drive/importer', corps: { adresse, dates, essai: essai === true } })
    if (!essai) {
      // The reasons are only in this answer: write them down, or a refusal is a bare count once the screen is closed (12/10/2026).
      const motifs = (r.lignes || []).filter((x) => x.statut === 'refuse').map((x) => `${x.date} ${x.rayon} : ${x.raison || 'motif non donné par le site'}`)
      const ignores = (r.ignores || []).map((g) => `${g.date} ${g.nom} : ${g.raison}`)
      const ligne = { dates: dates.join(', '), importees: r.importees, doublons: r.doublons, refusees: r.refusees, ...(motifs.length ? { motifs } : {}), ...(ignores.length ? { ignores: ignores.slice(0, 50) } : {}) }
      if (r.importees === 0 && (r.refusees > 0 || !(r.lignes || []).length)) journal.erreur('Import Google Drive : rien importé', ligne)
      else journal.info('Analyses importées depuis Google Drive', ligne)
    }
    return r
  })
  // Google Keyword Planner through the site: one real call (« connecté » = a real call that worked)
  h('admin-mots-cles-essai', async () => {
    const r = await admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/mots-cles/etat?essai=1' })
    journal.info('Essai des mots-clés Google', { configure: r.configure, verifie: r.verifie, manque: (r.manque || []).join(', ') || undefined })
    return r
  })
  // Links of the site footer (facebook, instagram, whatsapp, x, linkedin, snapchat): the site checks them, the Poste only relays
  h('admin-reseaux', () => admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/reseaux-sociaux' }))
  h('admin-reseaux-enregistrer', async (liens) => {
    const r = await admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/reseaux-sociaux', corps: liens, methode: 'PUT' })
    journal.info('Réseaux sociaux du site enregistrés', { remplis: Object.keys(r.reseaux || {}).filter((k) => r.reseaux[k]).join(', ') || 'aucun' })
    return r
  })
  h('admin-affiliation', () => admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: '/affiliation' }))
  h('admin-affiliation-verser', async ({ id, nom, montant, reference }) => {
    const ok = await accord(`Enregistrer le virement de ${montant} à ${nom} ?`, 'Ses commissions dues sont soldées et il reçoit un e-mail. Faites d’abord le virement à la banque : ce bouton ne vire rien.', 'Oui, enregistrer')
    if (!ok) return { annule: true }
    const r = await admin.appelerAdmin({ apiBase: cfg.apiBase, cle: cleAdminOuErreur(), chemin: `/affiliation/${encodeURIComponent(id)}/verse`, corps: { reference: reference || null } })
    journal.info('Versement affilié enregistré', { nom, montant })
    return r
  })
  h('copier', (texte) => { clipboard.writeText(String(texte || '')); return true })
  h('secret', ({ nom, valeur }) => {
    // The admin key is made by the app (admin-creer), never typed; it can only be erased.
    if (nom === 'admin' && valeur) throw new Error('La clé d’administration est fabriquée par le Poste : utilisez « Créer la clé ».')
    cfg = config.poserSecret(cfg, nom, String(valeur || '').trim(), safeStorage); sauver(); return etat()
  })
  h('credits', async () => {
    const { serper, claude } = fournisseurs()
    return controleCredits({ serper, claude })
  })
  h('rayon-test', (r) => lancerUnRayon(r))
  h('envoyer-au-site', () => envoyerEnAttente())
  h('nuit-lancer', () => lancerLaNuit())
  h('nuit-arreter', () => { nuit.arret.demande = true; return true })
  h('nuit-auto', async ({ actif }) => {
    if (actif) {
      const n = rayonsDeLaNuit(jourLocal()).length
      if (!n) throw new Error('Aucun rayon coché : cochez au moins un rayon dans « Rayons du jour ».')
      const ok = await accord('Activer la nuit automatique à ' + cfg.heureNuit + ' ?', `Le poste lancera seul ${n === 24 ? 'les 24 rayons' : `les ${n} rayon${n > 1 ? 's' : ''} cochés`} chaque nuit. Coût par nuit : ${coutParRayon(n)}. Il démarrera avec Windows, discrètement dans la zone de notification, et reviendra seul après un plantage. Vous pouvez la couper ici à tout moment.`)
      if (!ok) return etat()
      cfg.accordNuitLe = new Date().toISOString()
    }
    cfg.nuitActivee = Boolean(actif)
    sauver()
    lancementsAutomatiques()
    return etat()
  })
  h('source-ajouter', (brut) => {
    const s = { ...sourcesLib.normaliser(brut, cfg.sources), garderOuvert: brut.garderOuvert !== false }
    cfg.sources = [...cfg.sources.filter((x) => x.id !== s.id), s]
    sauver()
    return etat()
  })
  h('source-supprimer', (id) => {
    cfg.sources = cfg.sources.filter((s) => s.id !== id)
    for (const a of cfg.analyses) a.onglets = (a.onglets || []).filter((x) => x !== id)
    fermerOnglet(id)
    sauver()
    return etat()
  })
  // keep a tab open with the app (default) or open it only when shown
  h('source-garder', ({ id, garder }) => {
    const s = cfg.sources.find((x) => x.id === id)
    if (!s) throw new Error('Onglet inconnu.')
    s.garderOuvert = Boolean(garder)
    if (!s.garderOuvert && sourceAffichee !== id) fermerOnglet(id)
    sauver()
    return etat()
  })
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
  h('nav-placer', (bounds) => { const v = sourceAffichee && vues.get(sourceAffichee); if (v) v.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) }); return true })
  h('nav-masquer', () => { fermerNavigateur(); return true })
  h('nav-action', ({ action, url }) => {
    const v = sourceAffichee && vues.get(sourceAffichee)
    if (!v) return false
    const wc = v.webContents
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
    title: `${NOM_APP} — v${app.getVersion()}`,
    show: !lancementDiscret(process.argv),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  fenetre.setMenuBarVisibility(false)
  // Keep the version in the title bar: Max must see at a glance which build he runs.
  fenetre.on('page-title-updated', (e) => e.preventDefault())
  fenetre.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  fenetre.on('close', (e) => {
    if (!quitter && !BANC) { e.preventDefault(); fenetre.hide() } // the agents keep living in the tray
  })
}

function creerTray() {
  try {
    const icone = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 })
    tray = new Tray(icone)
    tray.setToolTip(NOM_APP)
    const montrer = () => { fenetre.show(); fenetre.focus() }
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir', click: montrer },
      { label: 'Ouvrir le dossier de données', click: () => shell.openPath(racine) },
      { type: 'separator' },
      { label: 'Quitter', click: quitterVolontairement },
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

const arreteParMax = () => { try { return fs.existsSync(fichierArretVolontaire()) } catch { return false } }

if (!BANC && process.argv.includes(ARG_GARDE) && arreteParMax()) {
  // Max chose « Quitter »: the watchdog does not bring the Poste back, the next launch by hand or at login does
  app.quit()
} else if (!app.requestSingleInstanceLock() && !BANC) {
  app.quit()
} else {
  if (!process.argv.includes(ARG_GARDE)) try { fs.rmSync(fichierArretVolontaire(), { force: true }) } catch { /* nothing to remove */ }
  // only a launch by hand (shortcut, Start menu) brings the window forward
  app.on('second-instance', (_e, argv) => { if (fenetre && !lancementDiscret(argv)) { fenetre.show(); fenetre.focus() } })
  app.whenReady().then(() => {
    const installExistante = fs.existsSync(path.join(dossierDonnees(), 'config.json'))
    cfg = config.charger(dossierDonnees())
    // 0.5.0: the Poste becomes KANTIX ANALYSER; an existing install keeps its DropShipper connector on
    const mig = kantix.migrer(cfg, { installExistante })
    cfg = mig.cfg
    // 03/10/2026: Max wants EVERY validated report on the site. The old send went to a table no screen read, so
    // its switch was meaningless; it is now on (one time), the agent key remains his to place.
    if (!cfg.envoiSiteV2) { cfg.envoiAuSite = true; cfg.envoiSiteV2 = true; config.enregistrer(dossierDonnees(), cfg) }
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
    // who launched it: by hand, the watchdog (--garde) or the Windows session (--demarrage); « sans argument » from an old task = 0.3.5 or older
    if (mig.change) journal.info('KANTIX ANALYSER : configuration du Poste reprise', { connecteurDropShipper: cfg.connecteurs.dropshipper.actif, cles: cfg.cles.length, projets: cfg.projets.length })
    chargerHistorique()
    journal.info(`${NOM_APP} démarré`, { version: app.getVersion(), lancement: process.argv.includes(ARG_GARDE) ? 'tâche de relance' : process.argv.includes(ARG_DEMARRAGE) ? 'ouverture de session Windows' : 'à la main (ou ancienne tâche sans argument)' })
    // Keeps the app (and its timers) running when nobody is looking; the screen may still sleep.
    bloqueurVeille = powerSaveBlocker.start('prevent-app-suspension')
    brancher()
    creerFenetre()
    creerTray()
    lancementsAutomatiques()
    demarrerPlanificateur()
    demarrerPlanificateurAnalyses()
    ouvrirOngletsGardes()
  })
  app.on('before-quit', () => { quitter = true })
  app.on('window-all-closed', () => { if (BANC) app.quit() })
}
