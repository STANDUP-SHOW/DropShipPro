/**
 * Price coherence of a winning product (21/11/2026).
 *
 * An agent wrote « Éclairage extérieur, Cdiscount : achat 79,90 €, vente 27,90 €, verdict acheter, score 90 » :
 * a negative margin can never be a buy, and max found prices invented « partout ». So the agent's verdict
 * and score are never shown as facts when the line contradicts them:
 *  - both prices known, sale ≤ purchase: the sale price is most likely another item's → « Données à vérifier »;
 *  - only a negative margin known → « Ne pas acheter »;
 *  - prices with no verified page behind them (`source: false`): « non sourcé », no margin computed from them,
 *    no favourable verdict.
 * Each time the score is capped, and the agent's own words are kept aside (`verdictAgent`, `scoreAgent`).
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
  source?: boolean
}): LigneCoherente {
  const deuxPrix = margeDesPrix(l.achat, l.vente)
  // The caller already prefers the prices it trusts (text over migrated columns): its margin stands.
  const margeLue = l.margePct ?? deuxPrix
  const verdict = l.verdict ?? null
  const score = l.score ?? null
  const aDesPrix = (l.achat != null && l.achat > 0) || (l.vente != null && l.vente > 0) || margeLue !== null
  const nonSource = l.source === false && aDesPrix
  const venteSousAchat = deuxPrix !== null && l.vente! <= l.achat!
  const negative = !venteSousAchat && margeLue !== null && margeLue < 0
  // An unsourced price is not a fact: no margin is computed from it.
  const margePct = nonSource && !venteSousAchat && !negative ? null : margeLue
  const incoherence: Incoherence | null = venteSousAchat ? 'vente-sous-achat' : negative ? 'marge-negative' : nonSource ? 'prix-non-source' : null
  if (!incoherence) return { margePct, verdict, score }
  const plafond = score === null ? null : Math.min(score, SCORE_MAX_INCOHERENT)
  const impose = incoherence === 'vente-sous-achat' ? VERDICT_PRIX_INCOHERENT : incoherence === 'marge-negative' ? VERDICT_MARGE_NEGATIVE : VERDICT_NON_SOURCE
  // An agent that already said not to buy keeps its words; only a favourable (or missing) verdict is replaced.
  const force = verdictDefavorable(verdict) ? verdict : impose
  return {
    margePct,
    verdict: force,
    score: plafond,
    incoherence,
    ...(nonSource ? { prixNonSource: true } : {}),
    ...(verdict !== null && verdict !== force ? { verdictAgent: verdict } : {}),
    ...(score !== null && score !== plafond ? { scoreAgent: score } : {}),
  }
}
