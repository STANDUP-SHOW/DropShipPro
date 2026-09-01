import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { authRouter } from './routes/auth.js'
import { productsRouter } from './routes/products.js'
import { ordersRouter } from './routes/orders.js'
import { settingsRouter } from './routes/settings.js'
import { publicRouter } from './routes/public.js'
import { betaRouter } from './routes/beta.js'
import { vitrineRouter } from './routes/vitrine.js'
import { reviewsRouter } from './routes/reviews.js'
import { agentRouter } from './routes/agent.js'
import { opportunitiesRouter } from './routes/opportunities.js'
import { signalsRouter } from './routes/signals.js'
import { departmentsRouter } from './routes/departments.js'
import { reportsRouter, chatRouter } from './routes/reports.js'
import { autopilotRouter } from './routes/autopilot.js'
import { conversationsRouter } from './routes/conversations.js'
import { visualsRouter } from './routes/visuals.js'
import { billingRouter, stripeWebhook } from './routes/billing.js'
import { checkAi } from './services/aiHealth.js'
import { selfCheck } from './services/selfCheck.js'

import { ticketsRouter } from './routes/tickets.js'
import { socialRouter, socialPublicRouter } from './routes/social.js'
import { semerCategories } from './services/categories.js'
const app = express()

// A deployed app is reached from several origins at once — the custom domain, its
// www variant and the platform URL — so FRONTEND_URL accepts a comma-separated
// list rather than a single value. The browser extension calls the API from a
// chrome-extension:// origin, whose id differs per install.
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header: same-origin call, curl or a health probe.
      if (!origin) return callback(null, true)
      const normalized = origin.replace(/\/$/, '')
      const allowed = ALLOWED_ORIGINS.includes(normalized) || normalized.startsWith('chrome-extension://')
      callback(null, allowed)
    },
  }),
)
// Before express.json on purpose: Stripe signs the raw bytes, and a JSON
// round-trip would invalidate the signature.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook)

app.use(express.json({ limit: '2mb' }))

// Watermarked photos are public assets pulled into third-party listing forms, so
// they're readable from any origin (unlike the authenticated API routes above).
app.use('/storage', cors({ origin: '*' }), express.static(path.resolve('storage')))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Deep check: says whether the AI key really works. The enhancement path hides
// its own failures so an import never dies, which means a revoked key silently
// returns un-rewritten listings — this is how that gets noticed. The probe is
// cached five minutes, so it cannot be used to run up a bill.
// One call that says whether the service can actually do its job: model, email,
// storage, payments, database. Presence and reachability only, never a value.
app.get('/api/health/services', async (_req, res) => {
  const report = await selfCheck()
  res.status(report.ok ? 200 : 503).json(report)
})

app.get('/api/health/ai', async (_req, res) => {
  const status = await checkAi()
  res.status(status === 'ok' ? 200 : 503).json({ ai: status })
})
app.use('/api/auth', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/agent', agentRouter)
app.use('/api/opportunities', opportunitiesRouter)
app.use('/api/signals', signalsRouter)
app.use('/api/departments', departmentsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/autopilot', autopilotRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/visuals', visualsRouter)
// Hors authentification : c est Facebook qui appelle ces adresses, en
// redirigeant le navigateur du vendeur ou en signant sa requete.
app.use('/api/public/social', express.urlencoded({ extended: false }), socialPublicRouter)
app.use('/api/tickets', ticketsRouter)
app.use('/api/social', socialRouter)
app.use('/api/beta', betaRouter)
app.use('/api/public', publicRouter)
// Les vitrines vivent hors de /api : c est une page, pas une ressource d API.
app.use('/b', vitrineRouter)

const port = Number(process.env.PORT) || 4000
app.listen(port, () => console.log(`DropShip Pro API sur http://localhost:${port}`))

/*
 * Le referentiel de categories est seme au demarrage.
 *
 * Idempotent : il ne cree que ce qui manque et ne touche jamais a ce qui a ete
 * appris. Lance apres l ecoute plutot qu avant, pour qu une base lente ne
 * retarde pas la mise en service -- et rate en silence plutot que d empecher
 * l API de demarrer, parce qu un referentiel absent degrade l import quand une
 * API morte l arrete tout net.
 */
semerCategories()
  .then((r) => console.log(`Référentiel : ${r.categories} catégories, ${r.alias} alias ajoutés`))
  .catch((e) => console.error('semis du referentiel impossible', e))
