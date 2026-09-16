import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { reserveCredits, refundCredits } from '../services/billing.js'
import { DROPS } from '../services/tarifs.js'
import { fournisseursRelies } from '../services/supplierConnectors.js'
import { SupplierError } from '../services/supplierTypes.js'
import {
  analyserBoutiques,
  analyserFournisseurs,
  analyserMarketplaces,
  analyserPublicites,
  type OffreFournisseur,
  type SujetAnalyse,
} from '../services/marketStudio.js'

/**
 * Le studio d'analyses : quatre volets, une seule porte.
 *
 * **Une route et un discriminant plutôt que quatre routes.** Ce qui varie d'un
 * volet à l'autre est l'analyse elle-même ; ce qui ne varie pas — résoudre le
 * sujet, réserver les drops, consigner le rapport, rendre les drops en cas
 * d'échec — est exactement ce qu'on oublie de refaire pareil quand on le
 * recopie quatre fois. Le tarif d'un volet vit donc à UN endroit, et un volet
 * ajouté demain hérite de la facturation sans qu'on y pense.
 *
 * **Le sujet n'est pas forcément une annonce.** Le vendeur analyse le plus
 * souvent AVANT d'importer — c'est même le bon ordre, et c'est tout l'intérêt :
 * découvrir qu'une niche est saturée coûte alors une analyse, pas un catalogue.
 * Une annonce de son catalogue remplit simplement l'intitulé et les deux prix.
 */
export const studioRouter = Router()
studioRouter.use(requireAuth)

const VOLETS = ['marketplaces', 'publicites', 'boutiques', 'fournisseurs'] as const
type Volet = (typeof VOLETS)[number]

/** Ce que coûte chaque volet, en drops. Un seul endroit, comme le reste du barème. */
const TARIF: Record<Volet, number> = {
  marketplaces: DROPS.analyse,
  publicites: DROPS.analyseSociale,
  boutiques: DROPS.analyse,
  /*
   * Gratuit, et ce n'est pas un oubli : ce volet n'appelle aucun modèle. Les
   * chiffres viennent des API des fournisseurs du vendeur et la synthèse se
   * calcule. Facturer un travail que nous ne payons pas serait exactement ce
   * que le modèle « prix = 5 × coût réel » interdit.
   */
  fournisseurs: 0,
}

const NOM: Record<Volet, string> = {
  marketplaces: 'Places de marché',
  publicites: 'Publicités concurrentes',
  boutiques: 'Boutiques comparables',
  fournisseurs: 'Comparaison fournisseurs',
}

const schema = z.object({
  volet: z.enum(VOLETS),
  /** Les mots du vendeur. Ignoré quand une annonce est désignée. */
  intitule: z.string().trim().min(2).max(200).optional(),
  /** Une annonce de son catalogue, qui donne l'intitulé et les deux prix. */
  productId: z.string().trim().min(1).optional(),
  /** Le marché visé. Deux lettres, majuscules imposées en aval. */
  pays: z.string().trim().length(2).optional(),
})

/** Les tarifs, pour que l'écran annonce le prix AVANT le clic. */
studioRouter.get('/tarifs', (_req, res) => {
  res.json({
    volets: VOLETS.map((v) => ({ id: v, label: NOM[v], drops: TARIF[v] })),
    euroParDrop: 0.01,
  })
})

studioRouter.post('/analyse', async (req: AuthedRequest, res) => {
  const lu = schema.safeParse(req.body)
  if (!lu.success) {
    return res.status(400).json({ error: 'Choisissez un volet et indiquez ce que vous voulez analyser.' })
  }

  const { volet } = lu.data
  const pays = (lu.data.pays ?? 'FR').toUpperCase()

  /*
   * Le sujet, résolu avant toute dépense. Une annonce désignée fait foi sur
   * l'intitulé : c'est son titre réécrit qui décrit le produit, pas la mémoire
   * qu'en a le vendeur au moment de taper.
   */
  let sujet: SujetAnalyse
  if (lu.data.productId) {
    const annonce = await prisma.product.findFirst({
      where: { id: lu.data.productId, userId: req.userId! },
      select: { title: true, aiTitle: true, price: true, shippingCost: true, sellingPrice: true },
    })
    if (!annonce) return res.status(404).json({ error: "Cette annonce ne vous appartient pas." })
    sujet = {
      intitule: annonce.aiTitle || annonce.title,
      pays,
      achat: Number(annonce.price) + Number(annonce.shippingCost),
      vente: Number(annonce.sellingPrice),
    }
  } else if (lu.data.intitule) {
    sujet = { intitule: lu.data.intitule, pays }
  } else {
    return res.status(400).json({ error: 'Indiquez un produit ou des mots-clés à analyser.' })
  }

  const cout = TARIF[volet]
  if (cout > 0) {
    const credit = await reserveCredits(req.userId!, cout, `Analyse — ${NOM[volet]}`)
    // `reserveCredits` débite PARTIELLEMENT (c'est fait pour les lots) : un prix
    // fixe doit vérifier qu'il a eu son compte, et rendre le partiel sinon.
    if (!credit.ok || credit.allowed !== cout) {
      if (credit.allowed) await refundCredits(req.userId!, credit.allowed)
      return res.status(402).json({ error: credit.reason ?? 'Solde de drops insuffisant.' })
    }
  }

  try {
    const resultat =
      volet === 'fournisseurs'
        ? await comparerFournisseurs(req.userId!, sujet)
        : volet === 'marketplaces'
          ? await analyserMarketplaces(sujet)
          : volet === 'publicites'
            ? await analyserPublicites(sujet)
            : await analyserBoutiques(sujet)

    // La consignation ne doit jamais faire échouer l'analyse déjà payée.
    await consigner(req.userId!, volet, sujet, resultat).catch((err) =>
      console.error('[studio] consignation', volet, err),
    )

    res.json({ volet, sujet, resultat, drops: cout })
  } catch (err) {
    if (cout > 0) await refundCredits(req.userId!, cout, `Analyse ${NOM[volet]} — échec`)
    console.error('[studio]', volet, err)
    res.status(502).json({
      error: err instanceof Error ? err.message : "L'analyse n'a pas abouti. Rien ne vous a été facturé.",
    })
  }
})

/**
 * Interroge tous les fournisseurs reliés pour la même référence.
 *
 * **Chaque fournisseur porte son propre sort**, comme dans les catalogues
 * connectés : une clé refusée chez l'un ne prive pas le vendeur des deux
 * autres, et le refus est transmis tel quel — « Invalid Token » dit quoi
 * corriger, « erreur » ne dit rien.
 */
async function comparerFournisseurs(userId: string, sujet: SujetAnalyse) {
  const relies = await fournisseursRelies(prisma, userId)

  const offres: OffreFournisseur[] = []
  const refus: Array<{ fournisseur: string; raison: string }> = []

  await Promise.all(
    relies.map(async (f) => {
      if (!f.connecteur.searchProducts) {
        refus.push({ fournisseur: f.label, raison: 'ne sait pas chercher par mots-clés' })
        return
      }
      try {
        const trouves = await f.connecteur.searchProducts(sujet.intitule, f.creds)
        for (const t of trouves.slice(0, 10)) {
          offres.push({ ...t, fournisseur: f.id, fournisseurLabel: f.label })
        }
      } catch (err) {
        refus.push({
          fournisseur: f.label,
          raison: err instanceof SupplierError ? err.message : 'injoignable',
        })
      }
    }),
  )

  return analyserFournisseurs(sujet, offres, refus)
}

/**
 * Range l'analyse dans « Mes analyses », la même liste que les rapports des
 * chefs de rayon en AUTO-MODE. Une écriture, deux vitrines — et le vendeur
 * retrouve ce qu'il a payé même s'il a fermé l'onglet.
 */
async function consigner(
  userId: string,
  volet: Volet,
  sujet: SujetAnalyse,
  resultat: { synthese?: string },
): Promise<void> {
  const moi = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const utilisateur = (moi?.email ?? 'vendeur').split('@')[0]
  const jour = new Date().toISOString().slice(0, 10)

  await prisma.report.create({
    data: {
      userId,
      section: 'MARKET',
      day: jour,
      title: `${NOM[volet]} — ${sujet.intitule}`.slice(0, 180),
      body: `## ${NOM[volet]} — ${sujet.intitule}\n\nMarché : ${sujet.pays}\n\n${resultat.synthese ?? ''}`.trim(),
      summary: { studio: volet, sujet: sujet.intitule, pays: sujet.pays, redacteur: utilisateur },
    },
  })
}
