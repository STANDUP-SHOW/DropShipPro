import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin, type AuthedRequest } from '../middleware/auth.js'
import { etatCompte, lienInscription, lienTableauDeBord, MarketIndisponible } from '../services/marketStripe.js'
import { COMMISSION, marketUrl, offresDe } from '../services/market.js'

/**
 * DropShop Market, côté application : l'espace vendeur et l'admin simplifié.
 *
 *   /api/market/vendeur          état (Stripe, annonces, ventes, adresses des flux)
 *   /api/market/vendeur/stripe   lien d'inscription Stripe (création du compte Express)
 *   /api/market/vendeur/stripe/tableau  lien vers le tableau de bord Stripe Express
 *   /api/market/admin            chiffres, vendeurs, dernières ventes (admin seulement)
 *   /api/market/admin/annonces/:id/retirer   retire une annonce du Market
 */
export const marketApiRouter = Router()

function erreur(res: Response, err: unknown, contexte: string) {
  if (err instanceof MarketIndisponible) return res.status(503).json({ error: err.message })
  console.error(`[market] ${contexte}`, err instanceof Error ? err.message : err)
  return res.status(502).json({ error: 'Stripe ne répond pas pour le moment. Réessayez dans un instant.', motif: contexte })
}

marketApiRouter.get('/vendeur', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!
    const [stripe, annonces, ventes, shops] = await Promise.all([
      etatCompte(userId).catch((e) => {
        console.error('[market] état Stripe', e instanceof Error ? e.message : e)
        return { inscrit: true, actif: false, detailsEnvoyes: false, virements: false, erreur: true }
      }),
      prisma.publication.findMany({
        where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', product: { userId } },
        include: { product: true },
        orderBy: { publishedAt: 'desc' },
        take: 200,
      }),
      prisma.order.findMany({
        where: { userId, platform: 'DROPSHOP_MARKET', paidAt: { not: null } },
        include: { product: { select: { title: true, aiTitle: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.shop.findMany({ where: { userId, slug: { not: null } }, select: { name: true, slug: true } }),
    ])
    const base = marketUrl()
    res.json({
      commission: COMMISSION,
      stripe,
      annonces: annonces.map((p) => {
        const offres = offresDe(p.product)
        return {
          productId: p.productId,
          titre: p.product.aiTitle || p.product.title,
          url: `${base}${offres[0].cheminProduit}`,
          variantes: offres.filter((o) => o.cle).length,
          publieeLe: p.publishedAt,
        }
      }),
      ventes: ventes.map((o) => ({
        id: o.id,
        titre: o.product.aiTitle || o.product.title,
        variante: o.variante,
        quantite: o.quantity,
        montant: Number(o.amount),
        commission: Number(o.commission ?? 0),
        acheteur: o.buyerName,
        payeeLe: o.paidAt,
        statut: o.status,
      })),
      boutiques: shops.map((s) => ({ nom: s.name, url: `${base}/vendeur/${s.slug}` })),
      flux: {
        google: `${base}/flux/google.xml`,
        meta: `${base}/flux/meta.csv`,
        comparateurs: `${base}/flux/comparateurs.csv`,
        googleAds: `${base}/flux/google-ads.csv`,
        parBoutique: shops.map((s) => ({ nom: s.name, google: `${base}/flux/google.xml?vendeur=${s.slug}` })),
      },
      market: base,
    })
  } catch (err) {
    console.error('[market] vendeur', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "L'espace DropShop Market n'a pas pu être chargé.", motif: 'vendeur' })
  }
})

marketApiRouter.post('/vendeur/stripe', requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json({ url: await lienInscription(req.userId!) })
  } catch (err) {
    erreur(res, err, 'inscription-stripe')
  }
})

marketApiRouter.post('/vendeur/stripe/tableau', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const url = await lienTableauDeBord(req.userId!)
    if (!url) return res.status(409).json({ error: "Activez d'abord vos paiements Stripe." })
    res.json({ url })
  } catch (err) {
    erreur(res, err, 'tableau-stripe')
  }
})

// ——— Admin simplifié ———

marketApiRouter.get('/admin', requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  try {
    const depuis = new Date(Date.now() - 30 * 24 * 3600_000)
    const [annonces, vendeursActifs, inscrits, ventes, totaux, totaux30] = await Promise.all([
      prisma.publication.count({ where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED' } }),
      prisma.user.count({ where: { stripeConnectReady: true } }),
      prisma.user.count({ where: { stripeConnectId: { not: null } } }),
      prisma.order.findMany({
        where: { platform: 'DROPSHOP_MARKET', paidAt: { not: null } },
        include: { product: { select: { title: true, aiTitle: true } }, user: { select: { email: true, shopName: true } } },
        orderBy: { paidAt: 'desc' },
        take: 50,
      }),
      prisma.order.aggregate({ where: { platform: 'DROPSHOP_MARKET', paidAt: { not: null } }, _sum: { amount: true, commission: true }, _count: true }),
      prisma.order.aggregate({ where: { platform: 'DROPSHOP_MARKET', paidAt: { gte: depuis } }, _sum: { amount: true, commission: true }, _count: true }),
    ])
    const vendeurs = await prisma.publication.groupBy({
      by: ['productId'],
      where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED' },
      _count: true,
    })
    const produits = await prisma.product.findMany({
      where: { id: { in: vendeurs.map((v) => v.productId) } },
      select: { userId: true },
    })
    const parVendeur = new Map<string, number>()
    for (const p of produits) parVendeur.set(p.userId, (parVendeur.get(p.userId) ?? 0) + 1)
    const comptes = await prisma.user.findMany({
      where: { id: { in: [...parVendeur.keys()] } },
      select: { id: true, email: true, shopName: true, stripeConnectReady: true, createdAt: true },
    })

    res.json({
      commission: COMMISSION,
      market: marketUrl(),
      chiffres: {
        annonces,
        vendeursAvecAnnonces: parVendeur.size,
        vendeursPaiementsActifs: vendeursActifs,
        inscriptionsStripe: inscrits,
        ventes: totaux._count,
        volume: Number(totaux._sum.amount ?? 0),
        commissions: Number(totaux._sum.commission ?? 0),
        ventes30j: totaux30._count,
        volume30j: Number(totaux30._sum.amount ?? 0),
        commissions30j: Number(totaux30._sum.commission ?? 0),
      },
      vendeurs: comptes
        .map((c) => ({ id: c.id, email: c.email, nom: c.shopName, paiements: c.stripeConnectReady, annonces: parVendeur.get(c.id) ?? 0, inscritLe: c.createdAt }))
        .sort((a, b) => b.annonces - a.annonces),
      ventes: ventes.map((o) => ({
        id: o.id,
        titre: o.product.aiTitle || o.product.title,
        variante: o.variante,
        vendeur: o.user.shopName || o.user.email,
        montant: Number(o.amount),
        commission: Number(o.commission ?? 0),
        payeeLe: o.paidAt,
        statut: o.status,
      })),
    })
  } catch (err) {
    console.error('[market] admin', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "L'admin DropShop Market n'a pas pu être chargé.", motif: 'admin' })
  }
})

/** Les annonces d'un vendeur, pour la modération. */
marketApiRouter.get('/admin/vendeurs/:userId/annonces', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const pubs = await prisma.publication.findMany({
      where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', product: { userId: req.params.userId } },
      include: { product: true },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    })
    res.json({
      annonces: pubs.map((p) => ({
        productId: p.productId,
        titre: p.product.aiTitle || p.product.title,
        url: `${marketUrl()}${offresDe(p.product)[0].cheminProduit}`,
        prix: Number(p.product.sellingPrice),
      })),
    })
  } catch (err) {
    console.error('[market] admin annonces', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Annonces indisponibles.', motif: 'admin-annonces' })
  }
})

const retraitSchema = z.object({ raison: z.string().trim().min(3).max(500) })

/**
 * Retire une annonce du Market (contrefaçon, produit interdit…). La raison est
 * écrite sur la publication : le vendeur la lit dans l'application.
 */
marketApiRouter.post('/admin/annonces/:productId/retirer', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = retraitSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Indiquez la raison du retrait (3 caractères au moins).' })
  try {
    const r = await prisma.publication.updateMany({
      where: { productId: req.params.productId, platform: 'DROPSHOP_MARKET' },
      data: { status: 'FAILED', error: `Retirée de DropShop Market par la modération : ${parsed.data.raison}`, publishedAt: null },
    })
    if (!r.count) return res.status(404).json({ error: 'Annonce introuvable.' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[market] retrait', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "Le retrait n'a pas pu être enregistré.", motif: 'retrait' })
  }
})
