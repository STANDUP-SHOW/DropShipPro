import { readFileSync } from 'node:fs'
import { prisma } from './src/lib/prisma.js'

/**
 * Outil jetable de la vérification production du 05/09/2026 — supprimé après.
 * Il ne touche QUE le compte banc-automode-* créé par la session, jamais un
 * vendeur. Trois gestes, choisis par argument :
 *
 *   npx tsx banc-prod-automode.ts poser     — met le rayon du jetable en poste
 *   npx tsx banc-prod-automode.ts passage   — un vrai passage AUTO-MODE (API réelle)
 *   npx tsx banc-prod-automode.ts produit   — crée une annonce pour l'analyse produit
 *   npx tsx banc-prod-automode.ts detruire  — supprime le compte jetable
 */

const DOSSIER = 'C:/Users/maxma/AppData/Local/Temp/claude/C--Users-maxma-Downloads-DropPost/b2678cdb-7ce1-40a9-a102-4965f935858b/scratchpad'
const email = readFileSync(`${DOSSIER}/banc-email.txt`, 'utf8').trim()

async function main() {
  const geste = process.argv[2]
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`compte jetable introuvable : ${email}`)

  if (geste === 'poser') {
    const { count } = await prisma.department.updateMany({
      where: { userId: user.id },
      data: { paidUntil: new Date(Date.now() + 86400000), plan: 'mensuel' },
    })
    console.log(`${count} rayon(s) mis en poste pour ${email}`)
  } else if (geste === 'passage') {
    const dep = await prisma.department.findFirst({ where: { userId: user.id } })
    if (!dep) throw new Error('aucun rayon sur le jetable')
    const { passageAutoMode } = await import('./src/services/autoAnalyste.js')
    const fait = await passageAutoMode(dep)
    console.log(`rapport ${fait.rapportId}, ${fait.gagnants} gagnant(s)`)
  } else if (geste === 'produit') {
    const p = await prisma.product.create({
      data: {
        userId: user.id,
        title: 'Montre connectée bracelet silicone écran AMOLED suivi cardiaque',
        description:
          "Montre connectée avec écran AMOLED de 1,43 pouce, suivi de la fréquence cardiaque et du sommeil, plus de 100 modes sportifs, étanchéité IP68, autonomie annoncée de 7 jours, bracelet en silicone interchangeable de 22 mm, compatible Android et iOS via Bluetooth 5.3.",
        price: 18.5,
        currency: 'EUR',
        sourceUrl: 'https://www.example.com/montre-banc',
        images: [],
      },
    })
    console.log(`produit ${p.id}`)
  } else if (geste === 'detruire') {
    await prisma.user.deleteMany({ where: { email } })
    console.log(`compte ${email} supprimé (cascade)`)
  } else {
    throw new Error('geste inconnu')
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
