import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'

const JWT_SECRET = process.env.JWT_SECRET!

export interface AuthedRequest extends Request {
  userId?: string
}

/**
 * Un jeton valide dont le compte n'existe plus est refusé ici, pas plus loin.
 *
 * Panne du 05/09/2026, et sa cause exacte : après le wipe de base du 01/09, le
 * compte de Max a été recréé avec un nouvel id, mais son navigateur gardait un
 * jeton signé pointant l'ancien. La signature était bonne — `jwt.verify`
 * passait —, `req.userId` valait un id fantôme, et le premier
 * `findUniqueOrThrow({ id: req.userId })` de la route levait `NotFoundError`.
 *
 * Express 4 n'attrape pas ce qu'un handler `async` lève : la requête ne
 * répondait jamais, elle PENDAIT. Chaque chargement de sa page en empilait une,
 * jusqu'à saturer l'instance — le service tombait quelques minutes après chaque
 * démarrage, sans un mot de journal, parce que le `.catch` des tournées n'y
 * était pour rien.
 *
 * Vérifier l'existence du compte au portique transforme ce jeton mort en un
 * « reconnectez-vous » lisible, et protège d'un coup les seize routes qui
 * faisaient confiance à `req.userId`. Le coût est une lecture par clé primaire,
 * indexée — négligeable devant les requêtes que la route fait ensuite.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  let userId: string
  try {
    userId = (jwt.verify(token, JWT_SECRET) as { userId: string }).userId
  } catch {
    return res.status(401).json({ error: 'Session invalide, reconnectez-vous' })
  }
  try {
    const existe = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!existe) {
      return res.status(401).json({ error: 'Session invalide, reconnectez-vous' })
    }
  } catch (err) {
    // La base injoignable est une panne serveur, pas une session invalide : ne
    // pas déconnecter tout le monde parce qu'une requête a échoué.
    return res.status(503).json({ error: 'Service momentanément indisponible' })
  }
  req.userId = userId
  next()
}

export function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' })
}
