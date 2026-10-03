'use strict'
/**
 * Anthropic Messages API, streamed (a full report can run for minutes).
 *
 * `output_config: { effort: 'medium' }` is mandatory: without it adaptive
 * thinking at default effort swallows the whole token budget before a single
 * line is written (empty report, stop_reason max_tokens).
 */
const { ErreurFournisseur } = require('./erreurs')

const URL_API = 'https://api.anthropic.com/v1/messages'

// `espace`: workspace id (wrkspc_…). Required by keys not scoped to a workspace: the API answers 400 without the header.
function creerClaude({ cle, modele, espace = '', fetchImpl = fetch, url = URL_API }) {
  if (!cle) throw new ErreurFournisseur('Anthropic', 'clé absente (Réglages › Clés).')
  async function message({ systeme, utilisateur, maxTokens = 32000, effort = 'medium', flux = true }) {
    const rep = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'x-api-key': cle,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        ...(espace ? { 'anthropic-workspace-id': espace } : {}),
      },
      body: JSON.stringify({
        model: modele,
        max_tokens: maxTokens,
        output_config: { effort },
        stream: flux,
        ...(systeme ? { system: systeme } : {}),
        messages: [{ role: 'user', content: utilisateur }],
      }),
    })
    if (!rep.ok) {
      const brut = await rep.text()
      let msg = brut.slice(0, 300)
      try { msg = JSON.parse(brut).error.message } catch { /* keep raw */ }
      throw new ErreurFournisseur('Anthropic', `${rep.status} - ${msg}`, { statut: rep.status, corps: brut })
    }
    if (!flux) {
      const j = await rep.json()
      return résumer(j.content, j.stop_reason, j.usage)
    }
    return lireFlux(rep)
  }
  return { message }
}

function résumer(blocs, arret, usage) {
  const texte = (blocs || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  return { texte, arret: arret || null, usage: usage || {} }
}

/** Minimal SSE reader: accumulates text deltas, stop_reason and usage. */
async function lireFlux(rep) {
  const dec = new TextDecoder()
  let tampon = ''
  let texte = ''
  let arret = null
  const usage = {}
  const traiter = (ligne) => {
    if (!ligne.startsWith('data:')) return
    const brut = ligne.slice(5).trim()
    if (!brut || brut === '[DONE]') return
    let ev
    try { ev = JSON.parse(brut) } catch { return }
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') texte += ev.delta.text
    else if (ev.type === 'message_start' && ev.message && ev.message.usage) Object.assign(usage, ev.message.usage)
    else if (ev.type === 'message_delta') {
      if (ev.delta && ev.delta.stop_reason) arret = ev.delta.stop_reason
      if (ev.usage) Object.assign(usage, ev.usage)
    } else if (ev.type === 'error') {
      throw new ErreurFournisseur('Anthropic', (ev.error && ev.error.message) || 'erreur de flux')
    }
  }
  for await (const morceau of rep.body) {
    tampon += dec.decode(morceau, { stream: true })
    const lignes = tampon.split('\n')
    tampon = lignes.pop()
    for (const l of lignes) traiter(l.replace(/\r$/, ''))
  }
  if (tampon) traiter(tampon)
  return { texte, arret, usage }
}

module.exports = { creerClaude }
