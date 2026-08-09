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
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json({ limit: '2mb' }))
app.use('/storage', express.static(path.resolve('storage')))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/public', publicRouter)

const port = Number(process.env.PORT) || 4000
app.listen(port, () => console.log(`DropShip Pro API sur http://localhost:${port}`))
