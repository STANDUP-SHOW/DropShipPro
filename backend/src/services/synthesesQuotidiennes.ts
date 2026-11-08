/**
 * Daily syntheses (asked by Max on 04/11/2026). Next to the 24 shelf reports,
 * the agent that writes them drops one folder a day in the same Drive:
 *
 *   MARKET-ANALYSES/syntheses/<AAAA-MM-JJ>/opportunites-import-dropshipper.json   (structured, read first)
 *                                          opportunites-prioritaires.md          (same tables, fallback)
 *                                          synthese-generale.md                  (macro text + 480-row catalogue)
 *   MARKET-ANALYSES/syntheses/SYNTHESE_aiMARKET_<date>.md                         (master board, macro fallback)
 *
 * Shape of the JSON, as found in the 04/11 file: `meta`, `immediate_priorities`
 * (seven lists: top 5, 24 heroes, 25 BUY NOW, 20 ROI, 20 high-ticket, 20
 * breakout, 24 blacklisted) and `all_480_products`, every product carrying
 * category/theme ids, rank, name, variant, landed cost, target price, net
 * margin, ROI, score, decision and `urls` (search pages on AliExpress, CJ,
 * BigBuy, Alibaba, Amazon, Cdiscount — not product pages).
 *
 * One file per day in storage/syntheses/. Same content again = duplicate,
 * changed content = replaced (the agent may rerun its day).
 *
 * Two faces: `synthesePrivee` (everything, connected space only) and
 * `synthesePublique` (Max's rule, garde-fou-analyses: no buying price, no
 * supplier, no margin, no ROI, no BUY NOW, no buying advice).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { estPrivee, pourquoiPublic, sansMentionsPrivees } from './analysesPubliques.js'

const RACINE_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
/** On the Railway volume (storage/). `DOSSIER_SYNTHESES` only for the bench, never in production. */
export const DOSSIER_SYNTHESES = process.env.DOSSIER_SYNTHESES || path.join(RACINE_BACKEND, 'storage', 'syntheses')

const DATE = /^\d{4}-\d{2}-\d{2}$/

export type CleSection = 'top5' | 'heros' | 'buyNow' | 'roi' | 'highTicket' | 'breakout' | 'listeNoire'

export interface ProduitSynthese {
  id: string
  categorie: string
  categorieLabel: string
  theme: string
  themeLabel: string
  rang: number | null
  nom: string
  variante: string
  score: number | null
  decision: string
  source: string
  coutRendu: number | null
  prixVente: number | null
  margeNette: number | null
  roi: number | null
  /** Search pages, never invented product pages: what the file gives, as is. */
  liens: Record<string, string>
}

export interface Synthese {
  date: string
  importeLe: string
  origine: string
  format: 'json' | 'markdown'
  empreinte: string
  macro: string
  produits: ProduitSynthese[]
  sections: Record<CleSection, string[]>
}

const SECTIONS: Array<{ cle: CleSection; motif: RegExp }> = [
  { cle: 'top5', motif: /top[\s_-]*5|launch[\s_-]*now|priorit/i },
  { cle: 'heros', motif: /hero/i },
  { cle: 'buyNow', motif: /buy[\s_-]*now/i },
  { cle: 'roi', motif: /\broi\b|_roi_|roi_|champions/i },
  { cle: 'highTicket', motif: /high[\s_-]*ticket/i },
  { cle: 'breakout', motif: /breakout|viral|tiktok/i },
  { cle: 'listeNoire', motif: /black[\s_-]*list|dont[\s_-]*buy|don'?t[\s_-]*buy|liste[\s_-]*noire|exclu/i },
]

function sectionDe(nom: string): CleSection | null {
  // The blacklist first: « regulatory_blacklist_dont_buy » also says « buy ».
  const ordre: CleSection[] = ['listeNoire', 'top5', 'heros', 'highTicket', 'breakout', 'roi', 'buyNow']
  for (const cle of ordre) if (SECTIONS.find((s) => s.cle === cle)!.motif.test(nom)) return cle
  return null
}

const sectionsVides = (): Record<CleSection, string[]> => ({ top5: [], heros: [], buyNow: [], roi: [], highTicket: [], breakout: [], listeNoire: [] })

// ------------------------------------------------------------------ lecture

function texte(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}

function nombre(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  const m = v.replace(/ |\s/g, '').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

function champ(o: Record<string, unknown>, ...cles: string[]): unknown {
  for (const c of cles) if (o[c] != null && o[c] !== '') return o[c]
  return undefined
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function liensDe(urls: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!urls || typeof urls !== 'object') return out
  for (const [k, v] of Object.entries(urls as Record<string, unknown>)) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) out[k] = v.trim()
  }
  return out
}

/** The first key matching, whatever the agent's spelling (« product_name », « nom_produit », « Produit »…). */
function champMotif(o: Record<string, unknown>, motif: RegExp): unknown {
  for (const [k, v] of Object.entries(o)) if (motif.test(k) && v != null && v !== '' && typeof v !== 'object') return v
  return undefined
}

function produitJson(o: Record<string, unknown>): ProduitSynthese | null {
  const nom =
    texte(champ(o, 'product_name', 'name', 'nom', 'title')) ||
    texte(champMotif(o, /^(product|produit|nom|titre)[\s_-]*(name|nom|produit)?$/i)) ||
    texte((o.urls as Record<string, unknown> | undefined)?.clean_name)
  if (!nom) return null
  const categorieLabel = texte(champ(o, 'category_label', 'category_name', 'categorie'))
  const categorie = texte(champ(o, 'category_id')) || slug(categorieLabel)
  const themeLabel = texte(champ(o, 'theme_label', 'theme_name'))
  const theme = texte(champ(o, 'theme_id')) || slug(themeLabel)
  const rang = nombre(champ(o, 'rank', 'rang'))
  return {
    id: `${categorie}/${theme}/${rang ?? slug(nom)}`,
    categorie,
    categorieLabel,
    theme,
    themeLabel,
    rang,
    nom,
    variante: texte(champ(o, 'variant', 'variante')),
    score: nombre(champ(o, 'score', 'score_str')),
    decision: texte(champ(o, 'decision', 'verdict')),
    source: texte(champ(o, 'source_achat', 'source')),
    coutRendu: nombre(champ(o, 'landed_cost', 'landed_cost_str')),
    prixVente: nombre(champ(o, 'target_price', 'target_price_str')),
    margeNette: nombre(champ(o, 'net_margin', 'net_margin_str')),
    roi: nombre(champ(o, 'roi', 'roi_str')),
    liens: liensDe(o.urls),
  }
}

/** The structured export. Null when it holds no product at all. */
export function lireSyntheseJson(json: unknown): Omit<Synthese, 'importeLe' | 'origine' | 'empreinte' | 'macro'> | null {
  if (!json || typeof json !== 'object') return null
  const racine = json as Record<string, unknown>
  const meta = (racine.meta ?? {}) as Record<string, unknown>
  const parId = new Map<string, ProduitSynthese>()
  const ajouter = (p: ProduitSynthese) => {
    if (!parId.has(p.id)) parId.set(p.id, p)
    return parId.get(p.id)!.id
  }
  // Every array of objects, at any depth: its key says whether it is a list (« top_5_launch_now ») or the catalogue.
  const tableaux: Array<[string, unknown[]]> = []
  const parcourir = (v: unknown, cle: string, profondeur: number) => {
    if (profondeur > 4 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) {
      if (v.some((x) => x && typeof x === 'object' && !Array.isArray(x))) tableaux.push([cle, v])
      return
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) parcourir(x, k, profondeur + 1)
  }
  parcourir(racine, '', 0)
  const sections = sectionsVides()
  for (const [k, v] of tableaux) {
    const cle = /all|tous|toutes|produits|products|catalog/i.test(k) && !/top|hero|black|noire|breakout/i.test(k) ? null : sectionDe(k)
    for (const o of v) {
      const p = o && typeof o === 'object' ? produitJson(o as Record<string, unknown>) : null
      if (!p) continue
      const id = ajouter(p)
      if (cle && !sections[cle].includes(id)) sections[cle].push(id)
    }
  }
  if (!parId.size) return null
  const date = texte(champ(meta, 'study_date', 'date')) || texte(racine.date) || texte(champMotif(meta, /date/i))
  return { date: DATE.test(date) ? date : '', format: 'json', produits: [...parId.values()], sections }
}

// --------------------------------------------------------- markdown (repli)

function cellules(ligne: string): string[] {
  return ligne.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

const sansGras = (s: string) => s.replace(/\*+/g, '').replace(/`/g, '').trim()

/** opportunites-prioritaires.md: one table per « ## N. … » section. */
export function lireSyntheseMarkdown(md: string): Omit<Synthese, 'importeLe' | 'origine' | 'empreinte' | 'macro'> | null {
  const parId = new Map<string, ProduitSynthese>()
  const sections = sectionsVides()
  let cle: CleSection | null = null
  let entete: string[] | null = null
  for (const ligne of md.split(/\r?\n/)) {
    if (/^#{2,3}\s/.test(ligne)) {
      cle = sectionDe(ligne)
      entete = null
      continue
    }
    if (!cle || !ligne.trim().startsWith('|')) {
      if (!ligne.trim().startsWith('|')) entete = null
      continue
    }
    const c = cellules(ligne)
    if (!entete) {
      entete = c.map((x) => sansGras(x).toLowerCase())
      continue
    }
    if (c.every((x) => /^:?-+:?$/.test(x))) continue
    const col = (motif: RegExp) => {
      const i = entete!.findIndex((h) => motif.test(h))
      return i >= 0 ? c[i] ?? '' : ''
    }
    const brutProduit = col(/produit|hero/)
    const nom = sansGras(brutProduit.split(/<br\s*\/?>/i)[0] ?? '')
    if (!nom) continue
    const variante = sansGras((brutProduit.split(/<br\s*\/?>/i)[1] ?? '').replace(/^\s*\*|\*\s*$/g, ''))
    const brutCat = col(/cat/)
    const categorieLabel = sansGras(brutCat.split(/<br\s*\/?>|\(/i)[0] ?? '')
    const theme = brutCat.match(/`([a-z0-9-]+)`/)?.[1] ?? ''
    const liens: Record<string, string> = {}
    for (const m of ligne.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
      const host = new URL(m[2]).hostname.replace(/^www\.|^fr\./, '').split('.')[0]
      liens[host] ??= m[2]
    }
    const categorie = slug(categorieLabel)
    const id = `${categorie}/${theme || slug(nom)}/${slug(nom)}`
    if (!parId.has(id)) {
      parId.set(id, {
        id,
        categorie,
        categorieLabel,
        theme,
        themeLabel: '',
        rang: null,
        nom,
        variante,
        score: nombre(col(/score/)),
        decision: sansGras(col(/d[ée]cision|verdict|statut/)).replace(/^[^A-Za-z]+/, '').replace(/\s*\(.*$/, ''),
        source: '',
        coutRendu: nombre(col(/co[uû]t/)),
        prixVente: nombre(col(/prix/)),
        margeNette: nombre(col(/marge/)),
        roi: nombre(col(/\broi\b/)),
        liens,
      })
    }
    if (!sections[cle].includes(id)) sections[cle].push(id)
  }
  if (!parId.size) return null
  const date = md.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] ?? ''
  return { date, format: 'markdown', produits: [...parId.values()], sections }
}

/** The macro section: « Synthèse Macro-Commerciale » or « Vue d'ensemble stratégique ». */
export function lireMacro(md: string): string {
  const lignes = md.split(/\r?\n/)
  const debut = lignes.findIndex((l) => /^#{2,3}\s.*(macro|vue d['’]ensemble)/i.test(l))
  if (debut < 0) return ''
  const fin = lignes.findIndex((l, i) => i > debut && (/^#{1,3}\s/.test(l) || /^---\s*$/.test(l)))
  return lignes
    .slice(debut + 1, fin < 0 ? undefined : fin)
    .join('\n')
    .trim()
}

// ------------------------------------------------------------- stockage

function cheminJour(date: string): string {
  if (!DATE.test(date)) throw new Error(`date invalide : ${date}`)
  return path.join(DOSSIER_SYNTHESES, `${date}.json`)
}

export function lireSynthese(date: string): Synthese | null {
  try {
    return JSON.parse(fs.readFileSync(cheminJour(date), 'utf8')) as Synthese
  } catch {
    return null
  }
}

export function datesSyntheses(): string[] {
  try {
    return fs
      .readdirSync(DOSSIER_SYNTHESES)
      .map((f) => f.replace(/\.json$/, ''))
      .filter((d) => DATE.test(d))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

export interface SourcesSynthese {
  date?: string
  origine: string
  json?: unknown
  opportunitesMd?: string | null
  generaleMd?: string | null
  tableauMd?: string | null
}

export interface BilanSynthese {
  date: string
  statut: 'importe' | 'apercu' | 'doublon' | 'refuse'
  raison?: string
  format?: 'json' | 'markdown'
  produits?: number
  sections?: Record<CleSection, number>
}

/** Builds the day from its files, JSON first, and writes it unless `essai`. */
export function importerSynthese(src: SourcesSynthese, essai: boolean): BilanSynthese {
  const lue = (src.json != null ? lireSyntheseJson(src.json) : null) ?? (src.opportunitesMd ? lireSyntheseMarkdown(src.opportunitesMd) : null)
  const date = src.date && DATE.test(src.date) ? src.date : lue?.date ?? ''
  if (!lue) return { date, statut: 'refuse', raison: 'aucun produit lisible (ni JSON, ni tableaux de opportunites-prioritaires.md)' }
  if (!DATE.test(date)) return { date, statut: 'refuse', raison: 'date introuvable (ni dossier daté, ni meta.study_date)' }
  if (lue.date && lue.date !== date) return { date, statut: 'refuse', raison: `le fichier dit ${lue.date}, le dossier ${date}` }
  const macro = (src.generaleMd && lireMacro(src.generaleMd)) || (src.tableauMd && lireMacro(src.tableauMd)) || ''
  const corps = { produits: lue.produits, sections: lue.sections, macro }
  const empreinte = crypto.createHash('sha256').update(JSON.stringify(corps)).digest('hex')
  const mesure = {
    format: lue.format,
    produits: lue.produits.length,
    sections: Object.fromEntries(Object.entries(lue.sections).map(([k, v]) => [k, v.length])) as Record<CleSection, number>,
  }
  const avant = lireSynthese(date)
  if (avant?.empreinte === empreinte) return { date, statut: 'doublon', raison: 'déjà importée, identique', ...mesure }
  if (!essai) {
    const synthese: Synthese = { date, importeLe: new Date().toISOString(), origine: src.origine, format: lue.format, empreinte, ...corps }
    fs.mkdirSync(DOSSIER_SYNTHESES, { recursive: true })
    const provisoire = `${cheminJour(date)}.${process.pid}.tmp`
    fs.writeFileSync(provisoire, JSON.stringify(synthese))
    fs.renameSync(provisoire, cheminJour(date))
  }
  return { date, statut: essai ? 'apercu' : 'importe', raison: avant ? 'remplace la version précédente du même jour' : undefined, ...mesure }
}

// ------------------------------------------------------------ faces

const FAVORABLES = /^(BUY NOW|BUY IF NEGOTIATED|BREAKOUT)/i

export function compteurs(s: Synthese) {
  const decisions = s.produits.map((p) => p.decision.toUpperCase())
  return {
    rayons: new Set(s.produits.map((p) => p.categorie)).size,
    produitsAnalyses: s.produits.length,
    opportunites: decisions.filter((d) => FAVORABLES.test(d)).length,
    aSurveiller: decisions.filter((d) => /^WATCHLIST/.test(d)).length,
    aRisque: s.sections.listeNoire.length || decisions.filter((d) => /^DON'?T BUY/.test(d)).length,
    produitsPhares: s.sections.heros.length,
    tendancesReseaux: s.sections.breakout.length,
  }
}

/** Everything, for the connected space: prices, margins, ROI, decisions, search links. */
export function synthesePrivee(s: Synthese) {
  const parId = new Map(s.produits.map((p) => [p.id, p]))
  return {
    date: s.date,
    importeLe: s.importeLe,
    format: s.format,
    compteurs: compteurs(s),
    macro: s.macro,
    /** The links are search pages on each site, never a product page. */
    liensDeRecherche: true,
    sections: Object.fromEntries(Object.entries(s.sections).map(([k, ids]) => [k, ids.map((id) => parId.get(id)).filter(Boolean)])),
    produits: s.produits,
  }
}

/** « +68,6 % de ROI », « BUY NOW », « marge » : whatever speaks of buying or margins goes. */
const ACHAT_PUBLIC = /\b(buy|roi|achat|achet|marge|co[uû]t|rendu|landed|sourcing|grossiste|fournisseur|high[\s-]*ticket)\b/i

function textePublic(t: string): string {
  if (!t) return ''
  const filtre = sansMentionsPrivees(t)
  return filtre
    .split('\n')
    .map((l) =>
      l
        .split(/(?<=[.!?])\s+/)
        .filter((phrase) => !ACHAT_PUBLIC.test(phrase) && !estPrivee(phrase))
        .join(' '),
    )
    .filter((l, i, tout) => l.trim() || (i > 0 && tout[i - 1].trim()))
    .join('\n')
    .replace(/`/g, '')
    .trim()
}

export interface ProduitPublicSynthese {
  nom: string
  variante: string
  categorie: string
  categorieLabel: string
  theme: string
  themeLabel: string
  rang: number | null
}

function produitPublic(p: ProduitSynthese): ProduitPublicSynthese | null {
  // « Manette rétro filaire USB 8-bit premier prix (< 2 $) » : the buying figure goes, the product stays.
  const nom = p.nom.replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (estPrivee(dedans) || ACHAT_PUBLIC.test(dedans) ? "" : m)).trim()
  if (!nom || estPrivee(nom) || ACHAT_PUBLIC.test(nom)) return null
  const variante = pourquoiPublic(p.variante)
  return {
    nom,
    variante: ACHAT_PUBLIC.test(variante) ? '' : variante,
    categorie: p.categorie,
    categorieLabel: p.categorieLabel,
    theme: p.theme,
    themeLabel: p.themeLabel,
    rang: p.rang,
  }
}

/**
 * Max's split (04/11): several Fresh Market News a day and animated blocks,
 * from the same structured import. BUY NOW, ROI and high-ticket lists stay
 * private: they are buying advice by construction.
 */
export function synthesePublique(s: Synthese) {
  const parId = new Map(s.produits.map((p) => [p.id, p]))
  const liste = (cle: CleSection) =>
    s.sections[cle]
      .map((id) => parId.get(id))
      .filter((p): p is ProduitSynthese => !!p)
      .map(produitPublic)
      .filter((p): p is ProduitPublicSynthese => !!p)
  const c = compteurs(s)
  const top5 = liste('top5')
  const heros = liste('heros')
  const breakout = liste('breakout')
  const risque = liste('listeNoire')
  const macro = textePublic(s.macro)
  const actualites = [
    top5.length && {
      id: 'tendances-du-jour',
      titre: 'Les 5 tendances du jour',
      chapo: `Les cinq produits qui ressortent de l'analyse des ${c.rayons} rayons ce jour-là, portés par la saison et la demande du moment.`,
      produits: top5,
    },
    heros.length && {
      id: 'produits-phares',
      titre: 'Le produit phare de chaque rayon',
      chapo: `Le produit classé premier dans chacun des ${heros.length} rayons analysés aujourd'hui.`,
      produits: heros,
    },
    breakout.length && {
      id: 'tendances-reseaux',
      titre: 'Ce qui monte sur TikTok et Reels',
      chapo: 'Des produits à effet visuel immédiat, en forte accélération sur les réseaux sociaux.',
      produits: breakout,
    },
    risque.length && {
      id: 'produits-a-risque',
      titre: 'Les produits à éviter',
      chapo: 'Des produits écartés ce jour-là : non-conformité européenne, interdiction en France, retours trop fréquents ou concurrence par les prix.',
      produits: risque,
    },
    macro && { id: 'contexte-du-marche', titre: 'Le marché du jour', chapo: '', texte: macro },
  ].filter(Boolean)
  return {
    date: s.date,
    compteurs: {
      rayons: c.rayons,
      produitsAnalyses: c.produitsAnalyses,
      opportunites: c.opportunites,
      aRisque: c.aRisque,
      produitsPhares: c.produitsPhares,
      tendancesReseaux: c.tendancesReseaux,
    },
    actualites,
    blocs: {
      bandeauPhares: heros.map((p) => ({ nom: p.nom, rayon: p.categorieLabel, categorie: p.categorie })),
      carrouselTendances: breakout.map((p) => ({ nom: p.nom, rayon: p.categorieLabel, categorie: p.categorie })),
    },
  }
}

// ------------------------------------------------- reconnaissance des fichiers

export type RoleSynthese = 'json' | 'opportunites' | 'generale' | 'tableau' | 'index'

/** Which synthesis file this is, from its name, or null for any other file. */
export function roleSynthese(nom: string): RoleSynthese | null {
  if (/^opportunites-import-dropshipper.*\.json$/i.test(nom)) return 'json'
  if (/^opportunites-prioritaires.*\.md$/i.test(nom)) return 'opportunites'
  if (/^synthese-generale.*\.md$/i.test(nom)) return 'generale'
  if (/^SYNTHESE_.*\.md$/i.test(nom)) return 'tableau'
  if (/^INDEX_SYNTHESES.*\.md$/i.test(nom)) return 'index'
  return null
}

// ------------------------------------------------------------ journal

const CHEMIN_JOURNAL = () => path.join(DOSSIER_SYNTHESES, '_journal.json')

/**
 * The last imports' outcomes, refusals included (08/11/2026: syntheses listed
 * but never stored, and nothing on the site said why). Readable without the
 * admin key through GET /api/syntheses-etat: dates, statuses and reasons only,
 * no file content.
 */
export function noterImports(bilans: BilanSynthese[]) {
  if (!bilans.length) return
  try {
    const avant = lireJournal()
    const quand = new Date().toISOString()
    const tout = [...bilans.map((b) => ({ quand, date: b.date, statut: b.statut, raison: b.raison ?? '', produits: b.produits ?? null })), ...avant].slice(0, 60)
    fs.mkdirSync(DOSSIER_SYNTHESES, { recursive: true })
    fs.writeFileSync(CHEMIN_JOURNAL(), JSON.stringify(tout))
  } catch (err) {
    console.error('[syntheses] journal', err)
  }
}

export function lireJournal(): Array<{ quand: string; date: string; statut: string; raison: string; produits: number | null }> {
  try {
    const l = JSON.parse(fs.readFileSync(CHEMIN_JOURNAL(), 'utf8'))
    return Array.isArray(l) ? l : []
  } catch {
    return []
  }
}

// ------------------------------------------------------- publication

/**
 * Max, 08/11/2026 : « les synthèses du jour, finalement, on ne va pas les
 * publier sur le site en ligne ». They live in KANTIX only (admin back office,
 * DropShipper project, « Synthèses AIMARKET »). Every public reader (Fresh
 * Market News pages, sitemap, dashboard counters) asks this first.
 */
export const SYNTHESES_PUBLIEES = false

// ------------------------------------------- import dans un compte vendeur

export interface ProduitACreer {
  sourceUrl: string
  sourceSite: string | null
  sourceCategory: string | null
  title: string
  description: string
  price: number
  sellingPrice: number
}

/**
 * The listing a chosen winner becomes in a seller's catalogue (Max, 08/11:
 * « importer les produits gagnants passés au crible sur mon compte utilisateur
 * au choix »). The file gives no product page, no photo: the listing keeps the
 * search page it was found through as its source, the landed cost as the
 * supplier price and the target price as the selling price — the seller
 * completes it like a hand-made listing.
 */
export function produitACreer(p: ProduitSynthese): ProduitACreer {
  const source = p.liens.sourcing_primary || p.liens.dropshipper_import || p.liens.aliexpress_fr || Object.values(p.liens)[0] || ''
  let site: string | null = null
  try {
    site = source ? new URL(source).hostname.replace(/^www\./, '') : null
  } catch {
    site = null
  }
  const lignes = [p.variante, p.themeLabel && `Rayon : ${p.categorieLabel} › ${p.themeLabel}`].filter(Boolean)
  return {
    sourceUrl: source,
    sourceSite: site,
    sourceCategory: p.categorieLabel || p.categorie || null,
    title: p.nom.slice(0, 200),
    description: lignes.join('\n\n'),
    price: p.coutRendu ?? 0,
    sellingPrice: p.prixVente ?? 0,
  }
}
