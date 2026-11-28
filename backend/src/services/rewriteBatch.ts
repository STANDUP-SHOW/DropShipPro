import Anthropic from '@anthropic-ai/sdk'
import { cleIA, clientIA } from './ia.js'
import { prisma } from '../lib/prisma.js'
import { refundCredits } from './billing.js'
import { avecContexteIA, noterResultatLot } from './journalIA.js'
import { construireRequete, enhanceListing, interpreter, passthroughDe, type EnhancedListing, type EntreeReecriture } from './aiEnhancer.js'

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
  if (!cleIA()) return null
  if (!client) client = clientIA()
  return client
}

/** Le plafond d'un batch : large, mais borné — Anthropic accepte bien plus. */
const PAR_BATCH = 100

/** Passages au batch avant d'abandonner une réécriture (et de rendre le crédit). */
export const TENTATIVES_MAX = 3

export interface ClientBatch {
  messages: {
    batches: {
      create(body: { requests: Array<{ custom_id: string; params: unknown }> }): Promise<{ id: string }>
      retrieve(id: string): Promise<{ processing_status: string }>
      cancel?(id: string): Promise<unknown>
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
export async function tourneeReecritures(
  injecte?: ClientBatch,
  seulement?: string,
  direct: (entree: EntreeReecriture) => Promise<EnhancedListing> = enhanceListing,
): Promise<void> {
  const c = (injecte ?? defautClient()) as ClientBatch | null
  if (!c) return
  await soumettreEnAttente(c, seulement).catch((err) =>
    console.error('reecriture batch : soumission impossible', err instanceof Error ? err.message : err),
  )
  await appliquerFinis(c, seulement)
  await finirEnDirect(seulement, direct, c)
}

/**
 * Au-delà de ce délai, une réécriture n'attend plus le batch.
 *
 * 21/11/2026 : cinq annonces d'un lot sont restées « en réécriture » une
 * demi-heure. Le batch d'Anthropic rend « en secondes à minutes », mais sans
 * promesse : il peut aussi prendre des heures, ou ne jamais partir si la
 * soumission échoue. Un vendeur ne doit pas attendre ça. Passé ce délai, la
 * réécriture est faite par un appel direct (prix plein, une fois), et l'annonce
 * finit réécrite ou en échec visible, jamais suspendue.
 */
export const DELAI_BATCH_MS = 5 * 60_000

async function finirEnDirect(
  seulement: string | undefined,
  direct: (entree: EntreeReecriture) => Promise<EnhancedListing>,
  c?: ClientBatch,
): Promise<void> {
  const enRetard = await prisma.rewriteJob.findMany({
    where: {
      OR: [
        { statut: { in: ['en_attente', 'soumis'] }, createdAt: { lt: new Date(Date.now() - DELAI_BATCH_MS) } },
        // Un appel direct interrompu (redémarrage du serveur) est repris plus tard.
        { statut: 'direct', createdAt: { lt: new Date(Date.now() - 6 * DELAI_BATCH_MS) } },
      ],
      ...(seulement ? { userId: seulement } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })
  /*
   * 28/11/2026 : un job « soumis » repris en direct restait aussi dans son
   * batch, qui finissait par être facturé — la même réécriture payée deux fois
   * (moitié prix + prix plein), le résultat du batch ignoré. Le batch est donc
   * annulé avant l'appel direct : ce qu'Anthropic n'a pas encore traité n'est
   * pas facturé.
   */
  const aAnnuler = [...new Set(enRetard.filter((j) => j.statut === 'soumis' && j.batchId).map((j) => j.batchId as string))]
  for (const id of aAnnuler) {
    await c?.messages.batches.cancel?.(id).catch((err) =>
      console.error(`reecriture batch : annulation de ${id} impossible`, err instanceof Error ? err.message : err),
    )
  }
  for (const job of enRetard) {
    // Réservé avant l'appel : un résultat de batch arrivé entre-temps ne s'appliquera pas deux fois.
    const pris = await prisma.rewriteJob.updateMany({
      where: { id: job.id, statut: job.statut },
      data: { statut: 'direct' },
    })
    if (!pris.count) continue
    const entree = job.entree as unknown as EntreeReecriture & { _cout?: number }
    let enhanced: EnhancedListing
    try {
      enhanced = await avecContexteIA({ userId: job.userId, fonction: 'rewriteBatch.direct' }, () => direct(entree))
    } catch (err) {
      enhanced = { ...passthroughDe(entree), raison: err instanceof Error ? err.message : 'appel impossible' }
    }
    if (enhanced.enhanced) {
      await appliquerReecriture(job.id, job.productId, enhanced)
    } else {
      await echecDefinitif(job.id, job.userId, job.productId, entree._cout, `appel direct : ${enhanced.raison ?? 'sans réponse'}`)
    }
  }
}

async function appliquerReecriture(jobId: string, productId: string, enhanced: EnhancedListing): Promise<void> {
  await prisma.product.update({
    where: { id: productId },
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
  await prisma.rewriteJob.update({ where: { id: jobId }, data: { statut: 'fait' } })
}

/** Texte source gardé, drapeau « en cours » levé, crédit pris rendu (1 pour les anciennes entrées). */
async function echecDefinitif(jobId: string, userId: string, productId: string, cout: number | undefined, raison: string): Promise<void> {
  await prisma.product.update({ where: { id: productId }, data: { rewritePending: false } }).catch(() => undefined)
  const rendu = cout ?? 1
  if (rendu > 0) await refundCredits(userId, rendu).catch(() => undefined)
  await prisma.rewriteJob.update({ where: { id: jobId }, data: { statut: 'echec' } })
  console.error(`reecriture : ${productId} non réécrit (${raison}), ${rendu} drop(s) rendu(s)`)
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
    // Only fresh jobs: an older one goes straight to the direct call in the same
    // round (finirEnDirect), and batching it too paid it twice (28/11/2026).
    where: { statut: 'en_attente', createdAt: { gte: new Date(Date.now() - DELAI_BATCH_MS) }, ...(seulement ? { userId: seulement } : {}) },
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
    /*
     * Lot Gemini perdu (résultats gardés en mémoire, serveur redémarré entre
     * la soumission et la lecture) : les annonces repartent au lot suivant.
     * Le crédit déjà réservé reste attaché à l'annonce, rendu si elle échoue pour de bon.
     */
    if (etat.processing_status === 'perdu') {
      const remis = await prisma.rewriteJob.updateMany({
        where: { statut: 'soumis', batchId, ...(seulement ? { userId: seulement } : {}) },
        data: { statut: 'en_attente', batchId: null },
      })
      console.error(`reecriture batch : lot ${batchId} perdu au redémarrage, ${remis.count} annonce(s) remise(s) en attente`)
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
  // Billed by Anthropic whatever we do with it: journaled before any filter.
  if (ligne.result.type === 'succeeded' && (!seulement || job?.userId === seulement)) {
    await noterResultatLot(job?.userId ?? null, ligne.result.message)
  }
  if (!job || job.statut !== 'soumis') return
  // Périmètre du banc : ne jamais toucher un job hors du compte visé.
  if (seulement && job.userId !== seulement) return

  const entree = job.entree as unknown as EntreeReecriture & { _cout?: number; _tentatives?: number }

  const echouer = async (raison: string) => {
    /*
     * Un échec SANS réponse (erreur, expiration, annulation : rien de facturé) n'est pas
     * définitif : la même entrée repart au batch suivant, jusqu'à
     * TENTATIVES_MAX passages (21/11/2026 : l'annonce restait brute et le
     * vendeur devait la réimporter à la main). Le compteur voyage dans
     * l'entrée, sans colonne de plus.
     */
    const tentatives = (entree._tentatives ?? 1) + 1
    if (tentatives <= TENTATIVES_MAX) {
      await prisma.rewriteJob.update({
        where: { id: job.id },
        data: { statut: 'en_attente', batchId: null, entree: { ...entree, _tentatives: tentatives } as object },
      })
      console.error(`reecriture batch : ${job.productId} non réécrit (${raison}), relancé (passage ${tentatives}/${TENTATIVES_MAX})`)
      return
    }
    await echecDefinitif(job.id, job.userId, job.productId, entree._cout, `batch : ${raison}`)
  }

  if (ligne.result.type !== 'succeeded') {
    await echouer(ligne.result.type)
    return
  }

  const enhanced = interpreter(ligne.result.message, entree)
  if (!enhanced.enhanced) {
    /*
     * Le modèle a répondu : la réponse est PAYÉE, même inutilisable. La
     * relancer refaisait payer la même entrée jusqu'à trois fois (et chaque
     * relance, déjà vieille de plus de cinq minutes, partait en plus en appel
     * direct au prix plein) pour la même réponse. Échec définitif, crédit
     * rendu, une seule facture (28/11/2026).
     */
    await echecDefinitif(job.id, job.userId, job.productId, entree._cout, `batch : ${enhanced.raison ?? 'réponse illisible'}`)
    return
  }

  await appliquerReecriture(job.id, job.productId, enhanced)
}
