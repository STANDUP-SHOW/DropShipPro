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
      DROPSHIPPER_POSTE_DEPOT: path.join(maison, 'DropShipper-Analyses'),
      POSTE_URL_META: `http://127.0.0.1:${p}`, POSTE_URL_TRENDS: `http://127.0.0.1:${p}`, POSTE_PAUSE_SIGNAUX_MS: '0',
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
  ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && attente.has(j.id)) attente.get(j.id)(j.result || { exceptionDetails: j.error }) }
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
    assert.deepEqual(ec.onglets, ['Tableau de bord', 'Rapports du jour', 'Sources & navigateur', 'Administration', 'Réglages', 'Journal'])
    console.log('ok   écran : 6 onglets,', ec.titre)

    // keys: stored, never returned
    await a.appel('secret', { nom: 'anthropic', valeur: 'cle-anthropic-secrete' })
    const e1 = (await a.appel('secret', { nom: 'serper', valeur: 'cle-serper-secrete' })).valeur
    assert.deepEqual(e1.secrets, { anthropic: true, serper: true, admin: false })
    assert.ok(!JSON.stringify(e1).includes('secrete'), 'aucune valeur de clé ne revient à l’écran')
    const cfgTexte = fs.readFileSync(path.join(profil, 'config.json'), 'utf8')
    console.log('ok   clés posées', cfgTexte.includes('secrete') ? '(en clair : coffre indisponible sur ce poste de test)' : '(chiffrées)')

    // the site (fake): the Poste makes its own admin key, Max pastes its fingerprint on the site; the address points at the bench's server
    const baseSite = `http://127.0.0.1:${port}`
    await a.appel('reglages', { apiBase: baseSite })
    assert.equal((await a.appel('adminTester')).ok, false, 'sans clé créée, le test d’administration dit pourquoi')
    assert.ok(!(await a.appel('secret', { nom: 'admin', valeur: 'dsp_adm_tapee-a-la-main' })).ok, 'la clé d’administration ne se saisit pas à la main')
    const e1b = (await a.appel('adminCreer')).valeur
    assert.equal(e1b.admin.cle, true); assert.match(e1b.admin.empreinte, /^[0-9a-f]{64}$/); assert.equal(e1b.secrets.admin, true)
    assert.ok(!JSON.stringify(e1b).includes('dsp_adm_'), 'la clé d’administration ne revient jamais à l’écran')
    assert.equal(e1b.reglages.envoiAuSite, true, 'envoi au site activé par défaut'); assert.equal(e1b.envoi.enAttente, 0)
    // the site has no fingerprint yet: it answers 503 and the app says what to do
    const avant = await a.appel('adminTester')
    assert.ok(!avant.ok && /503/.test(avant.erreur) && /POSTE_ADMIN_SHA256/.test(avant.erreur), avant.erreur)
    // a wrong fingerprint on the site: 401, and the message points at the fingerprint
    faux.empreinteSite = 'a'.repeat(64)
    const faux401 = await a.appel('adminTester')
    assert.ok(!faux401.ok && /401/.test(faux401.erreur) && /empreinte/.test(faux401.erreur), faux401.erreur)
    // Max pastes the right one in Railway
    faux.empreinteSite = e1b.admin.empreinte
    assert.deepEqual((await a.appel('adminTester')).valeur, { ok: true })
    const utilisateurs = (await a.appel('adminUtilisateurs')).valeur
    assert.equal(utilisateurs.total, 2); assert.equal(utilisateurs.utilisateurs[0].email, 'a@exemple.test')
    assert.equal((await a.appel('adminNewsletter')).valeur.total, 1)
    assert.ok(!fs.readFileSync(path.join(profil, 'config.json'), 'utf8').includes('a@exemple.test'), 'les utilisateurs ne sont écrits nulle part')
    console.log('ok   administration : clé fabriquée par le Poste, empreinte seule connue du site, 503 puis 401 puis 200, utilisateurs lus')

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
    assert.equal(fichiers.filter((f) => !f.endsWith('.envoi.json')).length, 3, fichiers.join(','))
    assert.ok(fichiers.some((f) => f.endsWith('.envoi.json')), 'preuve d’envoi au site écrite à côté du rapport')
    assert.equal(faux.envoyes.length, 1, 'le rapport validé est parti seul vers le site')
    assert.match(faux.envoyes[0].auth, /^Bearer dsp_adm_/); assert.equal(faux.envoyes[0].produits, 20)
    console.log(`ok   rayon test de bout en bout : ${rapports[0]} (${fichiers.join(', ')})`)
    assert.ok(fs.existsSync(path.join(depot, 'releves', jour, 'site-de-test', '001.txt')), 'instantané du site connecté écrit')
    console.log('ok   relevé de la source écrit dans releves/')
    // public signals read by the REAL hidden window: ad-library text and the Trends curve caught on the network
    const brut = JSON.parse(fs.readFileSync(path.join(depot, 'releves', jour, 'signaux', fs.readdirSync(path.join(depot, 'releves', jour, 'signaux'))[0]), 'utf8'))
    assert.equal(brut.pubs.length, 6, JSON.stringify(brut.pubs).slice(0, 300))
    assert.ok(brut.pubs.some((p) => p.statut === 'ok' && p.resultats === 1200 && p.plusAncienne === '2026-03-03'), 'annonces lues dans la vraie fenêtre')
    assert.ok(brut.pubs.some((p) => p.statut === 'aucun'), 'un « aucun résultat » est lu comme tel')
    assert.ok(brut.tendances.length === 2 && brut.tendances.every((g) => g.statut === 'ok'), JSON.stringify(brut.tendances).slice(0, 300))
    assert.equal(brut.tendances[0].series[0].variationPct, 100, 'courbe capturée sur le réseau de la fenêtre')
    console.log('ok   signaux publics lus par la vraie fenêtre cachée (annonces, courbe Trends capturée)')
    assert.ok(fs.readdirSync(path.join(depot, 'journaux')).length >= 1, 'journal écrit')
    assert.ok(fs.readdirSync(path.join(depot, 'releves', jour, 'serper')).length === 1, 'relevé Serper étendu (prix, suggestions, images) écrit')
    const brutSerper = JSON.parse(fs.readFileSync(path.join(depot, 'releves', jour, 'serper', fs.readdirSync(path.join(depot, 'releves', jour, 'serper'))[0]), 'utf8'))
    assert.ok(brutSerper.shopping.length > 0 && brutSerper.shopping.every((x) => x.prixMin === 129.9), JSON.stringify(brutSerper.shopping[0]).slice(0, 200))
    console.log('ok   lectures Serper étendues : prix Shopping, suggestions et images relevés')

    // the rayons of the night are Max's choice: two only, for a test; zero = nothing runs
    assert.equal(e0.rayonsDuJour.every((x) => x.choisi), true, 'sans choix : les 24 sont cochés')
    const tous = (await a.appel('etat')).valeur.rayonsDuJour
    const deux = [tous[1].categorie, tous[2].categorie]
    const sel = (await a.appel('rayonsNuit', { ids: deux })).valeur
    assert.deepEqual(sel.rayonsDuJour.filter((x) => x.choisi).map((x) => x.categorie), deux)
    const vide = (await a.appel('rayonsNuit', { ids: [] })).valeur
    assert.equal(vide.rayonsDuJour.filter((x) => x.choisi).length, 0)
    const rien = (await a.appel('nuitLancer')).valeur
    assert.match(rien.annulee, /Aucun rayon coché/)
    assert.equal(fs.readdirSync(path.join(depot, 'rapports', jour)).length, 1, 'aucun rayon ne tourne quand rien n’est coché')
    await a.appel('rayonsNuit', { ids: deux })
    const bilanNuit = (await a.appel('nuitLancer')).valeur
    assert.equal(bilanNuit.attendus, 2); assert.equal(bilanNuit.ok, 2, JSON.stringify(bilanNuit))
    assert.deepEqual(fs.readdirSync(path.join(depot, 'rapports', jour)).sort(), [tous[0].categorie, ...deux].sort(), 'seuls les rayons choisis (plus le rayon test) ont un rapport')
    console.log('ok   nuit sur 2 rayons choisis : 2 rapports, les 21 autres intacts')
    assert.equal(faux.envoyes.length, 3, 'chaque rapport de la nuit est parti vers le site')
    console.log('ok   envoi au site : 3 rapports validés envoyés seuls, rayon et marketing d’un coup')

    // a failed sending leaves the report waiting; the button sends it, a refusal is told in clear
    const dossierEnvoi = path.join(depot, 'rapports', jour, deux[0])
    const preuve = fs.readdirSync(dossierEnvoi).find((f) => f.endsWith('.envoi.json'))
    fs.unlinkSync(path.join(dossierEnvoi, preuve))
    assert.equal((await a.appel('etat')).valeur.envoi.enAttente, 1)
    faux.mode = 'site-refuse'
    const refus = (await a.appel('envoyerAuSite')).valeur
    assert.equal(refus.envoyes, 0); assert.match(refus.echecs[0].message, /\(403\).*Accès réservé/)
    assert.equal((await a.appel('etat')).valeur.envoi.enAttente, 1, 'refusé : le rapport reste en attente')
    faux.mode = 'bon'
    const renvoi = (await a.appel('envoyerAuSite')).valeur
    assert.equal(renvoi.envoyes, 1); assert.equal(faux.envoyes.length, 4)
    assert.equal((await a.appel('etat')).valeur.envoi.enAttente, 0)
    console.log('ok   renvoi : refus du site dit en clair, rapport conservé, puis envoyé')
    // the screen: a checkbox per rayon (2 ticked) and the Serper readings in Réglages
    await a.evaluer(`document.querySelectorAll('#onglets button')[1].click()`)
    await pause(300)
    const coches = JSON.parse(await a.evaluer(`JSON.stringify({ cases: document.querySelectorAll('table input[type=checkbox]').length, cochees: document.querySelectorAll('table input[type=checkbox]:checked').length })`))
    assert.deepEqual(coches, { cases: 24, cochees: 2 })
    const enLigne = JSON.parse(await a.evaluer(`JSON.stringify([...document.querySelectorAll('table .pastille')].filter((p) => p.textContent === 'en ligne').length)`))
    assert.equal(enLigne, 3, 'la colonne « Site » montre les 3 rapports en ligne')
    // Administration tab: key created, fingerprint shown (never the key), users listed on demand
    await a.evaluer(`document.querySelectorAll('#onglets button')[3].click()`)
    await pause(300)
    await a.evaluer(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Afficher les utilisateurs').click()`)
    await pause(800)
    const texteAdmin = await a.evaluer(`document.body.textContent`)
    assert.match(texteAdmin, /Administrateur unique|administrateur unique/); assert.match(texteAdmin, /[0-9a-f]{64}/); assert.ok(!texteAdmin.includes('dsp_adm_'), 'la clé n’est jamais à l’écran')
    assert.match(texteAdmin, /a@exemple\.test/); assert.match(texteAdmin, /2 compte\(s\), dont 1 adresse/)
    console.log('ok   onglet Administration : empreinte visible, clé jamais affichée, utilisateurs listés')
    await a.evaluer(`document.querySelectorAll('#onglets button')[4].click()`)
    await pause(300)
    const texteReglages = await a.evaluer(`document.body.textContent`)
    assert.match(texteReglages, /Serper Shopping/); assert.match(texteReglages, /crédits Serper avec ces réglages/)
    await a.evaluer(`document.querySelectorAll('#onglets button')[0].click()`)
    console.log('ok   écran : 24 cases à cocher dans « Rapports du jour », réglages Serper visibles')

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
    assert.deepEqual(e2.rayonsDuJour.filter((x) => x.choisi).map((x) => x.categorie).length, 2, 'le choix des rayons a survécu au redémarrage')
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
