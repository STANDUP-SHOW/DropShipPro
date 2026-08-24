import * as cheerio from 'cheerio'
import { gotScraping } from 'got-scraping'

/**
 * Les adresses d'images présentes dans le source de la page.
 *
 * Une galerie est souvent décrite dans le JSON embarqué avant d'exister dans le
 * DOM : la lire ici rattrape les fiches où le carrousel ne monte qu'une photo à
 * la fois. AVIF compris — les galeries récentes ne servent plus que ça.
 */
const IMAGE_IN_SOURCE = /https:\/\/[^"'\\\s)]+?\.(?:jpe?g|png|webp|avif)/gi

export interface ScrapedProduct {
  title: string
  description: string
  price: number
  currency: string
  images: string[]
  sourceCategory: string | null
  sourceSite: string
  metaTitle: string | null
  metaDescription: string | null
  metaKeywords: string | null
  /**
   * Le texte visible de la fiche.
   *
   * Les options d achat — taille, couleur, capacite — ne se lisent pas dans une
   * balise dediee : chaque site les rend a sa facon. Le texte permet de les
   * extraire ensuite, et sans lui l import par URL ne rendait jamais aucune
   * variante, quel que soit le produit.
   */
  pageText: string
}

function absoluteUrl(src: string, base: string): string {
  try {
    return new URL(src, base).toString()
  } catch {
    return src
  }
}

function parsePrice(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(',', '.')
  const value = parseFloat(cleaned)
  return Number.isFinite(value) ? value : 0
}

/**
 * Generic scraper: works on any product page by reading, in priority order,
 * JSON-LD (schema.org Product), then Open Graph tags, then best-effort DOM heuristics.
 * Site-specific quirks (Temu/JoyBuy use heavy client rendering) are handled by the
 * OG-tag fallback since those platforms still emit OG meta for share previews.
 */
export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  // gotScraping, not plain fetch: sites like Temu fingerprint the TLS handshake
  // and serve Node an obfuscated anti-bot stub (2.9 KB) instead of the product page.
  // gotScraping impersonates a real browser's TLS + header profile, which gets the
  // full 455 KB page back.
  const res = await gotScraping({
    url,
    timeout: { request: 30000 },
    headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
  })
  if (res.statusCode >= 400) throw new Error(`Le site source a répondu ${res.statusCode}`)
  const html = res.body
  const $ = cheerio.load(html)
  const site = new URL(url).hostname.replace('www.', '')

  let jsonLdProduct: any = null
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdProduct) return
    try {
      const parsed = JSON.parse($(el).contents().text())
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] ?? [])]
      jsonLdProduct = candidates.find((c) => c && (c['@type'] === 'Product' || c['@type']?.includes?.('Product')))
    } catch {
      // ignore malformed JSON-LD blocks
    }
  })

  const og = (prop: string) => $(`meta[property="${prop}"]`).attr('content') ?? $(`meta[name="${prop}"]`).attr('content')

  const title =
    jsonLdProduct?.name || og('og:title') || $('title').first().text() || $('h1').first().text() || 'Produit sans titre'

  const description =
    jsonLdProduct?.description || og('og:description') || $('meta[name="description"]').attr('content') || ''

  const offer = Array.isArray(jsonLdProduct?.offers) ? jsonLdProduct.offers[0] : jsonLdProduct?.offers
  let price = parsePrice(offer?.price?.toString() || og('product:price:amount'))
  if (!price) {
    // Many stores expose no JSON-LD/OG price, so fall back to the first element
    // whose class or itemprop names it as a price.
    const domPrice = $('[itemprop="price"]').attr('content') || $('[class*="price" i]').first().text()
    price = parsePrice(domPrice)
  }
  const currency = offer?.priceCurrency || og('product:price:currency') || 'EUR'

  const images = new Set<string>()
  if (jsonLdProduct?.image) {
    const imgs = Array.isArray(jsonLdProduct.image) ? jsonLdProduct.image : [jsonLdProduct.image]
    imgs.forEach((i: string) => images.add(absoluteUrl(i, url)))
  }
  $('meta[property="og:image"]').each((_, el) => {
    const c = $(el).attr('content')
    if (c) images.add(absoluteUrl(c, url))
  })
  // Toutes les images de la page, et non les dix premières : les dix premières
  // sont l'en-tête, le logo et le menu. Le tri se fait après, sur des critères
  // qui désignent vraiment la galerie (voir services/imageSelect.ts).
  $('img').each((_, el) => {
    const src =
      $(el).attr('src') ||
      $(el).attr('data-src') ||
      $(el).attr('data-original') ||
      $(el).attr('data-lazy-src')
    if (src) images.add(absoluteUrl(src, url))

    // Le srcset porte souvent la version pleine taille que le src n'a pas.
    const srcset = $(el).attr('srcset') || $(el).attr('data-srcset')
    if (srcset) {
      for (const part of srcset.split(',')) {
        const candidate = part.trim().split(/\s+/)[0]
        if (candidate) images.add(absoluteUrl(candidate, url))
      }
    }
  })

  // Et les adresses présentes dans le source lui-même : une galerie est souvent
  // décrite dans le JSON embarqué avant d'exister dans le DOM.
  for (const match of html.replace(/\\u002F/gi, '/').matchAll(IMAGE_IN_SOURCE)) {
    images.add(match[0])
  }

  const sourceCategory =
    jsonLdProduct?.category ||
    $('[class*="breadcrumb" i] a, nav[aria-label*="breadcrumb" i] a')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .slice(-1)[0] ||
    // Temu ships its breadcrumb inside the embedded JSON rather than the DOM, so
    // take the last "optName" entry (e.g. Accueil > Mode Enfant > Bijoux enfant).
    [...html.replace(/\\u002F/gi, '/').matchAll(/"optName"\s*:\s*"([^"]{2,50})"/g)]
      .map((m) => m[1])
      .filter((name) => !/^(accueil|home)$/i.test(name))
      .slice(-1)[0] ||
    null

  const result = {
    title: title.trim(),
    description: description.trim(),
    price,
    currency,
    // Brut : le choix des photos revient à selectProductImages, qui les mesure.
    images: Array.from(images).slice(0, 60),
    sourceCategory,
    sourceSite: site,
    metaTitle: og('og:title') || null,
    metaDescription: $('meta[name="description"]').attr('content') || null,
    metaKeywords: $('meta[name="keywords"]').attr('content') || null,
    // Le corps de la fiche, débarrassé des scripts et des styles : c'est là que
    // se lisent les tailles et les couleurs, qu'aucune balise ne déclare.
    pageText: $('main').text().trim() || $('body').text().trim(),
  }

  // Sites like Temu and JoyBuy answer scrapers with a bot wall or an empty JS
  // shell: HTTP 200, but no real product data. Creating a product from that would
  // silently fill the back office with empty listings, so refuse it outright.
  const looksLikeBotWall = /risk control|captcha|are you a robot|access denied/i.test(
    `${result.title} ${$('body').text().slice(0, 400)}`,
  )

  // Temu and friends serve a generic shell to a plain HTTP client: the title reads
  // "cet article n'est plus au catalogue", the price is 0 and the gallery is empty.
  // Creating a listing from that fills the back office with hollow, wrong products,
  // so refuse and point at the extension, which reads the page already rendered.
  const looksLikeShell =
    /n[’']est plus au catalogue|no longer available|item unavailable|page not found/i.test(result.title)
  const hasNothingUsable = result.price === 0 && result.images.length < 2

  if (looksLikeShell || (hasNothingUsable && /temu|joybuy|aliexpress|shein|wish/i.test(site))) {
    throw new ScrapeBlockedError(site)
  }
  // A title alone is enough to build on: sites like Temu load price and gallery
  // by XHR after render, so a listing legitimately arrives without them and the
  // user completes those fields in the back office.
  const hasUsableData = result.title.length > 3 && (result.description.length > 20 || result.images.length > 0)

  if (looksLikeBotWall || !hasUsableData) {
    throw new ScrapeBlockedError(site)
  }

  return result
}

/** Thrown when the source site served a bot wall or an empty JS shell instead of the product. */
export class ScrapeBlockedError extends Error {
  constructor(public site: string) {
    super(
      `${site} ne livre ni prix ni photos à un import par URL : la fiche produit est construite ` +
        `en JavaScript après l'affichage. Ouvrez la page du produit dans Chrome et cliquez sur ` +
        `« + Ajouter à DropShip Pro » — l'extension lit la page déjà affichée, avec le prix, les ` +
        `photos et les variantes.`,
    )
    this.name = 'ScrapeBlockedError'
  }
}
