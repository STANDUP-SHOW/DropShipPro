'use strict'
/** Fake Serper / Claude / supplier pages / cookie site, served locally. Shared by the benches. */
const http = require('node:http')
const assert = require('node:assert/strict')

const etat = { serper: 0, claude: 0, creditsSerper: true, creditsClaude: true, mode: 'bon', requetesSerper: [], pubs: [], tendances: [], shopping: [], autocomplete: [], images: [], envoyes: [], recherchesWeb: [], appelsRecherche: 0, domainesRecherche: [] }

/**
 * Fake Anthropic web search (server tool): the content blocks of the real API —
 * server_tool_use, web_search_tool_result (url, title, page_age, encrypted_content),
 * then text whose citations carry the verbatim cited_text.
 */
function reponseRecherche(j, port) {
  etat.appelsRecherche++
  const domaines = j.tools[0].allowed_domains || null
  if (domaines) etat.domainesRecherche.push(domaines)
  const demandees = String(j.messages[0].content).split('\n').map((l) => (l.match(/^\d+\. (.+)$/) || [])[1]).filter(Boolean)
  const dejaFaites = j.messages.length > 1 ? j.messages[1].content.filter((b) => b.type === 'server_tool_use').length : 0
  // 'pause': the first answer runs one search and pauses; the resumed one runs the rest
  const aFaire = etat.mode === 'pause' && j.messages.length === 1 ? demandees.slice(0, 1) : demandees.slice(dejaFaites)
  const content = []
  const citations = []
  for (const q of aFaire) {
    const tapee = etat.mode === 'reformule' ? q + ' 2026' : q
    etat.recherchesWeb.push(tapee)
    const id = `srvtoolu_${etat.recherchesWeb.length}`
    content.push({ type: 'server_tool_use', id, name: 'web_search', input: { query: tapee } })
    if (etat.mode === 'recherche-refusee') { content.push({ type: 'web_search_tool_result', tool_use_id: id, content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }); continue }
    const base = 5000 + etat.recherchesWeb.length * 10
    let liste = Array.from({ length: 6 }, (_, i) => ({ type: 'web_search_result', url: `http://127.0.0.1:${port}/p/${base + i}`, title: `Résultat ${q} ${i}`, encrypted_content: 'Eq…', page_age: '3 octobre 2026' }))
    // 'sourcing-maigre': every first supplier wording finds the same 6 pages plus a search page (mini PCs, 11/10)
    if (etat.mode === 'sourcing-maigre' && domaines && /^generic item/.test(q)) {
      liste = [{ type: 'web_search_result', url: `http://127.0.0.1:${port}/w/wholesale-generic.html`, title: 'Recherche', encrypted_content: 'Eq…' }]
        .concat(Array.from({ length: 6 }, (_, i) => ({ type: 'web_search_result', url: `http://127.0.0.1:${port}/p/${9000 + i}`, title: `Commun ${i}`, encrypted_content: 'Eq…' })))
    }
    content.push({ type: 'web_search_tool_result', tool_use_id: id, content: liste })
    citations.push({ type: 'web_search_result_location', url: liste[0].url, title: liste[0].title, encrypted_index: 'x', cited_text: domaines ? `${q} : US $4.20-6.80 / piece, MOQ 2 pieces` : `${q} : modèle vendu 49,90 € chez Boutique` })
  }
  if (citations.length) content.push({ type: 'text', text: 'Cité.', citations })
  const pause = etat.mode === 'pause' && j.messages.length === 1
  return { content, stop_reason: pause ? 'pause_turn' : 'end_turn', usage: { input_tokens: 3000, output_tokens: 200, server_tool_use: { web_search_requests: etat.mode === 'recherche-refusee' ? 0 : aFaire.length } } }
}


function creerServeur() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let corps = ''
      req.on('data', (c) => (corps += c))
      req.on('end', () => {
        const port = srv.address().port
        if (req.url === '/search') {
          etat.serper++
          const q = JSON.parse(corps).q
          etat.requetesSerper.push(q)
          if (!etat.creditsSerper) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ message: 'Not enough credits', statusCode: 400 })) }
          if (etat.mode === 'serper-vide') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ organic: [] })) }
          const base = etat.requetesSerper.length * 3
          const organic = Array.from({ length: 6 }, (_, i) => ({ title: `Résultat ${q} ${i}`, link: `http://127.0.0.1:${port}/p/${base + i}`, snippet: `Extrait ${q}` }))
          res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ organic, peopleAlsoAsk: [{ question: `Quel ${q.slice(0, 20)} choisir ?` }, { question: 'Est-ce que ça vaut le coup ?' }], relatedSearches: [{ query: `${q.slice(0, 20)} pas cher` }] }))
        }
        // The real site's admin door: only the key whose SHA-256 fingerprint is in POSTE_ADMIN_SHA256 (here etat.empreinteSite).
        if (req.url.startsWith('/api/admin/')) {
          const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); return res.end(JSON.stringify(o)) }
          if (!etat.empreinteSite) return json(503, { error: 'L’administration n’est pas activée : posez POSTE_ADMIN_SHA256.' })
          const auth = req.headers.authorization || ''
          const cle = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
          if (!cle) return json(401, { error: 'Clé d’administration manquante.' })
          if (!cle.startsWith('dsp_adm_') || require('node:crypto').createHash('sha256').update(cle).digest('hex') !== etat.empreinteSite) return json(401, { error: 'Clé d’administration inconnue.' })
          if (req.url === '/api/admin/moi') return json(200, { ok: true, administrateur: 'poste-analyses' })
          if (req.url === '/api/admin/utilisateurs') return json(200, { total: 2, verifies: 1, abonnesNewsletter: 1, limite: 500, utilisateurs: [{ id: 'u1', email: 'a@exemple.test', shopName: 'Boutique A', plan: 'FREE', credits: 120, emailVerifiedAt: '2026-10-01T10:00:00Z', createdAt: '2026-10-01T09:00:00Z' }, { id: 'u2', email: 'b@exemple.test', shopName: null, plan: 'FREE', credits: 0, emailVerifiedAt: null, createdAt: '2026-10-02T09:00:00Z' }] })
          if (req.url === '/api/admin/newsletter') return json(200, { total: 1, subscribers: [{ id: 'n1', email: 'n@exemple.test', source: 'site', createdAt: '2026-10-02T09:00:00Z' }] })
          if (req.url === '/api/admin/analyses-drive/lister' && req.method === 'POST') {
            const { adresse } = JSON.parse(corps || '{}')
            if (!/drive\.google\.com/.test(adresse || '')) return json(422, { error: 'Adresse de dossier Google Drive non reconnue.' })
            return json(200, { dossier: 'MARKET-ANALYSES', dates: [{ date: '2026-10-08', etudes: [{ categorie: 'jardin', theme: 'arrosage', fichiers: ['arrosage.rayon.md'], doublons: [], importable: true, dejaEnBase: false }], ignores: [] }, { date: '2026-10-12', etudes: [{ categorie: 'mode', theme: 'sacs', fichiers: ['sacs.marketing.md'], doublons: [], importable: false, dejaEnBase: false }], ignores: [{ nom: 'mode/sacs.sourcing.md', raison: 'note de sourcing : aucun emplacement sur le site' }] }] })
          }
          if (req.url === '/api/admin/analyses-drive/importer' && req.method === 'POST') {
            const { dates, essai } = JSON.parse(corps || '{}')
            etat.importsDrive = (etat.importsDrive || []).concat([{ dates, essai }])
            if ((dates || []).includes('2026-10-12')) return json(200, { essai: Boolean(essai), importees: 0, aImporter: 0, doublons: 0, refusees: 1, conformes: 0, rapportsEnBase: 88, lignes: [{ date: '2026-10-12', rayon: 'mode / sacs', statut: 'refuse', raison: 'marketing seul, sans .rayon.md' }], ignores: [{ date: '2026-10-12', nom: 'mode/sacs.sourcing.md', raison: 'note de sourcing : aucun emplacement sur le site' }] })
            return json(200, { essai: Boolean(essai), importees: essai ? 0 : 1, aImporter: essai ? 1 : 0, doublons: 0, refusees: 0, conformes: 0, rapportsEnBase: 88, lignes: [{ date: '2026-10-08', rayon: 'jardin / arrosage', statut: essai ? 'apercu' : 'importe', produits: 12, urlsDistinctes: 8, avecPrix: 1, marketing: true }], ignores: [] })
          }
          if (req.url.startsWith('/api/admin/mots-cles')) {
            // contract of backend/src/routes/admin.ts (#148); unconfigured by default, as in production until Google's Basic access
            etat.appelsMotsCles = (etat.appelsMotsCles || []).concat([{ url: req.url, corps: corps ? JSON.parse(corps) : null }])
            const ligne = (texte) => ({ texte, volumeMensuel: /introuvable/.test(texte) ? null : 1000 + texte.length * 10, concurrence: 'HIGH', indiceConcurrence: 80, evolution3Mois: 25, enchereBasse: 0.4, enchereHaute: 1.2, tendance: [{ mois: '2026-09', recherches: 1200 }] })
            if (!etat.motsClesConfigure) {
              if (req.url.startsWith('/api/admin/mots-cles/etat')) return json(200, { configure: false, manque: ['GOOGLE_ADS_SERVICE_ACCOUNT_JSON', 'GOOGLE_ADS_CUSTOMER_ID'], verifie: false })
              return json(503, { error: "Le Planificateur de mots-clés Google n'est pas branché : variable(s) Railway manquante(s) GOOGLE_ADS_SERVICE_ACCOUNT_JSON, GOOGLE_ADS_CUSTOMER_ID.", motif: 'non-configure' })
            }
            if (req.url.startsWith('/api/admin/mots-cles/etat')) return json(200, req.url.includes('essai=1') ? { configure: true, manque: [], verifie: true, exemple: ligne('coque iphone') } : { configure: true, manque: [], verifie: false })
            const d = JSON.parse(corps || '{}')
            if (req.url === '/api/admin/mots-cles') return json(200, { motsCles: (d.motsCles || []).map(ligne), refus: [] })
            if (req.url === '/api/admin/mots-cles/idees') return json(200, { motsCles: (d.graines || []).flatMap((g) => [ligne(g), ligne(g + ' pas cher')]).slice(0, d.limite || 50), refus: [] })
          }
          if (req.url === '/api/admin/reseaux-sociaux') {
            // contract of the real route (fil Refonte, 12/10): https, host per network, unknown key refused, "" or null removes
            const HOTES = { facebook: ['facebook.com'], instagram: ['instagram.com'], whatsapp: ['wa.me', 'whatsapp.com'], x: ['x.com', 'twitter.com'], linkedin: ['linkedin.com'], snapchat: ['snapchat.com'] }
            etat.reseaux = etat.reseaux || Object.fromEntries(Object.keys(HOTES).map((k) => [k, null]))
            if (req.method === 'PUT') {
              const demande = JSON.parse(corps || '{}')
              for (const [k, v] of Object.entries(demande)) {
                if (!HOTES[k]) return json(422, { error: `Réseau inconnu : ${k}.` })
                if (v === null || v === '') continue
                let u = null; try { u = new URL(v) } catch { /* refused below */ }
                const hote = u ? u.hostname.replace(/^www\./, '') : ''
                // messages of backend/src/services/reseauxSociaux.ts
                if (!u) return json(422, { error: `${k} : « ${v.slice(0, 80)} » n'est pas une adresse web.` })
                if (u.protocol !== 'https:') return json(422, { error: `${k} : l'adresse doit commencer par https://.` })
                if (!HOTES[k].some((d) => hote === d || hote.endsWith('.' + d))) return json(422, { error: `${k} : l'adresse doit être sur ${HOTES[k].join(' ou ')}.` })
              }
              for (const [k, v] of Object.entries(demande)) etat.reseaux[k] = v || null
              return json(200, { ok: true, reseaux: etat.reseaux })
            }
            return json(200, { reseaux: etat.reseaux, ordre: Object.keys(HOTES) })
          }
          if (req.url === '/api/admin/affiliation') return json(200, { seuilCentimes: 5000, totaux: { affilies: 1, aVerser: 1, dusCentimes: 6200, dusAVerserCentimes: 6200, versesCentimes: 0 }, affilies: [{ id: 'af1', nom: 'Affilié Test', email: 'af@exemple.test', code: 'TEST10', inscritLe: '2026-10-01T09:00:00Z', filleuls: 3, clics: 40, titulaire: 'A. Test', iban: 'FR7612345678901234567890123', ibanMajLe: null, gainsCentimes: 6200, dusCentimes: 6200, versesCentimes: 0, aVerser: true, versements: [] }] })
          if (req.url === '/api/admin/affiliation/af1/verse' && req.method === 'POST') { etat.versements = (etat.versements || []).concat([JSON.parse(corps || '{}')]); return json(200, { versement: { id: 'v1', montantCentimes: 6200 } }) }
        }
        if (req.url === '/api/admin/rapports-poste' && req.method === 'POST') {
          const auth = req.headers.authorization || ''
          if (etat.mode === 'site-refuse') { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Accès réservé.' })) }
          if (etat.mode === 'site-hors-ligne') { res.writeHead(502, { 'content-type': 'text/plain' }); return res.end('Bad gateway') }
          let rapport = null
          try { rapport = JSON.parse(corps).rapport } catch { /* refused below */ }
          if (!rapport || !rapport.study || !rapport.study.category_id || !Array.isArray(rapport.products) || !rapport.products.length) { res.writeHead(422, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Aucun produit dans le rapport.' })) }
          etat.envoyes.push({ auth, study: rapport.study, produits: rapport.products.length, aPoste: Object.prototype.hasOwnProperty.call(rapport, 'poste') })
          res.writeHead(201, { 'content-type': 'application/json' })
          return res.end(JSON.stringify({ ok: true, idRayon: `rayon-${rapport.study.date}-${rapport.study.category_id}-${rapport.study.theme_slug}`, idMkt: `marketing-${rapport.study.date}-${rapport.study.category_id}-${rapport.study.theme_slug}`, produits: rapport.products.length }))
        }
        if (['/shopping', '/autocomplete', '/images'].includes(req.url)) {
          const q = JSON.parse(corps).q
          const point = req.url.slice(1)
          etat[point].push(q)
          if (!etat.creditsSerper) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ message: 'Not enough credits', statusCode: 400 })) }
          res.writeHead(200, { 'content-type': 'application/json' })
          if (point === 'autocomplete') return res.end(JSON.stringify({ suggestions: [{ value: `${q} pas cher` }, { value: `${q} avis` }] }))
          if (point === 'images') return res.end(JSON.stringify({ images: [{ title: `Photo ${q}`, imageUrl: `http://127.0.0.1:${port}/img/${encodeURIComponent(q)}.jpg`, link: `http://127.0.0.1:${port}/p/img1`, source: 'boutique-test.fr' }, { title: 'Sans adresse', imageUrl: 'data:image/png;base64,AAAA' }] }))
          if (/SANS-OFFRE/.test(q)) return res.end(JSON.stringify({ shopping: [] }))
          return res.end(JSON.stringify({ shopping: [
            { title: `${q} 64 Go`, source: 'Boulanger', price: '129,90 €', link: `http://127.0.0.1:${port}/p/shop1`, rating: 4.4, ratingCount: 210 },
            { title: `${q} neuf`, source: 'Darty', price: '1 299,00 €', link: 'https://www.google.com/shopping/product/123' },
            { title: `${q} reconditionné`, source: 'BackMarket', price: 'Voir le prix', link: `http://127.0.0.1:${port}/p/shop2` },
          ] }))
        }
        if (req.url.startsWith('/ads/library/')) {
          const q = new URL(req.url, 'http://x').searchParams.get('q') || ''
          etat.pubs.push(q)
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          let texte
          if (/BLOQUE/.test(q) || etat.mode === 'meta-bloque') texte = 'Vérifiez que vous êtes humain : captcha'
          else if (/Modele 1$/.test(q)) texte = 'Aucun résultat pour cette recherche.'
          else if (/Modele 2$/.test(q)) texte = 'Page qui a changé de forme, rien de lisible'
          else texte = '~1,2 K résultats\nIdentifiant de la bibliothèque : 111\nDate de début de diffusion : 3 mars 2026\nIdentifiant de la bibliothèque : 112\nDate de début de diffusion : 12 sept. 2026'
          return res.end('<html><head><title>Ad Library</title></head><body><pre>' + texte + '</pre></body></html>')
        }
        if (req.url.startsWith('/trends/explore')) {
          const mots = (new URL(req.url, 'http://x').searchParams.get('q') || '').split(',')
          etat.tendances.push(mots.join('|'))
          const lignes = Array.from({ length: 52 }, (_, i) => ({ time: String(1759000000 + i * 604800), formattedAxisTime: 'sem ' + (i + 1), value: mots.map((_m, k) => (i >= 44 ? 60 + k : 30 + k)), hasData: mots.map(() => true) }))
          const corps = ")]}',\n" + JSON.stringify({ default: { timelineData: lignes } })
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          return res.end('<html><head><title>Trends</title></head><body>Explorer<script>setTimeout(function(){fetch("/trends/api/widgetdata/multiline?x=1").then(function(r){return r.text()}).then(function(){})},300)</script></body></html>')
        }
        if (req.url.startsWith('/trends/api/widgetdata/multiline')) {
          const mots = etat.tendances.length ? etat.tendances[etat.tendances.length - 1].split('|') : ['x']
          const lignes = Array.from({ length: 52 }, (_, i) => ({ time: String(1759000000 + i * 604800), formattedAxisTime: 'sem ' + (i + 1), value: mots.map((_m, k) => (i >= 44 ? 60 + k : 30 + k)), hasData: mots.map(() => true) }))
          res.writeHead(200, { 'content-type': 'application/json' })
          return res.end(")]}',\n" + JSON.stringify({ default: { timelineData: lignes } }))
        }
        if (req.url === '/pose-cookie') {
          res.writeHead(200, { 'content-type': 'text/html', 'Set-Cookie': 'sid=session-de-max; Max-Age=31536000; Path=/' })
          return res.end('<html><head><title>Connecté</title></head><body>cookie posé</body></html>')
        }
        if (req.url === '/verifie-cookie') {
          const ok = /sid=session-de-max/.test(req.headers.cookie || '')
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          return res.end(`<html><head><title>Vérif</title></head><body>${ok ? 'SESSION-CONSERVEE' : 'SESSION-ABSENTE'}</body></html>`)
        }
        if (req.url.startsWith('/p/')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          const n = Number(req.url.slice(3))
          // product pages of the fake web search: og:image and a schema.org offer, like a real shop
          const fiche = n >= 5000 ? `<meta property="og:image" content="/img/fiche-${n}.jpg"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Modele ${n}","offers":{"@type":"Offer","price":"${(n % 90) + 9.9}","priceCurrency":"EUR"}}</script>` : ''
          return res.end(`<html><head><title>Page ${req.url}</title>${fiche}</head><body><script>x=1</script><p>Produit à 12,90 € ${req.url}</p><a href="/p/lien${req.url.slice(3)}">fiche</a></body></html>`)
        }
        if (req.url === '/v1/messages') {
          etat.claude++
          const j = JSON.parse(corps)
          if (!(Array.isArray(j.tools) && j.tools.length)) etat.dernierUtilisateur = JSON.stringify(j.messages || [])
          if (!etat.creditsClaude) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } })) }
          assert.equal(j.output_config && j.output_config.effort !== undefined, true, 'output_config.effort doit être posé')
          if (Array.isArray(j.tools) && j.tools.some((t) => t.name === 'web_search')) {
            assert.equal(j.tools[0].type, 'web_search_20250305')
            assert.equal(j.tools[0].user_location.country, 'FR')
            // the real API refuses some sites in allowed_domains with a 400 naming them (dhgate.com, 11/10)
            const bloques = (j.tools[0].allowed_domains || []).filter((d) => /refuse\.example$/.test(d))
            if (bloques.length || (etat.mode === 'sourcing-ko' && j.tools[0].allowed_domains)) {
              etat.refusDomaines = (etat.refusDomaines || 0) + 1
              res.writeHead(400, { 'content-type': 'application/json' })
              return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: bloques.length ? `The following domains are not accessible to our user agent: [${bloques.map((d) => `'${d}'`).join(', ')}]. Read more: https://support.anthropic.com/en/articles/8896518` : 'allowed_domains: invalid' } }))
            }
            res.writeHead(200, { 'content-type': 'application/json' })
            return res.end(JSON.stringify(reponseRecherche(j, port)))
          }
          const user = j.messages[0].content
          let texte
          let arret = 'end_turn'
          if (j.max_tokens <= 10) {
            texte = 'ok'
          } else if (/tableau JSON d/.test(j.system || '')) {
            texte = /formulations NOUVELLES/.test(user) ? JSON.stringify(Array.from({ length: 20 }, (_, i) => `other item ${i}`))
              : etat.mode === 'noms-vides' ? '[]' : JSON.stringify(Array.from({ length: 26 }, (_, i) => ({ modele: `Marque Modele ${i}`, fournisseur: `generic item ${i}` })))
          } else if (etat.mode === 'vide') {
            texte = ''; arret = 'max_tokens'
          } else if (etat.mode === 'illisible') {
            texte = 'Voici mon rapport : pas de JSON'
          } else {
            // like a good answer: supplier_url from the supplier offers, the rest of the URLs for selling prices
            const offres = (user.split('# OFFRES FOURNISSEURS')[1] || '').split('\n# ')[0].split('\n').map((l) => l.split(' | ')[3]).filter((u) => /^http/.test(u || ''))
            const liste = user.split('# LISTE DES URL RENCONTRÉES')[1].split('\n').filter((l) => /\/p\/lien|\/p\/\d+/.test(l)).slice(0, 40)
            const distinctes = [...new Set(etat.mode === 'revendeurs' || !offres.length ? liste : offres)].slice(0, 20)
            const produits = distinctes.map((u, i) => ({
              rank: i + 1, product_name: `Produit ${i + 1}`, variant: 'noir', supplier_name: i % 3 === 0 ? 'CJ Dropshipping' : 'Fournisseur', supplier_platform: i % 5 === 0 ? 'AliExpress' : 'Site',
              supplier_url: etat.mode === 'url-inventee' && i < 4 ? `https://inventee.example/produit-${i}` : u,
              url_type: 'fiche_produit', image_url: 'Non vérifié', moq: '1', eu_stock: null,
              purchase_price: 10 + i, estimated_landed_cost_france: 12 + i, target_selling_price: 30 + i,
              gross_margin: etat.mode === 'marge-pct' ? 280 : 15, net_margin_estimated: etat.mode === 'marge-pct' ? 280 : 12, roi_estimated: 0.9,
              decision: 'tester', problem_solved: 'gain de temps', target_customer: 'familles',
              scores: { global_opportunity_score: 70, demand_score: 70, trend_score: 60, margin_score: 60, supplier_score: 60, competition_score: 50, ads_potential_score: 60, risk_score: 30 },
              marketplace_prices: { other: [{ merchant: 'Amazon.fr', price: 34, url: u }] },
            }))
            if (etat.mode === 'dix-huit') produits.length = 18
            if (etat.mode === 'images') {
              const vraie = (user.split('# IMAGES DES FICHES PRODUITS')[1] || '').split('\n').map((l) => l.split(' | ')[1]).find((x) => /^http/.test(x || ''))
              produits[0].image_url = vraie || 'Non vérifié'
              produits[1].image_url = 'https://inventee.example/photo.jpg'
            }
            texte = JSON.stringify({
              study: { date: 'FAUSSE-DATE', category_name: 'x', theme_slug: 'x' },
              executive_summary: { main_opportunity: 'Une opportunité', best_budget_product: 'A', best_premium_product: 'B', best_marketplace_product: 'C', best_ads_product: 'D', best_bundle: 'E', product_to_avoid: 'F', breakout_candidate: 'G', recommended_test_budget: '200 €' },
              market: { current_trends: ['t1'], emerging_trends: ['e1'], declining_trends: ['d1'], seasonality: ['s1'], innovations: ['i1'], risks: ['r1'] },
              products: produits,
              bundles: [{ bundle_name: 'Pack', estimated_cost: 20, estimated_selling_price: 50, estimated_margin: 30, recommended_platform: 'Amazon' }],
              business_ideas: ['idée'], alerts: { breakout_products: ['Produit 1'] },
              creative_prompts: { image_ads: ['# Facebook 1:1\nUne image'], short_videos_30s: ['# TikTok 9:16 — 15 s\nUne vidéo'] },
              sources: [{ url: distinctes[0], title: 'Une source' }],
            })
          }
          if (j.stream === false) {
            res.writeHead(200, { 'content-type': 'application/json' })
            return res.end(JSON.stringify({ content: [{ type: 'text', text: texte }], stop_reason: arret, usage: { input_tokens: 10, output_tokens: 1 } }))
          }
          // stream in small chunks, like the real API
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.write(`data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 1000 } } })}\n\n`)
          for (let i = 0; i < texte.length; i += 900) {
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: texte.slice(i, i + 900) } })}\n\n`)
          }
          res.write(`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: arret }, usage: { output_tokens: 500 } })}\n\n`)
          return res.end()
        }
        res.writeHead(404); res.end()
      })
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}


function remise() { Object.assign(etat, { serper: 0, claude: 0, creditsSerper: true, creditsClaude: true, mode: 'bon', requetesSerper: [], pubs: [], tendances: [], shopping: [], autocomplete: [], images: [], envoyes: [], recherchesWeb: [], appelsRecherche: 0, domainesRecherche: [], refusDomaines: 0, motsClesConfigure: false, appelsMotsCles: [] }) }

module.exports = { etat, creerServeur, remise }
