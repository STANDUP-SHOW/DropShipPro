'use strict'
/** Fake Serper / Claude / supplier pages / cookie site, served locally. Shared by the benches. */
const http = require('node:http')
const assert = require('node:assert/strict')

const etat = { serper: 0, claude: 0, creditsSerper: true, creditsClaude: true, mode: 'bon', requetesSerper: [] }

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
          res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ organic }))
        }
        if (req.url === '/pose-cookie') {
          res.writeHead(200, { 'content-type': 'text/html', 'Set-Cookie': 'sid=session-de-max; Max-Age=31536000; Path=/' })
          return res.end('<html><head><title>Connecté</title></head><body>cookie posé</body></html>')
        }
        if (req.url === '/verifie-cookie') {
          const ok = /sid=session-de-max/.test(req.headers.cookie || '')
          res.writeHead(200, { 'content-type': 'text/html' })
          return res.end(`<html><head><title>Vérif</title></head><body>${ok ? 'SESSION-CONSERVEE' : 'SESSION-ABSENTE'}</body></html>`)
        }
        if (req.url.startsWith('/p/')) {
          res.writeHead(200, { 'content-type': 'text/html' })
          return res.end(`<html><head><title>Page ${req.url}</title></head><body><script>x=1</script><p>Produit à 12,90 € ${req.url}</p><a href="/p/lien${req.url.slice(3)}">fiche</a></body></html>`)
        }
        if (req.url === '/v1/messages') {
          etat.claude++
          const j = JSON.parse(corps)
          if (!etat.creditsClaude) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } })) }
          assert.equal(j.output_config && j.output_config.effort !== undefined, true, 'output_config.effort doit être posé')
          const user = j.messages[0].content
          let texte
          let arret = 'end_turn'
          if (j.max_tokens <= 10) {
            texte = 'ok'
          } else if (/tableau JSON de chaînes/.test(j.system || '')) {
            texte = etat.mode === 'noms-vides' ? '[]' : JSON.stringify(Array.from({ length: 26 }, (_, i) => `Marque Modele ${i}`))
          } else if (etat.mode === 'vide') {
            texte = ''; arret = 'max_tokens'
          } else if (etat.mode === 'illisible') {
            texte = 'Voici mon rapport : pas de JSON'
          } else {
            const liste = user.split('# LISTE DES URL RENCONTRÉES')[1].split('\n').filter((l) => /\/p\/lien|\/p\/\d+/.test(l)).slice(0, 40)
            const distinctes = [...new Set(liste)].slice(0, 20)
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


function remise() { Object.assign(etat, { serper: 0, claude: 0, creditsSerper: true, creditsClaude: true, mode: 'bon', requetesSerper: [] }) }

module.exports = { etat, creerServeur, remise }
