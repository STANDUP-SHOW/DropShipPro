import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express'
import { prisma } from '../lib/prisma.js'
import { MODELE_REDACTION, TARIFS } from './aiModels.js'

/**
 * Le journal de chaque appel payant à une IA.
 *
 * **28/11/2026.** Max constate 100 $ de crédit Anthropic consommés entre le 21
 * et le 25/11, alors que son compte — le seul à avoir travaillé — n'a pas
 * dépensé 10 € de drops et que presque tout a échoué. Le même écart en
 * octobre. Personne ne pouvait dire quels appels avaient coûté : le serveur
 * n'en gardait aucune trace, seule la console Anthropic voit le total.
 *
 * Plutôt que de recopier un compteur dans les vingt-cinq fichiers qui
 * appellent un modèle (et d'en oublier un, comme on oublie toujours le
 * vingt-sixième), on se place à l'endroit unique par où ils passent tous :
 * `fetch`. Le SDK Anthropic le prend à sa construction, les appels Google
 * (images) l'appellent directement. Chaque appel vers l'API Anthropic ou
 * Gemini est donc écrit dans la table `AppelIA` : qui (compte, route), quoi
 * (service et fonction, lus dans la pile), combien (jetons, recherches web,
 * coût d'après la grille d'`aiModels.ts`), et comment il a fini (statut,
 * arrêt du modèle). `GET /api/admin/couts-ia` met ce journal en regard des
 * drops réellement débités : un appel payé sans débit se voit le jour même.
 *
 * Rien n'est bloqué, rien n'est plafonné (décision de Max, 28/11) : le journal
 * observe, il ne décide pas. Une écriture ratée du journal ne fait jamais
 * échouer l'appel.
 */

export interface ContexteIA {
  userId?: string | null
  fonction?: string
  route?: string
}

const contexte = new AsyncLocalStorage<ContexteIA>()

/** Runs `fn` with an AI-call context (user, label) merged over the current one. */
export function avecContexteIA<T>(ctx: ContexteIA, fn: () => T): T {
  return contexte.run({ ...(contexte.getStore() ?? {}), ...ctx }, fn)
}

/** Called by the auth middlewares once the user is known. */
export function poserUtilisateurIA(userId: string): void {
  const store = contexte.getStore()
  if (store) store.userId = userId
}

/** App-level middleware: every request gets its own context, filled in by the auth step. */
export function middlewareContexteIA(req: ExpressRequest, _res: ExpressResponse, next: NextFunction): void {
  contexte.run({ route: `${req.method} ${req.originalUrl.split('?')[0].slice(0, 160)}` }, next)
}

/** Paris day, AAAA-MM-JJ. */
export function jourDeParis(d = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

type Fournisseur = 'anthropic' | 'anthropic-lot' | 'google'

function hoteAnthropic(): string {
  try {
    return new URL(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').host
  } catch {
    return 'api.anthropic.com'
  }
}

/** Which paid API a request targets, or null for every other request. */
export function cibleIA(url: string, methode: string): Fournisseur | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (methode.toUpperCase() !== 'POST') return null
  if (u.host === 'api.anthropic.com' || u.host === hoteAnthropic()) {
    if (/\/v1\/messages\/?$/.test(u.pathname)) return 'anthropic'
    // A batch is billed per result, when its results are read: rewriteBatch logs them itself.
    return null
  }
  if (u.host === 'generativelanguage.googleapis.com' && /:generateContent$|:streamGenerateContent$/.test(u.pathname)) return 'google'
  return null
}

/** The first frame of our own code in the stack: « service.fonction ». */
export function appelantDansLaPile(pile = new Error().stack ?? ''): string {
  for (const ligne of pile.split('\n').slice(1)) {
    if (ligne.includes('journalIA') || ligne.includes('node_modules') || ligne.includes('node:')) continue
    const m = ligne.match(/at (?:async )?([^\s(]+)?\s*\(?(?:file:\/\/)?[^\s()]*\/(services|routes|middleware)\/([A-Za-z0-9_-]+)\.[jt]s/)
    if (m) return `${m[3]}${m[1] && !m[1].includes('/') ? '.' + m[1].replace(/^Object\./, '') : ''}`
  }
  return 'inconnu'
}

export interface Usage {
  modele: string | null
  entree: number
  sortie: number
  cacheLu: number
  cacheEcrit: number
  recherches: number
  arret: string | null
}

const VIDE: Usage = { modele: null, entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, recherches: 0, arret: null }

function lireUsageAnthropic(u: Record<string, unknown> | undefined, acc: Usage): void {
  if (!u) return
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0)
  if (n('input_tokens')) acc.entree = n('input_tokens')
  if (n('output_tokens')) acc.sortie = n('output_tokens')
  if (n('cache_read_input_tokens')) acc.cacheLu = n('cache_read_input_tokens')
  if (n('cache_creation_input_tokens')) acc.cacheEcrit = n('cache_creation_input_tokens')
  const outils = u.server_tool_use as Record<string, unknown> | undefined
  if (outils && typeof outils.web_search_requests === 'number') acc.recherches = outils.web_search_requests
}

/** Usage of one Anthropic answer, plain JSON or server-sent events (streamed shops). */
export function usageAnthropic(corps: string, flux: boolean): Usage {
  const acc: Usage = { ...VIDE }
  try {
    if (!flux) {
      const j = JSON.parse(corps)
      acc.modele = j.model ?? null
      acc.arret = j.stop_reason ?? null
      lireUsageAnthropic(j.usage, acc)
      return acc
    }
    for (const ligne of corps.split('\n')) {
      if (!ligne.startsWith('data:')) continue
      let e: Record<string, any>
      try {
        e = JSON.parse(ligne.slice(5))
      } catch {
        continue
      }
      if (e.type === 'message_start') {
        acc.modele = e.message?.model ?? null
        lireUsageAnthropic(e.message?.usage, acc)
      } else if (e.type === 'message_delta') {
        acc.arret = e.delta?.stop_reason ?? acc.arret
        lireUsageAnthropic(e.usage, acc)
      }
    }
  } catch {
    /* unreadable body: the call is still logged, with zero tokens */
  }
  return acc
}

export function usageGoogle(corps: string, modeleUrl: string | null): Usage {
  const acc: Usage = { ...VIDE, modele: modeleUrl }
  try {
    const j = JSON.parse(corps)
    const m = j.usageMetadata ?? {}
    acc.entree = (m.promptTokenCount ?? 0) + (m.toolUsePromptTokenCount ?? 0)
    // Thinking tokens are billed as output by Google.
    acc.sortie = (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0)
    acc.cacheLu = m.cachedContentTokenCount ?? 0
    acc.recherches = j.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length ?? 0
    acc.arret = j.candidates?.[0]?.finishReason ?? null
  } catch {
    /* idem */
  }
  return acc
}

/**
 * Cost in dollars from the grid of aiModels.ts. Cache reads at a tenth, cache
 * writes at 1.25 × input, web search 10 $ per 1,000 (Anthropic's prices), batch
 * at half price. Google (28/11/2026): its own rows of the grid, search at
 * 14 $ per 1,000 queries (the 5,000 free monthly queries are ignored: an upper
 * bound); a model without a row (images) stays null — no invented price.
 */
export function coutUsd(f: Fournisseur, u: Usage): number | null {
  if (f === 'google') {
    const g = u.modele ? TARIFS[u.modele] : undefined
    if (!g) return null
    // cachedContentTokenCount is included in promptTokenCount: no double count.
    const total = (u.entree * g.in + u.sortie * g.out) / 1_000_000 + u.recherches * 0.014
    return Math.round(total * 1_000_000) / 1_000_000
  }
  const t = (u.modele && TARIFS[u.modele.replace(/-\d{8}$/, '')]) || TARIFS[MODELE_REDACTION]
  const jetons = (u.entree * t.in + u.cacheLu * t.in * 0.1 + u.cacheEcrit * t.in * 1.25 + u.sortie * t.out) / 1_000_000
  const total = (f === 'anthropic-lot' ? jetons / 2 : jetons) + u.recherches * 0.01
  return Math.round(total * 1_000_000) / 1_000_000
}

export interface LigneAppel extends Usage {
  fournisseur: Fournisseur
  fonction: string
  route: string | null
  userId: string | null
  statut: number
  dureeMs: number
}

/** Writes one line. Never throws: the journal must not break the call it observes. */
export async function noterAppel(l: LigneAppel): Promise<void> {
  const cout = coutUsd(l.fournisseur, l)
  try {
    await prisma.appelIA.create({
      data: {
        jour: jourDeParis(),
        fournisseur: l.fournisseur,
        modele: l.modele,
        fonction: l.fonction.slice(0, 120),
        route: l.route,
        userId: l.userId,
        entree: l.entree,
        sortie: l.sortie,
        cacheLu: l.cacheLu,
        cacheEcrit: l.cacheEcrit,
        recherches: l.recherches,
        coutUsd: cout,
        statut: l.statut,
        arret: l.arret,
        dureeMs: l.dureeMs,
      },
    })
  } catch (err) {
    console.error('[coût IA] journal non écrit', err instanceof Error ? err.message : err)
  }
  // A line in the Railway logs too: readable even if the table is not.
  console.log(
    `[coût IA] ${l.fournisseur} ${l.modele ?? '?'} ${l.fonction} user=${l.userId ?? '-'} ` +
      `statut=${l.statut} arret=${l.arret ?? '-'} in=${l.entree} out=${l.sortie} cache=${l.cacheLu}/${l.cacheEcrit} ` +
      `web=${l.recherches} ${cout === null ? '' : cout.toFixed(4) + ' $'}`,
  )
}

/** A batch result read by rewriteBatch (billed at half price, never seen by fetch). */
export function noterResultatLot(userId: string | null, message: { model?: string; stop_reason?: string | null; usage?: unknown }): Promise<void> {
  const u: Usage = { ...VIDE, modele: message.model ?? null, arret: message.stop_reason ?? null }
  lireUsageAnthropic(message.usage as Record<string, unknown> | undefined, u)
  return noterAppel({ ...u, fournisseur: 'anthropic-lot', fonction: 'rewriteBatch.resultat', route: null, userId, statut: 200, dureeMs: 0 })
}

let installe = false

/**
 * Wraps the global fetch. Must run before any Anthropic client is built (the
 * SDK captures fetch in its constructor): index.ts imports this module right
 * after dotenv.
 */
export function installerJournalIA(): void {
  if (installe || typeof globalThis.fetch !== 'function') return
  installe = true
  const origine = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (entree: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url
    const methode = init?.method ?? (typeof entree === 'object' && 'method' in entree ? entree.method : 'GET')
    const f = cibleIA(url, methode)
    if (!f) return origine(entree, init)

    const ctx = contexte.getStore() ?? {}
    const pile = appelantDansLaPile()
    const fonction = ctx.fonction && ctx.fonction !== pile ? `${ctx.fonction} > ${pile}` : pile
    const debut = Date.now()
    const noter = (statut: number, u: Usage) =>
      void noterAppel({ ...u, fournisseur: f, fonction, route: ctx.route ?? null, userId: ctx.userId ?? null, statut, dureeMs: Date.now() - debut })

    let reponse: Response
    try {
      reponse = await origine(entree, init)
    } catch (err) {
      // No answer at all: nothing billed for the tokens, but the attempt is kept.
      noter(0, { ...VIDE })
      throw err
    }
    const flux = (reponse.headers.get('content-type') ?? '').includes('event-stream')
    const modeleUrl = f === 'google' ? (new URL(url).pathname.match(/models\/([^:/]+)/)?.[1] ?? null) : null
    reponse
      .clone()
      .text()
      .then((corps) => noter(reponse.status, f === 'google' ? usageGoogle(corps, modeleUrl) : usageAnthropic(corps, flux)))
      .catch(() => noter(reponse.status, { ...VIDE }))
    return reponse
  }
}

installerJournalIA()

/* ---------- Le bilan : appels payés en regard des drops débités ---------- */

export interface BilanJour {
  jour: string
  appels: number
  coutUsd: number
  echecs: number
  coupes: number
  parFonction: { fonction: string; appels: number; coutUsd: number; echecs: number }[]
  parCompte: { userId: string | null; email: string | null; appels: number; coutUsd: number; dropsDebites: number; dropsRendus: number }[]
  /** Calls with no user behind them (background rounds, public pages, health probe). */
  sansCompte: { appels: number; coutUsd: number }
}

export async function bilanCoutsIA(jour: string): Promise<BilanJour> {
  const lignes = await prisma.appelIA.findMany({ where: { jour } })
  const somme = (l: typeof lignes) => Math.round(l.reduce((s, x) => s + (x.coutUsd ?? 0), 0) * 10000) / 10000
  const echec = (x: (typeof lignes)[number]) => x.statut !== 200

  const fonctions = new Map<string, typeof lignes>()
  const comptes = new Map<string | null, typeof lignes>()
  for (const x of lignes) {
    fonctions.set(x.fonction, [...(fonctions.get(x.fonction) ?? []), x])
    comptes.set(x.userId, [...(comptes.get(x.userId) ?? []), x])
  }

  // The Paris day as a UTC window for the drop movements.
  const debut = new Date(`${jour}T00:00:00+01:00`)
  const fin = new Date(debut.getTime() + 24 * 3600_000)
  const ids = [...comptes.keys()].filter((k): k is string => Boolean(k))
  const [mouvements, users] = await Promise.all([
    prisma.dropTransaction.findMany({ where: { userId: { in: ids }, createdAt: { gte: debut, lt: fin } }, select: { userId: true, delta: true } }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }),
  ])

  const sans = comptes.get(null) ?? []
  return {
    jour,
    appels: lignes.length,
    coutUsd: somme(lignes),
    echecs: lignes.filter(echec).length,
    coupes: lignes.filter((x) => x.arret === 'max_tokens').length,
    parFonction: [...fonctions.entries()]
      .map(([fonction, l]) => ({ fonction, appels: l.length, coutUsd: somme(l), echecs: l.filter(echec).length }))
      .sort((a, b) => b.coutUsd - a.coutUsd),
    parCompte: ids
      .map((id) => {
        const l = comptes.get(id) ?? []
        const m = mouvements.filter((x) => x.userId === id)
        return {
          userId: id,
          email: users.find((u) => u.id === id)?.email ?? null,
          appels: l.length,
          coutUsd: somme(l),
          dropsDebites: -m.filter((x) => x.delta < 0).reduce((s, x) => s + x.delta, 0),
          dropsRendus: m.filter((x) => x.delta > 0).reduce((s, x) => s + x.delta, 0),
        }
      })
      .sort((a, b) => b.coutUsd - a.coutUsd),
    sansCompte: { appels: sans.length, coutUsd: somme(sans) },
  }
}
