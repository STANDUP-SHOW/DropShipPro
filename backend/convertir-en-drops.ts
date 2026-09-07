/**
 * Convertit les soldes existants vers la monnaie unique : les drops (07/09/2026).
 *
 * Avant : deux réserves séparées, `credits` (annonces) et `imageCredits`. Après :
 * un seul solde en drops. La conversion préserve le POUVOIR D'ACHAT — pas la
 * valeur faciale : un vendeur qui pouvait faire N imports peut toujours en faire
 * N, un qui pouvait faire M images peut toujours en faire M.
 *
 *   drops = credits × DROPS.import + imageCredits × DROPS.image
 *
 * **Quand le lancer : APRÈS le déploiement du nouveau code**, jamais avant. Le
 * nouveau code lit `credits` comme des drops ; si on convertissait pendant que
 * l'ancien code tourne encore, il lirait des soldes gonflés. L'ordre sûr est :
 * déployer, vérifier que l'API répond, puis lancer ceci.
 *
 * **Ne réécrit rien sans `--ecrire`** (convention du projet). Sans le drapeau,
 * il montre ce qu'il ferait, compte par compte, et s'arrête là.
 *
 *   npx tsx convertir-en-drops.ts            # montre le plan
 *   npx tsx convertir-en-drops.ts --ecrire   # applique
 *
 * Idempotent : un compte déjà converti porte un mouvement repère et n'est pas
 * retouché. Les comptes créés après la bascule (déjà en drops) sont ignorés par
 * la borne de date.
 */
import { prisma } from './src/lib/prisma.js'
import { DROPS } from './src/services/tarifs.js'

const ECRIRE = process.argv.includes('--ecrire')

/**
 * Restreint la conversion à un seul compte (--email <adresse>).
 *
 * Un compte de développement au solde d'images gonflé par les tests
 * (ex. 24 952 crédits images) donnerait un chiffre absurde en drops : on le
 * traite à part plutôt que de le convertir aveuglément avec les vrais comptes.
 */
const iEmail = process.argv.indexOf('--email')
const EMAIL = iEmail >= 0 ? process.argv[iEmail + 1] : null

/** Repère de conversion : sa présence dit « ce compte est déjà en drops ». */
const MARQUE = 'Conversion initiale en drops'

/**
 * Les comptes nés après ce moment sont déjà en drops (défaut à 120) : les
 * convertir les gonflerait. Fin de la journée de bascule.
 */
const BASCULE = new Date('2026-09-07T23:59:59.000Z')

async function main() {
  const users = await prisma.user.findMany({
    where: { createdAt: { lt: BASCULE }, ...(EMAIL ? { email: EMAIL } : {}) },
    select: { id: true, email: true, credits: true, imageCredits: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`${users.length} compte(s) antérieur(s) à la bascule.\n`)
  let convertis = 0
  let ignores = 0

  for (const u of users) {
    const dejaFait = await prisma.dropTransaction.findFirst({
      where: { userId: u.id, motif: MARQUE },
      select: { id: true },
    })
    if (dejaFait) {
      ignores++
      continue
    }

    const drops = u.credits * DROPS.import + u.imageCredits * DROPS.image
    console.log(
      `${u.email.padEnd(34)} ${String(u.credits).padStart(5)} annonce(s) + ${String(u.imageCredits).padStart(5)} image(s)  ->  ${drops} drops`,
    )

    if (!ECRIRE) continue

    await prisma.$transaction([
      prisma.user.update({ where: { id: u.id }, data: { credits: drops, imageCredits: 0 } }),
      prisma.dropTransaction.create({
        data: { userId: u.id, delta: drops, balance: drops, motif: MARQUE },
      }),
    ])
    convertis++
  }

  console.log('')
  if (ECRIRE) {
    console.log(`Terminé : ${convertis} converti(s), ${ignores} déjà en drops.`)
  } else {
    console.log(`Aperçu seulement. Relancer avec --ecrire pour appliquer. (${ignores} déjà en drops.)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
