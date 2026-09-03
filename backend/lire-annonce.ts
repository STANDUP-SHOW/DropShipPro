import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'

/**
 * Une annonce en entier, telle qu'elle est en base.
 *
 *   cd backend && npx tsx lire-annonce.ts [rang]
 *
 * **Lecture seule.**
 *
 * Compter les champs ne dit pas si l'annonce est bonne : « 7 arguments,
 * 9 attributs » peut décrire un texte qui parle du mauvais produit. Il faut le
 * lire.
 */
const rang = Number(process.argv[2] ?? 0)

async function main() {
  const produits = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    take: rang + 1,
  })
  const p = produits[rang]
  if (!p) return console.log('Aucune annonce à ce rang.')

  console.log(`=== rang ${rang} — ${p.createdAt.toISOString().slice(0, 16)} — ${p.sourceSite} ===\n`)
  console.log(`SOURCE URL\n  ${p.sourceUrl}\n`)
  console.log(`TITRE SOURCE\n  ${p.title}\n`)
  console.log(`DESCRIPTION SOURCE (${p.description.length}c)\n  ${p.description.slice(0, 900)}\n`)
  console.log(`aiEnhanced: ${p.aiEnhanced}\n`)
  console.log(`TITRE IA\n  ${p.aiTitle ?? '(aucun)'}\n`)
  console.log(`DESCRIPTION IA (${p.aiDescription?.length ?? 0}c)\n  ${p.aiDescription ?? '(aucune)'}\n`)
  console.log(`ARGUMENTS\n${JSON.stringify(p.bulletPoints, null, 2)}\n`)
  console.log(`ATTRIBUTS\n${JSON.stringify(p.attributes, null, 2)}\n`)
  console.log(`MOTS-CLES\n  ${p.metaKeywords ?? '(aucun)'}\n`)
  console.log(`CATEGORIE\n  ${p.categoryId ?? '(aucune)'} / source: ${p.sourceCategory ?? '-'}\n`)
  console.log(`VARIANTES\n${JSON.stringify(p.variants, null, 2)}\n`)
  const images = Array.isArray(p.images) ? p.images : []
  console.log(`IMAGES (${images.length})`)
  images.forEach((u, i) => console.log(`  ${i + 1}. ${u}`))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
