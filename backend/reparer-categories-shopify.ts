import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'
import { resoudreCredentialsShopify, graphql } from './src/services/shopify.js'
import { estPertinente, rangerDansShopify } from './src/services/shopifyCatalog.js'

/**
 * Répare les catégories Shopify déjà posées — en mémoire et sur la boutique.
 *
 * **Ce qu'il y avait à réparer.** Jusqu'au 15/09/2026, le rangement prenait la
 * PREMIÈRE feuille rendue par la recherche de taxonomie de Shopify, qui est
 * approximative. Une recherche « electronics cleaners » et une feuille
 * « Nettoyants pour appareils électroniques » partagent assez de mots pour que
 * Shopify la sorte en tête ; personne ne vérifiait, et mini-PC, SSD et souris
 * pouvaient tous y atterrir.
 *
 * Le code ne se trompe plus (`estPertinente`). Restent **deux traces**, et la
 * première est la plus dangereuse :
 *
 *  1. **La mémoire du référentiel.** Chaque correspondance trouvée est gravée
 *     dans `Category.targets.shopify` et resservie sans recherche. Une mauvaise
 *     correspondance mémorisée continue donc de répondre pour toujours — c'est
 *     exactement la leçon de l'alias `la-categorie-maison` du 31/08/2026 : une
 *     seule décision fautive range ensuite des dizaines de produits.
 *  2. **Les fiches déjà publiées** chez le marchand, qui portent la mauvaise
 *     catégorie tant qu'on ne la repousse pas.
 *
 * Le script fait les deux, dans cet ordre, et **n'écrit rien sans `--ecrire`**.
 *
 *   npx tsx reparer-categories-shopify.ts            # montre ce qu'il ferait
 *   npx tsx reparer-categories-shopify.ts --ecrire   # oublie et republie
 *
 * Par défaut il traite tous les vendeurs ; `--user=<id>` le borne à un compte.
 */
const ecrire = process.argv.includes('--ecrire')
const filtreUser = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1]

/* ── 1. La mémoire : quelles correspondances sont fausses ? ─────────────────
 *
 * On ne rappelle pas Shopify pour juger : le nom complet de la feuille est
 * mémorisé avec l'identifiant, et il suffit. On applique le MÊME test de
 * pertinence que le connecteur — importé, jamais recopié, sinon les deux
 * divergeraient et le script validerait ce que le code refuse.
 */
const categories = await prisma.category.findMany({
  where: { targets: { not: null } },
  select: { id: true, label: true, path: true, google: true, targets: true, uses: true },
})

const avecShopify = categories.filter((c) => {
  const shopify = (c.targets as Record<string, unknown> | null)?.shopify as { id?: string } | undefined
  return Boolean(shopify?.id)
})

const memoireFautive = avecShopify.filter((c) => {
  const shopify = (c.targets as Record<string, unknown>).shopify as { fullName?: string }
  if (!shopify.fullName) return false
  return !estPertinente({ label: c.label, path: c.path, google: c.google, targets: c.targets }, shopify.fullName)
})

console.log(`\n=== Mémoire du référentiel ===`)
console.log(`${categories.length} catégorie(s) portent des correspondances, dont ${avecShopify.length} pour Shopify.`)
if (!avecShopify.length) {
  console.log('Rien de mémorisé pour Shopify : aucune mauvaise correspondance ne peut être resservie.')
} else if (!memoireFautive.length) {
  console.log('Aucune correspondance fautive.')
} else {
  console.log(`${memoireFautive.length} fautive(s) :\n`)
  for (const c of memoireFautive) {
    const s = (c.targets as Record<string, unknown>).shopify as { fullName: string }
    console.log(`  ${String(c.uses).padStart(4)}x  ${c.path}`)
    console.log(`         → « ${s.fullName} »  ✗`)
  }
}

if (ecrire && memoireFautive.length) {
  for (const c of memoireFautive) {
    const t = { ...(c.targets as Record<string, unknown>) }
    delete t.shopify
    await prisma.category.update({
      where: { id: c.id },
      data: { targets: Object.keys(t).length ? t : undefined },
    })
  }
  console.log(`\n${memoireFautive.length} correspondance(s) oubliée(s). La prochaine publication cherchera à nouveau.`)
}

/* ── 2. Les fiches déjà publiées ────────────────────────────────────────────
 *
 * On ne republie PAS l'annonce entière : ni photos, ni description, ni prix.
 * Uniquement la catégorie, par `productUpdate`. Republier tout écraserait ce
 * que le marchand a retouché à la main depuis — et il a le droit de retoucher.
 */
const MAJ_CATEGORIE = /* GraphQL */ `
  mutation dropshipperFixCategory($id: ID!, $category: ID!) {
    productUpdate(product: { id: $id, category: $category }) {
      product { id }
      userErrors { field message }
    }
  }
`

const publications = await prisma.publication.findMany({
  where: { platform: 'SHOPIFY', status: 'PUBLISHED', externalUrl: { not: null } },
  select: { id: true, externalUrl: true, productId: true },
})

/*
 * `Product.categoryId` n'est PAS une relation Prisma : c'est l'identifiant
 * d'une ligne du référentiel, posé à l'import. Il se relit donc à la main —
 * en deux requêtes d'ensemble, pas une par fiche.
 */
const produits = await prisma.product.findMany({
  where: {
    id: { in: publications.map((p) => p.productId) },
    ...(filtreUser ? { userId: filtreUser } : {}),
  },
  select: { id: true, userId: true, categoryId: true, aiTitle: true, title: true },
})
const produitsParId = new Map(produits.map((p) => [p.id, p]))

const idsCategories = [...new Set(produits.map((p) => p.categoryId).filter((v): v is string => Boolean(v)))]
const categoriesParId = new Map(
  (
    await prisma.category.findMany({
      where: { id: { in: idsCategories } },
      select: { id: true, label: true, path: true, google: true, targets: true },
    })
  ).map((c) => [c.id, c]),
)

const fiches = publications.flatMap((pub) => {
  const produit = produitsParId.get(pub.productId)
  if (!produit) return [] // filtré par --user
  const categorie = produit.categoryId ? categoriesParId.get(produit.categoryId) ?? null : null
  return [{ pub, produit, categorie }]
})

console.log(`\n=== Fiches publiées sur Shopify ===`)
console.log(`${fiches.length} publication(s) trouvée(s)${filtreUser ? ` pour ${filtreUser}` : ''}.`)

const sansCategorie = fiches.filter((f) => !f.categorie)
if (sansCategorie.length) {
  console.log(`${sansCategorie.length} sans catégorie dans le référentiel : laissées telles quelles.`)
}

const aRepousser = fiches.filter((f) => f.categorie)
if (!aRepousser.length) {
  console.log('Rien à repousser.')
} else if (!ecrire) {
  console.log(`\n${aRepousser.length} fiche(s) seraient recatégorisées :`)
  for (const f of aRepousser.slice(0, 15)) {
    console.log(`  ${(f.produit.aiTitle || f.produit.title).slice(0, 60)}  →  ${f.categorie!.path}`)
  }
  if (aRepousser.length > 15) console.log(`  … et ${aRepousser.length - 15} autres.`)
} else {
  // Une liaison par vendeur : on ne la relit pas pour chaque fiche.
  const liaisons = new Map<string, Awaited<ReturnType<typeof resoudreCredentialsShopify>> | null>()
  let faits = 0
  let sautes = 0

  for (const f of aRepousser) {
    const userId = f.produit.userId
    if (!liaisons.has(userId)) {
      const credential = await prisma.platformCredential.findUnique({
        where: { userId_platform: { userId, platform: 'SHOPIFY' } },
      })
      liaisons.set(userId, credential ? await resoudreCredentialsShopify(credential.data) : null)
    }
    const creds = liaisons.get(userId)
    if (!creds) {
      sautes++
      continue
    }

    const appel = <T>(query: string, variables: Record<string, unknown>) => graphql<T>(creds, query, variables)

    try {
      const rangement = await rangerDansShopify(appel, f.categorie!)
      if (!rangement.categoryId) {
        console.log(`  – ${(f.produit.aiTitle || f.produit.title).slice(0, 50)} : aucune catégorie Shopify pertinente.`)
        sautes++
        continue
      }
      // L'identifiant Shopify de la fiche est au bout de son adresse publique.
      const numero = f.pub.externalUrl!.match(/\/products\/(\d+)/)?.[1]
      if (!numero) {
        sautes++
        continue
      }
      const r = await appel<{ productUpdate: { userErrors: Array<{ message: string }> } }>(MAJ_CATEGORIE, {
        id: `gid://shopify/Product/${numero}`,
        category: rangement.categoryId,
      })
      if (r.productUpdate.userErrors.length) {
        console.log(`  ✗ ${f.produit.aiTitle}: ${r.productUpdate.userErrors.map((e) => e.message).join(' ')}`)
        sautes++
      } else {
        faits++
      }
    } catch (err) {
      console.log(`  ✗ ${f.produit.aiTitle}: ${err instanceof Error ? err.message : String(err)}`)
      sautes++
    }
  }
  console.log(`\n${faits} fiche(s) recatégorisée(s), ${sautes} laissée(s) de côté.`)
}

if (!ecrire) {
  console.log('\n(à blanc — relancer avec --ecrire pour appliquer)')
}
await prisma.$disconnect()
