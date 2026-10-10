import { createServer } from 'node:http'
import type { Product } from '@prisma/client'
import { hote, prixWish, wish, WishRefus } from './src/services/wish.js'
import { connecteurMarche } from './src/services/marchesApi.js'

/**
 * Le connecteur Wish (Merchant API v3), éprouvé contre un faux serveur.
 *
 *   cd backend && npx tsx check-wish.ts
 *
 * Le contrat est écrit EN DUR dans le faux, d'après des extraits de la doc
 * Wish (voir l'en-tête de wish.ts) : un banc qui passe prouve la mécanique,
 * pas la réalité. Le bac à sable (WISH_SANDBOX=1) est le premier vrai test.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function annonce(surcharge: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-wi-1',
    aiTitle: 'Montre connectée sport',
    title: 'montre',
    aiDescription: '<p>Étanche</p>',
    sellingPrice: 20 as never,
    currency: 'EUR',
    supplierStock: 3,
    images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'],
    exportImages: null,
    attributes: {},
    ...surcharge,
  } as unknown as Product
}

async function refus(p: Promise<unknown>): Promise<WishRefus | null> {
  try {
    await p
    return null
  } catch (e) {
    return e as WishRefus
  }
}

async function main() {
  process.env.WISH_CLIENT_ID = 'cid'
  process.env.WISH_CLIENT_SECRET = 'csecret'
  process.env.WISH_DEVISE = 'EUR'

  const journal: Array<{ methode: string; chemin: string; corps: any; entetes: Record<string, any> }> = []
  const etat = { access: 'acc-1', refresh: 'ref-1', n: 1, entrepots: true }
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
      if (chemin === '/api/v3/oauth/access_token' || chemin === '/api/v3/oauth/refresh_token') {
        if (corps?.client_id !== 'cid' || corps.client_secret !== 'csecret') return repondre(401, { code: 4000, message: 'client inconnu' })
        if (corps.grant_type === 'authorization_code' ? corps.code !== 'code-ok' : corps.refresh_token !== etat.refresh) return repondre(400, { code: 1016, message: 'invalid grant' })
        etat.n++
        etat.access = `acc-${etat.n}`
        etat.refresh = `ref-${etat.n}`
        return repondre(200, { code: 0, data: { access_token: etat.access, refresh_token: etat.refresh, expiry_time: Math.floor(Date.now() / 1000) + 30 * 86400, merchant_id: 'm-42' } })
      }
      if (req.headers.authorization !== `Bearer ${etat.access}`) return repondre(401, { code: 1015, message: 'token expired' })
      if (chemin === '/api/v3/oauth/test') return repondre(200, { code: 0, data: { merchant_id: 'm-42', merchant_username: 'BoutiqueMax' } })
      if (chemin === '/api/v3/warehouses') return repondre(200, { code: 0, data: etat.entrepots ? [{ id: 'wh-1' }] : [] })
      if (chemin === '/api/v3/products' && req.method === 'POST') {
        if (!corps?.main_image?.url) return repondre(400, { code: 1000, message: 'main_image is required' })
        return repondre(200, { code: 0, data: { id: 'p-777' } })
      }
      return repondre(404, { code: 404, message: `chemin inconnu ${chemin}` })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  try {
    console.log('Enregistrement et hôtes')
    verifier('le connecteur est dans le registre', connecteurMarche('WISH') === wish)
    verifier('hôte de production par défaut', hote() === 'https://merchant.wish.com')
    process.env.WISH_SANDBOX = '1'
    verifier('WISH_SANDBOX=1 : bac à sable', hote() === 'https://sandbox.merchant.wish.com')
    delete process.env.WISH_SANDBOX
    delete process.env.WISH_CLIENT_SECRET
    verifier('sans WISH_CLIENT_SECRET : « manque » le nomme', !wish.appConfiguree() && /WISH_CLIENT_SECRET/.test(wish.manque()))
    process.env.WISH_CLIENT_SECRET = 'csecret'
    process.env.WISH_URL = base

    console.log("\nLe lien et l'échange")
    const lien = new URL(wish.lienAutorisation!('etat-1', 'https://api.test/cb'))
    verifier('chemin /v3/oauth/authorize, client_id et state', lien.pathname === '/v3/oauth/authorize' && lien.searchParams.get('client_id') === 'cid' && lien.searchParams.get('state') === 'etat-1')
    const fin = await wish.finaliser({ code: 'code-ok' }, 'https://api.test/cb')
    const creds = wish.lire(fin.data)!
    verifier('jetons et marchand lus', creds?.accessToken === 'acc-2' && creds.merchantId === 'm-42')
    verifier("l'échéance vient de expiry_time", creds.accessExpires > Date.now() + 29 * 86400_000)
    verifier('nom du marchand en libellé', fin.label === 'BoutiqueMax')
    verifier('mauvais code : refus de liaison', (await refus(wish.finaliser({ code: 'faux' }, 'x')))?.liaison === true)

    console.log('\nVérification et rotation')
    verifier('jeton frais : pas de rotation', !(await wish.verifier(creds)))
    const maj = (await wish.verifier({ ...creds, accessExpires: Date.now() - 1 })) as any
    verifier('jeton périmé : rafraîchi, rendu par majCreds', maj?.majCreds?.refreshToken === 'ref-3' && maj.majCreds.merchantId === 'm-42')
    etat.access = 'revoque'
    const apres401 = (await wish.verifier({ ...maj.majCreds })) as any
    verifier('401 : un rafraîchissement, puis ça passe', apres401?.majCreds?.refreshToken === 'ref-4')
    const frais = apres401.majCreds

    console.log('\nUn dépôt')
    const depot = await wish.deposer(frais, annonce(), 'x')
    const produit = journal.filter((a) => a.chemin === '/api/v3/products').pop()?.corps
    verifier('image principale et images en plus', produit?.main_image?.url === 'https://img.test/a.jpg' && produit.extra_images?.[0]?.url === 'https://img.test/b.jpg')
    const v = produit?.variations?.[0]
    verifier('une variation : sku, prix, stock par entrepôt', v?.sku === 'prod-wi-1' && v.price?.amount === 20 && v.price.currency_code === 'EUR' && v.inventories?.[0]?.warehouse_id === 'wh-1' && v.inventories[0].inventory === 3)
    verifier("adresse du produit et note", depot.url === 'https://www.wish.com/product/p-777' && /relit/.test(depot.note ?? ''))
    verifier('prix converti vers une autre devise', (await prixWish(annonce({ currency: 'EUR', sellingPrice: 10 }))) === 10)

    console.log('\nLes refus')
    etat.entrepots = false
    const sansEntrepot = await refus(wish.deposer(frais, annonce(), 'x'))
    verifier('sans entrepôt : refus en français', /entrepôt/.test(sansEntrepot?.message ?? '') && sansEntrepot?.liaison === false)
    etat.entrepots = true
    verifier('sans image : refus avant tout envoi', /image principale/.test((await refus(wish.deposer(frais, annonce({ images: [] }), 'x')))?.message ?? ''))
  } finally {
    server.close()
  }

  console.log(echecs ? `\nWish : ${echecs} échec(s).` : '\nWish : tout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
