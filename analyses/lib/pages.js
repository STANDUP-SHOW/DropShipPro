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
    }
  } catch (err) {
    return { url, lisible: false, raison: err && err.name === 'AbortError' ? 'délai dépassé' : String((err && err.message) || err) }
  } finally {
    clearTimeout(minuteur)
  }
}

module.exports = { lirePage, nettoyer, extraireLiens }
