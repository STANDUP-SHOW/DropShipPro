/**
 * /analyses/… — les rapports des agents en pages publiques, servies par l'API et
 * réécrites par Vercel sous www.drop-shipper.fr (vercel.json, comme /b/).
 *
 * La source est `rapports.db` (ReportQuery), la même que Fresh news, les
 * analyses, les gagnants et les prompts de l'application — pas la table Prisma
 * `MarketReport`, que plus rien ne lit depuis le 19/09/2026.
 *
 * Tout le rendu est dans `services/analysesPubliques.ts` (pur, éprouvé par
 * `check-analyses-publiques.ts`) ; ici seulement la lecture et les en-têtes.
 * Une page est mise en cache une heure : les rapports arrivent une fois par
 * jour, et un robot qui lit 500 pages ne doit pas faire 500 requêtes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Router, type Response } from 'express'
import { CHEMIN_SURCOUCHE, generationRapports, ReportQuery } from '../services/reportsDb.js'
import { categorieDe } from '../services/marketReports.js'
import {
  apostrophesDuTexte,
  apostrophesRendues,
  attribuerAdresses,
  renvoisRenumerotes,
  texteVisible,
  empreintePage,
  fixerDatesDesPages,
  produitsUniques,
  cheminArticleDate,
  cheminCategorie,
  cheminJour,
  cheminRapport,
  pageCategorie,
  pageIndex,
  pageJour,
  pageRapport,
  rapportA,
  rapportAncienneAdresse,
  datesPubliques,
  empreintePublique,
  rendusMigres,
  VERSION_RENDUS,
  texteRefait,
  type RendusConnus,
  sitemapXml,
  type RapportPublic,
} from '../services/analysesPubliques.js'

export const analysesPubliquesRouter = Router()

const CACHE = 'public, max-age=3600, stale-while-revalidate=86400'
const JOUR = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9-]{1,60}$/

let base: ReportQuery | null = null
let generationOuverte = -1
function rapports(): ReportQuery {
  // Un nouveau rapports.db déposé par l'importateur : on rouvre, et les adresses se recalculent.
  if (base && generationOuverte !== generationRapports()) {
    base.close()
    base = null
  }
  if (!base) {
    base = new ReportQuery()
    generationOuverte = generationRapports()
    memo = null
  }
  return base
}

/** Seules les lignes bien nommées ont une adresse : « téléphonie » ou « maison decoration » (fautes d'agent) n'en ont pas. */
function adressable(r: { categorie: string; theme: string; day: string }): boolean {
  return SLUG.test(r.categorie) && SLUG.test(r.theme) && JOUR.test(r.day)
}

type Ligne = ReturnType<ReportQuery['getPourSitemap']>[number]

/**
 * Toutes les lignes publiables, le titre du jour à la place du titre quand il
 * existe, et leurs adresses attribuées. rapports.db ne change qu'avec un
 * déploiement ou un dépôt de l'importateur : une fois par base ouverte suffit.
 */
let memo: Ligne[] | null = null
export function lignesPubliques(): Ligne[] {
  const q = rapports()
  if (memo) return memo
  const tous = q
    .getPourSitemap()
    .filter(adressable)
    .map((l) => ({ ...l, titre: l.une ?? l.titre }))
  attribuerAdresses(tous)
  const dates = datesDuRendu(tous)
  // Apostrophes restored after attribution: the address keeps the raw title.
  memo = tous.map((l) => ({ ...l, titre: apostrophesRendues(l.titre), updatedAt: dates.get(l.id) ?? l.updatedAt }))
  return memo
}

/** Kept on the volume, next to the Drive imports: it must outlive a redeploy to tell an unchanged page from a changed one. */
const CHEMIN_RENDUS = path.join(path.dirname(CHEMIN_SURCOUCHE), 'rendus-publics.json')

function datesDuRendu(tous: Ligne[]): Map<string, Date> {
  try {
    fixerDatesDesPages(new Map())
    const publics = new Map<string, RapportPublic>()
    const lignes = tous.flatMap((l) => {
      const r = versPublicBrut(l.id)
      if (!r) return []
      const pub = { ...r, titre: apostrophesRendues(l.titre) }
      publics.set(l.id, { ...pub, updatedAt: new Date(0) })
      return [{ id: l.id, updatedAt: l.updatedAt, texteRefait: texteRefait(r, l.importeDrive), empreinte: empreintePublique(pub) }]
    })
    let brut: unknown = null
    try {
      brut = JSON.parse(fs.readFileSync(CHEMIN_RENDUS, 'utf8'))
    } catch {
      // First run, or no volume: every report starts from its data date (rebuilt MARKETSPY texts aside).
    }
    const versionLue = brut && typeof brut === 'object' ? (brut as { version?: number }).version : undefined
    const connus: RendusConnus =
      versionLue === 4 ? depuisVersion4((brut as { rapports: RendusConnus }).rapports, tous, publics) : rendusMigres(brut, new Set(lignes.filter((l) => l.texteRefait).map((l) => l.id)))
    const migre = !(brut && typeof brut === 'object' && (brut as { version?: number }).version === VERSION_RENDUS)
    const deHub = (id: string) => id.startsWith('/')
    const garder = (hub: boolean) => Object.fromEntries(Object.entries(connus).filter(([id]) => deHub(id) === hub))
    const rapportsDates = datesPubliques(lignes, garder(false))
    // Editions and hubs: their own text, and never older than their newest report. A hub seen for the first
    // time is dated now: the store learns them with the change that retitled every list and grouped the products.
    const hubs = pagesDesHubs(tous, publics).map(({ chemin, html, membres }) => ({
      id: chemin,
      updatedAt: membres.reduce((d, id) => { const m = rapportsDates.dates.get(id); return m && m > d ? m : d }, new Date(0)),
      empreinte: empreintePage(html),
      texteRefait: true,
    }))
    const connusHubs = garder(true)
    // Carried over from version 4 without a fingerprint: adopt the visible one, keep the date.
    for (const h of hubs) if (connusHubs[h.id]?.empreinte === '') connusHubs[h.id] = { ...connusHubs[h.id], empreinte: h.empreinte }
    const hubsDates = datesPubliques(hubs, connusHubs)
    fixerDatesDesPages(hubsDates.dates)
    if (rapportsDates.change || hubsDates.change || migre) {
      fs.mkdirSync(path.dirname(CHEMIN_RENDUS), { recursive: true })
      fs.writeFileSync(CHEMIN_RENDUS, JSON.stringify({ version: VERSION_RENDUS, rapports: { ...rapportsDates.connus, ...hubsDates.connus } }))
    }
    return rapportsDates.dates
  } catch (err) {
    // A date that cannot follow the text must not take the pages down with it.
    console.error('[analyses publiques] dates du rendu', err instanceof Error ? err.message : err)
    return new Map()
  }
}

/**
 * Version 4 hashed the HTML: #83 changed the price format of the JSON-LD alone
 * and about fifty pages whose text had not moved were dated with its deploy
 * (12/10/2026 20:27:50Z). Each such page is re-rendered as before #83 (offers
 * not grouped, text as stored): if what a reader sees is the same, it gets its
 * earlier date back; pages that really changed keep the deploy's date. Every
 * entry moves to the visible-text fingerprint without being re-dated.
 */
const DEPLOIEMENT_83 = { de: Date.parse('2026-10-12T20:23:00Z'), a: Date.parse('2026-10-12T20:45:00Z') }
// #81 (20:13:40.800Z) restored the apostrophes of these titles: that date was theirs before #83.
const DATE_81 = '2026-10-12T20:13:40.800Z'
function depuisVersion4(anciens: RendusConnus, tous: Ligne[], publics: Map<string, RapportPublic>): RendusConnus {
  const out: RendusConnus = {}
  for (const [id, e] of Object.entries(anciens ?? {})) {
    if (!e || typeof e.empreinte !== 'string') continue
    if (id.startsWith('/')) {
      out[id] = { ...e, empreinte: '' }
      continue
    }
    const l = tous.find((x) => x.id === id)
    const pub = publics.get(id)
    if (!l || !pub) continue
    const maintenant = empreintePublique(pub)
    const le = Date.parse(e.le)
    if (le >= DEPLOIEMENT_83.de && le <= DEPLOIEMENT_83.a) {
      const brut = rapports().getAnalyse(id)
      if (brut) {
        const avant = pageRapport({ ...pub, body: brut.body, accroche: brut.accroche, extrait: brut.extrait, produits: brut.produits, prompts: pub.prompts.map((p, i) => ({ ...p, texte: promptBrut(id, i) ?? p.texte })) }, [])
        if (texteVisible(avant) === texteVisible(pageRapport(pub, []))) {
          const titreBrut = l.une ?? l.titre
          const date = apostrophesRendues(titreBrut) !== titreBrut ? DATE_81 : l.updatedAt.toISOString()
          out[id] = { empreinte: maintenant, le: date }
          continue
        }
      }
    }
    out[id] = { empreinte: maintenant, le: e.le }
  }
  return out
}

function promptBrut(id: string, i: number): string | null {
  const r = rapports().getAnalyse(id)
  if (!r || r.type !== 'marketing') return null
  const ps = rapports().getPromptsRapports({ categorie: r.categorie, jour: r.day, limite: 200 }).prompts.filter((p) => p.rapportId === id)
  return ps[i]?.texte ?? null
}

/** /analyses/, each edition and each category page, rendered as the routes below render them (dates aside). */
function pagesDesHubs(tous: Ligne[], publics: Map<string, RapportPublic>): Array<{ chemin: string; html: string; membres: string[] }> {
  const de = (ls: Ligne[]) => ls.map((l) => publics.get(l.id)).filter((r): r is RapportPublic => !!r)
  const jours = [...new Set(tous.map((l) => l.day))]
  const comptes = new Map<string, number>()
  for (const l of tous) comptes.set(l.categorie, (comptes.get(l.categorie) ?? 0) + 1)
  const out = [{ chemin: '/analyses/', html: pageIndex(de(tous.slice(0, 24)), comptes, jours), membres: tous.map((l) => l.id) }]
  jours.forEach((j, i) => {
    const ls = tous.filter((l) => l.day === j)
    out.push({ chemin: cheminJour(j), html: pageJour(j, de(ls), jours[i + 1], jours[i - 1]), membres: ls.map((l) => l.id) })
  })
  for (const c of comptes.keys()) {
    const ls = tous.filter((l) => l.categorie === c)
    out.push({ chemin: cheminCategorie(c), html: pageCategorie(c, de(ls.slice(0, 400))), membres: ls.map((l) => l.id) })
  }
  return out
}

function versPublic(id: string): RapportPublic | null {
  const r = versPublicBrut(id)
  if (!r) return null
  const maj = lignesPubliques().find((l) => l.id === id)?.updatedAt ?? r.updatedAt
  return { ...r, updatedAt: maj }
}

/** The report as the page shows it, dated by its data only. */
function versPublicBrut(id: string): RapportPublic | null {
  const r = rapports().getAnalyse(id)
  if (!r || !adressable(r)) return null
  const prompts =
    r.type === 'marketing'
      ? rapports()
          .getPromptsRapports({ categorie: r.categorie, jour: r.day, limite: 200 })
          .prompts.filter((p) => p.rapportId === id)
          .map((p) => ({ genre: p.genre, format: p.format, texte: apostrophesDuTexte(p.texte) }))
      : []
  // One row per product: the per-offer list (with suppliers) stays in the signed-in space.
  const produits = produitsUniques(r.produits).map((p, i) => ({ ...p, rang: i + 1 }))
  const texte = (t: string | null) => (t ? apostrophesDuTexte(t) : t)
  return { ...r, titre: apostrophesRendues(r.une ?? r.titre), body: renvoisRenumerotes(apostrophesDuTexte(r.body), r.produits), accroche: texte(r.accroche), extrait: texte(r.extrait), produits, prompts, updatedAt: new Date(`${r.day}T06:00:00Z`) }
}

function html(res: Response, page: string) {
  res.type('html')
  res.set('Cache-Control', CACHE)
  res.send(page)
}

function introuvable(res: Response, texte = 'Rapport introuvable.') {
  return res.status(404).type('text').send(texte)
}

function panne(res: Response, err: unknown) {
  // Un 500 muet est ce qui a caché six heures de panne sur /api/reports (19/09/2026).
  console.error('[analyses publiques]', err)
  res.status(503).type('text').send(`Analyses momentanément indisponibles : ${err instanceof Error ? err.message : String(err)}`)
}

// Sans barre finale : vers l'adresse canonique, avec barre (le sitemap excepté).
analysesPubliquesRouter.get(/^\/(?!sitemap\.xml$).+[^/]$/, (req, res) => res.redirect(301, `${req.baseUrl}${req.path}/`))

analysesPubliquesRouter.get('/sitemap.xml', (_req, res) => {
  try {
    res.type('application/xml')
    res.set('Cache-Control', CACHE)
    res.send(sitemapXml(lignesPubliques()))
  } catch (err) {
    panne(res, err)
  }
})

analysesPubliquesRouter.get('/', (_req, res) => {
  try {
    const tous = lignesPubliques()
    const recents = tous.slice(0, 24).map((l) => versPublic(l.id)).filter((r): r is RapportPublic => r !== null)
    const comptes = new Map<string, number>()
    for (const l of tous) comptes.set(l.categorie, (comptes.get(l.categorie) ?? 0) + 1)
    const jours = [...new Set(tous.map((l) => l.day))]
    html(res, pageIndex(recents, comptes, jours))
  } catch (err) {
    panne(res, err)
  }
})

analysesPubliquesRouter.get('/:categorie/', (req, res) => {
  const { categorie } = req.params
  try {
    const tous = lignesPubliques()
    // /analyses/2026-09-18/ : l'édition du jour, toutes catégories confondues.
    if (JOUR.test(categorie)) {
      const jours = [...new Set(tous.map((l) => l.day))]
      const i = jours.indexOf(categorie)
      if (i === -1) return introuvable(res, 'Aucune analyse publiée ce jour-là.')
      const pages = tous
        .filter((l) => l.day === categorie)
        .map((l) => versPublic(l.id))
        .filter((r): r is RapportPublic => r !== null)
      // jours est trié du plus récent au plus ancien : le suivant est avant, le précédent après.
      return html(res, pageJour(categorie, pages, jours[i + 1], jours[i - 1]))
    }
    if (!SLUG.test(categorie)) return introuvable(res, 'Catégorie inconnue.')
    const liste = tous.filter((l) => l.categorie === categorie)
    // Une catégorie connue mais encore vide répond une vraie page (noindex), pas un 404 :
    // /analyses/ la listait et l'audit du 03/10/2026 relevait onze liens cassés.
    if (!liste.length) {
      if (categorieDe(categorie)) return html(res, pageCategorie(categorie, []))
      // /analyses/<thème>/ : le premier segment d'une adresse de rapport. Il mène à sa catégorie.
      const duTheme = tous.find((l) => l.theme === categorie)
      if (duTheme) return res.redirect(301, cheminCategorie(duTheme.categorie))
      return introuvable(res, 'Catégorie inconnue.')
    }
    const pages = liste.slice(0, 400).map((l) => versPublic(l.id)).filter((r): r is RapportPublic => r !== null)
    html(res, pageCategorie(categorie, pages))
  } catch (err) {
    panne(res, err)
  }
})

// La toute première adresse, catégorie/date/thème : 301 vers l'adresse actuelle, pour ne perdre ni lien ni indexation.
analysesPubliquesRouter.get(['/:categorie/:day/:theme/', '/:categorie/:day/:theme/marketing/'], (req, res) => {
  const { categorie, day, theme } = req.params
  const type = req.path.endsWith('/marketing/') ? 'marketing' : 'rayon'
  if (!SLUG.test(categorie) || !JOUR.test(day) || !SLUG.test(theme)) return introuvable(res)
  try {
    const ligne = lignesPubliques().find((l) => l.id === `${type}-${day}-${categorie}-${theme}`)
    if (!ligne) return introuvable(res)
    res.redirect(301, cheminRapport(ligne))
  } catch (err) {
    panne(res, err)
  }
})

/** La forme de la PR #25 : « meilleurs-accessoires-…-2026-09-18 » ou « …-marketing-2026-09-18 ». */
const ARTICLE = /^([a-z0-9-]{1,90}?)(-marketing)?-(\d{4}-\d{2}-\d{2})$/

analysesPubliquesRouter.get('/:theme/:sujet/', (req, res) => {
  const { theme, sujet } = req.params
  if (!SLUG.test(theme) || !/^[a-z0-9-]{1,120}$/.test(sujet)) return introuvable(res)
  try {
    const tous = lignesPubliques()
    const demande = `${req.baseUrl}${req.path}`
    const id = rapportA(demande)
    if (!id) {
      // La forme catégorie/sujet-date (03/10/2026 au soir) : 301 vers l'adresse actuelle.
      const m = ARTICLE.exec(sujet)
      if (m) {
        const exact = tous.find((l) => cheminArticleDate(l) === demande)
        if (exact) return res.redirect(301, cheminRapport(exact))
        const memes = tous.filter((l) => l.categorie === theme && l.day === m[3] && l.type === (m[2] ? 'marketing' : 'rayon'))
        if (memes.length === 1) return res.redirect(301, cheminRapport(memes[0]))
      }
      // An imported study titled by its bare theme before 12/10/2026: 301 to its real title.
      const ancien = rapportAncienneAdresse(demande)
      const cible = ancien ? tous.find((l) => l.id === ancien) : null
      if (cible) return res.redirect(301, cheminRapport(cible))
      // Titre retouché depuis (réimport, titre du jour ajouté) : seul rapport de ce thème, on y mène.
      const duTheme = tous.filter((l) => l.theme === theme)
      if (duTheme.length === 1) return res.redirect(301, cheminRapport(duTheme[0]))
      return introuvable(res)
    }
    const rapport = versPublic(id)
    if (!rapport) return introuvable(res)
    const autres = tous
      .filter((l) => l.categorie === rapport.categorie && l.id !== rapport.id)
      .slice(0, 12)
      .map((l) => versPublic(l.id))
      .filter((r): r is RapportPublic => r !== null)
    html(res, pageRapport(rapport, autres))
  } catch (err) {
    panne(res, err)
  }
})
