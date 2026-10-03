'use strict'
/**
 * Bench of the pure logic, against FAKE Serper / Claude / supplier pages served
 * locally. A fake server writes the contract by hand, so a green bench proves
 * the plumbing and the guards, NOT the quality of real reports (see README).
 *
 *   cd analyses && node banc/check-poste.cjs
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')

const lib = (n) => require(path.join(__dirname, '..', 'lib', n))
const agents = lib('agents')
const { creerSerper } = lib('serper')
const { creerClaude } = lib('claude')
const { lirePage } = lib('pages')
const { executerRayon } = lib('rayon')
const { valider, NON_VERIFIE } = lib('validation')
const { rayonMd, marketingMd } = lib('rapports-md')
const orch = lib('orchestrateur')
const depot = lib('depot')
const { creerJournal } = lib('journal')
const { creerArborescence } = lib('chemins')
const sources = lib('sources')
const veille = lib('veille')
const config = lib('config')
const { planifier } = lib('planificateur')
const { ErreurFournisseur } = lib('erreurs')

let ok = 0
const essais = []
function test(nom, fn) { essais.push([nom, fn]) }

const { etat, creerServeur, remise } = require('./faux-monde.cjs')

function monde(srv) {
  const port = srv.address().port
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'poste-'))
  creerArborescence(racine)
  const journal = creerJournal(racine)
  const serper = creerSerper({ cle: 'k', url: `http://127.0.0.1:${port}/search` })
  const claude = creerClaude({ cle: 'k', modele: 'm', url: `http://127.0.0.1:${port}/v1/messages` })
  const rayon = { categorie: 'telephonie', libelleCategorie: 'Téléphonie', theme: 'smartphones', libelleTheme: 'Smartphones', date: '2026-10-03' }
  const deps = { serper, claude, pages: (u) => lirePage(u), releves: async () => [], journal, racine }
  return { racine, journal, serper, claude, rayon, deps, port }
}

// ------------------------------------------------------------------ tests
test('rotation : jour de l’année modulo 7, 24 rayons', () => {
  const a = agents.charger()
  assert.equal(a.categories.length, 24)
  assert.equal(agents.jourDeLAnnee('2026-01-01'), 1)
  assert.equal(agents.jourDeLAnnee('2026-10-03'), 276)
  const r = agents.rayonsDuJour(a, '2026-10-03')
  assert.equal(r.length, 24)
  assert.equal(r[1].theme, 'coques-protection')
  // 7 days later the same theme comes back
  assert.equal(agents.rayonsDuJour(a, '2026-10-10')[1].theme, 'coques-protection')
})

test('secrets : chiffrés par le coffre, jamais montrés', () => {
  const coffre = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('X' + s), decryptString: (b) => b.toString().slice(1) }
  let c = config.poserSecret({ ...config.PAR_DEFAUT, secrets: {} }, 'serper', 'sk-123', coffre)
  assert.ok(c.secrets.serper.chiffre && !JSON.stringify(c).includes('sk-123'))
  assert.equal(config.lireSecret(c, 'serper', coffre), 'sk-123')
  assert.deepEqual(config.etatSecrets(c), { anthropic: false, serper: true, agent: false })
  c = config.poserSecret(c, 'serper', '', coffre)
  assert.equal(config.lireSecret(c, 'serper', coffre), null)
  assert.throws(() => config.poserSecret(c, 'inconnu', 'x', coffre))
})

test('Serper : un refus lève avec le message du fournisseur ; site: retiré', async (srv) => {
  const m = monde(srv); remise()
  await m.serper.chercher('robots site:amazon.fr cuisine')
  assert.ok(!/site:/.test(etat.requetesSerper.at(-1)))
  etat.creditsSerper = false
  await assert.rejects(m.serper.chercher('x'), /Serper : 400 - Not enough credits/)
})

test('Claude : flux lu, effort posé, refus de crédit en clair', async (srv) => {
  const m = monde(srv); remise()
  const r = await m.claude.message({ systeme: 'tableau JSON de chaînes', utilisateur: 'x', maxTokens: 100, effort: 'low' })
  assert.ok(r.texte.startsWith('[') && r.arret === 'end_turn' && r.usage.output_tokens === 500)
  etat.creditsClaude = false
  await assert.rejects(m.claude.message({ utilisateur: 'x', maxTokens: 4, flux: false }), /Your credit balance is too low/)
})

test('rayon complet : 20 produits, 20 URL distinctes vues, marges en euros, fichiers du contrat', async (srv) => {
  const m = monde(srv); remise()
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: { plafondPages: 25, plafondDeuxiemeVague: 26, modele: 'm' } })
  assert.equal(res.statut, 'ok', JSON.stringify(res.validation))
  assert.equal(res.validation.stats.produits, 20)
  assert.equal(res.validation.stats.urlsDistinctes, 20)
  // 20 wave-1 queries + 26 wave-2 queries: the 46 requests of the n8n agent
  assert.equal(etat.serper, 46)
  assert.equal(etat.claude, 2)
  for (const f of [res.chemins.json, res.chemins.rayon, res.chemins.marketing]) assert.ok(fs.existsSync(f), f)
  assert.ok(res.chemins.json.endsWith(path.join('rapports', '2026-10-03', 'telephonie', 'smartphones.json')))
  const j = JSON.parse(fs.readFileSync(res.chemins.json, 'utf8'))
  // identity comes from the rotation, never from the model
  assert.equal(j.study.date, '2026-10-03'); assert.equal(j.study.theme_slug, 'smartphones'); assert.equal(j.study.category_name, 'Téléphonie')
  assert.equal(j.poste.statut, 'ok')
  assert.ok(j.products.every((p) => /^http:\/\/127\.0\.0\.1/.test(p.supplier_url)))
  const md = fs.readFileSync(res.chemins.rayon, 'utf8')
  assert.match(md, /^---\ntype: rayon\ndate: 2026-10-03\ncategorie: telephonie\ntheme: smartphones\n/)
  assert.equal(md.split('\n').filter((l) => /^\| \d+ \|/.test(l)).length, 20)
  const mk = fs.readFileSync(res.chemins.marketing, 'utf8')
  const ordre = ['## Social places', '## Publicités en cours', '## Tendances du jour', '## Tendances publicitaires', "## Prompts d'images publicitaires", '## Prompts de vidéos publicitaires'].map((t) => mk.indexOf(t))
  assert.ok(ordre.every((x) => x >= 0) && ordre.every((x, i) => i === 0 || x > ordre[i - 1]), 'six sections, dans l’ordre')
  assert.match(mk, /```\n# Facebook 1:1/)
  return res
})

test('le JSON est lu par l’importer DropShipper (importer-aimarket.cjs --sec)', async (srv) => {
  const m = monde(srv); remise()
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: {} })
  const dossier = path.join(__dirname, '..', '..', 'aiMarket')
  const existait = fs.existsSync(dossier)
  const copie = path.join(os.tmpdir(), 'rapport-importer.json')
  fs.copyFileSync(res.chemins.json, copie)
  try {
    if (!existait) fs.mkdirSync(dossier)
    // --sec: reads and shows, writes nothing (CLAUDE.md rule: no write without an explicit flag)
    const sortie = execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'backend', 'importer-aimarket.cjs'), '--sec', '--fichier', copie], { encoding: 'utf8' })
    assert.match(sortie, /20 produits/)
    assert.match(sortie, /rayon-2026-10-03-telephonie-smartphones/)
    assert.match(sortie, /1 importé/)
  } finally {
    if (!existait) fs.rmSync(dossier, { recursive: true, force: true })
  }
})

test('le Markdown rayon respecte le contrat lu par le serveur (lireRapport)', async (srv) => {
  const m = monde(srv); remise()
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: {} })
  const racine = path.join(__dirname, '..', '..', 'backend', 'src', 'services', 'marketReports.ts')
  const script = `import(${JSON.stringify(require('node:url').pathToFileURL(racine).href)}).then((m)=>{const r=m.lireRapport(require('fs').readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify({type:r.type,n:r.produits.length,imp:r.produits.map(p=>p.import)}))}).catch((e)=>{console.log('ERR '+e.message)})`
  let sortie
  try {
    sortie = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', script, res.chemins.rayon], { encoding: 'utf8' }).trim()
  } catch (e) {
    console.log('     (lireRapport non exécutable ici : ' + String(e.message).split('\n')[0] + ')')
    return
  }
  if (sortie.startsWith('ERR')) {
    // Missing url/prices in a fake world would be refused; the bench's URLs are http so it must read.
    assert.fail('lireRapport a refusé le rapport : ' + sortie)
  }
  const r = JSON.parse(sortie)
  assert.equal(r.type, 'rayon'); assert.equal(r.n, 20)
  assert.ok(r.imp.includes('api') && r.imp.includes('extension') && r.imp.includes('url'))
})

test('URL inventées : remplacées par « Non vérifié », rapport À REVOIR, jamais envoyé au site', async (srv) => {
  const m = monde(srv); remise(); etat.mode = 'url-inventee'
  let envoyes = 0
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: { envoyer: async () => { envoyes++ } } })
  assert.equal(res.statut, 'a_revoir')
  assert.equal(res.validation.stats.inventions, 4)
  const j = JSON.parse(fs.readFileSync(res.chemins.json, 'utf8'))
  assert.equal(j.products.filter((p) => p.supplier_url === NON_VERIFIE).length, 4)
  assert.equal(envoyes, 0)
  assert.equal(orch.rapportValide(m.racine, '2026-10-03', 'telephonie', 'smartphones'), false)
})

test('marge en pourcentage (280 pour un prix de 30 €) : vidée et signalée', async (srv) => {
  const m = monde(srv); remise(); etat.mode = 'marge-pct'
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: {} })
  assert.equal(res.statut, 'a_revoir')
  assert.ok(res.validation.problemes.some((p) => /marge/.test(p)))
})

test('18 produits au lieu de 20 : à revoir', async (srv) => {
  const m = monde(srv); remise(); etat.mode = 'dix-huit'
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: {} })
  assert.equal(res.statut, 'a_revoir')
  assert.ok(res.validation.problemes.some((p) => /18 produits au lieu de 20/.test(p)))
})

test('gardes : première vague vide, noms vides, réponse tronquée, réponse illisible — jamais un faux succès', async (srv) => {
  let m = monde(srv); remise(); etat.mode = 'serper-vide'
  await assert.rejects(executerRayon({ rayon: m.rayon, deps: m.deps, options: {} }), /première vague sans aucune réponse/)
  m = monde(srv); remise(); etat.mode = 'noms-vides'
  await assert.rejects(executerRayon({ rayon: m.rayon, deps: m.deps, options: {} }), /liste de noms de modèles vide/)
  m = monde(srv); remise(); etat.mode = 'vide'
  await assert.rejects(executerRayon({ rayon: m.rayon, deps: m.deps, options: {} }), /tronquée/)
  assert.ok(fs.readdirSync(path.join(m.racine, 'diagnostics')).some((f) => f.startsWith('DIAGNOSTIC-reponse-claude')))
  m = monde(srv); remise(); etat.mode = 'illisible'
  await assert.rejects(executerRayon({ rayon: m.rayon, deps: m.deps, options: {} }), /illisible/)
  // nothing was written for any of them
  assert.equal(fs.existsSync(path.join(m.racine, 'rapports', '2026-10-03')), false)
})

test('Serper à zéro en cours de vague : l’erreur remonte (pas de liste vide « réussie »)', async (srv) => {
  const m = monde(srv); remise(); etat.creditsSerper = false
  await assert.rejects(executerRayon({ rayon: m.rayon, deps: m.deps, options: {} }), (e) => e instanceof ErreurFournisseur && /Not enough credits/.test(e.message))
  assert.equal(etat.claude, 0, 'rien n’a été dépensé chez Anthropic')
})

test('nuit : crédits refusés = annulée avant toute dépense (1 crédit Serper, 0 rapport)', async (srv) => {
  const m = monde(srv); remise(); etat.creditsClaude = false
  const rayons = agents.rayonsDuJour(agents.charger(), '2026-10-03')
  let appels = 0
  const bilan = await orch.lancerNuit({
    rayons, date: '2026-10-03', racine: m.racine, journal: m.journal,
    controle: () => orch.controleCredits({ serper: m.serper, claude: m.claude }),
    executer: async () => { appels++ },
  })
  assert.match(bilan.annulee, /^NUIT ANNULEE AVANT DE DEPENSER QUOI QUE CE SOIT/)
  assert.match(bilan.annulee, /credit balance is too low/)
  assert.equal(appels, 0); assert.equal(etat.serper, 1)
})

test('nuit : un fournisseur en échec arrête la nuit ; une autre erreur ne perd que son rayon ; reprise sans refaire', async (srv) => {
  const m = monde(srv); remise()
  const rayons = agents.rayonsDuJour(agents.charger(), '2026-10-03').slice(0, 6)
  const vus = []
  const bilan = await orch.lancerNuit({
    rayons, date: '2026-10-03', racine: m.racine, journal: m.journal,
    controle: async () => ({ ok: true, serper: { ok: true }, claude: { ok: true } }),
    executer: async (r) => {
      vus.push(r.categorie)
      if (vus.length === 2) throw new Error('page illisible') // loses only this rayon
      if (vus.length === 4) throw new ErreurFournisseur('Serper', '400 - Not enough credits') // systemic: stop
      depot.ecrireRapport(m.racine, { date: '2026-10-03', categorie: r.categorie, theme: r.theme, json: { poste: { statut: 'ok' } }, rayonMd: 'x', marketingMd: 'y' })
      return { statut: 'ok' }
    },
  })
  assert.equal(vus.length, 4); assert.equal(bilan.ok, 2); assert.equal(bilan.erreurs.length, 2)
  assert.match(bilan.arretee, /fournisseur en échec/)
  // resume: the two written rayons are skipped
  const suite = []
  const b2 = await orch.lancerNuit({
    rayons, date: '2026-10-03', racine: m.racine, journal: m.journal,
    controle: async () => ({ ok: true, serper: { ok: true }, claude: { ok: true } }),
    executer: async (r) => { suite.push(r.categorie); return { statut: 'ok' } },
  })
  assert.equal(b2.ignores, 2); assert.equal(suite.length, 4)
})

test('nuit : l’arrêt demandé s’applique entre deux rayons', async (srv) => {
  const m = monde(srv); remise()
  const rayons = agents.rayonsDuJour(agents.charger(), '2026-10-03').slice(0, 5)
  const arret = { demande: false }; let n = 0
  const b = await orch.lancerNuit({
    rayons, date: '2026-10-03', racine: m.racine, journal: m.journal, arret,
    controle: async () => ({ ok: true, serper: { ok: true }, claude: { ok: true } }),
    executer: async () => { n++; if (n === 2) arret.demande = true; return { statut: 'ok' } },
  })
  assert.equal(n, 2); assert.equal(b.arretee, 'arrêt demandé')
})

test('planificateur : rien sans accord, une seule fois par jour, dans la fenêtre', async () => {
  const lanc = []; const cfg = { nuitActivee: false, heureNuit: '01:00', sources: [] }
  let maintenant = new Date(2026, 9, 3, 1, 5)
  const p = planifier({
    maintenant: () => maintenant, config: () => cfg, nuitEnCours: () => false, dejaFaiteAujourdhui: () => false,
    lancerNuit: async () => { lanc.push(maintenant.toISOString()) }, garderSessions: async () => {}, journal: { info() {}, erreur() {} }, intervalleMs: 1e9,
  })
  assert.equal(await p.tick(), 'rien'); assert.equal(lanc.length, 0, 'désactivée = rien ne tourne')
  cfg.nuitActivee = true
  maintenant = new Date(2026, 9, 3, 0, 30); assert.equal(await p.tick(), 'rien')
  maintenant = new Date(2026, 9, 3, 1, 5); assert.equal(await p.tick(), 'nuit')
  maintenant = new Date(2026, 9, 3, 1, 6); assert.equal(await p.tick(), 'rien', 'pas deux fois le même jour')
  maintenant = new Date(2026, 9, 4, 15, 0); assert.equal(await p.tick(), 'rien', 'hors fenêtre (3 h de l’après-midi)')
  maintenant = new Date(2026, 9, 4, 2, 0); assert.equal(await p.tick(), 'nuit')
  assert.equal(lanc.length, 2); p.arreter()
})

test('sources : normalisation, déconnexion détectée, « robots » n’est pas un blocage', () => {
  const s = sources.normaliser({ nom: 'Ads Library Facebook', urlConnexion: 'https://www.facebook.com/ads/library/', pages: 'https://www.facebook.com/ads/library/?q=robot\n' })
  assert.equal(s.id, 'ads-library-facebook'); assert.equal(s.pages.length, 1); assert.equal(sources.partition(s), 'persist:source-ads-library-facebook')
  assert.throws(() => sources.normaliser({ nom: '', urlConnexion: 'https://x.fr' }), /nom/)
  assert.throws(() => sources.normaliser({ nom: 'x', urlConnexion: 'javascript:alert(1)' }), /invalide/)
  const doublon = sources.normaliser({ nom: 'Ads Library Facebook', urlConnexion: 'https://x.fr' }, [s])
  assert.notEqual(doublon.id, s.id)
  assert.equal(sources.etatSession(s, { url: s.urlConnexion, texte: 'Robots de cuisine, 12 annonces', champMotDePasse: false }).etat, 'connecte')
  assert.equal(sources.etatSession(s, { url: s.urlConnexion, texte: 'Veuillez saisir', champMotDePasse: true }).etat, 'deconnecte')
  assert.equal(sources.etatSession(s, { url: 'https://www.facebook.com/login/?next=x', texte: '', champMotDePasse: false }).etat, 'deconnecte')
  assert.equal(sources.etatSession(s, { url: s.urlConnexion, texte: 'Please verify you are human', champMotDePasse: false }).etat, 'bloque')
  const t = { ...s, texteDeconnecte: 'Se connecter' }
  assert.equal(sources.etatSession(t, { url: s.urlConnexion, texte: 'Bonjour. Se connecter', champMotDePasse: false }).etat, 'deconnecte')
})

test('relevés : sessions lues, instantanés datés écrits, arrêt au premier blocage', async (srv) => {
  const m = monde(srv)
  const a = sources.normaliser({ nom: 'Source A', urlConnexion: 'https://a.example/', pages: 'https://a.example/1\nhttps://a.example/2\nhttps://a.example/3' })
  const b = sources.normaliser({ nom: 'Source B', urlConnexion: 'https://b.example/', pages: 'https://b.example/1' })
  const c = sources.normaliser({ nom: 'Source C', urlConnexion: 'https://c.example/', pages: 'https://c.example/1\nhttps://c.example/2' })
  const lues = []
  const lire = async (s, url) => {
    lues.push(url)
    if (s.id === 'source-b') return { url, urlFinale: 'https://b.example/login', texte: '', champMotDePasse: true }
    if (s.id === 'source-c' && url.endsWith('/2')) return { url, urlFinale: url, texte: 'Please verify you are human', champMotDePasse: false }
    return { url, urlFinale: url, texte: `contenu de ${url}`, champMotDePasse: false }
  }
  const { lectures, etats } = await veille.releverSources({ sources: [a, b, c], lire, racine: m.racine, date: '2026-10-03', journal: m.journal, pause: 0 })
  assert.equal(etats['source-a'].etat, 'connecte'); assert.equal(etats['source-b'].etat, 'deconnecte'); assert.equal(etats['source-c'].etat, 'bloque')
  assert.equal(lectures.length, 3 + 1, 'A: 3 pages, C: 1 avant le blocage, B: 0')
  assert.equal(lues.filter((u) => u.startsWith('https://c.example')).length, 2)
  const f = path.join(m.racine, 'releves', '2026-10-03', 'source-a', '001.txt')
  assert.match(fs.readFileSync(f, 'utf8'), /^URL: https:\/\/a\.example\/1\nLu le: /)
})

test('relevés dans le rayon : le texte des sites connectés arrive dans les preuves, leurs URL sont « vues »', async (srv) => {
  const m = monde(srv); remise()
  let prompt = ''
  const claudeEspion = { message: async (a) => { if (!/tableau JSON/.test(a.systeme || '')) prompt = a.utilisateur; return m.claude.message(a) } }
  const deps = { ...m.deps, claude: claudeEspion, releves: async () => [{ source: 'Ads Library TikTok', url: 'https://ads.example/trend/1', texte: 'Annonce virale : mini hachoir, 4,2 M de vues' }] }
  await executerRayon({ rayon: m.rayon, deps, options: {} })
  assert.match(prompt, /RELEVÉS DES SITES DE DONNÉES CONNECTÉS/)
  assert.match(prompt, /mini hachoir, 4,2 M de vues/)
  assert.match(prompt, /https:\/\/ads\.example\/trend\/1/)
})

test('validation : une URL absente des pages lues n’est jamais conservée', () => {
  const r = { study: {}, executive_summary: {}, market: {}, creative_prompts: { image_ads: ['a'], short_videos_30s: ['b'] }, products: [{ supplier_url: 'https://vu.fr/a/', target_selling_price: 30, net_margin_estimated: 10 }, { supplier_url: 'https://pasvu.fr/b', target_selling_price: 30 }] }
  const v = valider(r, new Set(['https://vu.fr/a']), { attendus: 2 })
  assert.equal(r.products[0].supplier_url, 'https://vu.fr/a/'); assert.equal(r.products[1].supplier_url, NON_VERIFIE)
  assert.equal(v.stats.urlsDistinctes, 1); assert.equal(v.ok, false)
})

test('dépôt : arborescence créée, écriture atomique, re-dépôt du même jour remplace', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-'))
  creerArborescence(racine)
  for (const d of ['rapports', 'releves', 'journaux', 'diagnostics', 'sauvegardes', 'prompts']) assert.ok(fs.existsSync(path.join(racine, d)), d)
  const base = { date: '2026-10-03', categorie: 'c', theme: 't' }
  depot.ecrireRapport(racine, { ...base, json: { v: 1 }, rayonMd: 'a', marketingMd: 'b' })
  const c = depot.ecrireRapport(racine, { ...base, json: { v: 2 }, rayonMd: 'a2', marketingMd: 'b2' })
  assert.equal(JSON.parse(fs.readFileSync(c.json, 'utf8')).v, 2)
  assert.equal(fs.readdirSync(c.dossier).filter((f) => f.endsWith('.tmp')).length, 0)
})

// ------------------------------------------------------------------ run
;(async () => {
  const srv = await creerServeur()
  let ko = 0
  for (const [nom, fn] of essais) {
    try {
      await fn(srv)
      console.log(`ok   ${nom}`)
      ok++
    } catch (err) {
      ko++
      console.log(`FAIL ${nom}\n     ${String((err && err.stack) || err).split('\n').slice(0, 6).join('\n     ')}`)
    }
  }
  srv.close()
  console.log(`\n${ok} réussis, ${ko} échoués.`)
  process.exit(ko ? 1 : 0)
})()
