import { Router } from 'express'
import { z } from 'zod'
import type { Product } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireApiKey, type AgentRequest } from '../middleware/apiKey.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { marketUrl, offresDe } from '../services/market.js'

/**
 * DropShop Market par API, pour le vendeur qui n'a pas de boutique DropShop.
 *
 * Décision de Max (12/10/2026) : un produit de boutique part tout seul sur le
 * Market ; l'outil « publier sur le Market » ne sert qu'à ceux qui n'en ont pas,
 * et ils s'y branchent par API. La clé est la même que celle des agents
 * (Réglages › Clés API, `dsp_live_…`) : elle n'ouvre que ces routes et /api/agent,
 * jamais le paiement ni le compte.
 *
 *   GET    /api/market/v1/annonces                 ses annonces sur le Market
 *   POST   /api/market/v1/annonces                 crée ou met à jour une annonce (par `reference`)
 *   POST   /api/market/v1/publier                  met sur le Market des produits déjà au catalogue
 *   DELETE /api/market/v1/annonces/:reference      retire l'annonce
 *
 * Une annonce retirée par la modération ne se republie pas par ici : la ligne
 * FAILED reste, et la réponse le dit.
 */
export const marketCleRouter = Router()

marketCleRouter.use(rateLimit({ name: 'market-api', windowMs: 60_000, max: 120 }))
marketCleRouter.use(requireApiKey)

/** La référence du vendeur devient la source du produit : c'est elle qui rend la création idempotente. */
const sourceDe = (reference: string) => `api://${reference}`

const MODERATION = 'Retirée de DropShop Market par la modération'

function retireeParModeration(p: { status: string; error: string | null } | null | undefined) {
  return p?.status === 'FAILED' && Boolean(p.error?.startsWith(MODERATION))
}

function vue(product: Product, publication: { status: string; error: string | null; publishedAt: Date | null } | null) {
  const offres = offresDe(product)
  return {
    productId: product.id,
    reference: product.sourceUrl.startsWith('api://') ? product.sourceUrl.slice(6) : null,
    titre: product.aiTitle || product.title,
    prix: Number(product.sellingPrice),
    statut: publication?.status ?? 'ABSENT',
    erreur: publication?.error ?? null,
    publieeLe: publication?.publishedAt ?? null,
    url: publication?.status === 'PUBLISHED' && offres.length ? `${marketUrl()}${offres[0].cheminProduit}` : null,
    variantes: offres.filter((o) => o.cle).length,
  }
}

marketCleRouter.get('/annonces', async (req: AgentRequest, res) => {
  try {
    const publications = await prisma.publication.findMany({
      where: { platform: 'DROPSHOP_MARKET', product: { userId: req.userId! } },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    res.json({ count: publications.length, annonces: publications.map((p) => vue(p.product, p)) })
  } catch (err) {
    console.error('[market-api] liste', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Lecture des annonces impossible.', motif: 'liste' })
  }
})

const annonceSchema = z.object({
  reference: z.string().trim().min(1).max(120).regex(/^[\w.\-:/]+$/, 'lettres, chiffres, . - _ : / seulement'),
  titre: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(20_000),
  prix: z.number().positive().max(100_000),
  images: z.array(z.string().url().regex(/^https?:\/\//)).min(1).max(12),
  ean: z.string().trim().regex(/^\d{8,14}$/).optional(),
})

marketCleRouter.post('/annonces', async (req: AgentRequest, res) => {
  const parsed = annonceSchema.safeParse(req.body)
  if (!parsed.success) {
    const champ = parsed.error.issues[0]
    return res.status(400).json({ error: `Champ « ${champ?.path.join('.') || '?'} » invalide : ${champ?.message ?? 'format'}.` })
  }
  const a = parsed.data
  const userId = req.userId!
  try {
    const existant = await prisma.product.findFirst({ where: { userId, sourceUrl: sourceDe(a.reference) } })
    const donnees = {
      title: a.titre,
      aiTitle: a.titre,
      description: a.description,
      aiDescription: a.description,
      sellingPrice: a.prix,
      images: a.images,
      ...(a.ean ? { ean: a.ean } : {}),
    }
    const product = existant
      ? await prisma.product.update({ where: { id: existant.id }, data: donnees })
      : await prisma.product.create({
          data: {
            userId,
            sourceUrl: sourceDe(a.reference),
            sourceSite: 'api',
            ...donnees,
            // Les photos viennent du vendeur : aucun filigrane n'y a été posé.
            imagesWatermarked: false,
            status: 'PUBLISHED',
          },
        })

    const where = { productId_platform: { productId: product.id, platform: 'DROPSHOP_MARKET' as const } }
    const actuelle = await prisma.publication.findUnique({ where })
    if (retireeParModeration(actuelle)) {
      return res.status(409).json({ error: actuelle!.error, annonce: vue(product, actuelle) })
    }
    const publication = await prisma.publication.upsert({
      where,
      create: { productId: product.id, platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', publishedAt: new Date() },
      update: { status: 'PUBLISHED', error: null, publishedAt: actuelle?.publishedAt ?? new Date() },
    })
    res.status(existant ? 200 : 201).json({ ok: true, creee: !existant, annonce: vue(product, publication) })
  } catch (err) {
    console.error('[market-api] annonce', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "L'annonce n'a pas pu être enregistrée.", motif: 'annonce' })
  }
})

marketCleRouter.post('/publier', async (req: AgentRequest, res) => {
  const parsed = z.object({ productIds: z.array(z.string().min(1)).min(1).max(200) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Donnez « productIds » : 1 à 200 identifiants de produits.' })
  try {
    const produits = await prisma.product.findMany({
      where: { id: { in: parsed.data.productIds }, userId: req.userId! },
      include: { publications: { where: { platform: 'DROPSHOP_MARKET' } } },
    })
    const resultats = []
    for (const p of produits) {
      const actuelle = p.publications[0] ?? null
      if (retireeParModeration(actuelle)) {
        resultats.push({ productId: p.id, statut: 'FAILED', erreur: actuelle!.error })
        continue
      }
      await prisma.publication.upsert({
        where: { productId_platform: { productId: p.id, platform: 'DROPSHOP_MARKET' } },
        create: { productId: p.id, platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', publishedAt: new Date() },
        update: { status: 'PUBLISHED', error: null, publishedAt: actuelle?.publishedAt ?? new Date() },
      })
      resultats.push({ productId: p.id, statut: 'PUBLISHED', erreur: null })
    }
    const inconnus = parsed.data.productIds.filter((id) => !produits.some((p) => p.id === id))
    res.json({
      publies: resultats.filter((r) => r.statut === 'PUBLISHED').length,
      refuses: resultats.filter((r) => r.statut === 'FAILED').length,
      inconnus,
      resultats,
    })
  } catch (err) {
    console.error('[market-api] publier', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Publication impossible.', motif: 'publier' })
  }
})

marketCleRouter.delete('/annonces/:reference', async (req: AgentRequest, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { userId: req.userId!, sourceUrl: sourceDe(req.params.reference) } })
    if (!product) return res.status(404).json({ error: 'Aucune annonce avec cette référence.' })
    const actuelle = await prisma.publication.findUnique({
      where: { productId_platform: { productId: product.id, platform: 'DROPSHOP_MARKET' } },
    })
    // Le retrait de la modération reste : l'effacer rouvrirait la porte à une republication.
    if (actuelle && !retireeParModeration(actuelle)) {
      await prisma.publication.delete({ where: { id: actuelle.id } })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[market-api] retrait', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "Le retrait n'a pas pu être enregistré.", motif: 'retrait' })
  }
})
