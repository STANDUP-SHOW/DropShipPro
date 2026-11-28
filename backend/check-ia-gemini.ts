/**
 * La couche fournisseur Gemini (services/ia.ts), contre un faux serveur.
 *
 *   cd backend && npx tsx check-ia-gemini.ts
 *
 * Ce banc prouve la TRADUCTION (messages, outils, signatures, relances), pas
 * que Google répond comme ce faux serveur : la forme des réponses y est écrite
 * en dur. La preuve réelle reste l'appel en production (journal `[ia]`).
 */
process.env.GOOGLE_AI_API_KEY = 'cle-de-banc'
delete process.env.IA_FOURNISSEUR

const { clientIA, cleIA, fournisseurIA, journalIA, RequeteIAVide } = await import('./src/services/ia.js')

let echecs = 0
const ok = (nom: string, c: boolean, d = '') => {
  console.log(`${c ? 'ok  ' : 'RATE'}  ${nom}${d ? ` — ${d}` : ''}`)
  if (!c) echecs++
}

type Appel = { url: string; body: Record<string, any> }
let appels: Appel[] = []
let reponses: Array<{ status: number; json?: unknown; text?: string; headers?: Record<string, string> }> = []
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (init?.method === 'HEAD') {
    return new Response(null, { status: 302, headers: { location: 'https://www.exemple-reel.fr/produit/42' } })
  }
  appels.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} })
  const r = reponses.shift() ?? { status: 500, text: 'plus de réponse prévue' }
  return new Response(r.json ? JSON.stringify(r.json) : (r.text ?? ''), { status: r.status })
}) as typeof fetch

ok('Gemini est le fournisseur par défaut', fournisseurIA() === 'gemini')
ok('la clé lue est celle de Google', cleIA() === 'cle-de-banc')

const c = clientIA()

// 1. Requête vide : rien ne part.
appels = []
let refus = false
try {
  await c.messages.create({ model: 'gemini-3.8-flash', max_tokens: 10, messages: [{ role: 'user', content: '   ' }] })
} catch (e) {
  refus = e instanceof RequeteIAVide
}
ok('une requête vide est refusée avant tout appel', refus && appels.length === 0)

// 2. Texte simple + traduction du système + plafond de sortie.
appels = []
reponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: '{"a":1}', thoughtSignature: 'sig1' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, thoughtsTokenCount: 3 } } }]
const m1 = await c.messages.create({
  model: 'gemini-3.8-flash',
  max_tokens: 800,
  system: [{ type: 'text', text: 'consigne', cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: 'bonjour' }],
})
ok('un seul appel, sur le bon modèle', appels.length === 1 && appels[0].url.endsWith('/gemini-3.8-flash:generateContent'))
ok('la consigne part en systemInstruction', appels[0].body.systemInstruction?.parts?.[0]?.text === 'consigne')
ok('la réflexion a sa marge au-dessus de max_tokens', appels[0].body.generationConfig.maxOutputTokens === 800 + 4096)
ok('le texte revient en bloc text', m1.content[0]?.type === 'text' && (m1.content[0] as any).text === '{"a":1}')
ok('stop_reason end_turn', m1.stop_reason === 'end_turn')
ok('jetons de réflexion comptés en sortie', m1.usage.output_tokens === 8 && m1.usage.input_tokens === 12)

// 2b. output_config.effort medium → thinkingLevel medium, larger margin.
appels = []
reponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: 'page' }] }, finishReason: 'STOP' }] } }]
await c.messages.create({ model: 'gemini-3.8-flash', max_tokens: 48_000, output_config: { effort: 'medium' }, messages: [{ role: 'user', content: 'x' }] } as any)
ok('effort medium → thinkingLevel medium, plafond ≤ 65 536', appels[0].body.generationConfig.thinkingConfig.thinkingLevel === 'medium' && appels[0].body.generationConfig.maxOutputTokens === 48_000 + 16_384)

// 3. MAX_TOKENS → max_tokens (garde du JSON coupé).
reponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] } }]
const m2 = await c.messages.create({ model: 'gemini-3.8-flash', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] })
ok('MAX_TOKENS devient stop_reason max_tokens', m2.stop_reason === 'max_tokens')

// 4. Outils : déclaration, appel, réponse, signature renvoyée telle quelle.
appels = []
const partieAppel = { functionCall: { name: 'sonder_prix_catalogue', args: { motsCles: 'lampe' } }, thoughtSignature: 'sig-outil' }
reponses = [
  { status: 200, json: { candidates: [{ content: { parts: [partieAppel] }, finishReason: 'STOP' }] } },
  { status: 200, json: { candidates: [{ content: { parts: [{ text: 'réponse finale' }] }, finishReason: 'STOP' }] } },
]
const outils = [
  { name: 'sonder_prix_catalogue', description: 'd', input_schema: { type: 'object' as const, properties: { motsCles: { type: 'string', description: 'm' } }, required: [], additionalProperties: false } },
]
const r1 = await c.messages.create({ model: 'gemini-3.8-flash', max_tokens: 100, tools: outils, tool_choice: { type: 'tool', name: 'sonder_prix_catalogue' }, messages: [{ role: 'user', content: 'prix ?' }] })
const decl = appels[0].body.tools?.[0]?.functionDeclarations?.[0]
ok('outil déclaré, schéma nettoyé', decl?.name === 'sonder_prix_catalogue' && !('additionalProperties' in decl.parameters) && !('required' in decl.parameters))
ok('tool_choice imposé → mode ANY', appels[0].body.toolConfig?.functionCallingConfig?.mode === 'ANY')
const bloc = r1.content.find((b) => b.type === 'tool_use') as any
ok('functionCall → tool_use, stop_reason tool_use', bloc?.input?.motsCles === 'lampe' && r1.stop_reason === 'tool_use')
await c.messages.create({
  model: 'gemini-3.8-flash',
  max_tokens: 100,
  tools: outils,
  messages: [
    { role: 'user', content: 'prix ?' },
    { role: 'assistant', content: r1.content as any },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: bloc.id, content: '12 €' }] },
  ],
})
const tour2 = appels[1].body.contents
ok('la partie du modèle revient avec sa signature', tour2[1].role === 'model' && tour2[1].parts[0].thoughtSignature === 'sig-outil')
ok('tool_result → functionResponse nommé', tour2[2].parts[0].functionResponse?.name === 'sonder_prix_catalogue' && tour2[2].parts[0].functionResponse.response.content === '12 €')

// 5. Recherche : googleSearch, sources réelles derrière les redirections.
appels = []
const redir = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC'
reponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: `Voir ${redir}` }] }, finishReason: 'STOP', groundingMetadata: { webSearchQueries: ['q1', 'q2'], groundingChunks: [{ web: { uri: redir, title: 'exemple-reel.fr' } }] } }] } }]
const r3 = await c.messages.create({ model: 'gemini-3.8-flash', max_tokens: 100, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 } as any], messages: [{ role: 'user', content: 'cherche' }] })
ok('web_search → googleSearch', appels[0].body.tools?.[0]?.googleSearch !== undefined)
const res = r3.content.find((b) => b.type === 'web_search_tool_result') as any
ok('la source porte l’adresse réelle, pas la redirection', res?.content?.[0]?.url === 'https://www.exemple-reel.fr/produit/42')
ok('la redirection recopiée dans le texte est remplacée', (r3.content.find((b) => b.type === 'text') as any)?.text === 'Voir https://www.exemple-reel.fr/produit/42')
ok('recherches comptées', (r3.usage as any).server_tool_use?.web_search_requests === 2)

// 6. Aucune relance aveugle : un 429 = un seul appel, puis l'erreur.
appels = []
reponses = [{ status: 429, text: 'RESOURCE_EXHAUSTED' }]
let statut = 0
try {
  await c.messages.create({ model: 'gemini-3.8-flash', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] })
} catch (e) {
  statut = (e as { status?: number }).status ?? 0
}
ok('429 : un seul appel, erreur 429 rendue', appels.length === 1 && statut === 429)

// 7. Modèle retiré (404, non facturé) : modèle suivant de la cascade.
appels = []
reponses = [
  { status: 404, text: 'models/gemini-3.1-flash-lite is not found' },
  { status: 200, json: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] } },
]
const r4 = await c.messages.create({ model: 'gemini-3.1-flash-lite', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] })
ok('404 → modèle suivant, réponse rendue', appels.length === 2 && appels[1].url.includes('gemini-3.8-flash') && r4.model === 'gemini-3.8-flash')

// 8. Clé refusée.
reponses = [{ status: 400, text: 'API key not valid. API_KEY_INVALID' }]
try {
  await c.messages.create({ model: 'gemini-3.6-flash', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] })
} catch (e) {
  statut = (e as { status?: number }).status ?? 0
}
ok('clé invalide → 401', statut === 401)

ok('chaque appel est journalisé', journalIA().length >= 9)

// 9. Lot (réécritures) : rejoué en direct, résultats lus une fois.
reponses = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: 'lot' }] }, finishReason: 'STOP' }] } }]
const lot = await (c.messages.batches as any).create({ requests: [{ custom_id: 'j1', params: { model: 'gemini-3.8-flash', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] } }] })
const etat = await (c.messages.batches as any).retrieve(lot.id)
const lignes: any[] = []
for await (const l of (c.messages.batches as any).results(lot.id)) lignes.push(l)
ok('lot fini, une ligne réussie', etat.processing_status === 'ended' && lignes[0]?.result?.type === 'succeeded')
ok('lot inconnu (redémarrage) → perdu', (await (c.messages.batches as any).retrieve('lot_gemini_inconnu')).processing_status === 'perdu')

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
