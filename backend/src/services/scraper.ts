import * as cheerio from 'cheerio'

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
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Le site source a répondu ${res.status}`)
  const html = await res.text()
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
  if (images.size === 0) {
    $('img').slice(0, 10).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src')
      if (src) images.add(absoluteUrl(src, url))
    })
  }

  const sourceCategory =
    jsonLdProduct?.category ||
    $('[class*="breadcrumb" i] a, nav[aria-label*="breadcrumb" i] a')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .slice(-1)[0] ||
    null

  return {
    title: title.trim(),
    description: description.trim(),
    price,
    currency,
    images: Array.from(images).slice(0, 8),
    sourceCategory,
    sourceSite: site,
    metaTitle: og('og:title') || null,
    metaDescription: $('meta[name="description"]').attr('content') || null,
    metaKeywords: $('meta[name="keywords"]').attr('content') || null,
  }
}
