import { prisma } from '../lib/prisma.js'

/**
 * Les rayons d'un vendeur.
 *
 * Plus de location depuis le 07/09/2026 : un chef de rayon confié est en poste,
 * point. Ce ne sont plus sa présence ni un abonnement qui se paient, mais ses
 * actions — une question, un passage AUTO-MODE — facturées en drops au moment
 * où elles ont lieu (voir `tarifs.ts`).
 *
 * Le pilote automatique et les dépôts d'agents s'appuient sur cette liste : elle
 * rend désormais **tous** les rayons du vendeur, puisqu'ils travaillent tous.
 */
export async function activeDepartments(userId: string) {
  return prisma.department.findMany({ where: { userId } })
}
