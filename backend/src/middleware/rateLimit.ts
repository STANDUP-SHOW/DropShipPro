import type { NextFunction, Request, Response } from 'express'

/**
 * A sliding-window limiter for the routes worth protecting.
 *
 * Kept in memory on purpose: one container serves the API today, and a shared
 * store would add a dependency for a launch that is days away. The consequence
 * is honest — with several instances each keeps its own count, so the effective
 * limit multiplies. Fine for slowing an attacker down, not a quota.
 *
 * What it actually stops: someone trying passwords one after another on a known
 * email, and someone hammering signup to burn the ten free listings again and
 * again. Neither needs to be impossible, both need to be slow.
 */
interface Window {
  count: number
  resetAt: number
}

const buckets = new Map<string, Window>()

// Nothing else prunes the map, and an unbounded map on a public endpoint is a
// slow memory leak with a crowd behind it.
setInterval(() => {
  const now = Date.now()
  for (const [key, window] of buckets) if (window.resetAt <= now) buckets.delete(key)
}, 60_000).unref()

/** The caller's address, honouring the proxy Railway puts in front. */
function clientIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  return forwarded || req.socket.remoteAddress || 'inconnu'
}

export function rateLimit({
  windowMs,
  max,
  name,
}: {
  windowMs: number
  max: number
  /** Distinguishes buckets so login and signup don't share a counter. */
  name: string
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${clientIp(req)}`
    const now = Date.now()
    const window = buckets.get(key)

    if (!window || window.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    window.count++
    if (window.count > max) {
      const seconds = Math.ceil((window.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(seconds))
      return res.status(429).json({
        error: `Trop de tentatives. Réessayez dans ${seconds} seconde(s).`,
      })
    }

    next()
  }
}
