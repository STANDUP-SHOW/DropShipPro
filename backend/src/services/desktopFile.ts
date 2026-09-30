import { prisma } from '../lib/prisma.js'

/**
 * Le pont entre le pilote automatique serveur et l'application desktop.
 *
 * Le pilote choisit et importe les produits gagnants, puis publie là où une API
 * existe. Vinted, Leboncoin et Facebook n'ont pas d'API : seule l'application
 * desktop, dans la session du vendeur, peut y publier. Le pilote y met donc ses
 * produits EN FILE (`Publication` PENDING) — et l'application publie si le vendeur
 * a activé l'agent sur la plateforme, sinon l'annonce l'attend dans « Annonces à
 * publier ».
 *
 * On ne met en file que pour un vendeur qui a réellement une application desktop :
 * une clé de type desktop (préfixe `dsp_desk_`) non révoquée et vue récemment.
 * Sans cela, des annonces s'empileraient pour rien.
 */
export const PLATEFORMES_DESKTOP = ['VINTED', 'LEBONCOIN', 'FACEBOOK'] as const

/** « Récemment » : l'application interroge le serveur chaque minute ; une semaine de silence, c'est qu'elle n'est plus là. */
const SILENCE_MAX_MS = 7 * 24 * 3600_000

export async function aUneApplicationDesktop(userId: string, maintenant = new Date()): Promise<boolean> {
  const cle = await prisma.apiKey.findFirst({
    where: { userId, revokedAt: null, prefix: { startsWith: 'dsp_desk_' }, lastUsedAt: { gte: new Date(maintenant.getTime() - SILENCE_MAX_MS) } },
    select: { id: true },
  })
  return Boolean(cle)
}

/** Met le produit en file sur les places à session ; rend celles où une ligne a été créée ou relancée. */
export async function mettreEnFileDesktop(userId: string, productId: string): Promise<string[]> {
  if (!(await aUneApplicationDesktop(userId))) return []
  const creees: string[] = []
  for (const platform of PLATEFORMES_DESKTOP) {
    const existante = await prisma.publication.findUnique({ where: { productId_platform: { productId, platform } } })
    if (existante && existante.status !== 'FAILED') continue
    await prisma.publication.upsert({
      where: { productId_platform: { productId, platform } },
      create: { productId, platform, status: 'PENDING' },
      update: { status: 'PENDING', error: null, publishedAt: null },
    })
    creees.push(platform)
  }
  return creees
}
