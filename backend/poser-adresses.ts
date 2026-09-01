import { prisma } from './src/lib/prisma.js'
import { adresseLibre } from './src/services/shopSlug.js'

/**
 * Donne son adresse de vitrine aux boutiques qui n'en ont pas.
 *
 * Les boutiques créées avant `Shop.slug` n'en portent aucune, et sans elle
 * `/b/…` ne peut pas les trouver. Les nouvelles la reçoivent à la création.
 *
 *   npx tsx poser-adresses.ts            # montre, n'écrit rien
 *   npx tsx poser-adresses.ts --ecrire   # écrit
 *
 * N'écrit rien par défaut : après le 01/09/2026, aucun script qui touche la
 * base n'agit parce qu'on l'a lancé.
 */

const ecrire = process.argv.includes('--ecrire')

const boutiques = await prisma.shop.findMany({ select: { id: true, name: true, slug: true } })
const sansAdresse = boutiques.filter((b) => !b.slug)

console.log(`${boutiques.length} boutique(s), ${sansAdresse.length} sans adresse.\n`)

for (const b of boutiques) {
  if (b.slug) {
    console.log(`  déjà      /b/${b.slug}`)
    continue
  }
  const adresse = await adresseLibre(b.name, b.id)
  console.log(`  ${ecrire ? 'posée   ' : 'poserait'}  /b/${adresse.padEnd(34)} ← ${b.name}`)
  if (ecrire) await prisma.shop.update({ where: { id: b.id }, data: { slug: adresse } })
}

if (!ecrire && sansAdresse.length) console.log('\nRien écrit. Relancez avec --ecrire.')

await prisma.$disconnect()
