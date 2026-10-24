import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { refundCredits, reserveCredits } from '../services/billing.js'
import { DROPS } from '../services/tarifs.js'
import { BIBLIOTHEQUES, analyserPageAds, pageAnalysable } from '../services/adsAnalyser.js'

/**
 * DESKTOP POWER (demande de Max du 24/10/2026) : ce que les pages de la section
 * lisent sur le serveur. Le reste (navigateur intégré, sessions des places de
 * marché, relevé des fiches) vit dans l'application desktop, sur le poste.
 *
 * - RemoteShipping : la liste des produits choisis depuis le téléphone
 *   (SharedLink, la même que celle du mobile et du desktop).
 * - AUTO-SHIPPER Importer : ce que l'AUTO-SHIPPER a importé, par jour, et ce que
 *   ces produits ont rapporté.
 * - AdsAnalyser : l'analyse d'une page de bibliothèque publicitaire, payée au
 *   tarif DROPS.adsAnalyse, rangée dans « Mes analyses ».
 *
 * Chaque route attrape ses erreurs : un handler async qui lève fait pendre la
 * requête sous Express 4 (CLAUDE.md).
 */
export const desktopPowerRouter = Router()
desktopPowerRouter.use(requireAuth)

const num = (d: unknown) => Number(d ?? 0) || 0
const jourParis = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

// ------------------------------------------------------------ RemoteShipping

desktopPowerRouter.get('/partages', async (req: AuthedRequest, res) => {
  try {
    const liens = await prisma.sharedLink.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json({
      partages: liens.map((l) => ({ id: l.id, url: l.url, titre: l.title, note: l.note, source: l.source, statut: l.status, cree: l.createdAt.toISOString(), pris: l.claimedAt?.toISOString() ?? null })),
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

/** Le vendeur l'a importé par une autre voie, ou n'en veut plus : il sort de la liste à importer. */
desktopPowerRouter.post('/partages/:id/fait', async (req: AuthedRequest, res) => {
  try {
    const r = await prisma.sharedLink.updateMany({ where: { id: req.params.id, userId: req.userId! }, data: { status: 'DONE', claimedAt: new Date() } })
    if (!r.count) return res.status(404).json({ error: 'Produit introuvable dans votre liste.' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

desktopPowerRouter.delete('/partages/:id', async (req: AuthedRequest, res) => {
  try {
    const r = await prisma.sharedLink.deleteMany({ where: { id: req.params.id, userId: req.userId! } })
    if (!r.count) return res.status(404).json({ error: 'Produit introuvable dans votre liste.' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ------------------------------------------------------ AUTO-SHIPPER Importer

/**
 * Un produit « importé par l'AUTO-SHIPPER » est celui d'une opportunité passée à
 * IMPORTED : seuls services/autopilot.ts et autoShipperFile.ts posent cet état.
 * Les coûts sont les mouvements de drops dont le libellé nomme l'AUTO-SHIPPER
 * (journée, imports, contrôles, et leurs remboursements nommés) ; un
 * remboursement générique « Remboursement » n'y est pas compté, et c'est dit.
 */
desktopPowerRouter.get('/autoshipper', async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!
    const opps = await prisma.opportunity.findMany({
      where: { userId, status: 'IMPORTED', productId: { not: null } },
      select: { productId: true, source: true, category: true },
    })
    const parProduit = new Map(opps.map((o) => [o.productId!, o]))
    const ids = [...parProduit.keys()]

    const [produits, ventes, mouvements, runs] = await Promise.all([
      prisma.product.findMany({
        where: { userId, id: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          id: true,
          title: true,
          aiTitle: true,
          images: true,
          price: true,
          shippingCost: true,
          sellingPrice: true,
          currency: true,
          status: true,
          sourceUrl: true,
          createdAt: true,
          publications: { select: { platform: true, status: true, externalUrl: true } },
        },
      }),
      prisma.order.findMany({
        where: { userId, productId: { in: ids }, status: { not: 'REFUNDED' } },
        select: { productId: true, amount: true, quantity: true, supplierOrderCost: true },
      }),
      prisma.dropTransaction.findMany({
        where: { userId, motif: { contains: 'AUTO-SHIPPER' } },
        select: { delta: true, motif: true, createdAt: true },
      }),
      prisma.autopilotRun.findMany({ where: { userId }, select: { day: true } }),
    ])

    const produitsParId = new Map(produits.map((p) => [p.id, p]))
    const ventesParProduit = new Map<string, { nombre: number; ca: number; marge: number }>()
    for (const v of ventes) {
      const p = produitsParId.get(v.productId)
      const qte = v.quantity || 1
      // Le coût réel de la commande fournisseur quand il est connu ; sinon celui de la fiche (prix + port) × quantité.
      const cout = v.supplierOrderCost != null ? num(v.supplierOrderCost) : p ? (num(p.price) + num(p.shippingCost)) * qte : 0
      const acc = ventesParProduit.get(v.productId) ?? { nombre: 0, ca: 0, marge: 0 }
      acc.nombre += qte
      acc.ca += num(v.amount)
      acc.marge += num(v.amount) - cout
      ventesParProduit.set(v.productId, acc)
    }

    const lots = new Map<string, Array<Record<string, unknown>>>()
    for (const p of produits) {
      const jour = jourParis(p.createdAt)
      const images = Array.isArray(p.images) ? (p.images as unknown[]).filter((x): x is string => typeof x === 'string') : []
      const v = ventesParProduit.get(p.id) ?? { nombre: 0, ca: 0, marge: 0 }
      const o = parProduit.get(p.id)
      const ligne = {
        id: p.id,
        titre: p.aiTitle || p.title,
        image: images[0] ?? null,
        prixAchat: num(p.price) + num(p.shippingCost),
        prixVente: num(p.sellingPrice),
        devise: p.currency,
        statut: p.status,
        fournisseur: o?.source ?? null,
        rayon: o?.category ?? null,
        source: p.sourceUrl,
        importe: p.createdAt.toISOString(),
        publications: p.publications.map((x) => ({ plateforme: x.platform, statut: x.status, url: x.externalUrl })),
        ventes: v.nombre,
        ca: Math.round(v.ca * 100) / 100,
        marge: Math.round(v.marge * 100) / 100,
      }
      lots.set(jour, [...(lots.get(jour) ?? []), ligne])
    }

    const debite = mouvements.filter((m) => m.delta < 0).reduce((n, m) => n - m.delta, 0)
    const rendu = mouvements.filter((m) => m.delta > 0).reduce((n, m) => n + m.delta, 0)
    const joursPayes = new Set(mouvements.filter((m) => m.delta < 0 && m.motif === 'Journée AUTO-SHIPPER').map((m) => jourParis(m.createdAt)))
    const total = [...ventesParProduit.values()].reduce((a, v) => ({ nombre: a.nombre + v.nombre, ca: a.ca + v.ca, marge: a.marge + v.marge }), { nombre: 0, ca: 0, marge: 0 })
    const coutEuros = ((debite - rendu) * 0.01)

    res.json({
      lots: [...lots.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([jour, produits]) => ({ jour, produits })),
      stats: {
        joursActives: joursPayes.size,
        joursTournes: new Set(runs.map((r) => r.day)).size,
        coutDrops: debite - rendu,
        coutEuros: Math.round(coutEuros * 100) / 100,
        produitsImportes: produits.length,
        produitsPublies: produits.filter((p) => p.publications.some((x) => x.status === 'PUBLISHED')).length,
        ventes: total.nombre,
        ca: Math.round(total.ca * 100) / 100,
        margeBrute: Math.round(total.marge * 100) / 100,
        profit: Math.round((total.marge - coutEuros) * 100) / 100,
      },
      note: "Coût : mouvements de drops nommés AUTO-SHIPPER (journées, imports, contrôles, moins leurs remboursements nommés). Marge brute : ventes moins coût fournisseur (réel si la commande fournisseur est passée, sinon prix de la fiche). Profit : marge brute moins ce coût en euros (1 drop = 0,01 €), hors frais des places de marché.",
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------- AdsAnalyser

const schemaAnalyse = z.object({
  plateforme: z.enum(['facebook', 'tiktok']),
  produit: z.string().trim().max(200).optional(),
  page: z.object({ url: z.string().max(4000), titre: z.string().max(400).default(''), texte: z.string().max(20000) }),
})

desktopPowerRouter.get('/ads-analyses', async (req: AuthedRequest, res) => {
  try {
    const liste = await prisma.adsAnalyse.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, plateforme: true, url: true, titre: true, produit: true, donnees: true, drops: true, createdAt: true },
    })
    res.json({ tarif: DROPS.adsAnalyse, bibliotheques: BIBLIOTHEQUES, analyses: liste.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })) })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

desktopPowerRouter.get('/ads-analyses/:id', async (req: AuthedRequest, res) => {
  try {
    const a = await prisma.adsAnalyse.findFirst({ where: { id: req.params.id, userId: req.userId! } })
    if (!a) return res.status(404).json({ error: 'Analyse introuvable.' })
    res.json({ analyse: { ...a, createdAt: a.createdAt.toISOString() } })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

desktopPowerRouter.post('/ads-analyses', async (req: AuthedRequest, res) => {
  const parsed = schemaAnalyse.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Page à analyser manquante ou trop longue.' })
  const { plateforme, produit, page } = parsed.data
  const refus = pageAnalysable(plateforme, page)
  if (refus) return res.status(400).json({ error: refus })

  const cout = DROPS.adsAnalyse
  const pris = await reserveCredits(req.userId!, cout, `Analyse AdsAnalyser (${BIBLIOTHEQUES[plateforme].nom})`).catch(() => null)
  if (!pris || !pris.ok) return res.status(402).json({ error: pris?.reason ?? 'Solde de drops insuffisant.' })
  try {
    const { body, donnees } = await analyserPageAds({ plateforme, page, produit })
    const titre = (produit || page.titre || BIBLIOTHEQUES[plateforme].nom).slice(0, 200)
    const a = await prisma.adsAnalyse.create({
      data: { userId: req.userId!, plateforme, url: page.url.slice(0, 2000), titre, produit: produit || null, body, donnees: donnees ? { ...donnees } : undefined, drops: cout },
    })
    res.status(201).json({ analyse: { ...a, createdAt: a.createdAt.toISOString() } })
  } catch (err) {
    await refundCredits(req.userId!, cout, 'Analyse AdsAnalyser non faite').catch(() => undefined)
    res.status(502).json({ error: `${(err as Error).message} Vos drops ont été rendus.` })
  }
})
