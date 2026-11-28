/**
 * Banc du journal des appels IA (28/11/2026) : sans base ni réseau.
 * Vérifie que tout appel Anthropic/Gemini est reconnu, que l'usage se lit en
 * JSON comme en flux, que le coût suit la grille d'aiModels.ts, et que
 * l'enveloppe de fetch rend la réponse intacte à l'appelant.
 */
import assert from 'node:assert/strict'

const recus: string[] = []
globalThis.fetch = (async (entree: any) => {
  recus.push(String(entree))
  return new Response(JSON.stringify({ model: 'claude-sonnet-5', stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch

const j = await import('./src/services/journalIA.js')

// Targets
assert.equal(j.cibleIA('https://api.anthropic.com/v1/messages', 'POST'), 'anthropic')
assert.equal(j.cibleIA('https://api.anthropic.com/v1/messages/batches', 'POST'), null)
assert.equal(j.cibleIA('https://api.anthropic.com/v1/messages', 'GET'), null)
assert.equal(j.cibleIA('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-image:generateContent?key=x', 'POST'), 'google')
assert.equal(j.cibleIA('https://www.drop-shipper.fr/api/health', 'POST'), null)

// Usage, JSON and streamed
const u = j.usageAnthropic(JSON.stringify({ model: 'claude-opus-5', stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40, server_tool_use: { web_search_requests: 3 } } }), false)
assert.deepEqual([u.modele, u.arret, u.entree, u.sortie, u.cacheLu, u.cacheEcrit, u.recherches], ['claude-opus-5', 'max_tokens', 10, 20, 30, 40, 3])
const sse = [
  'event: message_start',
  'data: {"type":"message_start","message":{"model":"claude-sonnet-5","usage":{"input_tokens":7000,"output_tokens":1,"cache_read_input_tokens":5000}}}',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":128000}}',
].join('\n')
const f = j.usageAnthropic(sse, true)
assert.deepEqual([f.modele, f.entree, f.sortie, f.cacheLu, f.arret], ['claude-sonnet-5', 7000, 128000, 5000, 'max_tokens'])

// Cost: Sonnet 5 = 2 $ / 10 $ per million (aiModels.ts); a shop cut at 128 k out = 1.28 $ of output alone
assert.equal(j.coutUsd('anthropic', { ...f, cacheLu: 0, entree: 0 }), 1.28)
assert.equal(j.coutUsd('anthropic-lot', { ...f, cacheLu: 0, entree: 0 }), 0.64)
assert.equal(j.coutUsd('anthropic', { ...u, entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 }), 0.03)
// Google (28/11/2026): its own row, search at 14 $ per 1,000; a model without a row (images) stays null
assert.equal(j.coutUsd('google', { ...u, modele: 'gemini-3.1-flash-lite', entree: 1_000_000, sortie: 0, cacheLu: 0, cacheEcrit: 0, recherches: 0 }), 0.25)
assert.equal(j.coutUsd('google', { ...u, modele: 'gemini-3.8-flash', entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, recherches: 2 }), 0.028)
assert.equal(j.coutUsd('google', { ...u, modele: 'gemini-3.1-flash-image' }), null)

// Caller read from the stack
assert.equal(j.appelantDansLaPile('Error\n    at x (file:///app/node_modules/@anthropic-ai/sdk/client.js:1:1)\n    at async enhanceListing (file:///app/dist/services/aiEnhancer.js:283:21)'), 'aiEnhancer.enhanceListing')

// The wrapper passes the answer through untouched, and context carries the user
const r = await j.avecContexteIA({ userId: 'u1' }, () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' }))
assert.equal(r.status, 200)
assert.equal((await r.json()).usage.output_tokens, 500)
await fetch('https://example.com/autre', { method: 'POST' })
assert.equal(recus.length, 2)

console.log('check-journal-ia : OK')
process.exit(0)
