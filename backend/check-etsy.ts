import { createServer } from 'node:http'
import type { Product } from '@prisma/client'
import { choisirTaxonomie, defiPkce, etsy, EtsyRefus, verificateurPkce } from './src/services/etsy.js'
import { connecteurMarche } from './src/services/marchesApi.js'

/**
 * Le connecteur Etsy (Open API v3), éprouvé contre un faux serveur.
 *
 *   cd backend && npx tsx check-etsy.ts
 *
 * Le contrat est écrit EN DUR dans le faux, d'après la doc publique d'Etsy :
 * un banc qui passe prouve la mécanique, pas la réalité.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function annonce(surcharge: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-et-1',
    aiTitle: 'Bague chevalière en argent',
    title: 'bague',
    aiDescription: '<p>Belle bague</p><p>En argent &amp; gravée</p>',
    sellingPrice: 29 as never,
    currency: 'EUR',
    supplierStock: null,
    images: [] as string[],
    exportImages: null,
    attributes: {},
    ...surcharge,
  } as unknown as Product
}

const TAXO = [
  { id: 1, name: 'Jewelry', children: [{ id: 11, name: 'Rings', children: [{ id: 111, name: 'Signet Rings' }, { id: 112, name: 'Bands' }] }, { id: 12, name: 'Necklaces' }] },
  { id: 2, name: 'Home & Living', children: [{ id: 21, name: 'Lighting' }] },
]

async function refus(p: Promise<unknown>): Promise<EtsyRefus | null> {
  try {
    await p
    return null
  } catch (e) {
    return e as EtsyRefus
  }
}

async function main() {
  process.env.JWT_SECRET ??= 'banc'
  process.env.ETSY_API_KEY = 'keystring'
  process.env.ETSY_SHARED_SECRET = 'partage'

  const journal: Array<{ methode: string; chemin: string; corps: any; entetes: Record<string, any>; brut: string }> = []
  const etat = { access: 'u1.acc-1', refresh: 'ref-1', n: 1, profils: true, verifAttendu: '' }
  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const brut = Buffer.concat(morceaux).toString('latin1')
      const chemin = req.url ?? ''
      const type = String(req.headers['content-type'] ?? '')
      const corps = brut && type.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(brut)) : null
      journal.push({ methode: req.method!, chemin, corps, entetes: req.headers, brut })
      const repondre = (code: number, c: unknown) => {
        res.writeHead(code, { 'Content-Type': c instanceof Buffer ? 'image/jpeg' : 'application/json' })
        res.end(c instanceof Buffer ? c : JSON.stringify(c))
      }
      if (chemin.startsWith('/img/')) return repondre(200, Buffer.from('JPEGDATA'))
      if (chemin === '/v3/public/oauth/token') {
        if (corps?.client_id !== 'keystring') return repondre(401, { error: 'invalid_client' })
        if (corps.grant_type === 'authorization_code') {
          if (corps.code !== 'code-ok' || defiPkce(corps.code_verifier) !== etat.verifAttendu) return repondre(400, { error: 'invalid_grant' })
        } else if (corps.grant_type !== 'refresh_token' || corps.refresh_token !== etat.refresh) return repondre(400, { error: 'invalid_grant' })
        etat.n++
        etat.access = `u1.acc-${etat.n}`
        etat.refresh = `ref-${etat.n}`
        return repondre(200, { access_token: etat.access, refresh_token: etat.refresh, expires_in: 3600 })
      }
      if (req.headers['x-api-key'] !== 'keystring:partage') return repondre(403, { error: 'clé' })
      if (req.headers.authorization !== `Bearer ${etat.access}`) return repondre(401, { error: 'invalid_token' })
      const c = chemin.replace('/v3/application', '')
      if (c === '/users/me') return repondre(200, { user_id: 1, shop_id: 555 })
      if (c === '/shops/555') return repondre(200, { shop_id: 555, shop_name: 'AtelierMax', currency_code: 'EUR' })
      if (c === '/shops/555/shipping-profiles') return repondre(200, { results: etat.profils ? [{ shipping_profile_id: 77 }] : [] })
      if (c === '/shops/555/readiness-state-definitions') return repondre(200, { results: etat.profils ? [{ readiness_state_id: 88 }] : [] })
      if (c === '/seller-taxonomy/nodes') return repondre(200, { results: TAXO })
      if (c === '/shops/555/listings' && req.method === 'POST') return repondre(201, { listing_id: 9001, state: 'draft' })
      if (c === '/shops/555/listings/9001/images' && req.method === 'POST') {
        if (!type.startsWith('multipart/form-data')) return repondre(400, { error: 'multipart attendu' })
        return repondre(201, { listing_image_id: 1 })
      }
      return repondre(404, { error: `chemin inconnu ${chemin}` })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  try {
    console.log('Enregistrement et configuration')
    verifier('le connecteur est dans le registre', connecteurMarche('ETSY') === etsy)
    verifier('configuré avec les deux clés', etsy.appConfiguree())
    delete process.env.ETSY_SHARED_SECRET
    verifier('sans ETSY_SHARED_SECRET : « manque » le nomme', !etsy.appConfiguree() && /ETSY_SHARED_SECRET/.test(etsy.manque()))
    process.env.ETSY_SHARED_SECRET = 'partage'
    process.env.ETSY_API_URL = base
    process.env.ETSY_AUTH_URL = `${base}/auth`

    console.log("\nLe lien d'autorisation (PKCE)")
    const lien = new URL(etsy.lienAutorisation!('etat-abc', 'https://api.test/cb'))
    const defi = lien.searchParams.get('code_challenge')!
    verifier('chemin /oauth/connect, portées annonces', lien.pathname === '/auth/oauth/connect' && /listings_w/.test(lien.searchParams.get('scope') ?? ''))
    verifier('défi S256 dérivé du state', lien.searchParams.get('code_challenge_method') === 'S256' && defi === defiPkce(verificateurPkce('etat-abc')))
    verifier('le vérificateur ne se devine pas sans le secret', verificateurPkce('etat-abc') !== verificateurPkce('etat-abd') && verificateurPkce('etat-abc').length >= 43)
    etat.verifAttendu = defi

    console.log("\nL'échange du code")
    const fin = await etsy.finaliser({ code: 'code-ok', state: 'etat-abc' }, 'https://api.test/cb')
    const creds = etsy.lire(fin.data)!
    verifier('jetons et boutique lus', creds?.accessToken === 'u1.acc-2' && creds.shopId === '555')
    verifier('nom de la boutique en libellé', fin.label === 'AtelierMax')
    verifier('un state rejoué par un autre ne passe pas', (await refus(etsy.finaliser({ code: 'code-ok', state: 'autre' }, 'x')))?.liaison === true)
    verifier('en-tête x-api-key « keystring:secret »', journal.some((a) => a.entetes['x-api-key'] === 'keystring:partage'))

    console.log('\nVérification et rotation')
    verifier('jeton frais : pas de rotation', !(await etsy.verifier(creds)))
    const maj = (await etsy.verifier({ ...creds, accessExpires: Date.now() - 1 })) as any
    verifier('jeton périmé : rafraîchi, rendu par majCreds', maj?.majCreds?.refreshToken === 'ref-3')
    const frais = { ...creds, ...maj.majCreds }

    console.log('\nUn dépôt')
    const avant = journal.length
    const depot = await etsy.deposer(frais, annonce({ images: [`${base}/img/a.jpg`, `${base}/img/b.jpg`] }), 'Apparel & Accessories > Jewelry > Rings')
    const suite = journal.slice(avant)
    const brouillon = suite.find((a) => a.chemin === '/v3/application/shops/555/listings')?.corps
    verifier('champs exigés par Etsy', brouillon?.who_made === 'someone_else' && brouillon.when_made === '2020_2025' && brouillon.quantity === '10' && brouillon.price === '29.00')
    verifier("profils d'expédition et de préparation repris", brouillon?.shipping_profile_id === '77' && brouillon.readiness_state_id === '88')
    verifier('catégorie : feuille Etsy proche du chemin Google', ['111', '112'].includes(brouillon?.taxonomy_id), brouillon?.taxonomy_id)
    verifier('description en texte, sans balises', brouillon?.description === 'Belle bague\nEn argent & gravée')
    verifier('deux photos envoyées en fichier', suite.filter((a) => a.chemin.endsWith('/images')).length === 2)
    verifier('brouillon : lien vers l’éditeur Etsy, note qui le dit', /listing-editor\/edit\/9001/.test(depot.url ?? '') && /brouillon/i.test(depot.note ?? ''))

    console.log('\nLa taxonomie')
    verifier('un identifiant posé à la main gagne', choisirTaxonomie(TAXO, '12', 'x') === 12)
    verifier('signet ring → Signet Rings', choisirTaxonomie(TAXO, 'Jewelry > Rings', 'Signet ring silver') === 111)
    verifier('aucun mot commun : null', choisirTaxonomie(TAXO, 'Zzz > Qqq', 'Wxyz') === null)
    const sansTaxo = await refus(etsy.deposer(frais, annonce({ images: [`${base}/img/a.jpg`] }), 'Zzz > Qqq'))
    verifier('catégorie introuvable : refus qui dit quoi faire', /identifiant de catégorie Etsy/.test(sansTaxo?.message ?? ''))

    console.log('\nLes refus')
    verifier('sans photo : refus avant tout envoi', /photo/.test((await refus(etsy.deposer(frais, annonce(), 'x')))?.message ?? ''))
    etat.profils = false
    const sansProfil = await refus(etsy.deposer(frais, annonce({ images: [`${base}/img/a.jpg`] }), 'Jewelry > Rings'))
    verifier("sans profil d'expédition : refus en français", /profil d'expédition/.test(sansProfil?.message ?? '') && sansProfil?.liaison === false)
    etat.profils = true
  } finally {
    server.close()
  }

  console.log(echecs ? `\nEtsy : ${echecs} échec(s).` : '\nEtsy : tout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
