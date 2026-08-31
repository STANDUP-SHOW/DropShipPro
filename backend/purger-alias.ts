import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'
import { sourceSansValeur, lireTitre } from './src/services/categoryLexicon.js'

/**
 * Retire de la mémoire les alias qui ne veulent rien dire.
 *
 * Le mal du 31/08/2026 tenait en une ligne de la table : la clé
 * `la-categorie-maison`, trente-et-un usages, pointant vers « Jouets et jeux >
 * Figurines et jouets d'action ». « la catégorie Maison » n'est pas une
 * catégorie — c'est du texte de gabarit ramassé sur AliExpress. Une seule
 * décision, prise sur un produit qui était bien une figurine, a ensuite rangé
 * quinze autres produits sans aucun rapport : souris, mini-PC, perceuses
 * Makita, un aspirateur.
 *
 * Le code refuse désormais ces clés à l'écriture. Reste à retirer celles déjà
 * gravées : tant qu'elles sont là, elles continuent de répondre.
 *
 * **Les alias posés par un vendeur ne sont jamais touchés** — même sur une clé
 * douteuse, le geste vaut mieux que notre règle, parce qu'il a vu le produit.
 *
 * `--sec` n'écrit rien.
 */

const aBlanc = process.argv.includes('--sec')

const alias = await prisma.categoryAlias.findMany({ include: { category: true } })
console.log(`${alias.length} alias en mémoire.${aBlanc ? '  (à blanc)' : ''}\n`)

const aRetirer = alias.filter((a) => {
  if (a.source === 'manuel') return false
  // La clé est stockée normalisée en tirets ; le test la relit en mots.
  return sourceSansValeur(a.key.replace(/-/g, ' '))
})

for (const a of aRetirer) {
  console.log(`  ${String(a.uses).padStart(3)}x  "${a.key}" -> ${a.category.path}  [${a.source}]`)
}

if (!aBlanc && aRetirer.length) {
  await prisma.categoryAlias.deleteMany({ where: { id: { in: aRetirer.map((a) => a.id) } } })
}
console.log(`\n${aRetirer.length} alias ${aBlanc ? 'à retirer' : 'retirés'}.`)

/*
 * Le second contrôle : les alias que le titre contredit.
 *
 * Un alias peut être bien formé et faux. `souris-gamer-essai-248` pointait vers
 * « Couture et mercerie » avec vingt usages — une clé de mise au point restée en
 * production. Le lexique lit le titre de la catégorie visée et signale les
 * désaccords, sans rien effacer : un désaccord n'est pas une preuve, et la
 * confrontation se fait produit par produit à la reprise.
 */
console.log('\nAlias que la lecture du titre contredit — à surveiller :')
let suspects = 0
for (const a of alias) {
  if (aRetirer.includes(a)) continue
  const lu = lireTitre(a.key.replace(/-/g, ' '))
  if (lu && lu.chemin !== a.category.path) {
    suspects++
    console.log(`  "${a.key}" -> ${a.category.path}`)
    console.log(`      le titre dirait plutôt : ${lu.chemin}`)
  }
}
if (!suspects) console.log('  aucun.')

await prisma.$disconnect()
