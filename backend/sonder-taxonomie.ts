import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'
import { resoudreCredentialsShopify, graphql } from './src/services/shopify.js'
import { pertinence } from './src/services/shopifyCatalog.js'

/**
 * Sonde, lecture seule : ce que Shopify répond vraiment pour nos catégories.
 *
 * Écrit après l'échec du 15/09/2026 — le script de réparation n'a recatégorisé
 * aucune des quatre fiches publiées : deux refusées faute de feuille pertinente,
 * deux sautées parce que leur adresse publique ne livrait pas d'identifiant.
 * On ne corrige pas un score sans avoir lu les candidats qu'il note.
 */
const CHERCHER = /* GraphQL */ `
  query sonde($search: String!) {
    taxonomy { categories(search: $search, first: 8) { nodes { id fullName isLeaf isArchived } } }
  }
`

const pubs = await prisma.publication.findMany({
  where: { platform: 'SHOPIFY', status: 'PUBLISHED' },
  select: { externalUrl: true, productId: true },
})
console.log('=== Adresses publiques enregistrées ===')
for (const p of pubs) console.log(' ', p.externalUrl)

const produits = await prisma.product.findMany({
  where: { id: { in: pubs.map((p) => p.productId) } },
  select: { id: true, userId: true, categoryId: true },
})
const cats = await prisma.category.findMany({
  where: { id: { in: [...new Set(produits.map((p) => p.categoryId!).filter(Boolean))] } },
  select: { id: true, label: true, path: true, google: true, targets: true },
})

const userId = produits[0]?.userId
const credential = userId
  ? await prisma.platformCredential.findUnique({ where: { userId_platform: { userId, platform: 'SHOPIFY' } } })
  : null
if (!credential) {
  console.log('\nAucune liaison Shopify : rien à sonder.')
} else {
  const creds = await resoudreCredentialsShopify(credential.data)
  for (const c of cats) {
    const termes = [c.google.split('>').pop()!.trim(), c.label]
    console.log(`\n=== ${c.path}`)
    console.log(`    google : ${c.google}`)
    for (const terme of termes) {
      const r = await graphql<{ taxonomy: { categories: { nodes: Array<{ id: string; fullName: string; isLeaf: boolean; isArchived: boolean }> } } }>(
        creds,
        CHERCHER,
        { search: terme },
      )
      console.log(`  · recherche « ${terme} » :`)
      for (const n of r.taxonomy.categories.nodes) {
        const note = pertinence({ label: c.label, path: c.path, google: c.google, targets: c.targets }, n.fullName)
        console.log(
          `      ${note.toFixed(2)}  ${n.isLeaf ? 'feuille' : 'branche'}${n.isArchived ? ' ARCHIVÉE' : ''}  ${n.fullName}`,
        )
      }
    }
  }
}
await prisma.$disconnect()
