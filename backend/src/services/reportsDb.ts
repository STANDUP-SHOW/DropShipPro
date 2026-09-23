/**
 * Access to daily reports from rapports.db
 * Queries market analyses, products, AI prompts, and social media data
 */

import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { categorieDe, type CategorieAgent, type ProduitRapport } from './marketReports.js'

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

  /**
   * Les produits d'un rayon — ou de TOUS les rayons quand aucun n'est nommé.
   *
   * La catégorie était obligatoire, et la page « Produits gagnants » veut la
   * récolte du matin tous rayons confondus : elle appelait donc sans catégorie
   * et recevait « category parameter required » à la place de ses lignes.
   *
   * Sans catégorie ET sans date, on rend le DERNIER JOUR DÉPOSÉ, pas la date
   * du jour selon l'horloge : à 8 h la machine est déjà demain pour des agents
   * qui n'ont pas encore écrit, et la page serait vide alors que la base est
   * pleine. La forme de la réponse est la même dans les deux cas.
   */
  getProductsByCategory(category?: string, options: QueryOptions = {}) {
    let query = `
      SELECT
        rr.report_id,
        r.categorie,
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
      WHERE 1 = 1
    `

    const params: any[] = []

    if (category) {
      query += ' AND r.categorie = ?'
      params.push(category)
    }

    const date = options.date ?? (category ? undefined : this.getDerniereDate() ?? undefined)
    if (date) {
      query += ' AND r.date = ?'
      params.push(date)
    }

    query += ' ORDER BY r.date DESC, r.categorie ASC, p.title ASC'

    if (options.limit) {
      query += ` LIMIT ${options.limit}`
    }

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]
    return rows.map(row => ({
      date: row.date,
      category: row.categorie,
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


  /*
   * ---------------------------------------------------------------------------
   * Le contrat des écrans — les cinq pages de dépôt lisent CES formes-ci
   * ---------------------------------------------------------------------------
   *
   * Tout ce qui précède rend les lignes SQL à plat, une par ligne de table.
   * Les écrans, eux, ont un contrat plus ancien et plus riche : un objet avec
   * une clé nommée (`rapports`, `analyses`, `produits`, `prompts`), chaque
   * entrée portant sa provenance — le rapport, le jour, le rayon, le thème, et
   * leurs noms lisibles. Il vivait derrière `/api/market-reports` (table
   * Prisma) ; le 19/09 les écrans ont été rebranchés sur ces routes-ci, qui
   * rendaient un TABLEAU NU. `d.analyses`, `d.produits`, `d.prompts` valaient
   * alors `undefined`, et le premier `.length` faisait tomber la page.
   *
   * Les formes sont donc reconstituées ICI, au-dessus de rapports.db, plutôt
   * que dans six écrans : une seule écriture du contrat, et les écrans n'ont
   * pas à savoir d'où vient la donnée.
   */

  /** Le premier nombre d'un champ texte : « 12-18 € » vaut 12, « — » ne vaut rien. */
  private static nombre(brut: unknown): number | null {
    const m = /-?\d+(?:[.,]\d+)?/.exec(String(brut ?? '').replace(/\s/g, ''))
    if (!m) return null
    const n = Number(m[0].replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  private static nomCategorie(id: string): string {
    return categorieDe(id)?.nom ?? id
  }

  private static nomTheme(categorie: string, theme: string, blob?: any): string {
    const cat: CategorieAgent | null = categorieDe(categorie)
    return cat?.themes.find((t) => t.id === theme)?.nom ?? blob?.study?.theme_name ?? theme
  }

  /** Le blob `data` d'un rapport, ou `null` — un JSON illisible ne doit rien casser. */
  private static blob(brut: unknown): any {
    try {
      const v = JSON.parse(String(brut ?? 'null'))
      return v && typeof v === 'object' ? v : null
    } catch {
      return null
    }
  }

  private static liste(brut: unknown): any[] {
    try {
      const v = JSON.parse(String(brut ?? '[]'))
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }

  /** L'accroche : la phrase qui résume, tirée du blob quand il en porte une. */
  private static accrocheDe(blob: any): string | null {
    const t =
      blob?.executive_summary?.main_opportunity ??
      blob?.market?.current_trends?.[0] ??
      blob?.accroche ??
      null
    return typeof t === 'string' && t.trim() ? t.trim() : null
  }

  /** Une section Markdown, ou rien du tout si elle n'a pas de contenu. */
  private static section(titre: string, lignes: unknown): string {
    const items = Array.isArray(lignes) ? lignes.filter((l) => typeof l === 'string' && l.trim()) : []
    if (!items.length) return ''
    return `## ${titre}\n${items.map((l) => `- ${l}`).join('\n')}\n`
  }

  /**
   * Le corps d'un rapport, en Markdown à sections `##`.
   *
   * L'écran découpe sur les `##` (`blocsDe`) et met chaque section en case ;
   * le bloc dont le titre contient « produits » devient la liste importable,
   * d'où la section « Produits » posée explicitement pour les rapports rayon.
   */
  private static corps(row: any, analyse: string | null, nbProduits: number): string {
    const blob = ReportQuery.blob(row.data)
    const parts: string[] = []
    const accroche = ReportQuery.accrocheDe(blob)
    if (accroche) parts.push(`${accroche}\n`)

    const redige = Boolean(analyse && analyse.trim())
    if (redige) parts.push(/^##\s/m.test(analyse!) ? `${analyse!.trim()}\n` : `## Analyse\n${analyse!.trim()}\n`)

    /*
     * Les sections tirées du blob ne servent qu'à ce qui n'a PAS d'analyse
     * rédigée — les rapports marketing, et les rapports rayon d'avant
     * l'importeur. Les ajouter par-dessus une analyse qui porte déjà ses
     * titres `##` afficherait deux fois les mêmes tendances.
     */
    if (!/^##\s/m.test(analyse ?? '')) {
      parts.push(ReportQuery.section('Tendances du jour', blob?.market?.current_trends))
      parts.push(ReportQuery.section('Tendances émergentes', blob?.market?.emerging_trends))
      parts.push(ReportQuery.section('Publicités en vogue', blob?.alerts?.breakout_products))
      parts.push(ReportQuery.section('Idées de vente', blob?.business_ideas))
    }

    if (nbProduits > 0) {
      parts.push(`## Produits\nLes ${nbProduits} produits relevés par l'agent, prêts à importer.\n`)
    }

    const texte = parts.filter(Boolean).join('\n').trim()
    return texte || `## Analyse\n${row.titre ?? ''}`
  }

  /** Les lignes de la table `products` d'un rapport rayon, au format de l'écran. */
  private produitsDe(reportId: string): ProduitRapport[] {
    const rows = this.db
      .prepare(
        `SELECT p.title, p.supplier, p.supplier_url, p.recommended_url, p.buy_price,
                p.sell_price, p.margin, p.import_method, p.reason
           FROM products p
           JOIN rayon_reports rr ON rr.id = p.rayon_report_id
          WHERE rr.report_id = ?
          ORDER BY p.rowid ASC`,
      )
      .all(reportId) as any[]

    return rows.map((p, i) => ({
      rang: i + 1,
      titre: String(p.title ?? ''),
      fournisseur: String(p.supplier ?? ''),
      url: String(p.supplier_url || p.recommended_url || ''),
      prixAchat: ReportQuery.nombre(p.buy_price),
      prixVente: ReportQuery.nombre(p.sell_price),
      margePct: ReportQuery.nombre(p.margin),
      import: (['api', 'url', 'extension'] as const).includes(p.import_method)
        ? (p.import_method as 'api' | 'url' | 'extension')
        : 'extension',
      pourquoi: String(p.reason ?? ''),
    }))
  }

  /** Le jour le plus récent DÉPOSÉ — jamais l'heure de la machine, qui peut devancer les agents. */
  getDerniereDate(categorie?: string): string | null {
    const row = categorie
      ? (this.db.prepare('SELECT MAX(date) d FROM reports WHERE categorie = ?').get(categorie) as any)
      : (this.db.prepare('SELECT MAX(date) d FROM reports').get() as any)
    return row?.d ? String(row.d) : null
  }

  /** Les rayons qui ont vraiment reçu quelque chose, pour le sélecteur de Fresh news. */
  getCategoriesFraiches() {
    const rows = this.db
      .prepare('SELECT categorie, theme, MAX(date) AS dernier FROM reports GROUP BY categorie, theme')
      .all() as any[]

    const par = new Map<string, { themes: Map<string, string>; dernier: string; themeDuJour: string }>()
    for (const r of rows) {
      const id = String(r.categorie)
      const entree = par.get(id) ?? { themes: new Map(), dernier: '', themeDuJour: String(r.theme) }
      entree.themes.set(String(r.theme), ReportQuery.nomTheme(id, String(r.theme)))
      if (String(r.dernier) > entree.dernier) {
        entree.dernier = String(r.dernier)
        entree.themeDuJour = String(r.theme)
      }
      par.set(id, entree)
    }

    return [...par.entries()]
      .map(([id, e]) => ({
        id,
        nom: ReportQuery.nomCategorie(id),
        themes: [...e.themes].map(([tid, nom]) => ({ id: tid, nom })),
        themeDuJour: e.themeDuJour,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }

  /** Fresh news : les rapports d'UN rayon pour UN jour, corps compris. */
  getFresh(categorie: string, jour?: string) {
    const disponibles = (
      this.db
        .prepare('SELECT DISTINCT date FROM reports WHERE categorie = ? ORDER BY date DESC LIMIT 15')
        .all(categorie) as any[]
    ).map((r) => String(r.date))

    const choisi = jour ?? disponibles[0] ?? null
    const rows = choisi
      ? (this.db
          .prepare('SELECT * FROM reports WHERE categorie = ? AND date = ? ORDER BY type DESC')
          .all(categorie, choisi) as any[])
      : []

    const cat = categorieDe(categorie)
    return {
      categorie: { id: categorie, nom: ReportQuery.nomCategorie(categorie) },
      jour: choisi ?? undefined,
      // « Aujourd'hui » est le dernier jour DÉPOSÉ : à 8 h la machine est déjà
      // demain pour les agents, et la pilule pointait alors une page vide.
      aujourdhui: disponibles[0],
      hier: disponibles[1],
      disponibles,
      rapports: rows.map((row) => {
        const produits = row.type === 'rayon' ? this.produitsDe(row.id) : []
        const analyse =
          row.type === 'rayon'
            ? ((this.db.prepare('SELECT analysis FROM rayon_reports WHERE report_id = ?').get(row.id) as any)
                ?.analysis ?? null)
            : null
        const blob = ReportQuery.blob(row.data)
        return {
          id: String(row.id),
          type: row.type as 'rayon' | 'marketing',
          theme: {
            id: String(row.theme),
            nom: cat?.themes.find((t) => t.id === row.theme)?.nom ?? blob?.study?.theme_name ?? String(row.theme),
          },
          titre: String(row.titre ?? ''),
          accroche: ReportQuery.accrocheDe(blob),
          sources: Number(row.sources ?? 0),
          body: ReportQuery.corps(row, analyse, produits.length),
          produits,
        }
      }),
    }
  }

  /** La liste des analyses, en-têtes seulement : le corps se demande au dépliage. */
  getAnalyses(options: { type?: 'rayon' | 'marketing'; categorie?: string; jour?: string; limite?: number } = {}) {
    const where: string[] = []
    const params: any[] = []
    if (options.type) {
      where.push('type = ?')
      params.push(options.type)
    }
    if (options.categorie) {
      where.push('categorie = ?')
      params.push(options.categorie)
    }
    if (options.jour) {
      where.push('date = ?')
      params.push(options.jour)
    }

    const rows = this.db
      .prepare(
        `SELECT id, date, type, categorie, theme, titre, sources, data FROM reports
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY date DESC, categorie ASC
         LIMIT ?`,
      )
      .all(...params, Math.min(Math.max(options.limite ?? 60, 1), 200)) as any[]

    const compte = new Map(
      (
        this.db
          .prepare(
            `SELECT rr.report_id AS id, COUNT(p.id) AS n
               FROM rayon_reports rr LEFT JOIN products p ON p.rayon_report_id = rr.id
              GROUP BY rr.report_id`,
          )
          .all() as any[]
      ).map((r) => [String(r.id), Number(r.n)]),
    )

    const presentes = (
      this.db.prepare('SELECT DISTINCT categorie FROM reports ORDER BY categorie').all() as any[]
    ).map((r) => String(r.categorie))

    return {
      rayonSansCategorie: false,
      categories: presentes.map((id) => ({ id, nom: ReportQuery.nomCategorie(id) })),
      analyses: rows.map((row) => {
        const blob = ReportQuery.blob(row.data)
        return {
          id: String(row.id),
          day: String(row.date),
          type: row.type as 'rayon' | 'marketing',
          categorie: String(row.categorie),
          categorieNom: ReportQuery.nomCategorie(String(row.categorie)),
          theme: String(row.theme),
          themeNom: ReportQuery.nomTheme(String(row.categorie), String(row.theme), blob),
          titre: String(row.titre ?? ''),
          accroche: ReportQuery.accrocheDe(blob),
          sources: Number(row.sources ?? 0),
          produits: compte.get(String(row.id)) ?? 0,
        }
      }),
    }
  }

  /** Une analyse, corps compris — ce que le dépliage d'une ligne demande. */
  getAnalyse(id: string) {
    const row = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as any
    if (!row) return null

    const produits = row.type === 'rayon' ? this.produitsDe(row.id) : []
    const analyse =
      row.type === 'rayon'
        ? ((this.db.prepare('SELECT analysis FROM rayon_reports WHERE report_id = ?').get(row.id) as any)?.analysis ??
          null)
        : null
    const blob = ReportQuery.blob(row.data)

    return {
      id: String(row.id),
      day: String(row.date),
      type: row.type as 'rayon' | 'marketing',
      categorie: String(row.categorie),
      categorieNom: ReportQuery.nomCategorie(String(row.categorie)),
      theme: String(row.theme),
      themeNom: ReportQuery.nomTheme(String(row.categorie), String(row.theme), blob),
      titre: String(row.titre ?? ''),
      accroche: ReportQuery.accrocheDe(blob),
      sources: Number(row.sources ?? 0),
      body: ReportQuery.corps(row, analyse, produits.length),
      produits,
    }
  }

  /**
   * Les produits gagnants à plat, chaque ligne gardant sa provenance.
   *
   * Sans rayon demandé, c'est TOUT le dépôt : la page « Produits gagnants »
   * veut la récolte du matin tous rayons confondus, et exiger une catégorie
   * lui répondait « category parameter required » au lieu de ses 162 lignes.
   */
  getGagnants(options: { categorie?: string; jour?: string; limite?: number } = {}) {
    const where: string[] = ["r.type = 'rayon'"]
    const params: any[] = []
    if (options.categorie) {
      where.push('r.categorie = ?')
      params.push(options.categorie)
    }
    if (options.jour) {
      where.push('r.date = ?')
      params.push(options.jour)
    }

    const rows = this.db
      .prepare(
        `SELECT r.id AS rapportId, r.date, r.categorie, r.theme, r.data,
                p.title, p.supplier, p.supplier_url, p.recommended_url,
                p.buy_price, p.sell_price, p.margin, p.import_method, p.reason
           FROM products p
           JOIN rayon_reports rr ON rr.id = p.rayon_report_id
           JOIN reports r ON r.id = rr.report_id
          WHERE ${where.join(' AND ')}
          ORDER BY r.date DESC, r.categorie ASC, p.rowid ASC
          LIMIT ?`,
      )
      .all(...params, Math.min(Math.max(options.limite ?? 500, 1), 2000)) as any[]

    const jours = (
      this.db
        .prepare(
          `SELECT DISTINCT r.date FROM reports r
             JOIN rayon_reports rr ON rr.report_id = r.id
             JOIN products p ON p.rayon_report_id = rr.id
            ${options.categorie ? 'WHERE r.categorie = ?' : ''}
            ORDER BY r.date DESC`,
        )
        .all(...(options.categorie ? [options.categorie] : [])) as any[]
    ).map((r) => String(r.date))

    return {
      rayonSansCategorie: false,
      jours,
      produits: rows.map((row, i) => ({
        rang: i + 1,
        titre: String(row.title ?? ''),
        fournisseur: String(row.supplier ?? ''),
        url: String(row.supplier_url || row.recommended_url || ''),
        prixAchat: ReportQuery.nombre(row.buy_price),
        prixVente: ReportQuery.nombre(row.sell_price),
        margePct: ReportQuery.nombre(row.margin),
        import: (['api', 'url', 'extension'] as const).includes(row.import_method)
          ? (row.import_method as 'api' | 'url' | 'extension')
          : 'extension',
        pourquoi: String(row.reason ?? ''),
        rapportId: String(row.rapportId),
        day: String(row.date),
        categorie: String(row.categorie),
        categorieNom: ReportQuery.nomCategorie(String(row.categorie)),
        theme: String(row.theme),
        themeNom: ReportQuery.nomTheme(String(row.categorie), String(row.theme), ReportQuery.blob(row.data)),
      })),
    }
  }

  /**
   * Les prompts publicitaires, un par entrée, jamais un objet brut.
   *
   * Les agents déposent tantôt une chaîne, tantôt un objet — prompt d'image
   * (`prompt`) ou script de vidéo (`script`, découpé en plans). L'écran, lui,
   * affiche `texte` : un objet posé là rendrait React inconsolable
   * (« Objects are not valid as a React child »).
   */
  getPromptsRapports(options: { categorie?: string; jour?: string; limite?: number } = {}) {
    const where: string[] = ["r.type = 'marketing'"]
    const params: any[] = []
    if (options.categorie) {
      where.push('r.categorie = ?')
      params.push(options.categorie)
    }
    if (options.jour) {
      where.push('r.date = ?')
      params.push(options.jour)
    }

    const rows = this.db
      .prepare(
        `SELECT r.id, r.date, r.categorie, r.theme, r.titre, r.data,
                m.image_prompts, m.video_prompts
           FROM marketing_reports m
           JOIN reports r ON r.id = m.report_id
          WHERE ${where.join(' AND ')}
          ORDER BY r.date DESC, r.categorie ASC
          LIMIT ?`,
      )
      .all(...params, Math.min(Math.max(options.limite ?? 40, 1), 200)) as any[]

    /** Ce qu'on colle dans un générateur : toujours une chaîne, sinon rien. */
    const texteDe = (entree: any): { texte: string; format: string | null } => {
      if (typeof entree === 'string') return { texte: entree.trim(), format: null }
      if (!entree || typeof entree !== 'object') return { texte: '', format: null }
      const format =
        [entree.format, entree.platform].filter((v) => typeof v === 'string' && v.trim()).join(' — ') || null
      if (typeof entree.prompt === 'string') return { texte: entree.prompt.trim(), format }
      if (entree.script && typeof entree.script === 'object') {
        const texte = Object.entries(entree.script as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string' && String(v).trim())
          .map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v}`)
          .join('\n')
        return { texte, format }
      }
      if (typeof entree.texte === 'string') return { texte: entree.texte.trim(), format }
      return { texte: '', format }
    }

    const prompts: any[] = []
    for (const row of rows) {
      const blob = ReportQuery.blob(row.data)
      const meta = {
        rapportId: String(row.id),
        day: String(row.date),
        categorie: String(row.categorie),
        categorieNom: ReportQuery.nomCategorie(String(row.categorie)),
        theme: String(row.theme),
        themeNom: ReportQuery.nomTheme(String(row.categorie), String(row.theme), blob),
        titre: String(row.titre ?? ''),
      }
      for (const [genre, brut] of [
        ['image', row.image_prompts],
        ['video', row.video_prompts],
      ] as const) {
        ReportQuery.liste(brut).forEach((entree, i) => {
          const { texte, format } = texteDe(entree)
          if (!texte) return
          prompts.push({ id: `${row.id}-${genre}-${i}`, genre, format, texte, ...meta })
        })
      }
    }

    const jours = (
      this.db
        .prepare(
          `SELECT DISTINCT r.date FROM reports r
             JOIN marketing_reports m ON m.report_id = r.id
            ${options.categorie ? 'WHERE r.categorie = ?' : ''}
            ORDER BY r.date DESC`,
        )
        .all(...(options.categorie ? [options.categorie] : [])) as any[]
    ).map((r) => String(r.date))

    return { rayonSansCategorie: false, jours, prompts }
  }

  /**
   * Tous les rapports, allégés, pour le sitemap et les archives publiques
   * (/analyses/). Sans limite : 48 rapports par jour, un sitemap qui en
   * oublierait ferait disparaître des pages déjà indexées.
   */
  getPourSitemap() {
    return (
      this.db
        .prepare('SELECT id, date, type, categorie, theme, titre, updated_at, created_at FROM reports ORDER BY date DESC, categorie ASC')
        .all() as any[]
    ).map((row) => ({
      id: String(row.id),
      day: String(row.date),
      type: row.type as 'rayon' | 'marketing',
      categorie: String(row.categorie),
      theme: String(row.theme),
      titre: String(row.titre ?? ''),
      updatedAt: new Date(row.updated_at ?? row.created_at ?? `${row.date}T06:00:00Z`),
    }))
  }

  close() {
    this.db.close()
  }
}
