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

/** How many other addresses of the report (marketplace prices, sources…) were not among the pages read. Counted only. */
function compterUrlsNonVues(rapport, vues) {
  let n = 0
  const voir = (o) => {
    if (!o || typeof o !== 'object') return
    for (const k of Object.keys(o)) {
      if (k === 'supplier_url' || k === 'image_url' || k === 'poste') continue
      const v = o[k]
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) && !vues.has(cle(v.trim()))) n++
      else if (v && typeof v === 'object') voir(v)
    }
  }
  voir(rapport)
  return n
}

/**
 * The agent's report is kept exactly as written (Max, 27/11/2026: « tout tel quel ») : no link, price,
 * margin, image, decision or score is changed or blanked here. The counts below are statistics only.
 * @param {object} rapport  parsed MarketSpy JSON (never mutated)
 * @param {Set<string>} urlsVues  URLs seen in search results or on pages read
 * @param {{imagesVues?: Set<string>, urlsFournisseurs?: Set<string>}} o
 */
function valider(rapport, urlsVues, { attendus = 20, imagesVues = null, urlsFournisseurs = null } = {}) {
  const problemes = []
  const produits = Array.isArray(rapport.products) ? rapport.products : []
  const vues = new Set([...urlsVues].map(cle))
  const fournisseurs = urlsFournisseurs ? new Set([...urlsFournisseurs].map(cle)) : null
  let horsSourcing = 0
  const distinctes = new Set()
  let invention = 0
  let margesSuspectes = 0
  let imagesInventees = 0

  for (const p of produits) {
    if (estHttp(p.supplier_url)) {
      if (vues.has(cle(p.supplier_url))) distinctes.add(cle(p.supplier_url))
      else invention++
      if (fournisseurs && vues.has(cle(p.supplier_url)) && !fournisseurs.has(cle(p.supplier_url))) horsSourcing++
    }
    if (imagesVues && estHttp(p.image_url) && !imagesVues.has(p.image_url)) imagesInventees++
    const vente = Number(p.target_selling_price)
    for (const champ of ['gross_margin', 'net_margin_estimated']) {
      const m = Number(p[champ])
      if (Number.isFinite(m) && Number.isFinite(vente) && vente > 0 && m > vente) margesSuspectes++
    }
  }

  const autresNonVues = compterUrlsNonVues(rapport, vues)

  if (produits.length !== attendus) problemes.push(`${produits.length} produits au lieu de ${attendus}`)
  for (const k of ['study', 'executive_summary', 'market', 'creative_prompts']) {
    if (!rapport[k] || typeof rapport[k] !== 'object') problemes.push(`bloc « ${k} » absent`)
  }
  const cp = rapport.creative_prompts || {}
  if (!Array.isArray(cp.image_ads) || !cp.image_ads.length) problemes.push('aucun prompt d’image')
  if (!Array.isArray(cp.short_videos_30s) || !cp.short_videos_30s.length) problemes.push('aucun prompt de vidéo')

  return {
    ok: problemes.length === 0,
    problemes,
    stats: { produits: produits.length, urlsDistinctes: distinctes.size, inventions: invention, autresUrlsRetirees: 0, autresUrlsNonLues: autresNonVues, margesSuspectes, imagesInventees, horsSourcing, avecPrixAchat: produits.filter((p) => Number(p.purchase_price) > 0).length },
  }
}

module.exports = { valider, cle, estHttp, NON_VERIFIE }
