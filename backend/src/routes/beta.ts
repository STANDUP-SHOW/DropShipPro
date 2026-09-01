import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { apiBaseUrl } from '../lib/urls.js'
import {
  validerReleve,
  resumeGrille,
  ReleveInvalide,
  type LigneTarif,
} from '../services/printPricing.js'

/**
 * Les chantiers ouverts, derrière un code.
 *
 * **Pourquoi une porte et pas un simple onglet caché.** Ce qu il y a derrière
 * n est pas fini : la boutique d imprimerie repose sur un modèle de prix qui n a
 * jamais servi en vrai, et sur des relevés dont la source juridique n est pas
 * tranchée. Un onglet seulement absent du menu reste appelable par son adresse ;
 * la porte est donc côté serveur, sur chaque requête.
 *
 * Le code vit dans `BETA_CODE`. La valeur par défaut est volontairement faible :
 * ce n est pas un secret, c est un garde-fou contre l ouverture par accident.
 * Elle protège des fonctions inachevées, jamais des données — chaque route
 * exige par ailleurs le compte connecté et filtre sur `userId`.
 */
export const betaRouter = Router()

const CODE = process.env.BETA_CODE || '123456'

betaRouter.use(requireAuth)

/**
 * La porte.
 *
 * Le code voyage dans un en-tête et non dans l URL : une adresse se retrouve
 * dans l historique, dans les journaux du serveur et dans le référent envoyé
 * aux sites tiers.
 */
function porte(req: AuthedRequest): boolean {
  const fourni = req.header('x-beta-code') ?? (req.body as { code?: string })?.code
  return typeof fourni === 'string' && fourni.trim() === CODE
}

/** Vérifie le code sans rien exposer d autre : sert au déverrouillage du menu. */
betaRouter.post('/unlock', (req: AuthedRequest, res) => {
  if (!porte(req)) return res.status(403).json({ error: 'Code incorrect' })
  res.json({ ok: true, modules: ['imprimerie'] })
})

betaRouter.use((req: AuthedRequest, res, next) => {
  if (!porte(req)) return res.status(403).json({ error: "Cette section demande une autorisation spéciale" })
  next()
})

// --- La boutique d imprimerie -----------------------------------------------

/** Ce que la liste montre d une fiche, sans traîner la grille entière. */
function enResume(p: {
  id: string
  name: string
  sourceUrl: string
  sourceRef: string | null
  category: string | null
  images: unknown
  dimensions: unknown
  priceRows: unknown
  marginPercent: number
  shopId: string | null
  active: boolean
  capturedAt: Date | null
  updatedAt: Date
}) {
  const rows = (Array.isArray(p.priceRows) ? p.priceRows : []) as unknown as LigneTarif[]
  const dims = Array.isArray(p.dimensions) ? p.dimensions : []
  const images = Array.isArray(p.images) ? (p.images as string[]) : []

  return {
    id: p.id,
    name: p.name,
    sourceUrl: p.sourceUrl,
    sourceRef: p.sourceRef,
    category: p.category,
    images,
    dimensions: dims.length,
    marginPercent: p.marginPercent,
    shopId: p.shopId,
    active: p.active,
    capturedAt: p.capturedAt,
    updatedAt: p.updatedAt,
    grille: resumeGrille(rows, p.marginPercent),
    /*
     * Ce qui empêche la fiche de partir au flux, dit à l avance.
     *
     * Une fiche inactive sans raison affichée se re-clique cinq fois avant
     * qu on comprenne qu il lui manque une photo.
     */
    manque: [
      rows.length ? null : 'la grille de prix',
      images.length ? null : 'au moins une photo',
      p.shopId ? null : 'une boutique de publication',
    ].filter(Boolean) as string[],
  }
}

betaRouter.get('/print/products', async (req: AuthedRequest, res) => {
  const fiches = await prisma.printProduct.findMany({
    where: { userId: req.userId! },
    orderBy: { updatedAt: 'desc' },
  })
  res.json(fiches.map(enResume))
})

betaRouter.get('/print/products/:id', async (req: AuthedRequest, res) => {
  const fiche = await prisma.printProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' })
  res.json(fiche)
})

const releveSchema = z.object({
  sourceUrl: z.string().url("L'adresse de la fiche source est obligatoire"),
  sourceRef: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  images: z.array(z.string()).optional(),
  dimensions: z.any().optional(),
  priceRows: z.any().optional(),
  rows: z.any().optional(),
})

/**
 * Dépose un relevé.
 *
 * L adresse source fait la clé : relever deux fois la même page **corrige** la
 * grille au lieu d en créer une seconde. Sans cela, rafraîchir les tarifs — ce
 * qu il faudra faire souvent, ils bougent — remplirait la boutique de doublons.
 *
 * Ce qui n est **pas** écrasé par un nouveau relevé : la marge, la boutique, la
 * mise en ligne, et les textes déjà rédigés. Le fournisseur donne les prix ; le
 * reste appartient au vendeur.
 */
betaRouter.post('/print/products', async (req: AuthedRequest, res) => {
  const parsed = releveSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Relevé invalide' })
  }

  let dimensions
  let rows
  try {
    ;({ dimensions, rows } = validerReleve(parsed.data))
  } catch (err) {
    if (err instanceof ReleveInvalide) return res.status(400).json({ error: err.message })
    throw err
  }

  const { sourceUrl, name, description, category, images, sourceRef } = parsed.data
  const existante = await prisma.printProduct.findUnique({
    where: { userId_sourceUrl: { userId: req.userId!, sourceUrl } },
  })

  const donnees = {
    sourceRef: sourceRef ?? null,
    dimensions: dimensions as object,
    priceRows: rows as object,
    capturedAt: new Date(),
  }

  const fiche = existante
    ? await prisma.printProduct.update({
        where: { id: existante.id },
        data: {
          ...donnees,
          // Le titre et les photos ne reviennent que s ils n ont pas été écrits :
          // le vendeur rédige les siens, un rafraîchissement ne doit pas les perdre.
          name: existante.name || name,
          description: existante.description ?? description ?? null,
          category: existante.category ?? category ?? null,
          images: (Array.isArray(existante.images) && existante.images.length
            ? existante.images
            : (images ?? [])) as object,
        },
      })
    : await prisma.printProduct.create({
        data: {
          userId: req.userId!,
          sourceUrl,
          name,
          description: description ?? null,
          category: category ?? null,
          images: (images ?? []) as object,
          ...donnees,
        },
      })

  res.status(existante ? 200 : 201).json({ ...enResume(fiche), remplacee: Boolean(existante) })
})

const majSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  images: z.array(z.string()).optional(),
  marginPercent: z.number().min(0).max(500).optional(),
  shopId: z.string().nullable().optional(),
  active: z.boolean().optional(),
})

betaRouter.patch('/print/products/:id', async (req: AuthedRequest, res) => {
  const parsed = majSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const fiche = await prisma.printProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' })

  // La boutique doit être une des siennes : sans ce contrôle, un identifiant
  // deviné publierait dans le flux d un autre vendeur.
  if (parsed.data.shopId) {
    const sienne = await prisma.shop.findFirst({
      where: { id: parsed.data.shopId, userId: req.userId! },
      select: { id: true },
    })
    if (!sienne) return res.status(400).json({ error: 'Boutique inconnue' })
  }

  const rows = (Array.isArray(fiche.priceRows) ? fiche.priceRows : []) as unknown as LigneTarif[]
  const images = parsed.data.images ?? ((Array.isArray(fiche.images) ? fiche.images : []) as string[])
  const shopId = parsed.data.shopId !== undefined ? parsed.data.shopId : fiche.shopId

  // Mettre en ligne une fiche incomplète produirait un article sans prix ou sans
  // photo dans un flux public : le refus est ici, pas dans un avertissement.
  if (parsed.data.active && (!rows.length || !images.length || !shopId)) {
    return res.status(400).json({
      error: `Impossible de mettre en ligne : il manque ${[
        rows.length ? null : 'la grille de prix',
        images.length ? null : 'au moins une photo',
        shopId ? null : 'une boutique de publication',
      ]
        .filter(Boolean)
        .join(', ')}.`,
    })
  }

  const maj = await prisma.printProduct.update({
    where: { id: fiche.id },
    data: { ...parsed.data, images: images as object },
  })
  res.json(enResume(maj))
})

betaRouter.delete('/print/products/:id', async (req: AuthedRequest, res) => {
  const fiche = await prisma.printProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true },
  })
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' })
  await prisma.printProduct.delete({ where: { id: fiche.id } })
  res.status(204).send()
})

/**
 * L état de la boutique d imprimerie, et l adresse de son flux.
 *
 * Une adresse par boutique : c est la même règle que pour le catalogue, et pour
 * la même raison — un vendeur qui tient deux sites ne leur sert pas le même
 * assortiment.
 */
betaRouter.get('/print/overview', async (req: AuthedRequest, res) => {
  const [boutiques, fiches] = await Promise.all([
    prisma.shop.findMany({
      where: { userId: req.userId! },
      select: { id: true, name: true, shopKey: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.printProduct.findMany({
      where: { userId: req.userId! },
      select: { shopId: true, active: true, priceRows: true },
    }),
  ])

  const base = apiBaseUrl(req)
  res.json({
    boutiques: boutiques.map((b) => ({
      ...b,
      feedUrl: `${base}/api/public/print/${b.shopKey}/products`,
      enLigne: fiches.filter((f) => f.shopId === b.id && f.active).length,
    })),
    total: fiches.length,
    enLigne: fiches.filter((f) => f.active).length,
    lignesTarifaires: fiches.reduce(
      (n, f) => n + (Array.isArray(f.priceRows) ? f.priceRows.length : 0),
      0,
    ),
  })
})

/** Un exemple de relevé, servi pour que le format ne s apprenne pas par essais. */
betaRouter.get('/print/format', (_req, res) => {
  res.json({
    sourceUrl: 'https://www.exemple.fr/cartes-de-visite/standard/',
    sourceRef: '835',
    name: 'Cartes de visite classiques',
    category: 'Papeterie > Cartes de visite',
    images: ['https://…/ma-photo.jpg'],
    dimensions: [
      { cle: 'grammage', libelle: 'Grammage', options: [{ valeur: '250' }, { valeur: '350' }] },
      { cle: 'orientation', libelle: 'Orientation', options: [{ valeur: 'horizontale' }] },
    ],
    priceRows: [
      { combo: { grammage: '250', orientation: 'horizontale' }, quantite: 100, delaiJours: 5, prixHt: 19.9 },
      { combo: { grammage: '350', orientation: 'horizontale' }, quantite: 500, delaiJours: 2, prixHt: 48.5 },
    ],
  })
})
