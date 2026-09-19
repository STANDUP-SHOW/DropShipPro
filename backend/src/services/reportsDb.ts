/**
 * Access to daily reports from rapports.db
 * Queries market analyses, products, AI prompts, and social media data
 */

import Database from 'better-sqlite3'

interface QueryOptions {
  format?: 'json' | 'table' | 'summary'
  limit?: number
  category?: string
  date?: string
  type?: 'marketing' | 'rayon'
}

export class ReportQuery {
  private db: Database.Database

  constructor(dbPath: string = 'rapports.db') {
    this.db = new Database(dbPath)
  }

  // Get all reports
  getAllReports(options: QueryOptions = {}) {
    let query = 'SELECT data FROM reports'
    const params: any[] = []

    const where: string[] = []
    if (options.category) {
      where.push('categorie = ?')
      params.push(options.category)
    }
    if (options.date) {
      where.push('date = ?')
      params.push(options.date)
    }
    if (options.type) {
      where.push('type = ?')
      params.push(options.type)
    }

    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ')
    }

    query += ' ORDER BY date DESC'

    if (options.limit) {
      query += ` LIMIT ${options.limit}`
    }

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]
    return rows.map(row => JSON.parse(row.data))
  }

  // Get marketing trends
  getMarketingTrends(options: QueryOptions = {}) {
    let query = `
      SELECT
        r.categorie,
        r.theme,
        r.titre,
        r.date,
        m.trends_daily,
        m.trending_ads
      FROM reports r
      JOIN marketing_reports m ON r.id = m.report_id
      WHERE r.type = 'marketing'
    `

    const params: any[] = []

    if (options.category) {
      query += ' AND r.categorie = ?'
      params.push(options.category)
    }
    if (options.date) {
      query += ' AND r.date = ?'
      params.push(options.date)
    }

    query += ' ORDER BY r.date DESC'

    if (options.limit) {
      query += ` LIMIT ${options.limit}`
    }

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]
    return rows.map(row => ({
      category: row.categorie,
      theme: row.theme,
      title: row.titre,
      date: row.date,
      dailyTrends: JSON.parse(row.trends_daily),
      advertisingTrends: JSON.parse(row.trending_ads)
    }))
  }

  // Get products by category
  getProductsByCategory(category: string, options: QueryOptions = {}) {
    let query = `
      SELECT
        rr.report_id,
        r.date,
        r.theme,
        p.title,
        p.supplier,
        p.buy_price,
        p.sell_price,
        p.margin,
        p.reason
      FROM rayon_reports rr
      JOIN reports r ON r.id = rr.report_id
      JOIN products p ON p.rayon_report_id = rr.id
      WHERE r.categorie = ?
    `

    const params: any[] = [category]

    if (options.date) {
      query += ' AND r.date = ?'
      params.push(options.date)
    }

    query += ' ORDER BY r.date DESC, p.title ASC'

    if (options.limit) {
      query += ` LIMIT ${options.limit}`
    }

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]
    return rows.map(row => ({
      date: row.date,
      theme: row.theme,
      product: row.title,
      supplier: row.supplier,
      buyPrice: row.buy_price,
      sellPrice: row.sell_price,
      margin: row.margin,
      reason: row.reason
    }))
  }

  // Get AI prompts (for image and video generation)
  getAIPrompts(category?: string, type?: 'image' | 'video') {
    let query = `
      SELECT
        r.categorie,
        r.theme,
        r.date,
        m.image_prompts,
        m.video_prompts
      FROM marketing_reports m
      JOIN reports r ON r.id = m.report_id
      WHERE r.type = 'marketing'
    `

    const params: any[] = []

    if (category) {
      query += ' AND r.categorie = ?'
      params.push(category)
    }

    query += ' ORDER BY r.date DESC'

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]

    const prompts: any[] = []
    for (const row of rows) {
      const images = JSON.parse(row.image_prompts)
      const videos = JSON.parse(row.video_prompts)

      if (!type || type === 'image') {
        prompts.push(...images.map((prompt: string) => ({
          type: 'image',
          category: row.categorie,
          theme: row.theme,
          date: row.date,
          prompt
        })))
      }

      if (!type || type === 'video') {
        prompts.push(...videos.map((prompt: string) => ({
          type: 'video',
          category: row.categorie,
          theme: row.theme,
          date: row.date,
          prompt
        })))
      }
    }

    return prompts
  }

  // Get social media analysis
  getSocialMediaAnalysis(category?: string, date?: string) {
    let query = `
      SELECT
        r.categorie,
        r.theme,
        r.date,
        m.social_places
      FROM marketing_reports m
      JOIN reports r ON r.id = m.report_id
      WHERE r.type = 'marketing'
    `

    const params: any[] = []

    if (category) {
      query += ' AND r.categorie = ?'
      params.push(category)
    }
    if (date) {
      query += ' AND r.date = ?'
      params.push(date)
    }

    query += ' ORDER BY r.date DESC'

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]

    return rows.map(row => ({
      category: row.categorie,
      theme: row.theme,
      date: row.date,
      platforms: JSON.parse(row.social_places)
    }))
  }

  // Get report statistics
  getStatistics() {
    const totalReports = this.db.prepare('SELECT COUNT(*) as count FROM reports').get() as any
    const byType = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM reports GROUP BY type
    `).all() as any[]
    const byDate = this.db.prepare(`
      SELECT date, COUNT(*) as count FROM reports GROUP BY date ORDER BY date DESC
    `).all() as any[]
    const byCategory = this.db.prepare(`
      SELECT categorie, COUNT(*) as count FROM reports GROUP BY categorie ORDER BY count DESC
    `).all() as any[]
    const totalProducts = this.db.prepare('SELECT COUNT(*) as count FROM products').get() as any

    return {
      totalReports: totalReports.count,
      byType: Object.fromEntries(byType.map(t => [t.type, t.count])),
      byDate: Object.fromEntries(byDate.map(d => [d.date, d.count])),
      byCategory: Object.fromEntries(byCategory.map(c => [c.categorie, c.count])),
      totalProducts: totalProducts.count
    }
  }

  // Get categories
  getCategories() {
    const stmt = this.db.prepare('SELECT DISTINCT categorie FROM reports ORDER BY categorie')
    const rows = stmt.all() as any[]
    return rows.map(r => r.categorie)
  }

  // Get dates
  getDates() {
    const stmt = this.db.prepare('SELECT DISTINCT date FROM reports ORDER BY date DESC')
    const rows = stmt.all() as any[]
    return rows.map(r => r.date)
  }

  close() {
    this.db.close()
  }
}
