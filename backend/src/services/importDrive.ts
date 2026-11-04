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
import {
  ajouterEtudesImportees,
  etudeDepuisSurcouche,
  idsRapportsEnService,
  type EtudeImportee,
} from './reportsDb.js'
import { importerSynthese, lireSynthese, roleSynthese, type BilanSynthese, type RoleSynthese } from './synthesesQuotidiennes.js'

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

async function listerUnDossier(id: string): Promise<{ nom: string; entrees: EntreeDrive[] }> {
  const r = await obtenir(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`)
  if (r.status === 404) throw new DriveErreur("Dossier introuvable : vérifiez l'adresse.")
  if (!r.ok) throw new DriveErreur(`Google Drive a répondu ${r.status} sur la liste du dossier.`)
  const html = await r.text()
  if (/accounts\.google\.com\/(ServiceLogin|signin)/.test(html) && !html.includes('flip-entry')) {
    throw new DriveErreur("Ce dossier n'est pas public : partagez-le en « Tous les utilisateurs disposant du lien ».")
  }
  return { nom: nomDossierVue(html), entrees: lireVueEmbarquee(html) }
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
 */
export async function listerArbre(racine: string): Promise<FichierDrive[]> {
  const fichiers: FichierDrive[] = []
  const file: { id: string; chemin: string[] | null }[] = [{ id: racine, chemin: null }]
  let dossiers = 0
  while (file.length) {
    const d = file.shift()!
    if (++dossiers > MAX_DOSSIERS) throw new DriveErreur(`Plus de ${MAX_DOSSIERS} dossiers : donnez un sous-dossier plus précis.`)
    const { nom, entrees } = await listerUnDossier(d.id)
    d.chemin ??= nom ? [nom] : []
    for (const e of entrees) {
      if (e.dossier) file.push({ id: e.id, chemin: [...d.chemin, e.nom] })
      else fichiers.push({ id: e.id, nom: e.nom, chemin: d.chemin })
      if (fichiers.length > MAX_FICHIERS) throw new DriveErreur(`Plus de ${MAX_FICHIERS} fichiers : donnez un sous-dossier plus précis.`)
    }
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
  if (!r.ok) throw new DriveErreur(`téléchargement refusé (${r.status})`)
  const texte = await r.text()
  if (/^\s*<!doctype html|^\s*<html/i.test(texte)) throw new DriveErreur('Google a renvoyé une page au lieu du fichier')
  return texte.replace(/^﻿/, '')
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

async function lireDossier(racine: string) {
  const { fichiers, sansDate } = await daterSansDossier(await listerArbre(racine))
  return { dates: regrouper(fichiers), sansDate }
}

export async function listerDossierDrive(adresse: string) {
  const racine = idDossierDrive(adresse)
  const { dates, sansDate } = await lireDossier(racine)
  const enBase = idsRapportsEnService()
  return {
    dossier: racine,
    dates: dates.map((d) => ({
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
    })),
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
}

/**
 * The contract of `verifier-rapports.cjs`, the part a study can be checked
 * against on its own: 20 products, 20 distinct addresses, prices on 18.
 */
function conforme(e: { produits: number; urlsDistinctes: number; avecPrix: number }): boolean {
  return e.produits >= 20 && e.urlsDistinctes >= 20 && e.avecPrix >= 18
}

export async function importerDossierDrive(adresse: string, dates: string[], essai: boolean) {
  const racine = idDossierDrive(adresse)
  const voulues = new Set(dates)
  const jours = (await lireDossier(racine)).dates.filter((d) => voulues.has(d.date))
  if (!jours.length) throw new DriveErreur('Aucune des dates choisies dans ce dossier.')

  const enBase = idsRapportsEnService()
  const vues = new Set<string>()
  const lignes: LigneRapport[] = []
  const nouvelles: EtudeImportee[] = []
  const ignores: { date: string; nom: string; raison: string }[] = []

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
      for (const d of t.doublons) {
        ignores.push({ date: jour.date, nom: `${t.categorie}/${d.nom}`, raison: 'second fichier pour le même rayon ce jour-là : le premier est gardé' })
      }
      let source: EtudeImportee | null = null
      try {
        if (t.rayon) {
          const texteRayon = await telecharger(t.rayon.id)
          const texteMarketing = t.marketing ? await telecharger(t.marketing.id) : null
          source = {
            idRayon: '',
            format: 'markdown',
            origine: `drive:${racine}/${jour.date}/${t.categorie}/${t.rayon.nom}`,
            importeLe: new Date().toISOString(),
            texteRayon,
            texteMarketing,
          }
          if (t.json) ignores.push({ date: jour.date, nom: `${t.categorie}/${t.json.nom}`, raison: 'le .rayon.md du même rayon est importé à sa place' })
        } else if (t.json) {
          let json: unknown
          try {
            json = JSON.parse(await telecharger(t.json.id))
          } catch (err) {
            if (err instanceof DriveErreur) throw err
            throw new DriveErreur('JSON illisible')
          }
          if (!(json as { study?: unknown })?.study) {
            lignes.push({ date: jour.date, rayon: nomRayon, statut: 'refuse', raison: "JSON hors schéma aiMARKET (pas de bloc study) et pas de .rayon.md" })
            continue
          }
          source = { idRayon: '', format: 'aimarket', origine: `drive:${racine}/${jour.date}/${t.categorie}/${t.json.nom}`, importeLe: new Date().toISOString(), json }
        } else {
          lignes.push({ date: jour.date, rayon: nomRayon, statut: 'refuse', raison: 'marketing seul, sans .rayon.md' })
          continue
        }
      } catch (err) {
        lignes.push({ date: jour.date, rayon: nomRayon, statut: 'refuse', raison: err instanceof Error ? err.message : String(err) })
        continue
      }

      const etude = etudeDepuisSurcouche(source)
      if (!etude?.ok) {
        lignes.push({ date: jour.date, rayon: nomRayon, statut: 'refuse', raison: etude?.raison ?? 'illisible' })
        continue
      }
      source.idRayon = etude.idRayon
      const mesure = {
        produits: etude.produits,
        urlsDistinctes: etude.urlsDistinctes,
        avecPrix: etude.avecPrix,
        avecScore: etude.avecScore,
        marketing: etude.marketing,
        conforme: conforme(etude),
      }
      const rayon = `${etude.categorie}/${etude.theme}`
      if (enBase.has(etude.idRayon)) {
        lignes.push({ date: etude.date, rayon, statut: 'doublon', raison: 'déjà en base : la nôtre est gardée', ...mesure })
        continue
      }
      if (vues.has(etude.idRayon)) {
        lignes.push({ date: etude.date, rayon, statut: 'doublon', raison: 'deux fois dans ce dossier : la première est gardée', ...mesure })
        continue
      }
      vues.add(etude.idRayon)
      nouvelles.push(source)
      lignes.push({ date: etude.date, rayon, statut: essai ? 'apercu' : 'importe', ...mesure })
    }
  }

  const bilan = essai ? null : ajouterEtudesImportees(nouvelles)
  return {
    essai,
    importees: essai ? 0 : nouvelles.length + syntheses.filter((x) => x.statut === 'importe').length,
    aImporter: nouvelles.length,
    doublons: lignes.filter((l) => l.statut === 'doublon').length,
    refusees: lignes.filter((l) => l.statut === 'refuse').length,
    conformes: lignes.filter((l) => (l.statut === 'importe' || l.statut === 'apercu') && l.conforme).length,
    rapportsEnBase: bilan?.reports ?? null,
    syntheses,
    lignes,
    ignores,
  }
}

/** The day's synthesis, JSON first, the Markdown tables as a fallback. Null when the day has none. */
async function importerSyntheseDuJour(jour: DateTrouvee, racine: string, essai: boolean): Promise<BilanSynthese | null> {
  const s = jour.syntheses
  if (!s.json && !s.opportunites) return Object.keys(s).length ? { date: jour.date, statut: 'refuse', raison: 'ni opportunites-import-dropshipper.json ni opportunites-prioritaires.md' } : null
  const lire = async (f?: FichierDrive) => {
    if (!f) return null
    try {
      return await telecharger(f.id)
    } catch {
      return null
    }
  }
  let json: unknown
  const brut = await lire(s.json)
  if (brut) {
    try {
      json = JSON.parse(brut)
    } catch {
      json = undefined
    }
  }
  // The Markdown tables are only opened when the JSON is missing or unreadable.
  const opportunitesMd = json === undefined ? await lire(s.opportunites) : null
  const generaleMd = await lire(s.generale)
  const tableauMd = generaleMd ? null : await lire(s.tableau)
  const principal = s.json ?? s.opportunites!
  return importerSynthese(
    { date: jour.date, origine: `drive:${racine}/${[...principal.chemin, principal.nom].join('/')}`, json, opportunitesMd, generaleMd, tableauMd },
    essai,
  )
}
