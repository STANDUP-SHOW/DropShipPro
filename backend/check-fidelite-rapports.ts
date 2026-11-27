/**
 * Banc de fidélité des rapports (27/11/2026, max : « une fois dans Kantix je n'ai plus ni les prix, ni les
 * liens, ni rien » ; « ce qu'on répare re-casse le lendemain »).
 *
 * Il prend de VRAIS fichiers de l'agent (bancs/rapports-reels/, copiés du Drive) et compare, ligne par ligne,
 * ce que l'agent a écrit à ce que le site stocke puis sert : titre, lien fournisseur, prix d'achat, coût rendu,
 * prix marché et son lien, marge nette, ROI, score, verdict. La lecture de la source est écrite ici, à part,
 * exprès simple : elle ne partage rien avec le lecteur testé, sinon une erreur commune passerait inaperçue.
 *
 * Pour essayer un autre jour : déposer le .rayon.md sous bancs/rapports-reels/<date>/<categorie>/, ou les
 * fichiers de synthèse sous bancs/rapports-reels/syntheses/<date>/, puis :
 *
 *   npx tsx check-fidelite-rapports.ts [dossier]
 *
 * Rien n'est écrit hors d'un dossier temporaire.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { ReportQuery } from './src/services/reportsDb.js'
import { assembler, lireSyntheseJson, lireSyntheseMarkdown } from './src/services/synthesesQuotidiennes.js'

const etudeLib = createRequire(import.meta.url)('./rapports-etude.cjs')
const RACINE = path.resolve(process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'bancs', 'rapports-reels'))

let echecs = 0
let controles = 0
function exige(ok: boolean, libelle: string) {
  controles++
  if (!ok) {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}
const egal = (a: number | null | undefined, b: number | null | undefined) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.011)

// ------------------------------------------------------------------ la source, lue à la main

const sansMarques = (c: string) => c.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*+|`/g, '').replace(/\s+/g, ' ').trim()
const premierLien = (c: string) => /\]\((https?:\/\/[^)\s]+)\)/.exec(c)?.[1] ?? ''
function montant(c: string): number | null {
  const m = sansMarques(c).replace(/[  ]/g, ' ').match(/[-+−]?\s?\d[\d ]*(?:[.,]\d+)?/)
  return m ? Number(m[0].replace(/\s/g, '').replace('−', '-').replace(',', '.')) : null
}

interface LigneSource {
  rang: number
  titre: string
  url: string
  achat: number | null
  rendu: number | null
  marche: number | null
  lienMarche: string
  marge: number | null
  roi: number | null
  score: number | null
  verdict: string
}

/** The agent's product table: the first one with a rank and a product column. */
function tableauSource(md: string): LigneSource[] {
  const lignes = md.split(/\r?\n/)
  for (let i = 0; i < lignes.length; i++) {
    if (!lignes[i].trim().startsWith('|')) continue
    const entetes = lignes[i].split('|').slice(1, -1).map((x) => sansMarques(x).toLowerCase())
    if (!entetes.some((h) => /^(rang|#)$/.test(h)) || !entetes.some((h) => /^produit/.test(h))) continue
    const ix = (m: RegExp) => entetes.findIndex((h) => m.test(h))
    const c = {
      rang: ix(/^(rang|#)$/), produit: ix(/^produit/), achat: ix(/achat/), rendu: ix(/rendu/), marche: ix(/march|vente/),
      marge: ix(/^marge/), roi: ix(/^roi/), score: ix(/score/), verdict: ix(/d[ée]cision|verdict/),
    }
    const out: LigneSource[] = []
    for (let j = i + 2; j < lignes.length && lignes[j].trim().startsWith('|'); j++) {
      // A « | » inside the italic page title after « <br> » is text (sommeil, 27/11/2026).
      const k = lignes[j].replace(/(<br\s*\/?>\s*\*)([^*]*)(\*)/gi, (m, a, x, c) => a + x.replace(/\|/g, '¦') + c).split('|').slice(1, -1)
      const rang = montant(k[c.rang] ?? '')
      if (rang == null) continue
      const produit = k[c.produit] ?? ''
      out.push({
        rang,
        titre: sansMarques(produit.split(/<br\s*\/?>/i)[0]),
        url: premierLien(produit) || premierLien(k.join('|')),
        achat: c.achat >= 0 ? montant(k[c.achat]) : null,
        rendu: c.rendu >= 0 ? montant(k[c.rendu]) : null,
        marche: c.marche >= 0 ? montant(k[c.marche]) : null,
        lienMarche: c.marche >= 0 ? premierLien(k[c.marche]) : '',
        marge: c.marge >= 0 ? montant(k[c.marge]) : null,
        roi: c.roi >= 0 ? montant(k[c.roi]) : null,
        score: c.score >= 0 ? montant(k[c.score]) : null,
        verdict: c.verdict >= 0 ? sansMarques(k[c.verdict]).replace(/^[^A-Za-zÀ-ÿ]+/, '') : '',
      })
    }
    return out
  }
  return []
}

// ------------------------------------------------------------------ les rapports de rayon

function fichiers(dossier: string, motif: RegExp): string[] {
  if (!fs.existsSync(dossier)) return []
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(path.join(dossier, e.name), motif) : motif.test(e.name) ? [path.join(dossier, e.name)] : [],
  )
}

const rayons = fichiers(RACINE, /\.rayon\.md$/).filter((f) => !f.includes(`${path.sep}syntheses${path.sep}`))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelite-'))
const base = path.join(tmp, 'rapports.db')
fs.copyFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'rapports.db'), base)

console.log(`Rapports de rayon réels : ${rayons.length}`)
for (const f of rayons) {
  const rel = path.relative(RACINE, f).split(path.sep).join('/')
  const texte = fs.readFileSync(f, 'utf8')
  const source = tableauSource(texte)
  console.log(`\n${rel} : ${source.length} lignes chez l'agent`)
  exige(source.length >= 10, `${rel} : le banc lit au moins 10 lignes dans la source`)
  const etude = etudeLib.etudeMarkdown({
    texteRayon: texte, texteMarketing: null, origineRayon: `drive:${rel}`, origineMarketing: null, source: 'google-drive',
    indices: etudeLib.indicesDuChemin(rel),
  })
  exige(etude.ok === true, `${rel} : importé (${etude.raison ?? 'ok'})`)
  if (!etude.ok) continue
  const db = new Database(base)
  etudeLib.ecrireEtude(db, etude)
  db.close()
  const servis = new ReportQuery(base, null).getProduitsDuJour(etude.categorie, etude.date)
  exige(servis.length === source.length, `${rel} : ${servis.length} produits servis pour ${source.length} écrits`)
  for (const s of source) {
    const p = servis.find((x) => x.titre === s.titre)
    const nom = `${rel} #${s.rang} « ${s.titre.slice(0, 40)} »`
    exige(!!p, `${nom} : servi sous son titre exact (sans « <br> » ni titre de fiche collé)`)
    if (!p) continue
    exige(p.url === s.url, `${nom} : lien fournisseur ${p.url || '(vide)'} ≠ ${s.url}`)
    exige(egal(p.prixAchatFournisseur ?? p.prixAchat, s.achat), `${nom} : achat ${p.prixAchatFournisseur ?? p.prixAchat} ≠ ${s.achat}`)
    exige(egal(p.coutRendu, s.rendu), `${nom} : coût rendu ${p.coutRendu} ≠ ${s.rendu}`)
    exige(egal(p.prixVente, s.marche), `${nom} : prix marché ${p.prixVente} ≠ ${s.marche}`)
    exige((p.lienMarche ?? '') === s.lienMarche, `${nom} : lien marché ${p.lienMarche || '(vide)'} ≠ ${s.lienMarche || '(vide)'}`)
    exige(egal(p.margeNette, s.marge), `${nom} : marge nette ${p.margeNette} ≠ ${s.marge}`)
    exige(egal(p.roi, s.roi), `${nom} : ROI ${p.roi} ≠ ${s.roi}`)
    exige(egal(p.score, s.score), `${nom} : score ${p.score} ≠ ${s.score}`)
    exige((p.verdict ?? '') === s.verdict, `${nom} : verdict « ${p.verdict} » ≠ « ${s.verdict} » (jamais recalculé)`)
  }
}

// ------------------------------------------------------------------ les synthèses du jour

const jours = fs.existsSync(path.join(RACINE, 'syntheses')) ? fs.readdirSync(path.join(RACINE, 'syntheses')) : []
console.log(`\nSynthèses réelles : ${jours.length}`)
for (const jour of jours) {
  const dossier = path.join(RACINE, 'syntheses', jour)
  const cheminJson = path.join(dossier, 'opportunites-import-dropshipper.json')
  const cheminMd = path.join(dossier, 'opportunites-prioritaires.md')
  const json = fs.existsSync(cheminJson) ? JSON.parse(fs.readFileSync(cheminJson, 'utf8')) : null
  const md = fs.existsSync(cheminMd) ? fs.readFileSync(cheminMd, 'utf8') : ''
  const lue = assembler(json ? lireSyntheseJson(json) : null, md ? lireSyntheseMarkdown(md) : null)
  exige(!!lue, `${jour} : synthèse lue`)
  if (!lue || !json) continue
  const parId = new Map(lue.produits.map((p) => [p.id, p]))
  const listes: Array<[string, 'top5' | 'heros' | 'buyNow']> = [['top_5_immediate_launch', 'top5'], ['hero_products_24_categories', 'heros'], ['top_25_opportunities', 'buyNow']]
  for (const [cle, section] of listes) {
    const src: any[] = Array.isArray(json[cle]) ? json[cle] : []
    if (!src.length) continue
    const ids = lue.sections[section]
    exige(ids.length === src.length, `${jour} ${cle} : ${ids.length} produits servis pour ${src.length} écrits`)
    src.forEach((o, i) => {
      const p = parId.get(ids[i])
      const nom = `${jour} ${cle} #${i + 1} « ${String(o.name).slice(0, 40)} »`
      exige(!!p && p.nom === o.name, `${nom} : même produit au même rang (${p?.nom})`)
      if (!p) return
      exige(egal(p.prixAchat, o.buy_eur), `${nom} : achat ${p.prixAchat} ≠ ${o.buy_eur}`)
      exige(egal(p.coutRendu, o.landed_eur), `${nom} : rendu ${p.coutRendu} ≠ ${o.landed_eur}`)
      exige(egal(p.prixVente, o.sell_eur), `${nom} : marché ${p.prixVente} ≠ ${o.sell_eur}`)
      exige(egal(p.margeNette, o.net_margin_eur), `${nom} : marge nette ${p.margeNette} ≠ ${o.net_margin_eur}`)
      exige(egal(p.roi, o.roi_pct), `${nom} : ROI ${p.roi} ≠ ${o.roi_pct}`)
      exige(egal(p.score, o.score), `${nom} : score ${p.score} ≠ ${o.score}`)
      exige(p.decision === o.verdict, `${nom} : verdict « ${p.decision} » ≠ « ${o.verdict} »`)
      const liens = Object.values(p.liens)
      exige(!o.supplier_url || liens.includes(o.supplier_url), `${nom} : lien fournisseur de l'agent gardé tel quel`)
      exige(!o.marketplace_url || liens.includes(o.marketplace_url), `${nom} : lien marketplace de l'agent gardé tel quel`)
    })
  }
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${controles - echecs}/${controles} contrôles conformes`)
if (echecs) {
  console.log(`${echecs} écart(s) entre le rapport de l'agent et ce que le site sert.`)
  process.exit(1)
}
console.log('Le site sert les rapports tels que l’agent les a écrits.')
