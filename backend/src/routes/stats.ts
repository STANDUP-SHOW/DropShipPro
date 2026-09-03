import { Router } from 'express'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { carteMonde, tableauDeBord } from '../services/statistiques.js'

/**
 * Le tableau de bord statistiques.
 *
 * Une seule adresse rend les quatorze blocs : l'accueil les empile tous, et
 * chaque page de section n'affiche que le sien — même donnée, même calcul,
 * donc jamais deux chiffres différents pour la même chose selon l'écran.
 *
 * La période se choisit par `?du=` et `?au=` (AAAA-MM-JJ). Sans elles : les
 * trente derniers jours, comparés aux trente d'avant.
 */
export const statsRouter = Router()
statsRouter.use(requireAuth)

statsRouter.get('/tableau', async (req: AuthedRequest, res) => {
  const lireDate = (brut: unknown): Date | null => {
    if (typeof brut !== 'string' || !brut) return null
    const d = new Date(brut)
    return Number.isNaN(+d) ? null : d
  }

  const au = lireDate(req.query.au) ?? new Date()
  const du = lireDate(req.query.du) ?? new Date(au.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (du >= au) return res.status(400).json({ error: 'La date de début doit précéder la date de fin.' })

  try {
    const [blocs, carte] = await Promise.all([tableauDeBord(req.userId!, du, au), carteMonde(req.userId!, du, au)])
    res.json({ du: du.toISOString(), au: au.toISOString(), blocs, carte })
  } catch (err) {
    console.error('tableau de bord impossible', err)
    res.status(500).json({ error: "Les statistiques n'ont pas pu être calculées." })
  }
})
