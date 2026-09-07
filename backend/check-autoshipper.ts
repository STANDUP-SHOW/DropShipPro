import { prisma } from './src/lib/prisma.js'
import { tourneeAutopilot, type PassageAutopilot } from './src/services/autopilot.js'

/**
 * La tournée AUTO-SHIPPER, éprouvée contre la vraie base avec un faux passage —
 * le moteur d'import n'est jamais appelé, seule la mécanique de planification
 * est jugée.
 *
 *   cd backend && npx tsx check-autoshipper.ts
 *
 * Modèle drops (07/09/2026) : plus de tranche forfaitaire. L'orchestration est
 * gratuite ; seuls les imports produits se paient (`DROPS.autoShipperImport`
 * chacun, débité DANS `runAutopilot`, éprouvé par check-parcours). La tournée
 * elle-même ne débite rien. Ce banc vérifie donc la planification pure : un
 * pilote activé est servi au plus une fois par tranche de douze heures, un
 * pilote désactivé jamais, la garde empêche le rejeu, et un passage qui lève
 * ne fait pas tomber la tournée ni n'est rejoué dans la même tranche.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

let passages = 0
const fauxPassage: PassageAutopilot = async () => {
  passages++
  return { imported: 2, published: 1, skipped: 0, failed: 0, log: [] }
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
  const actif = await prisma.user.create({
    data: { email: `banc-shipper-${Date.now()}@example.com`, passwordHash: 'x', credits: 20 },
  })
  const autre = await prisma.user.create({
    data: { email: `banc-shipper-2-${Date.now()}@example.com`, passwordHash: 'x', credits: 20 },
  })
  const eteint = await prisma.user.create({
    data: { email: `banc-shipper-eteint-${Date.now()}@example.com`, passwordHash: 'x', credits: 20 },
  })

  try {
    await prisma.autopilot.create({ data: { userId: actif.id, enabled: true } })
    await prisma.autopilot.create({ data: { userId: autre.id, enabled: true } })
    await prisma.autopilot.create({ data: { userId: eteint.id, enabled: false } })

    console.log('La tournée : les pilotes activés, une fois par demi-journée')
    await tourneeAutopilot(fauxPassage, 0, [actif.id, autre.id, eteint.id])
    verifier('les deux pilotes activés sont servis, l\'éteint jamais', passages === 2, `${passages} passage(s)`)
    verifier('la tournée ne débite rien elle-même (orchestration gratuite)', (await credits(actif.id)) === 20 && (await credits(autre.id)) === 20)
    const marqueEteint = await prisma.autopilot.findUniqueOrThrow({ where: { userId: eteint.id } })
    verifier('le pilote éteint n\'est pas marqué servi', marqueEteint.lastAutoRunAt === null)

    console.log('\nLa garde des douze heures')
    const avant = passages
    await tourneeAutopilot(fauxPassage, 0, [actif.id, autre.id, eteint.id])
    verifier('une tournée juste après ne repasse pas', passages === avant)

    console.log('\nUn passage en panne ne fait pas tomber la tournée')
    await prisma.autopilot.update({
      where: { userId: actif.id },
      data: { lastAutoRunAt: new Date(Date.now() - 12 * 3600 * 1000) },
    })
    const avantPanne = await credits(actif.id)
    await tourneeAutopilot(passageEnPanne, 0, [actif.id, autre.id, eteint.id])
    verifier('la tournée survit au passage en panne', true)
    verifier('rien n\'est débité (l\'orchestration ne coûte rien)', (await credits(actif.id)) === avantPanne)
    const marqueActif = await prisma.autopilot.findUniqueOrThrow({ where: { userId: actif.id } })
    verifier(
      'la marque reste : pas de rejeu en boucle dans la même tranche',
      marqueActif.lastAutoRunAt !== null && Date.now() - marqueActif.lastAutoRunAt.getTime() < 60_000,
    )
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [actif.id, autre.id, eteint.id] } } })
    await prisma.$disconnect()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
