/**
 * Public API endpoints for accessing daily reports
 * Provides market analyses, products, AI prompts, and social media data
 */

import { Router } from 'express'
import { ReportQuery } from '../services/reportsDb.js'

export const reportsPublicRouter = Router()

// Initialize report query with rapports.db
const reportQuery = new ReportQuery('rapports.db')

interface ApiResponse {
  success: boolean
  data?: any
  error?: string
}

function sendResponse(res: any, statusCode: number, data: ApiResponse) {
  res.status(statusCode).json(data)
}

/**
 * GET /reports/stats
 * Get database statistics
 */
reportsPublicRouter.get('/reports/stats', (_req, res) => {
  try {
    const stats = reportQuery.getStatistics()
    sendResponse(res, 200, { success: true, data: stats })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch statistics' })
  }
})

/**
 * GET /reports/categories
 * Get list of product categories
 */
reportsPublicRouter.get('/reports/categories', (_req, res) => {
  try {
    const categories = reportQuery.getCategories()
    sendResponse(res, 200, { success: true, data: categories })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch categories' })
  }
})

/**
 * GET /reports/dates
 * Get list of report dates
 */
reportsPublicRouter.get('/reports/dates', (_req, res) => {
  try {
    const dates = reportQuery.getDates()
    sendResponse(res, 200, { success: true, data: dates })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch dates' })
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

    const reports = reportQuery.getAllReports({ limit, category, date, type })
    sendResponse(res, 200, { success: true, data: reports })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch reports' })
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

    const trends = reportQuery.getMarketingTrends({ limit, category })
    sendResponse(res, 200, { success: true, data: trends })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch trends' })
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

    const analysis = reportQuery.getSocialMediaAnalysis(category, date)
    sendResponse(res, 200, { success: true, data: analysis })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch analysis' })
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
      sendResponse(res, 400, { success: false, error: 'category parameter required' })
      return
    }

    const products = reportQuery.getProductsByCategory(category, { date })
    sendResponse(res, 200, { success: true, data: products })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch products' })
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

    const prompts = reportQuery.getAIPrompts(category, type)
    sendResponse(res, 200, { success: true, data: prompts })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch prompts' })
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

    const prompts = reportQuery.getAIPrompts(category, 'image')
    sendResponse(res, 200, { success: true, data: prompts })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch image prompts' })
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

    const prompts = reportQuery.getAIPrompts(category, 'video')
    sendResponse(res, 200, { success: true, data: prompts })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Failed to fetch video prompts' })
  }
})

/**
 * GET /reports-health
 * Health check endpoint for reports database
 */
reportsPublicRouter.get('/reports-health', (_req, res) => {
  try {
    const stats = reportQuery.getStatistics()
    sendResponse(res, 200, {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        totalReports: stats.totalReports
      }
    })
  } catch (error) {
    sendResponse(res, 500, { success: false, error: 'Database connection failed' })
  }
})
