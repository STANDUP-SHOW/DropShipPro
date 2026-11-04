/**
 * L'annexe JSON des rapports MARKETSPY (Drive, 12/10/2026) ne doit rien montrer de privé sur les pages publiques.
 *
 *   cd backend && npx tsx check-annexe-publique.ts
 *
 * L'annexe porte supplier_*, purchase_price, estimated_landed_cost_france, maximum_buy_price, moq, les marges,
 * bundles.estimated_cost/estimated_margin et alerts.supplier_price_drops/high_margin_opportunities. Ce banc écrit
 * une étude Markdown avec annexe et la même étude au format aiMARKET, chaque champ sensible portant une valeur
 * repère, puis lit les pages /analyses rendues : aucune valeur repère ne doit y paraître. Il travaille sur une
 * copie jetable de rapports.db posée en storage/rapports.db, et remet en place ce qui y était.
 */
import fs from 'fs'
import path from 'path'
import express from 'express'
import Database from 'better-sqlite3'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const lib = createRequire(import.meta.url)('./rapports-etude.cjs')
let rates = 0
const exige = (cond: boolean, nom: string) => {
  console.log(`${cond ? 'ok  ' : 'RATE'}  ${nom}`)
  if (!cond) rates++
}

const depose = path.join(ICI, 'storage', 'rapports.db')
const aGarder = [depose, `${depose}.origine.json`, path.join(ICI, 'storage', 'rendus-publics.json')]
const gardes = new Map(aGarder.filter((f) => fs.existsSync(f)).map((f) => [f, fs.readFileSync(f)]))

const produit = (i: number) => ({
  rank: i, product_name: `Produit repère ${i}`, variant: 'standard',
  supplier_name: 'Sentifour', supplier_platform: 'Plateformex', supplier_url: `https://sentifour.test/p/${i}`, supplier_country: 'CN',
  purchase_price: 7.77, estimated_landed_cost_france: 8.88, maximum_buy_price: 9.99, moq: 333,
  target_selling_price: 39.9, low_selling_price: 29.9, high_selling_price: 49.9, marketplace_prices: { amazon: 41.5 },
  gross_margin: 31.02, net_margin_estimated: 22.22, roi_estimated: 2.5, decision: 'BUY', scores: { global_opportunity_score: 77 },
})
const annexe = {
  study: { date: '2026-10-12', category_name: 'Électroménager', category_id: 'electromenager', theme_name: 'Banc annexe', theme_slug: 'banc-annexe' },
  executive_summary: { main_opportunity: 'Le produit repère 1' },
  products: Array.from({ length: 20 }, (_, i) => produit(i + 1)),
  suppliers: [{ name: 'Sentifour', url: 'https://sentifour.test' }],
  bundles: [{ bundle_name: 'Pack repère', estimated_cost: 13.13, estimated_selling_price: 59.9, estimated_margin: 21.21, recommended_platform: 'Amazon' }],
  alerts: { breakout_products: ['Le produit repère 2 décolle'], supplier_price_drops: ['Baisse Sentinelle'], high_margin_opportunities: ['Marge Sentinelle'] },
  business_ideas: ['Vendre en pack'],
  creative_prompts: { image_ads: ['Une photo lumineuse du produit'], short_videos_30s: ['Une vidéo de 30 s du produit'] },
  sources: ['https://sentifour.test'],
}
const lignes = annexe.products.map((p) => `| ${p.rank} | ${p.product_name} | standard | Usine | 8,88 € | 39,90 € | 22 € | 77 | | BUY |`).join('\n')
const texte = `## Électroménager — Banc annexe

## 1. Executive Summary
Le marché progresse.

## 7. TOP 20 produits gagnants
| Rang | Produit | Variante | Source achat | Coût rendu FR | Prix vente cible | Marge nette estimée | Score | Ventes constatées | Décision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${lignes}

## 15. Décision finale
Tester le top 3.

## Annexe — JSON structuré
\`\`\`json
${JSON.stringify(annexe, null, 2)}
\`\`\`
`
const origine = 'drive:banc/2026-10-12/electromenager/banc-annexe.rayon.md'
const REPERES = /sentifour|plateformex|7[,.]77|8[,.]88|9[,.]99|(?<!\d)333(?!\d)|13[,.]13|21[,.]21|22[,.]22|31[,.]02|4[,.]44|66[,.]66|Baisse Sentinelle|Marge Sentinelle/gi

// The Kantix Poste (0.5.3, 27/10/2026) renders the whole MARKETSPY study itself and sends it in
// report_markdown: the same study, through the Poste's own renderer, must not leak either.
const kantix = createRequire(import.meta.url)('../analyses/lib/rapports-md.js')
const complet = kantix.completerPourLeSite({
  ...annexe,
  study: { ...annexe.study, theme_slug: 'banc-annexe-kantix', theme_name: 'Banc annexe Kantix' },
  products: annexe.products.map((p) => ({ ...p, shipping_cost: 4.44, supplier_orders: '500+ vendus', supplier_rating: '4,8', risks: ['transport Sentifour non affiché'] })),
  sourcing: { platforms: [{ platform: 'Plateformex', findings: 'Sentifour vend en lot à 7,77 €', price_range: '7,77-9,99 €', moq: '333', verdict: 'à négocier' }], synthesis: 'Sentifour pour tout.' },
  marketplaces: [{ platform: 'Amazon', relevant: true, observed_prices: '39,90 €', competition: '12 offres', opportunity: 'pack' }],
  social_trends: [{ platform: 'TikTok', observations: 'démos courtes', trend_class: 'forte' }],
  final_decision: { buy_now: ['Produit repère 1'], test_budget: '300 €' },
  test_plan: [{ product: 'Produit repère 1', quantity: 20, buy_budget: 66.66, platform: 'Amazon', angle: 'démo', goal: '10 ventes', stop_threshold: 'CPA > 15 €' }],
})

try {
  fs.mkdirSync(path.dirname(depose), { recursive: true })
  fs.copyFileSync(path.join(ICI, 'rapports.db'), depose)
  fs.rmSync(`${depose}.origine.json`, { force: true })
  const md = lib.etudeMarkdown({ texteRayon: texte, texteMarketing: null, origineRayon: origine, origineMarketing: null, source: 'google-drive', indices: lib.indicesDuChemin(origine) })
  const ai = lib.etudeAiMarket({ ...annexe, study: { ...annexe.study, theme_slug: 'banc-annexe-ai', theme_name: 'Banc annexe AI' } }, 'drive:banc/2026-10-12/electromenager/banc-annexe-ai.json')
  const kx = lib.etudeAiMarket(complet, 'poste-analyses')
  exige(md.ok && ai.ok && kx.ok, 'les trois études de banc sont lues')
  const db = new Database(depose)
  for (const e of [md, ai, kx]) lib.ecrireEtude(db, { ...e, majLe: '2099-01-01 00:00:00' })
  const prive = JSON.parse((db.prepare('SELECT data FROM reports WHERE id = ?').get(kx.idRayon) as any).data).analysis
  exige(['Analyse sourcing', 'Analyse marketplaces', 'TOP 20 produits gagnants', 'Comparatif achat / revente', 'Décision finale'].every((t) => prive.includes(`## ${t}\n`)) && /Sentifour/.test(prive), "côté compte, l'étude du Poste est entière (sourcing compris)")
  db.close()

  const { analysesPubliquesRouter, lignesPubliques } = await import('./src/routes/analysesPubliques.js')
  const { cheminRapport } = await import('./src/services/analysesPubliques.js')
  const app = express()
  app.use('/analyses', analysesPubliquesRouter)
  const srv = app.listen(0)
  const port = (srv.address() as any).port
  const pages = lignesPubliques().filter((l: any) => /banc-annexe/.test(l.id))
  exige(pages.some((l: any) => /kantix/.test(l.id)), 'la page de l’étude du Poste est publiée')
  exige(pages.length >= 3, `les pages du banc sont publiées (${pages.length})`)
  for (const l of pages) {
    const h = await (await fetch(`http://127.0.0.1:${port}${cheminRapport(l)}`)).text()
    const t = h.replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const fuites = [...t.matchAll(REPERES)].map((m) => t.slice(Math.max(0, m.index! - 40), m.index! + 30))
    exige(!fuites.length, `${l.id} : aucun champ privé de l'annexe ${fuites.length ? JSON.stringify(fuites.slice(0, 3)) : ''}`)
    if (l.type === 'rayon') exige(/39,90/.test(t), `${l.id} : le prix de vente, lui, reste`)
  }
  srv.close()
} finally {
  for (const f of aGarder) {
    if (gardes.has(f)) fs.writeFileSync(f, gardes.get(f)!)
    else fs.rmSync(f, { force: true })
  }
}

console.log(rates ? `\n${rates} attente(s) manquée(s).` : '\nAucun champ privé de l’annexe ne paraît.')
process.exit(rates ? 1 : 0)
