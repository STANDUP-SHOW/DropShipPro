'use strict'
/**
 * The DropShipper rayons with any KANTIX key, not only Anthropic (max, 26/10/2026:
 * Anthropic is needed for the brief of a new analysis; analyses then run on any AI).
 *
 * Two adapters over lib/fournisseurs-ia.js `generer`, with the shapes the rayon
 * already uses, so lib/rayon.js does not change:
 *  - `message` like lib/claude.js (texte, arret, usage.input_tokens/output_tokens);
 *  - `chercherLot` like lib/recherche-claude.js (one list of {titre,url,extrait} per query).
 *
 * Search with another provider: the model runs its own web search (OpenAI, Gemini,
 * Perplexity) and returns a JSON list per query. A result is kept only when its URL
 * is among the pages the provider itself reports as read (or, for Gemini whose links
 * are redirects, when its site is among the sites read): a URL written by the model
 * alone never reaches a report. A lot with nothing verifiable throws.
 */
const { ErreurFournisseur } = require('./erreurs')

const SYSTEME_RECHERCHE = [
  'Tu es l’outil de recherche web d’un poste d’analyses de marché.',
  'Pour CHACUNE des requêtes numérotées, lance une recherche web telle qu’elle est écrite, sans la reformuler.',
  'Réponds UNIQUEMENT par un objet JSON, sans texte autour :',
  '{"resultats":[{"requete":"<requête telle quelle>","pages":[{"titre":"…","url":"https://…","extrait":"…"}]}]}',
  'Une entrée par requête, dans l’ordre. Jusqu’à 8 pages par requête, seulement des pages réellement trouvées par ta recherche.',
  '« extrait » recopie un passage de la page (nom de modèle, prix affiché, chiffre, date), 300 caractères au plus. Tu n’inventes ni URL, ni prix, ni chiffre.',
].join('\n')

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const hote = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const sansFragment = (u) => { try { const x = new URL(u); x.hash = ''; return x.href.replace(/\/$/, '') } catch { return String(u || '') } }

function lireJson(texte) {
  const t = String(texte || '')
  const debut = t.indexOf('{')
  const fin = t.lastIndexOf('}')
  if (debut < 0 || fin <= debut) return null
  try { return JSON.parse(t.slice(debut, fin + 1)) } catch { return null }
}

const surSite = (h, domaines) => domaines.some((d) => h === d || h.endsWith(`.${d}`))

/** @param {{generer: Function, nom: string}} p  generer(args) = fournisseurs-ia.generer bound to one key */
function creerClaudeGenerique({ generer, nom }) {
  async function message({ systeme, utilisateur, maxTokens = 32000, effort = 'medium' }) {
    const r = await generer({ systeme, messages: [{ role: 'user', parties: [{ type: 'texte', texte: String(utilisateur) }] }], rechercheWeb: false, maxTokens: Math.max(maxTokens, 16), effort })
    return { texte: r.texte || '', arret: r.arret || null, usage: { input_tokens: r.usage.entree || 0, output_tokens: r.usage.sortie || 0 }, moteur: `${r.fournisseur}/${r.modele}` }
  }
  return { message, nom }
}

function creerRechercheGenerique({ generer, nom }) {
  async function chercherLot(requetes, { domaines = null } = {}) {
    const liste = requetes.map((q) => String(q).replace(/\bsite:\S+/gi, '').trim()).filter(Boolean)
    if (!liste.length) return { resultats: [], usage: { recherches: 0, entree: 0, sortie: 0, dollars: 0 } }
    const sites = domaines && domaines.length ? domaines.map((d) => String(d).toLowerCase().replace(/^www\./, '')) : null
    const consigne = 'Requêtes :\n' + liste.map((q, i) => `${i + 1}. ${q}`).join('\n') + (sites ? `\n\nCherche uniquement sur ces sites : ${sites.join(', ')}.` : '')
    const r = await generer({ systeme: SYSTEME_RECHERCHE, messages: [{ role: 'user', parties: [{ type: 'texte', texte: consigne }] }], rechercheWeb: true, maxTokens: 8000, effort: 'low' })
    const lues = new Set((r.urls || []).map(sansFragment))
    const sitesLus = new Set([...(r.domaines || []), ...(r.urls || []).map(hote)].map((d) => String(d).toLowerCase().replace(/^www\./, '')).filter(Boolean))
    const j = lireJson(r.texte)
    const entrees = j && Array.isArray(j.resultats) ? j.resultats : []
    const resultats = liste.map((q, i) => {
      const e = entrees.find((x) => x && norm(x.requete) === norm(q)) || entrees[i] || {}
      return (Array.isArray(e.pages) ? e.pages : [])
        .filter((p) => p && /^https?:\/\//i.test(p.url || ''))
        .filter((p) => lues.has(sansFragment(p.url)) || sitesLus.has(hote(p.url)))
        .filter((p) => !sites || surSite(hote(p.url), sites))
        .map((p) => ({ titre: String(p.titre || ''), url: p.url, extrait: String(p.extrait || '').slice(0, 400), age: '', questions: [], associees: [] }))
    })
    const usage = { recherches: r.usage.recherches || 0, entree: r.usage.entree || 0, sortie: r.usage.sortie || 0, dollars: 0 }
    if (!resultats.some((l) => l.length)) {
      const pourquoi = !j ? 'réponse sans liste JSON' : !lues.size && !sitesLus.size ? 'aucune page lue par la recherche web' : 'aucune page citée n’a été lue par la recherche web'
      throw new ErreurFournisseur(nom, `recherche web sans résultat vérifiable (${pourquoi})`)
    }
    return { resultats, usage, erreurs: [] }
  }
  async function chercher(requete) {
    const { resultats } = await chercherLot([requete])
    return resultats[0]
  }
  return { moteur: nom, chercher, chercherLot, domainesRefuses: () => [] }
}

module.exports = { creerClaudeGenerique, creerRechercheGenerique, SYSTEME_RECHERCHE }
