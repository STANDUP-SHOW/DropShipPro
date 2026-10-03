import 'dotenv/config'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'net'

/**
 * Les clés collées (Mirakl, Kaufland, eBay) ne disent « connecté » qu'après un
 * appel réel réussi (03/10/2026).
 *
 * Avant, l'écran Plateformes de vente marquait connecté tout formulaire rempli :
 * une clé fausse ne se voyait qu'au premier échec de diffusion, des jours plus
 * tard. Ce banc pose un faux opérateur Mirakl, un faux Kaufland et un faux eBay,
 * et vérifie qu'une clé refusée est dite tout de suite, sans rien enregistrer.
 *
 * Jamais la production : DATABASE_URL doit pointer une base jetable.
 */

process.env.JWT_SECRET ||= 'secret-de-banc'

let echecs = 0
const exige = (condition: boolean, message: string, detail?: unknown) => {
  console.log(`${condition ? 'ok   ' : 'ECHEC'} ${message}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  if (!condition) echecs++
}

// Faux services : la bonne clé passe, toute autre reçoit 401.
const faux = express()
faux.get('/mirakl/api/account', (req, res) =>
  req.headers.authorization === 'bonne-cle' ? res.json({ shop_name: 'Ma boutique' }) : res.status(401).json({ message: 'Unauthorized' }),
)
faux.get('/kaufland/units/', (req, res) =>
  req.headers['shop-client-key'] === 'k'.repeat(32) ? res.json({ data: [] }) : res.status(401).json({ message: 'Invalid client key' }),
)
faux.get('/ebay/sell/account/v1/privilege', (req, res) =>
  req.headers.authorization === 'Bearer bon-jeton' ? res.json({ sellingLimit: {} }) : res.status(401).json({ errors: [] }),
)
const serveurFaux = faux.listen(0)
const fauxBase = `http://127.0.0.1:${(serveurFaux.address() as AddressInfo).port}`

// Kaufland et eBay ont une adresse fixe : on la détourne vers le faux serveur.
const vraiFetch = globalThis.fetch
globalThis.fetch = ((entree: string | URL | Request, init?: RequestInit) => {
  const url = String(entree instanceof Request ? entree.url : entree)
    .replace('https://sellerapi.kaufland.com/v2', `${fauxBase}/kaufland`)
    .replace('https://api.ebay.com', `${fauxBase}/ebay`)
  return vraiFetch(url, init)
}) as typeof fetch

const { prisma } = await import('./src/lib/prisma.js')
const { settingsRouter } = await import('./src/routes/settings.js')

const app = express()
app.use(express.json())
app.use('/api/settings', settingsRouter)
const serveur = app.listen(0)
const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/settings`

const marque = `cles-${Date.now()}`
const vendeur = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })
const jeton = jwt.sign({ userId: vendeur.id }, process.env.JWT_SECRET!)
const coller = async (platform: string, data: Record<string, string>) => {
  const r = await vraiFetch(`${base}/credentials`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ platform, data }),
  })
  return { statut: r.status, corps: (await r.json().catch(() => ({}))) as { error?: string; connected?: boolean } }
}
const enregistre = (platform: string) =>
  prisma.platformCredential.findUnique({ where: { userId_platform: { userId: vendeur.id, platform: platform as never } } })

try {
  const { OPERATEURS_MIRAKL } = await import('./src/services/mirakl.js')
  const mirakl = OPERATEURS_MIRAKL[0]

  let r = await coller(mirakl, { baseUrl: `${fauxBase}/mirakl`, apiKey: 'mauvaise-cle' })
  exige(r.statut === 400 && Boolean(r.corps.error), 'Mirakl, clé fausse : refusée, avec la raison', r)
  exige(!(await enregistre(mirakl)), 'Mirakl, clé fausse : rien enregistré')
  r = await coller(mirakl, { baseUrl: `${fauxBase}/mirakl`, apiKey: 'bonne-cle' })
  exige(r.statut === 200 && r.corps.connected === true, 'Mirakl, bonne clé : connecté', r)

  r = await coller('KAUFLAND', { clientKey: 'x'.repeat(32), secretKey: 's'.repeat(64) })
  exige(r.statut === 400 && !(await enregistre('KAUFLAND')), 'Kaufland, clé fausse : refusée, rien enregistré', r)
  r = await coller('KAUFLAND', { clientKey: 'k'.repeat(32), secretKey: 's'.repeat(64) })
  exige(r.statut === 200 && r.corps.connected === true, 'Kaufland, bonnes clés : connecté', r)

  r = await coller('EBAY', { accessToken: 'jeton-perime' })
  exige(r.statut === 400 && /expiré/.test(r.corps.error ?? '') && !(await enregistre('EBAY')), 'eBay, jeton refusé : dit expiré, rien enregistré', r)
  r = await coller('EBAY', { accessToken: 'bon-jeton' })
  exige(r.statut === 200 && r.corps.connected === true, 'eBay, bon jeton : connecté', r)
} finally {
  await prisma.platformCredential.deleteMany({ where: { userId: vendeur.id } })
  await prisma.user.delete({ where: { id: vendeur.id } })
  serveur.close()
  serveurFaux.close()
  await prisma.$disconnect()
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nClés collées vérifiées avant « connecté » : tout passe.')
process.exitCode = echecs ? 1 : 0
