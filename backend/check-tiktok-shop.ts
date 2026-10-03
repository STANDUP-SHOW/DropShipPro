import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import type { Product } from '@prisma/client'
import { signatureTiktokShop, tiktokShop, TiktokShopRefus, type TiktokShopCreds } from './src/services/tiktokShop.js'
import { connecteurMarche } from './src/services/marchesApi.js'

/**
 * Le connecteur TikTok Shop, éprouvé contre un faux serveur (API + auth) qui
 * recalcule la signature 202309 EN DUR, sans passer par la fonction du
 * connecteur — sinon une faute dans la fonction serait des deux côtés.
 *
 *   cd backend && npx tsx check-tiktok-shop.ts
 *
 * Ce qu'il ne prouve pas : aucun vrai TikTok Shop n'a jamais vu ce code.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const APP_KEY = 'appkey123'
const APP_SECRET = 'secret456'
const maintenant = () => Math.floor(Date.now() / 1000)

/** Le contrat de signature, écrit à la main, indépendamment du connecteur. */
function signatureAttendue(chemin: string, query: URLSearchParams, corps: string, multipart: boolean): string {
  const cles = [...query.keys()].filter((k) => k !== 'sign' && k !== 'access_token').sort()
  let chaine = chemin
  for (const k of cles) chaine += k + query.get(k)
  if (!multipart) chaine += corps
  chaine = APP_SECRET + chaine + APP_SECRET
  return createHmac('sha256', APP_SECRET).update(chaine).digest('hex')
}

const EAN = '4006381333931'
function annonce(surcharge: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-tt-1',
    title: 'bague source',
    aiTitle: 'Bague chevalière acier inoxydable 316L',
    aiDescription: 'Une bague solide.\nSe porte tous les jours.',
    description: 'brut',
    bulletPoints: ['Acier 316L', 'Anti-allergie'],
    sellingPrice: 14.9 as never,
    supplierStock: null,
    images: ['__BASE__/img/1.jpg', '__BASE__/img/2.jpg'],
    exportImages: null,
    attributes: { EAN },
    ean: null,
    ...surcharge,
  } as unknown as Product
}

interface Appel {
  methode: string
  chemin: string
  query: URLSearchParams
  corps: string
  contentType: string
  jeton: string
  signatureOk: boolean
}

const IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])

function faux() {
  const journal: Appel[] = []
  let base = ''
  const etat = { tokenExpire: false, erreurCategorie: false, erreurProduit: null as null | { code: number; message: string } }

  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const brut = Buffer.concat(morceaux)
      const url = new URL(req.url ?? '', 'http://x')
      const rep = (http: number, corps: unknown) => {
        res.writeHead(http, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(corps))
      }

      if (url.pathname === '/img/1.jpg' || url.pathname === '/img/2.jpg') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' })
        return res.end(IMAGE)
      }

      if (url.pathname.startsWith('/img/')) return rep(404, { code: 404, message: 'no image' })

      // L'auth : aucun jeton, aucune signature — les clés de l'application suffisent.
      if (url.pathname === '/api/v2/token/get') {
        journal.push({ methode: req.method!, chemin: url.pathname, query: url.searchParams, corps: '', contentType: '', jeton: '', signatureOk: true })
        if (url.searchParams.get('grant_type') !== 'authorized_code' || url.searchParams.get('app_secret') !== APP_SECRET) {
          return rep(200, { code: 36004000, message: 'invalid app credentials' })
        }
        if (url.searchParams.get('auth_code') !== 'CODE1') return rep(200, { code: 36004001, message: 'auth_code invalid' })
        return rep(200, {
          code: 0,
          message: 'success',
          data: { access_token: 'AT1', access_token_expire_in: maintenant() + 3600, refresh_token: 'RT1', refresh_token_expire_in: maintenant() + 86400 * 30 },
        })
      }
      if (url.pathname === '/api/v2/token/refresh') {
        journal.push({ methode: req.method!, chemin: url.pathname, query: url.searchParams, corps: '', contentType: '', jeton: '', signatureOk: true })
        if (url.searchParams.get('grant_type') !== 'refresh_token' || url.searchParams.get('refresh_token') !== 'RT1') {
          return rep(200, { code: 36004002, message: 'refresh_token invalid' })
        }
        return rep(200, {
          code: 0,
          message: 'success',
          data: { access_token: 'AT2', access_token_expire_in: maintenant() + 3600, refresh_token: 'RT2', refresh_token_expire_in: maintenant() + 86400 * 30 },
        })
      }

      const contentType = String(req.headers['content-type'] ?? '')
      const multipart = contentType.startsWith('multipart/form-data')
      const corps = multipart ? '' : brut.toString('utf8')
      const jeton = String(req.headers['x-tts-access-token'] ?? '')
      const signatureOk = url.searchParams.get('sign') === signatureAttendue(url.pathname, url.searchParams, corps, multipart)
      journal.push({ methode: req.method!, chemin: url.pathname, query: url.searchParams, corps, contentType, jeton, signatureOk })

      if (url.searchParams.get('app_key') !== APP_KEY) return rep(200, { code: 105001, message: 'invalid app_key' })
      if (!signatureOk) return rep(200, { code: 106001, message: 'invalid sign' })
      if (etat.tokenExpire || (jeton !== 'AT1' && jeton !== 'AT2')) return rep(200, { code: 105002, message: 'access token expired' })

      if (url.pathname === '/authorization/202309/shops') {
        return rep(200, { code: 0, message: 'Success', data: { shops: [{ id: 'SHOP9', name: 'Ma Boutique FR', region: 'FR', cipher: 'CIPHER9', seller_type: 'LOCAL' }] } })
      }
      // Les appels de boutique portent le shop_cipher ; l'upload d'image n'en porte pas.
      const sansCipher = url.pathname === '/product/202309/images/upload'
      if (!sansCipher && url.searchParams.get('shop_cipher') !== 'CIPHER9') return rep(200, { code: 105003, message: 'shop_cipher required' })

      if (url.pathname === '/product/202309/images/upload') {
        if (!multipart || !brut.includes(IMAGE)) return rep(200, { code: 12052001, message: 'image data missing' })
        return rep(200, { code: 0, message: 'Success', data: { uri: `tos-maliva-i-o3syd03w52-us/img${journal.filter((a) => a.chemin.endsWith('/images/upload')).length}`, url: 'https://x', width: 800, height: 800 } })
      }
      if (url.pathname === '/product/202309/categories/recommend') {
        if (etat.erreurCategorie) return rep(200, { code: 12052100, message: 'no category found for this title' })
        return rep(200, { code: 0, message: 'Success', data: { leaf_category_id: '601226', categories: [{ id: '601226', is_leaf: true }] } })
      }
      if (url.pathname === '/logistics/202309/warehouses') {
        return rep(200, {
          code: 0,
          message: 'Success',
          data: {
            warehouses: [
              { id: 'W-RET', name: 'Retours', type: 'RETURN_WAREHOUSE', effect_status: 'ENABLED', is_default: true },
              { id: 'W-OFF', name: 'Ancien', type: 'SALES_WAREHOUSE', effect_status: 'DISABLED', is_default: false },
              { id: 'W-A', name: 'Entrepôt A', type: 'SALES_WAREHOUSE', effect_status: 'ENABLED', is_default: false },
              { id: 'W-DEF', name: 'Par défaut', type: 'SALES_WAREHOUSE', effect_status: 'ENABLED', is_default: true },
            ],
          },
        })
      }
      if (url.pathname === '/product/202309/products' && req.method === 'POST') {
        if (etat.erreurProduit) return rep(200, etat.erreurProduit)
        return rep(200, { code: 0, message: 'Success', data: { product_id: '1729592969712207012', skus: [{ id: 'S1' }] } })
      }
      return rep(404, { code: 404, message: `unknown ${url.pathname}` })
    })
  })

  return new Promise<{ base: string; journal: Appel[]; etat: typeof etat; fermer: () => void }>((ok) => {
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      ok({ base, journal, etat, fermer: () => server.close() })
    })
  })
}

async function refusDe(f: () => Promise<unknown>): Promise<TiktokShopRefus | null> {
  try {
    await f()
    return null
  } catch (e) {
    return e as TiktokShopRefus
  }
}

async function main() {
  console.log('Le signeur, contre une valeur calculée indépendamment')
  // Valeur de référence calculée avec openssl, hors de ce code :
  //   printf 'secret456' ; chaîne = secret456 + /product/202309/products + app_keyappkey123 + shop_cipherCIP + timestamp1700000000 + {"a":1} + secret456
  const attendu = createHmac('sha256', 'secret456')
    .update('secret456' + '/product/202309/products' + 'app_keyappkey123' + 'shop_cipherCIP' + 'timestamp1700000000' + '{"a":1}' + 'secret456')
    .digest('hex')
  const calcule = signatureTiktokShop(
    '/product/202309/products',
    { timestamp: '1700000000', sign: 'IGNORE', app_key: 'appkey123', access_token: 'IGNORE', shop_cipher: 'CIP' },
    '{"a":1}',
    'secret456',
  )
  verifier('sign et access_token exclus, tri alphabétique, secret aux deux bouts', calcule === attendu, calcule.slice(0, 16))
  verifier('un corps différent change la signature', calcule !== signatureTiktokShop('/product/202309/products', { app_key: 'appkey123', shop_cipher: 'CIP', timestamp: '1700000000' }, '{"a":2}', 'secret456'))
  verifier(
    'en multipart le corps est ignoré',
    signatureTiktokShop('/p', { a: '1' }, 'x', 's', true) === signatureTiktokShop('/p', { a: '1' }, 'y', 's', true),
  )
  verifier('sans corps = chaîne vide', signatureTiktokShop('/p', { a: '1' }, '', 's') === createHmac('sha256', 's').update('s/pa1s').digest('hex'))

  const f = await faux()
  process.env.TIKTOKSHOP_APP_KEY = APP_KEY
  process.env.TIKTOKSHOP_APP_SECRET = APP_SECRET
  process.env.TIKTOKSHOP_SERVICE_ID = 'SVC77'
  process.env.TIKTOKSHOP_API_URL = f.base
  process.env.TIKTOKSHOP_AUTH_URL = f.base
  delete process.env.TIKTOKSHOP_AUTHORIZE_URL

  try {
    console.log('\nEnregistrement et configuration')
    verifier('le connecteur est dans le registre', connecteurMarche('TIKTOK_SHOP') === tiktokShop)
    verifier('application configurée', tiktokShop.appConfiguree() && tiktokShop.manque() === '')
    verifier('lire refuse des identifiants incomplets', tiktokShop.lire({ accessToken: 'x' }) === null)

    console.log('\nLe lien d’autorisation')
    const lien = new URL(tiktokShop.lienAutorisation('ETAT.SIGNE', 'https://api/cb'))
    verifier('hôte par défaut services.tiktokshop.com', lien.origin + lien.pathname === 'https://services.tiktokshop.com/open/authorize')
    verifier('service_id et state', lien.searchParams.get('service_id') === 'SVC77' && lien.searchParams.get('state') === 'ETAT.SIGNE')
    process.env.TIKTOKSHOP_AUTHORIZE_URL = 'https://services.eu.tiktokshop.com/open/authorize'
    verifier('hôte surchargeable (Europe)', tiktokShop.lienAutorisation('e', 'r').startsWith('https://services.eu.tiktokshop.com/open/authorize?'))
    delete process.env.TIKTOKSHOP_AUTHORIZE_URL

    console.log('\nL’échange du code')
    const fin = await tiktokShop.finaliser({ code: 'CODE1' }, 'https://api/cb')
    const d = fin.data as Record<string, any>
    verifier('jetons gardés', d.accessToken === 'AT1' && d.refreshToken === 'RT1' && d.accessExpires > maintenant() && d.refreshExpires > maintenant())
    verifier('shop_cipher, id et région lus de la liste des boutiques', d.shopCipher === 'CIPHER9' && d.shopId === 'SHOP9' && d.region === 'FR')
    verifier('le nom de la boutique sert d’étiquette', fin.label === 'Ma Boutique FR')
    const tokenGet = f.journal.find((a) => a.chemin === '/api/v2/token/get')
    verifier('échange en GET avec grant_type=authorized_code', tokenGet?.methode === 'GET' && tokenGet.query.get('grant_type') === 'authorized_code')
    const shops = f.journal.find((a) => a.chemin === '/authorization/202309/shops')
    verifier('la liste des boutiques est signée et porte le jeton', !!shops?.signatureOk && shops.jeton === 'AT1')
    const refusCode = await refusDe(() => tiktokShop.finaliser({ code: 'MAUVAIS' }, 'r'))
    verifier('un code refusé donne un refus de liaison en français', refusCode?.liaison === true && /Relancez la connexion/.test(refusCode.message))
    const sansCode = await refusDe(() => tiktokShop.finaliser({}, 'r'))
    verifier('sans code, refus lisible', /aucun code/.test(sansCode?.message ?? ''))

    const creds = tiktokShop.lire(fin.data) as TiktokShopCreds
    verifier('lire relit ce que finaliser a produit', !!creds && creds.shopCipher === 'CIPHER9')

    console.log('\nLa vérification de compte')
    const v = await tiktokShop.verifier(creds)
    verifier('un GET signé sans effet, pas de rafraîchissement inutile', v === undefined && !f.journal.some((a) => a.chemin.includes('refresh')))

    console.log('\nLe rafraîchissement du jeton')
    const perime: TiktokShopCreds = { ...creds, accessExpires: maintenant() - 10 }
    const v2 = await tiktokShop.verifier(perime)
    const maj = (v2 as { majCreds?: Record<string, any> } | undefined)?.majCreds
    verifier('jeton périmé : refresh_token envoyé', f.journal.some((a) => a.chemin === '/api/v2/token/refresh' && a.query.get('refresh_token') === 'RT1'))
    verifier('les nouveaux jetons reviennent en majCreds', maj?.accessToken === 'AT2' && maj?.refreshToken === 'RT2')
    verifier('la boutique est conservée dans majCreds', maj?.shopCipher === 'CIPHER9')
    verifier('l’appel suivant porte le nouveau jeton', f.journal.filter((a) => a.chemin === '/authorization/202309/shops').at(-1)?.jeton === 'AT2')
    const liaisonMorte = await refusDe(() => tiktokShop.verifier({ ...creds, accessExpires: maintenant() - 10, refreshToken: 'RTVIEUX' }))
    verifier('refresh refusé : demande de reconnecter', liaisonMorte?.liaison === true && /Reconnectez|connexion/.test(liaisonMorte.message))
    const rtExpire = await refusDe(() => tiktokShop.verifier({ ...creds, accessExpires: maintenant() - 10, refreshExpires: maintenant() - 5 }))
    verifier('refresh_token expiré : demande de reconnecter', /expiré/.test(rtExpire?.message ?? ''))

    console.log('\nLe dépôt complet')
    f.journal.length = 0
    const produit = annonce({ images: [`${f.base}/img/1.jpg`, `${f.base}/img/2.jpg`] })
    const depot = await tiktokShop.deposer(creds, produit, 'peu importe')
    verifier('la note dit « en revue »', /En revue chez TikTok Shop/.test(depot.note ?? ''))
    verifier('la note porte l’identifiant du produit', /1729592969712207012/.test(depot.note ?? ''))
    verifier('pas de majCreds quand rien n’a tourné', depot.majCreds === undefined)

    const envoyes = f.journal.filter((a) => a.chemin !== '/img/1.jpg')
    verifier('toutes les requêtes signées valides', envoyes.every((a) => a.signatureOk))
    const uploads = f.journal.filter((a) => a.chemin === '/product/202309/images/upload')
    verifier('deux images téléversées en multipart', uploads.length === 2 && uploads.every((a) => a.contentType.startsWith('multipart/form-data')))
    verifier('l’octet de l’image est transmis (le faux le contrôle)', uploads.length === 2)
    const rec = f.journal.find((a) => a.chemin === '/product/202309/categories/recommend')
    verifier('catégorie demandée avec le titre IA', JSON.parse(rec?.corps ?? '{}').product_title === 'Bague chevalière acier inoxydable 316L')
    verifier('entrepôt de vente demandé', f.journal.some((a) => a.chemin === '/logistics/202309/warehouses' && a.methode === 'GET'))

    const post = f.journal.find((a) => a.chemin === '/product/202309/products')
    const c = JSON.parse(post?.corps ?? '{}')
    verifier('titre, catégorie', c.title === 'Bague chevalière acier inoxydable 316L' && c.category_id === '601226')
    verifier('images principales par uri', Array.isArray(c.main_images) && c.main_images.length === 2 && /^tos-maliva/.test(c.main_images[0].uri))
    verifier('description en HTML avec puces', /^<p>Une bague solide\.<\/p><p>Se porte tous les jours\.<\/p><ul><li>Acier 316L<\/li>/.test(c.description))
    const sku = c.skus?.[0]
    verifier('prix en chaîne décimale, EUR', sku?.price?.amount === '14.90' && sku?.price?.currency === 'EUR')
    verifier('entrepôt de vente par défaut choisi (ni retours, ni désactivé)', sku?.inventory?.[0]?.warehouse_id === 'W-DEF')
    verifier('sans stock fournisseur, dix', sku?.inventory?.[0]?.quantity === 10)
    verifier('référence vendeur = id produit', sku?.seller_sku === 'prod-tt-1')
    verifier('EAN transmis', sku?.identifier_code?.code === EAN && sku?.identifier_code?.type === 'EAN')
    verifier('pas d’attribut de vente pour un produit simple', Array.isArray(sku?.sales_attributes) && sku.sales_attributes.length === 0)
    verifier('poids et dimensions par défaut', c.package_weight?.unit === 'KILOGRAM' && c.package_dimensions?.unit === 'CENTIMETER')
    verifier('shop_cipher dans la requête du produit', post?.query.get('shop_cipher') === 'CIPHER9')
    verifier('pas de shop_cipher sur l’upload d’image', !uploads[0].query.has('shop_cipher'))

    const longTitre = annonce({ aiTitle: 'x'.repeat(400), images: [`${f.base}/img/1.jpg`] })
    f.journal.length = 0
    await tiktokShop.deposer(creds, longTitre, '')
    const c2 = JSON.parse(f.journal.find((a) => a.chemin === '/product/202309/products')?.corps ?? '{}')
    verifier('titre coupé à 255 caractères', c2.title.length === 255)
    const sansEan = annonce({ attributes: {}, images: [`${f.base}/img/1.jpg`] })
    f.journal.length = 0
    await tiktokShop.deposer(creds, sansEan, '')
    const c3 = JSON.parse(f.journal.find((a) => a.chemin === '/product/202309/products')?.corps ?? '{}')
    verifier('sans EAN, pas d’identifier_code', c3.skus[0].identifier_code === undefined)

    const dp = await tiktokShop.deposer(perime, annonce({ images: [`${f.base}/img/1.jpg`] }), '')
    verifier('un dépôt qui rafraîchit rend majCreds', (dp.majCreds as any)?.accessToken === 'AT2')

    console.log('\nCe que dit un refus')
    f.journal.length = 0
    const sansPhoto = await refusDe(() => tiktokShop.deposer(creds, annonce({ images: [] }), ''))
    verifier('sans photo : refus avant tout appel', /photo/.test(sansPhoto?.message ?? '') && f.journal.length === 0)
    const sansPrix = await refusDe(() => tiktokShop.deposer(creds, annonce({ sellingPrice: 0, images: [`${f.base}/img/1.jpg`] }), ''))
    verifier('prix zéro : refus avant tout appel', /prix/.test(sansPrix?.message ?? '') && f.journal.length === 0)
    const imageMorte = await refusDe(() => tiktokShop.deposer(creds, annonce({ images: [`${f.base}/img/absente.jpg`] }), ''))
    verifier('photo injoignable : refus lisible', /injoignable/.test(imageMorte?.message ?? '') && imageMorte?.liaison === false)

    f.etat.erreurCategorie = true
    const sansCat = await refusDe(() => tiktokShop.deposer(creds, annonce({ images: [`${f.base}/img/1.jpg`] }), ''))
    verifier('catégorie refusée : message au vendeur, pas la liaison', /catégorie/.test(sansCat?.message ?? '') && sansCat?.liaison === false)
    f.etat.erreurCategorie = false

    f.etat.erreurProduit = { code: 12052200, message: 'Missing required attribute: Brand' }
    const attr = await refusDe(() => tiktokShop.deposer(creds, annonce({ images: [`${f.base}/img/1.jpg`] }), ''))
    verifier('attribut manquant : message en français avec le détail', /exige une information de plus/.test(attr?.message ?? '') && /Brand/.test(attr?.message ?? '') && attr?.liaison === false)
    f.etat.erreurProduit = null

    f.etat.tokenExpire = true
    const exp = await refusDe(() => tiktokShop.deposer(creds, annonce({ images: [`${f.base}/img/1.jpg`] }), ''))
    verifier('jeton refusé : reconnecter, signalé comme liaison', exp?.liaison === true && /Reconnectez/.test(exp.message))
    f.etat.tokenExpire = false

    process.env.TIKTOKSHOP_APP_SECRET = 'autre-secret'
    const mauvaiseSignature = await refusDe(() => tiktokShop.verifier(creds))
    verifier('signature fausse refusée par le faux, remontée en refus', mauvaiseSignature instanceof TiktokShopRefus)
    process.env.TIKTOKSHOP_APP_SECRET = APP_SECRET

    delete process.env.TIKTOKSHOP_SERVICE_ID
    verifier('variable manquante nommée', !tiktokShop.appConfiguree() && /TIKTOKSHOP_SERVICE_ID/.test(tiktokShop.manque()))
  } finally {
    f.fermer()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTikTok Shop : tout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
