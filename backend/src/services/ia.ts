import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { EQUIVALENT_CLAUDE, MODELE_REDACTION, cascadeGemini } from './aiModels.js'

/**
 * La couche fournisseur : tout le serveur appelle l'IA par ici, et nulle part
 * ailleurs.
 *
 * **Décision de max du 28/11/2026** : plus aucun crédit API Claude. Deux fois
 * (octobre, puis du 21 au 25/11) le solde Anthropic s'est vidé sans résultat.
 * Le site tourne donc sur la clé Google (`GOOGLE_AI_API_KEY`, déjà posée sur
 * Railway pour les images) et sur Gemini par défaut.
 *
 * Les services gardent la forme des messages Anthropic (`messages.create`,
 * blocs `text` / `tool_use`, `stop_reason`, `usage`) : cette couche la traduit
 * vers l'API `generateContent` de Google et retour. Vingt-six fichiers n'ont
 * donc changé que deux lignes chacun, et leurs garde-fous (JSON coupé,
 * `max_tokens`, liens vérifiés) lisent exactement les mêmes champs qu'avant.
 *
 * Anthropic n'est plus appelé que si `IA_FOURNISSEUR=anthropic` est posé
 * exprès sur le serveur ET qu'une clé Anthropic existe. Sans ce réglage, la
 * clé Anthropic est ignorée même si elle traîne encore dans Railway.
 *
 * Trois règles, pour ne pas reproduire la perte d'argent :
 * 1. **Une requête vide ne part pas.** Pas de message, ou rien que du blanc :
 *    refus avant tout appel, donc rien de facturé.
 * 2. **Aucune relance aveugle.** Un appel = un essai. Les seuls seconds essais
 *    sont sur des refus que Google ne facture pas (404 modèle inconnu → modèle
 *    suivant de la cascade ; 400 sur une option → même requête sans l'option).
 * 3. **Un journal par appel** : modèle, jetons, recherches, durée, issue. Dans
 *    les journaux Railway (`[ia]`), et les 200 derniers en mémoire pour
 *    `/api/health/ia`.
 */

export type Fournisseur = 'gemini' | 'anthropic'

export function fournisseurIA(): Fournisseur {
  const voulu = process.env.IA_FOURNISSEUR?.trim().toLowerCase()
  if (voulu === 'anthropic' && process.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic'
  return 'gemini'
}

/** La clé du fournisseur actif, ou `undefined` : « l'IA n'est pas configurée ». */
export function cleIA(): string | undefined {
  const cle =
    fournisseurIA() === 'anthropic' ? process.env.ANTHROPIC_API_KEY?.trim() : process.env.GOOGLE_AI_API_KEY?.trim()
  return cle || undefined
}

/* ---------- Le journal ---------- */

export interface LigneJournal {
  quand: string
  fournisseur: Fournisseur
  modele: string
  issue: string
  entree: number
  sortie: number
  recherches: number
  ms: number
}

const JOURNAL: LigneJournal[] = []

function journaliser(l: LigneJournal) {
  JOURNAL.push(l)
  if (JOURNAL.length > 200) JOURNAL.shift()
  console.log(
    `[ia] ${l.fournisseur} ${l.modele} ${l.issue} ${l.entree}+${l.sortie} jetons${l.recherches ? `, ${l.recherches} recherche(s)` : ''}, ${l.ms} ms`,
  )
}

export function journalIA(): LigneJournal[] {
  return [...JOURNAL].reverse()
}

/* ---------- Le client ---------- */

/**
 * Le client à appeler. Typé comme le SDK Anthropic pour que les services ne
 * changent pas de lecture ; l'objet réel est l'adaptateur Gemini.
 */
export function clientIA(): Anthropic {
  if (fournisseurIA() === 'anthropic') return clientAnthropicGarde()
  return new ClientGemini(process.env.GOOGLE_AI_API_KEY?.trim() ?? '') as unknown as Anthropic
}

/** La garde Anthropic : même modèle demandé, traduit vers son équivalent Claude. */
function clientAnthropicGarde(): Anthropic {
  const vrai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const versClaude = <T extends { model: string }>(p: T): T => ({ ...p, model: EQUIVALENT_CLAUDE[p.model] ?? p.model })
  const messages = {
    create: (p: Anthropic.Messages.MessageCreateParamsNonStreaming, o?: Anthropic.RequestOptions) => {
      refuserSiVide(p)
      return vrai.messages.create(versClaude(p), { maxRetries: 0, ...o })
    },
    stream: (p: Anthropic.Messages.MessageStreamParams, o?: Anthropic.RequestOptions) => {
      refuserSiVide(p)
      return vrai.messages.stream(versClaude(p), { maxRetries: 0, ...o })
    },
    batches: vrai.messages.batches,
  }
  return { messages } as unknown as Anthropic
}

export class RequeteIAVide extends Error {
  status = 400
  constructor() {
    super("Requête IA vide : rien n'a été envoyé ni facturé.")
  }
}

type Params = Anthropic.Messages.MessageCreateParams

function texteDe(c: unknown): string {
  if (typeof c === 'string') return c
  if (Array.isArray(c))
    return c
      .map((b) => {
        const x = b as Record<string, unknown>
        if (x.type === 'text') return String(x.text ?? '')
        if (x.type === 'tool_result') return texteDe(x.content) || 'resultat'
        return x.type ? 'contenu' : ''
      })
      .join(' ')
  return ''
}

/** Règle 1 : une requête sans contenu ne part pas. */
function refuserSiVide(p: { messages?: unknown; model?: unknown }) {
  const messages = Array.isArray(p.messages) ? p.messages : []
  if (!p.model || !messages.length) throw new RequeteIAVide()
  const dernier = messages[messages.length - 1] as { content?: unknown }
  if (!texteDe(dernier?.content).trim()) throw new RequeteIAVide()
}

/* ---------- L'adaptateur Gemini ---------- */

const API = 'https://generativelanguage.googleapis.com/v1beta/models'

class ErreurIA extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Le statut à la façon Anthropic, pour que `aiHealth` et les services lisent le même code. */
function statutDe(status: number, detail: string): number {
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(detail)) return 401
  return status
}

type PartieGemini = Record<string, unknown>

interface ReponseGemini {
  candidates?: Array<{
    content?: { parts?: PartieGemini[] }
    finishReason?: string
    groundingMetadata?: {
      webSearchQueries?: string[]
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
    }
  }>
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number }
}

/**
 * Le schéma d'un outil, réduit à ce que `functionDeclarations.parameters`
 * accepte (sous-ensemble OpenAPI). Un mot-clé inconnu fait refuser la requête
 * entière : on garde la liste blanche.
 */
const CLES_SCHEMA = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'format', 'nullable', 'minItems', 'maxItems', 'minimum', 'maximum'])
export function schemaGemini(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(schemaGemini)
  if (!s || typeof s !== 'object') return s
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (!CLES_SCHEMA.has(k)) continue
    if (k === 'type' && Array.isArray(v)) {
      const types = v.filter((t) => t !== 'null')
      out.type = types[0] ?? 'string'
      if (types.length < v.length) out.nullable = true
    } else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v).map(([n, d]) => [n, schemaGemini(d)]))
    } else if (k === 'items') out.items = schemaGemini(v)
    else out[k] = v
  }
  if (out.type === 'object' && Array.isArray(out.required) && !out.required.length) delete out.required
  return out
}

/** Les messages Anthropic en `contents` Gemini. */
export function contenusGemini(messages: Anthropic.Messages.MessageParam[]): PartieGemini[] {
  const nomsOutils = new Map<string, string>()
  const contents: PartieGemini[] = []
  for (const m of messages) {
    const blocs = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as unknown as Record<string, unknown>[])
    const parts: PartieGemini[] = []
    for (const b of blocs) {
      if (b.type === 'tool_use') nomsOutils.set(String(b.id), String(b.name))
      // A part Gemini gave us comes back verbatim: it carries the thought signature Gemini 3 expects on replay.
      if (b._partieGemini) {
        parts.push(b._partieGemini as PartieGemini)
        continue
      }
      if (b.type === 'text') {
        if (String(b.text ?? '').length) parts.push({ text: String(b.text) })
      } else if (b.type === 'image') {
        const src = b.source as { type?: string; media_type?: string; data?: string }
        if (src?.type === 'base64' && src.data) parts.push({ inlineData: { mimeType: src.media_type ?? 'image/jpeg', data: src.data } })
      } else if (b.type === 'tool_use') {
        nomsOutils.set(String(b.id), String(b.name))
        parts.push({ functionCall: { name: b.name, args: b.input ?? {} } })
      } else if (b.type === 'tool_result') {
        const id = String(b.tool_use_id)
        parts.push({
          functionResponse: {
            name: nomsOutils.get(id) ?? 'outil',
            response: { content: texteDe(b.content) },
          },
        })
      }
      // web_search_tool_result and other server blocks: Gemini replays its own search, nothing to send.
    }
    if (parts.length) contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts })
  }
  return contents
}

function systemeTexte(system: Params['system']): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  return system.map((b) => b.text).join('\n\n')
}

type Niveau = 'low' | 'medium' | 'high'
/** Room for thinking on top of the answer budget the service planned (Google counts both in maxOutputTokens). */
const MARGE_REFLEXION: Record<Niveau, number> = { low: 4096, medium: 16_384, high: 24_576 }

interface Corps {
  body: Record<string, unknown>
  avecRecherche: boolean
  avecFonctions: boolean
}

function corpsGemini(p: Params): Corps {
  const outils = (p.tools ?? []) as unknown as Array<Record<string, unknown>>
  const recherche = outils.some((t) => String(t.type ?? '').startsWith('web_search'))
  const fonctions = outils
    .filter((t) => !t.type || t.type === 'custom')
    .map((t) => ({ name: t.name, description: t.description, parameters: schemaGemini(t.input_schema) }))

  const tools: unknown[] = []
  if (recherche) tools.push({ googleSearch: {} })
  if (fonctions.length) tools.push({ functionDeclarations: fonctions })

  /*
   * output_config.effort (Anthropic) → thinkingLevel (Gemini 3: low, medium,
   * high). Only where a service set it (28/11: the DropShop page write, max's
   * choice « medium ») ; low everywhere else.
   */
  const effort = (p as { output_config?: { effort?: string } }).output_config?.effort
  const niveau: Niveau = effort === 'medium' || effort === 'high' ? effort : 'low'
  const body: Record<string, unknown> = {
    contents: contenusGemini(p.messages),
    generationConfig: {
      /*
       * Gemini 3 réfléchit avant d'écrire, et la réflexion se prend sur le même
       * plafond que la réponse. C'est la panne du 19/09 (rapport vide, budget
       * avalé par la réflexion) : on la règle au plus bas et on ajoute sa marge
       * au-dessus de ce que le service avait prévu pour sa réponse.
       */
      maxOutputTokens: Math.min(65_536, p.max_tokens + MARGE_REFLEXION[niveau]),
      thinkingConfig: { thinkingLevel: niveau },
      ...(typeof p.temperature === 'number' ? { temperature: p.temperature } : {}),
    },
  }
  const sys = systemeTexte(p.system)
  if (sys) body.systemInstruction = { parts: [{ text: sys }] }
  if (tools.length) body.tools = tools

  const choix = p.tool_choice as { type?: string; name?: string } | undefined
  if (fonctions.length && choix?.type) {
    const mode = choix.type === 'tool' || choix.type === 'any' ? 'ANY' : choix.type === 'none' ? 'NONE' : 'AUTO'
    body.toolConfig = {
      functionCallingConfig: { mode, ...(choix.type === 'tool' && choix.name ? { allowedFunctionNames: [choix.name] } : {}) },
    }
  }
  return { body, avecRecherche: recherche, avecFonctions: fonctions.length > 0 }
}

/**
 * L'adresse réelle derrière un lien de source Google.
 *
 * Les sources de la recherche Google peuvent revenir sous forme de lien de
 * redirection : on lit sa destination (sans la suivre ni charger la page).
 * Une destination illisible fait retirer le lien — jamais d'adresse devinée.
 */
async function adresseReelle(uri: string): Promise<string | null> {
  try {
    const u = new URL(uri)
    if (!/(^|\.)vertexaisearch\.cloud\.google\.com$|(^|\.)google\.com$/.test(u.hostname) || !/redirect/.test(u.pathname)) return uri
    const r = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) })
    const loc = r.headers.get('location')
    return loc && /^https?:\/\//.test(loc) ? loc : null
  } catch {
    return null
  }
}

async function messageDepuisGemini(rep: ReponseGemini, modele: string): Promise<Anthropic.Message> {
  const cand = rep.candidates?.[0]
  const parts = cand?.content?.parts ?? []
  const content: Record<string, unknown>[] = []

  // The search results first, like Anthropic's server blocks: liensLus() and the
  // "did the search answer" checks read them.
  const chunks = cand?.groundingMetadata?.groundingChunks ?? []
  const sources: Array<{ type: string; url: string; title: string }> = []
  const vues = new Set<string>()
  const redirections = new Map<string, string | null>()
  for (const c of chunks) {
    if (!c.web?.uri) continue
    const url = await adresseReelle(c.web.uri)
    redirections.set(c.web.uri, url)
    if (!url || vues.has(url)) continue
    vues.add(url)
    sources.push({ type: 'web_search_result', url, title: c.web.title ?? '' })
  }
  // A redirect link the model copied into its text becomes the real page, or is removed.
  const reecrire = (t: string) => {
    let r = t
    for (const [brut, vrai] of redirections) if (brut !== vrai) r = r.split(brut).join(vrai ?? '')
    return r
  }
  if (sources.length) content.push({ type: 'web_search_tool_result', tool_use_id: `srvtoolu_${randomUUID()}`, content: sources })

  let appelOutil = false
  for (const part of parts) {
    if (part.thought) continue
    if (typeof part.text === 'string') {
      content.push({
        type: 'text',
        text: reecrire(part.text),
        citations: sources.length ? sources.map((s) => ({ type: 'web_search_result_location', url: s.url, title: s.title })) : null,
        _partieGemini: part,
      })
    } else if (part.functionCall) {
      appelOutil = true
      const fc = part.functionCall as { name?: string; args?: unknown; id?: string }
      content.push({ type: 'tool_use', id: fc.id ?? `toolu_${randomUUID()}`, name: fc.name, input: fc.args ?? {}, _partieGemini: part })
    }
  }

  const fin = cand?.finishReason
  const stop_reason = appelOutil
    ? 'tool_use'
    : fin === 'MAX_TOKENS'
      ? 'max_tokens'
      : fin && fin !== 'STOP'
        ? 'refusal'
        : rep.promptFeedback?.blockReason
          ? 'refusal'
          : 'end_turn'

  const u = rep.usageMetadata ?? {}
  return {
    id: `msg_gemini_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: modele,
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
      output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: cand?.groundingMetadata?.webSearchQueries?.length ?? 0 },
    },
  } as unknown as Anthropic.Message
}

/** Le dernier modèle de la cascade qui a répondu : un nom retiré ne se repaie pas à chaque appel. */
const retenu = new Map<string, string>()

export class ClientGemini {
  constructor(private cle: string) {}

  messages = {
    create: (p: Params, o?: { timeout?: number }) => this.creer(p, o),
    stream: (p: Params, o?: { timeout?: number }) => {
      // generateContent returns the whole answer: finalMessage() is all the callers read.
      const promesse = this.creer(p, { timeout: o?.timeout ?? 600_000 })
      return { finalMessage: () => promesse }
    },
    batches: new LotsGemini(this),
  }

  async creer(p: Params, o?: { timeout?: number }): Promise<Anthropic.Message> {
    refuserSiVide(p)
    if (!this.cle) throw new ErreurIA(401, "La clé Google (GOOGLE_AI_API_KEY) n'est pas posée sur le serveur.")

    const { body, avecRecherche, avecFonctions } = corpsGemini(p)
    const cascade = cascadeGemini(p.model)
    const premier = retenu.get(p.model)
    const essais = premier ? [premier, ...cascade.filter((m) => m !== premier)] : cascade
    const debut = Date.now()
    let corps = body
    let dernier: ErreurIA | null = null

    for (let i = 0; i < essais.length; i++) {
      const modele = essais[i]
      const res = await fetch(`${API}/${modele}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cle },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(o?.timeout ?? 120_000),
      }).catch((err: unknown) => {
        throw new ErreurIA(0, `Gemini injoignable : ${err instanceof Error ? err.message : String(err)}`)
      })

      if (res.ok) {
        const msg = await messageDepuisGemini((await res.json()) as ReponseGemini, modele)
        retenu.set(p.model, modele)
        journaliser({
          quand: new Date().toISOString(),
          fournisseur: 'gemini',
          modele,
          issue: msg.stop_reason ?? 'fin',
          entree: msg.usage.input_tokens,
          sortie: msg.usage.output_tokens,
          recherches: (msg.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0,
          ms: Date.now() - debut,
        })
        return msg
      }

      const detail = (await res.text().catch(() => '')).slice(0, 500)
      dernier = new ErreurIA(statutDe(res.status, detail), `Gemini ${res.status} (${modele}) : ${detail}`)
      journaliser({ quand: new Date().toISOString(), fournisseur: 'gemini', modele, issue: `refus ${res.status}`, entree: 0, sortie: 0, recherches: 0, ms: Date.now() - debut })

      // Unknown model: the next one of the cascade (a 404 is not billed).
      if (res.status === 404 || /NOT_FOUND|is not found|not supported for generateContent/i.test(detail)) continue
      // A rejected option (400, not billed): the same request once without it, then stop.
      if (res.status === 400 && /thinking/i.test(detail) && (corps.generationConfig as Record<string, unknown>)?.thinkingConfig) {
        const { thinkingConfig: _t, ...reste } = corps.generationConfig as Record<string, unknown>
        corps = { ...corps, generationConfig: reste }
        i--
        continue
      }
      if (res.status === 400 && avecRecherche && avecFonctions && Array.isArray(corps.tools) && corps.tools.length > 1) {
        console.error('[ia] recherche Google + outils refusés ensemble : même requête sans la recherche')
        corps = { ...corps, tools: (corps.tools as Array<Record<string, unknown>>).filter((t) => !t.googleSearch) }
        i--
        continue
      }
      break
    }
    throw dernier ?? new ErreurIA(0, 'Gemini : aucun modèle de la cascade ne répond.')
  }
}

/**
 * L'API Batch, rejouée en direct.
 *
 * `rewriteBatch.ts` soumet un lot, puis repasse lire les résultats. Ici le lot
 * s'exécute à la soumission (quatre à la fois, un essai chacun) et ses
 * résultats attendent en mémoire. Un redémarrage entre les deux les perd :
 * `retrieve` le dit (`perdu`), et le lot repart sans rien facturer au vendeur.
 */
type LigneLot = { custom_id: string; result: { type: 'succeeded'; message: Anthropic.Message } | { type: 'errored'; error: { message: string } } }
const LOTS = new Map<string, LigneLot[]>()

class LotsGemini {
  constructor(private client: ClientGemini) {}

  async create(body: { requests: Array<{ custom_id: string; params: unknown }> }): Promise<{ id: string }> {
    const id = `lot_gemini_${randomUUID()}`
    const lignes: LigneLot[] = []
    const file = [...body.requests]
    const ouvrier = async () => {
      for (let r = file.shift(); r; r = file.shift()) {
        try {
          const message = await this.client.creer(r.params as Params)
          lignes.push({ custom_id: r.custom_id, result: { type: 'succeeded', message } })
        } catch (err) {
          lignes.push({ custom_id: r.custom_id, result: { type: 'errored', error: { message: err instanceof Error ? err.message : String(err) } } })
        }
      }
    }
    await Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier()])
    LOTS.set(id, lignes)
    return { id }
  }

  async retrieve(id: string): Promise<{ processing_status: string }> {
    return { processing_status: LOTS.has(id) ? 'ended' : 'perdu' }
  }

  async *results(id: string): AsyncIterable<LigneLot> {
    const lignes = LOTS.get(id) ?? []
    LOTS.delete(id)
    for (const l of lignes) yield l
  }
}

/** Pour le diagnostic : le modèle d'écriture réellement retenu. */
export function modeleEcritureActuel(): string {
  return retenu.get(MODELE_REDACTION) ?? MODELE_REDACTION
}
