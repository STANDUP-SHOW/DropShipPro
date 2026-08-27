import { prisma } from './src/lib/prisma.js'
import { accorderAvoir } from './src/services/tickets.js'

/**
 * Éprouve la borne de l'avoir.
 *
 * C'est le seul garde-fou qui compte ici, et il ne peut pas vivre dans une
 * consigne au modèle : une consigne est une suggestion, et elle cède le jour où
 * le vendeur insiste assez. Un agent ne doit jamais pouvoir rendre plus que ce
 * qui a été réellement pris — ni rendre deux fois.
 *
 * Le banc tourne contre la vraie base, sur un compte jetable créé et détruit ici.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const marque = `banc-tickets-${Date.now()}`
const compte = await prisma.user.create({
  data: { email: `${marque}@exemple.test`, passwordHash: 'x', imageCredits: 0, credits: 0 },
})

try {
  const soldeDe = async () =>
    (await prisma.user.findUniqueOrThrow({ where: { id: compte.id } })).imageCredits

  // --- Un avoir ne dépasse jamais ce qui a été pris --------------------------
  const gourmand = await prisma.ticket.create({
    data: { userId: compte.id, subject: 'essai', creditsSpent: 1, creditKind: 'image' },
  })
  const accorde = await accorderAvoir(gourmand.id, 500, 'comptable')
  exige(accorde === 1, `${accorde} credit(s) accorde(s) sur une demande de 500, plafond 1`)
  exige((await soldeDe()) === 1, 'le solde ne reflete pas l avoir accorde')

  // --- Un avoir déjà accordé ne se double pas -------------------------------
  const rejoue = await accorderAvoir(gourmand.id, 1, 'comptable')
  exige(rejoue === 0, `un second avoir a rendu ${rejoue} credit(s)`)
  exige((await soldeDe()) === 1, 'le solde a bouge sur un avoir deja accorde')

  // --- Sans coût identifié, aucun avoir possible ----------------------------
  const sansCout = await prisma.ticket.create({
    data: { userId: compte.id, subject: 'sans objet', creditsSpent: null, creditKind: 'image' },
  })
  exige((await accorderAvoir(sansCout.id, 3, 'sav')) === 0, 'un ticket sans cout ne doit rien rendre')
  exige((await soldeDe()) === 1, 'le solde a bouge sur un ticket sans cout')

  // --- Le ticket porte sa trace, et se ferme --------------------------------
  const trace = await prisma.ticket.findUniqueOrThrow({ where: { id: gourmand.id } })
  exige(trace.status === 'RESOLU', `statut ${trace.status}, attendu RESOLU`)
  exige(trace.refundedBy === 'comptable', "l avoir doit porter le nom de l agent qui l a accorde")
  exige(trace.refundedAt !== null, "l avoir doit porter sa date")

  // Le vendeur doit lire l avoir dans le fil, pas seulement dans un champ.
  const messages = await prisma.ticketMessage.findMany({ where: { ticketId: gourmand.id } })
  exige(
    messages.some((m) => /avoir accord/i.test(m.body)),
    "l avoir n apparait pas dans le fil du ticket",
  )

  // --- Les crédits annonce et image ne se mélangent pas ---------------------
  const annonce = await prisma.ticket.create({
    data: { userId: compte.id, subject: 'import rate', creditsSpent: 1, creditKind: 'annonce' },
  })
  await accorderAvoir(annonce.id, 1, 'comptable')
  const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } })
  exige(apres.credits === 1, `credits annonce a ${apres.credits}, attendu 1`)
  exige(apres.imageCredits === 1, `credits image a ${apres.imageCredits}, attendu 1 (inchange)`)

  console.log(echecs === 0 ? 'Tickets et avoirs : tout passe.' : `${echecs} echec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  await prisma.user.delete({ where: { id: compte.id } })
  await prisma.$disconnect()
}
