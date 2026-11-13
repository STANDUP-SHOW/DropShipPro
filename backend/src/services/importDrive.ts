/**
 * Import of market analyses written by other agents into public Google Drive
 * folders (asked by Max on 10/10/2026, back-office « Analyses »).
 *
 * Expected layout, as found in his first folder:
 *   <racine>/<AAAA-MM-JJ>/<categorie>/<theme>.rayon.md      (our Markdown contract)
 *                                    <theme>.marketing.md
 *                                    <theme>.json           (aiMARKET, or a poorer « rayon-payload »)
 *                                    <theme>.sourcing.md    (another kind of document)
 *
 * Nothing here talks to Google with an account: a public folder lists through
 * its embedded view and its files download through the public export link.
 * The studies go through the very reader the command-line importers use
 * (rapports-etude.cjs), so they land with the same `data` shape and are served
 * through the same public filters (no supplier, no purchase price).
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ajouterEtudesImportees,
  etudeDepuisSurcouche,
  idsRapportsEnService,
  lireSurcouche,
  rayonsEnService,
  type EtudeImportee,
} from './reportsDb.js'
import { importerSynthese, LECTEUR_SYNTHESE, lireSynthese, noterImports, roleSynthese, type BilanSynthese, type RoleSynthese } from './synthesesQuotidiennes.js'

export class DriveErreur extends Error {}

const etudeLib = createRequire(import.meta.url)('../../rapports-etude.cjs') as {
  frontmatter(texte: string): Record<string, string> | null
  slug(s: string): string
}

const MAX_DOSSIERS = 400
const MAX_FICHIERS = 2000
const DELAI_MS = 20_000
/** Undated reports (no AAAA-MM-JJ folder above them) opened to read their own date. */
const MAX_SANS_DATE = 60

/** « https://drive.google.com/drive/folders/<id>?usp=sharing », « …?id=<id> » or the bare id. */
export function idDossierDrive(adresse: string): string {
  const a = String(adresse || '').trim()
  const m = a.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? a.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ?? a.match(/^([A-Za-z0-9_-]{10,})$/)
  if (!m) throw new DriveErreur("Adresse de dossier Google Drive non reconnue (attendu : https://drive.google.com/drive/folders/…).")
  return m[1]
}

async function obtenir(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS)
  try {
    return await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (DropShipper import)' } })
  } catch (err) {
    throw new DriveErreur(`Google Drive ne répond pas (${err instanceof Error ? err.message : String(err)}).`)
  } finally {
    clearTimeout(minuteur)
  }
}

function decoder(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

export interface EntreeDrive {
  id: string
  nom: string
  dossier: boolean
}

/**
 * One folder's entries, read from its embedded view. Each entry is a
 * `flip-entry` block holding a link (/drive/folders/<id> for a folder,
 * /file/d/<id> for a file) and a `flip-entry-title`.
 */
export function lireVueEmbarquee(html: string): EntreeDrive[] {
  const out: EntreeDrive[] = []
  const blocs = html.split(/<div[^>]+class="flip-entry"/).slice(1)
  for (const b of blocs) {
    const lien = b.match(/href="([^"]+)"/)?.[1] ?? ''
    const titre = b.match(/class="flip-entry-title"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    const dossier = lien.match(/\/folders\/([A-Za-z0-9_-]+)/)
    const fichier = lien.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ?? lien.match(/[?&]id=([A-Za-z0-9_-]+)/)
    const id = dossier?.[1] ?? fichier?.[1] ?? b.match(/id="entry-([A-Za-z0-9_-]+)"/)?.[1]
    if (!id || titre == null) continue
    out.push({ id, nom: decoder(titre), dossier: !!dossier })
  }
  return out
}

/**
 * The folder's own name, from the embedded view's <title> (« 2026-11-03 », or
 * « 2026-11-03 - Google Drive »). Empty when the page carries none.
 */
export function nomDossierVue(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return t ? decoder(t).replace(/\s*[-–—]\s*Google\s+Drive\s*$/i, '').trim() : ''
}

/** Pauses between two tries of a listing Google did not render (throttled, busy). */
const REPRISES_MS = [1_500, 5_000, 12_000]
/** Folders listed in parallel: fast enough for nine days × 24 shelves, gentle enough for Google. */
const EN_PARALLELE = 4
/** A listing is kept this long: the import right after a reading does not ask Google again. */
const CACHE_MS = 15 * 60_000
const vues = new Map<string, { le: number; nom: string; entrees: EntreeDrive[] }>()
const attendre = (ms: number) => new Promise((r) => setTimeout(r, process.env.DRIVE_SANS_ATTENTE ? 0 : ms))

/**
 * One folder's listing. A page that is not a folder view (no « flip-entries »
 * list, even empty) is NOT an empty folder: Google answers so when it throttles
 * a server that asks too often. Read as empty, it silently dropped every
 * folder listed after it — the reports of 9 to 12/11/2026 vanished from the
 * reading while the small synthesis folder still listed. It is retried, then named.
 */
/** What the readings of this process met, for the reading journal (/api/analyses-drive-etat). */
const compteurs = { dossiers: 0, reprises: 0, videsDates: 0 }

async function listerUnDossier(id: string, ou = ''): Promise<{ nom: string; entrees: EntreeDrive[] }> {
  const garde = vues.get(id)
  if (garde && Date.now() - garde.le < CACHE_MS) return garde
  // A date folder is never empty once the agent has written it: an empty one is read again.
  const jour = DATE.test(ou.split('/').pop() ?? '')
  let motif = ''
  compteurs.dossiers++
  for (let essai = 0; essai <= REPRISES_MS.length; essai++) {
    if (essai) {
      compteurs.reprises++
      await attendre(REPRISES_MS[essai - 1])
    }
    const r = await obtenir(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`)
    if (r.status === 404) throw new DriveErreur(`Dossier introuvable${ou ? ` (${ou})` : ''} : vérifiez l'adresse.`)
    const html = r.ok ? await r.text() : ''
    if (r.ok && /accounts\.google\.com\/(ServiceLogin|signin)/.test(html) && !html.includes('flip-entry')) {
      throw new DriveErreur(`Ce dossier n'est pas public${ou ? ` (${ou})` : ''} : partagez-le en « Tous les utilisateurs disposant du lien ».`)
    }
    if (r.ok && html.includes('flip-entries')) {
      const vue = { le: Date.now(), nom: nomDossierVue(html), entrees: lireVueEmbarquee(html) }
      if (jour && !vue.entrees.length && essai < REPRISES_MS.length) {
        motif = 'dossier daté rendu vide'
        continue
      }
      if (jour && !vue.entrees.length) compteurs.videsDates++
      vues.set(id, vue)
      if (vues.size > 5_000) vues.clear()
      return vue
    }
    motif = r.ok ? 'page sans liste de fichiers' : `réponse ${r.status}`
  }
  throw new DriveErreur(
    `Google Drive n'a pas rendu la liste du dossier ${ou ? `« ${ou} »` : id} (${motif}, ${REPRISES_MS.length + 1} essais) : il freine les lectures trop nombreuses. Relancez dans quelques minutes ; rien n'a été importé à moitié.`,
  )
}

// ---------------------------------------------------------- reading journal

export interface LectureDrive {
  quand: string
  action: 'lister' | 'importer'
  dossier: string
  /** Folders asked to Google, retries, date folders that stayed empty after the retries. */
  dossiersLus: number
  reprises: number
  videsDates: number
  fichiers: number
  /** Each date found and how many shelves (reports) it holds; the day's synthesis apart. */
  dates: { date: string; rayons: number; synthese: boolean }[]
  secondes: number
  erreur?: string
}

const CHEMIN_LECTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'drive-lectures.json')

export function lireLectures(): LectureDrive[] {
  try {
    const l = JSON.parse(fs.readFileSync(CHEMIN_LECTURES, 'utf8'))
    return Array.isArray(l) ? l : []
  } catch {
    return []
  }
}

function noterLecture(l: LectureDrive) {
  try {
    fs.mkdirSync(path.dirname(CHEMIN_LECTURES), { recursive: true })
    fs.writeFileSync(CHEMIN_LECTURES, JSON.stringify([l, ...lireLectures()].slice(0, 40), null, 1))
  } catch (err) {
    console.error('[drive] journal des lectures non écrit', err instanceof Error ? err.message : err)
  }
}

/** Runs one reading and writes what it found (or the error) to the journal, without file contents. */
async function journalise<T extends { dates: DateTrouvee[]; nbFichiers: number }>(action: LectureDrive['action'], dossier: string, lire: () => Promise<T>): Promise<T> {
  const debut = Date.now()
  const avant = { ...compteurs }
  const ligne = (): Omit<LectureDrive, 'fichiers' | 'dates'> => ({
    quand: new Date().toISOString(),
    action,
    dossier,
    dossiersLus: compteurs.dossiers - avant.dossiers,
    reprises: compteurs.reprises - avant.reprises,
    videsDates: compteurs.videsDates - avant.videsDates,
    secondes: Math.round((Date.now() - debut) / 1000),
  })
  try {
    const r = await lire()
    noterLecture({
      ...ligne(),
      fichiers: r.nbFichiers,
      dates: r.dates.map((d) => ({ date: d.date, rayons: d.etudes.length, synthese: Object.keys(d.syntheses).length > 0 })),
    })
    return r
  } catch (err) {
    noterLecture({ ...ligne(), fichiers: 0, dates: [], erreur: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export interface FichierDrive {
  id: string
  nom: string
  /** Folder names from the root, the file excluded. */
  chemin: string[]
}

/**
 * Every file under the folder, breadth first, with its folder path. The path
 * starts with the pasted folder's own name, so pasting a date folder
 * (« 2026-11-03 ») places its files as pasting its parent does.
 * `dateVoulue`, when given, skips the date folders (AAAA-MM-JJ) it refuses:
 * an import of one day no longer reads the nine others.
 */
export async function listerArbre(racine: string, dateVoulue?: (date: string) => boolean): Promise<FichierDrive[]> {
  const fichiers: FichierDrive[] = []
  let niveau: { id: string; chemin: string[] | null }[] = [{ id: racine, chemin: null }]
  let dossiers = 0
  while (niveau.length) {
    const suivant: typeof niveau = []
    for (let i = 0; i < niveau.length; i += EN_PARALLELE) {
      const lot = niveau.slice(i, i + EN_PARALLELE)
      dossiers += lot.length
      if (dossiers > MAX_DOSSIERS) throw new DriveErreur(`Plus de ${MAX_DOSSIERS} dossiers : donnez un sous-dossier plus précis.`)
      const lus = await Promise.all(lot.map((d) => listerUnDossier(d.id, d.chemin?.join('/') ?? '')))
      lot.forEach((d, k) => {
        const { nom, entrees } = lus[k]
        const chemin = d.chemin ?? (nom ? [nom] : [])
        for (const e of entrees) {
          if (e.dossier) {
            if (dateVoulue && DATE.test(e.nom) && !dateVoulue(e.nom)) continue
            suivant.push({ id: e.id, chemin: [...chemin, e.nom] })
          } else fichiers.push({ id: e.id, nom: e.nom, chemin })
          if (fichiers.length > MAX_FICHIERS) throw new DriveErreur(`Plus de ${MAX_FICHIERS} fichiers : donnez un sous-dossier plus précis.`)
        }
      })
    }
    niveau = suivant
  }
  return fichiers
}

/** Files already opened by `daterSansDossier`, handed once to the import. */
const telecharges = new Map<string, string>()

async function telecharger(id: string): Promise<string> {
  const deja = telecharges.get(id)
  if (deja != null) {
    telecharges.delete(id)
    return deja
  }
  const r = await obtenir(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`)
  const texte = r.ok ? await r.text() : ''
  if (r.ok && !/^\s*<!doctype html|^\s*<html/i.test(texte)) return texte.replace(/^﻿/, '')
  // A file written by an agent through Google's own tools can be a Google Doc that keeps its « .md » or
  // « .json » title: no download for those, only an export as plain text.
  const d = await obtenir(`https://docs.google.com/document/d/${encodeURIComponent(id)}/export?format=txt`)
  const doc = d.ok ? await d.text() : ''
  if (d.ok && doc.trim() && !/^\s*<!doctype html|^\s*<html/i.test(doc)) return doc.replace(/^﻿/, '')
  if (!r.ok) throw new DriveErreur(`téléchargement refusé (${r.status})`)
  throw new DriveErreur('Google a renvoyé une page au lieu du fichier (fichier non public ?)')
}

// ------------------------------------------------------------- regroupement

type Genre = 'rayon' | 'marketing' | 'json' | 'sourcing' | 'autre'

function genre(nom: string): { genre: Genre; theme: string } {
  const m = nom.match(/^(.+?)\.(rayon|marketing|sourcing)\.md$/i)
  if (m) return { genre: m[2].toLowerCase() as Genre, theme: m[1] }
  const j = nom.match(/^(.+)\.json$/i)
  if (j) return { genre: 'json', theme: j[1] }
  return { genre: 'autre', theme: nom }
}

export interface EtudeTrouvee {
  date: string
  categorie: string
  theme: string
  rayon: FichierDrive | null
  marketing: FichierDrive | null
  json: FichierDrive | null
  /** Same shelf, same day, another file: shown, never imported over the first. */
  doublons: FichierDrive[]
}

export interface DateTrouvee {
  date: string
  etudes: EtudeTrouvee[]
  /** Documents with no place on the site (sourcing notes and the like). */
  ignores: { nom: string; raison: string }[]
  /** The day's synthesis files (MARKET-ANALYSES/syntheses/<date>/…), by role. */
  syntheses: Partial<Record<RoleSynthese, FichierDrive>>
}

/** Under a « syntheses » folder, or named as one of the agent's synthesis files. */
function estSynthese(f: FichierDrive): RoleSynthese | null {
  const role = roleSynthese(f.nom)
  if (role) return role
  return f.chemin.some((c) => /^synth[eè]ses?$/i.test(c)) && /\.(json|md)$/i.test(f.nom) ? 'index' : null
}

/** A pseudo-study for the day's synthesis, so the screens list and pre-select it like a shelf. */
export const RAYON_SYNTHESE = { categorie: 'syntheses', theme: 'synthese-du-jour' }

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Studies grouped by date folder, then by category folder and theme. */
export function regrouper(fichiers: FichierDrive[]): DateTrouvee[] {
  const parDate = new Map<string, DateTrouvee>()
  const jourDe = (date: string) => {
    if (!parDate.has(date)) parDate.set(date, { date, etudes: [], ignores: [], syntheses: {} })
    return parDate.get(date)!
  }
  for (const f of fichiers) {
    const role = estSynthese(f)
    if (role) {
      // « SYNTHESE_aiMARKET_2026-11-04.md » may sit above the date folders: its name dates it.
      const dateS = f.chemin.find((c) => DATE.test(c)) ?? f.nom.match(/\d{4}-\d{2}-\d{2}/)?.[0]
      if (!dateS || role === 'index') continue // INDEX_SYNTHESES.md: a table of contents, nothing to import
      const s = jourDe(dateS).syntheses
      if (!s[role]) s[role] = f
      continue
    }
    const i = f.chemin.findIndex((c) => DATE.test(c))
    if (i < 0) continue // prompts/, notes at the root…
    const date = f.chemin[i]
    const categorie = f.chemin[i + 1] ?? ''
    const jour = jourDe(date)
    const g = genre(f.nom)
    const nomComplet = [...f.chemin.slice(i + 1), f.nom].join('/')
    if (g.genre === 'sourcing') {
      jour.ignores.push({ nom: nomComplet, raison: 'note de sourcing : aucun emplacement sur le site' })
      continue
    }
    if (g.genre === 'autre') {
      jour.ignores.push({ nom: nomComplet, raison: 'format inconnu' })
      continue
    }
    let e = jour.etudes.find((x) => x.categorie === categorie && x.theme === g.theme)
    if (!e) {
      e = { date, categorie, theme: g.theme, rayon: null, marketing: null, json: null, doublons: [] }
      jour.etudes.push(e)
    }
    const place = g.genre as 'rayon' | 'marketing' | 'json'
    if (e[place]) e.doublons.push(f)
    else e[place] = f
  }
  const out = [...parDate.values()].sort((a, b) => b.date.localeCompare(a.date))
  for (const d of out) d.etudes.sort((a, b) => `${a.categorie}/${a.theme}`.localeCompare(`${b.categorie}/${b.theme}`))
  return out
}

function idRayonIndice(e: EtudeTrouvee): string {
  return `rayon-${e.date}-${e.categorie}-${e.theme}`
}

/**
 * Files with no date folder above them (a category folder pasted on its own,
 * a flat folder): a .rayon.md gives its date and category in its header, an
 * aiMARKET .json in its « study » block. Each such study (its .rayon.md,
 * .marketing.md and .json, same folder and theme) moves under that date and
 * category; what stays undated is returned by name, never silently dropped.
 */
export async function daterSansDossier(fichiers: FichierDrive[]): Promise<{ fichiers: FichierDrive[]; sansDate: string[] }> {
  const dates = (f: FichierDrive) => f.chemin.some((c) => DATE.test(c))
  const cle = (f: FichierDrive) => `${f.chemin.join('/')}|${genre(f.nom).theme}`
  const groupes = new Map<string, FichierDrive[]>()
  for (const f of fichiers) {
    if (dates(f) || estSynthese(f) || !['rayon', 'marketing', 'json'].includes(genre(f.nom).genre)) continue
    groupes.set(cle(f), [...(groupes.get(cle(f)) ?? []), f])
  }
  const places = new Map<string, string[]>()
  const sansDate: string[] = []
  let ouverts = 0
  for (const [k, groupe] of groupes) {
    // The .rayon.md first: it is the one imported when both exist.
    const tete = groupe.find((f) => genre(f.nom).genre === 'rayon') ?? groupe.find((f) => genre(f.nom).genre === 'json')
    const lieu = tete && ++ouverts <= MAX_SANS_DATE ? await dateDuFichier(tete) : null
    if (lieu) places.set(k, lieu)
    else sansDate.push(...groupe.map((f) => [...f.chemin, f.nom].join('/')))
  }
  return {
    fichiers: fichiers.flatMap((f) => (dates(f) || estSynthese(f) ? [f] : places.has(cle(f)) ? [{ ...f, chemin: places.get(cle(f))! }] : [])),
    sansDate,
  }
}

/** [date, category] written inside a report, or null. Keeps the text for the import. */
async function dateDuFichier(f: FichierDrive): Promise<string[] | null> {
  try {
    const texte = await telecharger(f.id)
    if (telecharges.size > 4 * MAX_SANS_DATE) telecharges.clear() // listed, never imported
    telecharges.set(f.id, texte)
    let date = ''
    let categorie = ''
    if (genre(f.nom).genre === 'rayon') {
      const fm = etudeLib.frontmatter(texte) ?? {}
      date = String(fm.date ?? '')
      categorie = fm.categorie ? etudeLib.slug(String(fm.categorie)) : ''
    } else {
      const s = (JSON.parse(texte) as { study?: { date?: string; category_id?: string; category_name?: string } }).study ?? {}
      date = String(s.date ?? '')
      categorie = s.category_id ? String(s.category_id) : s.category_name ? etudeLib.slug(String(s.category_name)) : ''
    }
    return DATE.test(date) && categorie ? [date, categorie] : null
  } catch {
    return null
  }
}

async function lireDossier(racine: string, dateVoulue?: (date: string) => boolean) {
  return journalise(dateVoulue ? 'importer' : 'lister', racine, async () => {
    const { fichiers, sansDate } = await daterSansDossier(await listerArbre(racine, dateVoulue))
    return { dates: regrouper(fichiers), sansDate, nbFichiers: fichiers.length }
  })
}

/**
 * The folder as the site sees it. Max (13/11): a reread shows only what is new, to tick and import;
 * days whose shelves and synthesis are all on the site are left out (`tout` shows them again).
 * A synthesis stored by an older reader is quietly read again from its files here, so it never
 * comes back as « new » just because the reader changed.
 */
export async function listerDossierDrive(adresse: string, tout = false) {
  const racine = idDossierDrive(adresse)
  const { dates, sansDate } = await lireDossier(racine)
  const enBase = idsRapportsEnService()
  const relues: BilanSynthese[] = []
  for (const d of dates) {
    const stockee = lireSynthese(d.date)
    if (!stockee || stockee.lecteur === LECTEUR_SYNTHESE || !(d.syntheses.json || d.syntheses.opportunites)) continue
    const b = await importerSyntheseDuJour(d, racine, false).catch(() => null)
    if (b) relues.push(b)
  }
  if (relues.length) noterImports(relues)
  const toutes = dates.map((d) => ({
    date: d.date,
    etudes: [
      ...d.etudes.map((e) => ({
        categorie: e.categorie,
        theme: e.theme,
        fichiers: [e.rayon, e.marketing, e.json].filter(Boolean).map((f) => f!.nom),
        doublons: e.doublons.map((f) => f.nom),
        importable: !!e.rayon || !!e.json,
        dejaEnBase: enBase.has(idRayonIndice(e)),
      })),
      ...(Object.keys(d.syntheses).length
        ? [
            {
              ...RAYON_SYNTHESE,
              fichiers: Object.values(d.syntheses).map((f) => f!.nom),
              doublons: [] as string[],
              importable: !!(d.syntheses.json || d.syntheses.opportunites),
              dejaEnBase: !!lireSynthese(d.date),
            },
          ]
        : []),
    ],
    ignores: d.ignores,
  }))
  const nouvelles = toutes
    .map((d) => ({ ...d, etudes: d.etudes.filter((x) => !(x.importable && x.dejaEnBase)) }))
    .filter((d) => d.etudes.some((x) => x.importable))
  return {
    dossier: racine,
    dates: tout ? toutes : nouvelles,
    /** Days left out because everything in them is already on the site. */
    datesDejaImportees: tout ? 0 : toutes.length - nouvelles.length,
    /** Syntheses read again because the reader changed (12/11: lists of the 09/11 format). */
    synthesesRelues: relues.map((b) => ({ date: b.date, statut: b.statut })),
    /** Report files with no date anywhere (no AAAA-MM-JJ folder, no date inside). */
    sansDate,
  }
}

// ------------------------------------------------------------------- import

export interface LigneRapport {
  date: string
  rayon: string
  statut: 'importe' | 'apercu' | 'doublon' | 'refuse'
  raison?: string
  produits?: number
  urlsDistinctes?: number
  avecPrix?: number
  avecScore?: number
  marketing?: boolean
  conforme?: boolean
  /** Products whose address is a product page; the others point to a search or a home page. */
  fiches?: number
  /** Products with no source address at all. */
  sansAdresse?: number
  /** Same product twice in the file, removed at import. */
  doublonsRetires?: number
  /** The Drive file the line comes from, from the pasted folder. */
  fichier?: string
  /** Each point of `raison`, apart (incomplete, misfiled, replaced…). */
  notes?: string[]
}

/**
 * The contract of `verifier-rapports.cjs`, the part a study can be checked
 * against on its own: 20 products, 20 distinct addresses, prices on 18.
 */
function conforme(e: { produits: number; urlsDistinctes: number; avecPrix: number }): boolean {
  return e.produits >= 20 && e.urlsDistinctes >= 20 && e.avecPrix >= 18
}

/**
 * Below this a report is refused, named, never published (Max, 08/11/2026 :
 * « incomplets », « d'autres sans source ») : a shelf of 20 that brings fewer
 * than 10 products, or not one address to check them against.
 */
export const SEUIL_IMPORT = { produits: 10, adresses: 1 }

/** How complete a study is, to keep the best of two versions of the same shelf and day. */
export function completude(e: { produits: number; urlsDistinctes: number; avecPrix: number; avecScore?: number; marketing?: boolean; fiches?: number }): number {
  return (conforme(e) ? 10_000 : 0) + e.urlsDistinctes * 40 + (e.fiches ?? 0) * 10 + e.avecPrix * 8 + (e.avecScore ?? 0) * 4 + e.produits * 2 + (e.marketing ? 1 : 0)
}

/** What a measured study lacks against the contract, in words, empty when nothing. */
export function manques(e: { produits: number; urlsDistinctes: number; avecPrix: number; marketing?: boolean; sansAdresse?: number; fiches?: number; doublonsRetires?: number }): string[] {
  const out: string[] = []
  if (e.produits < 20) out.push(`incomplet : ${e.produits} produits sur 20`)
  if (e.sansAdresse) out.push(`${e.sansAdresse} produit(s) sans adresse source`)
  const recherches = e.urlsDistinctes - Math.min(e.urlsDistinctes, e.fiches ?? e.urlsDistinctes)
  if (recherches > 0) out.push(`${recherches} adresse(s) de recherche ou d'accueil, pas de fiche produit`)
  if (e.produits - (e.sansAdresse ?? 0) > e.urlsDistinctes) out.push(`${e.produits - (e.sansAdresse ?? 0) - e.urlsDistinctes} adresse(s) reprise(s) pour plusieurs produits`)
  if (e.avecPrix < Math.min(18, e.produits)) out.push(`prix sur ${e.avecPrix} produit(s) seulement`)
  if (e.doublonsRetires) out.push(`${e.doublonsRetires} produit(s) en double retiré(s)`)
  if (e.marketing === false) out.push('sans volet marketing')
  return out
}

type Candidat = { fichier: FichierDrive; source: EtudeImportee; etude: any }

/** Opens one report file of a shelf (its .marketing.md with it) and reads it; a refusal is returned in words. */
async function lireCandidat(f: FichierDrive, marketing: FichierDrive | null, racine: string, jour: string, categorie: string): Promise<Candidat | string> {
  const origine = `drive:${racine}/${jour}/${categorie}/${f.nom}`
  let source: EtudeImportee
  try {
    if (genre(f.nom).genre === 'rayon') {
      const texteRayon = await telecharger(f.id)
      const texteMarketing = marketing ? await telecharger(marketing.id) : null
      source = { idRayon: '', format: 'markdown', origine, importeLe: new Date().toISOString(), texteRayon, texteMarketing }
    } else {
      const json = jsonTolerant(await telecharger(f.id))
      if (json === undefined) return 'JSON illisible'
      if (!(json as { study?: unknown })?.study) return 'JSON hors schéma aiMARKET (pas de bloc study) et pas de .rayon.md'
      source = { idRayon: '', format: 'aimarket', origine, importeLe: new Date().toISOString(), json }
    }
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  let etude: any
  try {
    etude = etudeDepuisSurcouche(source)
  } catch (err) {
    return `illisible (${err instanceof Error ? err.message : String(err)})`
  }
  if (!etude?.ok) return etude?.raison ?? 'illisible'
  source.idRayon = etude.idRayon
  return { fichier: f, source, etude }
}

export async function importerDossierDrive(adresse: string, dates: string[], essai: boolean) {
  const racine = idDossierDrive(adresse)
  const voulues = new Set(dates)
  const jours = (await lireDossier(racine, (d) => voulues.has(d))).dates.filter((d) => voulues.has(d.date))
  if (!jours.length) throw new DriveErreur('Aucune des dates choisies dans ce dossier.')

  const enBase = rayonsEnService()
  const surcouche = new Map(lireSurcouche().map((e) => [e.idRayon, e]))
  /** Kept for import, by RAYON id: the best version met in this folder so far. */
  const retenues = new Map<string, { c: Candidat; ligne: LigneRapport }>()
  const lignes: LigneRapport[] = []
  const ignores: { date: string; nom: string; raison: string }[] = []
  const chemin = (f: FichierDrive) => [...f.chemin, f.nom].join('/')

  const syntheses: BilanSynthese[] = []
  for (const jour of jours) {
    const bilanS = await importerSyntheseDuJour(jour, racine, essai)
    if (bilanS) {
      syntheses.push(bilanS)
      lignes.push({
        date: jour.date,
        rayon: `${RAYON_SYNTHESE.categorie}/${RAYON_SYNTHESE.theme}`,
        statut: bilanS.statut,
        raison: bilanS.raison,
        produits: bilanS.produits,
      })
    }
    for (const i of jour.ignores) ignores.push({ date: jour.date, ...i })
    for (const t of jour.etudes) {
      const nomRayon = `${t.categorie}/${t.theme}`
      // Every report file of the shelf that day — the .rayon.md first, an aiMARKET .json only without one —
      // and the most complete is kept, not the first listed (three « 2026-11-02 » folders seen on 08/11/2026).
      const rayons = [t.rayon, ...t.doublons].filter((f): f is FichierDrive => !!f && genre(f.nom).genre === 'rayon')
      const jsons = [t.json, ...t.doublons].filter((f): f is FichierDrive => !!f && genre(f.nom).genre === 'json')
      const fichiers = rayons.length ? rayons : jsons
      if (rayons.length) for (const j of jsons) ignores.push({ date: jour.date, nom: chemin(j), raison: 'le .rayon.md du même rayon est importé à sa place' })
      for (const m of t.doublons.filter((f) => genre(f.nom).genre === 'marketing')) {
        ignores.push({ date: jour.date, nom: chemin(m), raison: 'second volet marketing pour le même rayon ce jour-là : le premier est gardé' })
      }
      if (!fichiers.length) {
        lignes.push({ date: jour.date, rayon: nomRayon, statut: 'refuse', raison: 'marketing seul, sans .rayon.md', fichier: t.marketing ? chemin(t.marketing) : undefined })
        continue
      }
      const lus: Candidat[] = []
      for (const f of fichiers) {
        const c = await lireCandidat(f, t.marketing, racine, jour.date, t.categorie)
        if (typeof c === 'string') lignes.push({ date: jour.date, rayon: nomRayon, statut: 'refuse', raison: c, fichier: chemin(f) })
        else lus.push(c)
      }
      lus.sort((a, b) => completude(b.etude) - completude(a.etude))
      for (const c of lus) {
        const e = c.etude
        const rayon = `${e.categorie}/${e.theme}`
        const mesure = {
          produits: e.produits,
          urlsDistinctes: e.urlsDistinctes,
          avecPrix: e.avecPrix,
          avecScore: e.avecScore,
          marketing: e.marketing,
          conforme: conforme(e),
          fiches: e.fiches,
          sansAdresse: e.sansAdresse,
          doublonsRetires: e.doublonsRetires,
          fichier: chemin(c.fichier),
        }
        const ligne = (statut: LigneRapport['statut'], notes: string[]): LigneRapport => ({
          date: e.date,
          rayon,
          statut,
          ...mesure,
          notes,
          raison: notes.join(' · ') || undefined,
        })
        const notes = manques(e)
        // Misfiled: the header says where the report belongs, the folder only hints.
        if (t.categorie && e.categorie !== etudeLib.slug(t.categorie)) notes.unshift(`rangé dans le dossier « ${t.categorie} », l'en-tête dit « ${e.categorie} » : classé sous ${e.categorie}`)
        if (e.date !== jour.date) notes.unshift(`rangé dans le dossier du ${jour.date}, l'en-tête dit ${e.date} : classé au ${e.date}`)

        if (e.produits < SEUIL_IMPORT.produits || e.urlsDistinctes < SEUIL_IMPORT.adresses) {
          const motif = e.urlsDistinctes < SEUIL_IMPORT.adresses ? 'aucune adresse source : rien ne permet de vérifier ces produits' : `${e.produits} produits seulement (au moins ${SEUIL_IMPORT.produits} attendus)`
          lignes.push(ligne('refuse', [`sous le seuil d'import : ${motif}`, ...notes]))
          continue
        }
        const deja = retenues.get(e.idRayon)
        if (deja) {
          if (completude(e) > completude(deja.c.etude)) {
            // A fuller copy met later in the folder takes the place of the one kept so far.
            deja.ligne.statut = 'doublon'
            deja.ligne.notes = [`une version plus complète du même rayon est gardée (${chemin(c.fichier)})`, ...(deja.ligne.notes ?? [])]
            deja.ligne.raison = deja.ligne.notes.join(' · ')
          } else {
            lignes.push(ligne('doublon', [`même rayon, même jour que ${deja.ligne.fichier} : la version la plus complète est gardée`, ...notes]))
            continue
          }
        }
        const enService = enBase.get(e.idRayon)
        if (enService && !enService.importDrive) {
          lignes.push(ligne('doublon', ['déjà en ligne, écrit par nos agents : le leur est gardé', ...notes]))
          continue
        }
        if (enService) {
          const ancienne = surcouche.get(e.idRayon)
          let avant: any = null
          try {
            avant = ancienne ? etudeDepuisSurcouche(ancienne) : null
          } catch {
            avant = null
          }
          if (avant?.ok && completude(avant) >= completude(e)) {
            lignes.push(ligne('doublon', [`déjà importé, aussi complet ou plus (${avant.produits} produits, ${avant.urlsDistinctes} adresses) : rien n'est changé`, ...notes]))
            continue
          }
          notes.unshift(avant?.ok ? `remplace la version déjà en ligne, moins complète (${avant.produits} produits, ${avant.urlsDistinctes} adresses)` : 'remplace la version déjà en ligne')
        }
        // Another theme of the same shelf the same day: shown, the shelf may well be studied twice.
        const autres = [...enBase.entries(), ...[...retenues.values()].map((r) => [r.c.etude.idRayon, r.c.etude] as const)]
          .filter(([id, x]) => id !== e.idRayon && x.date === e.date && x.categorie === e.categorie)
          .map(([, x]) => x.theme)
        if (autres.length) notes.push(`le rayon ${e.categorie} a déjà ce jour-là : ${[...new Set(autres)].join(', ')}`)
        const l = ligne(essai ? 'apercu' : 'importe', notes)
        lignes.push(l)
        retenues.set(e.idRayon, { c, ligne: l })
      }
    }
  }

  const nouvelles = [...retenues.values()].map((r) => r.c.source)
  if (!essai) noterImports(syntheses)
  const bilan = essai ? null : ajouterEtudesImportees(nouvelles)
  const gardees = lignes.filter((l) => l.statut === 'importe' || l.statut === 'apercu')
  const somme = (k: 'doublonsRetires' | 'sansAdresse') => gardees.reduce((a, l) => a + (l[k] ?? 0), 0)
  const resultat = {
    essai,
    importees: essai ? 0 : nouvelles.length + syntheses.filter((x) => x.statut === 'importe').length,
    aImporter: nouvelles.length,
    remplacees: gardees.filter((l) => l.notes?.some((n) => n.startsWith('remplace'))).length,
    doublons: lignes.filter((l) => l.statut === 'doublon').length,
    refusees: lignes.filter((l) => l.statut === 'refuse').length,
    conformes: gardees.filter((l) => l.conforme).length,
    incompletes: gardees.filter((l) => !l.conforme).length,
    malRangees: gardees.filter((l) => l.notes?.some((n) => n.startsWith('rangé'))).length,
    produitsEnDoubleRetires: somme('doublonsRetires'),
    produitsSansAdresse: somme('sansAdresse'),
    rapportsEnBase: bilan?.reports ?? null,
    syntheses,
    // Most useful first: refused, then incomplete, then the rest, each by date and shelf.
    lignes: lignes.sort((a, b) => ordre(a) - ordre(b) || b.date.localeCompare(a.date) || a.rayon.localeCompare(b.rayon)),
    ignores,
  }
  return { ...resultat, resume: resumeImport(resultat) }
}

function ordre(l: LigneRapport): number {
  if (l.statut === 'refuse') return 0
  if ((l.statut === 'importe' || l.statut === 'apercu') && !l.conforme) return 1
  if (l.statut === 'importe' || l.statut === 'apercu') return 2
  return 3
}

/** The import in a few sentences, what the screen shows above the table. */
export function resumeImport(r: {
  essai: boolean
  aImporter: number
  remplacees: number
  doublons: number
  refusees: number
  conformes: number
  incompletes: number
  malRangees: number
  produitsEnDoubleRetires: number
  produitsSansAdresse: number
}): string[] {
  const out = [
    `${r.aImporter} rapport(s) ${r.essai ? 'à importer' : 'importé(s)'} : ${r.conformes} conforme(s) au contrat (20 produits, 20 adresses, prix sur 18), ${r.incompletes} incomplet(s).`,
  ]
  if (r.remplacees) out.push(`${r.remplacees} remplace(nt) une version déjà en ligne moins complète.`)
  if (r.doublons) out.push(`${r.doublons} doublon(s) écarté(s) : pour un même rayon et un même jour, seule la version la plus complète est gardée.`)
  if (r.refusees) out.push(`${r.refusees} refusé(s), motif donné ligne par ligne.`)
  if (r.malRangees) out.push(`${r.malRangees} mal rangé(s) dans le Drive, classé(s) d'après leur en-tête.`)
  if (r.produitsEnDoubleRetires) out.push(`${r.produitsEnDoubleRetires} produit(s) en double retiré(s) dans les rapports gardés.`)
  if (r.produitsSansAdresse) out.push(`${r.produitsSansAdresse} produit(s) sans adresse source : gardés, champ laissé vide (jamais inventé).`)
  return out
}

/** The day's synthesis, JSON first, the Markdown tables as a fallback. Null when the day has none. */
async function importerSyntheseDuJour(jour: DateTrouvee, racine: string, essai: boolean): Promise<BilanSynthese | null> {
  const s = jour.syntheses
  if (!s.json && !s.opportunites) return Object.keys(s).length ? { date: jour.date, statut: 'refuse', raison: 'ni opportunites-import-dropshipper.json ni opportunites-prioritaires.md' } : null
  const motifs: string[] = []
  const lire = async (f?: FichierDrive) => {
    if (!f) return null
    try {
      return await telecharger(f.id)
    } catch (err) {
      motifs.push(`${f.nom} : ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }
  let json: unknown
  const brut = await lire(s.json)
  if (brut) {
    json = jsonTolerant(brut)
    if (json === undefined) motifs.push(`${s.json!.nom} : JSON illisible (début : « ${brut.trim().slice(0, 60)} »)`)
  }
  // The Markdown tables complete the JSON: since the 09/11 the top 5, breakout and blacklist are only there.
  const opportunitesMd = await lire(s.opportunites)
  const generaleMd = await lire(s.generale)
  const tableauMd = generaleMd ? null : await lire(s.tableau)
  const principal = s.json ?? s.opportunites!
  const bilan = importerSynthese(
    { date: jour.date, origine: `drive:${racine}/${[...principal.chemin, principal.nom].join('/')}`, json, opportunitesMd, generaleMd, tableauMd },
    essai,
  )
  if (bilan.statut === 'refuse' && motifs.length) bilan.raison = `${bilan.raison} — ${motifs.join(' ; ')}`
  return bilan
}

/** JSON as an agent may write it: inside a ```json fence, or after a sentence. */
export function jsonTolerant(brut: string): unknown {
  const essais = [brut, brut.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], brut.slice(brut.indexOf('{'), brut.lastIndexOf('}') + 1)]
  for (const t of essais) {
    if (!t?.trim()) continue
    try {
      return JSON.parse(t)
    } catch {
      /* next */
    }
  }
  return undefined
}
