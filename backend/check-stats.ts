import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { prisma } from './src/lib/prisma.js'
import { tableauDeBord } from './src/services/statistiques.js'

/**
 * Le tableau de bord statistiques : quatorze blocs qui ne mentent pas.
 *
 *   cd backend && npx tsx check-stats.ts
 *
 * **Il tourne contre la vraie base, en lecture seule** — comme
 * `check-categories.ts`, et pour la même raison : un faux jeu de données
 * validerait des calculs qui cassent sur les vraies lignes (Decimal, champs
 * nuls, commandes sans coût fournisseur).
 *
 * Les deux promesses qu'il tient :
 *
 * 1. **Aucun chiffre inventé.** Toute tuile sans donnée porte `valeur: null`
 *    ET sa raison. La maquette montre « conversion 2,6 % » ; tant que le
 *    trafic n'est pas mesuré, cette tuile doit dire pourquoi elle est vide.
 * 2. **Aucun chiffre faux.** Le CA affiché est recomptés ici indépendamment,
 *    depuis les mêmes lignes de commandes. S'ils divergent, c'est le calcul
 *    du service qui a tort — pas le banc, qui fait une somme.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const compte = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  })
  if (!compte) {
    console.log('RATE  aucune ligne utilisateur en base')
    process.exitCode = 1
    return
  }

  const au = new Date()
  const du = new Date(au.getTime() - 30 * 86400000)
  const blocs = await tableauDeBord(compte.id, du, au)

  console.log(`\nLa forme, sur le compte ${compte.email}`)
  verifier('quatorze blocs, ni plus ni moins', blocs.length === 14, `${blocs.length}`)
  verifier(
    'numérotés de 01 à 14, dans l’ordre de la maquette',
    blocs.every((b, i) => b.numero === String(i + 1).padStart(2, '0')),
  )
  verifier('neuf tuiles par bloc, comme la maquette', blocs.every((b) => b.tuiles.length === 9), blocs.map((b) => b.tuiles.length).join(','))
  verifier(
    'chaque tuile a un identifiant unique dans son bloc',
    blocs.every((b) => new Set(b.tuiles.map((t) => t.id)).size === b.tuiles.length),
  )

  console.log('\nAucun chiffre inventé')
  const tuiles = blocs.flatMap((b) => b.tuiles.map((t) => ({ bloc: b.id, ...t })))
  const nulles = tuiles.filter((t) => t.valeur === null)
  verifier(
    'toute tuile vide dit pourquoi',
    nulles.every((t) => typeof t.raison === 'string' && t.raison.length > 10),
    `${nulles.length} tuile(s) vide(s)`,
  )
  verifier(
    'la conversion marketplace est vide tant que le trafic n’est pas mesuré',
    tuiles.some((t) => t.bloc === 'marketplaces' && t.id === 'conversion' && t.valeur === null),
    'un taux de conversion sans mesure de trafic serait un chiffre inventé',
  )
  const nombres = tuiles.filter((t) => typeof t.valeur === 'number')
  verifier(
    'aucun NaN, aucun infini',
    nombres.every((t) => Number.isFinite(t.valeur as number)),
  )
  verifier(
    'aucune évolution aberrante',
    tuiles.every((t) => t.evolution === undefined || t.evolution === null || Number.isFinite(t.evolution)),
  )
  verifier(
    'les courbes ne portent que des nombres finis',
    tuiles.every((t) => !t.serie || (t.serie.length <= 90 && t.serie.every((v) => Number.isFinite(v)))),
  )

  console.log('\nAucun chiffre faux — recomptes indépendants')
  const commandes = await prisma.order.findMany({
    where: { userId: compte.id, createdAt: { gte: du, lte: au } },
    select: { amount: true, productId: true },
  })
  const caAttendu = Math.round(commandes.reduce((s, o) => s + Number(o.amount), 0) * 100) / 100
  const tuileCa = tuiles.find((t) => t.bloc === 'vue-generale' && t.id === 'ca')
  verifier('le CA affiché est la somme des commandes', tuileCa?.valeur === caAttendu, `${tuileCa?.valeur} contre ${caAttendu}`)

  const nbProduits = await prisma.product.count({ where: { userId: compte.id, status: { not: 'ARCHIVED' } } })
  const tuileProduits = tuiles.find((t) => t.bloc === 'catalogue' && t.id === 'actifs')
  verifier('les produits actifs sont recomptés pareil', tuileProduits?.valeur === nbProduits, `${tuileProduits?.valeur} contre ${nbProduits}`)

  const tuileCommandes = tuiles.find((t) => t.bloc === 'ventes' && t.id === 'commandes')
  verifier('les commandes aussi', tuileCommandes?.valeur === commandes.length)

  const activite = tuiles.find((t) => t.bloc === 'vue-generale' && t.id === 'activite')
  verifier(
    'l’activité globale reste entre 0 et 100',
    typeof activite?.valeur === 'number' && activite.valeur >= 0 && activite.valeur <= 100,
    String(activite?.valeur),
  )

  console.log("\nL'adresse existe et demande une session")
  const index = readFileSync('src/index.ts', 'utf8')
  verifier('la route est montée', /app\.use\('\/api\/stats', statsRouter\)/.test(index))
  const route = readFileSync('src/routes/stats.ts', 'utf8')
  verifier('et derrière l’authentification', /statsRouter\.use\(requireAuth\)/.test(route), 'les chiffres d’un compte ne se lisent pas sans session')
  verifier('une période inversée est refusée', /La date de début doit précéder/.test(route))

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main()
  .catch((err) => {
    console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
