'use strict'
/**
 * MarketSpy JSON -> the two Markdown reports of the contract (MARKET-ANALYSES/README.md).
 *
 * RAYON: the full MARKETSPY study (max, 27/10/2026: « qu'il ne manque absolument rien »), the
 * shape of the Drive reports of 12/10 that backend/rapports-etude.cjs already reads: 16 numbered
 * sections, five tables (TOP 20 summary, sourcing, marketplaces, scoring, test plan), the
 * detailed financial battle sheet, then « ## Annexe — JSON structuré ».
 * MARKETING: six sections, present and in order.
 *
 * Every table is built here from the JSON fields, never written by the model: the same numbers
 * appear everywhere, and a field left empty shows as « Non vérifié », never as a guess.
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
const eur = (n) => (nombre(n) === null ? NON_VERIFIE : `${virgule(n)} €`)
const pct = (r) => (nombre(r) === null ? NON_VERIFIE : `${Math.round(Number(r) * 100)} %`)
const cellule = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '—'
const texte = (s) => (typeof s === 'string' ? s.trim() : s == null ? '' : typeof s === 'object' ? Object.values(s).filter((v) => typeof v === 'string' || typeof v === 'number').join(' — ') : String(s))
const liste = (a) => (Array.isArray(a) ? a.map(texte).filter(Boolean) : [])
const oui = (b) => (b === true ? 'oui' : b === false ? 'non' : NON_VERIFIE)
const puces = (arr) => liste(arr).map((x) => `- ${x}`)
const bloc = (titre, lignes) => (lignes.length ? [titre, '', ...lignes, ''] : [])
const para = (s) => (texte(s) ? [texte(s), ''] : [])

const DECISIONS = {
  'BUY NOW': 'Acheter maintenant',
  'BUY IF NEGOTIATED': 'Acheter si négocié',
  WATCHLIST: 'À surveiller',
  "DON'T BUY": 'Ne pas acheter',
  'BREAKOUT CANDIDATE': 'En décollage',
}
const decisionFr = (d) => DECISIONS[String(d || '').toUpperCase().replace(/’/g, "'").trim()] || cellule(d)

function tableau(entetes, lignes) {
  if (!lignes.length) return []
  return ['| ' + entetes.join(' | ') + ' |', '|' + entetes.map(() => '---').join('|') + '|', ...lignes.map((c) => '| ' + c.map(cellule).join(' | ') + ' |'), '']
}

const nom = (p) => cellule(p.product_name)
const produitsDe = (r) => (Array.isArray(r.products) ? r.products : [])

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

/** A marketplace price, whatever shape the model gave it ({price,url}, a number, a string). */
function prixPlace(v) {
  if (v == null || v === '') return NON_VERIFIE
  if (typeof v === 'object') return nombre(v.price) === null ? NON_VERIFIE : eur(v.price)
  return nombre(v) === null ? cellule(v) : eur(v)
}

/** The suppliers seen in the 20 offers, one line each: what the annex lists under `suppliers`. */
function fournisseursDe(r) {
  const vus = new Map()
  for (const p of produitsDe(r)) {
    if (!/^https?:\/\//i.test(String(p.supplier_url || ''))) continue
    const cle = `${p.supplier_platform || ''}|${p.supplier_name || ''}`.toLowerCase()
    const f = vus.get(cle) || { name: p.supplier_name || NON_VERIFIE, platform: p.supplier_platform || NON_VERIFIE, country: p.supplier_country || NON_VERIFIE, rating: p.supplier_rating || NON_VERIFIE, products: [] }
    f.products.push({ rank: p.rank, product_name: p.product_name, url: p.supplier_url })
    vus.set(cle, f)
  }
  return [...vus.values()]
}

function s1Synthese(r) {
  const e = r.executive_summary || {}
  return ['## 1. Executive Summary', '', ...para(e.summary), ...para(e.main_opportunity && `**Opportunité principale** : ${e.main_opportunity}`), ...para(e.recommended_test_budget && `**Budget de test conseillé** : ${e.recommended_test_budget}`)]
}

function s2Verdict(r) {
  const e = r.executive_summary || {}
  const l = [
    ['Meilleure opportunité', e.main_opportunity],
    ['Meilleur produit budget', e.best_budget_product],
    ['Meilleur produit premium', e.best_premium_product],
    ['Meilleur produit TikTok', e.best_tiktok_product || e.best_ads_product],
    ['Meilleur produit pour la publicité', e.best_ads_product],
    ['Meilleur produit marketplace', e.best_marketplace_product],
    ['Meilleur bundle', e.best_bundle],
    ['Produit à éviter', e.product_to_avoid],
    ['Candidat en décollage', e.breakout_candidate],
  ].filter(([, v]) => texte(v)).map(([k, v]) => `- **${k}** : ${texte(v)}`)
  return ['## 2. Verdict rapide', '', ...(l.length ? l : ['—']), '']
}

function s3Marche(r) {
  const m = r.market || {}
  const generales = [...liste(m.current_trends).map((x) => `- En hausse : ${x}`), ...liste(m.emerging_trends).map((x) => `- Émergente : ${x}`), ...liste(m.declining_trends).map((x) => `- En recul : ${x}`)]
  return [
    '## 3. Marché actuel', '', ...para(m.overview),
    ...bloc('### 3.1 Tendances générales', generales),
    ...bloc('### 3.2 Nouveautés', puces(m.new_products)),
    ...bloc('### 3.3 Innovations', puces(m.innovations)),
    ...bloc('### 3.4 Saison et timing', puces(m.seasonality)),
    ...bloc('### 3.5 Risques de saturation', puces([...liste(m.saturation_risks), ...liste(m.risks)])),
  ]
}

function s4Sourcing(r) {
  const s = r.sourcing || {}
  const plateformes = Array.isArray(s.platforms) ? s.platforms : []
  const l = ['## 4. Analyse sourcing', '']
  plateformes.forEach((x, i) => {
    l.push(`### 4.${i + 1} ${cellule(x.platform)}`, '', ...para(x.findings))
    const d = [['Fourchette de prix', x.price_range], ['MOQ', x.moq], ['Stock UE', x.eu_stock], ['Livraison', x.delivery], ['Fiabilité', x.reliability], ['Verdict', x.verdict]].filter(([, v]) => texte(v)).map(([k, v]) => `- ${k} : ${texte(v)}`)
    l.push(...d, ...(d.length ? [''] : []))
  })
  const n = plateformes.length + 1
  l.push(`### 4.${n} Synthèse fournisseurs`, '', ...para(s.synthesis))
  l.push('**Comparatif sourcing par plateforme**', '')
  l.push(...tableau(['Plateforme', 'Ce que montrent les offres', 'Fourchette prix', 'MOQ', 'Stock UE', 'Livraison', 'Fiabilité', 'Verdict'], plateformes.map((x) => [x.platform, x.findings, x.price_range, x.moq, x.eu_stock, x.delivery, x.reliability, x.verdict])))
  // Tableau 2 — Battle sheet sourcing: the supplier of every product, with its address
  l.push('**Battle sheet sourcing (fournisseur de chaque produit)**', '')
  l.push(...tableau(
    ['Produit', 'Fournisseur', 'URL', 'Prix achat', 'MOQ', 'Stock EU', 'Livraison', 'TVA', 'Garantie', 'Note vendeur', 'Risque', 'Verdict'],
    produitsDe(r).map((p) => [nom(p), [p.supplier_name, p.supplier_platform].filter(Boolean).join(' / '), p.supplier_url, eur(p.purchase_price), p.moq, oui(p.eu_stock), p.delivery_time, p.vat_included === true ? 'incluse' : p.vat_included === false ? 'non incluse' : NON_VERIFIE, p.warranty, [p.supplier_rating, p.supplier_reviews && `${texte(p.supplier_reviews)} avis`].filter(Boolean).join(' · '), liste(p.risks)[0], decisionFr(p.decision)]),
  ))
  const a = r.alerts || {}
  const alertes = [...liste(a.supplier_price_drops).map((x) => `- Baisse de prix fournisseur : ${x}`), ...liste(a.high_margin_opportunities).map((x) => `- Forte marge : ${x}`)]
  l.push(...bloc('### Alertes fournisseurs et marges', alertes))
  return l
}

function s5Marketplaces(r) {
  const places = Array.isArray(r.marketplaces) ? r.marketplaces : []
  const l = ['## 5. Analyse marketplaces', '']
  places.forEach((x, i) => {
    l.push(`### 5.${i + 1} ${cellule(x.platform)}`, '')
    if (x.relevant === false) l.push('Plateforme peu pertinente pour ce thème.', '')
    const d = [['Prix observés', x.observed_prices], ['Concurrence', x.competition], ['Opportunité', x.opportunity]].filter(([, v]) => texte(v)).map(([k, v]) => `- ${k} : ${texte(v)}`)
    l.push(...d, ...(d.length ? [''] : []))
  })
  l.push(`### 5.${places.length + 1} Synthèse prix de revente`, '', ...para(r.resale_synthesis))
  // Tableau 3 — Comparatif marketplaces
  l.push(...tableau(
    ['Produit', 'Amazon', 'Cdiscount', 'Leboncoin', 'Vinted', 'Facebook Marketplace', 'Autres', 'Prix cible', 'Concurrence', 'Opportunité'],
    produitsDe(r).map((p) => {
      const mp = p.marketplace_prices || {}
      const autres = (Array.isArray(mp.other) ? mp.other : []).filter((o) => o && nombre(o.price) !== null).map((o) => `${cellule(o.merchant)} ${eur(o.price)}`).join(', ')
      return [nom(p), prixPlace(mp.amazon), prixPlace(mp.cdiscount), prixPlace(mp.leboncoin), prixPlace(mp.vinted), prixPlace(mp.facebook_marketplace), autres || '—', eur(p.target_selling_price), p.competition_level, p.differentiation]
    }),
  ))
  return l
}

function s6Social(r) {
  const s = Array.isArray(r.social_trends) ? r.social_trends : []
  const a = r.ads_intelligence || {}
  const l = ['## 6. Analyse publicitaire et social trends', '']
  s.forEach((x, i) => {
    l.push(`### 6.${i + 1} ${cellule(x.platform)}${texte(x.trend_class) ? ` — tendance ${texte(x.trend_class)}` : ''}`, '', ...para(x.observations))
  })
  const angles = [
    ...liste(a.winning_angles).map((x) => `- Angle gagnant : ${x}`),
    ...liste(a.hooks).map((x) => `- Hook : ${x}`),
    ...liste(a.long_running_ads_patterns).map((x) => `- Publicité qui dure : ${x}`),
    ...liste(a.creative_patterns).map((x) => `- Format créatif : ${x}`),
    ...liste(a.offers).map((x) => `- Offre : ${x}`),
    ...liste(a.claims_to_avoid).map((x) => `- Allégation à éviter : ${x}`),
  ]
  l.push(...bloc(`### 6.${s.length + 1} Hooks et angles dominants`, angles))
  if (liste(a.platforms_checked).length) l.push(`Plateformes examinées : ${liste(a.platforms_checked).join(', ')}.`, '')
  return l
}

function s7Top(r) {
  const ps = produitsDe(r)
  const sc = (p, k) => (p.scores && nombre(p.scores[k]) !== null ? Math.round(p.scores[k]) : NON_VERIFIE)
  const l = ['## 7. TOP 20 produits gagnants', '', `${ps.length} produits classés, chacun tiré d'une offre fournisseur réelle.`, '']
  // Tableau 1 — Synthèse TOP 20 (rank first: the only table whose lines start with a number)
  l.push(...tableau(
    ['Rang', 'Produit', 'Variante', 'Source achat', 'Coût rendu FR', 'Prix vente cible', 'Marge nette estimée', 'ROI', 'Score', 'Ventes constatées', 'Décision'],
    ps.map((p, i) => [p.rank || i + 1, nom(p), p.variant, p.supplier_platform, eur(p.estimated_landed_cost_france ?? p.purchase_price), eur(p.target_selling_price), eur(p.net_margin_estimated ?? p.gross_margin), pct(p.roi_estimated), sc(p, 'global_opportunity_score'), p.supplier_orders, decisionFr(p.decision)]),
  ))
  // Tableau 4 — Scoring
  l.push('### Scoring', '')
  l.push(...tableau(
    ['Produit', 'Demande', 'Tendance', 'Marge', 'Fournisseur', 'Concurrence', 'Pub', 'Risque', 'Score global'],
    ps.map((p) => [nom(p), sc(p, 'demand_score'), sc(p, 'trend_score'), sc(p, 'margin_score'), sc(p, 'supplier_score'), sc(p, 'competition_score'), sc(p, 'ads_potential_score'), sc(p, 'risk_score'), sc(p, 'global_opportunity_score')]),
  ))
  l.push('### Fiches produits', '')
  ps.forEach((p, i) => {
    l.push(`**${p.rank || i + 1}. ${nom(p)}${texte(p.variant) ? ` — ${cellule(p.variant)}` : ''}** (${decisionFr(p.decision)})`)
    const d = [['Segment', p.segment], ['Cible', p.target_customer], ['Problème résolu', p.problem_solved], ['Différenciation', p.differentiation], ['Concurrence', p.competition_level], ['Quantité de test', p.recommended_test_quantity], ['Risques', liste(p.risks).join(' ; ')]]
      .filter(([, v]) => texte(v)).map(([k, v]) => `- ${k} : ${texte(v)}`)
    l.push(...d, '')
  })
  return l
}

function s8Battle(r) {
  return [
    '## 8. Battle sheet achat / revente', '',
    'Tableau financier détaillé : coût rendu France = prix produit + transport + TVA + droits + frais de paiement + réserve SAV ; marge nette = prix cible − coût rendu − commission − paiement − publicité − réserve SAV.', '',
    ...tableau(
      ['Produit', 'Prix achat', 'Transport', 'Coût rendu FR', 'Prix bas', 'Prix cible', 'Prix haut', 'Frais marketplace', 'Pub estimée', 'Réserve SAV', 'Marge brute', 'Marge nette', 'ROI', 'Prix achat max', 'Qté test'],
      produitsDe(r).map((p) => [nom(p), eur(p.purchase_price), eur(p.shipping_cost), eur(p.estimated_landed_cost_france), eur(p.low_selling_price), eur(p.target_selling_price), eur(p.high_selling_price), eur(p.estimated_fees), eur(p.estimated_ads_cost), eur(p.estimated_return_risk_cost), eur(p.gross_margin), eur(p.net_margin_estimated), pct(p.roi_estimated), eur(p.maximum_buy_price), nombre(p.recommended_test_quantity) ?? NON_VERIFIE]),
    ),
  ]
}

function s9Bundles(r) {
  const b = Array.isArray(r.bundles) ? r.bundles : []
  return ['## 9. Bundles recommandés', '', ...(b.length ? tableau(
    ['Bundle', 'Produits inclus', 'Coût estimé', 'Prix de vente', 'Marge estimée', 'Angle marketing', 'Cible', 'Plateforme'],
    b.map((x) => [x.bundle_name, liste(x.included_products).join(' + '), eur(x.estimated_cost), eur(x.estimated_selling_price), eur(x.estimated_margin), x.marketing_angle, x.target_customer, x.recommended_platform]),
  ) : ['—', ''])]
}

function s10Strategie(r) {
  const s = r.marketing_strategy || {}
  const canaux = Array.isArray(s.channels) ? s.channels : []
  return [
    '## 10. Stratégie marketing', '',
    ...bloc('### 10.1 Positionnement', puces(s.positioning)),
    ...bloc('### 10.2 Cibles', puces(s.targets)),
    ...bloc('### 10.3 Canaux', tableau(['Canal', 'Pertinent', 'Pourquoi'], canaux.map((c) => [c.channel, oui(c.relevant), c.why]))),
    ...bloc('### 10.4 Ads', puces(s.ads)),
    ...bloc('### 10.5 SEO', puces(s.seo)),
    ...bloc('### 10.6 Marketplace', puces(s.marketplace)),
  ]
}

function blocsPrompts(titre, sousTitre, arr) {
  const l = [titre, '']
  const a = liste(arr)
  if (!a.length) return [...l, '—', '']
  a.forEach((p, i) => l.push(`### ${sousTitre} ${i + 1}`, '', '```', p, '```', ''))
  return l
}

function s14Risques(r) {
  const a = r.alerts || {}
  return [
    '## 14. Risques et exclusions', '',
    ...puces(r.risks_exclusions), ...(liste(r.risks_exclusions).length ? [''] : ['—', '']),
    ...bloc('### Alertes', [
      ...liste(a.breakout_products).map((x) => `- En décollage : ${x}`),
      ...liste(a.saturated_products).map((x) => `- Saturé : ${x}`),
      ...liste(a.products_to_avoid).map((x) => `- À éviter : ${x}`),
    ]),
  ]
}

function s15Decision(r) {
  const d = r.final_decision || {}
  const plan = Array.isArray(r.test_plan) ? r.test_plan : []
  const ligne = (k, v) => `- **${k}** : ${Array.isArray(v) ? liste(v).join(' ; ') || '—' : texte(v) || '—'}`
  return [
    '## 15. Décision finale', '',
    ligne('Acheter maintenant', d.buy_now), ligne('Négocier', d.negotiate), ligne('Liste de surveillance', d.watchlist), ligne('Éviter', d.avoid),
    ligne('Budget test recommandé', d.test_budget), ligne('Quantités recommandées', d.quantities), '',
    // Tableau 5 — Plan de test
    ...bloc('### Plan de test', tableau(['Produit', 'Quantité test', 'Budget achat', 'Plateforme vente', 'Angle marketing', 'Objectif', 'Seuil abandon'], plan.map((t) => [t.product, nombre(t.quantity) ?? NON_VERIFIE, eur(t.buy_budget), t.platform, t.angle, t.goal, t.stop_threshold]))),
  ]
}

function s16Sources(r) {
  const s = Array.isArray(r.sources) ? r.sources : []
  const l = s.map((x) => (typeof x === 'string' ? x : x && x.url)).filter((u) => /^https?:\/\//i.test(String(u || '')))
    .map((u, i) => {
      const x = s.find((y) => y === u || (y && y.url === u))
      const t = x && typeof x === 'object' ? [x.title, x.used_for].filter(Boolean).map(cellule).join(' — ') : ''
      return `- [${t || cellule(u)}](${u})`
    })
  return ['## 16. Sources', '', ...(l.length ? l : ['—']), '']
}

/** The annex: the whole report as data (suppliers derived from the offers), without the Poste's own blocks. */
function annexe(r) {
  const { poste, report_markdown, ...reste } = r
  const d = { ...reste, suppliers: Array.isArray(r.suppliers) && r.suppliers.length ? r.suppliers : fournisseursDe(r) }
  return ['## Annexe — JSON structuré', '', '```json', JSON.stringify(d, null, 2), '```', '']
}

/** The 16 sections, without the YAML header; `avecAnnexe: false` for the copy sent to the site. */
function etudeComplete(rapport, { avecAnnexe = true } = {}) {
  const s = rapport.study || {}
  const cp = rapport.creative_prompts || {}
  return [
    '# MARKETSPY AI — Étude complète', '',
    `## ${[s.category_name, s.theme_name].filter(Boolean).join(' — ')}`, '',
    `Date : ${s.date}`, '',
    ...s1Synthese(rapport), ...s2Verdict(rapport), ...s3Marche(rapport), ...s4Sourcing(rapport),
    ...s5Marketplaces(rapport), ...s6Social(rapport), ...s7Top(rapport), ...s8Battle(rapport),
    ...s9Bundles(rapport), ...s10Strategie(rapport),
    '## 11. Business ideas', '', ...(liste(rapport.business_ideas).length ? puces(rapport.business_ideas) : ['—']), '',
    ...blocsPrompts('## 12. Prompts image ads', 'Prompt image', cp.image_ads),
    ...blocsPrompts('## 13. Prompts vidéo 30 secondes', 'Vidéo', cp.short_videos_30s),
    ...s14Risques(rapport), ...s15Decision(rapport), ...s16Sources(rapport),
    ...(avecAnnexe ? annexe(rapport) : []),
  ].join('\n')
}

function rayonMd(rapport) {
  return enTete(rapport, 'rayon', 'rayon') + etudeComplete(rapport) + '\n'
}

/** The marketing lists, shared by the .marketing.md file and the copy sent to the site. */
function listesMarketing(r) {
  const m = r.market || {}
  const a = r.ads_intelligence || {}
  const al = r.alerts || {}
  return {
    socialPlaces: (Array.isArray(r.social_trends) ? r.social_trends : []).filter((x) => x && texte(x.observations)).map((x) => `${texte(x.platform)}${texte(x.trend_class) ? ` (tendance ${texte(x.trend_class)})` : ''} : ${texte(x.observations)}`),
    adsCurrent: [...liste(a.long_running_ads_patterns), ...liste(a.winning_angles).map((x) => `Angle : ${x}`), ...liste(a.offers).map((x) => `Offre : ${x}`), ...liste(al.breakout_products).map((x) => `En décollage : ${x}`)],
    trendsDaily: [...liste(m.current_trends), ...liste(m.emerging_trends)],
    trendingAds: [...liste(a.creative_patterns), ...liste(a.hooks).map((x) => `Hook : ${x}`), ...liste(a.claims_to_avoid).map((x) => `À éviter : ${x}`)],
  }
}

function marketingMd(rapport) {
  const cp = rapport.creative_prompts || {}
  const lm = listesMarketing(rapport)
  const p = (arr) => (arr.length ? arr.map((x) => `- ${x}`) : ['—'])
  const prompts = (titre, arr) => {
    const a = liste(arr)
    return [`## ${titre}`, '', ...(a.length ? a.flatMap((x) => ['```', x, '```', '']) : ['—', ''])]
  }
  return [
    enTete(rapport, 'marketing', 'marketing'),
    '## Social places', '', ...p(lm.socialPlaces), '',
    '## Publicités en cours', '', ...p(lm.adsCurrent), '',
    '## Tendances du jour', '', ...p(lm.trendsDaily), '',
    '## Tendances publicitaires', '', ...p(lm.trendingAds), '',
    ...prompts("Prompts d'images publicitaires", cp.image_ads),
    ...prompts('Prompts de vidéos publicitaires', cp.short_videos_30s),
  ].join('\n')
}

/**
 * What the site needs beyond the raw JSON: the 16-section study (read by rapports-etude.cjs like a
 * Drive report, with the same public filter) and the marketing lists. Mutates and returns `rapport`.
 */
function completerPourLeSite(rapport) {
  if (!Array.isArray(rapport.suppliers) || !rapport.suppliers.length) rapport.suppliers = fournisseursDe(rapport)
  const lm = listesMarketing(rapport)
  rapport.social_places = lm.socialPlaces
  rapport.ads_current = lm.adsCurrent
  rapport.trends_daily = lm.trendsDaily
  rapport.trending_ads = lm.trendingAds
  rapport.report_markdown = etudeComplete(rapport, { avecAnnexe: false })
  return rapport
}

module.exports = { rayonMd, marketingMd, methodeImport, etudeComplete, completerPourLeSite, fournisseursDe }
