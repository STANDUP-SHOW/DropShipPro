/**
 * The daily syntheses (services/synthesesQuotidiennes.ts), asked by Max on
 * 04/11/2026 to feed several Fresh Market News a day and the animated blocks.
 *
 * - GET /api/syntheses              dates + the latest day, public face
 * - GET /api/syntheses/:date        one day, public face (no buying price, supplier, margin, ROI, BUY NOW)
 * - GET /api/syntheses/:date/complete  one day, everything — signed-in sellers only
 *
 * Always an object, never a bare array (the screens read keys), never cached
 * at the Vercel edge.
 */
import { Router, type RequestHandler } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { datesSyntheses, lireJournal, lireSynthese, synthesePrivee, synthesePublique } from '../services/synthesesQuotidiennes.js'

export const synthesesPublicRouter = Router()

const sansCache: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

synthesesPublicRouter.get('/syntheses', sansCache, (_req, res) => {
  try {
    const dates = datesSyntheses()
    const s = dates[0] ? lireSynthese(dates[0]) : null
    res.json({ dates, derniere: s ? synthesePublique(s) : null })
  } catch (err) {
    console.error('[syntheses] liste', err)
    res.status(500).json({ error: 'Synthèses illisibles.', motif: err instanceof Error ? err.message : String(err) })
  }
})

/** What the last imports did, refusals and their reasons included (no file content). */
synthesesPublicRouter.get('/syntheses-etat', sansCache, (_req, res) => {
  res.json({ dates: datesSyntheses(), imports: lireJournal().map((l) => ({ ...l, raison: l.raison.replace(/\(début : «[^»]*»\)/g, '').trim() })) })
})

synthesesPublicRouter.get('/syntheses/:date', sansCache, (req, res) => {
  const date = String(req.params.date)
  if (!DATE.test(date)) return res.status(400).json({ error: 'Date attendue : AAAA-MM-JJ.' })
  try {
    const s = lireSynthese(date)
    if (!s) return res.status(404).json({ error: 'Aucune synthèse pour ce jour.' })
    res.json(synthesePublique(s))
  } catch (err) {
    console.error('[syntheses] jour', err)
    res.status(500).json({ error: 'Synthèse illisible.', motif: err instanceof Error ? err.message : String(err) })
  }
})

synthesesPublicRouter.get('/syntheses/:date/complete', sansCache, requireAuth, (req, res) => {
  const date = String(req.params.date)
  if (!DATE.test(date)) return res.status(400).json({ error: 'Date attendue : AAAA-MM-JJ.' })
  try {
    const s = lireSynthese(date)
    if (!s) return res.status(404).json({ error: 'Aucune synthèse pour ce jour.' })
    res.json(synthesePrivee(s))
  } catch (err) {
    console.error('[syntheses] jour complet', err)
    res.status(500).json({ error: 'Synthèse illisible.', motif: err instanceof Error ? err.message : String(err) })
  }
})
