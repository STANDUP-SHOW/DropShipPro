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
 * GET /reports
 * Get all reports with optional filtering
 * Query params:
 *   - limit: number of results (default: 10)
 *   - category: filter by category
 *   - date: filter by date (YYYY-MM-DD)
 *   - type: filter by type (marketing|rayon)
 */
reportsPublicRouter.get('/reports', (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '10')
    const category = (req.query.category as string) || undefined
    const date = (req.query.date as string) || undefined
    const type = (req.query.type as any) || undefined

    const reports = baseRapports().getAllReports({ limit, category, date, type })
    res.json(reports)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports', motif: motif(error) })
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
 * Get winning products by category
 * Query params:
 *   - category: product category (required)
 *   - date: report date (optional)
 */
reportsPublicRouter.get('/products/by-category', (req, res) => {
  try {
    const category = (req.query.category as string) || ''
    const date = (req.query.date as string) || undefined

    if (!category) {
      res.status(400).json({ error: 'category parameter required' })
      return
    }

    const products = baseRapports().getProductsByCategory(category, { date })
    res.json(products)
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
