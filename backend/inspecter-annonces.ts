import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'

/**
 * Ce que contiennent réellement les dernières annonces importées.
 *
 *   cd backend && npx tsx inspecter-annonces.ts [combien]
 *
 * **Lecture seule.** Aucun `update`, aucun `delete`, aucune migration : ce
 * fichier n'écrit rien, et c'est la seule chose qu'il faut vérifier avant de le
 * lancer contre la base de production.
 *
 * Pourquoi il existe : « les descriptions sont absentes » et « les photos sont
 * mauvaises » sont des symptômes qui ont chacun trois causes possibles. Lire la
 * ligne en base tranche en une seconde ce que relire le code ne tranche pas —
 * `aiEnhanced` dit si le modèle a répondu, le nombre d'images dit si la capture
 * a rapporté quelque chose, et la catégorie dit si le classement a tourné.
 */
const combien = Number(process.argv[2] ?? 30)

function taille(x: unknown): number {
  if (Array.isArray(x)) return x.length
  if (x && typeof x === 'object') return Object.keys(x).length
  return 0
}

async function main() {
  const produits = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    take: combien,
    select: {
      id: true,
      createdAt: true,
      sourceUrl: true,
      sourceSite: true,
      title: true,
      aiTitle: true,
      description: true,
      aiDescription: true,
      aiEnhanced: true,
      metaKeywords: true,
      bulletPoints: true,
      attributes: true,
      categoryId: true,
      images: true,
      variants: true,
      combinations: true,
      price: true,
      status: true,
    },
  })

  console.log(`${produits.length} annonce(s), de la plus récente à la plus ancienne\n`)

  for (const p of produits) {
    const images = Array.isArray(p.images) ? p.images : []
    const quand = p.createdAt.toISOString().replace('T', ' ').slice(0, 16)
    const drapeaux = [
      p.aiEnhanced ? 'ia:oui' : 'IA:NON',
      `titreIa:${p.aiTitle ? 'oui' : 'NON'}`,
      `descIa:${p.aiDescription ? `${p.aiDescription.length}c` : 'NON'}`,
      `args:${taille(p.bulletPoints)}`,
      `attrs:${taille(p.attributes)}`,
      `mots:${p.metaKeywords ? p.metaKeywords.split(',').length : 0}`,
      `cat:${p.categoryId ? 'oui' : 'NON'}`,
      `photos:${images.length}`,
      `combis:${taille(p.combinations)}`,
      `prix:${p.price}`,
    ].join('  ')

    console.log(`${quand}  ${p.sourceSite ?? '?'}`)
    console.log(`  ${(p.aiTitle ?? p.title).slice(0, 90)}`)
    console.log(`  ${drapeaux}`)
    console.log(`  source: ${p.sourceUrl.slice(0, 110)}`)
    if (images[0]) console.log(`  img1: ${String(images[0]).slice(0, 110)}`)
    console.log()
  }

  const sansIa = produits.filter((p) => !p.aiEnhanced).length
  const sansCat = produits.filter((p) => !p.categoryId).length
  const sansPhoto = produits.filter((p) => !(Array.isArray(p.images) ? p.images : []).length).length
  console.log(`Résumé : ${sansIa} sans réécriture, ${sansCat} sans catégorie, ${sansPhoto} sans photo.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
