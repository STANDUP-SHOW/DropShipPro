/**
 * Banc : les neuf connecteurs de boutique du vendeur — WooCommerce, PrestaShop,
 * Magento, puis Drupal Commerce, BigCommerce, Wix, Shopware, Ecwid, Squarespace
 * (25/09/2026) — contre autant de faux serveurs dont le contrat est ÉCRIT EN DUR (leçon
 * Kaufland : un faux qui réutilise le code du connecteur ne prouve rien).
 *
 * Ce que chaque faux vérifie côté serveur : l'authentification telle que la
 * plateforme la lit, le corps tel que sa documentation le décrit, et il refuse
 * tout le reste. Les photos sont servies par le banc lui-même, en octets, pour
 * que PrestaShop et Magento les reçoivent en contenu comme en vrai.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { BoutiqueRefus, descriptionEnHtml, normaliserSiteUrl, telechargerImage, type FicheBoutique } from './src/services/boutiqueTiers.js'
import { publierWoo, readWooCredentials, verifierCompteWoo } from './src/services/woocommerce.js'
import { publierPresta, readPrestaCredentials, xmlProduit } from './src/services/prestashop.js'
import { publierMagento, readMagentoCredentials, verifierCompteMagento } from './src/services/magento.js'
import { publierDrupal, readDrupalCredentials, verifierCompteDrupal } from './src/services/drupalCommerce.js'
import { publierBigCommerce, readBigCommerceCredentials, verifierCompteBigCommerce } from './src/services/bigcommerce.js'
import { publierWix, readWixCredentials, verifierCompteWix } from './src/services/wix.js'
import { publierShopware, readShopwareCredentials, verifierCompteShopware } from './src/services/shopware.js'
import { publierEcwid, readEcwidCredentials, verifierCompteEcwid } from './src/services/ecwid.js'
import { publierSquarespace, readSquarespaceCredentials, verifierCompteSquarespace } from './src/services/squarespace.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

function lire(req: IncomingMessage): Promise<Buffer> {
  return new Promise((r) => {
    const m: Buffer[] = []
    req.on('data', (c) => m.push(c))
    req.on('end', () => r(Buffer.concat(m)))
  })
}

interface Appel {
  methode: string
  chemin: string
  auth: string
  type: string
  corps: string
}

function serveur(traiter: (a: Appel, res: import('node:http').ServerResponse) => void) {
  const journal: Appel[] = []
  const s = createServer(async (req, res) => {
    const brut = await lire(req)
    // Le multipart porte des octets d'image : latin1 les garde tels quels ; le reste est de l'UTF-8.
    const corps = brut.toString(/^multipart/.test(String(req.headers['content-type'] ?? '')) ? 'latin1' : 'utf8')
    const a: Appel = { methode: req.method!, chemin: req.url!, auth: String(req.headers.authorization ?? ''), type: String(req.headers['content-type'] ?? ''), corps }
    if (a.chemin === '/photo.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return res.end(PNG_1PX)
    }
    journal.push(a)
    traiter(a, res)
  })
  return new Promise<{ base: string; journal: Appel[]; fermer: () => void }>((ok) =>
    s.listen(0, '127.0.0.1', () => ok({ base: `http://127.0.0.1:${(s.address() as { port: number }).port}`, journal, fermer: () => s.close() })),
  )
}

const fiche = (base: string, surcharge: Partial<FicheBoutique> = {}): FicheBoutique => ({
  titre: 'Lampe de bureau LED articulée',
  descriptionHtml: descriptionEnHtml('Une lampe qui suit la main.\n\nTrois températures.', ['Bras articulé', 'USB-C']),
  courte: 'Une lampe qui suit la main.',
  prix: 34.9,
  sku: 'DSP-lampe-1',
  ean: '4006381333931',
  stock: 12,
  images: [`${base}/photo.png`, `${base}/photo.png`],
  categorie: 'Maison > Luminaires',
  attributs: [{ nom: 'Matière', valeur: 'Aluminium' }],
  handle: 'lampe-de-bureau-led-articulee',
  ...surcharge,
})

async function main() {
  console.log('Le socle commun')
  verifier('https ajouté, barre finale retirée', normaliserSiteUrl('ma-boutique.fr/') === 'https://ma-boutique.fr')
  verifier('un sous-dossier est gardé', normaliserSiteUrl('https://site.fr/shop/') === 'https://site.fr/shop')
  verifier('pas une adresse → null', normaliserSiteUrl('boutique') === null && normaliserSiteUrl('') === null)
  verifier('la description devient des paragraphes et une liste', descriptionEnHtml('a\n\nb <x>', ['p']) === '<p>a</p><p>b &lt;x&gt;</p><ul><li>p</li></ul>')

  // ------------------------------------------------------------- WooCommerce
  console.log('\nWooCommerce (REST wc/v3, Basic Auth, images par adresse)')
  {
    const CK = 'ck_abc'
    const CS = 'cs_def'
    const attendu = `Basic ${Buffer.from(`${CK}:${CS}`).toString('base64')}`
    let categories: Array<{ id: number; name: string }> = [{ id: 7, name: 'Luminaires' }]
    let produits: Record<number, unknown> = {}
    const s = await serveur((a, res) => {
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (a.auth !== attendu) return json(401, { code: 'woocommerce_rest_cannot_view', message: 'Désolé, vous ne pouvez pas lister les ressources.' })
      if (!a.chemin.startsWith('/wp-json/wc/v3/')) return json(404, { code: 'rest_no_route' })
      const chemin = a.chemin.slice('/wp-json/wc/v3'.length)
      if (a.methode === 'GET' && chemin.startsWith('/products/categories')) {
        const q = decodeURIComponent(/search=([^&]*)/.exec(chemin)?.[1] ?? '')
        return json(200, categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())))
      }
      if (a.methode === 'POST' && chemin === '/products/categories') {
        const c = { id: 40, name: JSON.parse(a.corps).name }
        categories = [...categories, c]
        return json(201, c)
      }
      if (a.methode === 'GET' && chemin.startsWith('/products?')) return json(200, [])
      if (a.methode === 'POST' && chemin === '/products') {
        const p = JSON.parse(a.corps)
        if (!p.name || !p.regular_price) return json(400, { code: 'rest_invalid_param' })
        if (Object.values(produits).some((x) => (x as { sku: string }).sku === p.sku)) {
          return json(400, { code: 'product_invalid_sku', message: 'UGS non valide ou en double.', data: { status: 400, resource_id: 501 } })
        }
        produits = { ...produits, 501: p }
        return json(201, { id: 501, permalink: 'https://ma-boutique.fr/produit/lampe', ...p })
      }
      if (a.methode === 'PUT' && chemin === '/products/501') {
        produits = { ...produits, 501: JSON.parse(a.corps) }
        return json(200, { id: 501, permalink: 'https://ma-boutique.fr/produit/lampe' })
      }
      return json(404, { code: 'rest_no_route', message: chemin })
    })
    try {
      verifier('rien sans les deux clés', readWooCredentials({ siteUrl: s.base, consumerKey: CK }) === null)
      const creds = readWooCredentials({ siteUrl: s.base, consumerKey: CK, consumerSecret: CS })!
      await verifierCompteWoo(creds)
      verifier('la vérification de compte passe par GET /products', s.journal.at(-1)?.chemin === '/wp-json/wc/v3/products?per_page=1')

      const depot = await publierWoo(creds, fiche(s.base))
      const post = s.journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/products'))!
      const corps = JSON.parse(post.corps)
      verifier('la fiche est créée en 201, avec son identifiant et son lien', depot.id === 501 && depot.lien?.includes('/produit/lampe') === true)
      verifier('le prix est une chaîne à deux décimales', corps.regular_price === '34.90')
      verifier('les images partent en ADRESSES absolues', corps.images.length === 2 && corps.images[0].src === `${s.base}/photo.png`)
      verifier('la catégorie existante est référencée par son identifiant, sans en créer', corps.categories?.[0]?.id === 7 && !s.journal.some((a) => a.methode === 'POST' && a.chemin.endsWith('/products/categories')))
      verifier('sku, stock, description HTML, attribut, EAN', corps.sku === 'DSP-lampe-1' && corps.stock_quantity === 12 && corps.description.includes('<ul><li>Bras articulé') && corps.attributes[0].options[0] === 'Aluminium' && corps.global_unique_id === '4006381333931')

      const rejoue = await publierWoo(creds, fiche(s.base, { categorie: 'Jardin > Arrosage' }))
      verifier('redéposer la même référence met à jour au lieu de doubler (product_invalid_sku → PUT)', rejoue.id === 501 && s.journal.some((a) => a.methode === 'PUT' && a.chemin.endsWith('/products/501')))
      verifier('une catégorie inconnue est créée puis référencée', s.journal.some((a) => a.methode === 'POST' && a.chemin.endsWith('/products/categories')) && categories.some((c) => c.name === 'Arrosage'))

      let refus: BoutiqueRefus | null = null
      try {
        await verifierCompteWoo({ ...creds, consumerSecret: 'faux' })
      } catch (e) {
        refus = e as BoutiqueRefus
      }
      verifier('une clé fausse est un refus de LIAISON, expliqué', refus instanceof BoutiqueRefus && refus.liaison && /clé et le secret/.test(refus.message))
      refus = null
      try {
        await verifierCompteWoo({ ...creds, siteUrl: `${s.base}/ailleurs` })
      } catch (e) {
        refus = e as BoutiqueRefus
      }
      verifier('une adresse sans API REST est un refus de liaison qui dit où il a frappé', refus instanceof BoutiqueRefus && refus.liaison && /wp-json\/wc\/v3/.test(refus.message))
    } finally {
      s.fermer()
    }
  }

  // -------------------------------------------------------------- PrestaShop
  console.log('\nPrestaShop (webservice XML, clé en Basic Auth, images en multipart)')
  {
    const CLE = 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'
    const attendu = `Basic ${Buffer.from(`${CLE}:`).toString('base64')}`
    const s = await serveur((a, res) => {
      const xml = (code: number, x: string) => {
        res.writeHead(code, { 'Content-Type': 'text/xml' })
        res.end(x)
      }
      if (a.auth !== attendu) return xml(401, '<prestashop><errors><error><code>21</code><message>Invalid key</message></error></errors></prestashop>')
      if (!a.chemin.startsWith('/api/')) return xml(404, '')
      if (a.methode === 'GET' && a.chemin.startsWith('/api/categories?')) {
        return xml(200, /Luminaires/.test(decodeURIComponent(a.chemin)) ? '<prestashop><categories><category><id>9</id></category></categories></prestashop>' : '<prestashop><categories/></prestashop>')
      }
      if (a.methode === 'GET' && a.chemin.startsWith('/api/products?')) return xml(200, '<prestashop><products/></prestashop>')
      if (a.methode === 'POST' && a.chemin === '/api/products') {
        if (!/^text\/xml/.test(a.type)) return xml(400, '<error>xml attendu</error>')
        if (!/<name><language id="1"><!\[CDATA\[Lampe/.test(a.corps)) return xml(400, '<error>name manquant</error>')
        if (!/<price>34\.900000<\/price>/.test(a.corps)) return xml(400, '<error>price</error>')
        return xml(201, '<prestashop><product><id><![CDATA[77]]></id><reference><![CDATA[DSP-lampe-1]]></reference><associations><stock_availables><stock_available><id><![CDATA[310]]></id><id_product_attribute><![CDATA[0]]></id_product_attribute></stock_available></stock_availables></associations></product></prestashop>')
      }
      if (a.methode === 'POST' && a.chemin === '/api/images/products/77') {
        if (!/^multipart\/form-data/.test(a.type) || !/name="image"/.test(a.corps) || !a.corps.includes('PNG')) return xml(400, '<error>image manquante</error>')
        return xml(200, '<prestashop><image><id>5</id></image></prestashop>')
      }
      if (a.methode === 'PUT' && a.chemin === '/api/stock_availables/310') {
        if (!/<quantity>12<\/quantity>/.test(a.corps)) return xml(400, '<error>quantity</error>')
        return xml(200, '<prestashop><stock_available><id>310</id></stock_available></prestashop>')
      }
      return xml(404, `<error>${a.chemin}</error>`)
    })
    try {
      const creds = readPrestaCredentials({ siteUrl: s.base, apiKey: CLE })!
      verifier('la langue vaut 1 par défaut', creds.langue === 1)
      const x = xmlProduit(fiche(s.base), 1, 2)
      verifier('le XML porte nom, prix, référence, EAN, catégorie, description en CDATA', /<language id="1">/.test(x) && /<ean13>4006381333931<\/ean13>/.test(x) && /<id_category_default>2</.test(x) && /<!\[CDATA\[<p>Une lampe/.test(x))

      const depot = await publierPresta(creds, fiche(s.base))
      verifier('la fiche est créée et son identifiant lu dans le XML', depot.id === 77)
      verifier('la catégorie nommée est retrouvée (9) et posée en catégorie par défaut', /<id_category_default>9</.test(s.journal.find((a) => a.methode === 'POST' && a.chemin === '/api/products')!.corps))
      verifier('les deux photos partent en multipart, une par appel', s.journal.filter((a) => a.chemin === '/api/images/products/77').length === 2 && /2 photos sur 2/.test(depot.note))
      verifier('le stock est posé après coup sur la ligne stock_availables', s.journal.some((a) => a.methode === 'PUT' && a.chemin === '/api/stock_availables/310'))

      let refus: BoutiqueRefus | null = null
      try {
        await publierPresta({ ...creds, apiKey: 'fausse' }, fiche(s.base))
      } catch (e) {
        refus = e as BoutiqueRefus
      }
      verifier('une clé fausse est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Webservice/.test(refus.message))
    } finally {
      s.fermer()
    }
  }

  // ------------------------------------------------------------------ Magento
  console.log('\nMagento 2 (REST V1, Bearer, images en base64)')
  {
    const TOKEN = 'jeton-integration-magento'
    let existe = false
    const s = await serveur((a, res) => {
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (a.auth !== `Bearer ${TOKEN}`) return json(401, { message: "The consumer isn't authorized to access %resources.", parameters: { resources: 'Magento_Catalog::products' } })
      if (!a.chemin.startsWith('/rest/V1/')) return json(404, { message: 'no route' })
      if (a.chemin === '/rest/V1/store/storeViews') return json(200, [{ id: 1, code: 'default' }])
      if (a.methode === 'GET' && a.chemin === '/rest/V1/products/DSP-lampe-1') return existe ? json(200, { id: 12, sku: 'DSP-lampe-1' }) : json(404, { message: 'The product that was requested doesn\'t exist.' })
      if ((a.methode === 'POST' && a.chemin === '/rest/V1/products') || (a.methode === 'PUT' && a.chemin === '/rest/V1/products/DSP-lampe-1')) {
        const p = JSON.parse(a.corps).product
        if (!p || !p.sku || !p.name || typeof p.price !== 'number' || p.attribute_set_id !== 4 || p.type_id !== 'simple') return json(400, { message: 'invalid product' })
        for (const m of p.media_gallery_entries ?? []) {
          if (!m.content?.base64_encoded_data || !Buffer.from(m.content.base64_encoded_data, 'base64').toString('latin1').includes('PNG')) return json(400, { message: 'bad image content' })
        }
        existe = true
        return json(200, { id: 12, sku: p.sku })
      }
      return json(404, { message: a.chemin })
    })
    try {
      const creds = readMagentoCredentials({ siteUrl: s.base, token: TOKEN })!
      await verifierCompteMagento(creds)
      const depot = await publierMagento(creds, fiche(s.base))
      const post = s.journal.find((a) => a.methode === 'POST' && a.chemin === '/rest/V1/products')!
      const p = JSON.parse(post.corps).product
      verifier('la fiche est créée par POST avec sku, prix nombre, stock, url_key', depot.id === 12 && p.price === 34.9 && p.extension_attributes.stock_item.qty === 12 && p.custom_attributes.some((c: { attribute_code: string; value: string }) => c.attribute_code === 'url_key' && c.value === 'lampe-de-bureau-led-articulee'))
      verifier('les photos partent en base64, la première marquée image/small_image/thumbnail', p.media_gallery_entries.length === 2 && p.media_gallery_entries[0].types.length === 3 && p.media_gallery_entries[1].types.length === 0)
      const rejoue = await publierMagento(creds, fiche(s.base))
      verifier('redéposer la même référence fait un PUT sur /products/{sku}', /mise à jour/.test(rejoue.note) && s.journal.some((a) => a.methode === 'PUT' && a.chemin === '/rest/V1/products/DSP-lampe-1'))

      let refus: BoutiqueRefus | null = null
      try {
        await verifierCompteMagento({ ...creds, token: 'faux' })
      } catch (e) {
        refus = e as BoutiqueRefus
      }
      verifier('un jeton faux est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Intégrations/.test(refus.message))
      const image = await telechargerImage(`${s.base}/photo.png`)
      verifier('une photo se télécharge en base64 avec son type', image?.type === 'image/png' && image.nom.endsWith('.png'))
      verifier('une adresse qui ne rend pas une image rend null', (await telechargerImage(`${s.base}/rest/V1/store/storeViews`, (u) => fetch(u, { headers: { Authorization: `Bearer ${TOKEN}` } }))) === null)
    } finally {
      s.fermer()
    }
  }

  // Un refus attendu, ramené à sa forme : la classe, le drapeau liaison, le motif.
  const refusDe = async (essai: () => Promise<unknown>): Promise<BoutiqueRefus | null> => {
    try {
      await essai()
      return null
    } catch (e) {
      return e as BoutiqueRefus
    }
  }

  // --------------------------------------------------------- Drupal Commerce
  console.log('\nDrupal Commerce (JSON:API, Basic Auth, variation puis produit, photo en octets)')
  {
    const attendu = `Basic ${Buffer.from('robot:secret').toString('base64')}`
    let variations: Array<{ id: string; sku: string }> = []
    let produits: Array<{ id: string; variation: string }> = []
    const s = await serveur((a, res) => {
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/vnd.api+json' })
        res.end(JSON.stringify(o))
      }
      if (a.auth !== attendu) return json(401, { errors: [{ title: 'Unauthorized' }] })
      if (!a.chemin.startsWith('/jsonapi/')) return json(404, {})
      const chemin = a.chemin.slice('/jsonapi'.length)
      if (a.methode === 'GET' && chemin.startsWith('/commerce_store/online')) return json(200, { data: [{ id: 'store-1', type: 'commerce_store--online' }] })
      if (a.methode === 'GET' && chemin.startsWith('/commerce_product/default?page')) return json(200, { data: [] })
      if (chemin.includes('/field_image')) {
        if (a.type !== 'application/octet-stream' || !/^file; filename="/.test(String(a.corps ? '' : ''))) {
          // Le corps est binaire ; on ne relit que les en-têtes.
        }
        return json(201, { data: { id: 'file-1' } })
      }
      if (a.type !== 'application/vnd.api+json' && a.methode !== 'GET') return json(415, { errors: [{ title: 'Unsupported Media Type' }] })
      if (a.methode === 'POST' && chemin === '/commerce_product_variation/default') {
        const d = JSON.parse(a.corps).data
        if (variations.some((v) => v.sku === d.attributes.sku)) return json(422, { errors: [{ title: 'Unprocessable Entity', detail: 'sku: The SKU must be unique.' }] })
        const v = { id: 'var-' + (variations.length + 1), sku: d.attributes.sku }
        variations = [...variations, v]
        return json(201, { data: { id: v.id, type: d.type } })
      }
      if (a.methode === 'GET' && chemin.startsWith('/commerce_product_variation/default?filter[sku]=')) {
        const sku = decodeURIComponent(chemin.split('=')[1])
        return json(200, { data: variations.filter((v) => v.sku === sku).map((v) => ({ id: v.id })) })
      }
      if (a.methode === 'PATCH' && chemin.startsWith('/commerce_product_variation/default/')) return json(200, { data: { id: chemin.split('/').pop() } })
      if (a.methode === 'POST' && chemin === '/commerce_product/default') {
        const d = JSON.parse(a.corps).data
        if (!d.relationships?.stores?.data?.[0]?.id || !d.relationships?.variations?.data?.[0]?.id) return json(422, { errors: [{ detail: 'stores et variations requis' }] })
        const p = { id: 'prod-' + (produits.length + 1), variation: d.relationships.variations.data[0].id }
        produits = [...produits, p]
        return json(201, { data: { id: p.id } })
      }
      if (a.methode === 'GET' && chemin.startsWith('/commerce_product/default?filter[variations.sku]=')) {
        const sku = decodeURIComponent(chemin.split('=')[1])
        const v = variations.find((x) => x.sku === sku)
        return json(200, { data: produits.filter((p) => p.variation === v?.id).map((p) => ({ id: p.id })) })
      }
      if (a.methode === 'PATCH' && chemin.startsWith('/commerce_product/default/')) return json(200, { data: { id: chemin.split('/').pop() } })
      return json(404, { errors: [{ title: chemin }] })
    })
    try {
      verifier('rien sans le mot de passe', readDrupalCredentials({ siteUrl: s.base, identifiant: 'robot' }) === null)
      const creds = readDrupalCredentials({ siteUrl: s.base, identifiant: 'robot', motDePasse: 'secret' })!
      verifier('le type de produit est « default » par défaut', creds.type === 'default')
      await verifierCompteDrupal(creds)
      const depot = await publierDrupal(creds, fiche(s.base))
      const variation = s.journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/commerce_product_variation/default'))!
      const produit = s.journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/commerce_product/default'))!
      const v = JSON.parse(variation.corps).data.attributes
      const p = JSON.parse(produit.corps).data
      verifier('la variation porte référence, prix en chaîne et devise', v.sku === 'DSP-lampe-1' && v.price.number === '34.90' && v.price.currency_code === 'EUR')
      verifier('le produit référence la boutique et la variation, corps en HTML', p.relationships.stores.data[0].id === 'store-1' && p.relationships.variations.data[0].id === 'var-1' && p.attributes.body.value.includes('<ul>'))
      verifier('les deux photos partent en octets sur le champ image de la variation', s.journal.filter((a) => a.chemin.includes('/var-1/field_image') && a.type === 'application/octet-stream').length === 2 && depot.id === 'prod-1')
      const rejoue = await publierDrupal(creds, fiche(s.base))
      verifier('redéposer la même référence met à jour (422 → PATCH), sans doublon', rejoue.id === 'prod-1' && s.journal.some((a) => a.methode === 'PATCH' && a.chemin.includes('/commerce_product/default/prod-1')) && produits.length === 1)
      const refus = await refusDe(() => verifierCompteDrupal({ ...creds, motDePasse: 'faux' }))
      verifier('un mot de passe faux est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Basic Auth/.test(refus.message))
    } finally {
      s.fermer()
    }
  }

  // ------------------------------------------------------------- BigCommerce
  console.log('\nBigCommerce (Catalog V3, X-Auth-Token, images par adresse, poids obligatoire)')
  {
    const HASH = 'abc123xy'
    let produits: Array<{ id: number; sku: string }> = []
    const s = await serveur((a, res) => {
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      // Le faux lit l'en-tête X-Auth-Token par le journal : il n'est pas dans `auth`.
      return void 0, json(200, { data: {} })
    })
    s.fermer()
    // Un serveur qui lit X-Auth-Token : on l'écrit à part, avec l'en-tête sous la main.
    const s2 = await (async () => {
      const { createServer } = await import('node:http')
      const journal: Array<{ methode: string; chemin: string; token: string; corps: string }> = []
      const srv = createServer(async (req, res) => {
        const morceaux: Buffer[] = []
        for await (const c of req) morceaux.push(c as Buffer)
        const a = { methode: req.method!, chemin: req.url!, token: String(req.headers['x-auth-token'] ?? ''), corps: Buffer.concat(morceaux).toString('utf8') }
        journal.push(a)
        const json = (code: number, o: unknown) => {
          res.writeHead(code, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(o))
        }
        if (a.token !== 'tok-bc') return json(401, { title: 'Unauthorized', status: 401 })
        if (!a.chemin.startsWith(`/stores/${HASH}/v3/`)) return json(404, { title: 'Not Found' })
        const chemin = a.chemin.slice(`/stores/${HASH}/v3`.length)
        if (a.methode === 'GET' && chemin === '/catalog/summary') return json(200, { data: { inventory_count: 1 } })
        if (a.methode === 'GET' && chemin.startsWith('/catalog/categories?name=')) {
          const nom = decodeURIComponent(/name=([^&]*)/.exec(chemin)![1])
          return json(200, { data: nom === 'Luminaires' ? [{ id: 7, name: 'Luminaires' }] : [] })
        }
        if (a.methode === 'POST' && chemin === '/catalog/categories') return json(200, { data: { id: 40, name: JSON.parse(a.corps).name } })
        if (a.methode === 'GET' && chemin.startsWith('/catalog/products?sku=')) {
          const sku = decodeURIComponent(chemin.split('=')[1])
          return json(200, { data: produits.filter((p) => p.sku === sku) })
        }
        if (a.methode === 'POST' && chemin === '/catalog/products') {
          const p = JSON.parse(a.corps)
          if (!p.name || typeof p.weight !== 'number' || typeof p.price !== 'number' || !p.type) return json(422, { title: 'name, type, weight et price requis', status: 422 })
          if (produits.some((x) => x.sku === p.sku)) return json(409, { title: 'The product sku is a duplicate', status: 409 })
          const cree = { id: 501, sku: p.sku }
          produits = [...produits, cree]
          return json(200, { data: { id: 501, ...p } })
        }
        if (a.methode === 'PUT' && chemin === '/catalog/products/501') return json(200, { data: { id: 501 } })
        return json(404, { title: chemin })
      })
      return new Promise<{ base: string; journal: typeof journal; fermer: () => void }>((ok) =>
        srv.listen(0, '127.0.0.1', () => ok({ base: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, journal, fermer: () => srv.close() })),
      )
    })()
    try {
      verifier('un store hash mal formé est refusé au collage', readBigCommerceCredentials({ storeHash: 'stores/abc 123', accessToken: 't' }) === null)
      const creds = readBigCommerceCredentials({ storeHash: `stores/${HASH}`, accessToken: 'tok-bc', apiBase: s2.base })!
      verifier('le préfixe « stores/ » collé par erreur est retiré', creds.storeHash === HASH)
      await verifierCompteBigCommerce(creds)
      verifier('la vérification passe par /catalog/summary', s2.journal.at(-1)?.chemin.endsWith('/catalog/summary') === true)
      const depot = await publierBigCommerce(creds, fiche(s.base))
      const post = s2.journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/catalog/products'))!
      const corps = JSON.parse(post.corps)
      verifier('fiche créée avec poids, prix nombre, images par adresse, stock et GTIN', depot.id === 501 && corps.weight === 1 && corps.price === 34.9 && corps.images[0].image_url === `${s.base}/photo.png` && corps.inventory_level === 12 && corps.gtin === '4006381333931')
      verifier('la catégorie existante est référencée sans être recréée', corps.categories[0] === 7 && !s2.journal.some((a) => a.methode === 'POST' && a.chemin.endsWith('/catalog/categories')))
      const rejoue = await publierBigCommerce(creds, fiche(s.base))
      verifier('redéposer la même référence met à jour (409 → GET sku → PUT)', rejoue.id === 501 && s2.journal.some((a) => a.methode === 'PUT' && a.chemin.endsWith('/catalog/products/501')))
      const refus = await refusDe(() => verifierCompteBigCommerce({ ...creds, accessToken: 'faux' }))
      verifier('un jeton faux est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Comptes API/.test(refus.message))
    } finally {
      s2.fermer()
    }
  }

  // --------------------------------------------------------------------- Wix
  console.log('\nWix Stores (clé + wix-site-id, produit sous « product », médias par adresse, collections existantes)')
  {
    const SITE = '0b1c2d3e-4f50-4617-8899-aabbccddeeff'
    let produits: Array<{ id: string; sku: string }> = []
    const { createServer } = await import('node:http')
    const journal: Array<{ methode: string; chemin: string; corps: string }> = []
    const srv = createServer(async (req, res) => {
      const morceaux: Buffer[] = []
      for await (const c of req) morceaux.push(c as Buffer)
      const a = { methode: req.method!, chemin: req.url!, corps: Buffer.concat(morceaux).toString('utf8') }
      journal.push(a)
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (req.headers.authorization !== 'cle-wix' || req.headers['wix-site-id'] !== SITE) return json(403, { message: 'Forbidden' })
      if (!a.chemin.startsWith('/stores/v1/')) return json(404, {})
      const chemin = a.chemin.slice('/stores/v1'.length)
      if (a.methode === 'POST' && chemin === '/products/query') {
        const q = JSON.parse(a.corps).query
        const filtre = q.filter ? JSON.parse(q.filter) : {}
        return json(200, { products: produits.filter((p) => !filtre.sku || p.sku === filtre.sku) })
      }
      if (a.methode === 'POST' && chemin === '/products') {
        const p = JSON.parse(a.corps).product
        if (!p || !p.name || !p.priceData?.price) return json(400, { message: 'product.name et priceData requis' })
        const cree = { id: 'p1', sku: p.sku }
        produits = [...produits, cree]
        return json(200, { product: { id: 'p1', ...p } })
      }
      if (a.methode === 'PATCH' && chemin === '/products/p1') return json(200, { product: { id: 'p1' } })
      if (a.methode === 'POST' && chemin === '/products/p1/media') {
        const m = JSON.parse(a.corps).media
        if (!Array.isArray(m) || !m.every((x: { url?: string }) => x.url)) return json(400, { message: 'media[].url requis' })
        return json(200, {})
      }
      if (a.methode === 'POST' && chemin === '/collections/query') return json(200, { collections: [{ id: 'c1', name: 'Luminaires' }] })
      if (a.methode === 'POST' && chemin === '/collections/c1/productIds') return json(200, {})
      return json(404, { message: chemin })
    })
    const base = await new Promise<string>((ok) => srv.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(srv.address() as { port: number }).port}`)))
    const photos = await serveur(() => undefined)
    try {
      verifier('un identifiant de site qui n’est pas un UUID est refusé', readWixCredentials({ apiKey: 'k', siteId: 'mon-site' }) === null)
      const creds = readWixCredentials({ apiKey: 'cle-wix', siteId: SITE, apiBase: base })!
      await verifierCompteWix(creds)
      const depot = await publierWix(creds, fiche(photos.base))
      const post = journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/stores/v1/products'))!
      const p = JSON.parse(post.corps).product
      verifier('la fiche est sous « product » : prix nombre, stock suivi, visible', depot.id === 'p1' && p.priceData.price === 34.9 && p.stock.trackInventory === true && p.stock.quantity === 12 && p.visible === true)
      verifier('les photos partent par adresse dans un second appel', journal.some((a) => a.chemin.endsWith('/products/p1/media')) && /photo\.png/.test(journal.find((a) => a.chemin.endsWith('/products/p1/media'))!.corps))
      verifier('la fiche est rangée dans la collection existante', journal.some((a) => a.chemin.endsWith('/collections/c1/productIds')) && /collection/.test(depot.note))
      const rejoue = await publierWix(creds, fiche(photos.base, { categorie: 'Jardin > Arrosage' }))
      verifier('redéposer met à jour (recherche par sku → PATCH) et dit qu’une collection manque', rejoue.id === 'p1' && journal.some((a) => a.methode === 'PATCH') && /Arrosage/.test(rejoue.note))
      const refus = await refusDe(() => verifierCompteWix({ ...creds, apiKey: 'faux' }))
      verifier('une clé fausse est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Clés API/.test(refus.message))
    } finally {
      srv.close()
      photos.fermer()
    }
  }

  // ---------------------------------------------------------------- Shopware
  console.log('\nShopware 6 (jeton client_credentials, taxe/devise/canal lus, médias téléchargés, 204 sans corps)')
  {
    let produits: Array<{ id: string; productNumber: string }> = []
    const s = await serveur((a, res) => {
      const json = (code: number, o?: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(o === undefined ? '' : JSON.stringify(o))
      }
      if (a.methode === 'POST' && a.chemin === '/api/oauth/token') {
        const c = JSON.parse(a.corps)
        if (c.grant_type !== 'client_credentials' || c.client_id !== 'SWIA1' || c.client_secret !== 'sw-secret') return json(401, { errors: [{ title: 'invalid_client' }] })
        return json(200, { access_token: 'tok-sw', expires_in: 600 })
      }
      if (a.auth !== 'Bearer tok-sw') return json(401, { errors: [{ title: 'The resource owner or authorization server denied the request.' }] })
      if (a.methode === 'GET' && a.chemin === '/api/_info/version') return json(200, { version: '6.6.0.0' })
      if (a.methode === 'POST' && a.chemin === '/api/search/tax') return json(200, { data: [{ id: 'tax1', taxRate: 20 }] })
      if (a.methode === 'POST' && a.chemin === '/api/search/currency') return json(200, { data: [{ id: 'cur1', isoCode: 'EUR' }] })
      if (a.methode === 'POST' && a.chemin === '/api/search/sales-channel') return json(200, { data: [{ id: 'sc1' }] })
      if (a.methode === 'POST' && a.chemin === '/api/search/product') {
        const f = JSON.parse(a.corps).filter?.[0]
        return json(200, { data: produits.filter((p) => !f || p.productNumber === f.value) })
      }
      if (a.methode === 'POST' && a.chemin === '/api/media') return json(204)
      if (a.methode === 'POST' && a.chemin.startsWith('/api/_action/media/')) {
        if (!/[?&]extension=png/.test(a.chemin) || !JSON.parse(a.corps).url) return json(400, { errors: [{ detail: 'extension et url requis' }] })
        return json(204)
      }
      if (a.methode === 'POST' && a.chemin === '/api/product') {
        const p = JSON.parse(a.corps)
        if (!p.id || !p.name || !p.productNumber || typeof p.stock !== 'number' || !p.taxId || !p.price?.[0]?.currencyId) return json(400, { errors: [{ detail: 'champs requis manquants' }] })
        if (produits.some((x) => x.productNumber === p.productNumber)) return json(400, { errors: [{ code: 'CONTENT__DUPLICATE_PRODUCT_NUMBER' }] })
        produits = [...produits, { id: p.id, productNumber: p.productNumber }]
        return json(204)
      }
      if (a.methode === 'PATCH' && a.chemin.startsWith('/api/product/')) return json(204)
      return json(404, { errors: [{ title: a.chemin }] })
    })
    try {
      const creds = readShopwareCredentials({ siteUrl: s.base, clientId: 'SWIA1', clientSecret: 'sw-secret' })!
      await verifierCompteShopware(creds)
      verifier('un seul échange de jeton pour deux appels', s.journal.filter((a) => a.chemin === '/api/oauth/token').length === 1)
      const depot = await publierShopware(creds, fiche(s.base))
      const post = s.journal.find((a) => a.methode === 'POST' && a.chemin === '/api/product')!
      const p = JSON.parse(post.corps)
      verifier('la fiche porte un UUID à nous, la taxe, le prix brut et net, le stock, l’EAN', /^[0-9a-f]{32}$/.test(p.id) && p.taxId === 'tax1' && p.price[0].gross === 34.9 && p.price[0].net === 29.08 && p.stock === 12 && p.ean === '4006381333931' && depot.id === p.id)
      verifier('deux médias créés puis téléchargés par Shopware depuis l’adresse, et référencés', s.journal.filter((a) => a.chemin.startsWith('/api/_action/media/')).length === 2 && p.media.length === 2)
      verifier('visible sur le premier canal de vente', p.visibilities[0].salesChannelId === 'sc1' && p.visibilities[0].visibility === 30)
      const rejoue = await publierShopware(creds, fiche(s.base))
      verifier('redéposer met à jour (recherche par productNumber → PATCH), sans nouveau média', rejoue.id === depot.id && s.journal.some((a) => a.methode === 'PATCH' && a.chemin === `/api/product/${depot.id}`) && s.journal.filter((a) => a.chemin.startsWith('/api/_action/media/')).length === 2)
      const refus = await refusDe(() => verifierCompteShopware({ ...creds, clientSecret: 'faux' }))
      verifier('un secret faux est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Intégrations/.test(refus.message))
    } finally {
      s.fermer()
    }
  }

  // ------------------------------------------------------------------- Ecwid
  console.log('\nEcwid (REST v3, Bearer, images par adresse, mise à jour par référence)')
  {
    let produits: Array<{ id: number; sku: string }> = []
    const s = await serveur((a, res) => {
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (a.auth !== 'Bearer secret_ecwid') return json(403, { errorMessage: 'Token doesn’t have access' })
      if (!a.chemin.startsWith('/api/v3/12345/')) return json(404, { errorMessage: 'store' })
      const chemin = a.chemin.slice('/api/v3/12345'.length)
      if (a.methode === 'GET' && chemin === '/profile') return json(200, { generalInfo: { storeId: 12345 } })
      if (a.methode === 'GET' && chemin.startsWith('/categories')) return json(200, { items: [{ id: 7, name: 'Luminaires' }] })
      if (a.methode === 'POST' && chemin === '/categories') return json(200, { id: 40 })
      if (a.methode === 'GET' && chemin.startsWith('/products?sku=')) {
        const sku = decodeURIComponent(/sku=([^&]*)/.exec(chemin)![1])
        return json(200, { items: produits.filter((p) => p.sku === sku) })
      }
      if (a.methode === 'POST' && chemin === '/products') {
        const p = JSON.parse(a.corps)
        if (!p.name || typeof p.price !== 'number') return json(400, { errorMessage: 'name et price requis' })
        produits = [...produits, { id: 501, sku: p.sku }]
        return json(200, { id: 501 })
      }
      if (a.methode === 'PUT' && chemin === '/products/501') return json(200, { updateCount: 1 })
      if (a.methode === 'POST' && /^\/products\/501\/(image|gallery)\?externalUrl=/.test(chemin)) return json(200, { id: 9 })
      return json(404, { errorMessage: chemin })
    })
    try {
      verifier('un identifiant de boutique qui n’est pas un nombre est refusé', readEcwidCredentials({ storeId: 'ma-boutique', token: 't' }) === null)
      const creds = readEcwidCredentials({ storeId: 12345, token: 'secret_ecwid', apiBase: s.base })!
      await verifierCompteEcwid(creds)
      const depot = await publierEcwid(creds, fiche(s.base))
      const post = s.journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/products'))!
      const p = JSON.parse(post.corps)
      verifier('fiche créée : prix nombre, stock, catégorie existante, attribut, EAN en UPC', depot.id === 501 && p.price === 34.9 && p.quantity === 12 && p.categoryIds[0] === 7 && p.attributes.some((x: { name: string }) => x.name === 'Matière') && p.attributes.some((x: { type?: string; value: string }) => x.type === 'UPC' && x.value === '4006381333931'))
      verifier('première photo sur /image, la suivante sur /gallery, par adresse', s.journal.some((a) => a.chemin.includes('/products/501/image?externalUrl=')) && s.journal.some((a) => a.chemin.includes('/products/501/gallery?externalUrl=')))
      const rejoue = await publierEcwid(creds, fiche(s.base))
      verifier('redéposer met à jour (GET sku → PUT) sans renvoyer les photos', rejoue.id === 501 && s.journal.some((a) => a.methode === 'PUT') && s.journal.filter((a) => a.chemin.includes('externalUrl=')).length === 2)
      const refus = await refusDe(() => verifierCompteEcwid({ ...creds, token: 'faux' }))
      verifier('un jeton faux est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /jeton secret/.test(refus.message))
    } finally {
      s.fermer()
    }
  }

  // ------------------------------------------------------------- Squarespace
  console.log('\nSquarespace Commerce (Bearer + User-Agent, page boutique, variantes, images en multipart)')
  {
    let skus: string[] = []
    const { createServer } = await import('node:http')
    const journal: Array<{ methode: string; chemin: string; type: string; corps: string; ua: string }> = []
    const srv = createServer(async (req, res) => {
      const morceaux: Buffer[] = []
      for await (const c of req) morceaux.push(c as Buffer)
      const a = { methode: req.method!, chemin: req.url!, type: String(req.headers['content-type'] ?? ''), corps: Buffer.concat(morceaux).toString('latin1'), ua: String(req.headers['user-agent'] ?? '') }
      journal.push(a)
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (!a.ua) return json(400, { message: 'User-Agent header is required' })
      if (req.headers.authorization !== 'Bearer cle-sq') return json(401, { message: 'Unauthorized' })
      if (!a.chemin.startsWith('/1.0/commerce/')) return json(404, {})
      const chemin = a.chemin.slice('/1.0/commerce'.length)
      if (a.methode === 'GET' && chemin === '/store_pages') return json(200, { storePages: [{ id: 'sp1', isEnabled: true }] })
      if (a.methode === 'POST' && chemin === '/products') {
        const p = JSON.parse(a.corps)
        if (p.type !== 'PHYSICAL' || !p.storePageId || !p.variants?.[0]?.pricing?.basePrice?.value) return json(400, { message: 'type, storePageId et variants[].pricing requis' })
        if (skus.includes(p.variants[0].sku)) return json(400, { message: 'Variant SKU DSP-lampe-1 already in use' })
        skus = [...skus, p.variants[0].sku]
        return json(201, { id: 'sq1', ...p })
      }
      if (a.methode === 'POST' && chemin === '/products/sq1/images') {
        if (!a.type.startsWith('multipart/form-data') || !/name="file"/.test(a.corps)) return json(400, { message: 'multipart file requis' })
        return json(202, { imageId: 'img1' })
      }
      return json(404, { message: chemin })
    })
    const base = await new Promise<string>((ok) => srv.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(srv.address() as { port: number }).port}`)))
    const photos = await serveur(() => undefined)
    try {
      const creds = readSquarespaceCredentials({ apiKey: 'cle-sq', apiBase: base })!
      await verifierCompteSquarespace(creds)
      const depot = await publierSquarespace(creds, fiche(photos.base))
      const post = journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/commerce/products'))!
      const p = JSON.parse(post.corps)
      verifier('fiche PHYSICAL dans la première page boutique, variante avec référence, prix en chaîne EUR et stock', depot.id === 'sq1' && p.storePageId === 'sp1' && p.variants[0].sku === 'DSP-lampe-1' && p.variants[0].pricing.basePrice.value === '34.90' && p.variants[0].pricing.basePrice.currency === 'EUR' && p.variants[0].stock.quantity === 12)
      verifier('les deux photos partent en multipart, champ « file », et sont acceptées en 202', journal.filter((a) => a.chemin.endsWith('/products/sq1/images') && a.type.startsWith('multipart')).length === 2 && /2 photos/.test(depot.note))
      const doublon = await refusDe(() => publierSquarespace(creds, fiche(photos.base)))
      verifier('une référence déjà présente est un refus de PRODUIT (pas de liaison), avec le geste', doublon instanceof BoutiqueRefus && !doublon.liaison && /supprimez-le puis republiez/.test(doublon.message))
      const refus = await refusDe(() => verifierCompteSquarespace({ ...creds, apiKey: 'faux' }))
      verifier('une clé fausse est un refus de liaison expliqué', refus instanceof BoutiqueRefus && refus.liaison && /Outils de développement/.test(refus.message))
    } finally {
      srv.close()
      photos.fermer()
    }
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exit(1)
  }
  console.log('\nBoutiques du vendeur (WooCommerce, PrestaShop, Magento, Drupal Commerce, BigCommerce, Wix, Shopware, Ecwid, Squarespace) : tout passe.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
