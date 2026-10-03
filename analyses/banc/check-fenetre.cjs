'use strict'
/**
 * Smoke test of the REAL Electron app (profile and HOME disposable, fake
 * providers served locally, screen read through the debugging protocol):
 * the deposit tree is created, keys are stored, credit check, one rayon test
 * end to end, a source read by the hidden private browser, and — the point —
 * a browser session cookie that is STILL THERE after the app was restarted.
 *
 *   xvfb-run -a node banc/check-fenetre.cjs      (Linux)    |    node banc/check-fenetre.cjs   (Windows)
 */
const { spawn } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { creerServeur, etat: faux } = require('./faux-monde.cjs')

const app = path.join(__dirname, '..')
const electron = require(path.join(app, 'node_modules', 'electron'))
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function lancer({ maison, profil, port, serveur }) {
  const p = serveur.address().port
  const enfant = spawn(electron, [app, '--no-sandbox', `--remote-debugging-port=${port}`], {
    cwd: app,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, HOME: maison, USERPROFILE: maison, DROPSHIPPER_POSTE_BANC: '1', DROPSHIPPER_POSTE_PROFIL: profil,
      POSTE_URL_SERPER: `http://127.0.0.1:${p}/search`, POSTE_URL_CLAUDE: `http://127.0.0.1:${p}/v1/messages`,
    },
  })
  let sortie = ''
  enfant.stdout.on('data', (d) => (sortie += d))
  enfant.stderr.on('data', (d) => (sortie += d))
  const fini = new Promise((r) => enfant.on('exit', r))
  const cdp = async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json())
  let cible = null
  for (let i = 0; i < 40 && !cible; i++) {
    await pause(500)
    try { cible = (await cdp()).find((c) => c.type === 'page' && c.url.includes('renderer/index.html')) } catch { /* not up */ }
  }
  if (!cible) throw new Error('fenêtre introuvable\n' + sortie.slice(-1500))
  const ws = new WebSocket(cible.webSocketDebuggerUrl)
  await new Promise((ok, ko) => ((ws.onopen = ok), (ws.onerror = ko)))
  let n = 0
  const attente = new Map()
  ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && attente.has(j.id)) attente.get(j.id)(j.result) }
  const evaluer = (expression) => new Promise((ok) => {
    const id = ++n
    attente.set(id, (r) => ok(r.exceptionDetails ? { __erreur: JSON.stringify(r.exceptionDetails).slice(0, 400) } : r.result.value))
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
  // page `poste.x(arg)` -> { ok, valeur }
  const appel = async (nom, arg) => {
    const r = await evaluer(`window.poste.${nom}(${JSON.stringify(arg === undefined ? null : arg)}).then((r) => JSON.stringify(r))`)
    if (r && r.__erreur) throw new Error(r.__erreur)
    return JSON.parse(r)
  }
  const quitter = async () => { try { await appel('bancQuitter') } catch { /* closing */ } await Promise.race([fini, pause(8000)]); try { enfant.kill() } catch { /* gone */ } }
  return { enfant, cdp, evaluer, appel, quitter, sortie: () => sortie }
}

;(async () => {
  const serveur = await creerServeur()
  const maison = fs.mkdtempSync(path.join(os.tmpdir(), 'poste-home-'))
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'poste-profil-'))
  const depot = path.join(maison, 'DropShipper-Analyses')
  const port = serveur.address().port
  let a = null
  try {
    a = await lancer({ maison, profil, port: 9381, serveur })
    const e0 = (await a.appel('etat')).valeur
    console.log(`ok   fenêtre chargée, version ${e0.version}, ${e0.rayonsDuJour.length} rayons du jour`)
    assert.equal(e0.rayonsDuJour.length, 24)
    assert.equal(e0.reglages.nuitActivee, false, 'la nuit est désactivée à l’installation')
    for (const d of ['rapports', 'releves', 'journaux', 'diagnostics', 'sauvegardes', 'prompts']) assert.ok(fs.existsSync(path.join(depot, d)), `dossier ${d} créé`)
    assert.ok(fs.existsSync(path.join(depot, 'prompts', 'rayon.md')), 'prompt modifiable posé dans le dépôt')
    console.log('ok   dossier de dépôt, sous-dossiers et prompt modifiable créés')

    // the screen itself (tabs, nothing missing)
    const ecran = await a.evaluer(`JSON.stringify({ onglets: [...document.querySelectorAll('#onglets button')].map((b) => b.textContent), titre: document.querySelector('h1') && document.querySelector('h1').textContent })`)
    const ec = JSON.parse(ecran)
    assert.deepEqual(ec.onglets, ['Tableau de bord', 'Rapports du jour', 'Sources & navigateur', 'Réglages', 'Journal'])
    console.log('ok   écran : 5 onglets,', ec.titre)

    // keys: stored, never returned
    await a.appel('secret', { nom: 'anthropic', valeur: 'cle-anthropic-secrete' })
    const e1 = (await a.appel('secret', { nom: 'serper', valeur: 'cle-serper-secrete' })).valeur
    assert.deepEqual(e1.secrets, { anthropic: true, serper: true, agent: false })
    assert.ok(!JSON.stringify(e1).includes('secrete'), 'aucune valeur de clé ne revient à l’écran')
    const cfgTexte = fs.readFileSync(path.join(profil, 'config.json'), 'utf8')
    console.log('ok   clés posées', cfgTexte.includes('secrete') ? '(en clair : coffre indisponible sur ce poste de test)' : '(chiffrées)')

    // credits, then one rayon test
    const cr = (await a.appel('credits')).valeur
    assert.ok(cr.ok && cr.serper.ok && cr.claude.ok)
    console.log('ok   contrôle des crédits')

    // a source whose pages the night will read, with the cookie set by the site
    const base = `http://127.0.0.1:${port}`
    const src = await a.appel('sourceAjouter', { nom: 'Site de test', urlConnexion: `${base}/pose-cookie`, pages: `${base}/pose-cookie`, texteDeconnecte: 'SESSION-ABSENTE' })
    assert.ok(src.ok, src.erreur)
    // visit 1: the site sets its cookie (as after Max logged in)
    const ver0 = (await a.appel('sourceVerifier', 'site-de-test')).valeur
    assert.equal(ver0.etat, 'connecte')
    // from now on the source reads a page that only answers SESSION-CONSERVEE when the cookie comes back
    await a.appel('sourceAjouter', { id: 'site-de-test', nom: 'Site de test', urlConnexion: `${base}/pose-cookie`, pages: `${base}/verifie-cookie`, texteDeconnecte: 'SESSION-ABSENTE' })
    const ver1 = (await a.appel('sourceVerifier', 'site-de-test')).valeur
    console.log('ok   navigateur privé caché : cookie du site renvoyé dans la même partition →', ver1.etat)
    assert.equal(ver1.etat, 'connecte', 'le cookie posé par le site est renvoyé dans la même partition')

    const r = (await a.appel('rayonTest')).valeur
    assert.equal(r.statut, 'ok', JSON.stringify(r))
    const date = new Date(); const p2 = (x) => String(x).padStart(2, '0'); const jour = `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`
    const rapports = fs.readdirSync(path.join(depot, 'rapports', jour))
    assert.equal(rapports.length, 1)
    const fichiers = fs.readdirSync(path.join(depot, 'rapports', jour, rapports[0]))
    assert.equal(fichiers.length, 3, fichiers.join(','))
    console.log(`ok   rayon test de bout en bout : ${rapports[0]} (${fichiers.join(', ')})`)
    assert.ok(fs.existsSync(path.join(depot, 'releves', jour, 'site-de-test', '001.txt')), 'instantané du site connecté écrit')
    console.log('ok   relevé de la source écrit dans releves/')
    assert.ok(fs.readdirSync(path.join(depot, 'journaux')).length >= 1, 'journal écrit')

    // night auto: accepted (bench has no dialog) and persisted
    const na = (await a.appel('nuitAuto', { actif: true })).valeur
    assert.equal(na.reglages.nuitActivee, true)
    await a.appel('nuitAuto', { actif: false })

    // the embedded browser: a view on the source's partition
    await a.appel('navAfficher', { id: 'site-de-test', bounds: { x: 240, y: 120, width: 800, height: 500 } })
    await pause(1500)
    let vues = await a.cdp()
    assert.ok(vues.some((c) => c.url.includes('/pose-cookie')), 'le navigateur intégré a ouvert la source')
    console.log('ok   navigateur intégré : vue ouverte sur la source')
    await a.appel('navMasquer')
    await a.quitter()
    a = null

    // ---- restart: the session must still be there (persistent partition on disk)
    a = await lancer({ maison, profil, port: 9382, serveur })
    const e2 = (await a.appel('etat')).valeur
    assert.equal(e2.sources.length, 1, 'la source a survécu au redémarrage')
    assert.equal(e2.secrets.anthropic, true, 'la clé a survécu au redémarrage')
    // fresh process, same profile: the verification page only says SESSION-CONSERVEE if the cookie came back from disk
    const ver2 = (await a.appel('sourceVerifier', 'site-de-test')).valeur
    console.log('ok   après redémarrage de l’application : session', ver2.etat)
    assert.equal(ver2.etat, 'connecte', 'la session du navigateur privé est conservée après redémarrage')
    await a.quitter()
    a = null
    console.log('\nFenêtre réelle : tout est vert.')
    serveur.close()
    process.exit(0)
  } catch (err) {
    console.log('FAIL', err && err.stack ? err.stack.split('\n').slice(0, 8).join('\n') : err)
    if (a) { console.log('--- sortie Electron ---\n' + a.sortie().slice(-1500)); try { a.enfant.kill() } catch { /* gone */ } }
    process.exit(1)
  }
})()
