/**
 * Banc : un rapport envoyé par le Poste d'analyses arrive en ligne et se range
 * tout seul — le rayon (analyse, produits) d'un côté, le marketing (prompts,
 * tendances) de l'autre — dans les mêmes lectures que rapports.db.
 *
 * Éprouvé sur une COPIE de rapports.db (jamais le fichier livré) et une base du
 * Poste jetable : la production n'est pas touchée. Ce qu'il prouve : le schéma,
 * l'écriture, la lecture réunie, le remplacement d'un rapport du même jour, les
 * refus, et qu'une base du Poste cassée laisse rapports.db seul.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { CHEMIN_RAPPORTS_DB, ReportQuery } from './src/services/reportsDb.js'
import { assurerBasePoste, enregistrerRapportPoste, verifierRapportPoste } from './src/services/rapportsPoste.js'
import { CATEGORIES } from './src/services/marketReports.js'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const { slug } = createRequire(import.meta.url)(path.join(ICI, 'aimarket-import.cjs')) as { slug(s: string): string }

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
function leve(fn: () => unknown): string | null {
  try { fn(); return null } catch (e) { return e instanceof Error ? e.message : String(e) }
}

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rapports-poste-'))
const copie = path.join(dossier, 'rapports.db')
fs.copyFileSync(CHEMIN_RAPPORTS_DB, copie)
const poste = path.join(dossier, 'storage', 'rapports', 'rapports-poste.db')

/** Un rapport comme celui que le Poste envoie : le JSON MarketSpy complet. */
function rapport(over: { date?: string; categorie?: string; theme?: string; produits?: number; nomCategorie?: string } = {}) {
  const categorie = over.categorie ?? 'telephonie'
  const cat = CATEGORIES.find((c) => c.id === categorie)!
  const theme = over.theme ?? cat.themes[0].id
  const n = over.produits ?? 3
  return {
    study: {
      date: over.date ?? '2026-10-03', category_id: categorie, category_name: over.nomCategorie ?? cat.nom,
      theme_slug: theme, theme_name: cat.themes.find((t) => t.id === theme)!.nom,
    },
    executive_summary: { main_opportunity: 'Chargeurs GaN 65 W', product_to_avoid: 'Câbles sans marque' },
    market: { current_trends: ['GaN', 'USB-C 100 W'], emerging_trends: ['Qi2'], risks: ['Contrefaçons'] },
    products: Array.from({ length: n }, (_, i) => ({
      rank: i + 1, product_name: `Produit ${i + 1} ${theme}`, supplier_name: 'Boutique test', supplier_platform: 'site',
      supplier_url: `https://fournisseur.test/${categorie}/${theme}/${i + 1}`, purchase_price: 10 + i, estimated_landed_cost_france: 12 + i,
      target_selling_price: 30 + i, net_margin_estimated: 9 + i, roi_estimated: 0.5, decision: 'À tester',
      scores: { global_opportunity_score: 70 + i, demand_score: 60, trend_score: 55, margin_score: 80, supplier_score: 50, competition_score: 40, ads_potential_score: 65, risk_score: 20 },
    })),
    sources: [{ url: 'https://exemple.test/source', title: 'Une source' }],
    creative_prompts: { image_ads: ['# Facebook 1:1\nvisuel'], short_videos_30s: ['# TikTok 9:16 — 15 s\nvidéo'] },
    alerts: { breakout_products: [] },
  }
}

console.log('Le schéma')
{
  assurerBasePoste(poste)
  const a = new Database(copie, { readonly: true })
  const b = new Database(poste, { readonly: true })
  for (const t of ['reports', 'rayon_reports', 'marketing_reports', 'products', 'import_log']) {
    const noms = (db: Database.Database) => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name).join(',')
    exige(noms(a) === noms(b), `${t} : mêmes colonnes, dans le même ordre dans les deux bases`)
  }
  a.close(); b.close()
}

console.log('\nLes 24 catégories du Poste se rangent sous leur identifiant exact')
{
  const faux = CATEGORIES.filter((c) => slug(c.nom) !== c.id)
  exige(faux.length === 14, 'le slug du nom ne redonne pas l’identifiant de 14 catégories (d’où category_id)', faux.map((c) => c.id).join(' '))
  const lu = new Database(copie)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { creerSchema, lireEtude } = createRequire(import.meta.url)(path.join(ICI, 'aimarket-import.cjs')) as { creerSchema(d: unknown): void; lireEtude(d: unknown): { categorie: string } }
  void creerSchema
  lu.close()
  exige(CATEGORIES.every((c) => lireEtude(rapport({ categorie: c.id })).categorie === c.id), 'avec category_id : toutes tombent sur leur identifiant')
  exige(lireEtude({ ...rapport({ categorie: 'tv-son-photo' }), study: { ...rapport({ categorie: 'tv-son-photo' }).study, category_id: undefined } }).categorie === 'tv-son-et-photo', 'sans category_id : la règle d’origine de l’import n8n est conservée')
}

console.log('\nUne base du Poste vide ne change RIEN à ce que le site montre')
{
  const vide = path.join(dossier, 'vide', 'rapports-poste.db')
  assurerBasePoste(vide)
  const seul = new ReportQuery(copie, null)
  const reunie = new ReportQuery(copie, vide)
  const lectures: Array<[string, (q: ReportQuery) => unknown]> = [
    ['getAllReports', (q) => q.getAllReports()],
    ['getStatistics', (q) => q.getStatistics()],
    ['getCountsByDate', (q) => q.getCountsByDate()],
    ['getCategories', (q) => q.getCategories()],
    ['getDates', (q) => q.getDates()],
    ['getAnalyses', (q) => q.getAnalyses({ limite: 500 })],
    ['getGagnants', (q) => q.getGagnants({ limite: 2000 })],
    ['getPromptsRapports', (q) => q.getPromptsRapports({ limite: 500 })],
    ['getMarketingTrends', (q) => q.getMarketingTrends()],
    ['getProductsByCategory', (q) => q.getProductsByCategory()],
    ['getAIPrompts', (q) => q.getAIPrompts()],
    ['getCategoriesFraiches', (q) => q.getCategoriesFraiches()],
    ['getPourSitemap', (q) => q.getPourSitemap()],
  ]
  // getAllReports et getStatistics n'ont pas de départage sur la date : l'ordre de deux lignes du même jour
  // dépend du parcours SQLite (index sur rapports.db, vue en union ici). Aucun écran ne s'y fie (ils lisent
  // getAnalyses, getGagnants, getPromptsRapports, getFresh, qui ont leur départage) : on compare le contenu.
  const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canon(x)])) : v)
  const sansOrdre = new Set(['getAllReports', 'getStatistics'])
  for (const [nom, lire] of lectures) {
    const tri = (q: ReportQuery) => {
      const v = canon(lire(q))
      return JSON.stringify(sansOrdre.has(nom) && Array.isArray(v) ? v.map((x) => JSON.stringify(x)).sort() : v)
    }
    exige(tri(seul) === tri(reunie), `${nom} : identique avec et sans la base du Poste`)
  }
  seul.close(); reunie.close()
}

console.log('\nUn rapport arrive et se range')
{
  const avant = new ReportQuery(copie, poste)
  const nAvant = (avant.getStatistics() as { totalReports?: number }).totalReports
  const rayonsAvant = avant.getAllReports({ type: 'rayon' }).length
  const marketingAvant = avant.getAllReports({ type: 'marketing' }).length
  avant.close()

  const r = enregistrerRapportPoste(rapport({ date: '2026-10-03', categorie: 'telephonie', theme: 'smartphones' }), poste)
  exige(r.idRayon === 'rayon-2026-10-03-telephonie-smartphones' && r.idMkt === 'marketing-2026-10-03-telephonie-smartphones', 'identifiants rayon et marketing', `${r.idRayon} / ${r.idMkt}`)

  const apres = new ReportQuery(copie, poste)
  const rayons = apres.getAllReports({ type: 'rayon', date: '2026-10-03' }) as Array<{ products: Array<{ title: string; supplierUrl: string }>; categorie: string; theme: string; marketspy: unknown }>
  const marketing = apres.getAllReports({ type: 'marketing', date: '2026-10-03' }) as Array<{ imagePrompts: string[]; videoPrompts: string[]; trendsDaily: string[] }>
  exige(apres.getAllReports({ type: 'rayon' }).length === rayonsAvant + 1, 'un rapport RAYON de plus dans les lectures du site')
  exige(apres.getAllReports({ type: 'marketing' }).length === marketingAvant + 1, 'un rapport MARKETING de plus, rangé à part')
  exige(rayons.length === 1 && rayons[0].products.length === 3 && rayons[0].products[0].supplierUrl.startsWith('https://fournisseur.test/'), 'rayon : analyse et 3 produits à leur place, adresse fournisseur gardée', rayons[0]?.products[0]?.title)
  exige(marketing.length === 1 && marketing[0].imagePrompts.length === 1 && marketing[0].videoPrompts.length === 1 && marketing[0].trendsDaily.includes('GaN'), 'marketing : prompts image et vidéo, tendances')
  exige(!!rayons[0].marketspy, 'le JSON complet du rapport est conservé sous marketspy')
  exige((apres.getCategories() as string[]).includes('telephonie'), 'la catégorie apparaît dans la liste du site')
  const gagnants = apres.getGagnants({ categorie: 'telephonie', jour: '2026-10-03' }) as { produits: Array<{ titre: string; url: string }> }
  exige(gagnants.produits.length === 3 && gagnants.produits[0].titre.startsWith('Produit 1') && gagnants.produits[2].titre.startsWith('Produit 3'), 'Produits gagnants : les 3 produits du Poste, dans l’ordre', gagnants.produits.map((p) => p.titre).join(' | '))
  const prompts = apres.getPromptsRapports({ categorie: 'telephonie', jour: '2026-10-03' }) as { prompts: Array<{ texte: string }> }
  exige(prompts.prompts.length === 2 && prompts.prompts.some((p) => p.texte.includes('TikTok')), 'Prompts : les prompts image et vidéo du rapport marketing du Poste', String(prompts.prompts.length))
  const analyses = apres.getAnalyses({ jour: '2026-10-03', categorie: 'telephonie' }) as { analyses: Array<{ type: string }> }
  exige(analyses.analyses.filter((a) => a.type === 'rayon').length === 1 && analyses.analyses.filter((a) => a.type === 'marketing').length === 1, 'Analyses : un rapport rayon et un marketing, chacun à sa place')
  exige(nAvant === undefined || (apres.getStatistics() as { totalReports?: number }).totalReports === nAvant + 2, 'les statistiques comptent les 2 rapports de plus')
  apres.close()

  // la lecture réunie n'a modifié ni le fichier livré ni sa copie
  const nCopie = (new Database(copie, { readonly: true }).prepare('select count(*) c from reports').get() as { c: number }).c
  exige(nCopie === rayonsAvant + marketingAvant, 'rapports.db (copie) intact : rien n’y est écrit par le Poste')
}

console.log('\nRenvoyer, ou remplacer un rapport du même jour')
{
  const n = (q: ReportQuery) => q.getAllReports({ type: 'rayon' }).length
  const q1 = new ReportQuery(copie, poste)
  const base = n(q1)
  q1.close()
  enregistrerRapportPoste(rapport({ date: '2026-10-03', categorie: 'telephonie', theme: 'smartphones', produits: 5 }), poste)
  const q2 = new ReportQuery(copie, poste)
  const lus = q2.getAllReports({ type: 'rayon', date: '2026-10-03', category: 'telephonie' }) as Array<{ products: unknown[] }>
  exige(n(q2) === base && lus.length === 1 && lus[0].products.length === 5, 'renvoyé deux fois : une seule ligne, la dernière version (5 produits)')
  exige((q2.getGagnants({ categorie: 'telephonie', jour: '2026-10-03' }) as { produits: unknown[] }).produits.length === 5, 'les produits de l’ancienne version ne restent pas mêlés')
  q2.close()

  // un rapport du Poste pour un jour DÉJÀ dans rapports.db le remplace, sans mélanger les produits
  const db = new Database(copie, { readonly: true })
  const dejaLa = db.prepare("select date, categorie, theme from reports where type = 'rayon' order by date limit 1").get() as { date: string; categorie: string; theme: string }
  const nbProduitsLivres = (db.prepare("select count(*) c from products where report_date = ? and categorie = ? and theme = ?").get(dejaLa.date, dejaLa.categorie, dejaLa.theme) as { c: number }).c
  db.close()
  enregistrerRapportPoste(rapport({ ...dejaLa, produits: 2 }), poste)
  const q3 = new ReportQuery(copie, poste)
  const rep = q3.getAllReports({ type: 'rayon', date: dejaLa.date, category: dejaLa.categorie }) as Array<{ theme: string; products: unknown[] }>
  const memeTheme = rep.filter((x) => x.theme === dejaLa.theme)
  exige(nbProduitsLivres > 2 && memeTheme.length === 1 && memeTheme[0].products.length === 2, 'le Poste remplace le rapport commité du même jour/catégorie/thème', `${nbProduitsLivres} -> ${memeTheme[0]?.products.length}`)
  q3.close()
}

console.log('\nLes refus disent pourquoi')
{
  const motif = (r: unknown) => leve(() => verifierRapportPoste(r)) ?? ''
  exige(/study incomplet/.test(motif({ products: [{}] })), 'bloc study incomplet')
  exige(/Catégorie inconnue/.test(motif(rapport({ nomCategorie: 'x' }).study && { ...rapport(), study: { ...rapport().study, category_id: 'inventee' } })), 'catégorie inconnue d’agents.json')
  exige(/Thème inconnu/.test(motif({ ...rapport(), study: { ...rapport().study, theme_slug: 'inventé' } })), 'thème inconnu')
  exige(/Date/.test(motif({ ...rapport(), study: { ...rapport().study, date: '3 octobre' } })), 'date mal formée')
  exige(/Aucun produit/.test(motif({ ...rapport(), products: [] })), 'aucun produit')
  exige(/Envoyez/.test(motif(null)) && /Envoyez/.test(motif([])), 'corps absent')
  exige(leve(() => enregistrerRapportPoste({ ...rapport(), products: [] }, poste)) !== null, 'un refus n’écrit rien')
}

console.log('\nUne base du Poste cassée ne prive pas le site de rapports.db')
{
  const cassee = path.join(dossier, 'cassee.db')
  fs.writeFileSync(cassee, 'ceci n’est pas une base SQLite'.repeat(40))
  const erreurs: string[] = []
  const ancien = console.error
  console.error = (...a: unknown[]) => { erreurs.push(a.join(' ')) }
  const q = new ReportQuery(copie, cassee)
  console.error = ancien
  const livres = new Database(copie, { readonly: true }).prepare("select count(*) c from reports where type = 'rayon'").get() as { c: number }
  exige(q.getAllReports({ type: 'rayon' }).length === livres.c, 'base du Poste illisible : rapports.db seul, sans erreur', erreurs[0] ?? '')
  q.close()
  const sans = new ReportQuery(copie, null)
  exige(sans.getAllReports({ type: 'rayon' }).length === livres.c, 'sans base du Poste : lecture d’origine')
  sans.close()
}

fs.rmSync(dossier, { recursive: true, force: true })
if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nRapports du Poste : tout passe.')
