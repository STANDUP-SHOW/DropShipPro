import crypto from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'

export interface AgentRequest extends Request {
  userId?: string
  apiKeyId?: string
}

/** Le prefixe rend la clé reconnaissable dans un log ou un presse-papier. */
const PREFIX = 'dsp_live_'

export function generateApiKey() {
  const secret = crypto.randomBytes(32).toString('base64url')
  const key = `${PREFIX}${secret}`
  return { key, keyHash: hashKey(key), prefix: key.slice(0, 16) }
}

/**
 * SHA-256 nu, sans sel, et c'est voulu.
 *
 * Un sel par clé empêcherait de retrouver la ligne à partir de la clé présentée :
 * il faudrait alors comparer contre chaque clé de la base à chaque requête. Le
 * secret fait 256 bits d'aléa — il n'y a pas de dictionnaire à lui opposer, ce
 * qui est tout ce que le sel protégerait.
 */
function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Authentifie un agent externe par sa clé.
 *
 * Volontairement séparé de requireAuth : une clé machine ne doit jamais ouvrir
 * ce qu'ouvre une session humaine — ni le paiement, ni le mot de passe, ni la
 * suppression du compte. Elle ne sert qu'aux routes /api/agent.
 */
export async function requireApiKey(req: AgentRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const presented = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!presented) {
    return res.status(401).json({ error: 'Clé d’API manquante (en-tête Authorization: Bearer …)' })
  }

  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(presented) } })
  if (!record || record.revokedAt) {
    return res.status(401).json({ error: 'Clé d’API inconnue ou révoquée' })
  }

  req.userId = record.userId
  req.apiKeyId = record.id

  // Sans await : savoir quand une clé a servi est utile, mais faire attendre
  // l'agent pour une écriture décorative ne l'est pas.
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  next()
}
