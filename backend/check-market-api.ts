import express from 'express'
import { prisma } from './src/lib/prisma.js'

/**
 * Éprouve l'API Market par clé (routes/marketCle.ts) sans base : création
 * idempotente par référence, filigrane, refus d'une annonce retirée par la
 * modération, retrait, et clé absente.
 */
let echecs = 0
const exige = (c: boolean, m: string) => {
  if (!c) {
    echecs++
    console.log(`ECHEC : ${m}`)
  } else console.log(`ok    ${m}`)
}

const produits: any[] = []
const pubs: any[] = []
const faux = prisma as unknown as Record<string, unknown>
const def = (k: string, v: unknown) => Object.defineProperty(faux, k, { value: v, configurable: true })
def('apiKey', {
  findUnique: async ({ where }: any) => (where.keyHash ? { id: 'k1', userId: 'u1', prefix: 'dsp_live_ab', revokedAt: null } : null),
  update: async () => ({}),
})
def('product', {
  findFirst: async ({ where }: any) => produits.find((p) => p.userId === where.userId && p.sourceUrl === where.sourceUrl) ?? null,
  create: async ({ data }: any) => {
    const p = { id: `p${produits.length + 1}`, aiTitle: null, combinations: null, variants: null, ...data }
    produits.push(p)
    return p
  },
  update: async ({ where, data }: any) => Object.assign(produits.find((p) => p.id === where.id), data),
  findMany: async ({ where }: any) =>
    produits
      .filter((p) => where.id.in.includes(p.id) && p.userId === where.userId)
      .map((p) => ({ ...p, publications: pubs.filter((x) => x.productId === p.id) })),
})
const cle = (w: any) => pubs.find((x) => x.productId === w.productId_platform.productId)
def('publication', {
  findUnique: async ({ where }: any) => cle(where) ?? null,
  upsert: async ({ where, create, update }: any) => {
    const e = cle(where)
    if (e) return Object.assign(e, update)
    const n = { id: `pub${pubs.length + 1}`, error: null, ...create }
    pubs.push(n)
    return n
  },
  delete: async ({ where }: any) => pubs.splice(pubs.findIndex((x) => x.id === where.id), 1),
  findMany: async () => pubs.map((x) => ({ ...x, product: produits.find((p) => p.id === x.productId) })),
})

const { marketCleRouter } = await import('./src/routes/marketCle.js')
const app = express()
app.use(express.json())
app.use('/api/market/v1', marketCleRouter)
const serveur = app.listen(0)
const port = (serveur.address() as { port: number }).port
const appel = async (methode: string, chemin: string, corps?: unknown, auth = true) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/market/v1${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer dsp_live_test' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  return { status: r.status, json: (await r.json()) as any }
}

const annonce = { reference: 'SKU-1', titre: 'Lampe de bureau', description: 'Une lampe LED orientable.', prix: 29.9, images: ['https://exemple.fr/a.jpg'] }
exige((await appel('GET', '/annonces', undefined, false)).status === 401, 'sans clé, 401')
const a = await appel('POST', '/annonces', annonce)
exige(a.status === 201 && a.json.annonce.statut === 'PUBLISHED', 'une annonce est créée et PUBLISHED sur le Market')
exige(produits[0].imagesWatermarked === false, 'imagesWatermarked vaut false à la création')
const b = await appel('POST', '/annonces', { ...annonce, prix: 35 })
exige(b.status === 200 && produits.length === 1 && Number(produits[0].sellingPrice) === 35, 'la même référence met à jour au lieu de dupliquer')
exige((await appel('POST', '/annonces', { ...annonce, images: [] })).status === 400, 'une annonce sans photo est refusée')
pubs[0].status = 'FAILED'
pubs[0].error = 'Retirée de DropShop Market par la modération : contrefaçon'
exige((await appel('POST', '/annonces', annonce)).status === 409 && pubs[0].status === 'FAILED', 'une annonce retirée par la modération ne se republie pas')
const p = await appel('POST', '/publier', { productIds: ['p1', 'inconnu'] })
exige(p.json.refuses === 1 && p.json.inconnus[0] === 'inconnu', 'publier : refus de modération et produits inconnus signalés')
exige((await appel('DELETE', '/annonces/SKU-1')).status === 200 && pubs.length === 1, 'le retrait vendeur garde la trace de la modération')
pubs.length = 0
await appel('POST', '/annonces', annonce)
exige((await appel('DELETE', '/annonces/SKU-1')).status === 200 && pubs.length === 0, 'le vendeur retire son annonce')
exige((await appel('GET', '/annonces')).json.count === 0, 'la liste suit')

serveur.close()
console.log(echecs ? `${echecs} échec(s)` : 'API Market : tout passe.')
process.exit(echecs ? 1 : 0)
