import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { refundCredits } from './billing.js'
import { construireRequete, interpreter, type EntreeReecriture } from './aiEnhancer.js'

/**
 * La réécriture des annonces importées en LOT, groupée pour moitié prix.
 *
 * **Pourquoi.** Un import lance une réécriture Sonnet 5 par annonce (~4 c), et
 * c'est le poste dominant du coût. L'API Batch d'Anthropic facture la même
 * requête **à −50 %**, à condition d'accepter un résultat différé (secondes à
 * minutes) plutôt qu'instantané. Un import en lot n'a pas besoin d'être
 * instantané : le vendeur importe cinquante fiches et revient plus tard. L'import
 * à l'unité, lui, reste synchrone — l'attente n'y serait pas acceptable.
 *
 * **Le mécanisme.** L'import en lot crée l'annonce avec le texte source
 * (`rewritePending`) et dépose un `RewriteJob` portant l'entrée de la
 * réécriture. Ce planificateur fait deux choses à chaque passage :
 *
 * 1. **Soumettre** : il regroupe toutes les entrées en attente dans UN batch
 *    Anthropic et les marque « soumis ».
 * 2. **Appliquer** : pour chaque batch fini, il lit les résultats et complète
 *    chaque annonce — ou, en cas d'échec, rend le crédit et garde le texte
 *    source, exactement comme le chemin synchrone.
 *
 * `construireRequete` et `interpreter` sont partagés avec l'appel synchrone :
 * le lot réécrit **mot pour mot** comme l'unité, sinon les deux divergeraient.
 */

let client: Anthropic | null = null
function defautClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Le plafond d'un batch : large, mais borné — Anthropic accepte bien plus. */
const PAR_BATCH = 100

export interface ClientBatch {
  messages: {
    batches: {
      create(body: { requests: Array<{ custom_id: string; params: unknown }> }): Promise<{ id: string }>
      retrieve(id: string): Promise<{ processing_status: string }>
      results(id: string): AsyncIterable<{
        custom_id: string
        result:
          | { type: 'succeeded'; message: Anthropic.Message }
          | { type: 'errored' | 'canceled' | 'expired'; [k: string]: unknown }
      }>
    }
  }
}

/**
 * Un passage : soumettre ce qui attend, appliquer ce qui est prêt.
 *
 * Injectable (`passage`/`client`) pour le banc, qui remplace l'API Batch par un
 * faux serveur au contrat écrit en dur.
 */
export async function tourneeReecritures(injecte?: ClientBatch, seulement?: string): Promise<void> {
  const c = (injecte ?? defautClient()) as ClientBatch | null
  if (!c) return
  await soumettreEnAttente(c, seulement)
  await appliquerFinis(c, seulement)
}

/**
 * Regroupe les entrées en attente dans un batch et les marque « soumis ».
 *
 * `seulement` borne la file à un compte : la production ne le passe JAMAIS
 * (elle groupe tout le monde, c'est l'intérêt du batch), un banc le passe
 * TOUJOURS. Sans lui, un banc qui lance la tournée soumettrait et écraserait
 * les vraies réécritures en attente — la faute exacte de l'AUTO-MODE le
 * 05/09/2026.
 */
async function soumettreEnAttente(c: ClientBatch, seulement?: string): Promise<void> {
  const enAttente = await prisma.rewriteJob.findMany({
    where: { statut: 'en_attente', ...(seulement ? { userId: seulement } : {}) },
    take: PAR_BATCH,
    orderBy: { createdAt: 'asc' },
  })
  if (!enAttente.length) return

  const requests = enAttente.map((j) => ({
    custom_id: j.id,
    params: construireRequete(j.entree as unknown as EntreeReecriture),
  }))

  const batch = await c.messages.batches.create({ requests })
  await prisma.rewriteJob.updateMany({
    where: { id: { in: enAttente.map((j) => j.id) } },
    data: { statut: 'soumis', batchId: batch.id },
  })
  console.log(`reecriture batch : ${enAttente.length} annonce(s) soumise(s) — ${batch.id}`)
}

/** Pour chaque batch fini, applique le résultat à chaque annonce. */
async function appliquerFinis(c: ClientBatch, seulement?: string): Promise<void> {
  const soumis = await prisma.rewriteJob.findMany({
    where: { statut: 'soumis', batchId: { not: null }, ...(seulement ? { userId: seulement } : {}) },
    select: { batchId: true },
    distinct: ['batchId'],
  })

  for (const { batchId } of soumis) {
    if (!batchId) continue
    let etat
    try {
      etat = await c.messages.batches.retrieve(batchId)
    } catch (err) {
      console.error(`reecriture batch : état illisible pour ${batchId}`, err instanceof Error ? err.message : err)
      continue
    }
    // Toujours en cours : on repassera. Anthropic garde les résultats 29 jours.
    if (etat.processing_status !== 'ended') continue

    for await (const ligne of c.messages.batches.results(batchId)) {
      await appliquerResultat(ligne, seulement)
    }
  }
}

async function appliquerResultat(ligne: {
  custom_id: string
  result:
    | { type: 'succeeded'; message: Anthropic.Message }
    | { type: 'errored' | 'canceled' | 'expired'; [k: string]: unknown }
}, seulement?: string): Promise<void> {
  // Le custom_id EST l'id du job : un batch peut renvoyer des résultats déjà
  // appliqués (rejoué), donc on ne traite que ce qui est encore « soumis ».
  const job = await prisma.rewriteJob.findUnique({ where: { id: ligne.custom_id } })
  if (!job || job.statut !== 'soumis') return
  // Périmètre du banc : ne jamais toucher un job hors du compte visé.
  if (seulement && job.userId !== seulement) return

  const entree = job.entree as unknown as EntreeReecriture

  const echouer = async (raison: string) => {
    // Comme le chemin synchrone quand la réécriture rate : texte source gardé,
    // crédit rendu, raison écrite. L'annonce existe déjà, on lève juste le
    // drapeau « en cours » et on rend le crédit qui n'a rien produit.
    await prisma.product.update({ where: { id: job.productId }, data: { rewritePending: false } }).catch(() => undefined)
    await refundCredits(job.userId, 1).catch(() => undefined)
    await prisma.rewriteJob.update({ where: { id: job.id }, data: { statut: 'echec' } })
    console.error(`reecriture batch : ${job.productId} non réécrit (${raison}), crédit rendu`)
  }

  if (ligne.result.type !== 'succeeded') {
    await echouer(ligne.result.type)
    return
  }

  const enhanced = interpreter(ligne.result.message, entree)
  if (!enhanced.enhanced) {
    await echouer(enhanced.raison ?? 'réponse illisible')
    return
  }

  await prisma.product.update({
    where: { id: job.productId },
    data: {
      aiTitle: enhanced.title,
      aiDescription: enhanced.description,
      metaTitle: enhanced.metaTitle,
      metaDescription: enhanced.metaDescription,
      metaKeywords: enhanced.metaKeywords,
      titleVariants: enhanced.titleVariants as unknown as object,
      bulletPoints: enhanced.bulletPoints,
      attributes: enhanced.attributes as unknown as object,
      aiEnhanced: true,
      rewritePending: false,
    },
  })
  await prisma.rewriteJob.update({ where: { id: job.id }, data: { statut: 'fait' } })
}
