/**
 * Access to daily reports from rapports.db
 * Queries market analyses, products, AI prompts, and social media data
 */

import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where rapports.db lives, resolved from THIS module, never from the cwd.
 *
 * `new Database('rapports.db')` resolves against `process.cwd()`, and
 * better-sqlite3 CREATES an empty file when it finds nothing. A server started
 * from anywhere but the backend root therefore opened a blank database and
 * answered 500 « no such table: reports » on every report route, while
 * /api/health kept answering 200 — a site that looks alive and shows no data.
 *
 * `../..` lands on the backend root from both src/services (tsx, dev) and
 * dist/services (compiled, Railway).
 */
const RACINE_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CHEMIN_RAPPORTS_DB = path.join(RACINE_BACKEND, 'rapports.db')

interface QueryOptions {
  format?: 'json' | 'table' | 'summary'
  limit?: number
  category?: string
  date?: string
  type?: 'marketing' | 'rayon'
}

export class ReportQuery {
  private db: Database.Database

  /**
   * `fileMustExist` is the point: a missing base must FAIL, never be invented.
   * Read-only because every method here is a SELECT — nothing writes.
   */
  constructor(dbPath: string = CHEMIN_RAPPORTS_DB) {
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true })
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

  /**
   * Per-section item counts, bucketed by report date.
   *
   * The menu badges need one number per section, but "unread" is decided by the
   * browser (it holds the last-seen date per section in localStorage), not here.
   * Returning a total would force one request per section with a `since`
   * parameter; returning the buckets lets the client sum whatever is newer than
   * what it has already seen — five badges out of a single call, and the answer
   * is identical for everyone, so it caches.
   *
   * Sections mirror the menu entries exactly: Fresh news reads every report,
   * « Analyses de marché » the `rayon` ones, « Analyses réseaux » the
   * `marketing` ones, « Produits gagnants » the products and « Prompts IA » the
   * image and video prompts.
   */
  getCountsByDate() {
    const parJour = (rows: any[]) =>
      rows.map((row) => ({ jour: String(row.date), nombre: Number(row.count) }))

    const rapports = this.db
      .prepare('SELECT date, COUNT(*) as count FROM reports GROUP BY date ORDER BY date DESC')
      .all() as any[]
    const parType = (type: 'rayon' | 'marketing') =>
      this.db
        .prepare('SELECT date, COUNT(*) as count FROM reports WHERE type = ? GROUP BY date ORDER BY date DESC')
        .all(type) as any[]

    const produits = this.db
      .prepare(`
        SELECT r.date, COUNT(*) as count
        FROM products p
        JOIN rayon_reports rr ON rr.id = p.rayon_report_id
        JOIN reports r ON r.id = rr.report_id
        GROUP BY r.date
        ORDER BY r.date DESC
      `)
      .all() as any[]

    /*
     * Prompts are JSON arrays inside marketing_reports, so they are counted
     * here rather than in SQL: sixteen rows, and a hand-rolled json_array_length
     * would break the day a report ships a malformed array.
     */
    const lignesPrompts = this.db
      .prepare(`
        SELECT r.date, m.image_prompts, m.video_prompts
        FROM marketing_reports m
        JOIN reports r ON r.id = m.report_id
      `)
      .all() as any[]
    const promptsParJour = new Map<string, number>()
    for (const ligne of lignesPrompts) {
      const compte = (brut: unknown) => {
        try {
          const liste = JSON.parse(String(brut ?? '[]'))
          return Array.isArray(liste) ? liste.length : 0
        } catch {
          return 0
        }
      }
      const jour = String(ligne.date)
      promptsParJour.set(jour, (promptsParJour.get(jour) ?? 0) + compte(ligne.image_prompts) + compte(ligne.video_prompts))
    }

    return {
      'fresh-news': parJour(rapports),
      analyses: parJour(parType('rayon')),
      'reseaux-analyses': parJour(parType('marketing')),
      gagnants: parJour(produits),
      'reseaux-prompts': [...promptsParJour.entries()]
        .map(([jour, nombre]) => ({ jour, nombre }))
        .sort((a, b) => (a.jour < b.jour ? 1 : -1)),
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
