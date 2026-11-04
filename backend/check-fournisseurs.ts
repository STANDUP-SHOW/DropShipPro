import http from 'http'

/**
 * Éprouve les connecteurs fournisseurs contre un faux serveur.
 *
 * **Ce que ce banc prouve, et ce qu'il ne prouve pas.** Il prouve que le code
 * appelle les bonnes adresses, lit les bons champs, réunit prix et stock,
 * traduit les refus en messages utiles, et ne s'arrête pas sur une référence
 * retirée du catalogue. Il ne prouve PAS que le contrat d'API est le bon : pour
 * ça il faudrait une vraie clé BigBuy et un vrai compte CJ, que nous n'avons
 * pas. Le premier vendeur qui relie son compte sera le premier vrai essai, et
 * c'est écrit tel quel dans le mémo.
 */

const PORT = 8793
const BASE = `http://127.0.0.1:${PORT}`

process.env.BIGBUY_API_BASE = `${BASE}/bigbuy`
process.env.CJ_API_BASE = `${BASE}/cj`
process.env.PRINTFUL_API_BASE = `${BASE}/printful`
process.env.PRINTIFY_API_BASE = `${BASE}/printify`

const { findConnector, SupplierError } = await import('./src/services/supplierConnectors.js')

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const serveur = http.createServer((req, res) => {
  const url = req.url ?? ''
  const repondre = (code: number, corps: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corps))
  }

  // --- BigBuy ---------------------------------------------------------------
  if (url.startsWith('/bigbuy/')) {
    if (req.headers.authorization !== 'Bearer bonne-cle') return repondre(401, { error: 'unauthorized' })

    // Fiche complète (import par l'API, 30/10/2026).
    if (url.includes('/product/FICHE.json')) return repondre(200, { sku: 'S-1', wholesalePrice: '12.40', category: 2403, weight: 0.8 })
    if (url.includes('/productinformation/FICHE')) {
      return repondre(200, [{ name: 'Lampe de bureau', description: '<p>Bras <b>articulé</b></p><p>LED 5 W</p>' }])
    }
    if (url.includes('/productimages/FICHE')) {
      return repondre(200, { images: [{ url: 'https://img.bb/2.jpg' }, { url: 'https://img.bb/1.jpg', isCover: true }] })
    }
    if (url.includes('/productstock/EPUISE')) return repondre(200, { stocks: [{ quantity: 0 }] })
    if (url.includes('/productstock/RETIRE')) return repondre(404, { error: 'not found' })
    if (url.includes('/productstock/')) return repondre(200, { stocks: [{ quantity: 3 }, { quantity: 5 }] })

    if (url.includes('/productinformation/CHER')) return repondre(200, { wholesalePrice: 61.5 })
    if (url.includes('/productinformation/')) return repondre(200, { wholesalePrice: 40 })
  }

  // --- CJ Dropshipping ------------------------------------------------------
  if (url.startsWith('/cj/')) {
    if (url.includes('getAccessToken')) {
      let corps = ''
      req.on('data', (c) => (corps += c))
      req.on('end', () => {
        const { email } = JSON.parse(corps || '{}')
        if (email !== 'moi@exemple.fr') return repondre(200, { message: 'Identifiants refusés' })
        repondre(200, { data: { accessToken: 'jeton-valide' } })
      })
      return
    }
    if (req.headers['cj-access-token'] !== 'jeton-valide') return repondre(401, { error: 'unauthorized' })
    if (url.includes('/product/getCategory')) {
      return repondre(200, {
        data: [
          {
            categoryFirstName: 'Home & Garden',
            categoryFirstList: [
              { categorySecondName: 'Kitchen', categorySecondList: [{ categoryId: 'K1' }, { categoryId: 'K2' }] },
              { categorySecondName: 'Empty', categorySecondList: [] },
            ],
          },
        ],
      })
    }
    if (url.includes('/product/list')) {
      const q = new URL(url, BASE).searchParams
      if (q.get('categoryId') === 'K1') return repondre(200, { data: { list: [{ pid: 'A1', productNameEn: 'Pan', sellPrice: '4.5' }, { pid: 'A2', productNameEn: 'Pot', sellPrice: 6 }] } })
      if (q.get('categoryId') === 'K2') return repondre(200, { data: { list: [{ pid: 'B1', productNameEn: 'Knife', sellPrice: 3 }] } })
      if (q.get('createTimeFrom')) {
        return repondre(200, {
          data: {
            list: [
              { pid: 'N1', productNameEn: 'New lamp', sellPrice: 9, createTime: new Date().toISOString() },
              { pid: 'OLD', productNameEn: 'Old lamp', sellPrice: 9, createTime: '2020-01-01 10:00:00' },
            ],
          },
        })
      }
      return repondre(200, { data: { list: [] } })
    }
    if (url.includes('/product/query')) {
      if (url.includes('pid=ABSENT')) return repondre(200, { result: false, message: 'product not found', data: null })
      return repondre(200, {
        result: true,
        data: {
          pid: 'F1',
          productNameEn: 'Desk lamp',
          productImage: '["https://img.cj/1.jpg","https://img.cj/2.jpg"]',
          productKeyEn: 'Color-Size',
          categoryName: 'Lamps',
          sellPrice: '7.20 -- 9.10',
          description: '<p>Adjustable <b>arm</b></p><br/>LED',
          variants: [
            { vid: 'V1', variantKey: 'Black-S', variantSellPrice: 7.2, variantImage: 'https://img.cj/v1.jpg' },
            { vid: 'V2', variantKey: 'White-L', variantSellPrice: 9.1, variantImage: 'https://img.cj/1.jpg' },
          ],
        },
      })
    }
    if (url.includes('pid=VIDE')) return repondre(200, { data: [] })
    return repondre(200, { data: [{ variantSellPrice: 18.4 }, { variantSellPrice: 12.9 }] })
  }

  // --- Printful (Catalog API v1) et Printify (boutique), 30/10/2026 ----------
  if (url.startsWith('/printful/')) {
    if (req.headers.authorization !== 'Bearer jeton-pf') return repondre(401, { code: 401 })
    if (url === '/printful/store') return repondre(200, { code: 200, result: { id: 1 } })
    if (url === '/printful/categories') {
      return repondre(200, { code: 200, result: { categories: [{ id: 1, parent_id: 0, title: "Vêtements homme" }, { id: 24, parent_id: 1, title: 'T-shirts' }] } })
    }
    if (url === '/printful/products?category_id=1') {
      return repondre(200, { code: 200, result: [{ id: 71, title: 'Unisex Staple T-Shirt', image: 'https://img.pf/71.jpg', currency: 'EUR' }, { id: 9, title: 'Ancien', is_discontinued: true }] })
    }
    if (url === '/printful/products/71') {
      return repondre(200, {
        code: 200,
        result: {
          product: { id: 71, title: 'Unisex Staple T-Shirt', type_name: 'T-Shirt', brand: 'Bella + Canvas', model: '3001', image: 'https://img.pf/71.jpg', currency: 'EUR', description: '<p>Soft <b>cotton</b></p>' },
          variants: [
            { id: 4011, name: 'Black / S', color: 'Black', size: 'S', image: 'https://img.pf/4011.jpg', price: '11.50', in_stock: true },
            { id: 4012, name: 'White / L', color: 'White', size: 'L', image: 'https://img.pf/71.jpg', price: '9.95', in_stock: false },
          ],
        },
      })
    }
    return repondre(404, { code: 404, result: 'Not found' })
  }
  if (url.startsWith('/printify/')) {
    if (req.headers.authorization !== 'Bearer jeton-py') return repondre(401, { errors: 'Unauthenticated' })
    if (url === '/printify/v1/shops.json') return repondre(200, [{ id: 555, title: 'Ma boutique' }])
    const produit = {
      id: 'abc',
      title: 'Mug Café',
      description: '<p>Céramique 330 ml</p>',
      tags: ['mug', 'café'],
      options: [{ name: 'Colors', values: [{ id: 1, title: 'White' }, { id: 2, title: 'Black' }] }],
      variants: [
        { id: 11, title: 'White', cost: 516, price: 1200, is_enabled: true, is_available: true },
        { id: 12, title: 'Black', cost: 420, price: 1200, is_enabled: false, is_available: true },
        { id: 13, title: 'Black 2', cost: 600, price: 1300, is_enabled: true, is_available: true },
      ],
      images: [{ src: 'https://img.py/2.jpg' }, { src: 'https://img.py/1.jpg', is_default: true }],
    }
    if (url === '/printify/v1/shops/555/products.json?limit=50') return repondre(200, { current_page: 1, data: [produit] })
    if (url === '/printify/v1/shops/555/products/abc.json') return repondre(200, produit)
    return repondre(404, { error: 'not found' })
  }

  repondre(404, { error: 'not found' })
})

await new Promise<void>((r) => serveur.listen(PORT, '127.0.0.1', r))

try {
  const bigbuy = findConnector('bigbuy')!
  const cj = findConnector('cjdropshipping')!

  // --- BigBuy : le cas nominal ---------------------------------------------
  const releves = await bigbuy.fetchPrices(['NORMAL', 'CHER', 'EPUISE', 'RETIRE'], { apiKey: 'bonne-cle' })
  const par = new Map(releves.map((r) => [r.ref, r]))

  exige(par.get('NORMAL')?.price === 40, `prix lu : ${par.get('NORMAL')?.price}, attendu 40`)
  // Le stock est la somme des entrepôts : 3 + 5.
  exige(par.get('NORMAL')?.stock === 8, `stock lu : ${par.get('NORMAL')?.stock}, attendu 8 (3 + 5)`)
  exige(par.get('NORMAL')?.available === true, 'un produit en stock est marqué indisponible')

  exige(par.get('CHER')?.price === 61.5, `prix lu : ${par.get('CHER')?.price}, attendu 61,5`)

  exige(par.get('EPUISE')?.stock === 0, 'un stock à zéro n’est pas relevé comme tel')
  exige(par.get('EPUISE')?.available === false, 'un produit à zéro est marqué disponible')

  // Une référence retirée du catalogue ne doit pas arrêter le relevé entier.
  exige(par.get('RETIRE') !== undefined, 'une référence retirée interrompt le relevé des autres')
  exige(par.get('RETIRE')?.available === false, 'une référence retirée est marquée disponible')

  // --- BigBuy : la clé refusée doit être actionnable ------------------------
  let erreur: unknown = null
  try {
    await bigbuy.fetchPrices(['NORMAL'], { apiKey: 'mauvaise-cle' })
  } catch (e) {
    erreur = e
  }
  exige(erreur instanceof SupplierError, 'une clé refusée ne lève pas une SupplierError')
  exige(
    (erreur as InstanceType<typeof SupplierError>)?.actionnable === true,
    'une clé refusée doit être signalée comme corrigeable par le vendeur',
  )
  exige(
    /clé/i.test((erreur as Error)?.message ?? ''),
    `le message ne parle pas de la clé : « ${(erreur as Error)?.message} »`,
  )

  // Aucune clé enregistrée : refus immédiat, sans appel réseau.
  let sansCle: unknown = null
  try {
    await bigbuy.fetchPrices(['NORMAL'], {})
  } catch (e) {
    sansCle = e
  }
  exige((sansCle as InstanceType<typeof SupplierError>)?.actionnable === true, 'une clé absente doit être actionnable')

  // --- CJ : jeton obtenu puis réutilisé ------------------------------------
  const cjReleves = await cj.fetchPrices(['P1', 'VIDE'], { email: 'moi@exemple.fr', apiKey: 'secret' })
  const cjPar = new Map(cjReleves.map((r) => [r.ref, r]))

  // Le prix retenu est le plus bas des variantes : c'est lui qui décide de la
  // marge minimale.
  exige(cjPar.get('P1')?.price === 12.9, `prix CJ : ${cjPar.get('P1')?.price}, attendu 12,9 (le plus bas)`)
  exige(cjPar.get('P1')?.currency === 'USD', 'CJ facture en dollars, la devise doit le dire')
  exige(cjPar.get('P1')?.stock === null, 'CJ ne donne pas la quantité : inventer un zéro ferait passer le produit pour épuisé')
  exige(cjPar.get('VIDE')?.available === false, 'un produit sans variante est marqué disponible')

  let cjErreur: unknown = null
  try {
    await cj.fetchPrices(['P1'], { email: 'inconnu@exemple.fr', apiKey: 'secret' })
  } catch (e) {
    cjErreur = e
  }
  exige(
    (cjErreur as InstanceType<typeof SupplierError>)?.actionnable === true,
    'des identifiants CJ refusés doivent être signalés comme corrigeables',
  )

  // --- CJ : rayons, produits d'un rayon, nouveautés (14/10/2026) ----------
  const idsCj = { email: 'moi@exemple.fr', apiKey: 'secret' }
  const rayonsCj = await cj.listerRayons!(idsCj)
  exige(rayonsCj.length === 1, `rayons CJ : ${rayonsCj.length}, attendu 1 (un rayon sans sous-catégorie ne s'affiche pas)`)
  exige(rayonsCj[0]?.label === 'Home & Garden › Kitchen', `libellé du rayon CJ : ${rayonsCj[0]?.label}`)
  const duRayon = await cj.produitsDuRayon!(rayonsCj[0].id, idsCj)
  exige(
    duRayon.map((p) => p.ref).join(',') === 'A1,B1,A2',
    `rayon CJ mélangé entre sous-catégories : ${duRayon.map((p) => p.ref).join(',')}, attendu A1,B1,A2`,
  )
  exige(duRayon[0]?.prix === 4.5 && duRayon[0]?.devise === 'USD', 'prix CJ d’un rayon mal lu')
  const neufs = await cj.nouveautes!(idsCj)
  exige(neufs.map((p) => p.ref).join(',') === 'N1', `nouveautés CJ : ${neufs.map((p) => p.ref).join(',')}, attendu N1 seul (l'ancien est écarté)`)

  // --- Import par l'API : fiche complète CJ et BigBuy (30/10/2026) -------
  const ficheCj = await cj.fetchProduct!('F1', idsCj)
  exige(ficheCj.title === 'Desk lamp', `titre CJ : ${ficheCj.title}`)
  exige(ficheCj.price === 7.2 && ficheCj.currency === 'USD', `prix CJ : ${ficheCj.price} ${ficheCj.currency}, attendu 7,2 USD (variante la moins chère)`)
  exige(
    ficheCj.images.join(',') === 'https://img.cj/1.jpg,https://img.cj/2.jpg,https://img.cj/v1.jpg',
    `galerie CJ : ${ficheCj.images.join(',')}`,
  )
  exige(
    JSON.stringify(ficheCj.variants) === JSON.stringify({ Color: ['Black', 'White'], Size: ['S', 'L'] }),
    `options CJ : ${JSON.stringify(ficheCj.variants)}`,
  )
  exige(ficheCj.description === 'Adjustable arm\nLED', `description CJ : ${JSON.stringify(ficheCj.description)}`)
  exige(ficheCj.category === 'Lamps', `catégorie CJ : ${ficheCj.category}`)
  let absentCj: unknown = null
  try {
    await cj.fetchProduct!('ABSENT', idsCj)
  } catch (e) {
    absentCj = e
  }
  exige(/product not found/.test((absentCj as Error)?.message ?? ''), `refus CJ mal relayé : ${(absentCj as Error)?.message}`)

  const ficheBb = await bigbuy.fetchProduct!('FICHE', { apiKey: 'bonne-cle' })
  exige(ficheBb.title === 'Lampe de bureau', `titre BigBuy : ${ficheBb.title}`)
  exige(ficheBb.price === 12.4 && ficheBb.currency === 'EUR', `prix BigBuy : ${ficheBb.price} ${ficheBb.currency}`)
  exige(ficheBb.images.join(',') === 'https://img.bb/1.jpg,https://img.bb/2.jpg', `galerie BigBuy (couverture d'abord) : ${ficheBb.images.join(',')}`)
  exige(ficheBb.available === true, 'fiche BigBuy en stock marquée indisponible')
  exige(ficheBb.category === '2403', `catégorie BigBuy : ${ficheBb.category}`)
  let absentBb: unknown = null
  try {
    await bigbuy.fetchProduct!('RETIRE', { apiKey: 'bonne-cle' })
  } catch (e) {
    absentBb = e
  }
  exige(absentBb instanceof SupplierError, 'une fiche BigBuy introuvable doit lever une SupplierError')

  // --- Printful et Printify : import par l'API (30/10/2026) ---------------
  const pf = findConnector('printful')!
  const idsPf = { accessToken: 'jeton-pf' }
  await pf.verifier!(idsPf)
  let refusPf: unknown = null
  try {
    await pf.verifier!({ accessToken: 'faux' })
  } catch (e) {
    refusPf = e
  }
  exige((refusPf as InstanceType<typeof SupplierError>)?.actionnable === true, 'un jeton Printful refusé doit être actionnable')
  const rayonsPf = await pf.listerRayons!(idsPf)
  exige(rayonsPf.map((r) => r.id).join(',') === '1', `rayons Printful : ${rayonsPf.map((r) => r.id).join(',')}, attendu 1 (premier niveau)`)
  const listePf = await pf.produitsDuRayon!('1', idsPf)
  exige(listePf.map((p) => p.ref).join(',') === '71', `produits Printful : ${listePf.map((p) => p.ref).join(',')}, attendu 71 (l'arrêté écarté)`)
  exige(listePf[0]?.prix === null, 'la liste Printful ne doit pas inventer de prix')
  const fichePf = await pf.fetchProduct!('71', idsPf)
  exige(fichePf.price === 9.95 && fichePf.currency === 'EUR', `prix Printful : ${fichePf.price} ${fichePf.currency}`)
  exige(fichePf.images.join(',') === 'https://img.pf/71.jpg,https://img.pf/4011.jpg', `galerie Printful : ${fichePf.images.join(',')}`)
  exige(JSON.stringify(fichePf.variants) === JSON.stringify({ Couleur: ['Black', 'White'], Taille: ['S', 'L'] }), `options Printful : ${JSON.stringify(fichePf.variants)}`)
  exige(fichePf.description === 'Soft cotton' && fichePf.available === true, `fiche Printful : ${fichePf.description} / ${fichePf.available}`)
  const prixPf = await pf.fetchPrices(['71', '404'], idsPf)
  exige(prixPf[0]?.price === 9.95 && prixPf[1]?.available === false, `relevé Printful : ${JSON.stringify(prixPf)}`)

  const py = findConnector('printify')!
  const idsPy = { accessToken: 'jeton-py', shopId: '555' }
  await py.verifier!(idsPy)
  let mauvaiseBoutique: unknown = null
  try {
    await py.verifier!({ accessToken: 'jeton-py', shopId: '999' })
  } catch (e) {
    mauvaiseBoutique = e
  }
  exige(/999/.test((mauvaiseBoutique as Error)?.message ?? ''), `boutique Printify étrangère acceptée : ${(mauvaiseBoutique as Error)?.message}`)
  const listePy = await py.produitsDuRayon!('555', idsPy)
  exige(listePy[0]?.ref === 'abc' && listePy[0]?.prix === 5.16, `liste Printify : ${JSON.stringify(listePy)}`)
  const fichePy = await py.fetchProduct!('abc', idsPy)
  // 4.20 belongs to a disabled variant: the cheapest variant on sale is 5.16.
  exige(fichePy.price === 5.16 && fichePy.currency === 'USD', `coût Printify : ${fichePy.price} ${fichePy.currency}`)
  exige(fichePy.images.join(',') === 'https://img.py/1.jpg,https://img.py/2.jpg', `galerie Printify : ${fichePy.images.join(',')}`)
  exige(JSON.stringify(fichePy.variants) === JSON.stringify({ Colors: ['White', 'Black'] }), `options Printify : ${JSON.stringify(fichePy.variants)}`)
  let sansBoutique: unknown = null
  try {
    await py.fetchProduct!('abc', { accessToken: 'jeton-py' })
  } catch (e) {
    sansBoutique = e
  }
  exige((sansBoutique as InstanceType<typeof SupplierError>)?.actionnable === true, 'Printify sans Shop ID doit être actionnable')

  console.log(echecs === 0 ? 'Connecteurs fournisseurs : tout passe.' : `${echecs} échec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  serveur.close()
}
