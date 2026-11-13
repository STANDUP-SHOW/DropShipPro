'use strict'
/**
 * Bench of KANTIX ANALYSER's own logic (0.5.0): schedules, keys/projects/analyses,
 * migration of a Poste config, the four provider families, the signed feed,
 * one analysis end to end, the brief. Against FAKE providers served locally:
 * a fake server writes the contract by hand, so a green bench proves the
 * plumbing and the guards, NOT the real providers' answers (see README).
 *
 *   cd analyses && node banc/check-kantix.cjs
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

const lib = (n) => require(path.join(__dirname, '..', 'lib', n))
const rec = lib('recurrence')
const kantix = lib('kantix')
const config = lib('config')
const ia = lib('fournisseurs-ia')
const flux = lib('flux')
const { executerAnalyse, urlsDuTexte, estFicheProduit, CONTRAT } = lib('executer-analyse')
const liensProduit = lib('verifier-liens')
const brief = lib('brief')
const { creerJournal } = lib('journal')

const essais = []
const test = (nom, fn) => essais.push([nom, fn])

// ------------------------------------------------------------------ fake providers
const recu = [] // every request: { url, headers, corps }
let reponse = null // (req, corps) => { statut, sse:[events] | json }
const sse = (evs) => evs.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
function serveur() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let brut = ''
      req.on('data', (d) => (brut += d))
      req.on('end', () => {
        let corps = null
        try { corps = JSON.parse(brut) } catch { corps = brut }
        recu.push({ url: req.url, methode: req.method, headers: req.headers, corps, brut })
        const r = reponse(req, corps) || { statut: 404, json: { error: { message: 'inconnu' } } }
        res.writeHead(r.statut || 200, { 'content-type': r.sse ? 'text/event-stream' : 'application/json' })
        res.end(r.sse ? (typeof r.sse === 'string' ? r.sse : sse(r.sse)) : JSON.stringify(r.json || {}))
      })
    })
    s.listen(0, '127.0.0.1', () => ok(s))
  })
}

const RAPPORT = (urls) => `# Veille\n\nLe prix lu est 19 € (${urls[0]}).\n\nVoir aussi [la fiche](${urls[1] || urls[0]}).\n\n${'Analyse détaillée. '.repeat(20)}\n\n\`\`\`json\n${JSON.stringify({ titre: 'Veille test', resume: 'Deux sources.', donnees: { prix: 19 }, sources: urls })}\n\`\`\``

// ------------------------------------------------------------------ schedules
test('récurrence : tous les jours à 00:00, créneau de la nuit rattrapé jusqu’à 6 h', () => {
  const r = rec.normaliserRecurrence({ type: 'quotidien', heure: '00:00' })
  const a = { recurrence: r, planifieeLe: new Date(2026, 9, 20, 12).toISOString(), derniere: null }
  assert.equal(rec.creneauDu(a, new Date(2026, 9, 24, 0, 1)).getTime(), new Date(2026, 9, 24, 0, 0).getTime())
  assert.equal(rec.creneauDu(a, new Date(2026, 9, 24, 5, 59)).getDate(), 24)
  assert.equal(rec.creneauDu(a, new Date(2026, 9, 24, 6, 1)), null, 'trop tard : le prochain créneau, pas celui-ci')
  a.derniere = { creneau: new Date(2026, 9, 24, 0, 0).toISOString() }
  assert.equal(rec.creneauDu(a, new Date(2026, 9, 24, 0, 5)), null, 'déjà fait')
  assert.equal(rec.prochainCreneau(r, new Date(2026, 9, 24, 0, 5)).getDate(), 25)
})

test('récurrence : une fois par semaine le lundi à 08:30 ; enregistrer ne lance pas un créneau déjà passé', () => {
  const r = rec.normaliserRecurrence({ type: 'hebdo', heure: '08:30', jour: 1 })
  const lundi = new Date(2026, 9, 26, 8, 30) // 26/10/2026 is a Monday
  assert.equal(lundi.getDay(), 1)
  assert.equal(rec.dernierCreneau(r, new Date(2026, 9, 28, 10)).getTime(), lundi.getTime())
  assert.equal(rec.creneauDu({ recurrence: r, planifieeLe: new Date(2026, 9, 26, 9).toISOString() }, new Date(2026, 9, 26, 9, 1)), null)
  assert.equal(rec.creneauDu({ recurrence: r, planifieeLe: new Date(2026, 9, 20).toISOString() }, new Date(2026, 9, 26, 9)).getTime(), lundi.getTime())
  assert.equal(rec.libelle(r), 'Chaque lundi à 08:30')
  assert.throws(() => rec.normaliserRecurrence({ type: 'quotidien', heure: '25:00' }), /Heure invalide/)
  assert.deepEqual(rec.normaliserRecurrence({ type: 'n importe' }), { type: 'aucune' })
})

// ------------------------------------------------------------------ model
test('clés, projets, analyses : validation et identifiants', () => {
  const c = kantix.normaliserCle({ fournisseur: 'mistral', nom: 'Mistral iAgents', valeur: 'x' }, [])
  assert.equal(c.fournisseur, 'mistral'); assert.equal(c.verifieeLe, null); assert.equal(c.base, '')
  assert.throws(() => kantix.normaliserCle({ fournisseur: 'compatible', nom: 'x' }, []), /adresse de l’API/)
  assert.throws(() => kantix.normaliserCle({ fournisseur: 'inconnu' }, []), /fournisseur/)
  const p = kantix.normaliserProjet({ nom: 'Jobber+', url: 'https://jobber.example/', cleId: c.id, flux: { adresse: 'https://jobber.example/api/kantix/flux' } }, [], [c])
  assert.equal(p.id, 'jobber'); assert.equal(p.url, 'https://jobber.example')
  assert.throws(() => kantix.normaliserProjet({ nom: 'x', cleId: 'nope' }, [], [c]), /Clé API inconnue/)
  assert.throws(() => kantix.normaliserProjet({ nom: 'x', url: 'ftp://a' }, [], []), /invalide/)
  const a = kantix.normaliserAnalyse({ nom: 'Veille', projetId: p.id, prompt: 'Analyse les concurrents du site, avec les prix.', recurrence: { type: 'quotidien', heure: '00:00' }, onglets: ['ads', 'fantome'] }, [], [p], [{ id: 'ads' }])
  assert.deepEqual(a.onglets, ['ads'], 'un onglet supprimé ne reste pas')
  assert.ok(a.planifieeLe)
  assert.throws(() => kantix.normaliserAnalyse({ nom: 'x', projetId: p.id, prompt: 'court' }, [], [p], []), /prompt/)
  assert.throws(() => kantix.normaliserAnalyse({ nom: 'x', projetId: 'zz', prompt: 'x'.repeat(30) }, [], [p], []), /projet/)
  assert.ok(config.secretConnu('cle:' + c.id) && config.secretConnu('flux:jobber') && !config.secretConnu('cle:../x'))
  assert.match(kantix.fabriquerSecretFlux(), /^kx_[A-Za-z0-9_-]{43}$/)
})

test('migration d’un Poste 0.4 : clé Anthropic reprise, connecteur DropShipper allumé, projet DropShipper ; une seule fois', () => {
  const ancien = { ...config.PAR_DEFAUT, cles: [], projets: [], analyses: [], secrets: { anthropic: { chiffre: 'AAA' }, admin: { chiffre: 'BBB' } } }
  const { cfg, change } = kantix.migrer(ancien, { installExistante: true })
  assert.equal(change, true)
  assert.equal(cfg.cles[0].fournisseur, 'anthropic')
  assert.deepEqual(cfg.secrets['cle:anthropic-poste'], { chiffre: 'AAA' })
  assert.deepEqual(cfg.secrets.anthropic, { chiffre: 'AAA' }, 'l’ancien emplacement reste (retour arrière possible)')
  assert.equal(cfg.connecteurs.dropshipper.actif, true)
  assert.equal(cfg.connecteurs.dropshipper.cleId, 'anthropic-poste')
  assert.equal(cfg.projets[0].connecteur, 'dropshipper')
  assert.equal(kantix.migrer(cfg, { installExistante: true }).change, false)
  const neuf = kantix.migrer({ ...config.PAR_DEFAUT, cles: [], projets: [], analyses: [], secrets: {} }, { installExistante: false }).cfg
  assert.equal(neuf.connecteurs.dropshipper.actif, false, 'installation neuve : DropShipper non connecté')
  assert.equal(neuf.projets.length, 0)
})

// ------------------------------------------------------------------ providers
let base = ''
const cleInfo = (fournisseur, extra) => ({ id: 'k', fournisseur, nom: 'clé test', modele: 'm-test', base, ...extra })

test('Anthropic : flux lu, recherche web, citations, reprise d’un pause_turn, effort obligatoire', async () => {
  let n = 0
  reponse = (req, corps) => {
    if (!req.url.endsWith('/messages')) return null
    n++
    if (n === 1) return { sse: [
      { type: 'message_start', message: { usage: { input_tokens: 100 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"prix"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://a.example/p1', title: 'A' }] } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'pause_turn' }, usage: { output_tokens: 5 } },
    ] }
    assert.equal(corps.messages.length, 2, 'la suite renvoie le tour en pause')
    assert.equal(corps.messages[1].content[0].input.query, 'prix')
    return { sse: [
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Bonjour ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: { url: 'https://b.example/p2', cited_text: 'x' } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'le monde' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
    ] }
  }
  recu.length = 0
  const r = await ia.generer({ cleInfo: cleInfo('anthropic'), cle: 'sk', systeme: 'S', messages: [{ role: 'user', parties: [{ type: 'texte', texte: 'q' }, { type: 'pdf', base64: 'JVBE', nom: 'a.pdf' }] }], rechercheWeb: true })
  assert.equal(r.texte, 'Bonjour le monde')
  assert.deepEqual(r.urls.sort(), ['https://a.example/p1', 'https://b.example/p2'])
  assert.equal(r.usage.recherches, 1)
  assert.equal(recu[0].headers['x-api-key'], 'sk')
  assert.deepEqual(recu[0].corps.output_config, { effort: 'medium' })
  assert.equal(recu[0].corps.tools[0].type, 'web_search_20250305')
  assert.equal(recu[0].corps.messages[0].content[1].type, 'document')
})

test('OpenAI (Responses) : texte, sources de la recherche, annotations', async () => {
  reponse = (req) => req.url.endsWith('/responses') ? { sse: [
    { type: 'response.output_text.delta', delta: 'Rapport ' },
    { type: 'response.output_text.delta', delta: 'GPT' },
    { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 3 }, output: [
      { type: 'web_search_call', action: { sources: [{ url: 'https://c.example/1' }] } },
      { type: 'message', content: [{ type: 'output_text', annotations: [{ type: 'url_citation', url: 'https://d.example/2' }] }] },
    ] } },
  ] } : null
  recu.length = 0
  const r = await ia.generer({ cleInfo: cleInfo('openai'), cle: 'sk-o', messages: [{ role: 'user', parties: [{ type: 'texte', texte: 'q' }] }], rechercheWeb: true })
  assert.equal(r.texte, 'Rapport GPT')
  assert.deepEqual(r.urls.sort(), ['https://c.example/1', 'https://d.example/2'])
  assert.equal(recu[0].headers.authorization, 'Bearer sk-o')
  assert.deepEqual(recu[0].corps.tools, [{ type: 'web_search' }])
})

test('Gemini : flux SSE, ancrage Google Search (liens et domaines lus)', async () => {
  reponse = (req) => req.url.includes(':streamGenerateContent') ? { sse: [
    { candidates: [{ content: { parts: [{ text: 'Rapport ' }] } }] },
    { candidates: [{ content: { parts: [{ text: 'Gemini' }] }, finishReason: 'STOP', groundingMetadata: { webSearchQueries: ['q'], groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/redirect/x', title: 'e.example' } }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 } },
  ] } : null
  recu.length = 0
  const r = await ia.generer({ cleInfo: cleInfo('gemini'), cle: 'g', messages: [{ role: 'user', parties: [{ type: 'texte', texte: 'q' }] }], rechercheWeb: true })
  assert.equal(r.texte, 'Rapport Gemini')
  assert.deepEqual(r.domaines, ['e.example'])
  assert.equal(recu[0].headers['x-goog-api-key'], 'g')
  assert.deepEqual(recu[0].corps.tools, [{ google_search: {} }])
})

test('compatible OpenAI (Mistral, Perplexity…) : texte, citations Perplexity, refus lisible', async () => {
  reponse = (req) => req.url.endsWith('/chat/completions') ? { sse: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Salut ' } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: 'toi' }, finish_reason: 'stop' }], citations: ['https://f.example/z'] })}\n\ndata: [DONE]\n\n` } : null
  const r = await ia.generer({ cleInfo: cleInfo('perplexity'), cle: 'p', messages: [{ role: 'user', parties: [{ type: 'texte', texte: 'q' }] }], rechercheWeb: true })
  assert.equal(r.texte, 'Salut toi')
  assert.deepEqual(r.urls, ['https://f.example/z'])
  await assert.rejects(() => ia.generer({ cleInfo: cleInfo('mistral'), cle: 'p', messages: [{ role: 'user', parties: [{ type: 'pdf', base64: 'x' }] }] }), /ne lit pas les PDF/)
  reponse = () => ({ statut: 401, json: { error: { message: 'Invalid API key' } } })
  await assert.rejects(() => ia.generer({ cleInfo: cleInfo('mistral'), cle: 'p', messages: [{ role: 'user', parties: [{ type: 'texte', texte: 'q' }] }] }), /Mistral AI : 401 - Invalid API key/)
  await assert.rejects(() => ia.generer({ cleInfo: cleInfo('mistral', { modele: '' }), cle: 'p', messages: [] }), /Aucun modèle/)
})

test('lister les modèles = test de la clé (Anthropic, Gemini, compatible sans liste)', async () => {
  reponse = (req) => {
    if (req.url.startsWith('/models?limit')) return { json: { data: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-5-5' }] } }
    if (req.url.startsWith('/models?pageSize')) return { json: { models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] } }
    if (req.url === '/models') return { statut: 404, json: {} }
    return null
  }
  assert.deepEqual((await ia.listerModeles({ cleInfo: cleInfo('anthropic'), cle: 'k' })).modeles, ['claude-sonnet-5-5', 'claude-haiku-5-5'])
  assert.deepEqual((await ia.listerModeles({ cleInfo: cleInfo('gemini'), cle: 'k' })).modeles, ['gemini-x'])
  assert.equal((await ia.listerModeles({ cleInfo: cleInfo('perplexity'), cle: 'k' })).nonListable, true)
  assert.equal(ia.FOURNISSEURS.length, 11)
})

// ------------------------------------------------------------------ feed
test('flux : POST signé que la fiche technique sait vérifier ; refus du site remonté', async () => {
  const secret = kantix.fabriquerSecretFlux()
  reponse = (req) => req.url === '/api/kantix/flux' ? { json: { ok: true } } : { statut: 401, json: { error: 'signature invalide' } }
  recu.length = 0
  const r = await flux.envoyerRapport({ adresse: `${base}/api/kantix/flux`, secret, rapport: { projet: { id: 'p' }, analyse: { id: 'a', nom: 'A' }, markdown: '# x', donnees: {}, sources: [] } })
  assert.equal(r.statut, 200)
  const q = recu[0]
  const attendu = crypto.createHmac('sha256', secret).update(`${q.headers['x-kantix-horodatage']}.${q.brut}`).digest('hex')
  assert.equal(q.headers['x-kantix-signature'], `sha256=${attendu}`)
  assert.equal(q.corps.kantix, 1); assert.equal(q.corps.type, 'rapport')
  await assert.rejects(() => flux.envoyerTest({ adresse: `${base}/autre`, secret, projet: { id: 'p', nom: 'P' } }), /refusé le flux \(401\)/)
  await assert.rejects(() => flux.envoyerTest({ adresse: '', secret, projet: { id: 'p' } }), /Pas d’adresse/)
  const fiche = flux.ficheTechnique({ id: 'p', nom: 'P', url: 'https://p.example', flux: { adresse: '' } })
  assert.match(fiche, /POST https:\/\/p\.example\/api\/kantix\/flux/)
  assert.ok(!fiche.includes(secret))
})

// ------------------------------------------------------------------ one analysis
function preparer() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'kantix-'))
  return { racine, journal: creerJournal(racine) }
}
const ANALYSE = { id: 'veille', nom: 'Veille prix', projetId: 'p', prompt: 'Relève les prix des concurrents.', rechercheWeb: true, onglets: ['ads'] }
const PROJET = { id: 'p', nom: 'Projet', url: 'https://p.example' }

test('analyse validée : liens lus seulement, onglet lu, fichiers .md et .json écrits', async () => {
  const { racine, journal } = preparer()
  let consigne = ''
  const res = await executerAnalyse({
    analyse: ANALYSE, projet: PROJET, dossierSortie: racine, rechercheDisponible: true, journal, maintenant: new Date(2026, 9, 24, 0, 0),
    lireOnglets: async (ids) => { assert.deepEqual(ids, ['ads']); return { lectures: [{ source: 'Ads', url: 'https://ads.example/s', texte: 'Texte de l’onglet' }], problemes: [] } },
    generer: async (a) => { consigne = a.messages[0].parties[0].texte; assert.equal(a.rechercheWeb, true); return { texte: RAPPORT(['https://a.example/p1', 'https://ads.example/s']), arret: 'end_turn', urls: ['https://a.example/p1'], usage: { entree: 1 }, fournisseur: 'anthropic', modele: 'm' } },
  })
  assert.match(consigne, /Texte de l’onglet/)
  assert.match(consigne, /Relève les prix/)
  assert.equal(res.rapport.statut, 'ok', res.rapport.problemes.join(' | '))
  assert.equal(res.rapport.titre, 'Veille test')
  assert.deepEqual(res.rapport.donnees, { prix: 19 })
  assert.ok(!res.rapport.markdown.includes('```json'))
  assert.ok(fs.existsSync(res.fichiers.md) && fs.existsSync(res.fichiers.json))
  assert.match(res.fichiers.md, /veille-prix[\\/]2026-10-24[\\/]0000\.md$/)
})

test('analyse à revoir : un lien jamais lu, un onglet déconnecté ; réponse vide = échec sans fichier', async () => {
  const { racine, journal } = preparer()
  const res = await executerAnalyse({
    analyse: ANALYSE, projet: PROJET, dossierSortie: racine, rechercheDisponible: true, journal,
    lireOnglets: async () => ({ lectures: [], problemes: ['Onglet « Ads » non lu : deconnecte — champ mot de passe affiché'] }),
    generer: async () => ({ texte: RAPPORT(['https://a.example/p1', 'https://invente.example/x']), arret: 'end_turn', urls: ['https://a.example/p1'], usage: {}, fournisseur: 'openai', modele: 'm' }),
  })
  assert.equal(res.rapport.statut, 'a-revoir')
  assert.ok(res.rapport.problemes.some((p) => /invente\.example/.test(p)))
  assert.ok(res.rapport.problemes.some((p) => /déconnecte|deconnecte/.test(p)))
  assert.deepEqual(res.rapport.sources, ['https://a.example/p1'])
  assert.match(fs.readFileSync(res.fichiers.md, 'utf8'), /À revoir/)
  const vide = preparer()
  await assert.rejects(() => executerAnalyse({ analyse: { ...ANALYSE, onglets: [] }, projet: PROJET, dossierSortie: vide.racine, rechercheDisponible: false, journal: vide.journal, lireOnglets: async () => ({ lectures: [], problemes: [] }), generer: async () => ({ texte: '', arret: 'max_tokens', urls: [] }) }), /Réponse vide/)
  assert.deepEqual(fs.readdirSync(vide.racine).filter((f) => f !== 'journaux'), [])
})

test('analyse sans aucune source (ni recherche ni onglet) : à revoir ; Gemini vérifié par domaine', async () => {
  const { racine, journal } = preparer()
  const sans = await executerAnalyse({ analyse: { ...ANALYSE, onglets: [] }, projet: PROJET, dossierSortie: racine, rechercheDisponible: false, journal, lireOnglets: async () => ({ lectures: [], problemes: [] }), generer: async (a) => { assert.equal(a.rechercheWeb, false); return { texte: `${'Texte sans lien. '.repeat(20)}\n\`\`\`json\n{"titre":"t","resume":"r","donnees":{},"sources":[]}\n\`\`\``, arret: 'end_turn', urls: [], fournisseur: 'mistral', modele: 'm' } } })
  assert.equal(sans.rapport.statut, 'a-revoir')
  assert.ok(sans.rapport.problemes.some((p) => /Recherche web demandée mais absente/.test(p)))
  const g = await executerAnalyse({ analyse: { ...ANALYSE, onglets: [] }, projet: PROJET, dossierSortie: racine, rechercheDisponible: true, journal, lireOnglets: async () => ({ lectures: [], problemes: [] }), generer: async () => ({ texte: RAPPORT(['https://e.example/page']), arret: 'end_turn', urls: ['https://vertexaisearch.cloud.google.com/r'], domaines: ['e.example'], fournisseur: 'gemini', modele: 'm' }) })
  assert.equal(g.rapport.statut, 'ok', g.rapport.problemes.join(' | '))
  assert.deepEqual(urlsDuTexte('voir https://x.example/a). et [b](https://y.example/b)'), ['https://x.example/a', 'https://y.example/b'])
})

// ------------------------------------------------------------------ product links (13/11)
const PAGES = {
  'https://fr.aliexpress.com/item/1005001.html': '<html><head><meta property="og:title" content="Réchaud de camping pliable au gaz, 3000 W"></head></html>',
  'https://fr.aliexpress.com/item/1005002.html': '<html><head><title>Tapis de sol autogonflant | AliExpress</title></head></html>',
  'https://www.amazon.fr/dp/B0SHARED01': '<title>Table basse en bois</title>',
  'https://www.amazon.fr/dp/B0LENT0001': null,
  'https://www.amazon.fr/dp/B0TUYAU001': '<title>Tuyaux d&#39;arrosage extensibles 30 m</title>',
}
const fauxFetch = (lus = []) => async (url) => {
  lus.push(url)
  const html = PAGES[url]
  if (html === null) return { ok: false, status: 503, text: async () => '' }
  if (html === undefined) return { ok: false, status: 404, text: async () => '' }
  return { ok: true, status: 200, text: async () => html }
}

test('liens produit : titre conforme gardé, autre produit retiré, lien partagé retiré, page illisible retirée', async () => {
  const donnees = { produits: [
    { product_name: 'Réchaud de camping pliable', sourcing_url: 'https://fr.aliexpress.com/item/1005001.html', image_url: 'https://img.example/a.jpg' },
    { product_name: 'Réchaud de camping portable', sourcing_url: 'https://fr.aliexpress.com/item/1005002.html' },
    { product_name: 'Table basse', urls: { amazon: 'https://www.amazon.fr/dp/B0SHARED01' } },
    { product_name: 'Tuyau d’arrosage extensible', urls: { amazon: 'https://www.amazon.fr/dp/B0SHARED01', autre: 'https://www.amazon.fr/dp/B0TUYAU001' } },
    { product_name: 'Surchemise flanelle', amazon_url: 'https://www.amazon.fr/dp/B0LENT0001', search_url: 'https://fr.aliexpress.com/w/wholesale-surchemise.html' },
  ] }
  const lus = []
  const b = await liensProduit.verifierLiens(donnees, { fetchImpl: fauxFetch(lus) })
  const [p1, p2, p3, p4, p5] = donnees.produits
  assert.equal(p1.sourcing_url, 'https://fr.aliexpress.com/item/1005001.html')
  assert.equal(p1.url_status, 'verifie'); assert.match(p1.url_page_title, /Réchaud de camping/)
  assert.equal(p1.image_url, 'https://img.example/a.jpg')
  assert.equal(p2.sourcing_url, ''); assert.equal(p2.url_status, 'non_verifie')
  assert.match(p2.search_url, /^https:\/\/fr\.aliexpress\.com\/w\/wholesale-R/)
  assert.equal(p3.urls.amazon, ''); assert.equal(p4.urls.amazon, '')
  assert.equal(p4.urls.autre, 'https://www.amazon.fr/dp/B0TUYAU001', 'pluriel « tuyaux » accepté')
  assert.equal(p4.url_status, 'non_verifie')
  assert.equal(p5.amazon_url, ''); assert.equal(p5.search_url, 'https://fr.aliexpress.com/w/wholesale-surchemise.html')
  assert.ok(!lus.includes('https://www.amazon.fr/dp/B0SHARED01'), 'un lien partagé n’est même pas ouvert')
  assert.ok(!lus.some((u) => u.includes('img.example')))
  assert.equal(b.verifies, 2); assert.equal(b.doublons, 2); assert.equal(b.nonLus, 1); assert.equal(b.retires, 4)
  const md = liensProduit.corrigerMarkdown('Fiche : https://fr.aliexpress.com/item/1005002.html et https://fr.aliexpress.com/item/1005001.html', b.remplacements)
  assert.ok(!md.includes('1005002'))
  assert.ok(md.includes('https://fr.aliexpress.com/item/1005001.html'))
  assert.match(md, /recherche, lien non vérifié/)
  assert.equal(liensProduit.titreDeHtml('<meta content="A &amp; B" property="og:title">'), 'A & B')
  assert.ok(liensProduit.titreCorrespond('Coussins de sol', 'Coussin de sol XXL'))
  assert.ok(!liensProduit.titreCorrespond('Réchaud de camping', 'Tapis de sol'))
})

test('analyse : lien produit inventé retiré du .json et du .md ; fiche produit jamais validée par son seul domaine', async () => {
  const { racine, journal } = preparer()
  assert.match(CONTRAT, /direct_product_pages_only/)
  assert.match(CONTRAT, /Un champ vide vaut mieux qu’un lien vraisemblable/)
  assert.ok(estFicheProduit('https://fr.aliexpress.com/item/1005002.html'))
  assert.ok(estFicheProduit('https://www.amazon.fr/Table-basse/dp/B0X'))
  assert.ok(!estFicheProduit('https://fr.aliexpress.com/w/wholesale-table.html'))
  const bon = 'https://fr.aliexpress.com/item/1005001.html'
  const faux = 'https://fr.aliexpress.com/item/1005002.html'
  const donnees = { produits: [{ product_name: 'Réchaud de camping pliable', sourcing_url: bon }, { product_name: 'Réchaud de camping portable', sourcing_url: faux }] }
  const texte = `# Gagnants\n\nRéchaud : ${bon}\n\nAutre : ${faux}\n\n${'Analyse. '.repeat(30)}\n\n\`\`\`json\n${JSON.stringify({ titre: 'G', resume: 'r', donnees, sources: [bon, faux] })}\n\`\`\``
  const lus = []
  // Gemini-like: the provider only says which domains it read
  const res = await executerAnalyse({
    analyse: { ...ANALYSE, onglets: [] }, projet: PROJET, dossierSortie: racine, rechercheDisponible: true, journal, fetchImpl: fauxFetch(lus),
    lireOnglets: async () => ({ lectures: [], problemes: [] }),
    generer: async () => ({ texte, arret: 'end_turn', urls: [bon], domaines: ['fr.aliexpress.com'], fournisseur: 'gemini', modele: 'm' }),
  })
  assert.equal(res.rapport.donnees.produits[0].url_status, 'verifie')
  assert.equal(res.rapport.donnees.produits[1].sourcing_url, '')
  assert.equal(res.rapport.donnees.produits[1].url_status, 'non_verifie')
  assert.ok(!res.rapport.markdown.includes(faux))
  assert.ok(!fs.readFileSync(res.fichiers.md, 'utf8').includes(faux))
  assert.deepEqual(res.rapport.sources, [bon])
  assert.equal(res.rapport.liens.retires, 1)
  assert.ok(res.rapport.problemes.some((p) => /1 lien\(s\) produit retiré\(s\) sur 2/.test(p)))
  assert.equal(res.rapport.statut, 'ok', res.rapport.problemes.join(' | '))
  // a product page known only by its domain is not « read »
  const res2 = await executerAnalyse({
    analyse: { ...ANALYSE, onglets: [] }, projet: PROJET, dossierSortie: racine, rechercheDisponible: true, journal, fetchImpl: fauxFetch(),
    lireOnglets: async () => ({ lectures: [], problemes: [] }),
    generer: async () => ({ texte: RAPPORT(['https://fr.aliexpress.com/item/999.html']), arret: 'end_turn', urls: [], domaines: ['fr.aliexpress.com'], fournisseur: 'gemini', modele: 'm' }),
  })
  assert.equal(res2.rapport.statut, 'a-revoir')
  assert.ok(res2.rapport.problemes.some((p) => /item\/999/.test(p)))
})

// ------------------------------------------------------------------ brief
test('brief : pièces jointes (image, PDF, texte), refus des autres types, prompt repris entre balises', () => {
  const { racine } = preparer()
  const b = brief.nouveau(racine)
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pieces-'))
  fs.writeFileSync(path.join(dossier, 'charte.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(path.join(dossier, 'etude.pdf'), '%PDF-1.4')
  fs.writeFileSync(path.join(dossier, 'notes.md'), 'Cible : PME')
  fs.writeFileSync(path.join(dossier, 'virus.exe'), 'x')
  const pieces = ['charte.png', 'etude.pdf', 'notes.md'].map((f) => brief.ajouterPiece(racine, b, path.join(dossier, f)))
  assert.throws(() => brief.ajouterPiece(racine, b, path.join(dossier, 'virus.exe')), /non pris en charge/)
  b.messages.push({ role: 'user', texte: 'Veille concurrents', pieces })
  b.messages.push({ role: 'assistant', texte: 'Voici :\n<prompt>\nObjectif : comparer.\n</prompt>\nPrécise le pays.' })
  brief.enregistrer(racine, b)
  const m = brief.messagesPourIA(racine, brief.charger(racine, b.id))
  assert.deepEqual(m[0].parties.map((p) => p.type), ['image', 'pdf', 'texte', 'texte'])
  assert.match(m[0].parties[2].texte, /Cible : PME/)
  assert.equal(brief.dernierPrompt(b), 'Objectif : comparer.')
  assert.throws(() => brief.charger(racine, '../x'), /inconnu/)
  assert.match(brief.systeme({ projet: { nom: 'iAgents' }, onglets: ['Ads'] }), /<prompt>/)
})

test('rayons avec une autre IA : message au format du rayon ; recherche gardant seulement les pages lues', async () => {
  const { creerClaudeGenerique, creerRechercheGenerique } = require('../lib/moteur-generique')
  const appels = []
  const json = { resultats: [
    { requete: 'robot aspirateur', pages: [{ titre: 'Lu', url: 'https://boutique.fr/robot-x#avis', extrait: 'Robot X 199 €' }, { titre: 'Inventé', url: 'https://invente.fr/p', extrait: '?' }] },
    { requete: 'aspirateur sans fil', pages: [{ titre: 'Gemini', url: 'https://www.marque.com/v12', extrait: 'V12 349 €' }] },
  ] }
  const generer = async (a) => {
    appels.push(a)
    if (!a.rechercheWeb) return { texte: 'rapport', arret: 'end_turn', urls: [], usage: { entree: 10, sortie: 20 }, fournisseur: 'openai', modele: 'gpt-x' }
    return { texte: 'Voici : ' + JSON.stringify(json), arret: 'end_turn', urls: ['https://boutique.fr/robot-x'], domaines: ['marque.com'], usage: { entree: 5, sortie: 6, recherches: 2 } }
  }
  const claude = creerClaudeGenerique({ generer, nom: 'OpenAI (GPT)' })
  const m = await claude.message({ systeme: 's', utilisateur: 'u', maxTokens: 4, effort: 'low', flux: false })
  assert.deepEqual([m.texte, m.arret, m.usage.input_tokens, m.usage.output_tokens], ['rapport', 'end_turn', 10, 20])
  assert.equal(appels[0].maxTokens, 16, 'budget minimal relevé pour les API qui refusent 4 jetons')
  const r = creerRechercheGenerique({ generer, nom: 'OpenAI (GPT)' })
  const lot = await r.chercherLot(['robot aspirateur site:amazon.fr', 'aspirateur sans fil'])
  assert.deepEqual(lot.resultats[0].map((x) => x.titre), ['Lu'], 'une URL que la recherche n’a pas lue est écartée')
  assert.deepEqual(lot.resultats[1].map((x) => x.titre), ['Gemini'], 'lien de redirection Gemini : vérifié par le site lu')
  assert.equal(lot.usage.recherches, 2)
  assert.doesNotMatch(appels[1].messages[0].parties[0].texte, /site:/)
  const surSites = await r.chercherLot(['robot aspirateur', 'aspirateur sans fil'], { domaines: ['marque.com'] })
  assert.match(appels[2].messages[0].parties[0].texte, /uniquement sur ces sites : marque\.com/)
  assert.deepEqual(surSites.resultats.map((l) => l.map((x) => x.titre)), [[], ['Gemini']], 'hors des sites demandés = écarté')
  const vide = creerRechercheGenerique({ generer: async () => ({ texte: JSON.stringify(json), urls: [], domaines: [], usage: {} }), nom: 'Mistral AI' })
  await assert.rejects(vide.chercherLot(['robot aspirateur']), /sans résultat vérifiable \(aucune page lue/)
  const illisible = creerRechercheGenerique({ generer: async () => ({ texte: 'pas de json', urls: ['https://a.fr'], usage: {} }), nom: 'Gemini' })
  await assert.rejects(illisible.chercherLot(['x']), /réponse sans liste JSON/)
})

test('Connecter avec Google : page du site dans le navigateur, code à usage unique, seule l’adresse revient', async () => {
  const cc = lib('connexionCompte.js')
  const lien = new URL(cc.lienConnexion('e'.repeat(32)))
  assert.equal(lien.origin + lien.pathname, 'https://www.drop-shipper.fr/connexion-desktop')
  assert.equal(lien.searchParams.get('app'), 'kantix')
  assert.equal(cc.adresseDansArgv(['kantix.exe', '--x', 'kantix://connexion?code=1']), 'kantix://connexion?code=1')
  assert.equal(cc.lireRetour('dropshipper://connexion?code=' + 'a'.repeat(64) + '&etat=' + 'e'.repeat(32)), null, 'une autre application ne compte pas')
  const appels = []
  const fetchImpl = async (url, init = {}) => {
    appels.push({ url, init })
    const corps = (o, ok = true, status = 200) => ({ ok, status, text: async () => JSON.stringify(o) })
    if (url.endsWith('/api/desktop/echange')) return JSON.parse(init.body).code === 'b'.repeat(64) ? corps({ error: 'Code de connexion expiré ou déjà utilisé.' }, false, 401) : corps({ token: 'jeton-session' })
    if (url.endsWith('/api/auth/me')) return corps({ email: 'Max@Gmail.com', shopName: 'Ma boutique' })
    return corps({}, false, 404)
  }
  let ouvert = null
  const att = cc.creerAttente({ ouvrir: (l) => { ouvert = l }, apiBase: () => 'https://api.exemple.test/', fetchImpl, dureeMs: 2000 })
  const p = att.attendre()
  const etat = new URL(ouvert).searchParams.get('etat')
  assert.equal(await att.recevoir(`kantix://connexion?code=${'a'.repeat(64)}&etat=${'z'.repeat(32)}`), false, 'un état qui n’est pas le nôtre est ignoré')
  assert.equal(await att.recevoir(`kantix://connexion?code=${'a'.repeat(64)}&etat=${etat}`), true)
  const r = await p
  assert.deepEqual(r, { email: 'max@gmail.com', boutique: 'Ma boutique' })
  assert.ok(!JSON.stringify(r).includes('jeton'), 'le jeton de session ne sort jamais')
  assert.equal(appels[1].init.headers.Authorization, 'Bearer jeton-session')
  const p2 = att.attendre()
  const etat2 = new URL(ouvert).searchParams.get('etat')
  att.recevoir(`kantix://connexion?code=${'b'.repeat(64)}&etat=${etat2}`)
  await assert.rejects(p2, /expiré ou déjà utilisé/)
  const lent = cc.creerAttente({ ouvrir: () => {}, apiBase: () => 'https://api.exemple.test', fetchImpl, dureeMs: 20 })
  await assert.rejects(lent.attendre(), /Pas de retour du navigateur/)
})

;(async () => {
  const s = await serveur()
  base = `http://127.0.0.1:${s.address().port}`
  let ok = 0
  const echecs = []
  for (const [nom, fn] of essais) {
    try { await fn(); ok++; console.log(`ok   ${nom}`) } catch (err) { echecs.push(nom); console.log(`ÉCHEC ${nom}\n     ${(err && err.stack) || err}`) }
  }
  s.close()
  console.log(`\nKANTIX : ${ok} réussis, ${echecs.length} échoués.`)
  process.exit(echecs.length ? 1 : 0)
})()
