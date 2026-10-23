'use strict'
/**
 * Google Keyword Planner volumes, read through the site's admin routes (docs/mots-cles-google.md):
 *   POST /api/admin/mots-cles        { motsCles[] }        → { motsCles: [{ texte, volumeMensuel, … }], refus[] }
 *   POST /api/admin/mots-cles/idees  { graines[], limite } → same shape, sorted by volume
 *
 * Enrichment only: any refusal (503 non-configure while Google's Basic access is pending, quota,
 * network) is logged once and the rayon goes on without volumes. A figure Google does not give
 * stays null, never 0.
 */

const PLAFOND_ENVOI = 500

/** Google takes at most 10 words and 80 characters per keyword; it matches lower case, no punctuation. */
function motCleDe(texte) {
  const mots = String(texte || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 10)
  let s = mots.join(' ')
  while (s.length > 80) s = s.slice(0, s.lastIndexOf(' ') > 0 ? s.lastIndexOf(' ') : 80)
  return s
}

/** Site row → the block stored with a product (English keys, like the rest of the report). */
function demandeDe(m) {
  const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    keyword: m.texte,
    monthly_searches: nombre(m.volumeMensuel),
    competition: m.concurrence || null,
    competition_index: nombre(m.indiceConcurrence),
    three_month_change: nombre(m.evolution3Mois),
    monthly_trend: Array.isArray(m.tendance) ? m.tendance.map((t) => ({ month: t.mois, searches: nombre(t.recherches) })) : [],
    source: 'google_keyword_planner',
  }
}

/**
 * One reader per rayon. `appeler({ chemin, corps })` is appelerAdmin bound to the Poste's key.
 * After the first refusal it stops calling: one log line per rayon, not one per product.
 */
function lecteurMotsCles({ appeler, journal, etiquette }) {
  const volumes = new Map()
  const etat = { statut: 'non-demande', motif: null, raison: null, demandes: 0, idees: [] }

  function refuser(err) {
    etat.statut = err.motif === 'non-configure' ? 'non-configure' : 'erreur'
    etat.motif = err.motif || null
    etat.raison = String(err.message || err)
    journal.info(`${etiquette} : volumes Google indisponibles, analyse poursuivie sans eux`, { motif: etat.motif, raison: etat.raison })
  }

  async function mesurer(textes) {
    if (etat.statut === 'non-configure' || etat.statut === 'erreur') return
    const manquants = [...new Set(textes.map(motCleDe).filter(Boolean))].filter((k) => !volumes.has(k)).slice(0, PLAFOND_ENVOI)
    if (!manquants.length) return
    try {
      const r = await appeler({ chemin: '/mots-cles', corps: { motsCles: manquants } })
      etat.demandes += manquants.length
      etat.statut = 'ok'
      for (const m of r.motsCles || []) if (m && m.texte) volumes.set(motCleDe(m.texte), demandeDe(m))
    } catch (err) { refuser(err) }
  }

  async function idees(graines, limite = 30) {
    if (etat.statut === 'non-configure' || etat.statut === 'erreur') return
    const g = [...new Set(graines.map(motCleDe).filter(Boolean))].slice(0, 10)
    if (!g.length) return
    try {
      const r = await appeler({ chemin: '/mots-cles/idees', corps: { graines: g, limite } })
      etat.statut = 'ok'
      etat.idees = (r.motsCles || []).filter((m) => m && m.texte).map(demandeDe)
    } catch (err) { refuser(err) }
  }

  /** Evidence section for the big call, or '' when nothing was measured. */
  function section() {
    const lignes = (liste) => liste.map((d) => `- ${d.keyword} | ${d.monthly_searches === null ? 'volume non communiqué' : `${d.monthly_searches} recherches/mois`} | concurrence ${d.competition || 'inconnue'}${d.three_month_change === null ? '' : ` | ${d.three_month_change > 0 ? '+' : ''}${d.three_month_change} % sur 3 mois`}`).join('\n')
    const mesures = [...volumes.values()]
    if (!mesures.length && !etat.idees.length) return ''
    return '# DEMANDE GOOGLE (Planificateur de mots-clés Google Ads, France, moyenne mensuelle sur 12 mois ; chiffres réels, à utiliser pour demand_score)\n'
      + (mesures.length ? '## Modèles repérés\n' + lignes(mesures) + '\n' : '')
      + (etat.idees.length ? '## Recherches les plus fréquentes du thème\n' + lignes(etat.idees) : '')
  }

  /** Stores the measured demand with each product; measures the names the model wrote that were not asked yet. */
  async function ranger(produits) {
    await mesurer(produits.map((p) => p && p.product_name).filter(Boolean))
    let avecVolume = 0
    for (const p of produits) {
      if (!p || !p.product_name) continue
      const d = volumes.get(motCleDe(p.product_name))
      if (!d) continue
      p.search_demand = d
      if (d.monthly_searches !== null) avecVolume++
    }
    return avecVolume
  }

  return { mesurer, idees, section, ranger, etat }
}

module.exports = { lecteurMotsCles, motCleDe, demandeDe }
