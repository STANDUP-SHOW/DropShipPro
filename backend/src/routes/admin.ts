import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin, type AuthedRequest } from '../middleware/auth.js'

/**
 * Les routes réservées à l'administrateur. Le portique est double et côté
 * serveur : `requireAuth` (jeton valide + compte existant) puis `requireAdmin`
 * (l'email est celui de l'admin). Rien ici ne fait confiance au navigateur.
 */
export const adminRouter = Router()

adminRouter.use(requireAuth, requireAdmin)

/** La liste des abonnés à la newsletter, du plus récent au plus ancien. */
adminRouter.get('/newsletter', async (_req: AuthedRequest, res) => {
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
