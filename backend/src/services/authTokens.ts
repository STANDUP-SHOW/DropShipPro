import { createHash, randomBytes } from 'crypto'
import type { AuthTokenType } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

const LIFETIMES: Record<AuthTokenType, number> = {
  // A reset link is the keys to the account: keep the window short.
  PASSWORD_RESET: 60 * 60 * 1000,
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * Issues a single-use token and returns the clear value — the only moment it
 * exists in readable form. The database keeps just its hash.
 */
export async function issueToken(userId: string, type: AuthTokenType): Promise<string> {
  // Any earlier token of the same kind is dropped, so a new request silently
  // invalidates a link that may have been intercepted.
  await prisma.authToken.deleteMany({ where: { userId, type } })

  const token = randomBytes(32).toString('hex')
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hash(token), expiresAt: new Date(Date.now() + LIFETIMES[type]) },
  })
  return token
}

/**
 * Validates a token and burns it. Returns the owning user id, or null when the
 * token is unknown, expired or already used.
 */
export async function consumeToken(token: string, type: AuthTokenType): Promise<string | null> {
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hash(token) } })

  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null

  await prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
  return record.userId
}
