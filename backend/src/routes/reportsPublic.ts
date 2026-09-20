/**
 * Public API endpoints for accessing daily reports
 * Provides market analyses, products, AI prompts, and social media data
 */

import { Router } from 'express'
import { CHEMIN_RAPPORTS_DB, ReportQuery } from '../services/reportsDb.js'

export const reportsPublicRouter = Router()

/**
 * The base is opened on FIRST USE, not at import.
 *
 * This router is imported by index.ts, so throwing here would take the whole
 * API down — every route, not just the reports. Opening lazily keeps the rest
 * of the server alive and lets /api/reports-health name the real reason.
 * The failure is not memoized: dropping the file in repairs the routes without
 * a restart.
 */
let baseOuverte: ReportQuery | null = null

function baseRapports(): ReportQuery {
  if (!baseOuverte) baseOuverte = new ReportQuery()
  return baseOuverte
}

/** A 500 that says nothing is what hid this outage for six hours. */
function motif(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}


/**
 * GET /reports/stats
 * Get database statistics
 */
reportsPublicRouter.get('/reports/stats', (_req, res) => {
  try {
    const stats = baseRapports().getStatistics()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics', motif: motif(error) })
  }
})

/**
 * GET /reports/nouveautes
 * Per-section item counts bucketed by day, for the menu notification badges.
 *
 * ONE call feeds the five badges. Sending a `since` per section would mean five
 * requests whose answers differ per visitor and cache nowhere; the buckets are
 * the same for everybody and the browser — which alone knows what its owner has
 * already opened — sums the days newer than its last-seen mark.
 *
 * Declared BEFORE `/reports` so the literal path is never read as a filter, and
 * it sits on this router (mounted at /api) ahead of the private reports router,
 * whose `/:id` would otherwise swallow it.
 */
reportsPublicRouter.get('/reports/nouveautes', (_req, res) => {
  try {
    res.json(baseRapports().getCountsByDate())
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch counts', motif: motif(error) })
  }
})

/**
 * GET /reports/categories
 * Get list of product categories
 */
reportsPublicRouter.get('/reports/categories', (_req, res) => {
  try {
    const categories = baseRapports().getCategories()
    res.json(categories)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories', motif: motif(error) })
  }
})

/**
 * GET /reports/dates
 * Get list of report dates
 */
reportsPublicRouter.get('/reports/dates', (_req, res) => {
  try {
    const dates = baseRapports().getDates()
    res.json(dates)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dates', motif: motif(error) })
  }
})

/**
 * GET /reports/liste
 * Les rapports bruts, tels qu'ils sont en base.
 *
 * **Cette route s'appelait `/reports` et elle masquait `/api/reports`.**
 * Ce routeur est monté sur `/api` AVANT le routeur privé des rapports
 * (`app.use('/api/reports', reportsRouter)`) : un `GET /api/reports` tombait
 * donc ici et recevait un tableau nu, alors que l'écran « Mes analyses »
 * attend `{ reports: [...] }`. Le nom explicite rend `/api/reports` à son
 * routeur, et cette vue brute reste accessible pour qui veut la donnée telle
 * quelle.
 *
 * Query params : limit, category, date, type (marketing|rayon)
 */
reportsPublicRouter.get('/reports/liste', (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '10')
    const category = (req.query.category as string) || undefined
    const date = (req.query.date as string) || undefined
    const type = (req.query.type as any) || undefined

    const reports = baseRapports().getAllReports({ limit, category, date, type })
    res.json({ count: reports.length, reports })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports', motif: motif(error) })
  }
})

/*
 * ---------------------------------------------------------------------------
 * Le contrat des cinq pages de dépôt
 * ---------------------------------------------------------------------------
 *
 * Fresh news, Analyses de marché, Produits gagnants et les deux vues de
 * Réseaux lisent des objets à clé nommée — `rapports`, `analyses`, `produits`,
 * `prompts` — chaque ligne portant sa provenance. Les routes brutes au-dessus
 * rendent des tableaux nus : branchées dessus le 19/09, les cinq pages ont lu
 * `d.analyses`, `d.produits`, `d.prompts` à `undefined` et sont tombées sur le
 * premier `.length`.
 *
 * Ces routes-ci rendent la forme attendue. Une page, une route, un nom : plus
 * d'URL qui doit deviner lequel de deux contrats on lui demande.
 */

/** Les rayons qui ont reçu quelque chose, et leur thème du jour. */
reportsPublicRouter.get('/reports/fresh-categories', (_req, res) => {
  try {
    res.json(baseRapports().getCategoriesFraiches())
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories', motif: motif(error) })
  }
})

/** Fresh news : les rapports d'un rayon pour un jour, corps compris. */
reportsPublicRouter.get('/reports/fresh', (req, res) => {
  try {
    const category = (req.query.category as string) || ''
    const date = (req.query.date as string) || undefined
    if (!category) {
      // Pas de rayon demandé : le premier qui a du contenu, plutôt qu'un 400
      // que l'écran afficherait en rouge au premier chargement.
      const premier = baseRapports().getCategoriesFraiches()[0]
      if (!premier) return res.json({ categorie: { id: '', nom: '' }, disponibles: [], rapports: [] })
      return res.json(baseRapports().getFresh(premier.id, date))
    }
    res.json(baseRapports().getFresh(category, date))
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports', motif: motif(error) })
  }
})

/** La liste des analyses, en-têtes seulement. */
reportsPublicRouter.get('/reports/analyses', (req, res) => {
  try {
    res.json(
      baseRapports().getAnalyses({
        type: (req.query.type as 'rayon' | 'marketing') || undefined,
        categorie: (req.query.category as string) || undefined,
        jour: (req.query.date as string) || undefined,
        limite: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    )
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analyses', motif: motif(error) })
  }
})

/** Une analyse, corps compris : ce que le dépliage d'une ligne demande. */
reportsPublicRouter.get('/reports/analyses/:id', (req, res) => {
  try {
    const analyse = baseRapports().getAnalyse(req.params.id)
    if (!analyse) return res.status(404).json({ error: 'Analyse introuvable.' })
    res.json(analyse)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analysis', motif: motif(error) })
  }
})

/** Les produits gagnants à plat — sans rayon demandé, tout le dépôt. */
reportsPublicRouter.get('/reports/gagnants', (req, res) => {
  try {
    res.json(
      baseRapports().getGagnants({
        categorie: (req.query.category as string) || undefined,
        jour: (req.query.date as string) || undefined,
        limite: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    )
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products', motif: motif(error) })
  }
})

/** Les prompts publicitaires, un par entrée, toujours en texte. */
reportsPublicRouter.get('/reports/prompts', (req, res) => {
  try {
    res.json(
      baseRapports().getPromptsRapports({
        categorie: (req.query.category as string) || undefined,
        jour: (req.query.date as string) || undefined,
        limite: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    )
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompts', motif: motif(error) })
  }
})

/**
 * GET /markets/trends
 * Get marketing trends by category
 * Query params:
 *   - category: filter by category (optional)
 *   - limit: number of results (default: 10)
 */
reportsPublicRouter.get('/markets/trends', (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '10')
    const category = (req.query.category as string) || undefined

    const trends = baseRapports().getMarketingTrends({ limit, category })
    res.json(trends)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trends', motif: motif(error) })
  }
})

/**
 * GET /markets/analysis
 * Get social media and market analysis
 * Query params:
 *   - category: filter by category (optional)
 *   - date: filter by date (optional)
 */
reportsPublicRouter.get('/markets/analysis', (req, res) => {
  try {
    const category = (req.query.category as string) || undefined
    const date = (req.query.date as string) || undefined

    const analysis = baseRapports().getSocialMediaAnalysis(category, date)
    res.json(analysis)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analysis', motif: motif(error) })
  }
})

/**
 * GET /products/by-category
 * Les produits gagnants d'un rayon, ou de TOUS les rayons.
 *
 * `category` était obligatoire et la page « Produits gagnants » n'en a pas à
 * donner : elle veut la récolte du matin, tous rayons confondus. Elle recevait
 * « category parameter required » et affichait « Aucun produit gagnant déposé »
 * au-dessus d'une base qui en contenait 162.
 *
 * Sans `category` ni `date`, c'est le DERNIER JOUR DÉPOSÉ — pas la date du
 * jour : les agents déposent le matin, et l'horloge de la machine est déjà
 * demain avant qu'ils aient écrit. La forme rendue est la même dans les deux
 * cas, pour que l'écran n'ait pas deux chemins.
 *
 * Query params : category (optionnel), date (optionnel), limit (optionnel)
 */
reportsPublicRouter.get('/products/by-category', (req, res) => {
  try {
    const category = (req.query.category as string) || undefined
    const date = (req.query.date as string) || undefined
    const limit = req.query.limit ? Number(req.query.limit) : undefined

    const products = baseRapports().getProductsByCategory(category, { date, limit })
    res.json({ count: products.length, category: category ?? null, date: date ?? null, products })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products', motif: motif(error) })
  }
})

/**
 * GET /prompts/all
 * Get all AI prompts (image and video generation)
 * Query params:
 *   - category: product category (optional)
 *   - type: prompt type: image or video (optional)
 */
reportsPublicRouter.get('/prompts/all', (req, res) => {
  try {
    const category = (req.query.category as string) || undefined
    const type = (req.query.type as any) || undefined

    const prompts = baseRapports().getAIPrompts(category, type)
    res.json(prompts)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompts', motif: motif(error) })
  }
})

/**
 * GET /prompts/images
 * Get AI image generation prompts
 * Query params:
 *   - category: product category (optional)
 */
reportsPublicRouter.get('/prompts/images', (req, res) => {
  try {
    const category = (req.query.category as string) || undefined

    const prompts = baseRapports().getAIPrompts(category, 'image')
    res.json(prompts)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch image prompts', motif: motif(error) })
  }
})

/**
 * GET /prompts/videos
 * Get AI video generation prompts
 * Query params:
 *   - category: product category (optional)
 */
reportsPublicRouter.get('/prompts/videos', (req, res) => {
  try {
    const category = (req.query.category as string) || undefined

    const prompts = baseRapports().getAIPrompts(category, 'video')
    res.json(prompts)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch video prompts', motif: motif(error) })
  }
})

/**
 * GET /reports-health
 * Health check endpoint for reports database
 */
reportsPublicRouter.get('/reports-health', (_req, res) => {
  try {
    const stats = baseRapports().getStatistics()
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      chemin: CHEMIN_RAPPORTS_DB,
      totalReports: stats.totalReports
    })
  } catch (error) {
    // The path is the diagnosis: it says WHERE the server looked and found nothing.
    res.status(500).json({
      error: 'Database connection failed',
      motif: motif(error),
      chemin: CHEMIN_RAPPORTS_DB
    })
  }
})
