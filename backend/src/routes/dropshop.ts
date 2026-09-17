import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { apiBaseUrl } from '../lib/urls.js'
import { ADMIN_EMAIL, requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { BOUTIQUE_MODIFS_INCLUSES, DROPS } from '../services/tarifs.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { SiteImpossible } from '../services/siteGenerator.js'
import { catalogueDe as catalogueExtensionsDe, desinstallerExtension, ExtensionRefusee, installerExtension } from '../services/extensions.js'
import {
  directionsPour,
  gammesPour,
  lancerCreation,
  lancerModification,
  restaurerVersion,
  travailOuvert,
  TravailRefuse,
} from '../services/dropshopJobs.js'

/**
 * DropShop IA : le studio du vendeur — créer sa boutique, la modifier par
 * demandes, revenir à une version, brancher Stripe.
 *
 * Tout ce qui écrit par le modèle passe par `dropshopJobs` (202 + état relu),
 * parce qu'un travail dure des minutes. Le reste est immédiat.
 */
export const dropshopRouter = Router()
dropshopRouter.use(requireAuth)

async function boutiqueDe(req: AuthedRequest) {
  const shop = await prisma.shop.findFirst({ where: { id: req.params.shopId, userId: req.userId! } })
  return shop
}

function refus(res: import('express').Response, e: unknown) {
  if (e instanceof TravailRefuse) return res.status(e.status).json({ error: e.message })
  console.error('[dropshop] route', e instanceof Error ? e.message : e)
  return res.status(500).json({ error: 'Le service a rencontré un problème. Réessayez.' })
}

dropshopRouter.get('/:shopId', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const travail = await travailOuvert(shop)
  const versions = await prisma.siteVersion.findMany({
    where: { shopId: shop.id },
    orderBy: { numero: 'desc' },
    take: 30,
    select: { numero: true, demande: true, modele: true, createdAt: true },
  })
  // Le dernier travail clos reste lisible (résumé, erreur) tant qu'un autre n'a pas commencé.
  const dernier = shop.siteJob && typeof shop.siteJob === 'object' ? { ...(shop.siteJob as Record<string, unknown>) } : null
  // Ce que le travail NOUS a coûté ne regarde que l'administrateur.
  const compte = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } })
  if (dernier && compte?.email.trim().toLowerCase() !== ADMIN_EMAIL) {
    delete dernier.cout
    delete dernier.jetons
  }
  res.json({
    id: shop.id,
    nom: shop.name,
    slug: shop.slug,
    adresse: shop.slug ? `${apiBaseUrl(req)}/b/${shop.slug}` : null,
    creee: Boolean(shop.siteHtml),
    version: shop.siteVersion,
    brief: shop.siteBrief,
    modifsRestantes: shop.siteModifsRestantes,
    stripe: Boolean(shop.stripeSecretKey),
    travail: travail ?? (dernier && dernier.fin ? dernier : null),
    versions,
    tarifs: { creation: DROPS.boutiqueCreation, modification: DROPS.boutiqueModification, incluses: BOUTIQUE_MODIFS_INCLUSES },
  })
})

/**
 * Les couleurs du logo et les gammes qu'on en tire, pour l'écran « adapter la
 * boutique aux couleurs de votre logo ? ». Sans logo : gammes neutres, `logo: false`.
 */
dropshopRouter.get('/:shopId/gammes', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  res.json(await gammesPour(shop))
})

const couleur = z.string().regex(/^(#[0-9a-fA-F]{6}|rgba?\([^)]{1,40}\))$/, 'Couleur invalide')
const paletteSchema = z.object({ fond: couleur, surface: couleur, texte: couleur, sourd: couleur, accent: couleur, accent2: couleur, ligne: couleur })
const gammeSchema = z.object({ nom: z.string().trim().min(1).max(40), mode: z.enum(['sombre', 'clair']), jetons: paletteSchema })
const directionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  titre: z.string().trim().min(1).max(60),
  concept: z.string().trim().max(400),
  ambiance: z.enum(['sombre', 'clair']),
  matiere: z.enum(['nuit', 'bois', 'papier', 'metal', 'beton', 'velours']),
  palette: paletteSchema,
  polices: z.object({ titre: z.string().trim().min(1).max(60), texte: z.string().trim().min(1).max(60) }),
  hero: z.string().trim().max(400),
  boutons: z.string().trim().max(300),
  sections: z.array(z.string().trim().max(80)).max(8),
})
const briefSchema = z.object({
  description: z.string().trim().min(20, 'Décrivez la boutique en quelques phrases (20 caractères au moins).').max(4000),
  gamme: gammeSchema.nullable().optional(),
  modesVisiteur: z.boolean().optional(),
  direction: directionSchema.nullable().optional(),
})

/**
 * Trois directions artistiques pour ce brief, en ~25 s, gratuites : le
 * marchand choisit AVANT que la boutique soit écrite (ce que Lovable fait).
 * Bornées à dix par heure et par compte : c'est un appel au modèle.
 */
dropshopRouter.post('/:shopId/directions', rateLimit({ name: 'dropshop-directions', windowMs: 3600_000, max: 10 }), async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const parsed = briefSchema.pick({ description: true, gamme: true }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Brief invalide' })
  try {
    const directions = await directionsPour(shop, parsed.data.description, { gamme: parsed.data.gamme ?? null })
    res.json({ directions })
  } catch (e) {
    if (e instanceof SiteImpossible) return res.status(502).json({ error: e.message })
    refus(res, e)
  }
})

dropshopRouter.post('/:shopId/creer', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const parsed = briefSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Brief invalide' })
  try {
    const etat = await lancerCreation(shop, parsed.data.description, {}, { gamme: parsed.data.gamme ?? null, modesVisiteur: Boolean(parsed.data.modesVisiteur), direction: parsed.data.direction ?? null })
    res.status(202).json({ travail: etat })
  } catch (e) {
    refus(res, e)
  }
})

const demandeSchema = z.object({ demande: z.string().trim().min(3, 'Dites ce que vous voulez changer.').max(2000) })

dropshopRouter.post('/:shopId/modifier', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const parsed = demandeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Demande invalide' })
  try {
    const etat = await lancerModification(shop, parsed.data.demande)
    res.status(202).json({ travail: etat })
  } catch (e) {
    refus(res, e)
  }
})

dropshopRouter.post('/:shopId/restaurer/:numero', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const numero = Number(req.params.numero)
  if (!Number.isInteger(numero) || numero < 1) return res.status(400).json({ error: 'Numéro de version invalide' })
  try {
    const version = await restaurerVersion(shop, numero)
    res.json({ ok: true, version })
  } catch (e) {
    refus(res, e)
  }
})

/** Retire la boutique IA : la vitrine à thèmes reprend. Les versions restent, pour la remettre. */
dropshopRouter.delete('/:shopId', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  if (await travailOuvert(shop)) return res.status(409).json({ error: 'Un travail est en cours sur cette boutique.' })
  await prisma.shop.update({ where: { id: shop.id }, data: { siteHtml: null } })
  res.json({ ok: true })
})

/* ---------- Les extensions : catalogue, installation (payée), retrait ---------- */

dropshopRouter.get('/:shopId/extensions', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  res.json({ extensions: await catalogueExtensionsDe(shop), adresseAdmin: shop.slug ? `${apiBaseUrl(req)}/b/${shop.slug}/admin` : null })
})

const installationSchema = z.object({ champs: z.record(z.string().max(200)).default({}) })

dropshopRouter.post('/:shopId/extensions/:extensionId', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const parsed = installationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })
  try {
    const inst = await installerExtension(shop, req.params.extensionId, parsed.data.champs)
    res.status(201).json({ ok: true, ...inst, adresseAdmin: shop.slug ? `${apiBaseUrl(req)}/b/${shop.slug}/admin` : null })
  } catch (e) {
    if (e instanceof ExtensionRefusee) return res.status(e.status).json({ error: e.message })
    refus(res, e)
  }
})

dropshopRouter.delete('/:shopId/extensions/:extensionId', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const ok = await desinstallerExtension(shop, req.params.extensionId)
  if (!ok) return res.status(404).json({ error: "Cette extension n'est pas installée." })
  res.json({ ok: true })
})

/**
 * La clé Stripe du marchand. Collée par lui, vérifiée par sa forme, jamais
 * relue : l'écran ne sait que « branchée » ou « pas branchée ».
 */
const stripeSchema = z.object({
  secretKey: z
    .string()
    .trim()
    .regex(/^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/, 'Ce n\'est pas une clé secrète Stripe (elle commence par sk_live_ ou sk_test_).'),
})

dropshopRouter.put('/:shopId/stripe', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  const parsed = stripeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Clé invalide' })
  await prisma.shop.update({ where: { id: shop.id }, data: { stripeSecretKey: parsed.data.secretKey } })
  res.json({ ok: true, test: parsed.data.secretKey.includes('_test_') })
})

dropshopRouter.delete('/:shopId/stripe', async (req: AuthedRequest, res) => {
  const shop = await boutiqueDe(req)
  if (!shop) return res.status(404).json({ error: 'Boutique introuvable' })
  await prisma.shop.update({ where: { id: shop.id }, data: { stripeSecretKey: null } })
  res.json({ ok: true })
})
