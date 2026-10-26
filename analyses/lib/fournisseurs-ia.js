'use strict'
/**
 * The AI providers KANTIX can run an analysis with. One neutral call
 * (`generer`) per family of API:
 *  - anthropic : Messages API (streamed), web search = Anthropic's server tool;
 *  - openai    : Responses API (streamed), web search = OpenAI's `web_search` tool;
 *  - gemini    : Gemini `streamGenerateContent`, web search = Google Search grounding;
 *  - compatible: any OpenAI-compatible `/chat/completions` (Mistral, DeepSeek, Grok, Groq,
 *                OpenRouter, Together, Perplexity, or an address typed by the team).
 *
 * The URLs a provider says it read come from its own structured fields (search
 * results, citations, grounding chunks), never from the model's text: they are
 * what the report's links are checked against.
 *
 * Keys are passed in at call time and never logged.
 */
const { ErreurFournisseur } = require('./erreurs')

// `recherche`: true when the API itself can search the web. `base`: the API root.
// Default models are left empty on purpose (except Anthropic, used by the brief): the team picks
// one from the provider's own list (« Lister les modèles »), nothing is guessed here.
const FOURNISSEURS = [
  { id: 'anthropic', nom: 'Anthropic (Claude)', type: 'anthropic', base: 'https://api.anthropic.com/v1', recherche: true, modele: 'claude-sonnet-5-5', console: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', nom: 'OpenAI (GPT)', type: 'openai', base: 'https://api.openai.com/v1', recherche: true, modele: '', console: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', nom: 'Google (Gemini)', type: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', recherche: true, modele: '', console: 'https://aistudio.google.com/apikey' },
  { id: 'mistral', nom: 'Mistral AI', type: 'compatible', base: 'https://api.mistral.ai/v1', recherche: false, modele: '', console: 'https://console.mistral.ai/api-keys' },
  { id: 'deepseek', nom: 'DeepSeek', type: 'compatible', base: 'https://api.deepseek.com', recherche: false, modele: '', console: 'https://platform.deepseek.com/api_keys' },
  { id: 'xai', nom: 'xAI (Grok)', type: 'compatible', base: 'https://api.x.ai/v1', recherche: false, modele: '', console: 'https://console.x.ai' },
  { id: 'groq', nom: 'Groq', type: 'compatible', base: 'https://api.groq.com/openai/v1', recherche: false, modele: '', console: 'https://console.groq.com/keys' },
  { id: 'openrouter', nom: 'OpenRouter', type: 'compatible', base: 'https://openrouter.ai/api/v1', recherche: false, modele: '', console: 'https://openrouter.ai/keys' },
  { id: 'together', nom: 'Together AI', type: 'compatible', base: 'https://api.together.xyz/v1', recherche: false, modele: '', console: 'https://api.together.ai/settings/api-keys' },
  { id: 'perplexity', nom: 'Perplexity', type: 'compatible', base: 'https://api.perplexity.ai', recherche: true, rechercheIntegree: true, modele: '', console: 'https://www.perplexity.ai/account/api/keys' },
  { id: 'compatible', nom: 'Autre service compatible OpenAI (adresse au choix)', type: 'compatible', base: '', recherche: false, modele: '', console: '' },
]

const fournisseur = (id) => FOURNISSEURS.find((f) => f.id === id) || null

/** Where calls go: the key's own address for « compatible », else the provider's (overridable by the bench). */
function base(cle) {
  const f = fournisseur(cle.fournisseur)
  if (!f) throw new Error(`Fournisseur inconnu : ${cle.fournisseur}`)
  const b = (cle.base || f.base || '').replace(/\/+$/, '')
  if (!/^https?:\/\//.test(b)) throw new Error(`Adresse de l’API absente pour la clé « ${cle.nom} ».`)
  return b
}

// ------------------------------------------------------------------ SSE
async function* evenementsSSE(rep) {
  const dec = new TextDecoder()
  let tampon = ''
  const lire = function* (bloc) {
    const data = bloc.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n')
    if (!data || data === '[DONE]') return
    try { yield JSON.parse(data) } catch { /* keep-alive or partial noise */ }
  }
  for await (const morceau of rep.body) {
    tampon += dec.decode(morceau, { stream: true }).replace(/\r/g, '')
    let i
    while ((i = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, i)
      tampon = tampon.slice(i + 2)
      yield* lire(bloc)
    }
  }
  if (tampon.trim()) yield* lire(tampon)
}

async function refus(nom, rep) {
  const brut = await rep.text()
  let msg = brut.slice(0, 300)
  try {
    const j = JSON.parse(brut)
    msg = (j.error && (j.error.message || j.error)) || j.message || msg
    if (Array.isArray(j) && j[0] && j[0].error) msg = j[0].error.message
  } catch { /* keep raw */ }
  return new ErreurFournisseur(nom, `${rep.status} - ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, { statut: rep.status, corps: brut })
}

const dataUrl = (p) => `data:${p.mime};base64,${p.base64}`

// ------------------------------------------------------------------ Anthropic
const OUTIL_RECHERCHE_ANTHROPIC = 'web_search_20250305'
const PAUSES_MAX = 4

function partiesAnthropic(parties) {
  return parties.map((p) => {
    if (p.type === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.base64 } }
    if (p.type === 'pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 }, ...(p.nom ? { title: p.nom } : {}) }
    return { type: 'text', text: p.texte }
  })
}

/** Reads one streamed answer back into its content blocks (needed to resume a `pause_turn`). */
async function lireFluxAnthropic(rep, suivi) {
  const blocs = []
  const json = new Map()
  let arret = null
  for await (const ev of evenementsSSE(rep)) {
    if (ev.type === 'message_start' && ev.message && ev.message.usage) Object.assign(suivi.usage, ev.message.usage)
    else if (ev.type === 'content_block_start') {
      blocs[ev.index] = JSON.parse(JSON.stringify(ev.content_block))
      const b = blocs[ev.index]
      if (b.type === 'text') b.text = b.text || ''
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r && /^https?:\/\//.test(r.url || '')) suivi.urls.add(r.url)
        suivi.recherches++
      }
    } else if (ev.type === 'content_block_delta') {
      const b = blocs[ev.index]
      if (!b) continue
      if (ev.delta.type === 'text_delta') { b.text += ev.delta.text; suivi.texte += ev.delta.text }
      else if (ev.delta.type === 'input_json_delta') json.set(ev.index, (json.get(ev.index) || '') + ev.delta.partial_json)
      else if (ev.delta.type === 'citations_delta' && ev.delta.citation) {
        b.citations = b.citations || []
        b.citations.push(ev.delta.citation)
        if (ev.delta.citation.url) suivi.urls.add(ev.delta.citation.url)
      }
    } else if (ev.type === 'content_block_stop') {
      if (json.has(ev.index) && blocs[ev.index]) {
        try { blocs[ev.index].input = JSON.parse(json.get(ev.index) || '{}') } catch { blocs[ev.index].input = {} }
      }
    } else if (ev.type === 'message_delta') {
      if (ev.delta && ev.delta.stop_reason) arret = ev.delta.stop_reason
      if (ev.usage) Object.assign(suivi.usage, ev.usage)
    } else if (ev.type === 'error') {
      throw new ErreurFournisseur('Anthropic', (ev.error && ev.error.message) || 'erreur de flux')
    }
  }
  return { blocs: blocs.filter(Boolean), arret }
}

async function genererAnthropic({ cle, url, modele, systeme, messages, rechercheWeb, maxTokens, effort, fetchImpl, espace, cache }) {
  const conv = messages.map((m) => ({ role: m.role, content: partiesAnthropic(m.parties) }))
  const suivi = { texte: '', urls: new Set(), usage: {}, recherches: 0 }
  let arret = null
  for (let tour = 0; tour <= PAUSES_MAX; tour++) {
    const rep = await fetchImpl(`${url}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(espace ? { 'anthropic-workspace-id': espace } : {}) },
      body: JSON.stringify({
        model: modele,
        max_tokens: maxTokens,
        // mandatory: without it adaptive thinking can swallow the whole budget (empty report, 19/09)
        output_config: { effort },
        stream: true,
        ...(cache ? { cache_control: { type: 'ephemeral' } } : {}),
        ...(systeme ? { system: systeme } : {}),
        ...(rechercheWeb ? { tools: [{ type: OUTIL_RECHERCHE_ANTHROPIC, name: 'web_search', max_uses: 30 }] } : {}),
        messages: conv,
      }),
    })
    if (!rep.ok) throw await refus('Anthropic', rep)
    const r = await lireFluxAnthropic(rep, suivi)
    arret = r.arret
    if (arret !== 'pause_turn') break
    conv.push({ role: 'assistant', content: r.blocs })
  }
  return { texte: suivi.texte, arret, urls: [...suivi.urls], usage: { entree: suivi.usage.input_tokens || 0, sortie: suivi.usage.output_tokens || 0, cacheLu: suivi.usage.cache_read_input_tokens || 0, recherches: suivi.recherches } }
}

// ------------------------------------------------------------------ OpenAI (Responses API)
function partiesOpenAI(role, parties) {
  return parties.map((p) => {
    if (role === 'assistant') return { type: 'output_text', text: p.texte || '' }
    if (p.type === 'image') return { type: 'input_image', image_url: dataUrl(p) }
    if (p.type === 'pdf') return { type: 'input_file', filename: p.nom || 'document.pdf', file_data: dataUrl({ mime: 'application/pdf', base64: p.base64 }) }
    return { type: 'input_text', text: p.texte }
  })
}

async function genererOpenAI({ cle, url, modele, systeme, messages, rechercheWeb, maxTokens, fetchImpl }) {
  const rep = await fetchImpl(`${url}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modele,
      stream: true,
      max_output_tokens: maxTokens,
      ...(systeme ? { instructions: systeme } : {}),
      ...(rechercheWeb ? { tools: [{ type: 'web_search' }] } : {}),
      input: messages.map((m) => ({ role: m.role, content: partiesOpenAI(m.role, m.parties) })),
    }),
  })
  if (!rep.ok) throw await refus('OpenAI', rep)
  let texte = ''
  let final = null
  for await (const ev of evenementsSSE(rep)) {
    if (ev.type === 'response.output_text.delta') texte += ev.delta || ''
    else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') final = ev.response
    else if (ev.type === 'response.failed' || ev.type === 'error') throw new ErreurFournisseur('OpenAI', (ev.response && ev.response.error && ev.response.error.message) || ev.message || 'échec')
  }
  const urls = new Set()
  let recherches = 0
  for (const item of (final && final.output) || []) {
    if (item.type === 'web_search_call') {
      recherches++
      for (const s of (item.action && item.action.sources) || []) if (s && s.url) urls.add(s.url)
    }
    if (item.type === 'message') for (const c of item.content || []) for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url) urls.add(a.url)
  }
  const u = (final && final.usage) || {}
  const arret = final && final.status === 'incomplete' ? 'max_tokens' : 'end_turn'
  return { texte, arret, urls: [...urls], usage: { entree: u.input_tokens || 0, sortie: u.output_tokens || 0, recherches } }
}

// ------------------------------------------------------------------ Gemini
function partiesGemini(parties) {
  return parties.map((p) => (p.type === 'image' || p.type === 'pdf' ? { inline_data: { mime_type: p.type === 'pdf' ? 'application/pdf' : p.mime, data: p.base64 } } : { text: p.texte }))
}

async function genererGemini({ cle, url, modele, systeme, messages, rechercheWeb, maxTokens, fetchImpl }) {
  const rep = await fetchImpl(`${url}/models/${encodeURIComponent(modele)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'x-goog-api-key': cle, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(systeme ? { systemInstruction: { parts: [{ text: systeme }] } } : {}),
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: partiesGemini(m.parties) })),
      ...(rechercheWeb ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  })
  if (!rep.ok) throw await refus('Gemini', rep)
  let texte = ''
  let arret = null
  const urls = new Set()
  const domaines = new Set()
  let usage = {}
  let recherches = 0
  for await (const ev of evenementsSSE(rep)) {
    const c = (ev.candidates || [])[0]
    if (c) {
      for (const p of (c.content && c.content.parts) || []) if (p.text && !p.thought) texte += p.text
      if (c.finishReason) arret = c.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn'
      const g = c.groundingMetadata
      if (g) {
        recherches = Math.max(recherches, (g.webSearchQueries || []).length)
        // Google gives redirect links (vertexaisearch…) with the site's title: kept as given
        for (const ch of g.groundingChunks || []) {
          if (ch.web && ch.web.uri) urls.add(ch.web.uri)
          if (ch.web && ch.web.title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(ch.web.title)) domaines.add(ch.web.title.toLowerCase().replace(/^www\./, ''))
        }
      }
    }
    if (ev.usageMetadata) usage = ev.usageMetadata
  }
  // the redirect links do not name the page: the site's domain (the chunk's title) is what the report is checked against
  return { texte, arret, urls: [...urls], domaines: [...domaines], usage: { entree: usage.promptTokenCount || 0, sortie: usage.candidatesTokenCount || 0, recherches } }
}

// ------------------------------------------------------------------ OpenAI-compatible chat completions
function contenuCompatible(role, parties, nomFournisseur) {
  if (role === 'assistant' || parties.every((p) => p.type === 'texte')) return parties.map((p) => p.texte || '').join('\n\n')
  return parties.map((p) => {
    if (p.type === 'image') return { type: 'image_url', image_url: { url: dataUrl(p) } }
    if (p.type === 'pdf') throw new Error(`${nomFournisseur} ne lit pas les PDF : utilisez une clé Anthropic, OpenAI ou Gemini pour ce document.`)
    return { type: 'text', text: p.texte }
  })
}

async function genererCompatible({ f, cle, url, modele, systeme, messages, maxTokens, fetchImpl }) {
  const rep = await fetchImpl(`${url}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modele,
      stream: true,
      max_tokens: maxTokens,
      messages: [...(systeme ? [{ role: 'system', content: systeme }] : []), ...messages.map((m) => ({ role: m.role, content: contenuCompatible(m.role, m.parties, f.nom) }))],
    }),
  })
  if (!rep.ok) throw await refus(f.nom, rep)
  let texte = ''
  let arret = null
  const urls = new Set()
  let usage = {}
  for await (const ev of evenementsSSE(rep)) {
    const c = (ev.choices || [])[0]
    if (c && c.delta && typeof c.delta.content === 'string') texte += c.delta.content
    if (c && c.finish_reason) arret = c.finish_reason === 'length' ? 'max_tokens' : 'end_turn'
    if (ev.usage) usage = ev.usage
    // Perplexity: the pages its own search read
    for (const u of ev.citations || []) if (typeof u === 'string') urls.add(u)
    for (const s of ev.search_results || []) if (s && s.url) urls.add(s.url)
    if (ev.error) throw new ErreurFournisseur(f.nom, ev.error.message || JSON.stringify(ev.error))
  }
  return { texte, arret, urls: [...urls], usage: { entree: usage.prompt_tokens || 0, sortie: usage.completion_tokens || 0, recherches: f.rechercheIntegree && urls.size ? 1 : 0 } }
}

/**
 * One generation, whatever the provider.
 * @param {object} p
 * @param {{fournisseur, nom, modele?, base?}} p.cleInfo  the key's public record
 * @param {string} p.cle  the secret itself
 * @param {Array<{role:'user'|'assistant', parties:Array<{type:'texte',texte}|{type:'image',mime,base64}|{type:'pdf',base64,nom}>}>} p.messages
 * @returns {Promise<{texte, arret, urls:string[], usage}>}
 */
async function generer({ cleInfo, cle, modele, systeme = '', messages, rechercheWeb = false, maxTokens = 32000, effort = 'medium', fetchImpl = fetch, espace = '', cache = false }) {
  const f = fournisseur(cleInfo.fournisseur)
  if (!f) throw new Error(`Fournisseur inconnu : ${cleInfo.fournisseur}`)
  if (!cle) throw new ErreurFournisseur(f.nom, `clé « ${cleInfo.nom} » absente ou illisible sur ce PC (onglet Clés API).`)
  const m = modele || cleInfo.modele || f.modele
  if (!m) throw new Error(`Aucun modèle choisi pour la clé « ${cleInfo.nom} » : onglet Clés API › Lister les modèles.`)
  const url = base(cleInfo)
  const recherche = Boolean(rechercheWeb && f.recherche && !f.rechercheIntegree)
  const commun = { cle, url, modele: m, systeme, messages, rechercheWeb: recherche, maxTokens, fetchImpl }
  let r
  if (f.type === 'anthropic') r = await genererAnthropic({ ...commun, effort, espace, cache })
  else if (f.type === 'openai') r = await genererOpenAI(commun)
  else if (f.type === 'gemini') r = await genererGemini(commun)
  else r = await genererCompatible({ ...commun, f })
  return { ...r, fournisseur: f.id, modele: m }
}

/**
 * The provider's own list of models: also the key test (« connectée » only after this real call worked).
 * @returns {Promise<{modeles:string[], nonListable?:boolean}>}
 */
async function listerModeles({ cleInfo, cle, fetchImpl = fetch, espace = '' }) {
  const f = fournisseur(cleInfo.fournisseur)
  if (!f) throw new Error(`Fournisseur inconnu : ${cleInfo.fournisseur}`)
  if (!cle) throw new ErreurFournisseur(f.nom, 'clé absente.')
  const url = base(cleInfo)
  let rep
  if (f.type === 'anthropic') rep = await fetchImpl(`${url}/models?limit=100`, { headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', ...(espace ? { 'anthropic-workspace-id': espace } : {}) } })
  else if (f.type === 'gemini') rep = await fetchImpl(`${url}/models?pageSize=200`, { headers: { 'x-goog-api-key': cle } })
  else rep = await fetchImpl(`${url}/models`, { headers: { Authorization: `Bearer ${cle}` } })
  // some compatible services have no model list: the key is then checked by the first analysis
  if (f.type === 'compatible' && (rep.status === 404 || rep.status === 405)) return { modeles: [], nonListable: true }
  if (!rep.ok) throw await refus(f.nom, rep)
  const j = await rep.json()
  if (f.type === 'gemini') {
    return { modeles: (j.models || []).filter((x) => (x.supportedGenerationMethods || []).includes('generateContent')).map((x) => String(x.name || '').replace(/^models\//, '')).filter(Boolean) }
  }
  return { modeles: (j.data || []).map((x) => x.id).filter(Boolean) }
}

module.exports = { FOURNISSEURS, fournisseur, generer, listerModeles, evenementsSSE }
