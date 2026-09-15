import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'

const pubs = await prisma.publication.findMany({
  where: { platform: 'SHOPIFY' },
  select: { status: true, externalUrl: true, productId: true },
})
console.log('Publications Shopify :', pubs.length)
const parStatut = new Map<string, number>()
for (const p of pubs) parStatut.set(p.status, (parStatut.get(p.status) ?? 0) + 1)
console.log('par statut :', [...parStatut.entries()])

const publiees = pubs.filter((p) => p.status === 'PUBLISHED')
const produits = await prisma.product.findMany({
  where: { id: { in: publiees.map((p) => p.productId) } },
  select: { id: true, userId: true, categoryId: true, aiTitle: true, title: true },
})
const avec = produits.filter((p) => p.categoryId)
console.log(`\nProduits publiés : ${produits.length}, dont ${avec.length} rangés dans le référentiel.`)
const cats = await prisma.category.findMany({
  where: { id: { in: [...new Set(avec.map((p) => p.categoryId!))] } },
  select: { id: true, path: true },
})
const parCat = new Map<string, number>()
for (const p of avec) parCat.set(p.categoryId!, (parCat.get(p.categoryId!) ?? 0) + 1)
console.log('\nRépartition :')
for (const c of cats) console.log(`  ${String(parCat.get(c.id)).padStart(3)}x  ${c.path}`)
const sans = produits.filter((p) => !p.categoryId)
if (sans.length) {
  console.log(`\n${sans.length} sans catégorie :`)
  for (const p of sans.slice(0, 10)) console.log(`  ${(p.aiTitle || p.title).slice(0, 70)}`)
}
console.log('\nAvec une adresse externe :', publiees.filter((p) => p.externalUrl).length)
await prisma.$disconnect()
