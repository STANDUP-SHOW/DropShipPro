import { prisma } from './src/lib/prisma.js'
import { DEPARTMENTS } from './src/services/departments.js'

/**
 * Réembauche les chefs de rayon d'un compte.
 *
 * **Pourquoi ce script existe.** Les vingt-quatre profils vivent dans le code ;
 * l'embauche, elle, est une ligne en base créée un rayon à la fois depuis
 * l'écran. La restauration du 01/09/2026 a ramené une base antérieure à leur
 * embauche : les profils étaient là, les rayons non. Les reprendre un par un
 * dans l'interface, c'est vingt-quatre clics pour réparer quelque chose que le
 * vendeur n'a pas cassé.
 *
 * Écrit exactement ce que `POST /departments` écrit — même clé, même nom, même
 * essai de vingt-quatre heures. Un script qui invente ses propres valeurs
 * produit des lignes que l'application ne sait plus lire.
 *
 *   npx tsx reembaucher-rayons.ts <email>            # montre, n'écrit rien
 *   npx tsx reembaucher-rayons.ts <email> --ecrire   # écrit
 *
 * Ne fait rien par défaut : après ce qui s'est passé aujourd'hui, aucun script
 * qui touche la base ne doit écrire parce qu'on l'a lancé.
 */

const email = process.argv[2]
const ecrire = process.argv.includes('--ecrire')

if (!email) {
  console.error("Donnez l'adresse du compte : npx tsx reembaucher-rayons.ts <email> [--ecrire]")
  process.exit(1)
}

const compte = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } })
if (!compte) {
  console.error(`Aucun compte pour « ${email} ».`)
  process.exit(1)
}

const deja = await prisma.department.findMany({
  where: { userId: compte.id },
  select: { key: true, agentName: true },
})
const tenus = new Set(deja.map((d) => d.key))
const aEmbaucher = DEPARTMENTS.filter((d) => !tenus.has(d.key))

console.log(`Compte : ${compte.email}`)
console.log(`Rayons déjà tenus : ${deja.length} — à embaucher : ${aEmbaucher.length}\n`)

for (const d of aEmbaucher) {
  console.log(`  ${d.emoji}  ${d.agentName.padEnd(10)} ${d.label}`)
}

if (!ecrire) {
  console.log('\nRien écrit. Relancez avec --ecrire pour embaucher.')
  await prisma.$disconnect()
  process.exit(0)
}

/*
 * Vingt-quatre heures d'essai, comme à l'embauche depuis l'écran.
 *
 * Les abonnements payés, eux, étaient dans `AgentSubscription` et sont perdus :
 * ils se rétablissent sur les pièces Stripe, pas en s'accordant du temps
 * gratuit ici. Un script qui offre discrètement ce qui n'a pas été payé fausse
 * la comptabilité de l'application autant qu'il rend service.
 */
const essai = new Date(Date.now() + 24 * 3600 * 1000)

let faits = 0
for (const d of aEmbaucher) {
  await prisma.department.create({
    data: { userId: compte.id, key: d.key, agentName: d.agentName, plan: 'essai', paidUntil: essai },
  })
  faits++
}

const total = await prisma.department.count({ where: { userId: compte.id } })
console.log(`\n${faits} rayon(s) embauché(s). Total sur le compte : ${total}.`)

await prisma.$disconnect()
