import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { absoluteUrl } from '../lib/urls.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { lireSessionBackOffice, ouvrirSessionBackOffice, type SessionBackOffice } from '../services/extensions.js'
import { resoudre } from '../services/themes.js'

/**
 * L'API du Back Office d'une boutique DropShop (extension « Back Office »).
 *
 *   POST /api/boutique-admin/:shopKey/session       identifiant + mot de passe → jeton 12 h
 *   GET  /api/boutique-admin/:shopKey/commandes
 *   PATCH /api/boutique-admin/:shopKey/commandes/:id  { status }
 *   GET  /api/boutique-admin/:shopKey/produits
 *   GET  /api/boutique-admin/:shopKey/reglages
 *   PATCH /api/boutique-admin/:shopKey/reglages     { annonce, accroche, accrocheSuite, sousTitre, fraisPort, portOffertDes }
 *
 * Le jeton porte la boutique et sa portée, rien du compte DropShipper : un
 * employé qui a ce mot de passe ne peut pas atteindre le portefeuille de drops,
 * les autres boutiques ni les jetons de places de marché. Tout est borné à
 * `shopId` dans les requêtes elles-mêmes.
 */
export const shopAdminRouter = Router()

interface RequeteAdmin extends Request {
  session?: SessionBackOffice
}

function requireBackOffice(req: RequeteAdmin, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const session = token ? lireSessionBackOffice(token) : null
  if (!session || session.shopKey !== req.params.shopKey) return res.status(401).json({ error: 'Session expirée : reconnectez-vous.' })
  req.session = session
  next()
}

const sessionSchema = z.object({ identifiant: z.string().trim().min(1).max(120), motDePasse: z.string().min(1).max(200) })

shopAdminRouter.post('/:shopKey/session', rateLimit({ name: 'back-office-session', windowMs: 900_000, max: 20 }), async (req, res) => {
  const parsed = sessionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' })
  const token = await ouvrirSessionBackOffice(req.params.shopKey, parsed.data.identifiant, parsed.data.motDePasse)
  if (!token) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' })
  const shop = await prisma.shop.findUnique({ where: { shopKey: req.params.shopKey }, select: { name: true, slug: true } })
  res.json({ token, boutique: shop })
})

shopAdminRouter.get('/:shopKey/commandes', requireBackOffice, async (req: RequeteAdmin, res) => {
  const commandes = await prisma.order.findMany({
    where: { product: { shopId: req.session!.shopId } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { product: { select: { title: true, aiTitle: true, images: true } } },
  })
  res.json(
    commandes.map((c) => ({
      id: c.id,
      date: c.createdAt,
      statut: c.status,
      acheteur: c.buyerName,
      adresse: c.buyerAddress,
      montant: Number(c.amount),
      devise: c.currency,
      quantite: c.quantity,
      paye: Boolean(c.paidAt),
      produit: c.product.aiTitle || c.product.title,
      photo: Array.isArray(c.product.images) && typeof (c.product.images as unknown[])[0] === 'string' ? absoluteUrl((c.product.images as string[])[0]) : null,
      plateforme: c.platform,
    })),
  )
})

const statutSchema = z.object({ status: z.enum(['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'REFUNDED']) })

shopAdminRouter.patch('/:shopKey/commandes/:id', requireBackOffice, async (req: RequeteAdmin, res) => {
  const parsed = statutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'État inconnu.' })
  const { count } = await prisma.order.updateMany({
    where: { id: req.params.id, product: { shopId: req.session!.shopId } },
    data: { status: parsed.data.status },
  })
  if (!count) return res.status(404).json({ error: 'Commande introuvable.' })
  res.json({ ok: true })
})

shopAdminRouter.get('/:shopKey/produits', requireBackOffice, async (req: RequeteAdmin, res) => {
  const produits = await prisma.product.findMany({
    where: { shopId: req.session!.shopId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, title: true, aiTitle: true, sellingPrice: true, images: true, publications: { where: { platform: 'OWN_SITE' }, select: { status: true } } },
  })
  res.json(
    produits.map((p) => ({
      id: p.id,
      titre: p.aiTitle || p.title,
      prix: Number(p.sellingPrice ?? 0),
      photo: Array.isArray(p.images) && typeof (p.images as unknown[])[0] === 'string' ? absoluteUrl((p.images as string[])[0]) : null,
      enVitrine: p.publications.some((x) => x.status === 'PUBLISHED'),
    })),
  )
})

shopAdminRouter.get('/:shopKey/reglages', requireBackOffice, async (req: RequeteAdmin, res) => {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: req.session!.shopId } })
  const apparence = resoudre(shop)
  res.json({ nom: shop.name, slug: shop.slug, ...apparence.contenu })
})

const reglagesSchema = z.object({
  annonce: z.string().trim().max(120).optional(),
  accroche: z.string().trim().max(60).optional(),
  accrocheSuite: z.string().trim().max(60).optional(),
  sousTitre: z.string().trim().max(200).optional(),
  fraisPort: z.number().min(0).max(500).optional(),
  portOffertDes: z.number().min(0).max(100000).optional(),
})

shopAdminRouter.patch('/:shopKey/reglages', requireBackOffice, async (req: RequeteAdmin, res) => {
  const parsed = reglagesSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Réglages invalides' })
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: req.session!.shopId }, select: { storefront: true } })
  // Le JSON storefront est REMPLACÉ entier par Prisma : on fusionne d'abord.
  const actuel = (shop.storefront && typeof shop.storefront === 'object' ? shop.storefront : {}) as Record<string, unknown>
  const fusion = { ...actuel, ...parsed.data } as Prisma.InputJsonObject
  await prisma.shop.update({ where: { id: req.session!.shopId }, data: { storefront: fusion } })
  res.json({ ok: true })
})
