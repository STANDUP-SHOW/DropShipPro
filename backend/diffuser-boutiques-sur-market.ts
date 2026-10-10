/**
 * Rattrapage unique : met sur DropShop Market les produits DEJA publies sur une
 * boutique avant l'activation de la publication automatique.
 *
 *   npx tsx diffuser-boutiques-sur-market.ts            -> compte, n'ecrit rien
 *   npx tsx diffuser-boutiques-sur-market.ts --ecrire   -> cree les annonces
 *
 * Respecte le refus du vendeur (User.marketAuto) et ne touche jamais une ligne
 * Market existante (un retrait de la moderation reste un retrait).
 */
import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'

const ecrire = process.argv.includes('--ecrire')

const candidates = await prisma.publication.findMany({
  where: {
    platform: 'OWN_SITE',
    status: 'PUBLISHED',
    product: {
      user: { marketAuto: true },
      publications: { none: { platform: 'DROPSHOP_MARKET' } },
    },
  },
  select: { productId: true },
})

console.log(`${candidates.length} produit(s) de boutique absent(s) du Market.`)
if (!ecrire) {
  console.log('Simulation : rien n\'est ecrit. Relancer avec --ecrire pour creer les annonces.')
} else {
  const r = await prisma.publication.createMany({
    data: candidates.map((c) => ({ productId: c.productId, platform: 'DROPSHOP_MARKET' as const, status: 'PUBLISHED' as const, publishedAt: new Date() })),
    skipDuplicates: true,
  })
  console.log(`${r.count} annonce(s) creee(s).`)
}
await prisma.$disconnect()
