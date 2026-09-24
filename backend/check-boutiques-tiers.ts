/**
 * Banc : les trois connecteurs de boutique du vendeur — WooCommerce, PrestaShop,
 * Magento — contre trois faux serveurs dont le contrat est ÉCRIT EN DUR (leçon
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

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exit(1)
  }
  console.log('\nBoutiques du vendeur (WooCommerce, PrestaShop, Magento) : tout passe.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
