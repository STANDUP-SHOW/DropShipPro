import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { authRouter } from './routes/auth.js'
import { productsRouter } from './routes/products.js'
import { ordersRouter } from './routes/orders.js'
import { settingsRouter } from './routes/settings.js'
import { publicRouter } from './routes/public.js'

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
app.use(express.json({ limit: '2mb' }))

// Watermarked photos are public assets pulled into third-party listing forms, so
// they're readable from any origin (unlike the authenticated API routes above).
app.use('/storage', cors({ origin: '*' }), express.static(path.resolve('storage')))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/public', publicRouter)

const port = Number(process.env.PORT) || 4000
app.listen(port, () => console.log(`DropShip Pro API sur http://localhost:${port}`))
