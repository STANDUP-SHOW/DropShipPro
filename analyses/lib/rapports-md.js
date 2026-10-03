'use strict'
/**
 * MarketSpy JSON -> the two Markdown reports of the contract
 * (MARKET-ANALYSES/README.md): RAYON (header + analysis + table of 20 products)
 * and MARKETING (six sections, present and in order).
 */
const { NON_VERIFIE } = require('./validation')

const EN_JS = ['aliexpress', 'temu', 'alibaba', 'shein', 'superdelivery', '1688', 'taobao']
const RELIES = ['cjdropshipping', 'cj dropshipping', 'bigbuy']

/** api = supplier linked by key, url = readable at its address, extension = built in JavaScript. */
function methodeImport(p) {
  const ou = `${p.supplier_name || ''} ${p.supplier_platform || ''} ${p.supplier_url || ''}`.toLowerCase()
  if (RELIES.some((x) => ou.includes(x))) return 'api'
  return EN_JS.some((x) => ou.includes(x)) ? 'extension' : 'url'
}

const nombre = (n) => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? null : Number(n))
const virgule = (n) => (nombre(n) === null ? NON_VERIFIE : String(Math.round(Number(n) * 100) / 100).replace('.', ','))
const cellule = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '—'

function enTete(rapport, type, agent) {
  const s = rapport.study || {}
  const titre = s.theme_name || s.category_name || ''
  return [
    '---',
    `type: ${type}`,
    `date: ${s.date}`,
    `categorie: ${rapport.__categorie}`,
    `theme: ${rapport.__theme}`,
    `titre: ${titre}`,
    `agent: ${agent}-${rapport.__categorie}`,
    `sources: ${Array.isArray(rapport.sources) ? rapport.sources.length : 0}`,
    '---',
    '',
  ].join('\n')
}

function listes(titre, arr) {
  if (!Array.isArray(arr) || !arr.length) return []
  return [`### ${titre}`, '', ...arr.map((x) => '- ' + (typeof x === 'string' ? x : JSON.stringify(x))), '']
}

function analyse(r) {
  const e = r.executive_summary || {}
  const m = r.market || {}
  const libelles = {
    main_opportunity: 'Opportunité principale',
    best_budget_product: 'Meilleur rapport prix',
    best_premium_product: 'Meilleur premium',
    best_marketplace_product: 'Meilleur pour marketplace',
    best_ads_product: 'Meilleur pour la publicité',
    best_bundle: 'Meilleur bundle',
    product_to_avoid: 'À éviter',
    breakout_candidate: 'Candidat en décollage',
    recommended_test_budget: 'Budget de test conseillé',
  }
  const l = ['## Analyse', '']
  for (const [k, lib] of Object.entries(libelles)) if (e[k]) l.push(`**${lib}** : ${e[k]}`, '')
  l.push(
    ...listes('Tendances actuelles', m.current_trends),
    ...listes('Tendances émergentes', m.emerging_trends),
    ...listes('Tendances en recul', m.declining_trends),
    ...listes('Saisonnalité', m.seasonality),
    ...listes('Innovations', m.innovations),
    ...listes('Risques', m.risks),
  )
  if (Array.isArray(r.bundles) && r.bundles.length) {
    l.push('### Bundles proposés', '')
    for (const b of r.bundles) {
      l.push(`- **${b.bundle_name}** — coût ${virgule(b.estimated_cost)} €, vente ${virgule(b.estimated_selling_price)} €, marge ${virgule(b.estimated_margin)} € (${b.recommended_platform || '—'})`)
    }
    l.push('')
  }
  l.push(...listes('Idées de business', r.business_ideas))
  if (Array.isArray(r.sources) && r.sources.length) {
    l.push('### Sources', '', ...r.sources.map((s) => `- [${cellule(s.title || s.url)}](${s.url})`), '')
  }
  return l
}

function rayonMd(rapport) {
  const produits = Array.isArray(rapport.products) ? rapport.products : []
  const lignes = [
    enTete(rapport, 'rayon', 'rayon'),
    ...analyse(rapport),
    `## ${produits.length} produits proposés`,
    '',
    '| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |',
    '|---|-------|-------------|-----------------|--------------|------------------------|---------|--------|----------|',
  ]
  produits.forEach((p, i) => {
    const achat = nombre(p.estimated_landed_cost_france) ?? nombre(p.purchase_price)
    const vente = nombre(p.target_selling_price)
    const net = nombre(p.net_margin_estimated) ?? nombre(p.gross_margin)
    const margePct = vente && net !== null ? Math.round((net / vente) * 100) : null
    lignes.push(
      '| ' + [
        p.rank || i + 1,
        cellule([p.product_name, p.variant].filter(Boolean).join(' — ')),
        cellule([p.supplier_name, p.supplier_platform].filter(Boolean).join(' / ')),
        cellule(p.supplier_url),
        virgule(achat),
        virgule(vente),
        margePct === null ? NON_VERIFIE : margePct,
        methodeImport(p),
        cellule([p.decision, p.problem_solved, p.target_customer].filter(Boolean).join(' · ')),
      ].join(' | ') + ' |',
    )
  })
  return lignes.join('\n') + '\n'
}

function blocsPrompts(titre, arr) {
  const l = [`## ${titre}`, '']
  if (!Array.isArray(arr) || !arr.length) return [...l, '—', '']
  for (const p of arr) l.push('```', String(p).trim(), '```', '')
  return l
}

function marketingMd(rapport) {
  const m = rapport.market || {}
  const cp = rapport.creative_prompts || {}
  const puces = (arr) => (Array.isArray(arr) && arr.length ? arr.map((x) => '- ' + (typeof x === 'string' ? x : JSON.stringify(x))) : ['—'])
  const l = [
    enTete(rapport, 'marketing', 'marketing'),
    '## Social places', '', '—', '',
    '## Publicités en cours', '', ...puces(rapport.alerts && rapport.alerts.breakout_products), '',
    '## Tendances du jour', '', ...puces(m.current_trends), '',
    '## Tendances publicitaires', '', ...puces(m.emerging_trends), '',
    ...blocsPrompts("Prompts d'images publicitaires", cp.image_ads),
    ...blocsPrompts('Prompts de vidéos publicitaires', cp.short_videos_30s),
  ]
  return l.join('\n')
}

module.exports = { rayonMd, marketingMd, methodeImport }
