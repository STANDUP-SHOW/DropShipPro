import { prisma } from '../src/lib/prisma.js'

/**
 * Lecture seule : y a-t-il une création DropShop en cours (`Shop.siteJob` sans `fin`) ?
 * À lancer avant de pousser (CLAUDE.md : un déploiement coupe la création en route).
 *
 *   cd backend && npx tsx scripts/creations-en-cours.ts
 */
async function main() {
  const shops = await prisma.shop.findMany({ select: { id: true, slug: true, siteJob: true } })
  const ouvertes = shops.filter((s) => s.siteJob && typeof s.siteJob === 'object' && !(s.siteJob as Record<string, unknown>).fin)
  console.log(ouvertes.length ? `EN COURS : ${ouvertes.map((s) => s.slug ?? s.id).join(', ')}` : 'Aucune création en cours.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
