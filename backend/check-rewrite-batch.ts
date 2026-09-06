/**
 * La réécriture différée des lots, groupée en batch Anthropic.
 *
 *   cd backend && npx tsx check-rewrite-batch.ts
 *
 * **Pourquoi.** Un import en lot ne réécrit pas tout de suite : il crée
 * l'annonce avec le texte source (`rewritePending`), dépose un `RewriteJob`, et
 * un planificateur regroupe les entrées dans UN batch Anthropic — moitié prix.
 * Ce banc remplace l'API Batch par un **faux serveur au contrat écrit en dur**
 * (create → id, retrieve → ended, results → une ligne par requête) et vérifie
 * que : les jobs sont soumis, un succès complète l'annonce et la sort de
 * « en cours », un échec rend le crédit et garde le texte source. La tournée est
 * **bornée au compte jetable** — sans ça, un banc écraserait les vraies
 * réécritures en attente (la faute de l'AUTO-MODE le 05/09/2026).
 *
 * Le faux serveur ne recopie PAS le service : il écrit le contrat, sinon une
 * faute des deux côtés ne tomberait jamais (leçon du banc Kaufland).
 */
import { prisma } from './src/lib/prisma.js'
import { tourneeReecritures, type ClientBatch } from './src/services/rewriteBatch.js'

let echecs = 0
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!ok) echecs++
}

/** Un message Anthropic de succès, tel que `interpreter` sait le lire. */
function messageSucces(titre: string): unknown {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 200 },
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          title: titre,
          titleMedium: titre,
          titleShort: titre,
          description: 'Une description réécrite, propre et vendeuse.',
          bulletPoints: ['ARGUMENT UN : bénéfice concret.', 'ARGUMENT DEUX : autre bénéfice.'],
          attributes: { Matière: 'Acier', Couleur: 'Noir' },
          metaTitle: titre,
          metaDescription: 'Meta description.',
          metaKeywords: 'un, deux, trois',
        }),
      },
    ],
  }
}

/**
 * Le faux serveur de batch. Contrat écrit ici, pas emprunté au service.
 *
 * `reponses` dit, par custom_id, s'il réussit (avec un titre réécrit) ou
 * échoue. `results` ne rend QUE les requêtes réellement soumises dans ce
 * batch — comme le vrai.
 */
function fauxServeur(reponses: Map<string, { ok: true; titre: string } | { ok: false }>) {
  const parBatch = new Map<string, Array<{ custom_id: string }>>()
  let n = 0
  const compteur = { crees: 0 }
  const client: ClientBatch = {
    messages: {
      batches: {
        async create(body) {
          compteur.crees++
          const id = `msgbatch_test_${++n}`
          parBatch.set(id, body.requests.map((r) => ({ custom_id: r.custom_id })))
          return { id }
        },
        async retrieve() {
          return { processing_status: 'ended' }
        },
        async *results(id) {
          for (const req of parBatch.get(id) ?? []) {
            const r = reponses.get(req.custom_id)
            if (r && r.ok) {
              yield { custom_id: req.custom_id, result: { type: 'succeeded', message: messageSucces(r.titre) as never } }
            } else {
              yield { custom_id: req.custom_id, result: { type: 'errored' } }
            }
          }
        },
      },
    },
  }
  return { client, compteur }
}

async function main() {
  const user = await prisma.user.create({
    data: { email: `banc-batch-${Date.now()}@example.com`, passwordHash: 'x', credits: 10 },
  })

  try {
    // Deux annonces importées en lot : texte source, réécriture en file.
    const faireProduit = (titre: string) =>
      prisma.product.create({
        data: {
          userId: user.id,
          sourceUrl: `https://exemple.test/${titre}`,
          sourceSite: 'exemple.test',
          title: titre,
          description: 'texte source du fournisseur',
          aiTitle: titre,
          aiDescription: 'texte source du fournisseur',
          price: 10,
          sellingPrice: 15,
          currency: 'EUR',
          images: [],
          aiEnhanced: false,
          rewritePending: true,
        },
      })
    const bon = await faireProduit('Montre acier automatique')
    const rate = await faireProduit('Bracelet cuir marron')

    const entree = (p: { title: string; description: string }) => ({
      title: p.title,
      description: p.description,
      category: null,
      pageText: 'Caractéristiques : acier inoxydable, mouvement automatique, étanche 50 m.',
    })
    await prisma.rewriteJob.create({ data: { userId: user.id, productId: bon.id, entree: entree(bon) } })
    await prisma.rewriteJob.create({ data: { userId: user.id, productId: rate.id, entree: entree(rate) } })

    console.log('La soumission')
    const reponses = new Map<string, { ok: true; titre: string } | { ok: false }>([
      [String(), { ok: false }], // placeholder ignoré
    ])
    // On mappe par id de JOB, connu seulement après création : on relit les jobs.
    const jobs = await prisma.rewriteJob.findMany({ where: { userId: user.id } })
    const jobBon = jobs.find((j) => j.productId === bon.id)!
    const jobRate = jobs.find((j) => j.productId === rate.id)!
    reponses.clear()
    reponses.set(jobBon.id, { ok: true, titre: 'Montre en acier inoxydable à mouvement automatique, étanche 50 m' })
    reponses.set(jobRate.id, { ok: false })

    const { client, compteur } = fauxServeur(reponses)

    // Premier passage : soumet ET applique (le faux serveur répond « ended »).
    await tourneeReecritures(client, user.id)

    verifier('un seul batch a été créé pour les deux annonces', compteur.crees === 1, `${compteur.crees} batch(s)`)

    console.log('\nL\'application des résultats')
    const bonApres = await prisma.product.findUniqueOrThrow({ where: { id: bon.id } })
    verifier('l\'annonce réussie est réécrite', bonApres.aiEnhanced === true && /acier inoxydable/.test(bonApres.aiTitle ?? ''))
    verifier('et n\'est plus « en cours »', bonApres.rewritePending === false)
    const bulletPoints = bonApres.bulletPoints as unknown as string[]
    verifier('ses arguments et attributs sont posés', Array.isArray(bulletPoints) && bulletPoints.length === 2)

    const rateApres = await prisma.product.findUniqueOrThrow({ where: { id: rate.id } })
    verifier('l\'annonce en échec garde son texte source', rateApres.aiEnhanced === false && rateApres.aiTitle === 'Bracelet cuir marron')
    verifier('et n\'est plus « en cours » non plus', rateApres.rewritePending === false)

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    verifier('le crédit de l\'échec est rendu, celui du succès gardé', apres.credits === 11, `crédits : ${apres.credits}`)

    console.log('\nLes états des jobs')
    const jobsApres = await prisma.rewriteJob.findMany({ where: { userId: user.id } })
    verifier('le job réussi est « fait »', jobsApres.find((j) => j.id === jobBon.id)?.statut === 'fait')
    verifier('le job en échec est « echec »', jobsApres.find((j) => j.id === jobRate.id)?.statut === 'echec')

    console.log('\nLa garde de rejeu')
    // Un second passage ne doit rien retoucher : tout est fait/echec.
    const creditsAvant = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    await tourneeReecritures(client, user.id)
    const creditsApres = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    verifier('un second passage ne re-rend ni ne re-débite rien', creditsApres === creditsAvant)
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined)
  }

  console.log('')
  if (echecs) {
    console.log(`${echecs} attente(s) non tenue(s).`)
    process.exitCode = 1
  } else {
    console.log('Réécriture batch : tout passe.')
  }
}

main()
  .catch((e) => {
    console.error('Le banc lui-même a levé :', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
