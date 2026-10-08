import { createServer } from 'node:http'
import type { Product } from '@prisma/client'
import { cdiscount, CdiscountRefus, hoteApi, hoteAuth, offreCdiscount } from './src/services/cdiscount.js'
import { connecteurMarche } from './src/services/marchesApi.js'

/**
 * Le connecteur Cdiscount (API vendeur Octopia), éprouvé contre un faux serveur.
 *
 *   cd backend && npx tsx check-cdiscount.ts
 *
 * Le contrat est écrit EN DUR dans le faux, d'après des extraits de la doc
 * Octopia (voir l'en-tête de cdiscount.ts) : un banc qui passe prouve la
 * mécanique, pas la réalité.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const EAN_VALIDE = '4006381333931'

function annonce(surcharge: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-cd-1',
    aiTitle: 'Lampe de bureau LED',
    title: 'lampe',
    sellingPrice: 24.9 as never,
    currency: 'EUR',
    supplierStock: null,
    images: ['https://img.test/a.jpg'],
    exportImages: null,
    ean: EAN_VALIDE,
    attributes: {},
    ...surcharge,
  } as unknown as Product
}

interface Appel {
  methode: string
  chemin: string
  corps: any
  entetes: Record<string, string | string[] | undefined>
}

async function refus(p: Promise<unknown>): Promise<CdiscountRefus | null> {
  try {
    await p
    return null
  } catch (e) {
    return e as CdiscountRefus
  }
}

async function main() {
  const journal: Appel[] = []
  const etat = { vendeurRattache: '98979' }
  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const brut = Buffer.concat(morceaux).toString('utf8')
      const chemin = req.url ?? ''
      const type = String(req.headers['content-type'] ?? '')
      const corps = brut ? (type.includes('json') ? JSON.parse(brut) : Object.fromEntries(new URLSearchParams(brut))) : null
      journal.push({ methode: req.method!, chemin, corps, entetes: req.headers })
      const repondre = (code: number, c: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(c))
      }
      if (chemin === '/auth/auth/realms/maas/protocol/openid-connect/token') {
        if (corps?.grant_type !== 'client_credentials') return repondre(400, { error: 'unsupported_grant_type' })
        if (corps.client_id === 'mon-client' && corps.client_secret === 'mon-secret') return repondre(200, { access_token: 'jeton-vendeur', expires_in: 300 })
        if (corps.client_id === 'dropshipper' && corps.client_secret === 'secret-ds') return repondre(200, { access_token: 'jeton-integrateur', expires_in: 7200 })
        return repondre(401, { error: 'invalid_client' })
      }
      if (!String(req.headers.authorization ?? '').startsWith('Bearer jeton-')) return repondre(401, {})
      if (req.headers.sellerid !== etat.vendeurRattache) return repondre(403, {})
      if (req.headers.saleschannelid !== 'CDISFR') return repondre(400, { detail: 'SalesChannelId manquant' })
      if (chemin.startsWith('/api/offer-packages?') && req.method === 'GET') return repondre(200, { items: [] })
      if (chemin === '/api/offer-packages' && req.method === 'POST') return repondre(201, { packageId: 'pkg-1', status: 'WaitingForCompletion' })
      if (chemin === '/api/offer-packages/pkg-1/offer-requests' && req.method === 'POST') return repondre(202, {})
      if (chemin === '/api/offer-packages/pkg-1' && req.method === 'PATCH') return repondre(200, { status: corps?.status })
      return repondre(404, { detail: `chemin inconnu ${chemin}` })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  try {
    delete process.env.CDISCOUNT_CLIENT_ID
    delete process.env.CDISCOUNT_CLIENT_SECRET
    console.log('Enregistrement et hôtes')
    verifier('le connecteur est dans le registre', connecteurMarche('CDISCOUNT') === cdiscount)
    verifier("hôtes Octopia par défaut", hoteAuth() === 'https://auth.octopia-io.net' && hoteApi() === 'https://api.octopia-io.net/seller/v2')
    verifier('rien à poser dans Railway : toujours configuré', cdiscount.appConfiguree())
    verifier('pas de redirection : liaison par saisie', !cdiscount.lienAutorisation && !!cdiscount.saisie)
    verifier('sans intégrateur : Seller ID, Client ID, Client Secret', cdiscount.saisie!().map((c) => c.cle).join() === 'sellerId,clientId,clientSecret')
    process.env.CDISCOUNT_AUTH_URL = `${base}/auth`
    process.env.CDISCOUNT_API_URL = `${base}/api`

    console.log('\nLa liaison avec les identifiants du vendeur')
    const fin = await cdiscount.finaliser({ sellerId: '98979', clientId: 'mon-client', clientSecret: 'mon-secret' }, 'x')
    const creds = cdiscount.lire(fin.data)!
    verifier('identifiants lus', creds?.sellerId === '98979' && creds.clientId === 'mon-client')
    await cdiscount.verifier(creds)
    const verif = journal.filter((a) => a.chemin.startsWith('/api/offer-packages?')).pop()
    verifier('vérification : GET sans effet, en-têtes SellerId et canal', verif?.methode === 'GET' && verif.entetes.sellerid === '98979' && verif.entetes['saleschannelid'] === 'CDISFR')
    verifier('mauvais secret : refus de liaison', (await refus(cdiscount.verifier({ ...creds, clientId: 'autre', clientSecret: 'faux' })))?.liaison === true)
    const e403 = await refus(cdiscount.verifier({ ...creds, sellerId: '11111' }))
    verifier('Seller ID non rattaché : 403 lisible', /403/.test(e403?.message ?? '') && e403?.liaison === true)
    verifier('incomplet sans intégrateur : refusé', cdiscount.lire({ sellerId: '98979' }) === null)

    console.log('\nLa voie intégrateur (clés Railway)')
    process.env.CDISCOUNT_CLIENT_ID = 'dropshipper'
    process.env.CDISCOUNT_CLIENT_SECRET = 'secret-ds'
    verifier('avec intégrateur : seul le Seller ID est demandé', cdiscount.saisie!().map((c) => c.cle).join() === 'sellerId')
    const seul = cdiscount.lire({ sellerId: '98979' })
    verifier('Seller ID seul accepté', seul?.sellerId === '98979' && !seul.clientId)
    await cdiscount.verifier(seul!)
    verifier('jeton de l’intégrateur utilisé', journal.filter((a) => a.chemin.startsWith('/api/')).pop()?.entetes.authorization === 'Bearer jeton-integrateur')
    delete process.env.CDISCOUNT_CLIENT_ID
    delete process.env.CDISCOUNT_CLIENT_SECRET

    console.log('\nUn dépôt')
    const avant = journal.length
    const depot = await cdiscount.deposer(creds, annonce(), 'x')
    const suite = journal.slice(avant)
    verifier('paquet Upsert ouvert', suite.some((a) => a.chemin === '/api/offer-packages' && a.corps?.packageType === 'Upsert'))
    const offres = suite.find((a) => a.chemin.endsWith('/offer-requests'))?.corps
    verifier('une offre : référence, EAN, état neuf, prix, stock', offres?.[0]?.sellerExternalReference === 'prod-cd-1' && offres[0].gtin === EAN_VALIDE && offres[0].condition === 'New' && offres[0].price?.salePrice === 24.9 && offres[0].quantity === 10)
    verifier('paquet déclaré Ready', suite.some((a) => a.methode === 'PATCH' && a.corps?.status === 'Ready'))
    verifier('la note dit le traitement en différé', /différé/.test(depot.note ?? '') && /pkg-1/.test(depot.note ?? ''))
    verifier('EAN lu dans les caractéristiques', offreCdiscount(annonce({ ean: null }), EAN_VALIDE).gtin === EAN_VALIDE)

    console.log('\nLes refus avant envoi')
    const avant2 = journal.length
    const sansEan = await refus(cdiscount.deposer(creds, annonce({ ean: null }), 'x'))
    verifier('sans EAN : refus en français, rien envoyé', /EAN/.test(sansEan?.message ?? '') && sansEan?.liaison === false && journal.length === avant2)
    verifier('EAN à clé fausse : refusé', /clé de contrôle/.test((await refus(cdiscount.deposer(creds, annonce({ ean: '4006381333932' }), 'x')))?.message ?? ''))
    verifier('sans prix : refusé', /prix/.test((await refus(cdiscount.deposer(creds, annonce({ sellingPrice: 0 }), 'x')))?.message ?? ''))
  } finally {
    server.close()
  }

  console.log(echecs ? `\nCdiscount : ${echecs} échec(s).` : '\nCdiscount : tout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
