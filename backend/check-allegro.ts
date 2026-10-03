import { createServer } from 'node:http'
import type { Product } from '@prisma/client'
import { allegro, AllegroRefus, hoteApi, hoteAuth, hoteUpload, prixEnPln, traduireErreurs422 } from './src/services/allegro.js'
import { connecteurMarche } from './src/services/marchesApi.js'

/**
 * Le connecteur Allegro, éprouvé contre un faux serveur (auth, API et envoi
 * d'images sur trois préfixes d'un même port).
 *
 *   cd backend && npx tsx check-allegro.ts
 *
 * Le contrat est écrit EN DUR dans le faux (chemins, en-têtes, forme des corps),
 * lu dans la doc publique d'Allegro. Aucun vrai Allegro n'a jamais vu ce code :
 * un banc qui passe prouve la mécanique, pas la réalité. Le bac à sable
 * (ALLEGRO_SANDBOX=1) est le premier vrai test à faire.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const MEDIA = 'application/vnd.allegro.public.v1+json'
const EAN_VALIDE = '4006381333931'
const CLIENT = 'cid'
const SECRET = 'csecret'
const BASIC = `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString('base64')}`

function annonce(surcharge: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-al-1',
    aiTitle: 'Bague chevalière acier inoxydable 316L',
    title: 'bague source',
    description: 'desc',
    aiDescription: '<p>Belle bague</p><p>En acier & durable</p>',
    sellingPrice: 14.9 as never,
    currency: 'EUR',
    supplierStock: null,
    images: ['https://img.test/a.jpg', 'https://img.test/b.jpg'],
    exportImages: null,
    ean: null,
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

function fauxAllegro() {
  const journal: Appel[] = []
  const etat = {
    accessValide: 'acc-1',
    refreshValide: 'ref-1',
    compteur: 1,
    politiques: true,
    eanConnu: false,
    reponse422: false,
    code: 'code-ok',
  }
  let base = ''

  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const brut = Buffer.concat(morceaux).toString('utf8')
      const chemin = req.url ?? ''
      const type = String(req.headers['content-type'] ?? '')
      const corps = brut ? (type.includes('json') ? JSON.parse(brut) : Object.fromEntries(new URLSearchParams(brut))) : null
      journal.push({ methode: req.method!, chemin, corps, entetes: req.headers })
      const repondre = (code: number, c: unknown, e: Record<string, string> = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json', ...e })
        res.end(JSON.stringify(c))
      }

      // Le serveur d'autorisation : Basic auth, jetons à rotation.
      if (chemin === '/authhost/auth/oauth/token') {
        if (req.headers.authorization !== BASIC) return repondre(401, { error: 'invalid_client' })
        const c = corps as Record<string, string>
        if (c.grant_type === 'authorization_code') {
          if (c.code !== etat.code) return repondre(400, { error: 'invalid_grant' })
        } else if (c.grant_type === 'refresh_token') {
          if (c.refresh_token !== etat.refreshValide) return repondre(400, { error: 'invalid_grant' })
        } else return repondre(400, { error: 'unsupported_grant_type' })
        etat.compteur++
        etat.accessValide = `acc-${etat.compteur}`
        etat.refreshValide = `ref-${etat.compteur}`
        return repondre(200, { access_token: etat.accessValide, refresh_token: etat.refreshValide, expires_in: 43199 })
      }

      // L'API et l'envoi d'images : jeton et en-têtes obligatoires.
      if (req.headers.authorization !== `Bearer ${etat.accessValide}`) return repondre(401, { error: 'invalid_token' })
      if (req.headers.accept !== MEDIA) return repondre(406, { error: 'bad accept' })
      const api = chemin.startsWith('/api')
      const sous = chemin.replace(/^\/(api|upload)/, '')

      if (api && sous === '/me') return repondre(200, { id: '99', login: 'ma-boutique' })
      if (sous === '/sale/images' && req.method === 'POST') {
        if (!chemin.startsWith('/upload')) return repondre(404, {})
        if (type !== MEDIA) return repondre(415, {})
        return repondre(201, { location: `https://a.allegroimg.test/${encodeURIComponent((corps as any).url.split('/').pop())}`, expiresAt: 'x' })
      }
      if (api && sous.startsWith('/sale/shipping-rates')) return repondre(200, { shippingRates: etat.politiques ? [{ id: 'ship-1' }, { id: 'ship-2' }] : [] })
      if (api && sous.startsWith('/after-sales-service-conditions/return-policies')) return repondre(200, { returnPolicies: etat.politiques ? [{ id: 'ret-1' }] : [] })
      if (api && sous.startsWith('/after-sales-service-conditions/implied-warranties')) return repondre(200, { impliedWarranties: etat.politiques ? [{ id: 'war-1' }] : [] })
      if (api && sous.startsWith('/sale/matching-categories')) {
        return repondre(200, { matchingCategories: [{ id: 'cat-parent', leaf: false }, { id: 'cat-leaf', leaf: true }] })
      }
      if (api && sous.startsWith('/sale/products?')) {
        const q = new URLSearchParams(sous.split('?')[1])
        if (etat.eanConnu && q.get('ean') === EAN_VALIDE) return repondre(200, { products: [{ id: 'prod-cat-1', category: { id: 'cat-x' } }] })
        return repondre(200, { products: [] })
      }
      if (api && sous === '/sale/product-offers' && req.method === 'POST') {
        if (etat.reponse422) {
          return repondre(422, { errors: [{ code: 'MissingRequiredParameters', userMessage: 'Parametr "Kolor" jest wymagany', path: 'productSet[0].product.parameters' }] })
        }
        return repondre(202, { id: '17000000123' })
      }
      return repondre(404, { message: `unknown path ${chemin}` })
    })
  })

  return new Promise<{ base: string; journal: Appel[]; etat: typeof etat; fermer: () => void }>((resoudre) => {
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      resoudre({ base, journal, etat, fermer: () => server.close() })
    })
  })
}

async function refus(p: Promise<unknown>): Promise<AllegroRefus | null> {
  try {
    await p
    return null
  } catch (e) {
    return e as AllegroRefus
  }
}

async function main() {
  process.env.ALLEGRO_CLIENT_ID = CLIENT
  process.env.ALLEGRO_CLIENT_SECRET = SECRET
  process.env.ALLEGRO_TAUX_EUR_PLN = '4.3'
  process.env.JWT_SECRET ??= 'banc'
  delete process.env.ALLEGRO_SANDBOX

  console.log('Enregistrement et hôtes')
  verifier('le connecteur est dans le registre', connecteurMarche('ALLEGRO') === allegro)
  verifier('application configurée avec les deux clés', allegro.appConfiguree())
  const idAvant = process.env.ALLEGRO_CLIENT_ID
  delete process.env.ALLEGRO_CLIENT_ID
  verifier('sans ALLEGRO_CLIENT_ID, « manque » le nomme', !allegro.appConfiguree() && /ALLEGRO_CLIENT_ID/.test(allegro.manque()))
  process.env.ALLEGRO_CLIENT_ID = idAvant
  verifier('hôtes de production par défaut', hoteAuth() === 'https://allegro.pl' && hoteApi() === 'https://api.allegro.pl' && hoteUpload() === 'https://upload.allegro.pl')
  process.env.ALLEGRO_SANDBOX = '1'
  verifier(
    'ALLEGRO_SANDBOX=1 bascule les trois hôtes',
    hoteAuth() === 'https://allegro.pl.allegrosandbox.pl' &&
      hoteApi() === 'https://api.allegro.pl.allegrosandbox.pl' &&
      hoteUpload() === 'https://upload.allegro.pl.allegrosandbox.pl',
  )
  delete process.env.ALLEGRO_SANDBOX

  const faux = await fauxAllegro()
  process.env.ALLEGRO_AUTH_URL = `${faux.base}/authhost`
  process.env.ALLEGRO_API_URL = `${faux.base}/api`
  process.env.ALLEGRO_UPLOAD_URL = `${faux.base}/upload`
  verifier('les surcharges priment sur tout', hoteApi() === `${faux.base}/api`)

  try {
    console.log("\nLe lien d'autorisation")
    const lien = new URL(allegro.lienAutorisation('etat-xyz', 'https://api.test/cb'))
    verifier('chemin /auth/oauth/authorize', lien.pathname === '/authhost/auth/oauth/authorize')
    verifier(
      'response_type, client_id, redirect_uri, state, prompt',
      lien.searchParams.get('response_type') === 'code' &&
        lien.searchParams.get('client_id') === CLIENT &&
        lien.searchParams.get('redirect_uri') === 'https://api.test/cb' &&
        lien.searchParams.get('state') === 'etat-xyz' &&
        lien.searchParams.get('prompt') === 'confirm',
    )

    console.log("\nL'échange du code")
    const fin = await allegro.finaliser({ code: 'code-ok', state: 's' }, 'https://api.test/cb')
    const creds = allegro.lire(fin.data)
    verifier('jetons lus (Basic auth acceptée)', creds?.accessToken === 'acc-2' && creds?.refreshToken === 'ref-2')
    verifier("l'échéance vient de expires_in", (creds?.accessExpires ?? 0) > Date.now() + 43000 * 1000)
    verifier('le login de /me devient le libellé', fin.label === 'ma-boutique')
    const echange = faux.journal.find((a) => a.chemin.endsWith('/token'))
    verifier('redirect_uri renvoyé à l’échange', (echange?.corps as any)?.redirect_uri === 'https://api.test/cb')
    verifier('mauvais code : refus de liaison', (await refus(allegro.finaliser({ code: 'faux' }, 'https://api.test/cb')))?.liaison === true)
    verifier('retour avec error : refus lisible', /refusé/.test((await refus(allegro.finaliser({ error: 'access_denied' }, 'x')))?.message ?? ''))
    verifier('lire() rejette des identifiants incomplets', allegro.lire({ accessToken: 'a' }) === null)

    console.log('\nLa vérification et la rotation des jetons')
    const vue = await allegro.verifier(creds!)
    verifier('jeton frais : /me sans rotation', !vue)
    const me = faux.journal.filter((a) => a.chemin === '/api/me').pop()
    verifier('en-têtes Allegro (Accept, langue)', me?.entetes.accept === MEDIA && me?.entetes['accept-language'] === 'pl-PL')

    const perime = { ...creds!, accessExpires: Date.now() - 1000 }
    const majV = await allegro.verifier(perime)
    verifier('jeton périmé : rafraîchi et rendu par majCreds', (majV as any)?.majCreds?.refreshToken === 'ref-3', JSON.stringify(majV))
    verifier('l’ancien jeton de rafraîchissement est mort', (await refus(allegro.verifier({ ...creds!, accessExpires: Date.now() - 1000 })))?.liaison === true)

    // Un jeton d'accès refusé en 401 alors qu'il semblait valable : un seul rafraîchissement.
    const nouveau = (majV as any).majCreds
    faux.etat.accessValide = 'revoque'
    const apres401 = await allegro.verifier({ ...nouveau })
    verifier('401 : un rafraîchissement, puis ça passe', (apres401 as any)?.majCreds?.refreshToken === 'ref-4')

    // État frais pour les dépôts.
    const frais = { ...(apres401 as any).majCreds } as { accessToken: string; refreshToken: string; accessExpires: number }

    console.log('\nUn dépôt : nouvelle fiche, catégorie par le titre')
    const depot = await allegro.deposer(frais, annonce(), 'bijoux')
    const posts = faux.journal.filter((a) => a.methode === 'POST' && a.chemin === '/api/sale/product-offers')
    const offre = posts[0]?.corps
    verifier('URL de l’offre', depot.url === 'https://allegro.pl/oferta/17000000123', `${depot.url}`)
    verifier('pas de rotation inutile : pas de majCreds', depot.majCreds === undefined)
    const envoyees = faux.journal.filter((a) => a.chemin === '/upload/sale/images')
    verifier('une image envoyée par adresse, chacune', envoyees.length === 2 && envoyees[0].corps.url === 'https://img.test/a.jpg')
    verifier('Content-Type Allegro à l’envoi d’image', envoyees[0].entetes['content-type'] === MEDIA)
    verifier('les photos de l’offre sont celles qu’Allegro a hébergées', offre?.images?.[0]?.startsWith('https://a.allegroimg.test/'))
    verifier(
      'catégorie : la première FEUILLE de matching-categories',
      offre?.productSet?.[0]?.product?.category?.id === 'cat-leaf' &&
        faux.journal.some((a) => a.chemin.startsWith('/api/sale/matching-categories?name=' + encodeURIComponent('Bague chevalière acier inoxydable 316L'))),
    )
    verifier('sans EAN, une nouvelle fiche (nom, catégorie, images)', !!offre?.productSet?.[0]?.product?.name && Array.isArray(offre?.productSet?.[0]?.product?.images))
    verifier('aucune recherche par EAN sans EAN', !faux.journal.some((a) => a.chemin.startsWith('/api/sale/products?')))
    verifier('nom ≤ 75 caractères', offre?.name.length <= 75)
    verifier('prix converti : 14,90 € × 4,3 = 64.07 PLN', offre?.sellingMode?.price?.amount === '64.07' && offre?.sellingMode?.price?.currency === 'PLN' && offre?.sellingMode?.format === 'BUY_NOW')
    verifier('stock par défaut 10', offre?.stock?.available === 10)
    verifier(
      'la première livraison, retour et garantie',
      offre?.delivery?.shippingRates?.id === 'ship-1' && offre?.afterSalesServices?.returnPolicy?.id === 'ret-1' && offre?.afterSalesServices?.impliedWarranty?.id === 'war-1',
    )
    verifier('publication ACTIVE', offre?.publication?.status === 'ACTIVE')
    verifier('la description est échappée', /&amp; durable/.test(JSON.stringify(offre?.description)))

    console.log('\nUn dépôt par EAN : la fiche existante est réutilisée')
    faux.etat.eanConnu = true
    const avant = faux.journal.length
    await allegro.deposer(frais, annonce({ ean: EAN_VALIDE }), 'bijoux')
    const suite = faux.journal.slice(avant)
    const offreEan = suite.find((a) => a.chemin === '/api/sale/product-offers')?.corps
    verifier('recherche /sale/products?ean=', suite.some((a) => a.chemin.startsWith(`/api/sale/products?ean=${EAN_VALIDE}`)))
    verifier('productSet référence la fiche par id', offreEan?.productSet?.[0]?.product?.id === 'prod-cat-1' && !offreEan?.productSet?.[0]?.product?.name)
    verifier('plus de recherche de catégorie', !suite.some((a) => a.chemin.includes('matching-categories')))

    console.log('\nEAN inconnu d’Allegro : nouvelle fiche, EAN lu dans les caractéristiques')
    faux.etat.eanConnu = false
    const avant2 = faux.journal.length
    await allegro.deposer(frais, annonce({ attributes: { EAN: EAN_VALIDE } }), 'bijoux')
    const suite2 = faux.journal.slice(avant2)
    verifier('l’EAN est cherché puis la catégorie par le titre', suite2.some((a) => a.chemin.startsWith('/api/sale/products?')) && suite2.some((a) => a.chemin.includes('matching-categories')))
    const refEan = await refus(allegro.deposer(frais, annonce({ ean: '4006381333932' }), 'x'))
    verifier('un EAN à clé fausse est refusé chez nous', /clé de contrôle/.test(refEan?.message ?? ''))

    console.log('\nLes politiques du vendeur')
    faux.etat.politiques = false
    const avant3 = faux.journal.length
    const sansPol = await refus(allegro.deposer(frais, annonce(), 'x'))
    verifier('sans tarif ni retour ni garantie : refus en français', /Créez-le dans Allegro/.test(sansPol?.message ?? '') && /tarif de livraison/.test(sansPol?.message ?? ''))
    verifier('refus sur l’annonce, pas la liaison', sansPol?.liaison === false)
    verifier('ni photo envoyée ni offre déposée', !faux.journal.slice(avant3).some((a) => a.methode === 'POST'))
    faux.etat.politiques = true

    console.log('\nLes erreurs HTTP')
    faux.etat.reponse422 = true
    const e422 = await refus(allegro.deposer(frais, annonce(), 'x'))
    verifier('422 : message Allegro traduit, champ nommé', /obligatoire manquante/.test(e422?.message ?? '') && /parameters/.test(e422?.message ?? '') && /Kolor/.test(e422?.message ?? ''), e422?.message)
    verifier('422 : refus d’annonce', e422 instanceof AllegroRefus && e422.liaison === false)
    faux.etat.reponse422 = false
    verifier('traduireErreurs422 sans errors : liste vide', traduireErreurs422({}).length === 0)

    console.log('\nLe prix')
    verifier('devise déjà PLN : pas de conversion', (await prixEnPln(annonce({ currency: 'PLN', sellingPrice: 100 }))) === '100.00')
    verifier('arrondi à deux décimales', (await prixEnPln(annonce({ sellingPrice: 9.99 }))) === '42.96')

    console.log('\nLes sous-hôtes et la rotation en dépôt')
    const expire = { ...frais, accessExpires: Date.now() - 5 }
    const dep2 = await allegro.deposer(expire, annonce(), 'x')
    verifier('un dépôt qui rafraîchit rend la nouvelle paire', typeof (dep2.majCreds as any)?.refreshToken === 'string' && (dep2.majCreds as any).refreshToken !== frais.refreshToken)
  } finally {
    faux.fermer()
  }

  // Les erreurs d'API fixes, sans serveur : 403 / 429 sur un second faux minimal.
  const mini = createServer((req, res) => {
    if (req.url?.startsWith('/forbidden')) { res.writeHead(403); return res.end('{}') }
    res.writeHead(429, { 'Retry-After': '30' })
    res.end('{}')
  })
  await new Promise<void>((r) => mini.listen(0, '127.0.0.1', () => r()))
  const port = (mini.address() as { port: number }).port
  const neuf = { accessToken: 'a', refreshToken: 'r', accessExpires: Date.now() + 3600_000 }
  process.env.ALLEGRO_API_URL = `http://127.0.0.1:${port}/forbidden`
  const e403 = await refus(allegro.verifier(neuf))
  verifier('403 : compte non vérifié / droit manquant, liaison', /403/.test(e403?.message ?? '') && /vérifi/.test(e403?.message ?? '') && e403?.liaison === true)
  process.env.ALLEGRO_API_URL = `http://127.0.0.1:${port}/slow`
  const e429 = await refus(allegro.verifier(neuf))
  verifier('429 : patienter, avec le délai donné', /patientez 30 s/.test(e429?.message ?? '') && e429?.liaison === false)
  mini.close()

  console.log(echecs ? `\nAllegro : ${echecs} échec(s).` : '\nAllegro : tout passe.')
  // `process.exitCode`, jamais `process.exit()` : voir check-kaufland.ts.
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
