import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireAdminPoste } from '../middleware/adminPoste.js'
import { RapportInvalide } from '../services/marketReports.js'
import { enregistrerRapportPoste } from '../services/rapportsPoste.js'

/**
 * L'administration générale du site, tenue par le Poste d'analyses seul (voir
 * `middleware/adminPoste.ts`). Le portique est côté serveur : rien ici ne fait
 * confiance à un navigateur ni à un compte. La liste des vendeurs est de la
 * donnée personnelle, elle ne sort que vers la clé du Poste.
 */
export const adminRouter = Router()

adminRouter.use(rateLimit({ name: 'admin', windowMs: 60_000, max: 120 }))
adminRouter.use(requireAdminPoste)

/** De quoi vérifier la clé fraîchement posée, sans rien écrire : « connecté » = un appel réel réussi. */
adminRouter.get('/moi', (_req, res) => {
  res.json({ ok: true, administrateur: 'poste-analyses' })
})

/** La liste des abonnés à la newsletter, du plus récent au plus ancien. */
adminRouter.get('/newsletter', async (_req, res) => {
  // try/catch obligatoire : sous Express 4, un async qui lève fait PENDRE la
  // requête (panne du 05/09). Une base momentanément injoignable doit rendre un
  // 503 lisible, pas un chargement infini.
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, source: true, createdAt: true },
    })
    res.json({ total: subscribers.length, subscribers })
  } catch (err) {
    console.error('lecture des abonnés newsletter impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

const LIMITE_UTILISATEURS = 500

/**
 * Tous les vendeurs, du plus récent au plus ancien (500 au plus) avec les totaux.
 * Jamais de hachage de mot de passe ni de jeton : seulement ce qu'il faut pour
 * connaître et suivre ses utilisateurs.
 */
adminRouter.get('/utilisateurs', async (_req, res) => {
  try {
    const [total, verifies, utilisateurs, abonnes] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: LIMITE_UTILISATEURS,
        select: { id: true, email: true, shopName: true, plan: true, credits: true, emailVerifiedAt: true, createdAt: true },
      }),
      prisma.newsletterSubscriber.count(),
    ])
    res.json({ total, verifies, abonnesNewsletter: abonnes, limite: LIMITE_UTILISATEURS, utilisateurs })
  } catch (err) {
    console.error('lecture des utilisateurs impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

/**
 * Dépôt d'un rapport MarketSpy complet par le Poste d'analyses (analyses/).
 *
 * C'est CE chemin qui met un rapport en ligne : le site lit rapports.db et la
 * base du Poste (voir services/rapportsPoste.ts). Un seul envoi range le rapport
 * RAYON (analyse + produits) et le rapport MARKETING (prompts, tendances) chacun
 * à sa place. Ces rapports sont lus par tous les vendeurs : clé d'administration
 * seulement.
 */
adminRouter.post('/rapports-poste', (req, res) => {
  const rapport = (req.body as { rapport?: unknown } | undefined)?.rapport
  try {
    const rangé = enregistrerRapportPoste(rapport)
    res.status(201).json({ ok: true, ...rangé })
  } catch (err) {
    if (err instanceof RapportInvalide) return res.status(422).json({ error: err.message })
    console.error('[rapports-poste] écriture impossible :', err)
    res.status(500).json({ error: 'Écriture impossible sur le serveur.', motif: err instanceof Error ? err.message : String(err) })
  }
})
