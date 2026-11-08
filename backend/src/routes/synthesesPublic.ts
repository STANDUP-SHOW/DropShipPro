/**
 * The daily syntheses are NOT published (Max, 08/11/2026): they live in KANTIX,
 * admin back office (routes under /api/admin/syntheses). What stays public is
 * the import health only — dates, statuses and refusal reasons, no product,
 * no figure — the way /api/reports-health names a failure.
 */
import { Router } from 'express'
import { datesSyntheses, lireJournal } from '../services/synthesesQuotidiennes.js'

export const synthesesPublicRouter = Router()

synthesesPublicRouter.get('/syntheses-etat', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({
    dates: datesSyntheses(),
    imports: lireJournal().map((l) => ({ quand: l.quand, date: l.date, statut: l.statut, raison: l.raison.replace(/\(début : «[^»]*»\)/g, '').trim() })),
  })
})
