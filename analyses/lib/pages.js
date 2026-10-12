'use strict'
/**
 * Plain HTTP page reading (light on a weak PC: no browser). Pages that need
 * JavaScript or a login are read by the private browser (lib/veille.js) instead.
 * Every link found is remembered: a product URL the model writes is only
 * accepted when it was actually seen on a page we read.
 */
const MAX_OCTETS = 1_500_000

function nettoyer(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, '€').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
}

function extraireLiens(html, base) {
  const liens = new Set()
  const re = /<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["']/gi
  let m
  while ((m = re.exec(html)) && liens.size < 400) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), base)
      if (/^https?:$/.test(u.protocol)) liens.add(u.href)
    } catch { /* ignore */ }
  }
  return [...liens]
}

/** og:image / twitter:image of the page, absolute; '' when none. */
function extraireImage(html, base) {
  const m = html.match(/<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i)
  if (!m) return ''
  const c = m[0].match(/content\s*=\s*["']([^"']+)["']/i)
  if (!c) return ''
  try {
    const u = new URL(c[1].replace(/&amp;/g, '&'), base)
    return /^https?:$/.test(u.protocol) ? u.href : ''
  } catch { return '' }
}

/**
 * Displayed selling price written by the page itself (schema.org Product offer in
 * JSON-LD, or product:price meta). Never guessed from the visible text.
 * @returns {{montant:number, devise:string}|null}
 */
function extrairePrix(html) {
  const blocs = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []
  for (const b of blocs) {
    const brut = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')
    let j
    try { j = JSON.parse(brut) } catch { continue }
    const pile = [j]
    while (pile.length) {
      const x = pile.pop()
      if (!x || typeof x !== 'object') continue
      if (Array.isArray(x)) { pile.push(...x); continue }
      const prix = x.price !== undefined ? x.price : x.lowPrice
      if (prix !== undefined && (x['@type'] === 'Offer' || x['@type'] === 'AggregateOffer' || x.priceCurrency)) {
        const n = Number(String(prix).replace(',', '.'))
        if (Number.isFinite(n) && n > 0) return { montant: n, devise: String(x.priceCurrency || '') }
      }
      for (const v of Object.values(x)) if (v && typeof v === 'object') pile.push(v)
    }
  }
  const meta = html.match(/<meta[^>]+property\s*=\s*["'](?:product:price:amount|og:price:amount)["'][^>]*>/i)
  if (meta) {
    const c = meta[0].match(/content\s*=\s*["']([^"']+)["']/i)
    const n = c ? Number(c[1].replace(',', '.')) : NaN
    if (Number.isFinite(n) && n > 0) {
      const d = html.match(/<meta[^>]+property\s*=\s*["'](?:product:price:currency|og:price:currency)["'][^>]*content\s*=\s*["']([^"']+)["']/i)
      return { montant: n, devise: d ? d[1] : '' }
    }
  }
  return null
}

async function lirePage(url, { fetchImpl = fetch, delaiMs = 15000, maxCaracteres = 6000 } = {}) {
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), delaiMs)
  try {
    const rep = await fetchImpl(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DropShipperPoste/0.1 (+https://www.drop-shipper.fr)', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    })
    const type = rep.headers.get('content-type') || ''
    if (!rep.ok) return { url, lisible: false, statut: rep.status, raison: `HTTP ${rep.status}` }
    if (!/html|text/i.test(type)) return { url, lisible: false, statut: rep.status, raison: `type ${type}` }
    const html = (await rep.text()).slice(0, MAX_OCTETS)
    const titre = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
    const finale = rep.url || url
    return {
      url,
      urlFinale: finale,
      lisible: true,
      statut: rep.status,
      titre: titre ? nettoyer(titre).slice(0, 200) : '',
      texte: nettoyer(html).slice(0, maxCaracteres),
      liens: extraireLiens(html, finale),
      image: extraireImage(html, finale),
      prix: extrairePrix(html),
    }
  } catch (err) {
    return { url, lisible: false, raison: err && err.name === 'AbortError' ? 'délai dépassé' : String((err && err.message) || err) }
  } finally {
    clearTimeout(minuteur)
  }
}

module.exports = { lirePage, nettoyer, extraireLiens, extraireImage, extrairePrix }
