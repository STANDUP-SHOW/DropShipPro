/**
 * Nettoie les faux produits créés par l'ancienne capture du presse-papiers de
 * DropShipper Desktop (avant 0.5.4) : chaque Ctrl+C sur une adresse web
 * devenait un lien partagé (source « presse-papiers »), que le mode tout
 * automatique importait dans Mes annonces (max, 28/11/2026).
 *
 * N'est retenu QUE ce qui est identifiable avec certitude :
 *  - un lien SharedLink de source « presse-papiers » ;
 *  - un produit du même compte dont l'adresse source est exactement ce lien,
 *    créé après le lien ;
 *  - sans aucune commande ni publication réussie (ceux-là sont listés, jamais
 *    supprimés : à regarder à la main).
 *
 * Sans `--ecrire`, n'écrit rien : liste et compte. Avec `--ecrire`, supprime
 * les produits retenus puis les liens « presse-papiers » eux-mêmes.
 *
 *   npx tsx nettoyer-presse-papiers.ts [--compte <userId>] [--ecrire]
 */
import { prisma } from './src/lib/prisma.js'
import { SOURCE_PRESSE_PAPIERS } from './src/services/partagesPressePapiers.js'

const args = process.argv.slice(2)
const ecrire = args.includes('--ecrire')
const iCompte = args.indexOf('--compte')
const compte = iCompte >= 0 ? args[iCompte + 1] : null

async function main() {
  const liens = await prisma.sharedLink.findMany({
    where: { source: SOURCE_PRESSE_PAPIERS, ...(compte ? { userId: compte } : {}) },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Liens « ${SOURCE_PRESSE_PAPIERS} » : ${liens.length}`)

  const aSupprimer: { id: string; userId: string; titre: string; url: string; cree: Date }[] = []
  const aGarder: { id: string; titre: string; url: string; raison: string }[] = []

  for (const l of liens) {
    const produits = await prisma.product.findMany({
      where: { userId: l.userId, sourceUrl: l.url, createdAt: { gte: l.createdAt } },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: { select: { orders: true } },
        publications: { where: { status: 'PUBLISHED' }, select: { platform: true } },
      },
    })
    for (const p of produits) {
      if (p._count.orders > 0) aGarder.push({ id: p.id, titre: p.title, url: l.url, raison: `${p._count.orders} commande(s)` })
      else if (p.publications.length) aGarder.push({ id: p.id, titre: p.title, url: l.url, raison: `publié sur ${p.publications.map((x) => x.platform).join(', ')}` })
      else aSupprimer.push({ id: p.id, userId: l.userId, titre: p.title, url: l.url, cree: p.createdAt })
    }
  }

  const parCompte = new Map<string, number>()
  for (const p of aSupprimer) parCompte.set(p.userId, (parCompte.get(p.userId) ?? 0) + 1)
  console.log(`\nProduits issus du presse-papiers, supprimables : ${aSupprimer.length}`)
  for (const [u, n] of parCompte) console.log(`  compte ${u} : ${n}`)
  for (const p of aSupprimer) console.log(`  - ${p.cree.toISOString().slice(0, 16)}  ${p.titre.slice(0, 70)}  <${p.url.slice(0, 100)}>`)
  console.log(`\nIssus du presse-papiers mais GARDÉS (commande ou publication) : ${aGarder.length}`)
  for (const p of aGarder) console.log(`  - ${p.titre.slice(0, 70)} (${p.raison})  <${p.url.slice(0, 100)}>`)

  if (!ecrire) {
    console.log('\nRien écrit (ajouter --ecrire pour supprimer).')
    return
  }
  const r = await prisma.product.deleteMany({ where: { id: { in: aSupprimer.map((p) => p.id) } } })
  const rl = await prisma.sharedLink.deleteMany({ where: { id: { in: liens.map((l) => l.id) } } })
  console.log(`\nSupprimés : ${r.count} produit(s), ${rl.count} lien(s) « ${SOURCE_PRESSE_PAPIERS} ».`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
