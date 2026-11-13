/**
 * Banc des synthèses quotidiennes (04/11/2026) : MARKET-ANALYSES/syntheses/<date>/
 * lu par l'import Drive, sur un faux Drive en mémoire. Aucun réseau, aucune base ;
 * les synthèses s'écrivent dans un dossier temporaire.
 *
 *   npx tsx check-syntheses.ts [--reels <dossier des 4 fichiers du 04/11>]
 *
 * Vérifie : le JSON est lu en premier (repli sur les tableaux Markdown), le jour
 * apparaît dans la liste comme un « rayon » syntheses/synthese-du-jour, un second
 * import identique est un doublon, et la face publique ne laisse passer ni prix
 * d'achat, ni marge, ni ROI, ni BUY NOW, ni fournisseur, ni lien.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'syntheses-'))
process.env.DOSSIER_SYNTHESES = TEMP
const { importerDossierDrive, listerDossierDrive } = await import('./src/services/importDrive.js')
const S = await import('./src/services/synthesesQuotidiennes.js')

let echecs = 0
function exige(ok: unknown, libelle: string) {
  if (ok) console.log(`  ok  ${libelle}`)
  else {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}

const produit = (cat: string, theme: string, rang: number, nom: string, decision: string, extra: Record<string, unknown> = {}) => ({
  category_id: cat,
  category_label: cat === 'animaux' ? 'Animaux' : 'Électroménager',
  theme_id: theme,
  theme_label: 'Thème',
  rank: rang,
  product_name: nom,
  variant: 'Cuve inox 304, écran LED',
  source_achat: 'AliExpress EU / Alibaba',
  landed_cost: 46.5,
  target_price: 109.9,
  net_margin: 31.9,
  roi: 68.6,
  score: 86,
  decision,
  urls: { aliexpress_fr: 'https://fr.aliexpress.com/w/wholesale-x.html', amazon_fr: 'https://www.amazon.fr/s?k=x' },
  ...extra,
})
const hero = produit('electromenager', 'robots-cuisine', 1, 'Machine à lait végétal chauffante 8-en-1', 'BUY NOW')
const noir = produit('animaux', 'dressage', 20, 'Manette rétro filaire USB premier prix (< 2 $)', "DON'T BUY", { variant: 'Plastique bas de gamme (< 2 $ achat)' })
const viral = produit('animaux', 'jeux', 3, 'Balle interactive motorisée USB-C', 'BREAKOUT CANDIDATE')
const JSON_JOUR = {
  meta: { study_date: '2026-11-04', total_products: 3 },
  immediate_priorities: {
    top_5_launch_now: [hero],
    hero_products_24_categories: [hero],
    top_25_buy_now_by_score: [hero],
    top_20_roi_budget_champions: [viral],
    top_20_high_ticket_margin: [hero],
    top_20_breakout_candidates: [viral],
    regulatory_blacklist_dont_buy: [noir],
  },
  all_480_products: [hero, viral, noir],
}
const MD_OPPORTUNITES = `# OPPORTUNITÉS (2026-11-04)

## ⚡ 1. TOP 5 PRIORITÉS ABSOLUES DU JOUR

| Priorité | Catégorie & Thème | Produit Gagnant | Coût Rendu FR | Prix Vente | Marge Nette | ROI | Score | Liens |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **#1** | **Bijoux et montres** <br> (\`personnalises-coffrets\`) | **Collier prénom découpé** <br> *Argent 925* | 11,80 € | **39,90 €** | **+16,50 €** | **+139,8 %** | **88/100** | [⚡ Import](https://fr.aliexpress.com/w/wholesale-collier.html) |

## ⛔ 7. LISTE NOIRE (LES 24 PRODUITS « DON'T BUY »)

| Catégorie | Produit à Éviter | Coût Rendu | Prix Vente | Marge Nette | Score | Verdict | Lien |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Sport** | **Shaker plastique 500 ml** <br> *Polypropylène basique* | 3,50 € | 6,90 € | +0,40 € | **31/100** | ❌ **DON'T BUY** | [🔍](https://fr.aliexpress.com/w/wholesale-shaker.html) |
`
const MD_GENERALE = `# RAPPORT GÉNÉRAL

## 🧭 1. Synthèse Macro-Commerciale du Jour

1. **Dynamique Q4 :** Les catégories cadeau progressent fortement.
2. **Marges :** Le ROI moyen dépasse +80 % sur les produits BUY NOW. Les plaids chauffants montent.

---

## 2. Sommaire
`

type Noeud = { nom: string; enfants?: string[]; texte?: string }
const DRIVE: Record<string, Noeud> = {
  racineAAAAAA: { nom: 'MARKET-ANALYSES', enfants: ['synthAAAAAA', 'jourAAAAAAA'] },
  jourAAAAAAA: { nom: '2026-11-04', enfants: [] },
  synthAAAAAA: { nom: 'syntheses', enfants: ['indexAAAAAA', 'tableauAAAA', 'synJourAAAA', 'synJour2AAA'] },
  // 05/11 : the synthesis sits in the day folder next to the shelves, written as a Google Doc, its JSON fenced.
  racine2AAAA: { nom: 'MARKET-ANALYSES', enfants: ['jour5AAAAAA', 'jour6AAAAAA'] },
  jour5AAAAAA: { nom: '2026-11-05', enfants: ['gdocJsonAAA'] },
  gdocJsonAAA: { nom: 'opportunites-import-dropshipper.json', texte: 'GDOC:Voici le flux :\n```json\n' + JSON.stringify({ ...JSON_JOUR, meta: { study_date: '2026-11-05' } }) + '\n```\n' },
  // 06/11 : a file Google will not hand out — the refusal names it.
  jour6AAAAAA: { nom: '2026-11-06', enfants: ['fermeAAAAAA'] },
  fermeAAAAAA: { nom: 'opportunites-import-dropshipper.json', texte: 'PRIVE' },
  indexAAAAAA: { nom: 'INDEX_SYNTHESES.md', texte: '# Index' },
  tableauAAAA: { nom: 'SYNTHESE_aiMARKET_2026-11-04.md', texte: '## Vue d’ensemble stratégique\nTexte du tableau.\n' },
  synJourAAAA: { nom: '2026-11-04', enfants: ['jsonAAAAAAA', 'oppAAAAAAAA', 'genAAAAAAAA'] },
  jsonAAAAAAA: { nom: 'opportunites-import-dropshipper.json', texte: JSON.stringify(JSON_JOUR) },
  oppAAAAAAAA: { nom: 'opportunites-prioritaires.md', texte: MD_OPPORTUNITES },
  genAAAAAAAA: { nom: 'synthese-generale.md', texte: MD_GENERALE },
  // A day with no JSON: the Markdown tables stand in.
  synJour2AAA: { nom: '2026-11-03', enfants: ['opp2AAAAAAA'] },
  opp2AAAAAAA: { nom: 'opportunites-prioritaires.md', texte: MD_OPPORTUNITES.replace('2026-11-04', '2026-11-03') },
}
const ouverts: string[] = []
globalThis.fetch = (async (entree: string | URL) => {
  const url = new URL(String(entree))
  const id = url.searchParams.get('id') ?? url.pathname.match(/\/document\/d\/([^/]+)/)?.[1] ?? ''
  const n = DRIVE[id]
  if (!n) return new Response('introuvable', { status: 404 })
  if (url.pathname === '/embeddedfolderview') {
    const blocs = (n.enfants ?? []).map((e) => {
      const c = DRIVE[e]
      const lien = c.enfants ? `https://drive.google.com/drive/folders/${e}` : `https://drive.google.com/file/d/${e}/view`
      return `<div class="flip-entry" id="entry-${e}"><a href="${lien}"><div class="flip-entry-title">${c.nom}</div></a></div>`
    })
    return new Response(`<html><head><title>${n.nom} - Google Drive</title></head><body><div class="flip-entries">${blocs.join('')}</div></body></html>`)
  }
  ouverts.push(id)
  const t = n.texte ?? ''
  if (t === 'PRIVE') return new Response('<!doctype html><html>connexion</html>')
  if (t.startsWith('GDOC:')) {
    // uc?export=download on a Google Doc answers a page; only the docs export gives the text.
    return url.hostname === 'docs.google.com' ? new Response(t.slice(5)) : new Response('<!doctype html><html>doc</html>')
  }
  return new Response(t)
}) as typeof fetch

const PRIVE = /€|\bROI\b|BUY|marge|AliExpress|Alibaba|aliexpress|amazon|http|\$|achat/i

console.log('Liste : la synthèse du jour paraît comme un rayon')
const liste = await listerDossierDrive('https://drive.google.com/drive/folders/racineAAAAAA')
const j4 = liste.dates.find((d) => d.date === '2026-11-04')
const ligneS = j4?.etudes.find((e) => e.categorie === 'syntheses')
exige(ligneS?.importable && !ligneS.dejaEnBase, '04/11 : syntheses/synthese-du-jour importable, pas encore en base')
exige(ligneS?.fichiers.includes('SYNTHESE_aiMARKET_2026-11-04.md'), 'le tableau maître daté par son nom (rangé au-dessus des dossiers datés)')
exige(!j4?.ignores.some((i) => /synth|opportunit|INDEX/i.test(i.nom)), 'aucun fichier de synthèse marqué « format inconnu »')
exige(liste.dates.some((d) => d.date === '2026-11-03' && d.etudes.some((e) => e.categorie === 'syntheses' && e.importable)), '03/11 : Markdown seul, importable')

console.log('Aperçu puis import')
const apercu = await importerDossierDrive('racineAAAAAA', ['2026-11-04'], true)
exige(apercu.syntheses[0]?.statut === 'apercu' && !S.lireSynthese('2026-11-04'), 'aperçu : rien d’écrit')
ouverts.length = 0
const r1 = await importerDossierDrive('racineAAAAAA', ['2026-11-04', '2026-11-03'], false)
const b4 = r1.syntheses.find((b) => b.date === '2026-11-04')!
const b3 = r1.syntheses.find((b) => b.date === '2026-11-03')!
exige(b4.statut === 'importe' && b4.format === 'json' && b4.produits === 3, '04/11 importé depuis le JSON (3 produits)')
exige(ouverts.includes('oppAAAAAAAA'), 'le Markdown est lu aussi : il complète les listes que le JSON n’a pas (09/11)')
exige(b4.sections?.listeNoire === 1 && b4.sections.heros === 1 && b4.sections.breakout === 1, 'les sept listes rangées (liste noire, héros, breakout)')
exige(b3.statut === 'importe' && b3.format === 'markdown' && b3.sections?.top5 === 1 && b3.sections.listeNoire === 1, '03/11 importé depuis les tableaux Markdown')
exige(r1.lignes.some((l) => l.rayon === 'syntheses/synthese-du-jour' && l.statut === 'importe'), 'une ligne par synthèse dans le bilan')
const r2 = await importerDossierDrive('racineAAAAAA', ['2026-11-04'], false)
exige(r2.syntheses[0]?.statut === 'doublon', 'second import identique : doublon')
const liste2 = await listerDossierDrive('racineAAAAAA')
exige(!liste2.dates.some((d) => d.date === '2026-11-04') && liste2.datesDejaImportees >= 1, `puis masquée à la relecture : seules les nouveautés (${liste2.datesDejaImportees} jour(s) déjà importé(s))`)
const liste2t = await listerDossierDrive('racineAAAAAA', true)
exige(liste2t.dates.find((d) => d.date === '2026-11-04')?.etudes.find((e) => e.categorie === 'syntheses')?.dejaEnBase, '« déjà là » avec la liste complète (tout)')
{
  // A synthesis stored by an older reader is read again at the next reread, never offered as new.
  const f = path.join(TEMP, '2026-11-04.json')
  const ancienne = JSON.parse(fs.readFileSync(f, 'utf8'))
  delete ancienne.lecteur
  ancienne.sections.top5 = []
  fs.writeFileSync(f, JSON.stringify(ancienne))
  const l3 = await listerDossierDrive('racineAAAAAA')
  const relue = S.lireSynthese('2026-11-04')
  exige(l3.synthesesRelues.some((x) => x.date === '2026-11-04') && relue?.lecteur === S.LECTEUR_SYNTHESE && relue.sections.top5.length > 0, 'ancienne lecture relue en silence, listes refaites')
  exige(!l3.dates.some((d) => d.date === '2026-11-04'), 'et non proposée comme nouvelle')
}

console.log('Synthèse rangée avec les rayons, en Google Doc, JSON entre balises')
const r5 = await importerDossierDrive('racine2AAAA', ['2026-11-05', '2026-11-06'], false)
const b5 = r5.syntheses.find((b) => b.date === '2026-11-05')
exige(b5?.statut === 'importe' && b5.produits === 3, `05/11 importé par l’export Google Docs (${b5?.statut} ${b5?.raison ?? ''})`)
const b6 = r5.syntheses.find((b) => b.date === '2026-11-06')
exige(b6?.statut === 'refuse' && /opportunites-import-dropshipper\.json : Google a renvoyé une page/.test(b6.raison ?? ''), `06/11 refusé en nommant le fichier et la cause (${b6?.raison})`)

exige(S.lireJournal().some((l) => l.date === '2026-11-06' && l.statut === 'refuse' && /Google a renvoyé une page/.test(l.raison)), 'le refus est gardé au journal (GET /api/syntheses-etat)')
exige(!S.datesSyntheses().includes('_journal'), 'le journal n’est pas pris pour un jour')

console.log('Face publique : rien d’achat, rien de fournisseur')
const s4 = S.lireSynthese('2026-11-04')!
const pub = S.synthesePublique(s4)
const texte = JSON.stringify(pub)
exige(!PRIVE.test(texte), `aucun prix, ROI, BUY, marge, fournisseur ni lien${PRIVE.test(texte) ? ` (trouvé : ${texte.match(PRIVE)?.[0]})` : ''}`)
exige(pub.actualites.map((a: any) => a.id).join(',') === 'tendances-du-jour,produits-phares,tendances-reseaux,produits-a-risque,contexte-du-marche', 'cinq actualités dans l’ordre')
const risque: any = pub.actualites.find((a: any) => a.id === 'produits-a-risque')
exige(risque.produits[0].nom === 'Manette rétro filaire USB premier prix' && risque.produits[0].variante === 'Plastique bas de gamme', 'la parenthèse « (< 2 $) » coupée, le produit gardé')
const macro: any = pub.actualites.find((a: any) => a.id === 'contexte-du-marche')
exige(/cadeau/.test(macro.texte) && /plaids/.test(macro.texte) && !/ROI|BUY/.test(macro.texte), 'macro : la phrase ROI/BUY NOW retirée, le reste gardé')
exige(pub.compteurs.opportunites === 2 && pub.compteurs.aRisque === 1 && pub.blocs.bandeauPhares.length === 1, 'compteurs et blocs')
exige(!('buyNow' in pub) && !texte.includes('highTicket'), 'pas de BUY NOW, ROI ni high-ticket en public')

console.log('Non publiées (Max, 08/11) : réservées à KANTIX')
exige(S.SYNTHESES_PUBLIEES === false, 'SYNTHESES_PUBLIEES vaut false')
const { synthesesPublicRouter } = await import('./src/routes/synthesesPublic.js')
const chemins = (synthesesPublicRouter as any).stack.map((c: any) => c.route?.path).filter(Boolean)
exige(chemins.join(',') === '/syntheses-etat', `seule la santé de l’import reste publique (${chemins.join(',')})`)
const aCreer = S.produitACreer(s4.produits[0])
exige(aCreer.title === s4.produits[0].nom && aCreer.price === 46.5 && aCreer.sellingPrice === 109.9 && /aliexpress/.test(aCreer.sourceUrl), 'un gagnant choisi devient une annonce : titre, coût, prix de vente, source')

console.log('Face connectée : tout')
const priv: any = S.synthesePrivee(s4)
exige(priv.sections.buyNow[0]?.coutRendu === 46.5 && priv.sections.highTicket.length === 1 && priv.produits[0].liens.aliexpress_fr, 'coûts, listes privées et liens de recherche')

console.log('Format du 09/11 : héros imbriqués, top 25, liens à plat, listes complétées par le Markdown')
{
  const liens = (n: string) => ({
    sourcing_url: `https://www.bigbuy.eu/fr/search/result?q=${n}`,
    aliexpress_import_url: `https://fr.aliexpress.com/w/wholesale-${n}.html`,
    amazon_url: `https://www.amazon.fr/s?k=${n}`,
  })
  const frigo = { name: 'Mini-réfrigérateur cosmétique 10L', variant: '10L, miroir LED', landed_cost: 39, target_price: 89.9, net_margin: 17.2, roi: 44.1, score: 88, verdict: 'BUY NOW', ...liens('frigo') }
  const lacets = { name: 'Lacets élastiques autobloquants', variant: 'Fils tressés 100 cm', landed_cost: 1.8, target_price: 8.9, net_margin: 4.5, roi: 250, score: 90, verdict: 'BUY NOW', ...liens('lacets') }
  const json = {
    metadata: { date: '2026-11-12', total_products_analyzed: 480 },
    hero_products_by_category: [
      { category_id: 'electromenager', category_name: 'Électroménager', theme_id: 'gros-froid', theme_name: 'Réfrigérateurs', hero_product: frigo },
      { category_id: 'chaussures-maroquinerie', category_name: 'Chaussures et maroquinerie', theme_id: 'baskets', theme_name: 'Baskets', hero_product: lacets },
    ],
    top_25_immediate_opportunities: [
      { rank: 1, category_id: 'chaussures-maroquinerie', category_name: 'Chaussures et maroquinerie', ...lacets },
      { rank: 2, category_id: 'electromenager', category_name: 'Électroménager', ...frigo },
    ],
  }
  const md = `# OPPORTUNITÉS PRIORITAIRES IMMÉDIATES - aiMARKET (2026-11-12)

## 🚀 1. TOP 5 PRIORITÉS ABSOLUES DU JOUR (À LANCER IMMÉDIATEMENT)

| Priorité | Catégorie & Thème | Produit Gagnant | Coût Rendu FR | Prix Vente | Marge Nette | ROI | Score | Liens Actifs Directs |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **#1** | **Chaussures et maroquinerie** <br> (\`baskets\`) | **Lacets élastiques autobloquants** <br> *Fils tressés 100 cm* | 1.80 € | **8.90 €** | **+4.50 €** | **+250.0 %** | **90/100** | [Import](https://fr.aliexpress.com/w/wholesale-lacets.html) |

## 🏆 2. LES 24 « HERO PRODUCTS » (N°1 DE CHACUNE DES 24 CATÉGORIES)

| N° Cat. | Catégorie (\`theme_id\`) | Hero Product (Rang #1) | Coût Rendu FR | Prix Vente | Marge Nette | ROI | Score | Décision | URLs |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **01** | **Électroménager** <br> (\`gros-froid\`) | **Mini-réfrigérateur cosmétique 10L** <br> *10L, miroir LED* | 39.00 € | **89.90 €** | **+17.20 €** | **+44.1 %** | **88/100** | **BUY NOW** | [Import](https://fr.aliexpress.com/w/wholesale-frigo.html) |

## 💎 3. TOP 25 DES MEILLEURES OPPORTUNITÉS « BUY NOW » TOUTES CATÉGORIES

| Rang Global | Catégorie | Produit | Coût Rendu FR | Prix Vente | Marge Nette | ROI | Score | URLs |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **#1** | **Chaussures et maroquinerie** | **Lacets élastiques autobloquants** | 1.80 € | **8.90 €** | **+4.50 €** | **+250.0 %** | **90/100** | [Import](https://fr.aliexpress.com/w/wholesale-lacets.html) |

## 🔥 4. TOP BREAKOUT CANDIDATES (PÉPITES À FORT POTENTIEL DE CROISSANCE)

| Catégorie | Produit Pépite | Coût Rendu FR | Prix Vente | Marge Nette | ROI | Score | Angle de Différenciation & URLs Actives |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Électroménager** | **Machine à glaçons sphériques** | 25.50 € | **69.90 €** | +17.40 € | +68.2 % | **87/100** | *Bloc alu CNC* <br> [AliExpress](https://fr.aliexpress.com/w/wholesale-glacons.html) |

## ⛔ 5. LISTE NOIRE RÉGLEMENTAIRE & PRODUITS À ÉVITER FORMELLEMENT

| Catégorie | Produit à Éviter | Score | Motif d'Exclusion & Alerte Réglementaire |
| :--- | :--- | :---: | :--- |
| **Électroménager** | **Désodorisant frigo bille charbon** | **39/100** | Écrasé par le discount physique. |
`
  const lu = S.lireSyntheseJson(json)!
  exige(lu && lu.date === '2026-11-12' && lu.produits.length === 2, `JSON : 2 produits distincts, héros et top 25 fusionnés (${lu?.produits.length})`)
  exige(lu.sections.heros.length === 2 && lu.sections.buyNow.length === 2, `JSON : héros ${lu.sections.heros.length}, top 25 ${lu.sections.buyNow.length}`)
  const frigoLu = lu.produits.find((p) => /frig/i.test(p.nom))!
  exige(frigoLu.theme === 'gros-froid' && frigoLu.rang === 2 && frigoLu.decision === 'BUY NOW', 'héros + top 25 : thème, rang et décision réunis')
  exige(S.produitACreer(frigoLu).sourceUrl.startsWith('https://www.bigbuy.eu/'), 'liens à plat lus (sourcing_url)')
  const mdLu = S.lireSyntheseMarkdown(md)!
  exige(mdLu.produits.find((p) => /frig/i.test(p.nom))?.categorieLabel === 'Électroménager', 'Markdown : la colonne Catégorie, pas « N° Cat. »')
  const a = S.assembler(lu, mdLu)!
  const n = Object.fromEntries(Object.entries(a.sections).map(([k, v]) => [k, v.length]))
  exige(n.top5 === 1 && n.heros === 2 && n.buyNow === 2 && n.breakout === 1 && n.listeNoire === 1 && n.roi === 3 && n.highTicket === 3, `toutes les listes remplies (${JSON.stringify(n)})`)
  exige(a.produits.length === 4 && a.sections.top5[0] === a.sections.buyNow[0], `le Markdown rejoint les produits du JSON (${a.produits.length} produits)`)
  exige(a.sectionsCalculees.join() === 'roi,highTicket', `seules ROI et high ticket sont classées par nous (${a.sectionsCalculees})`)
  exige(!a.sections.roi.some((id) => a.sections.listeNoire.includes(id)), 'la liste noire ne monte jamais dans un classement')
  const b = S.importerSynthese({ date: '2026-11-12', origine: 'banc', json, opportunitesMd: md }, false)
  exige(b.statut === 'importe' && S.lireSynthese('2026-11-12')?.lecteur === S.LECTEUR_SYNTHESE, 'import : version du lecteur notée')
}

const reels = process.argv.indexOf('--reels')
if (reels > 0) {
  const dossier = process.argv[reels + 1]
  const fichier = (motif: RegExp) => fs.readdirSync(dossier).map((f) => path.join(dossier, f)).find((f) => motif.test(f))
  console.log(`Vrais fichiers : ${dossier}`)
  const lu = S.lireSyntheseJson(JSON.parse(fs.readFileSync(fichier(/opportunites-import-dropshipper\.json$/)!, 'utf8')))!
  const md = S.lireSyntheseMarkdown(fs.readFileSync(fichier(/opportunites-prioritaires\.md$/)!, 'utf8'))!
  if (lu.date >= '2026-11-09') {
    // 09/11 format: heroes + top 25 in the JSON, the rest in the Markdown.
    const a = S.assembler(lu, md)!
    const n = Object.entries(a.sections).map(([k, v]) => `${k}=${v.length}`).join(' ')
    console.log(`  ${lu.date} : ${a.produits.length} produits ; ${n} ; classées par nous : ${a.sectionsCalculees.join(', ') || 'aucune'}`)
    exige(Object.values(a.sections).every((v) => v.length > 0), 'aucune liste vide')
    exige(a.produits.every((p) => p.nom && p.categorieLabel), 'chaque produit a un nom et un rayon')
    fs.rmSync(TEMP, { recursive: true, force: true })
    process.exit(echecs ? 1 : 0)
  }
  exige(lu.date === '2026-11-04' && lu.produits.length === 480, `JSON : 480 produits (${lu.produits.length})`)
  exige(Object.values(lu.sections).map((v) => v.length).join(',') === '5,24,25,20,20,20,24', `JSON : 5/24/25/20/20/20/24 (${Object.values(lu.sections).map((v) => v.length)})`)
  exige(Object.values(md.sections).map((v) => v.length).join(',') === '5,24,25,20,20,20,24', `Markdown : mêmes listes (${Object.values(md.sections).map((v) => v.length)})`)
  const macroReel = S.lireMacro(fs.readFileSync(fichier(/synthese-generale\.md$/)!, 'utf8'))
  const s: any = { date: lu.date, macro: macroReel, produits: lu.produits, sections: lu.sections }
  const p = S.synthesePublique(s)
  const t = JSON.stringify(p)
  exige(!PRIVE.test(t), `public : aucun prix/ROI/BUY/fournisseur/lien${PRIVE.test(t) ? ` (trouvé : ${t.match(PRIVE)?.[0]})` : ''}`)
  exige((p.actualites.find((a: any) => a.id === 'produits-a-risque') as any)?.produits.length === 24, 'public : les 24 produits à risque')
}

fs.rmSync(TEMP, { recursive: true, force: true })
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
