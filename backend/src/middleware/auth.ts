import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

export interface AuthedRequest extends Request {
  userId?: string
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.userId = payload.userId
    next()
  } catch {
    return res.status(401).json({ error: 'Session invalide, reconnectez-vous' })
  }
}

export function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' })
}
