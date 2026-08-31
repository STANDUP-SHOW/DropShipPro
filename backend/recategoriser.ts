import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'
import { resoudreCategorie } from './src/services/categories.js'

/**
 * Re-range les annonces qui pointent vers l'ancien catalogue.
 *
 * Le référentiel en base a remplacé un tableau TypeScript de vingt-neuf
 * entrées, mais le menu de la fiche produit servait encore l'ancien : une
 * annonce rangée à la main recevait un identifiant — `ht-laptop`, `acc-watch` —
 * que la table `Category` ne connaît pas.
 *
 * **Ça ne se voyait nulle part.** L'annonce affichait une catégorie, le vendeur
 * la croyait rangée, et la publication Shopify cherchait la ligne
 * correspondante, ne la trouvait pas, et partait sans catégorie officielle ni
 * collection. Relevé le 31/08/2026 : 108 annonces orphelines sur 154, et
 * 3 seulement correctement rangées.
 *
 * Le rangement passe par `resoudreCategorie`, qui essaie du moins cher au plus
 * cher : mémoire des alias, rapprochement de libellé, puis le modèle. Deux cents
 * annonces d'une même boutique coûtent donc quelques appels, pas deux cents.
 *
 * Idempotent : une annonce déjà rangée dans le référentiel n'est pas touchée.
 * Passer `--sec` n'écrit rien et se contente de dire ce qui se passerait.
 */

const aBlanc = process.argv.includes('--sec')

const [produits, categories] = await Promise.all([
  prisma.product.findMany({
    select: { id: true, categoryId: true, sourceCategory: true, title: true, aiTitle: true, supplierId: true },
  }),
  prisma.category.findMany({ select: { id: true } }),
])

const connues = new Set(categories.map((c) => c.id))
const aRanger = produits.filter((p) => !p.categoryId || !connues.has(p.categoryId))

console.log(
  `${produits.length} annonces — ${produits.length - aRanger.length} déjà rangées, ${aRanger.length} à reprendre.`,
)
if (aBlanc) console.log('(à blanc : rien ne sera écrit)\n')

let ranges = 0
const echecs: string[] = []
const parVoie = new Map<string, number>()

for (const produit of aRanger) {
  const titre = produit.aiTitle || produit.title
  try {
    const resolution = await resoudreCategorie({
      sourceCategory: produit.sourceCategory,
      supplierId: produit.supplierId,
      title: titre,
    })

    if (!resolution.categoryId) {
      // Rien ne tombe dans « Divers » : sans catégorie, on le dit.
      echecs.push(`${titre.slice(0, 50)} — ${resolution.raison ?? 'non rangée'}`)
      continue
    }

    parVoie.set(resolution.par, (parVoie.get(resolution.par) ?? 0) + 1)
    if (!aBlanc) {
      await prisma.product.update({
        where: { id: produit.id },
        data: { categoryId: resolution.categoryId },
      })
    }
    ranges++
    console.log(`  ${titre.slice(0, 45).padEnd(45)} → ${resolution.path}  [${resolution.par}]`)
  } catch (err) {
    echecs.push(`${titre.slice(0, 50)} — ${err instanceof Error ? err.message : 'erreur'}`)
  }
}

console.log(`\n${ranges} rangées, ${echecs.length} laissées de côté.`)
console.log('Par voie :', [...parVoie].map(([v, n]) => `${v} ${n}`).join(', ') || '—')
if (echecs.length) {
  console.log('\nNon rangées (elles resteront à ranger à la main) :')
  for (const e of echecs.slice(0, 20)) console.log(`  ${e}`)
}

await prisma.$disconnect()
