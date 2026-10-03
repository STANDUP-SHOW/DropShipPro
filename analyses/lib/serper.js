'use strict'
/**
 * Serper (Google results). A refusal is an exception carrying the provider's
 * message: on 23/09 a swallowed "Not enough credits" turned 17 failed runs into
 * "success" for six days.
 */
const { ErreurFournisseur } = require('./erreurs')

const URL_SERPER = 'https://google.serper.dev/search'

function creerSerper({ cle, fetchImpl = fetch, url = URL_SERPER }) {
  if (!cle) throw new ErreurFournisseur('Serper', 'clé absente (Réglages › Clés).')

  // One POST to a Serper endpoint (search, shopping, autocomplete, images); a refusal throws.
  async function appeler(point, charge) {
    const adresse = point === 'search' ? url : url.replace(/\/search\/?$/, `/${point}`)
    const rep = await fetchImpl(adresse, {
      method: 'POST',
      headers: { 'X-API-KEY': cle, 'Content-Type': 'application/json' },
      body: JSON.stringify(charge),
    })
    const texte = await rep.text()
    let corps = null
    try { corps = JSON.parse(texte) } catch { /* handled below */ }
    if (!rep.ok) {
      const msg = (corps && (corps.message || corps.error)) || texte.slice(0, 200) || `HTTP ${rep.status}`
      throw new ErreurFournisseur('Serper', `${rep.status} - ${msg}`, { statut: rep.status })
    }
    if (!corps || corps.message === 'Not enough credits') {
      throw new ErreurFournisseur('Serper', (corps && corps.message) || 'réponse illisible')
    }
    return corps
  }

  async function chercher(requete, { num = 10 } = {}) {
    // `site:` is refused by the free plan; query in natural language and filter URLs in code.
    const q = String(requete).replace(/\bsite:\S+/gi, '').trim()
    const corps = await appeler('search', { q, gl: 'fr', hl: 'fr', num })
    const organiques = Array.isArray(corps.organic) ? corps.organic : []
    const res = organiques.map((o) => ({ titre: o.title || '', url: o.link || '', extrait: o.snippet || '' })).filter((o) => /^https?:\/\//i.test(o.url))
    // Google's own "People also ask" and "Related searches": real questions and wordings of buyers.
    res.questions = (Array.isArray(corps.peopleAlsoAsk) ? corps.peopleAlsoAsk : []).map((x) => String(x.question || '').trim()).filter(Boolean)
    res.associees = (Array.isArray(corps.relatedSearches) ? corps.relatedSearches : []).map((x) => String(x.query || '').trim()).filter(Boolean)
    return res
  }

  /** Google Shopping France: real offers (seller, displayed price) for a product name. */
  async function shopping(requete, { num = 10 } = {}) {
    const corps = await appeler('shopping', { q: String(requete).trim(), gl: 'fr', hl: 'fr', num })
    return (Array.isArray(corps.shopping) ? corps.shopping : []).map((o) => ({
      titre: String(o.title || '').trim(),
      vendeur: String(o.source || '').trim(),
      prix: String(o.price || '').trim(),
      url: /^https?:\/\//i.test(o.link || '') ? o.link : '',
      note: o.rating === undefined || o.rating === null ? null : Number(o.rating),
      avis: o.ratingCount === undefined || o.ratingCount === null ? null : Number(o.ratingCount),
    })).filter((o) => o.titre)
  }

  /** Google autocomplete: what buyers start typing. */
  async function autocomplete(requete) {
    const corps = await appeler('autocomplete', { q: String(requete).trim(), gl: 'fr', hl: 'fr' })
    return (Array.isArray(corps.suggestions) ? corps.suggestions : []).map((x) => String(x.value || '').trim()).filter(Boolean)
  }

  /** Google Images: image addresses with the page they come from. */
  async function images(requete, { num = 6 } = {}) {
    const corps = await appeler('images', { q: String(requete).trim(), gl: 'fr', hl: 'fr', num })
    return (Array.isArray(corps.images) ? corps.images : []).map((x) => ({
      titre: String(x.title || '').trim(),
      image: /^https?:\/\//i.test(x.imageUrl || '') ? x.imageUrl : '',
      page: /^https?:\/\//i.test(x.link || '') ? x.link : '',
      source: String(x.source || x.domain || '').trim(),
    })).filter((x) => x.image)
  }

  return { chercher, shopping, autocomplete, images }
}

module.exports = { creerSerper }
