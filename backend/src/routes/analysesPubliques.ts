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
import { Router, type Response } from 'express'
import { ReportQuery } from '../services/reportsDb.js'
import { categorieDe } from '../services/marketReports.js'
import {
  attribuerAdresses,
  cheminArticleDate,
  cheminCategorie,
  cheminRapport,
  pageCategorie,
  pageIndex,
  pageJour,
  pageRapport,
  rapportA,
  sitemapXml,
  type RapportPublic,
} from '../services/analysesPubliques.js'

export const analysesPubliquesRouter = Router()

const CACHE = 'public, max-age=3600, stale-while-revalidate=86400'
const JOUR = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9-]{1,60}$/

let base: ReportQuery | null = null
function rapports(): ReportQuery {
  if (!base) base = new ReportQuery()
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
 * déploiement (Max pousse l'import sur main) : une fois par processus suffit.
 */
let memo: Ligne[] | null = null
export function lignesPubliques(): Ligne[] {
  if (memo) return memo
  const tous = rapports()
    .getPourSitemap()
    .filter(adressable)
    .map((l) => ({ ...l, titre: l.une ?? l.titre }))
  attribuerAdresses(tous)
  memo = tous
  return tous
}

function versPublic(id: string): RapportPublic | null {
  const r = rapports().getAnalyse(id)
  if (!r || !adressable(r)) return null
  const prompts =
    r.type === 'marketing'
      ? rapports()
          .getPromptsRapports({ categorie: r.categorie, jour: r.day, limite: 200 })
          .prompts.filter((p) => p.rapportId === id)
          .map((p) => ({ genre: p.genre, format: p.format, texte: p.texte }))
      : []
  const maj = lignesPubliques().find((l) => l.id === id)?.updatedAt ?? new Date(`${r.day}T06:00:00Z`)
  return { ...r, titre: r.une ?? r.titre, prompts, updatedAt: maj }
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
