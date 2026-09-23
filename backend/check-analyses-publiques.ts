/**
 * Banc : les pages publiques /analyses/ montrent l'analyse et les produits
 * gagnants — et JAMAIS l'adresse fournisseur ni le prix d'achat, qui sont ce
 * que le compte à 500 drops achète. Éprouvé sur un rapport bâti comme les vrais
 * (le tableau des produits, avec ses adresses, est dans le corps Markdown).
 */
import { blocsDe, cheminRapport, markdownEnHtml, pageCategorie, pageIndex, pageRapport, sitemapXml, type RapportPublic } from './src/services/analysesPubliques.js'
import { lireRapport } from './src/services/marketReports.js'

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const md = `---
type: rayon
date: 2026-09-18
categorie: telephonie
theme: chargeurs-cables
titre: Chargeurs GaN et câbles tressés — ce qui se vend en septembre
accroche: Le GaN a gagné, et les câbles tressés font la marge.
sources: 8
---

## Analyse
Le marché des chargeurs bascule vers le **GaN 65 W**. Les câbles tressés se vendent 3 fois leur prix d'achat, voir [cette étude](https://exemple.test/etude). Attention aux <script>alert(1)</script> contrefaçons.

- Les 3 ports deviennent la norme
- Le câble USB-C 100 W est l'accessoire le plus recherché

## 2 produits proposés

| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |
|---|-------|-------------|-----------------|--------------|------------------------|---------|--------|----------|
| 1 | Chargeur GaN 65 W 3 ports | CJ Dropshipping | https://fournisseur.test/secret-1 | 9,80 | 24,90 | 61 | api | Tendance forte |
| 2 | Câble USB-C 100 W tressé 2 m | AliExpress | https://fournisseur.test/secret-2 | 1,90 | 9,90 | 81 | extension | Marge |
| 3 | Batterie externe 20 000 mAh | BigBuy | https://fournisseur.test/secret-3 | 12,50 | 34,90 | 64 | api | Rentrée |
| 4 | Support voiture magnétique | CJ Dropshipping | https://fournisseur.test/secret-4 | 2,10 | 12,90 | 84 | api | Volume |
| 5 | Chargeur sans fil 15 W | Temu | https://fournisseur.test/secret-5 | 4,30 | 19,90 | 78 | extension | Marge |
`

const lu = lireRapport(md)
const rapport: RapportPublic = {
  ...lu,
  id: 'rayon-2026-09-18-telephonie-chargeurs-cables',
  categorieNom: 'Téléphonie',
  themeNom: 'Chargeurs, câbles et batteries externes',
  prompts: [],
  updatedAt: new Date('2026-09-18T07:00:00Z'),
}
const marketing: RapportPublic = {
  ...rapport,
  type: 'marketing',
  titre: 'Vendre des chargeurs GaN : angles et prompts',
  id: 'marketing-2026-09-18-telephonie-chargeurs-cables',
  produits: [],
  // Le corps-souche que MarketSpy écrit aux rapports marketing : rien à montrer.
  body: 'Vendre des chargeurs GaN : angles et prompts',
  prompts: [
    { genre: 'image', format: '1:1 — Instagram', texte: 'Un chargeur GaN blanc sur un bureau en chêne, lumière du matin' },
    { genre: 'video', format: 'TikTok / Reels', texte: 'hook 0-3 s : ton chargeur chauffe ? le GaN, non.' },
  ],
}

console.log('La page d’un rapport rayon')
{
  const html = pageRapport(rapport, [marketing])
  exige(html.includes('<title>Chargeurs GaN et câbles tressés'), 'le titre du rapport est le titre de la page')
  exige(html.includes('GaN 65 W') && html.includes('<strong>GaN 65 W</strong>'), 'l’analyse est rendue, gras compris')
  exige(html.includes('Chargeur GaN 65 W 3 ports') && html.includes('Câble USB-C 100 W tressé 2 m'), 'les produits gagnants sont nommés')
  exige(html.includes('24,90 €') && !/61 %|81 %/.test(html), 'le prix de vente conseillé est public, la marge non (unité incertaine)')
  exige(!html.includes('fournisseur.test/secret'), 'AUCUNE adresse fournisseur ne sort')
  exige(!/9,80|1,90/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')), 'AUCUN prix d’achat ne sort')
  exige(!html.includes('<script>alert'), 'le HTML du rapport est échappé')
  exige(html.includes('href="https://exemple.test/etude" rel="nofollow'), 'les liens du corps sont en nofollow')
  exige(html.includes(`<link rel="canonical" href="https://www.drop-shipper.fr${cheminRapport(rapport)}">`), 'l’adresse canonique est sous www.drop-shipper.fr')
  exige(html.includes('"@type":"Article"') && html.includes('"@type":"ItemList"') && html.includes('"@type":"BreadcrumbList"'), 'schema.org : Article, ItemList, fil d’Ariane')
  exige(html.includes(cheminRapport(marketing)), 'le rapport marketing du même jour est lié')
  exige(html.includes('produits gagnants'), 'le bloc des produits est retitré « gagnants »')
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1])
  exige(!JSON.stringify(ld).includes('fournisseur.test'), 'ni dans les données structurées')
}

console.log('\nUn rapport MarketSpy : les produits sont à part, pas dans le corps')
{
  const sansTableau: RapportPublic = { ...rapport, body: '## Ce qu’il faut retenir\n**Opportunité** : les docks eGPU.\n' }
  const html = pageRapport(sansTableau)
  exige(html.includes('<h2 id="produits">5 produits gagnants</h2>') && html.includes('Chargeur GaN 65 W 3 ports'), 'le tableau est ajouté quand le corps ne le porte pas')
  exige((html.match(/id="produits"/g) || []).length === 1 && (pageRapport(rapport).match(/id="produits"/g) || []).length === 1, 'et jamais deux fois')
  exige(!html.includes('fournisseur.test/secret'), 'toujours sans adresse fournisseur')
}

console.log('\nLa page d’un rapport marketing')
{
  const html = pageRapport(marketing)
  exige(html.includes('<figure class="prompt"><figcaption>1:1 — Instagram</figcaption>') && html.includes('<figcaption>TikTok / Reels</figcaption>'), 'chaque prompt est un bloc copiable avec son format')
  exige(!html.includes('<h2>Analyse</h2>') && !html.includes('<p>Vendre des chargeurs GaN'), 'le corps-souche n’est pas rendu comme une analyse')
  const souche = pageRapport({ ...marketing, body: '## Analyse\nVendre des chargeurs GaN : angles et prompts' })
  exige(!souche.includes('<h2>Analyse</h2>'), 'ni sous sa forme MarketSpy « ## Analyse » + titre')
  exige(html.includes('Un chargeur GaN blanc'), 'le texte du prompt est là')
  exige(!html.includes('"@type":"ItemList"'), 'pas de liste de produits sur un rapport marketing')
}

console.log('\nL’archive, l’index, le sitemap')
{
  const cat = pageCategorie('telephonie', [rapport, marketing])
  exige(cat.includes('18 septembre 2026') && cat.includes(cheminRapport(rapport)) && cat.includes(cheminRapport(marketing)), 'l’archive liste les deux rapports du jour')
  const index = pageIndex([rapport], new Map([['telephonie', 2]]))
  exige(index.includes('/analyses/telephonie/') && index.includes('2 analyses'), 'l’index compte par catégorie')
  const xml = sitemapXml([rapport, marketing])
  exige(xml.includes('<loc>https://www.drop-shipper.fr/analyses/</loc>'), 'le sitemap porte l’index')
  exige(xml.includes('<loc>https://www.drop-shipper.fr/analyses/telephonie/</loc>'), 'et la catégorie')
  exige(xml.includes(`<loc>https://www.drop-shipper.fr${cheminRapport(rapport)}</loc>`) && xml.includes(`<loc>https://www.drop-shipper.fr${cheminRapport(marketing)}</loc>`), 'et chaque rapport')
  exige(cheminRapport(rapport) === '/analyses/telephonie/2026-09-18/chargeurs-cables/' && cheminRapport(marketing) === '/analyses/telephonie/2026-09-18/chargeurs-cables/marketing/', 'les adresses sont lisibles')
}

console.log('\nLe Markdown')
{
  exige(markdownEnHtml('| a | b |\n|---|---|\n| 1 | 2 |').includes('<td>2</td>'), 'un tableau')
  exige(markdownEnHtml('1. un\n2. deux').startsWith('<ol>'), 'une liste ordonnée')
  exige(markdownEnHtml('### Sous-titre\ntexte').includes('<h3>Sous-titre</h3>'), 'un H3')
  exige(blocsDe('## A\nx\n## B\ny').length === 2, 'le découpage sur les H2')
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nPages publiques des analyses : tout passe.')
