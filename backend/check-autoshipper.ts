import { prisma } from './src/lib/prisma.js'
import { tourneeAutopilot, CREDITS_TRANCHE_AUTO, type PassageAutopilot } from './src/services/autopilot.js'

/**
 * La tournée AUTO-SHIPPER, éprouvée contre la vraie base avec un faux
 * passage — le moteur d'import n'est jamais appelé, aucun crédit d'annonce
 * ne part, seule la mécanique de tranche est jugée.
 *
 *   cd backend && npx tsx check-autoshipper.ts
 *
 * Ce qu'elle promet : un pilote activé est servi au plus une fois par tranche
 * de douze heures, la tranche coûte 5 crédits payés d'avance, un vendeur sans
 * crédits n'est ni servi ni marqué servi (il retentera), un pilote désactivé
 * n'existe pas pour la tournée, et un passage qui lève rend sa tranche sans
 * être rejoué dans la même tranche.
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
  const riche = await prisma.user.create({
    data: { email: `banc-shipper-${Date.now()}@example.com`, passwordHash: 'x', credits: 20 },
  })
  const pauvre = await prisma.user.create({
    data: { email: `banc-shipper-pauvre-${Date.now()}@example.com`, passwordHash: 'x', credits: 2 },
  })
  const eteint = await prisma.user.create({
    data: { email: `banc-shipper-eteint-${Date.now()}@example.com`, passwordHash: 'x', credits: 20 },
  })

  try {
    await prisma.autopilot.create({ data: { userId: riche.id, enabled: true } })
    await prisma.autopilot.create({ data: { userId: pauvre.id, enabled: true } })
    await prisma.autopilot.create({ data: { userId: eteint.id, enabled: false } })

    console.log('La tranche : payée d\'avance, une par demi-journée')
    await tourneeAutopilot(fauxPassage, 0)
    verifier('les deux pilotes activés sont visés, l\'éteint jamais', passages === 1, `${passages} passage(s)`)
    verifier(`la tranche coûte ${CREDITS_TRANCHE_AUTO} crédits, débités d'avance`, (await credits(riche.id)) === 20 - CREDITS_TRANCHE_AUTO)
    verifier('le vendeur sans crédits n\'est pas servi, ses crédits intacts', (await credits(pauvre.id)) === 2)
    const marquePauvre = await prisma.autopilot.findUniqueOrThrow({ where: { userId: pauvre.id } })
    verifier('et il n\'est pas marqué servi : il retentera après recharge', marquePauvre.lastAutoRunAt === null)

    console.log('\nLa garde de la tranche')
    const avant = passages
    await tourneeAutopilot(fauxPassage, 0)
    verifier('une tournée juste après ne repasse pas', passages === avant)
    verifier('et ne re-débite rien', (await credits(riche.id)) === 20 - CREDITS_TRANCHE_AUTO)

    console.log('\nUn passage en panne rend sa tranche')
    await prisma.autopilot.update({
      where: { userId: riche.id },
      data: { lastAutoRunAt: new Date(Date.now() - 12 * 3600 * 1000) },
    })
    const avantPanne = await credits(riche.id)
    await tourneeAutopilot(passageEnPanne, 0)
    verifier('la tournée survit au passage en panne', true)
    verifier('la tranche est rendue', (await credits(riche.id)) === avantPanne)
    const marqueRiche = await prisma.autopilot.findUniqueOrThrow({ where: { userId: riche.id } })
    verifier(
      'mais la marque reste : pas de rejeu en boucle dans la même tranche',
      marqueRiche.lastAutoRunAt !== null && Date.now() - marqueRiche.lastAutoRunAt.getTime() < 60_000,
    )
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [riche.id, pauvre.id, eteint.id] } } })
    await prisma.$disconnect()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
