/**
 * Price coherence of a winning product (21/11/2026, revised 27/11/2026).
 *
 * Until 27/11 a line whose prices contradicted the agent got another verdict (« Données à vérifier »,
 * « Ne pas acheter »), a score capped at 20, and prices called « non sourcés » whenever our link check failed.
 * Max (27/11): the agent's report must be shown as it is. Now the agent's verdict and score always stand;
 * a contradiction is only flagged.
 */

/** A score above this would read as a recommendation; an incoherent line never gets more. */
export const SCORE_MAX_INCOHERENT = 20

export const VERDICT_PRIX_INCOHERENT = 'Données à vérifier : vente inférieure à l’achat'
export const VERDICT_MARGE_NEGATIVE = 'Ne pas acheter : marge négative'
export const VERDICT_NON_SOURCE = 'Données à vérifier : prix non sourcés'

export type Incoherence = 'vente-sous-achat' | 'marge-negative' | 'prix-non-source'

export interface LigneCoherente {
  margePct: number | null
  verdict: string | null
  score: number | null
  /** Set only when the line was corrected. */
  incoherence?: Incoherence
  /** The prices have no verified page behind them: shown as « non sourcé », never as facts. */
  prixNonSource?: boolean
  /** What the agent wrote, kept when it was overridden. */
  verdictAgent?: string | null
  scoreAgent?: number | null
}

/** Gross margin on the sale price, from the two prices; null unless both are positive. */
export function margeDesPrix(achat: number | null | undefined, vente: number | null | undefined): number | null {
  if (achat == null || vente == null || !(achat > 0) || !(vente > 0)) return null
  return Number((((vente - achat) / vente) * 100).toFixed(1))
}

/** Is this verdict telling the reader not to buy (or to check first)? Then it is never a recommendation. */
export function verdictDefavorable(v: string | null | undefined): boolean {
  return /DON.?T|NE PAS|[ÉE]VITER|AVOID|SKIP|PAS STOCK|V[ÉE]RIFIER/i.test(String(v ?? ''))
}

/**
 * The line as it may be shown. `margePct` is the margin already computed by the caller (from the prices
 * when it had them); the two prices are used when it has none, and always decide the coherence.
 * `source` says whether a verified page backs the prices; left out, it is not checked.
 */
export function coherencePrix(l: {
  achat: number | null | undefined
  vente: number | null | undefined
  margePct: number | null | undefined
  verdict: string | null | undefined
  score: number | null | undefined
  /** Kept for callers; no longer changes anything (27/11/2026). */
  source?: boolean
}): LigneCoherente {
  // 27/11/2026, max: « comment te permettre d'écrire ne pas acheter ? L'agent n'a jamais écrit ça ». The verdict
  // and the score shown are ALWAYS the agent's, as written. A line whose own prices contradict a favourable
  // verdict is not flagged either (max, 27/11: no rule of ours, no warning): nothing is replaced, capped or hidden.
  const deuxPrix = margeDesPrix(l.achat, l.vente)
  const margePct = l.margePct ?? deuxPrix
  const verdict = l.verdict ?? null
  const score = l.score ?? null
  // Max (27/11/2026): « ce ne sont pas nos règles ». Nothing is flagged, replaced or capped.
  return { margePct, verdict, score }
}
