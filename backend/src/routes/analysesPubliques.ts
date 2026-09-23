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
import { pageCategorie, pageIndex, pageRapport, sitemapXml, type RapportPublic } from '../services/analysesPubliques.js'

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
  const maj = rapports().getPourSitemap().find((l) => l.id === id)?.updatedAt ?? new Date(`${r.day}T06:00:00Z`)
  return { ...r, prompts, updatedAt: maj }
}

function html(res: Response, page: string) {
  res.type('html')
  res.set('Cache-Control', CACHE)
  res.send(page)
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
    res.send(sitemapXml(rapports().getPourSitemap().filter(adressable)))
  } catch (err) {
    panne(res, err)
  }
})

analysesPubliquesRouter.get('/', (_req, res) => {
  try {
    const tous = rapports().getPourSitemap().filter(adressable)
    const recents = tous.slice(0, 24).map((l) => versPublic(l.id)).filter((r): r is RapportPublic => r !== null)
    const comptes = new Map<string, number>()
    for (const l of tous) comptes.set(l.categorie, (comptes.get(l.categorie) ?? 0) + 1)
    html(res, pageIndex(recents, comptes))
  } catch (err) {
    panne(res, err)
  }
})

analysesPubliquesRouter.get('/:categorie/', (req, res) => {
  const { categorie } = req.params
  if (!SLUG.test(categorie)) return res.status(404).type('text').send('Catégorie inconnue.')
  try {
    const liste = rapports()
      .getPourSitemap()
      .filter((l) => l.categorie === categorie && adressable(l))
    if (!liste.length) return res.status(404).type('text').send('Aucune analyse pour cette catégorie.')
    const pages = liste.slice(0, 400).map((l) => versPublic(l.id)).filter((r): r is RapportPublic => r !== null)
    html(res, pageCategorie(categorie, pages))
  } catch (err) {
    panne(res, err)
  }
})

analysesPubliquesRouter.get(['/:categorie/:day/:theme/', '/:categorie/:day/:theme/marketing/'], (req, res) => {
  const { categorie, day, theme } = req.params
  const type = req.path.endsWith('/marketing/') ? 'marketing' : 'rayon'
  if (!SLUG.test(categorie) || !JOUR.test(day) || !SLUG.test(theme)) return res.status(404).type('text').send('Rapport introuvable.')
  try {
    const rapport = versPublic(`${type}-${day}-${categorie}-${theme}`)
    if (!rapport) return res.status(404).type('text').send('Rapport introuvable.')
    const autres = rapports()
      .getPourSitemap()
      .filter((l) => l.categorie === categorie && l.id !== rapport.id && adressable(l))
      .slice(0, 12)
      .map((l) => versPublic(l.id))
      .filter((r): r is RapportPublic => r !== null)
    html(res, pageRapport(rapport, autres))
  } catch (err) {
    panne(res, err)
  }
})
