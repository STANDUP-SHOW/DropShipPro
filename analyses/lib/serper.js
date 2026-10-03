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
  async function chercher(requete, { num = 10 } = {}) {
    // `site:` is refused by the free plan; query in natural language and filter URLs in code.
    const q = String(requete).replace(/\bsite:\S+/gi, '').trim()
    const rep = await fetchImpl(url, {
      method: 'POST',
      headers: { 'X-API-KEY': cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'fr', hl: 'fr', num }),
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
    const organiques = Array.isArray(corps.organic) ? corps.organic : []
    const res = organiques.map((o) => ({ titre: o.title || '', url: o.link || '', extrait: o.snippet || '' })).filter((o) => /^https?:\/\//i.test(o.url))
    // Google's own "People also ask" and "Related searches": real questions and wordings of buyers.
    res.questions = (Array.isArray(corps.peopleAlsoAsk) ? corps.peopleAlsoAsk : []).map((x) => String(x.question || '').trim()).filter(Boolean)
    res.associees = (Array.isArray(corps.relatedSearches) ? corps.relatedSearches : []).map((x) => String(x.query || '').trim()).filter(Boolean)
    return res
  }
  return { chercher }
}

module.exports = { creerSerper }
