'use strict'
/**
 * Web search through the Anthropic API's own server tool (`web_search`), with
 * the Anthropic key Max already has: no extra subscription. Same shape as
 * lib/serper.js `chercher` (titre, url, extrait), so the rayon does not care
 * which engine ran.
 *
 * - Searches go in lots: one Messages call runs several searches (each one is
 *   billed $10 per 1,000 by Anthropic, plus the tokens of the results).
 * - The result URLs come from the API's own `web_search_result` blocks, never
 *   from the model's text. The excerpt is the `cited_text` of the citations
 *   (verbatim text of the page, up to 150 characters each), never a paraphrase.
 * - `domaines` restricts a lot to those sites (the API's own `allowed_domains`, enforced by
 *   Anthropic, subdomains included): the sourcing wave searches supplier sites only.
 * - A lot where no search succeeded throws: an empty list must never pass for a
 *   successful wave (23/09).
 */
const { ErreurFournisseur } = require('./erreurs')

const URL_API = 'https://api.anthropic.com/v1/messages'
const OUTIL = 'web_search_20250305'
const PAUSES_MAX = 4

// $ per 1M tokens (input, output) for the cost line of the journal; unknown model = Sonnet price.
const PRIX = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-sonnet-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] }
const DOLLARS_PAR_RECHERCHE = 0.01

const SYSTEME = [
  'Tu es l’outil de recherche du Poste d’analyses DropShipper.',
  'Tu lances une recherche web pour CHACUNE des requêtes numérotées, exactement telle qu’elle est écrite, une recherche par requête, sans en ajouter ni en reformuler. Lance-les toutes avant d’écrire quoi que ce soit.',
  'Ensuite, pour chaque requête, écris « ## » suivi de la requête, puis une ligne courte par résultat utile qui CITE la page (nom de modèle, prix affiché, chiffre, date). Tu ne commentes pas, tu ne conclus pas, tu n’inventes rien.',
].join('\n')

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

function coutDollars({ recherches = 0, entree = 0, sortie = 0 }, modele) {
  const [pe, ps] = PRIX[modele] || PRIX['claude-sonnet-5-5']
  return Math.round((recherches * DOLLARS_PAR_RECHERCHE + (entree * pe + sortie * ps) / 1e6) * 1000) / 1000
}

/**
 * Reads the content blocks of one answer (all its pause_turn parts) into
 * { requete -> [{titre,url,extrait,age}] }, plus the error codes met.
 */
function lireBlocs(blocs, requetes) {
  const requeteDe = new Map() // server_tool_use id -> query typed by the model
  const resultats = [] // [{ id, liste | erreur }] in order
  const citations = new Map() // url -> [cited_text]
  for (const b of blocs) {
    if (b.type === 'server_tool_use' && b.name === 'web_search') requeteDe.set(b.id, String((b.input && b.input.query) || ''))
    else if (b.type === 'web_search_tool_result') {
      if (Array.isArray(b.content)) resultats.push({ id: b.tool_use_id, liste: b.content.filter((r) => r && r.type === 'web_search_result') })
      else resultats.push({ id: b.tool_use_id, erreur: String((b.content && b.content.error_code) || 'inconnue') })
    } else if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const c of b.citations) {
        if (!c || !c.url || !c.cited_text) continue
        if (!citations.has(c.url)) citations.set(c.url, [])
        const l = citations.get(c.url)
        if (!l.includes(c.cited_text)) l.push(c.cited_text)
      }
    }
  }

  const sortie = requetes.map(() => null)
  const erreurs = []
  let reussies = 0
  for (const r of resultats) {
    if (r.erreur) { erreurs.push(r.erreur); continue }
    reussies++
    const tapee = requeteDe.get(r.id) || ''
    // the query as asked; a reworded one takes the first query still without results
    let k = requetes.findIndex((q, i) => sortie[i] === null && norm(q) === norm(tapee))
    if (k < 0) k = sortie.findIndex((x) => x === null)
    if (k < 0) continue
    sortie[k] = r.liste
      .filter((x) => /^https?:\/\//i.test(x.url || ''))
      .map((x) => ({ titre: String(x.title || ''), url: x.url, extrait: (citations.get(x.url) || []).join(' … ').slice(0, 400), age: x.page_age || '' }))
  }
  return { listes: sortie.map((l) => l || []), erreurs, reussies, lancees: resultats.length }
}

const PASSAGERES = new Set(['too_many_requests', 'unavailable'])

/**
 * Sites the API refuses in allowed_domains (its crawler is blocked there), read from the 400:
 * "The following domains are not accessible to our user agent: ['dhgate.com']" (11/10, BIGWORK).
 */
function domainesRefuses(err) {
  const m = /not accessible to our user agent:\s*\[([^\]]*)\]/i.exec(String((err && err.message) || ''))
  return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1].toLowerCase()) : []
}

function creerRechercheClaude({ cle, modele, espace = '', fetchImpl = fetch, url = URL_API, attenteReprise = 20000 }) {
  if (!cle) throw new ErreurFournisseur('Anthropic', 'clé absente (Réglages › Clés).')
  // sites refused once are left out of every later lot of this engine
  const refuses = new Set()

  async function appeler(corps) {
    const rep = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'x-api-key': cle,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        ...(espace ? { 'anthropic-workspace-id': espace } : {}),
      },
      body: JSON.stringify(corps),
    })
    const brut = await rep.text()
    if (!rep.ok) {
      let msg = brut.slice(0, 300)
      try { msg = JSON.parse(brut).error.message } catch { /* keep raw */ }
      throw new ErreurFournisseur('Anthropic', `${rep.status} - ${msg}`, { statut: rep.status, corps: brut })
    }
    try { return JSON.parse(brut) } catch { throw new ErreurFournisseur('Anthropic', 'réponse illisible de la recherche web') }
  }

  /**
   * Runs every query of the lot; returns one result list per query (same order),
   * each with `questions`/`associees` empty (Google-only data), plus the usage.
   */
  async function chercherLot(requetes, { reprise = true, domaines = null } = {}) {
    const liste = requetes.map((q) => String(q).replace(/\bsite:\S+/gi, '').trim()).filter(Boolean)
    const autorises = domaines && domaines.length ? domaines.filter((d) => !refuses.has(d.toLowerCase())) : null
    if (domaines && domaines.length && !autorises.length) throw new ErreurFournisseur('Anthropic', `tous les sites demandés sont refusés par la recherche web (${[...refuses].join(', ')})`)
    if (!liste.length) return { resultats: [], usage: { recherches: 0, entree: 0, sortie: 0, dollars: 0 } }
    const messages = [{ role: 'user', content: 'Requêtes :\n' + liste.map((q, i) => `${i + 1}. ${q}`).join('\n') }]
    const corps = {
      model: modele,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: SYSTEME,
      tools: [{ type: OUTIL, name: 'web_search', max_uses: liste.length + 2, user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' }, ...(autorises ? { allowed_domains: autorises } : {}) }],
      messages,
    }
    const usage = { recherches: 0, entree: 0, sortie: 0 }
    const blocs = []
    for (let tour = 0; tour <= PAUSES_MAX; tour++) {
      let j
      try {
        j = await appeler(corps)
      } catch (err) {
        // one refused site must not sink the lot: drop the sites the API names and ask again, same turn
        const noms = autorises ? domainesRefuses(err) : []
        const tool = corps.tools[0]
        const restants = noms.length ? tool.allowed_domains.filter((d) => !noms.includes(d.toLowerCase())) : []
        if (!noms.length || !restants.length || restants.length === tool.allowed_domains.length) throw err
        for (const n of noms) refuses.add(n)
        tool.allowed_domains = restants
        tour--
        continue
      }
      const u = j.usage || {}
      usage.entree += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
      usage.sortie += u.output_tokens || 0
      usage.recherches += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0
      blocs.push(...(j.content || []))
      if (j.stop_reason === 'refusal') throw new ErreurFournisseur('Anthropic', 'recherche web refusée par le modèle')
      if (j.stop_reason !== 'pause_turn') break
      // the server loop paused: send the turn back unchanged, it resumes by itself
      messages.push({ role: 'assistant', content: j.content })
    }
    const lu = lireBlocs(blocs, liste)
    usage.dollars = coutDollars(usage, modele)
    if (!lu.reussies && reprise && lu.erreurs.length && lu.erreurs.every((e) => PASSAGERES.has(e))) {
      // rate limit or internal error on every search of the lot: one retry after a pause, never more
      await new Promise((r) => setTimeout(r, attenteReprise))
      const deuxieme = await chercherLot(requetes, { reprise: false, domaines })
      for (const k of ['recherches', 'entree', 'sortie']) deuxieme.usage[k] += usage[k]
      deuxieme.usage.dollars = coutDollars(deuxieme.usage, modele)
      return deuxieme
    }
    if (!lu.reussies) {
      const raison = lu.erreurs.length ? `erreurs ${[...new Set(lu.erreurs)].join(', ')}` : 'aucune recherche lancée par le modèle'
      throw new ErreurFournisseur('Anthropic', `recherche web sans résultat (${raison}) — vérifiez que la recherche web est autorisée dans la console Anthropic`)
    }
    const resultats = lu.listes.map((r) => Object.assign(r, { questions: [], associees: [] }))
    return { resultats, usage, erreurs: lu.erreurs }
  }

  async function chercher(requete) {
    const { resultats } = await chercherLot([requete])
    return resultats[0]
  }

  return { moteur: 'claude', chercher, chercherLot, domainesRefuses: () => [...refuses] }
}

module.exports = { creerRechercheClaude, domainesRefuses, lireBlocs, coutDollars, DOLLARS_PAR_RECHERCHE, OUTIL }
