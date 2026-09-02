import { MODELE_REDACTION } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Is the AI actually reachable with the configured key?
 *
 * The enhancement path swallows its own failures on purpose — a dead key must not
 * destroy an import — so a revoked key degrades every listing silently. This probe
 * is the only way to see it without reading the logs, and it is what /api/health
 * reports.
 */
export type AiStatus = 'ok' | 'cle-absente' | 'cle-refusee' | 'injoignable'

interface Probe {
  status: AiStatus
  checkedAt: number
}

let cached: Probe | null = null

/**
 * La dernière raison d'échec, telle que l'API l'a donnée.
 *
 * **« Injoignable » est un fourre-tout.** Modèle retiré, quota dépassé, panne
 * de réseau, service surchargé : quatre causes, quatre gestes différents, un
 * seul mot. Le 02/09/2026, toute l'IA était à l'arrêt et ce mot a envoyé
 * chercher une panne de connexion qui n'existait pas.
 *
 * Le motif part au journal **et** dans le diagnostic. Celui-ci demande une
 * session : c'est le vendeur qui le lit, sur son propre compte, et il a le
 * droit de savoir pourquoi son produit ne marche pas. Rien d'autre que le code
 * et le message de l'API n'y figure — jamais la clé.
 */
let derniereRaison: string | null = null

export function raisonIa(): string | null {
  return derniereRaison
}

/**
 * Cached for five minutes.
 *
 * The probe spends real tokens, so an unauthenticated health endpoint must not be
 * able to trigger one per request: at worst twelve calls an hour, a few cents a
 * year, and no way to run up a bill by hammering it.
 */
const TTL = 5 * 60 * 1000

export async function checkAi(): Promise<AiStatus> {
  if (cached && Date.now() - cached.checkedAt < TTL) return cached.status

  const status = await probe()
  cached = { status, checkedAt: Date.now() }
  return status
}

async function probe(): Promise<AiStatus> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return 'cle-absente'

  try {
    const client = new Anthropic({ apiKey: key })
    await client.messages.create({
      model: MODELE_REDACTION,
      max_tokens: 4,
      messages: [{ role: 'user', content: 'ok' }],
    })
    derniereRaison = null
    return 'ok'
  } catch (err) {
    const status = (err as { status?: number }).status
    // 401 revoked or mistyped, 403 blocked, 402 out of credit — all mean the same
    // thing for the seller: no listing will be rewritten.
    if (status === 401 || status === 403 || status === 402) return 'cle-refusee'

    /*
     * Le motif est écrit dans le journal, pas résumé en un mot.
     *
     * Le 02/09/2026, toute l'IA s'est arrêtée et le diagnostic disait
     * « injoignable ». C'était un **404** : `claude-sonnet-4-5` n'est plus
     * servi. La clé était bonne, le réseau aussi, et le seul mot rendu envoyait
     * chercher une panne de connexion qui n'existait pas.
     *
     * « Injoignable » est un fourre-tout : modèle retiré, quota dépassé, panne
     * de réseau, service surchargé. Les quatre demandent quatre gestes
     * différents. Le code et le message partent donc au journal, où on les lit
     * avant de chercher.
     */
    derniereRaison = `statut ${status ?? 'aucun'} — ${(err as Error)?.message?.slice(0, 300) ?? 'sans message'}`
    console.error(`[ia] sonde en échec — ${derniereRaison}`)
    return 'injoignable'
  }
}
