import { prisma } from './src/lib/prisma.js'
import { passageAutoMode, tourneeAutoMode, type Generateur } from './src/services/autoAnalyste.js'
import { DROPS } from './src/services/tarifs.js'

/**
 * L'AUTO-MODE des chefs de rayon, éprouvé contre la vraie base avec un faux
 * générateur — l'API Anthropic n'est jamais appelée.
 *
 *   cd backend && npx tsx check-automode.ts
 *
 * Ce qu'il promet, modèle drops (07/09/2026) : un rayon dont l'interrupteur
 * AUTO-MODE est levé reçoit, au plus une fois par demi-journée, une analyse
 * consignée en rapport MARKET et dix produits gagnants marqués gagnant12h.
 * L'éligibilité ne tient qu'à l'interrupteur — plus d'abonnement, plus d'essai.
 * Chaque passage coûte `DROPS.autoModePassage`, débité au vendeur ; sans drops,
 * le rayon est sauté sans rien consigner. Interrupteur baissé : jamais servi.
 * Un générateur en échec rend les drops et ne prive pas les autres rayons.
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
    // De quoi payer plusieurs passages : chacun coûte DROPS.autoModePassage.
    data: { email: `banc-automode-${Date.now()}@example.com`, passwordHash: 'x', credits: 500 },
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
    await tourneeAutoMode(fauxGenerateur, 0, user.id)
    verifier('une tournée juste après ne régénère rien pour ce rayon', generations === avant)

    console.log('\nQui la tournée sert, et qui elle ignore (modèle drops)')
    // L'interrupteur est le seul critère : paidUntil et plan ne comptent plus.
    // Trois rayons interrupteur LEVÉ (dont un « expiré » et un « essai » d'antan)
    // sont désormais servis ; seul l'interrupteur BAISSÉ est ignoré.
    await prisma.department.create({ data: { userId: user.id, key: 'informatique', agentName: 'Iris', autoMode: true, paidUntil: new Date(Date.now() - 1000), plan: 'mensuel' } })
    await prisma.department.create({ data: { userId: user.id, key: 'jeux-videos', agentName: 'Jade', autoMode: true, paidUntil: demain, plan: 'essai' } })
    const hugo = await prisma.department.create({ data: { userId: user.id, key: 'mode-homme', agentName: 'Hugo', autoMode: false, paidUntil: demain, plan: 'mensuel' } })
    await prisma.department.create({
      data: { userId: user.id, key: 'maison-et-jardin', agentName: 'Nora', autoMode: true, paidUntil: demain, plan: 'mensuel' },
    })
    const soldeAvant = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    const avantTournee = generations
    await tourneeAutoMode(fauxGenerateur, 0, user.id)
    // Malik a déjà un rapport frais (garde) : il est sauté. Restent Iris, Jade, Nora.
    verifier('les trois rayons interrupteur levé sont servis', generations === avantTournee + 3, `${generations - avantTournee} servi(s)`)
    const soldeApres = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    verifier(
      `chaque passage débite ${DROPS.autoModePassage} drops`,
      soldeAvant - soldeApres === 3 * DROPS.autoModePassage,
      `débité ${soldeAvant - soldeApres}`,
    )
    const rapportHugo = await prisma.report.count({ where: { departmentId: hugo.id } })
    verifier('interrupteur baissé : aucun rapport', rapportHugo === 0)

    console.log('\nSans drops, le rayon est sauté sans rien consigner')
    const pauvre = await prisma.user.create({
      data: { email: `banc-automode-pauvre-${Date.now()}@example.com`, passwordHash: 'x', credits: 10 },
    })
    const rayonPauvre = await prisma.department.create({
      data: { userId: pauvre.id, key: 'informatique', agentName: 'Sam', autoMode: true },
    })
    await tourneeAutoMode(fauxGenerateur, 0, pauvre.id)
    const rapportsPauvre = await prisma.report.count({ where: { departmentId: rayonPauvre.id } })
    verifier('rien consigné pour le rayon sans drops', rapportsPauvre === 0)
    verifier('et ses drops sont intacts (il retentera)', (await prisma.user.findUniqueOrThrow({ where: { id: pauvre.id } })).credits === 10)
    await prisma.user.delete({ where: { id: pauvre.id } })

    console.log('\nUn rayon en panne ne prive pas les autres')
    // Tous les rapports vieillis au-delà de la garde : la tournée les reprend.
    await prisma.report.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 12 * 3600 * 1000) } })
    const nbRapportsAvantPanne = await prisma.report.count({ where: { userId: user.id } })
    const soldeAvantPanne = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    // Le générateur tombe sur tous : la tournée doit finir sans lever.
    await tourneeAutoMode(enPanne, 0, user.id)
    verifier('la tournée survit à un générateur en panne', true)
    const rapportsApresPanne = await prisma.report.count({ where: { userId: user.id } })
    verifier('et ne consigne rien de vide', rapportsApresPanne === nbRapportsAvantPanne)
    verifier(
      'un passage en panne rend ses drops',
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits === soldeAvantPanne,
    )
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
