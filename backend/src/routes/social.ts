import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  comptesDe,
  creerCampagne,
  lienDeConnexion,
  listerCampagnes,
  publier,
  socialConfigure,
  synchroniserComptes,
} from '../services/socialGateway.js'
import { REGIES, RESEAUX, SocialError } from '../services/socialTypes.js'

/**
 * Le raccordement aux réseaux sociaux et aux régies publicitaires.
 *
 * Les erreurs du moteur remontent en 400 avec leur message : `SocialError` sait
 * déjà si le vendeur peut corriger lui-même. Un 500 avec « erreur interne »
 * l'aurait laissé sans rien à faire.
 */
export const socialRouter = Router()
socialRouter.use(requireAuth)

/** Traduit un refus du moteur en réponse lisible. */
function repondreErreur(res: Parameters<typeof socialRouter.get>[1] extends never ? never : any, err: unknown) {
  if (err instanceof SocialError) {
    return res.status(err.actionnable ? 400 : 503).json({ error: err.message, actionnable: err.actionnable })
  }
  console.error('passerelle sociale', err)
  return res.status(500).json({ error: "Le raccordement social n'a pas répondu." })
}

/** L'état du module, et ce qu'on peut y raccorder. */
socialRouter.get('/state', async (req: AuthedRequest, res) => {
  const comptes = await comptesDe(req.userId!)
  res.json({
    configure: socialConfigure(),
    reseaux: RESEAUX,
    regies: REGIES,
    comptes: comptes.map((c) => ({
      id: c.id,
      externalId: c.externalId,
      platform: c.platform,
      label: c.label,
      connected: c.connected,
      isAdAccount: c.isAdAccount,
    })),
  })
})

/** Relit les comptes chez le moteur : un compte révoqué se voit ici. */
socialRouter.post('/sync', async (req: AuthedRequest, res) => {
  try {
    const comptes = await synchroniserComptes(req.userId!)
    res.json({ comptes: comptes.length })
  } catch (err) {
    repondreErreur(res, err)
  }
})

const connexion = z.object({
  platform: z.string().trim().min(2).max(30),
  /** Où le vendeur revient une fois l'autorisation donnée. */
  retour: z.string().trim().url(),
})

/**
 * L'adresse où envoyer le vendeur pour raccorder un compte.
 *
 * En marque blanche : il s'authentifie chez Meta ou TikTok, jamais chez le
 * moteur. Le jeton ne passe donc jamais par nous — ce qui distingue ce
 * raccordement d'un mot de passe confié à un tiers.
 */
socialRouter.post('/connect', async (req: AuthedRequest, res) => {
  const parsed = connexion.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Plateforme ou adresse de retour invalide' })

  try {
    res.json({ url: await lienDeConnexion(req.userId!, parsed.data.platform, parsed.data.retour) })
  } catch (err) {
    repondreErreur(res, err)
  }
})

const publication = z.object({
  comptes: z.array(z.string().trim().min(1)).min(1).max(20),
  texte: z.string().trim().min(1).max(5000),
  medias: z.array(z.string().trim().url()).max(10).optional(),
  quand: z.string().datetime().optional(),
})

socialRouter.post('/posts', async (req: AuthedRequest, res) => {
  const parsed = publication.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Publication invalide' })

  try {
    res.json(
      await publier(req.userId!, {
        comptes: parsed.data.comptes,
        texte: parsed.data.texte,
        medias: parsed.data.medias,
        quand: parsed.data.quand ? new Date(parsed.data.quand) : null,
      }),
    )
  } catch (err) {
    repondreErreur(res, err)
  }
})

const campagne = z.object({
  compte: z.string().trim().min(1),
  nom: z.string().trim().min(1).max(120),
  objectif: z.enum(['trafic', 'notoriete', 'conversions', 'engagement']),
  /** En centimes : un budget en euros à virgule se perd d'une régie à l'autre. */
  budgetJour: z.number().int().min(100).max(1000000),
  creative: z.object({
    image: z.string().trim().url(),
    titre: z.string().trim().min(1).max(120),
    texte: z.string().trim().min(1).max(600),
    url: z.string().trim().url(),
    boutonLabel: z.string().trim().max(30).optional(),
  }),
  ciblage: z
    .object({
      paysCodes: z.array(z.string().trim().length(2)).max(20).optional(),
      ageMin: z.number().int().min(13).max(65).optional(),
      ageMax: z.number().int().min(13).max(65).optional(),
    })
    .optional(),
})

socialRouter.post('/campaigns', async (req: AuthedRequest, res) => {
  const parsed = campagne.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Campagne invalide' })

  try {
    res.status(201).json(await creerCampagne(req.userId!, parsed.data))
  } catch (err) {
    repondreErreur(res, err)
  }
})

socialRouter.get('/campaigns', async (req: AuthedRequest, res) => {
  try {
    res.json(await listerCampagnes(req.userId!))
  } catch (err) {
    repondreErreur(res, err)
  }
})
