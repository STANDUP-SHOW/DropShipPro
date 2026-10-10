'use strict'
/**
 * The three checks that have already failed once, plus the rule that an
 * invented URL is the only fault that cannot be undone:
 *  1. 20 products — not 18, not 12;
 *  2. 20 distinct http(s) URLs, each one actually seen on a page we read;
 *  3. margins in EUROS, never a percentage.
 * Unverified values become "Non vérifié" instead of being kept.
 */
const NON_VERIFIE = 'Non vérifié'

const estHttp = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u)

/** Normalises a URL for comparison (no fragment, no trailing slash, lower-case host). */
function cle(u) {
  try {
    const x = new URL(u)
    x.hash = ''
    return x.protocol + '//' + x.host.toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search
  } catch {
    return String(u)
  }
}

/**
 * @param {object} rapport  parsed MarketSpy JSON (mutated: unverified fields become "Non vérifié")
 * @param {Set<string>} urlsVues  URLs seen in search results or on pages read
 */
function valider(rapport, urlsVues, { attendus = 20 } = {}) {
  const problemes = []
  const produits = Array.isArray(rapport.products) ? rapport.products : []
  const vues = new Set([...urlsVues].map(cle))
  const distinctes = new Set()
  let invention = 0
  let margesSuspectes = 0

  for (const p of produits) {
    if (estHttp(p.supplier_url) && vues.has(cle(p.supplier_url))) {
      distinctes.add(cle(p.supplier_url))
    } else {
      if (estHttp(p.supplier_url)) invention++
      p.supplier_url = NON_VERIFIE
      p.url_type = 'non_verifie'
    }
    if (p.image_url && !estHttp(p.image_url)) p.image_url = NON_VERIFIE
    const vente = Number(p.target_selling_price)
    for (const champ of ['gross_margin', 'net_margin_estimated']) {
      const m = Number(p[champ])
      if (Number.isFinite(m) && Number.isFinite(vente) && vente > 0 && m > vente) {
        margesSuspectes++
        p[champ] = null
      }
    }
  }

  if (produits.length !== attendus) problemes.push(`${produits.length} produits au lieu de ${attendus}`)
  if (distinctes.size !== attendus) problemes.push(`${distinctes.size} URL vérifiées et distinctes au lieu de ${attendus}`)
  if (invention) problemes.push(`${invention} URL absentes des pages lues, remplacées par « ${NON_VERIFIE} »`)
  if (margesSuspectes) problemes.push(`${margesSuspectes} marge(s) supérieure(s) au prix de vente (pourcentage ?), vidée(s)`)
  for (const k of ['study', 'executive_summary', 'market', 'creative_prompts']) {
    if (!rapport[k] || typeof rapport[k] !== 'object') problemes.push(`bloc « ${k} » absent`)
  }
  const cp = rapport.creative_prompts || {}
  if (!Array.isArray(cp.image_ads) || !cp.image_ads.length) problemes.push('aucun prompt d’image')
  if (!Array.isArray(cp.short_videos_30s) || !cp.short_videos_30s.length) problemes.push('aucun prompt de vidéo')

  return {
    ok: problemes.length === 0,
    problemes,
    stats: { produits: produits.length, urlsDistinctes: distinctes.size, inventions: invention, margesSuspectes },
  }
}

module.exports = { valider, cle, estHttp, NON_VERIFIE }
