import { Router } from 'express'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { carteMonde, tableauDeBord } from '../services/statistiques.js'
import { prisma } from '../lib/prisma.js'
import { SUPPLIERS } from '../services/suppliers.js'
import { CANAUX } from '../services/channelDirectory.js'
import { DEPARTMENTS } from '../services/departments.js'

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

/**
 * Les six jauges du bandeau fixe — demandées le 04/09/2026.
 *
 * Chaque jauge dit « fait sur possible » et renvoie vers l'endroit où on
 * agit : annonces publiées, fournisseurs reliés, places de marché
 * connectées, chefs de rayon embauchés, réseaux raccordés — et une jauge
 * d'ensemble, l'utilisation de l'application par rapport à son potentiel.
 *
 * Les dénominateurs sont les VRAIS totaux, comptés dans les catalogues du
 * code, jamais écrits en dur : l'annuaire grandit, la jauge suit. Seuls le
 * plafond d'annonces (l'ordre de grandeur d'un gros catalogue) et les huit
 * réseaux visés sont des choix de produit.
 */
const PLAFOND_ANNONCES = 20000
const RESEAUX_VISES = 8

statsRouter.get('/jauges', async (req: AuthedRequest, res) => {
  const userId = req.userId!
  const [annonces, fournisseurs, marketplaces, agents, sociaux] = await Promise.all([
    prisma.product.count({ where: { userId } }),
    prisma.supplierConnection.count({ where: { userId, connected: true } }),
    prisma.platformCredential.count({ where: { userId, connected: true } }),
    prisma.department.count({ where: { userId } }),
    prisma.socialAccount.count({ where: { userId } }),
  ])

  const jauges = {
    annonces: { fait: annonces, total: PLAFOND_ANNONCES },
    fournisseurs: { fait: fournisseurs, total: SUPPLIERS.length },
    marketplaces: { fait: marketplaces, total: CANAUX.length },
    agents: { fait: agents, total: DEPARTMENTS.length },
    sociaux: { fait: sociaux, total: RESEAUX_VISES },
  }

  /*
   * L'utilisation : la moyenne des cinq taux, sur cent. L'annonce unique ne
   * doit pas noyer le reste — un vendeur à 200 annonces sur 20 000 mais tout
   * relié utilise bien l'application — donc chaque taux est borné à 1 avant
   * la moyenne, et le taux d'annonces est mesuré sur un premier palier de
   * 100 : au-delà, ce bloc-là est considéré rempli.
   */
  const taux = [
    Math.min(1, annonces / 100),
    Math.min(1, fournisseurs / jauges.fournisseurs.total),
    Math.min(1, marketplaces / jauges.marketplaces.total),
    Math.min(1, agents / jauges.agents.total),
    Math.min(1, sociaux / RESEAUX_VISES),
  ]
  const utilisation = Math.round((taux.reduce((s, t) => s + t, 0) / taux.length) * 100)

  res.json({ ...jauges, utilisation })
})

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
