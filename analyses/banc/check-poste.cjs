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
const sig = lib('signaux')
const plus = lib('serper-etendu')

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

test('Claude : l’identifiant d’espace de travail part en en-tête seulement s’il est posé', async () => {
  const vus = []
  const spy = async (_u, o) => { vus.push(o.headers); return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: {} }) } }
  await creerClaude({ cle: 'k', modele: 'm', fetchImpl: spy }).message({ utilisateur: 'x', maxTokens: 4, flux: false })
  await creerClaude({ cle: 'k', modele: 'm', espace: 'wrkspc_abc123', fetchImpl: spy }).message({ utilisateur: 'x', maxTokens: 4, flux: false })
  assert.equal(vus[0]['anthropic-workspace-id'], undefined)
  assert.equal(vus[1]['anthropic-workspace-id'], 'wrkspc_abc123')
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

test('signaux : dates, nombres, Meta Ad Library et Google Trends lus sans rien inventer', () => {
  assert.equal(sig.parserDate('12 sept. 2026'), '2026-09-12')
  assert.equal(sig.parserDate('3 mars 2026'), '2026-03-03')
  assert.equal(sig.parserDate('Sep 12, 2026'), '2026-09-12')
  assert.equal(sig.parserDate('1 février 2026'), '2026-02-01')
  assert.equal(sig.parserDate('hier soir'), null)
  assert.equal(sig.parserNombre('~1,2 K'), 1200)
  assert.equal(sig.parserNombre('1.5M'), 1500000)
  assert.equal(sig.parserNombre('1 200'), 1200)
  assert.equal(sig.parserNombre('120'), 120)
  const meta = sig.extraireMetaAds('~1,2 K résultats\nIdentifiant de la bibliothèque : 111\nDate de début de diffusion : 3 mars 2026\nIdentifiant de la bibliothèque : 112\nStarted running on Sep 12, 2026', new Date('2026-10-03T00:00:00Z'))
  assert.equal(meta.statut, 'ok'); assert.equal(meta.resultats, 1200); assert.equal(meta.annoncesVues, 2)
  assert.equal(meta.plusAncienne, '2026-03-03'); assert.equal(meta.ancienneteJours, 214)
  assert.equal(sig.extraireMetaAds('Aucun résultat pour cette recherche.').statut, 'aucun')
  assert.equal(sig.extraireMetaAds('Page qui a changé de forme').statut, 'illisible')
  assert.equal(sig.extraireMetaAds('').statut, 'illisible')
  const lignes = Array.from({ length: 52 }, (_, i) => ({ time: String(1759000000 + i * 604800), formattedAxisTime: 'sem ' + (i + 1), value: [i >= 44 ? 60 : 30, 0], hasData: [true, i > 100] }))
  const t = sig.extraireTrends(")]}',\n" + JSON.stringify({ default: { timelineData: lignes } }), ['a', 'b'])
  assert.equal(t[0].statut, 'ok'); assert.equal(t[0].variationPct, 100, '8 dernières semaines (60) contre 8 précédentes (30)'); assert.equal(t[0].indiceMoyen, 35)
  assert.equal(t[1].statut, 'sans_donnees')
  assert.equal(sig.extraireTrends('<html>pas du JSON', ['a']), null)
  assert.equal(sig.raccourcir('Philips Airfryer HD9252/90 XL (noir)', 3), 'Philips Airfryer HD9252')
})

test('signaux : lus par le poste sur de fausses pages, le blocage arrête la source pour la nuit', async (srv) => {
  const m = monde(srv); remise()
  const base = 'http://127.0.0.1:' + m.port
  const lire = async (url, opts = {}) => {
    const r = await fetch(url)
    const html = await r.text()
    const texte = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '\n')
    const captures = []
    if (opts.capture) captures.push(await (await fetch(base + '/trends/api/widgetdata/multiline?x=1')).text())
    return { url, urlFinale: url, texte, champMotDePasse: false, captures }
  }
  const suivi = { meta: null, trends: null }
  const cfg = { meta: true, trends: true, plafondPubsParRayon: 6, plafondTendancesParRayon: 2 }
  const noms = Array.from({ length: 10 }, (_, i) => 'Marque Modele ' + i)
  const sortie = await sig.releverSignaux({ rayon: m.rayon, noms, lire, config: cfg, bases: { meta: base, trends: base }, journal: m.journal, suivi, pause: 0 })
  assert.equal(sortie.pubs.length, 6, 'plafond de 6 modèles par rayon')
  assert.deepEqual(sortie.pubs.map((p) => p.statut), ['ok', 'aucun', 'illisible', 'ok', 'ok', 'ok'], JSON.stringify(sortie.pubs))
  assert.equal(sortie.tendances.length, 2, 'le thème, puis les modèles comparés')
  assert.equal(sortie.tendances[0].series[0].variationPct, 100)
  const bloc = sig.sectionPreuves(sortie)
  assert.match(bloc, /SIGNAUX PUBLICS MESURÉS/); assert.match(bloc, /~1200 annonce\(s\)/); assert.match(bloc, /aucune annonce active trouvée/); assert.match(bloc, /: illisible/)
  assert.match(bloc, /variation|8 dernières semaines contre les 8 précédentes \+100 %/)
  // a block on the 2nd model stops Meta for the rest of the night, Trends goes on
  etat.mode = 'meta-bloque'
  const suivi2 = { meta: null, trends: null }
  const s2 = await sig.releverSignaux({ rayon: m.rayon, noms, lire, config: cfg, bases: { meta: base, trends: base }, journal: m.journal, suivi: suivi2, pause: 0 })
  assert.equal(s2.pubs[0].statut, 'bloque'); assert.ok(s2.pubs.slice(1).every((p) => p.statut === 'non_lu'))
  assert.equal(etat.pubs.length > 0 && etat.pubs.length, 7, 'une seule requête de plus après le blocage (6 + 1)')
  assert.ok(suivi2.meta && !suivi2.trends)
  const s3 = await sig.releverSignaux({ rayon: m.rayon, noms, lire, config: cfg, bases: { meta: base, trends: base }, journal: m.journal, suivi: suivi2, pause: 0 })
  assert.ok(s3.pubs.every((p) => p.statut === 'non_lu'), 'le rayon suivant ne rappelle pas Meta')
  assert.equal(etat.pubs.length, 7)
})

test('rayon : questions Google et signaux publics arrivent dans les preuves ; une panne des signaux ne fait pas échouer le rayon', async (srv) => {
  const m = monde(srv); remise()
  let prompt = ''
  const claudeEspion = { message: async (a) => { if (!/tableau JSON/.test(a.systeme || '')) prompt = a.utilisateur; return m.claude.message(a) } }
  const signaux = async () => ({ tendances: [{ groupe: 'thème', statut: 'ok', series: [{ mot: 'Smartphones', statut: 'ok', points: 52, indiceMoyen: 35, variationPct: 100, pic: 'sem 45' }] }], pubs: [{ produit: 'Marque Modele 0', terme: 'Marque Modele 0', statut: 'ok', resultats: 1200, annoncesVues: 2, plusAncienne: '2026-03-03', ancienneteJours: 214 }, { produit: 'X', terme: 'X', statut: 'bloque', raison: 'captcha' }] })
  const res = await executerRayon({ rayon: m.rayon, deps: { ...m.deps, claude: claudeEspion, signaux }, options: {} })
  assert.equal(res.statut, 'ok')
  assert.match(prompt, /QUESTIONS ET RECHERCHES ASSOCIÉES/); assert.match(prompt, /Est-ce que ça vaut le coup \?/); assert.match(prompt, /pas cher/)
  assert.match(prompt, /SIGNAUX PUBLICS MESURÉS/); assert.match(prompt, /« X » : bloque \(captcha\)/)
  const j = JSON.parse(fs.readFileSync(res.chemins.json, 'utf8'))
  assert.deepEqual(j.poste.signaux, { courbes: 1, pubsLues: 1, pubsDemandees: 2 })
  assert.ok(fs.existsSync(path.join(m.racine, 'releves', '2026-10-03', 'signaux', 'telephonie_smartphones.json')), 'relevé brut gardé pour contrôle')
  remise()
  const res2 = await executerRayon({ rayon: m.rayon, deps: { ...m.deps, signaux: async () => { throw new Error('fenêtre indisponible') } }, options: {} })
  assert.equal(res2.statut, 'ok', 'les signaux sont un plus : leur panne ne perd pas le rayon')
})

test('Serper étendu : prix lus sans rien inventer, Shopping/Autocomplétion/Images, refus de crédit en clair', async (srv) => {
  const m = monde(srv); remise()
  assert.equal(plus.prixEnNombre('129,90 €'), 129.9); assert.equal(plus.prixEnNombre('1 299,00 €'), 1299); assert.equal(plus.prixEnNombre('$29.99'), 29.99)
  assert.equal(plus.prixEnNombre('1.299 €'), 1299); assert.equal(plus.prixEnNombre('Voir le prix'), null); assert.equal(plus.prixEnNombre(''), null)
  const offres = await m.serper.shopping('Marque A')
  assert.equal(offres.length, 3); assert.equal(offres[0].vendeur, 'Boulanger'); assert.equal(offres[0].note, 4.4); assert.equal(offres[2].note, null)
  assert.deepEqual(await m.serper.autocomplete('robot'), ['robot pas cher', 'robot avis'])
  const imgs = await m.serper.images('robot')
  assert.equal(imgs.length, 1, 'une image sans adresse http n’est pas gardée'); assert.match(imgs[0].image, /^http:\/\/127\.0\.0\.1/)
  etat.creditsSerper = false
  await assert.rejects(m.serper.shopping('x'), /Serper : 400 - Not enough credits/)
  // a refusal cuts the rest of the readings: unread, never an empty "success" with invented numbers
  const res = await plus.releverSerperEtendu({ rayon: m.rayon, noms: ['A', 'B'], serper: m.serper, journal: m.journal })
  assert.ok(res.coupe && res.requetes === 0 && res.shopping.every((x) => x.statut === 'erreur' || x.statut === 'non_lu'))
  assert.ok(plus.sectionsPreuvesSerper(res).join('').includes('Non lu'))
  assert.ok(!plus.sectionsPreuvesSerper(res).join('').match(/\d+ prix lus/))
})

test('rayon : prix Shopping, suggestions et images arrivent dans les preuves ; la panne de Serper étendu ne fait pas échouer le rayon', async (srv) => {
  const m = monde(srv); remise()
  let prompt = ''
  const claudeEspion = { message: async (a) => { if (!/tableau JSON/.test(a.systeme || '')) prompt = a.utilisateur; return m.claude.message(a) } }
  const res = await executerRayon({ rayon: m.rayon, deps: { ...m.deps, claude: claudeEspion, serperEtendu: { shopping: true, autocomplete: true, images: true, plafondShopping: 5, plafondImages: 3 } }, options: {} })
  assert.equal(res.statut, 'ok', JSON.stringify(res.validation))
  assert.equal(etat.serper, 46, 'les 46 requêtes du agent n8n sont inchangées')
  assert.equal(etat.shopping.length, 5); assert.equal(etat.images.length, 3); assert.equal(etat.autocomplete.length, 7)
  assert.match(prompt, /PRIX ET VENDEURS RELEVÉS/); assert.match(prompt, /Boulanger \| 129,90 €/)
  assert.match(prompt, /2 prix lus sur 3 offres, de 129,9 € à 1299 € \(médiane 714,45 €\)/)
  assert.match(prompt, /BackMarket \| Voir le prix/)
  assert.match(prompt, /SUGGESTIONS DE RECHERCHE GOOGLE/); assert.match(prompt, /pas cher/)
  assert.match(prompt, /IMAGES TROUVÉES[\s\S]*\/img\//)
  assert.match(prompt, /LISTE DES URL RENCONTRÉES[\s\S]*\/p\/shop1/, 'une page vendeur réellement vue est autorisée')
  assert.ok(!/LISTE DES URL RENCONTRÉES[\s\S]*google\.com\/shopping/.test(prompt), 'le lien de redirection Google n’est pas une URL fournisseur')
  const j = JSON.parse(fs.readFileSync(res.chemins.json, 'utf8'))
  assert.equal(j.poste.usage.serperEtendu, 15); assert.equal(j.poste.serperPlus.modelesAvecPrix, 5); assert.equal(j.poste.serperPlus.modelesAvecImages, 3)
  assert.ok(fs.existsSync(path.join(m.racine, 'releves', '2026-10-03', 'serper', 'telephonie_smartphones.json')), 'relevé brut gardé pour contrôle')
  // not asked -> not called
  remise()
  await executerRayon({ rayon: m.rayon, deps: m.deps, options: {} })
  assert.equal(etat.shopping.length + etat.images.length + etat.autocomplete.length, 0)
  // a provider that refuses the extra readings: the rayon survives
  remise()
  const serperCasse = { chercher: m.serper.chercher, shopping: async () => { throw new ErreurFournisseur('Serper', '429 - trop de requêtes') }, autocomplete: async () => ['a'], images: async () => [] }
  const res2 = await executerRayon({ rayon: m.rayon, deps: { ...m.deps, serper: serperCasse, serperEtendu: { shopping: true, autocomplete: true, images: true, plafondShopping: 3, plafondImages: 3 } }, options: {} })
  assert.equal(res2.statut, 'ok')
  const brut = JSON.parse(fs.readFileSync(path.join(m.racine, 'releves', '2026-10-03', 'serper', 'telephonie_smartphones.json'), 'utf8'))
  assert.match(brut.coupe, /429/); assert.ok(brut.shopping.every((x) => x.prixMin === null))
})

test('nuit : seuls les rayons choisis tournent (deux sur 24), liste vide = rien', async (srv) => {
  remise()
  const tous = agents.rayonsDuJour(agents.charger(), '2026-10-03')
  assert.equal(agents.choisirRayons(tous, null).length, 24, 'sans choix : les 24')
  const deux = agents.choisirRayons(tous, [tous[3].categorie, tous[7].categorie, 'inconnu'])
  assert.deepEqual(deux.map((r) => r.categorie), [tous[3].categorie, tous[7].categorie])
  assert.equal(agents.choisirRayons(tous, []).length, 0)
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'poste-'))
  creerArborescence(racine)
  const faits = []
  const bilan = await orch.lancerNuit({
    rayons: deux, date: '2026-10-03', racine, journal: creerJournal(racine),
    controle: async () => ({ ok: true, serper: { ok: true }, claude: { ok: true } }),
    executer: async (r) => { faits.push(r.categorie); return { statut: 'ok' } },
  })
  assert.equal(bilan.attendus, 2); assert.equal(bilan.ok, 2); assert.deepEqual(faits, deux.map((r) => r.categorie))
})

test('envoi au site : le rapport complet part une fois, rayon et marketing d’un coup, et se renvoie si le Poste le réécrit', async (srv) => {
  const m = monde(srv); remise()
  const base = `http://127.0.0.1:${srv.address().port}`
  const envoyer = (rapport) => depot.envoyerRapportAuSite({ apiBase: base, cle: 'cle-agent', rapport })
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: { envoyer } })
  assert.equal(res.statut, 'ok')
  assert.equal(etat.envoyes.length, 1)
  assert.equal(etat.envoyes[0].study.category_id, 'telephonie', 'l’identifiant exact de la catégorie accompagne le rapport')
  assert.equal(etat.envoyes[0].produits, 20); assert.equal(etat.envoyes[0].aPoste, false, 'le bloc interne « poste » reste sur ce PC')
  assert.equal(etat.envoyes[0].auth, 'Bearer cle-agent')
  assert.ok(depot.lireEnvoi(m.racine, '2026-10-03', 'telephonie', 'smartphones'), 'preuve d’envoi écrite à côté du rapport')
  assert.equal(depot.rapportsAEnvoyer(m.racine).length, 0, 'rien en attente')
  // a re-run replaces the report: the old proof no longer covers it
  remise()
  await executerRayon({ rayon: m.rayon, deps: m.deps, options: {} })
  assert.equal(depot.lireEnvoi(m.racine, '2026-10-03', 'telephonie', 'smartphones'), null)
  const attente = depot.rapportsAEnvoyer(m.racine)
  assert.equal(attente.length, 1); assert.equal(attente[0].categorie, 'telephonie')
  await envoyer(attente[0].rapport)
  depot.marquerEnvoye(m.racine, attente[0].date, attente[0].categorie, attente[0].theme, { rapportEcritLe: attente[0].rapport.poste.ecritLe, reponse: null })
  assert.equal(depot.rapportsAEnvoyer(m.racine).length, 0)
  // a report « à revoir » never goes
  remise(); etat.mode = 'url-inventee'
  await executerRayon({ rayon: { ...m.rayon, theme: 'coques-protection', libelleTheme: 'Coques' }, deps: m.deps, options: {} })
  assert.equal(depot.rapportsAEnvoyer(m.racine).length, 0, 'un rapport à revoir n’est jamais proposé à l’envoi')
})

test('envoi au site : le refus du site est dit en clair, une panne ne perd rien', async (srv) => {
  const m = monde(srv); remise()
  const base = `http://127.0.0.1:${srv.address().port}`
  const envoyer = (rapport) => depot.envoyerRapportAuSite({ apiBase: base, cle: 'cle-agent', rapport })
  etat.mode = 'site-refuse'
  const res = await executerRayon({ rayon: m.rayon, deps: m.deps, options: { envoyer } })
  assert.equal(res.statut, 'ok', 'le rapport est écrit même si le site refuse')
  assert.equal(depot.lireEnvoi(m.racine, '2026-10-03', 'telephonie', 'smartphones'), null, 'refusé : pas marqué envoyé')
  assert.equal(depot.rapportsAEnvoyer(m.racine).length, 1, 'il reste en attente pour le renvoi')
  await assert.rejects(envoyer(depot.rapportsAEnvoyer(m.racine)[0].rapport), /refusé le rapport \(403\).*Accès réservé.*administrateur/)
  etat.mode = 'site-hors-ligne'
  await assert.rejects(envoyer(depot.rapportsAEnvoyer(m.racine)[0].rapport), /\(502\)/)
  etat.mode = 'bon'
  await assert.rejects(envoyer({ study: { date: '2026-10-03' }, products: [] }), /\(422\).*Aucun produit/)
  await envoyer(depot.rapportsAEnvoyer(m.racine)[0].rapport)
  assert.equal(etat.envoyes.length, 1)
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
