import { prisma } from './src/lib/prisma.js'
import { tourneeAutopilot, type PassageAutopilot } from './src/services/autopilot.js'
import { DROPS } from './src/services/tarifs.js'

/**
 * La tournée AUTO-SHIPPER, éprouvée contre la vraie base avec un faux passage —
 * le moteur d'import n'est jamais appelé, seule la mécanique de planification
 * et de facturation est jugée.
 *
 *   cd backend && npx tsx check-autoshipper.ts
 *
 * Modèle drops (17/09/2026) : **la journée se paie** (`DROPS.autoShipperJour`,
 * 75), une fois par jour civil, à la première tournée du jour ; la seconde
 * tournée du même jour ne redemande rien. Chaque produit importé et publié se
 * paie en plus dans `runAutopilot` (`DROPS.autoShipperImport`, éprouvé par
 * check-parcours). Ce que ce banc vérifie : un pilote activé est servi au plus
 * une fois par tranche de douze heures et payé au plus une fois par jour, un
 * pilote désactivé jamais, un pilote sans drops est sauté SANS être marqué, une
 * journée sans import est rendue, un passage en panne est rendu mais marqué.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const JOUR = DROPS.autoShipperJour

let passages = 0
const fauxPassage: PassageAutopilot = async () => {
  passages++
  return { imported: 2, published: 1, skipped: 0, failed: 0, log: [] }
}
const passageVide: PassageAutopilot = async () => {
  passages++
  return { imported: 0, published: 0, skipped: 3, failed: 0, log: [] }
}
const passageEnPanne: PassageAutopilot = async () => {
  passages++
  throw new Error('passage volontairement en panne')
}

async function credits(userId: string): Promise<number> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })
  return u.credits
}

async function main() {
  const t = Date.now()
  const actif = await prisma.user.create({ data: { email: `banc-shipper-${t}@example.com`, passwordHash: 'x', credits: 200 } })
  const autre = await prisma.user.create({ data: { email: `banc-shipper-2-${t}@example.com`, passwordHash: 'x', credits: 200 } })
  const eteint = await prisma.user.create({ data: { email: `banc-shipper-eteint-${t}@example.com`, passwordHash: 'x', credits: 200 } })
  const pauvre = await prisma.user.create({ data: { email: `banc-shipper-pauvre-${t}@example.com`, passwordHash: 'x', credits: 20 } })
  const tous = [actif.id, autre.id, eteint.id, pauvre.id]

  try {
    await prisma.autopilot.create({ data: { userId: actif.id, enabled: true } })
    await prisma.autopilot.create({ data: { userId: autre.id, enabled: true } })
    await prisma.autopilot.create({ data: { userId: eteint.id, enabled: false } })
    await prisma.autopilot.create({ data: { userId: pauvre.id, enabled: true } })

    console.log('La tournée : les pilotes activés, une fois par demi-journée, la journée payée une fois')
    await tourneeAutopilot(fauxPassage, 0, tous)
    verifier("les deux pilotes activés et solvables sont servis, l'éteint et le pauvre jamais", passages === 2, `${passages} passage(s)`)
    verifier(`la journée est débitée (${JOUR}) à chaque pilote servi`, (await credits(actif.id)) === 200 - JOUR && (await credits(autre.id)) === 200 - JOUR)
    verifier('le pilote sans drops garde ses drops (rien de partiel)', (await credits(pauvre.id)) === 20)
    const marquePauvre = await prisma.autopilot.findUniqueOrThrow({ where: { userId: pauvre.id } })
    verifier("le pilote sans drops n'est PAS marqué : il retentera une fois rechargé", marquePauvre.lastAutoRunAt === null)
    const marqueEteint = await prisma.autopilot.findUniqueOrThrow({ where: { userId: eteint.id } })
    verifier("le pilote éteint n'est pas marqué servi", marqueEteint.lastAutoRunAt === null)

    console.log('\nLa garde des douze heures')
    const avant = passages
    await tourneeAutopilot(fauxPassage, 0, tous)
    verifier('une tournée juste après ne repasse pas', passages === avant)
    verifier('et ne redébite rien', (await credits(actif.id)) === 200 - JOUR)

    console.log('\nUne seule tournée par 24 h')
    await prisma.autopilot.update({ where: { userId: actif.id }, data: { lastAutoRunAt: new Date(Date.now() - 12 * 3600 * 1000) } })
    const avantDouze = passages
    await tourneeAutopilot(fauxPassage, 0, [actif.id])
    verifier('douze heures après, le pilote n\'est PAS resservi (une tournée par 24 h)', passages === avantDouze)
    verifier('et rien n\'est redébité', (await credits(actif.id)) === 200 - JOUR)

    console.log('\nUne journée sans import est rendue')
    const hier = new Date(Date.now() - 24 * 3600 * 1000)
    await prisma.autopilot.update({ where: { userId: autre.id }, data: { lastAutoRunAt: hier } })
    await tourneeAutopilot(passageVide, 0, [autre.id])
    verifier('la journée est rendue quand rien n\'a été importé ni publié', (await credits(autre.id)) === 200 - JOUR)

    console.log('\nUn passage en panne ne fait pas tomber la tournée')
    await prisma.autopilot.update({ where: { userId: actif.id }, data: { lastAutoRunAt: hier } })
    const avantPanne = await credits(actif.id)
    await tourneeAutopilot(passageEnPanne, 0, tous)
    verifier('la tournée survit au passage en panne', true)
    verifier('la journée est rendue en cas de panne', (await credits(actif.id)) === avantPanne)
    const marqueActif = await prisma.autopilot.findUniqueOrThrow({ where: { userId: actif.id } })
    verifier(
      'la marque reste : pas de rejeu en boucle dans la même tranche',
      marqueActif.lastAutoRunAt !== null && Date.now() - marqueActif.lastAutoRunAt.getTime() < 60_000,
    )
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: tous } } })
    await prisma.$disconnect()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
