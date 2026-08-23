/**
 * Caps how many heavy jobs run at once, and refuses the rest honestly.
 *
 * An import is a thirty to sixty second HTTP request: scraping, then the model,
 * then watermarking every photo. Nothing bounded how many could run together, so
 * a crowd — a campaign sending fifty thousand people at once — would pile
 * requests up until every one of them timed out. The user sees a spinner, gives
 * up, retries, and doubles the load. That is how a launch day dies.
 *
 * Two limits rather than one. `max` is what the container can genuinely chew
 * through; `queued` is how many may wait for a slot. Past that, the answer is an
 * immediate, explicit refusal — far better than a connection held open for two
 * minutes before failing anyway.
 */
export class Saturated extends Error {
  constructor() {
    super("Le service traite déjà beaucoup d'imports. Réessayez dans une minute.")
    this.name = 'Saturated'
  }
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>
  /** For the health report: what the queue looks like right now. */
  stats(): { running: number; waiting: number }
}

export function createLimiter({ max, queued }: { max: number; queued: number }): Limiter {
  let running = 0
  const waiting: Array<() => void> = []

  function release() {
    running--
    const next = waiting.shift()
    if (next) next()
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (running >= max) {
        if (waiting.length >= queued) throw new Saturated()
        // Wait for a slot rather than fail: a short queue smooths a burst.
        await new Promise<void>((resolve) => waiting.push(resolve))
      }

      running++
      try {
        return await task()
      } finally {
        // In `finally` so a thrown task never leaks its slot — one leak per
        // failure and the service seizes up after a few dozen bad URLs.
        release()
      }
    },

    stats: () => ({ running, waiting: waiting.length }),
  }
}

/**
 * The import pipeline's limiter.
 *
 * Four at a time is deliberate rather than measured: each job spends most of its
 * time waiting on the network and on the model, so the container is not the
 * bottleneck — the supplier sites and the API are, and hammering them harder
 * gets us rate-limited. Both numbers are env-tunable so a load test can move
 * them without a deploy.
 */
export const importLimiter = createLimiter({
  max: Number(process.env.IMPORT_CONCURRENCY) || 4,
  queued: Number(process.env.IMPORT_QUEUE) || 40,
})
