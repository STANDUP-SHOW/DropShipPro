import { createServer } from 'node:http'
import type { Product } from '@prisma/client'

/**
 * Le connecteur Amazon (SP-API), éprouvé contre un faux serveur.
 *   cd backend && npx tsx check-amazon.ts
 * Aucun vrai Amazon n'a jamais vu ce code. Le contrat est écrit en dur ici.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const EAN = '4006381333931'
const ASIN = 'B0TEST1234'
const REFRESH = 'Atzr|refresh-1'

function annonce(surcharge: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-am-1',
    aiTitle: 'Bague acier',
    title: 'bague',
    sellingPrice: 14.9,
    supplierStock: null,
    ean: null,
    attributes: { EAN },
    ...surcharge,
  } as unknown as Product
}

interface Appel {
  methode: string
  url: string
  corps: any
  jeton: string
}

async function main() {
  const journal: Appel[] = []
  const lwaCalls: Record<string, string>[] = []
  let statutListing: 'ACCEPTED' | 'INVALID' = 'ACCEPTED'
  let ean404 = false
  let forcer: { code: number; corps: unknown } | null = null
  let participations = [{ marketplace: { id: 'A13V1IB3VIYZZH' }, participation: { isSuspended: false } }]

  const serveur = createServer((req, res) => {
    const m: Buffer[] = []
    req.on('data', (c) => m.push(c))
    req.on('end', () => {
      const brut = Buffer.concat(m).toString('utf8')
      const rep = (code: number, corps: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(corps))
      }
      if (req.url === '/auth/o2/token') {
        const p = Object.fromEntries(new URLSearchParams(brut))
        lwaCalls.push(p)
        if (p.client_id !== 'cid' || p.client_secret !== 'csec') return rep(401, { error: 'invalid_client' })
        if (p.grant_type === 'authorization_code') {
          return p.code === 'bon-code'
            ? rep(200, { access_token: 'AT-1', refresh_token: 'Atzr|nouveau', expires_in: 3600 })
            : rep(400, { error: 'invalid_grant' })
        }
        if (p.grant_type === 'refresh_token') {
          return p.refresh_token === REFRESH || p.refresh_token === 'Atzr|nouveau'
            ? rep(200, { access_token: `AT-${lwaCalls.length}`, expires_in: 3600 })
            : rep(400, { error: 'invalid_grant' })
        }
        return rep(400, { error: 'unsupported_grant_type' })
      }
      journal.push({
        methode: req.method!,
        url: req.url!,
        corps: brut ? JSON.parse(brut) : null,
        jeton: String(req.headers['x-amz-access-token'] ?? ''),
      })
      if (!req.headers['x-amz-access-token']) return rep(403, { errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.' }] })
      if (forcer) return rep(forcer.code, forcer.corps)
      if (req.url!.startsWith('/sellers/v1/marketplaceParticipations')) return rep(200, { payload: participations })
      if (req.url!.startsWith('/catalog/2022-04-01/items?')) {
        if (ean404) return rep(200, { numberOfResults: 0, items: [] })
        return rep(200, {
          numberOfResults: 1,
          items: [{ asin: ASIN, productTypes: [{ marketplaceId: 'A13V1IB3VIYZZH', productType: 'RING' }] }],
        })
      }
      if (req.method === 'PUT' && req.url!.startsWith('/listings/2021-08-01/items/')) {
        return statutListing === 'ACCEPTED'
          ? rep(200, { sku: 'x', status: 'ACCEPTED', submissionId: 's1', issues: [{ severity: 'WARNING', message: 'avis', code: 'W1' }] })
          : rep(200, { sku: 'x', status: 'INVALID', submissionId: 's2', issues: [{ severity: 'ERROR', message: 'Prix inférieur au minimum', code: '90000' }] })
      }
      return rep(404, { errors: [{ code: 'NotFound', message: req.url }] })
    })
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`

  process.env.AMAZON_SPAPI_URL = base
  process.env.AMAZON_LWA_URL = base
  process.env.AMAZON_SELLERCENTRAL_URL = 'https://sellercentral.test'
  process.env.AMAZON_LWA_CLIENT_ID = 'cid'
  process.env.AMAZON_LWA_CLIENT_SECRET = 'csec'
  process.env.AMAZON_SPAPI_APP_ID = 'amzn1.sp.solution.abc'
  delete process.env.AMAZON_SPAPI_BETA
  delete process.env.AMAZON_MARKETPLACE_ID

  const { amazon, AmazonRefus, finaliserJetonManuel, oublierJetonsAmazon, skuAmazon } = await import('./src/services/amazon.js')
  const { connecteurMarche } = await import('./src/services/marchesApi.js')
  const creds = { refreshToken: REFRESH, sellerId: 'A1SELLER' }

  const rate = async (f: () => Promise<unknown>) => {
    try {
      await f()
      return null
    } catch (e) {
      return e as InstanceType<typeof AmazonRefus>
    }
  }

  try {
    console.log('Enregistrement et configuration')
    verifier('enregistré au registre', connecteurMarche('AMAZON') === amazon)
    verifier('application configurée', amazon.appConfiguree() && amazon.manque() === '')

    console.log('\nLien d’autorisation')
    const lien = new URL(amazon.lienAutorisation('ETAT1', 'https://api.test/cb'))
    verifier('sur Seller Central', lien.origin === 'https://sellercentral.test' && lien.pathname === '/apps/authorize/consent')
    verifier('application_id, state, redirect_uri', lien.searchParams.get('application_id') === 'amzn1.sp.solution.abc' && lien.searchParams.get('state') === 'ETAT1' && lien.searchParams.get('redirect_uri') === 'https://api.test/cb')
    verifier('pas de version=beta par défaut', !lien.searchParams.has('version'))
    process.env.AMAZON_SPAPI_BETA = '1'
    verifier('version=beta en brouillon', new URL(amazon.lienAutorisation('E', 'r')).searchParams.get('version') === 'beta')
    delete process.env.AMAZON_SPAPI_BETA

    console.log('\nÉchange du code')
    const fin = await amazon.finaliser({ spapi_oauth_code: 'bon-code', selling_partner_id: 'A1SELLER' }, 'r')
    verifier('refresh token et vendeur gardés', fin.data.refreshToken === 'Atzr|nouveau' && fin.data.sellerId === 'A1SELLER')
    verifier('libellé du compte', fin.label === 'Amazon A1SELLER')
    verifier('grant authorization_code envoyé', lwaCalls[0]?.grant_type === 'authorization_code' && lwaCalls[0]?.code === 'bon-code')
    const mauvais = await rate(() => amazon.finaliser({ spapi_oauth_code: 'faux', selling_partner_id: 'A1' }, 'r'))
    verifier('code faux : refus de liaison en français', !!mauvais && mauvais.liaison && /Reconnectez/.test(mauvais.message))
    const sansCode = await rate(() => amazon.finaliser({}, 'r'))
    verifier('retour sans code refusé', !!sansCode && /recommencez/.test(sansCode.message))

    console.log('\nJeton collé (application privée)')
    oublierJetonsAmazon()
    const manuel = await amazon.finaliser({ refreshToken: REFRESH, sellerId: 'A1SELLER' }, 'r')
    verifier('utilisé directement, essayé tout de suite', manuel.data.refreshToken === REFRESH && lwaCalls.at(-1)?.grant_type === 'refresh_token')
    const direct = await finaliserJetonManuel(REFRESH, 'A9')
    verifier('helper exporté', direct.label === 'Amazon A9')
    const jetonFaux = await rate(() => finaliserJetonManuel('Atzr|faux', 'A1'))
    verifier('jeton faux refusé, pas enregistré', !!jetonFaux && jetonFaux.liaison)
    const sansVendeur = await rate(() => finaliserJetonManuel(REFRESH, ' '))
    verifier('identifiant vendeur obligatoire', !!sansVendeur && /identifiant vendeur/.test(sansVendeur.message))

    console.log('\nJeton d’accès mis en cache')
    oublierJetonsAmazon()
    const avant = lwaCalls.length
    await amazon.verifier(creds)
    await amazon.verifier(creds)
    verifier('un seul échange LWA pour deux appels', lwaCalls.length === avant + 1)
    verifier('jeton dans x-amz-access-token', journal.at(-1)?.jeton.startsWith('AT-') === true)

    console.log('\nParticipations')
    verifier('lire() relit les identifiants', amazon.lire({ refreshToken: 'a', sellerId: 'b' })?.sellerId === 'b' && amazon.lire({ refreshToken: 'a' }) === null)
    participations = [{ marketplace: { id: 'A1PA6795UKMFR9' }, participation: { isSuspended: false } }]
    const sansFrance = await rate(() => amazon.verifier(creds))
    verifier('sans la France : message clair', !!sansFrance && /Amazon\.fr/.test(sansFrance.message))
    participations = [{ marketplace: { id: 'A13V1IB3VIYZZH' }, participation: { isSuspended: false } }]

    console.log('\nRefus avant tout appel')
    const nb = journal.length
    const sansEan = await rate(() => amazon.deposer(creds, annonce({ attributes: {} }), 'x'))
    verifier('sans EAN : refus lisible', !!sansEan && /rattache chaque offre à une fiche existante par son EAN/.test(sansEan.message) && !sansEan.liaison)
    const eanFaux = await rate(() => amazon.deposer(creds, annonce({ attributes: { EAN: '4006381333932' } }), 'x'))
    verifier('EAN à clé fausse refusé', !!eanFaux && /clé de contrôle/.test(eanFaux.message))
    verifier('aucune requête partie', journal.length === nb)

    console.log('\nRecherche de l’ASIN')
    ean404 = true
    const sansFiche = await rate(() => amazon.deposer(creds, annonce(), 'x'))
    verifier('EAN inconnu : refus (Brand Registry)', !!sansFiche && /Brand Registry/.test(sansFiche.message) && /automatiquement/.test(sansFiche.message))
    verifier('aucun PUT envoyé', !journal.some((a) => a.methode === 'PUT'))
    ean404 = false

    console.log('\nLe dépôt')
    statutListing = 'ACCEPTED'
    const depot = await amazon.deposer(creds, annonce(), 'x')
    const recherche = journal.filter((a) => a.url.startsWith('/catalog/')).at(-1)!
    const qs = new URL(base + recherche.url).searchParams
    verifier('recherche par EAN sur la France', qs.get('identifiers') === EAN && qs.get('identifiersType') === 'EAN' && qs.get('marketplaceIds') === 'A13V1IB3VIYZZH')
    verifier('summaries et productTypes demandés', qs.get('includedData') === 'summaries,productTypes')
    const put = journal.find((a) => a.methode === 'PUT')!
    verifier('PUT sur /listings/2021-08-01/items/<vendeur>/<sku>', put.url.startsWith(`/listings/2021-08-01/items/A1SELLER/${skuAmazon(annonce())}?`))
    verifier('sku stable issu de l’identifiant produit', skuAmazon(annonce()) === 'DSP-prod-am-1')
    verifier('marketplaceIds en paramètre', new URL(base + put.url).searchParams.get('marketplaceIds') === 'A13V1IB3VIYZZH')
    verifier('productType repris du catalogue, offre seule', put.corps.productType === 'RING' && put.corps.requirements === 'LISTING_OFFER_ONLY')
    const a = put.corps.attributes
    verifier('état neuf', a.condition_type[0].value === 'new_new')
    verifier('ASIN suggéré', a.merchant_suggested_asin[0].value === ASIN)
    verifier('prix TTC en EUR', a.purchasable_offer[0].currency === 'EUR' && a.purchasable_offer[0].our_price[0].schedule[0].value_with_tax === 14.9)
    verifier('stock : dix sans stock fournisseur', a.fulfillment_availability[0].fulfillment_channel_code === 'DEFAULT' && a.fulfillment_availability[0].quantity === 10)
    verifier('marketplace_id dans chaque attribut', a.purchasable_offer[0].marketplace_id === 'A13V1IB3VIYZZH' && a.condition_type[0].marketplace_id === 'A13V1IB3VIYZZH')
    verifier('ACCEPTED : url de la fiche', depot.url === `https://www.amazon.fr/dp/${ASIN}` && /avertissement/.test(depot.note ?? ''))

    statutListing = 'INVALID'
    const invalide = await rate(() => amazon.deposer(creds, annonce(), 'x'))
    verifier('INVALID : les messages d’erreur remontent', !!invalide && /Prix inférieur au minimum/.test(invalide.message) && !invalide.liaison)

    console.log('\nTraduction des erreurs')
    forcer = { code: 403, corps: { errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.' }] } }
    const e403 = await rate(() => amazon.deposer(creds, annonce(), 'x'))
    verifier('403 : reconnexion ou rôle Product Listing', !!e403 && e403.liaison && /Product Listing/.test(e403.message) && /econnectez/.test(e403.message))
    forcer = { code: 429, corps: { errors: [{ code: 'QuotaExceeded', message: 'x' }] } }
    const e429 = await rate(() => amazon.verifier(creds))
    verifier('429 : patienter', !!e429 && /patientez/.test(e429.message) && !e429.liaison)
    forcer = { code: 400, corps: { errors: [{ code: 'InvalidInput', message: 'marketplace invalide' }] } }
    const e400 = await rate(() => amazon.verifier(creds))
    verifier('400 : détail Amazon repris', !!e400 && /InvalidInput : marketplace invalide/.test(e400.message))
    forcer = null
  } finally {
    serveur.close()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nAmazon : tout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.stack ?? err}`)
  process.exitCode = 1
})
