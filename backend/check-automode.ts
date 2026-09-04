import { prisma } from './src/lib/prisma.js'
import { passageAutoMode, tourneeAutoMode, type Generateur } from './src/services/autoAnalyste.js'

/**
 * L'AUTO-MODE des chefs de rayon, éprouvé contre la vraie base avec un faux
 * générateur — l'API Anthropic n'est jamais appelée, aucun crédit ne part.
 *
 *   cd backend && npx tsx check-automode.ts
 *
 * Ce qu'il promet : un rayon en poste dont l'interrupteur est levé reçoit,
 * au plus une fois par demi-journée, une analyse consignée en rapport MARKET
 * et dix produits gagnants en opportunités marquées gagnant12h. Un rayon à
 * l'arrêt, en essai ou interrupteur baissé ne reçoit rien. Un générateur en
 * échec sur un rayon ne prive pas les autres.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

/** Le faux générateur : une analyse reconnaissable, trois gagnants dont un invalide. */
let generations = 0
const fauxGenerateur: Generateur = async (_dep, label) => {
  generations++
  return {
    titre: `Analyse ${label}`,
    corps: `## Fournisseurs\n\nLes écouteurs Bluetooth dominent le rayon ${label}.\n\n## Places de marché\n\nForte demande saisonnière.`,
    gagnants: [
      { titre: 'Écouteurs sans fil', lien: 'https://exemple.test/1', prixBas: 8.5, prixVente: 24.9, plateformes: ['eBay', 'Kaufland'] },
      { titre: 'Montre connectée', lien: 'https://exemple.test/2', prixBas: 12, prixVente: 39, plateformes: ['votre site'] },
      // prixVente <= prixBas : doit être écarté par le connecteur, pas déposé.
      { titre: 'Produit à marge négative', lien: 'https://exemple.test/3', prixBas: 20, prixVente: 15, plateformes: ['eBay'] },
    ],
  }
}

const enPanne: Generateur = async () => {
  throw new Error('générateur volontairement en panne')
}

async function main() {
  const user = await prisma.user.create({
    data: { email: `banc-automode-${Date.now()}@example.com`, passwordHash: 'x' },
  })
  const demain = new Date(Date.now() + 86400000)

  try {
    console.log('Un passage complet')
    const rayon = await prisma.department.create({
      data: { userId: user.id, key: 'telephones-portables-et-accessoires', agentName: 'Malik', autoMode: true, paidUntil: demain, plan: 'mensuel' },
    })
    const fait = await passageAutoMode(rayon, fauxGenerateur)
    const rapport = await prisma.report.findUnique({ where: { id: fait.rapportId } })
    verifier('le rapport est consigné en section MARKET', rapport?.section === 'MARKET')
    verifier('rattaché au rayon — la rubrique « Mes analyses » le lira', rapport?.departmentId === rayon.id)
    const resume = rapport?.summary as { auto?: string; rayon?: string; redacteur?: string } | null
    verifier('le résumé porte date, rayon et rédacteur pour les listes', resume?.auto === 'analyse-12h' && Boolean(resume?.rayon) && resume?.redacteur === 'Malik', JSON.stringify(resume))
    const gagnants = await prisma.opportunity.findMany({ where: { userId: user.id } })
    verifier('les gagnants valides sont déposés, la marge négative écartée', fait.gagnants === 2 && gagnants.length === 2, `${fait.gagnants} déposé(s)`)
    verifier('chaque gagnant porte sa marque et ses plateformes', gagnants.every((g) => (g.raw as { gagnant12h?: boolean })?.gagnant12h === true && /Plateformes conseillées/.test(g.notes ?? '')))
    verifier('la marge n\'est jamais stockée — deux prix, rien d\'autre', gagnants.every((g) => g.sourcePrice !== null && g.marketPrice !== null))

    console.log('\nLa garde des onze heures')
    const avant = generations
    await tourneeAutoMode(fauxGenerateur, 0)
    verifier('une tournée juste après ne régénère rien pour ce rayon', generations === avant)

    console.log('\nQui la tournée sert, et qui elle ignore')
    // Trois rayons qui ne doivent JAMAIS être servis : arrêté, essai, interrupteur baissé.
    await prisma.department.create({ data: { userId: user.id, key: 'informatique', agentName: 'Iris', autoMode: true, paidUntil: new Date(Date.now() - 1000), plan: 'mensuel' } })
    await prisma.department.create({ data: { userId: user.id, key: 'jeux-videos', agentName: 'Jade', autoMode: true, paidUntil: demain, plan: 'essai' } })
    await prisma.department.create({ data: { userId: user.id, key: 'mode-homme', agentName: 'Hugo', autoMode: false, paidUntil: demain, plan: 'mensuel' } })
    // Et un quatrième, éligible, pour prouver que la tournée le sert.
    const eligible = await prisma.department.create({
      data: { userId: user.id, key: 'maison-et-jardin', agentName: 'Nora', autoMode: true, paidUntil: demain, plan: 'mensuel' },
    })
    const avantTournee = generations
    await tourneeAutoMode(fauxGenerateur, 0)
    verifier('la tournée ne sert que le rayon éligible', generations === avantTournee + 1)
    const rapportNora = await prisma.report.findFirst({ where: { departmentId: eligible.id } })
    verifier('et son rapport existe', Boolean(rapportNora))
    const rapportsArretes = await prisma.report.count({ where: { userId: user.id, departmentId: { notIn: [rayon.id, eligible.id] } } })
    verifier('arrêté, essai et interrupteur baissé : aucun rapport', rapportsArretes === 0)

    console.log('\nUn rayon en panne ne prive pas les autres')
    // Nora redevient servable en vieillissant son rapport au-delà de la garde.
    await prisma.report.updateMany({ where: { departmentId: eligible.id }, data: { createdAt: new Date(Date.now() - 12 * 3600 * 1000) } })
    await prisma.report.updateMany({ where: { departmentId: rayon.id }, data: { createdAt: new Date(Date.now() - 12 * 3600 * 1000) } })
    // Le générateur tombe sur tous : la tournée doit finir sans lever.
    await tourneeAutoMode(enPanne, 0)
    verifier('la tournée survit à un générateur en panne', true)
    const rapportsApresPanne = await prisma.report.count({ where: { userId: user.id } })
    verifier('et ne consigne rien de vide', rapportsApresPanne === 2)
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } })
    await prisma.$disconnect()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
