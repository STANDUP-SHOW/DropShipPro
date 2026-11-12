/**
 * Banc de la qualité de l'import Drive (max, 08/11/2026 : « manques url,
 * doubles, rapports en double, incomplets, mal rangés, pas clairs »).
 * Un faux Drive servi par un `fetch` remplacé, l'import en APERÇU seulement :
 * rien n'est écrit, ni base ni stockage.
 *
 *   npx tsx check-import-qualite.ts
 */
import { importerDossierDrive } from './src/services/importDrive.js'
import { createRequire } from 'node:module'

const etudeLib = createRequire(import.meta.url)('./rapports-etude.cjs')
let echecs = 0
function exige(ok: unknown, libelle: string) {
  if (ok) console.log(`  ok  ${libelle}`)
  else {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}

/** A .rayon.md of `n` products; `url(i)` gives each address ('' = none). */
function rayon(o: { date: string; categorie: string; theme: string; n: number; url?: (i: number) => string; titre?: (i: number) => string; rang?: (i: number) => number }) {
  const lignes = Array.from({ length: o.n }, (_, k) => {
    const i = k + 1
    const u = o.url ? o.url(i) : `https://fr.aliexpress.com/item/10050000${String(i).padStart(5, '0')}.html`
    return `| ${o.rang ? o.rang(i) : i} | ${o.titre ? o.titre(i) : `Produit ${o.theme} ${i}`} | AliExpress | ${u} | 5€ | 15€ | 66% | api | Bon produit |`
  })
  return [
    '---',
    'type: rayon',
    `date: ${o.date}`,
    `categorie: ${o.categorie}`,
    `theme: ${o.theme}`,
    `titre: Rayon ${o.theme}`,
    '---',
    '## Analyse',
    '- Marché porteur.',
    '## 20 produits proposés',
    '| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |',
    '|---|---|---|---|---|---|---|---|---|',
    ...lignes,
    '',
  ].join('\n')
}

type Noeud = { nom: string; enfants?: string[]; texte?: string }
const D = '2026-11-02'
const DRIVE: Record<string, Noeud> = {
  racineAAAAAA: { nom: 'MARKET-ANALYSES', enfants: ['jour1AAAAAA', 'jour2AAAAAA', 'jour3AAAAAA'] },
  // Three folders of the same date, as seen in max's Drive on 08/11/2026.
  jour1AAAAAA: { nom: D, enfants: ['jardinAAAA1'] },
  jour2AAAAAA: { nom: D, enfants: ['jardinAAAA2', 'sportAAAAAA'] },
  jour3AAAAAA: { nom: D, enfants: ['mauvaisAAAA', 'videAAAAAAA'] },
  jardinAAAA1: { nom: 'jardin', enfants: ['arrosPauvre'] },
  jardinAAAA2: { nom: 'jardin', enfants: ['arrosRiche1'] },
  arrosPauvre: { nom: 'arrosage.rayon.md', texte: rayon({ date: D, categorie: 'jardin', theme: 'arrosage', n: 12 }) },
  arrosRiche1: { nom: 'arrosage.rayon.md', texte: rayon({ date: D, categorie: 'jardin', theme: 'arrosage', n: 20 }) },
  sportAAAAAA: { nom: 'sport', enfants: ['velosAAAAAA'] },
  // 20 rows, one product twice (same title, same address), one without address, a repeated rank.
  velosAAAAAA: {
    nom: 'velos.rayon.md',
    texte: rayon({
      date: D,
      categorie: 'sport',
      theme: 'velos',
      n: 21,
      titre: (i) => (i === 21 ? 'Produit velos 3' : `Produit velos ${i}`),
      url: (i) => (i === 21 ? 'https://fr.aliexpress.com/item/1005000000003.html' : i === 5 ? '' : `https://fr.aliexpress.com/item/10050000${String(i).padStart(5, '0')}.html`),
      rang: (i) => (i === 21 ? 3 : i),
    }),
  },
  // Filed under « jardin » but its header says « bricolage ».
  mauvaisAAAA: { nom: 'jardin', enfants: ['perceuseAAA', 'sansSource1'] },
  perceuseAAA: { nom: 'perceuses.rayon.md', texte: rayon({ date: D, categorie: 'bricolage', theme: 'perceuses', n: 20 }) },
  sansSource1: { nom: 'tondeuses.rayon.md', texte: rayon({ date: D, categorie: 'jardin', theme: 'tondeuses', n: 20, url: () => '' }) },
  videAAAAAAA: { nom: 'mode-femme', enfants: ['maigreAAAAA'] },
  maigreAAAAA: { nom: 'robes.rayon.md', texte: rayon({ date: D, categorie: 'mode-femme', theme: 'robes', n: 4 }) },
}

globalThis.fetch = (async (entree: string | URL) => {
  const url = new URL(String(entree))
  const id = url.searchParams.get('id') ?? url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? ''
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
  return new Response(n.texte ?? '')
}) as typeof fetch

console.log('Lecteur : doublons et rangs répétés dans un rapport')
const velos = etudeLib.etudeMarkdown({ texteRayon: DRIVE.velosAAAAAA.texte, texteMarketing: null, origineRayon: 'x', origineMarketing: null })
exige(velos.ok && velos.produits === 20, `21 lignes, 1 double retiré → ${velos.produits} produits`)
exige(velos.doublonsRetires === 1, 'le double est compté')
exige(velos.sansAdresse === 1, 'le produit sans adresse est compté')
{
  const Database = (await import('better-sqlite3')).default
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE reports (id TEXT PRIMARY KEY, type TEXT, date TEXT, categorie TEXT, theme TEXT, titre TEXT, agent TEXT, sources INTEGER, data TEXT, updated_at TEXT);
    CREATE TABLE rayon_reports (id TEXT PRIMARY KEY, report_id TEXT, analysis TEXT, products TEXT);
    CREATE TABLE marketing_reports (id TEXT PRIMARY KEY, report_id TEXT, social_places TEXT, ads_current TEXT, trends_daily TEXT, trending_ads TEXT, image_prompts TEXT, video_prompts TEXT);
    CREATE TABLE import_log (id TEXT PRIMARY KEY, import_date TEXT, file_path TEXT, status TEXT, message TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, rayon_report_id TEXT, title TEXT, supplier TEXT, supplier_url TEXT, buy_price TEXT, sell_price TEXT, margin TEXT, import_method TEXT, reason TEXT, recommended_url TEXT, product_key TEXT, brand TEXT, buy_price_eur REAL, sell_price_eur REAL, margin_eur REAL, margin_pct REAL, roi_pct REAL, report_date TEXT, categorie TEXT, theme TEXT, rank INTEGER, is_product INTEGER, url_type TEXT, verdict TEXT, image_url TEXT, score_global REAL);`)
  const rangs = etudeLib.etudeMarkdown({
    texteRayon: rayon({ date: D, categorie: 'sport', theme: 'rangs', n: 20, rang: (i) => (i > 10 ? i - 10 : i) }),
    texteMarketing: null,
    origineRayon: 'x',
    origineMarketing: null,
  })
  let ecrit = true
  try {
    etudeLib.ecrireEtude(db, rangs)
  } catch {
    ecrit = false
  }
  exige(ecrit && (db.prepare('SELECT count(*) n FROM products').get() as { n: number }).n === 20, 'rangs 1 à 10 répétés : les 20 produits sont écrits (la clé primaire ne casse plus l’import)')
}

console.log('Import Drive en aperçu')
const r = await importerDossierDrive('https://drive.google.com/drive/folders/racineAAAAAA', [D], true)
const ligne = (rayonNom: string, statut?: string) => r.lignes.find((l) => l.rayon === rayonNom && (!statut || l.statut === statut))
const gardee = ligne('jardin/arrosage', 'apercu')
exige(gardee?.produits === 20, 'deux versions du même rayon et du même jour : la plus complète (20) est gardée, pas la première listée')
exige(ligne('jardin/arrosage', 'doublon')?.produits === 12, 'la moins complète est un doublon nommé')
exige(r.aImporter === 3, `3 rapports à importer (arrosage, vélos, perceuses) → ${r.aImporter}`)
const perc = ligne('bricolage/perceuses')
exige(perc?.statut === 'apercu' && perc.raison?.includes('rangé dans le dossier « jardin »'), 'rapport mal rangé : classé d’après son en-tête, et dit')
exige(ligne('jardin/tondeuses')?.statut === 'refuse' && ligne('jardin/tondeuses')?.raison?.includes('aucune adresse source'), 'rapport sans aucune adresse : refusé, motif nommé')
exige(ligne('mode-femme/robes')?.statut === 'refuse' && ligne('mode-femme/robes')?.raison?.includes('4 produits'), 'rapport de 4 produits : refusé sous le seuil')
const v = ligne('sport/velos')
exige(v?.raison?.includes('1 produit(s) sans adresse source') && v.raison.includes('1 produit(s) en double retiré(s)'), 'manques d’un rapport gardé écrits dans son motif')
exige(r.lignes[0].statut === 'refuse', 'les refus viennent en tête du tableau')
exige(r.resume.length >= 3 && r.resume[0].includes('3 rapport(s) à importer'), 'résumé en phrases')
console.log(r.resume.map((x) => `     ${x}`).join('\n'))

console.log(echecs ? `\nQualité de l'import : ${echecs} échec(s)` : "\nQualité de l'import : tout est vert")
process.exit(echecs ? 1 : 0)
