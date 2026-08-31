import { Router } from 'express'
import { SUPPLIERS } from '../services/suppliers.js'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { identify, fetchEvents } from '../services/tracking.js'
import { commanderChezFournisseur, releverSuiviFournisseur } from '../services/supplierOrders.js'
import { findConnector } from '../services/supplierConnectors.js'

export const ordersRouter = Router()
ordersRouter.use(requireAuth)

// Manual sale entry for now: no marketplace has a connected seller API yet
// (see PlatformCredential.connected), so there's no live webhook to trigger this
// automatically. Once a platform is connected, its webhook creates the Order the
// same way this endpoint does, and it will show up in the dashboard identically.
const createSchema = z.object({
  productId: z.string(),
  platform: z.enum(PLATFORM_IDS),
  externalOrderId: z.string().optional(),
  buyerName: z.string().min(1),
  buyerAddress: z.object({
    street: z.string(),
    city: z.string(),
    zip: z.string(),
    country: z.string().default('France'),
    phone: z.string().optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().default('EUR'),
})

ordersRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs de commande invalides' })

  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const order = await prisma.order.create({
    data: { ...parsed.data, userId: req.userId! },
  })
  res.status(201).json(order)
})

ordersRouter.get('/', async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { product: true },
  })
  res.json(orders)
})

/**
 * Figures for the orders workspace: turnover, real margin, and how many orders
 * sit in each state.
 *
 * Margin is computed against the product's current supplier cost, not the cost
 * at the time of sale — nothing records the latter yet. It is therefore an
 * indication, and it drifts if the seller edits a price afterwards. Said here so
 * nobody mistakes it for accounting.
 */
ordersRouter.get('/summary', async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId! },
    include: { product: { select: { price: true, shippingCost: true } } },
  })

  const parStatut: Record<string, number> = {}
  const parPlateforme: Record<string, { commandes: number; chiffre: number }> = {}
  let chiffre = 0
  let cout = 0

  for (const o of orders) {
    parStatut[o.status] = (parStatut[o.status] ?? 0) + 1

    // A refunded order is neither turnover nor margin: counting it would flatter
    // the figures exactly when the seller needs them to be honest.
    if (o.status === 'REFUNDED') continue

    const montant = Number(o.amount)
    chiffre += montant
    cout += Number(o.product.price) + Number(o.product.shippingCost)

    const p = (parPlateforme[o.platform] ??= { commandes: 0, chiffre: 0 })
    p.commandes++
    p.chiffre += montant
  }

  res.json({
    commandes: orders.length,
    chiffreAffaires: Number(chiffre.toFixed(2)),
    coutFournisseur: Number(cout.toFixed(2)),
    marge: Number((chiffre - cout).toFixed(2)),
    parStatut,
    parPlateforme,
  })
})

const bulkSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(200),
  status: z.enum(['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'REFUNDED']),
})

/**
 * Moves several orders at once.
 *
 * Scoped by userId in the same statement rather than checked beforehand: a list
 * of ids coming from the client must never be trusted to belong to the caller.
 */
ordersRouter.patch('/bulk/status', async (req: AuthedRequest, res) => {
  const parsed = bulkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélection invalide' })

  const { count } = await prisma.order.updateMany({
    where: { id: { in: parsed.data.orderIds }, userId: req.userId! },
    data: { status: parsed.data.status },
  })

  res.json({ updated: count, ignored: parsed.data.orderIds.length - count })
})

const updateSchema = z.object({
  status: z.enum(['NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'REFUNDED']).optional(),
  trackingNumber: z.string().optional(),
  shippingLabelUrl: z.string().optional(),
  receiptUrl: z.string().optional(),
  payoutStatus: z.enum(['PENDING', 'RELEASED']).optional(),
  platformBalance: z.number().optional(),
  supplierOrderUrl: z.string().optional(),
})

// Covers "marquer comme expédié", attacher étiquette/reçu, statut de paiement:
// saisis manuellement ici tant qu'aucune plateforme n'est connectée en API réelle.
ordersRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const owned = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Commande introuvable' })

  const order = await prisma.order.update({ where: { id: req.params.id }, data: parsed.data })
  res.json(order)
})

/**
 * La fiche d'une commande : adresse, colis, et de quoi joindre l'acheteur.
 *
 * Le suivi détaillé n'arrive que si une clé 17TRACK est configurée ; sans elle,
 * le lien vers le transporteur reste affiché, ce qui couvre l'essentiel du
 * besoin sans imposer un abonnement à un vendeur qui débute.
 */
/**
 * Les chemins qui ressemblent à un identifiant sans en être un.
 *
 * `/:id` est déclarée avant `/purchases` et `/accounting`, donc elle les
 * capturait toutes les deux : les deux écrans recevaient « Commande introuvable »
 * au lieu de leurs données, sans qu'aucune erreur ne soit levée nulle part. La
 * liste vit ici plutôt qu'ailleurs pour qu'un futur `/orders/quelque-chose`
 * n'ait qu'un endroit à mettre à jour.
 */
const CHEMINS_RESERVES = new Set(['purchases', 'accounting', 'summary', 'supplier-tracking', 'by-supplier'])

ordersRouter.get('/:id', async (req: AuthedRequest, res, next) => {
  if (CHEMINS_RESERVES.has(req.params.id)) return next('route')

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { product: { select: { id: true, title: true, aiTitle: true, images: true } } },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })

  const tracking = order.trackingNumber ? identify(order.trackingNumber, order.carrier) : null
  const events = tracking ? await fetchEvents(tracking.number, tracking.carrier) : null

  // Une conversation déjà ouverte pour cette commande : le bouton « contacter »
  // doit y ramener au lieu d'en créer une deuxième.
  const conversation = await prisma.conversation.findFirst({
    where: { userId: req.userId!, orderId: order.id },
    select: { id: true },
  })

  res.json({
    ...order,
    amount: Number(order.amount),
    platformBalance: order.platformBalance === null ? null : Number(order.platformBalance),
    tracking,
    events,
    conversationId: conversation?.id ?? null,
  })
})

const trackingSchema = z.object({
  trackingNumber: z.string().trim().min(3).max(60),
  carrier: z.string().trim().max(40).optional(),
  /**
   * Passer la commande en « expédié ».
   *
   * Saisir un numéro de suivi veut dire que le colis est parti : laisser la
   * commande en « à commander » obligerait à faire deux gestes pour dire une
   * seule chose. Le drapeau reste explicite pour les cas où le vendeur corrige
   * seulement un numéro erroné.
   */
  markShipped: z.boolean().optional(),
})

ordersRouter.put('/:id/tracking', async (req: AuthedRequest, res) => {
  const parsed = trackingSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Numéro de suivi invalide' })

  const { count } = await prisma.order.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: {
      trackingNumber: parsed.data.trackingNumber,
      carrier: parsed.data.carrier ?? null,
      ...(parsed.data.markShipped ? { status: 'SHIPPED' as const } : {}),
    },
  })
  if (!count) return res.status(404).json({ error: 'Commande introuvable' })

  res.json({ ok: true, tracking: identify(parsed.data.trackingNumber, parsed.data.carrier) })
})

/**
 * Contacter l'acheteur depuis la commande.
 *
 * Ouvre une conversation dans la messagerie, rattachée à la commande et au
 * produit, et confiée au chef de rayon qui saura répondre. Rien n'est envoyé
 * ici : le vendeur écrit, relit, et décide.
 */
ordersRouter.post('/:id/contact', async (req: AuthedRequest, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { product: { select: { id: true, title: true, aiTitle: true } } },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })

  const existing = await prisma.conversation.findFirst({
    where: { userId: req.userId!, orderId: order.id },
    select: { id: true },
  })
  if (existing) return res.json({ id: existing.id, created: false })

  const conversation = await prisma.conversation.create({
    data: {
      userId: req.userId!,
      platform: order.platform,
      customerName: order.buyerName,
      customerEmail: order.buyerEmail,
      subject: `Commande ${order.externalOrderId ?? order.id.slice(0, 8)}`,
      productId: order.productId,
      orderId: order.id,
      // Ouverte par le vendeur : rien à signaler comme non lu.
      unread: false,
    },
  })

  res.status(201).json({ id: conversation.id, created: true })
})

/**
 * Les achats à passer chez les fournisseurs.
 *
 * Une vente n'est pas une livraison : il faut encore acheter le produit. Ce qui
 * fait perdre du temps ici n'est pas de cliquer, c'est de retrouver quelle
 * commande correspond à quel produit, chez quel fournisseur, à quelle adresse.
 * La liste est donc groupée par fournisseur — on passe une commande chez Temu,
 * pas une commande par vente.
 */
ordersRouter.get('/purchases', async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId!, status: 'NEW' },
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          aiTitle: true,
          sourceUrl: true,
          sourceSite: true,
          sourceCategory: true,
          price: true,
          shippingCost: true,
          variants: true,
          images: true,
        },
      },
    },
  })

  // Groupé par fournisseur, puis par produit : deux ventes du même article chez
  // le même fournisseur font une ligne de quantité 2, pas deux lignes.
  const bySupplier = new Map<string, Map<string, {
    product: (typeof orders)[number]['product']
    quantity: number
    orders: Array<{ id: string; buyerName: string; buyerAddress: unknown; platform: string; createdAt: Date }>
  }>>()

  for (const o of orders) {
    const supplier = o.product.sourceSite || 'Fournisseur inconnu'
    const forSupplier = bySupplier.get(supplier) ?? new Map()
    bySupplier.set(supplier, forSupplier)

    const line = forSupplier.get(o.product.id) ?? { product: o.product, quantity: 0, orders: [] }
    line.quantity++
    line.orders.push({
      id: o.id,
      buyerName: o.buyerName,
      buyerAddress: o.buyerAddress,
      platform: o.platform,
      createdAt: o.createdAt,
    })
    forSupplier.set(o.product.id, line)
  }

  const suppliers = [...bySupplier.entries()].map(([supplier, lines]) => {
    const items = [...lines.values()].map((l) => ({
      productId: l.product.id,
      title: l.product.aiTitle || l.product.title,
      sourceUrl: l.product.sourceUrl,
      category: l.product.sourceCategory,
      variants: l.product.variants,
      image: Array.isArray(l.product.images) ? l.product.images[0] ?? null : null,
      unitCost: Number(l.product.price),
      shippingCost: Number(l.product.shippingCost),
      quantity: l.quantity,
      total: Number(((Number(l.product.price) + Number(l.product.shippingCost)) * l.quantity).toFixed(2)),
      orders: l.orders,
    }))

    return {
      supplier,
      items,
      quantity: items.reduce((n, i) => n + i.quantity, 0),
      total: Number(items.reduce((n, i) => n + i.total, 0).toFixed(2)),
    }
  })

  res.json({
    count: orders.length,
    total: Number(suppliers.reduce((n, s) => n + s.total, 0).toFixed(2)),
    suppliers,
  })
})

const purchasedSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(200),
  supplierOrderUrl: z.string().url().optional(),
})

/**
 * Marquer des ventes comme achetées chez le fournisseur.
 *
 * Fait après coup, jamais avant : tant que le vendeur n'a pas payé, la commande
 * reste à passer. Marquer d'avance ferait disparaître de la liste un achat que
 * personne n'a fait, et le client attendrait un colis qui n'existe pas.
 */
ordersRouter.post('/purchases/done', async (req: AuthedRequest, res) => {
  const parsed = purchasedSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélectionnez au moins une commande' })

  const { count } = await prisma.order.updateMany({
    where: { id: { in: parsed.data.orderIds }, userId: req.userId!, status: 'NEW' },
    data: {
      status: 'ORDERED_FROM_SUPPLIER',
      ...(parsed.data.supplierOrderUrl ? { supplierOrderUrl: parsed.data.supplierOrderUrl } : {}),
    },
  })

  res.json({ ok: true, updated: count })
})

/**
 * La comptabilité, mois par mois, et les litiges en cours.
 *
 * Deux choses que le vendeur cherchait dans deux écrans différents alors
 * qu'elles se lisent ensemble : ce qui est entré, et ce qui menace d'en
 * ressortir. Un remboursement n'est pas une commande de moins, c'est de la
 * marge déjà dépensée qui revient en arrière.
 *
 * Aucune estimation : ce sont les commandes enregistrées. La marge se calcule
 * sur le coût fournisseur actuel du produit, faute d'enregistrer celui du jour
 * de la vente — c'est écrit dans la réponse pour que personne ne prenne ce
 * chiffre pour de la comptabilité.
 */
ordersRouter.get('/accounting', async (req: AuthedRequest, res) => {
  const [orders, litiges] = await Promise.all([
    prisma.order.findMany({
      where: { userId: req.userId! },
      include: { product: { select: { id: true, title: true, aiTitle: true, price: true, shippingCost: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.conversation.findMany({
      where: { userId: req.userId!, status: { in: ['OPEN', 'WAITING'] } },
      orderBy: { lastMessageAt: 'desc' },
      take: 60,
      select: {
        id: true,
        platform: true,
        customerName: true,
        subject: true,
        status: true,
        unread: true,
        lastMessageAt: true,
      },
    }),
  ])

  const mois = new Map<string, { chiffre: number; cout: number; commandes: number; rembourses: number }>()
  const plateformes = new Map<string, { chiffre: number; cout: number; commandes: number; rembourses: number }>()

  for (const o of orders) {
    const cle = o.createdAt.toISOString().slice(0, 7)
    const ligneMois = mois.get(cle) ?? { chiffre: 0, cout: 0, commandes: 0, rembourses: 0 }
    const lignePf = plateformes.get(o.platform) ?? { chiffre: 0, cout: 0, commandes: 0, rembourses: 0 }

    if (o.status === 'REFUNDED') {
      ligneMois.rembourses += 1
      lignePf.rembourses += 1
    } else {
      const montant = Number(o.amount)
      const revient = Number(o.product.price) + Number(o.product.shippingCost)
      ligneMois.chiffre += montant
      ligneMois.cout += revient
      ligneMois.commandes += 1
      lignePf.chiffre += montant
      lignePf.cout += revient
      lignePf.commandes += 1
    }

    mois.set(cle, ligneMois)
    plateformes.set(o.platform, lignePf)
  }

  const arrondi = (v: number) => Number(v.toFixed(2))

  res.json({
    parMois: [...mois.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([m, l]) => ({
        mois: m,
        commandes: l.commandes,
        rembourses: l.rembourses,
        chiffre: arrondi(l.chiffre),
        cout: arrondi(l.cout),
        marge: arrondi(l.chiffre - l.cout),
      })),
    parPlateforme: [...plateformes.entries()]
      .map(([platform, l]) => ({
        platform,
        commandes: l.commandes,
        rembourses: l.rembourses,
        chiffre: arrondi(l.chiffre),
        cout: arrondi(l.cout),
        marge: arrondi(l.chiffre - l.cout),
      }))
      .sort((a, b) => b.chiffre - a.chiffre),
    remboursements: orders
      .filter((o) => o.status === 'REFUNDED')
      .slice(0, 40)
      .map((o) => ({
        id: o.id,
        platform: o.platform,
        titre: o.product.aiTitle || o.product.title,
        montant: Number(o.amount),
        devise: o.currency,
        createdAt: o.createdAt,
      })),
    litiges,
    // Dit dans la réponse plutôt que dans un coin de l'interface : ces chiffres
    // préparent une comptabilité, ils ne la remplacent pas.
    avertissement:
      "Ces chiffres ne comptent ni la TVA, ni les frais de plateforme, ni les frais de port facturés à l'acheteur : rien de tout cela n'est encore saisi. La marge se calcule sur le coût fournisseur actuel du produit, pas sur celui du jour de la vente.",
  })
})

/**
 * Dépose une commande chez le fournisseur — sans la payer.
 *
 * Déclenché par le vendeur, jamais par la vente elle-même : le mode automatique
 * existe dans les réglages, mais même lui s'arrête au plafond. L'application
 * remplit, l'humain valide, y compris quand c'est de l'argent.
 */
ordersRouter.post('/:id/supplier-order', async (req: AuthedRequest, res) => {
  try {
    const resultat = await commanderChezFournisseur(req.userId!, req.params.id, {
      forcer: req.body?.forcer === true,
    })
    res.json(resultat)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Commande impossible.' })
  }
})

/** Les variantes commandables d'une vente, quand il faut en choisir une. */
ordersRouter.get('/:id/supplier-variants', async (req: AuthedRequest, res) => {
  const commande = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { product: { select: { supplierId: true, supplierRef: true } } },
  })
  if (!commande) return res.status(404).json({ error: 'Commande introuvable' })

  const { supplierId, supplierRef } = commande.product
  const connecteur = supplierId ? findConnector(supplierId) : null
  if (!supplierId || !supplierRef || !connecteur?.fetchVariants) {
    return res.json({ variantes: [], choisie: commande.supplierVariantRef })
  }

  const lien = await prisma.supplierConnection.findFirst({
    where: { userId: req.userId!, supplier: supplierId, connected: true },
  })
  if (!lien) return res.json({ variantes: [], choisie: commande.supplierVariantRef })

  try {
    const variantes = await connecteur.fetchVariants(
      supplierRef,
      (lien.data ?? {}) as Record<string, string>,
    )
    res.json({ variantes, choisie: commande.supplierVariantRef })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fournisseur injoignable.' })
  }
})

/** Fixe la variante à commander : ce que l'application refuse de deviner. */
ordersRouter.put('/:id/supplier-variant', async (req: AuthedRequest, res) => {
  const ref = typeof req.body?.ref === 'string' ? req.body.ref.trim() : ''
  if (!ref) return res.status(400).json({ error: 'Référence de variante manquante' })

  const { count } = await prisma.order.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { supplierVariantRef: ref },
  })
  if (!count) return res.status(404).json({ error: 'Commande introuvable' })

  res.json({ ok: true, ref })
})

/**
 * Relève l'état et le numéro de suivi des commandes déjà déposées.
 *
 * Lecture seule : c'est la moitié sans risque du raccordement fournisseur, et
 * celle qui fait gagner le plus de temps — un numéro de suivi remonté tout seul,
 * c'est un message de moins à écrire à chaque acheteur.
 */
ordersRouter.post('/supplier-tracking', async (req: AuthedRequest, res) => {
  const resultat = await releverSuiviFournisseur(req.userId!)
  res.json(resultat)
})

/**
 * Les ventes à commander, regroupées par fournisseur.
 *
 * C'est la question que le vendeur se pose vraiment le matin : « qu'est-ce que
 * je dois commander, et chez qui ». Rangées par vente, les commandes obligent à
 * rouvrir le site d'un fournisseur, puis d'un autre, puis à revenir au premier
 * — et c'est là que se perdent les colis.
 *
 * Chaque ligne porte l'adresse de l'acheteur : c'est elle qui part chez le
 * fournisseur, et c'est une faute de frappe dedans qui coûte un colis.
 */
ordersRouter.get('/by-supplier', async (req: AuthedRequest, res) => {
  const commandes = await prisma.order.findMany({
    // Un remboursement n a plus rien a commander : le garder ferait proposer un
    // achat pour une vente qui n existe plus.
    where: { userId: req.userId!, status: { not: 'REFUNDED' } },
    include: {
      product: {
        select: { id: true, title: true, aiTitle: true, images: true, supplierId: true, supplierRef: true, price: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const [liens, connecteurs] = await Promise.all([
    prisma.supplierConnection.findMany({ where: { userId: req.userId!, connected: true } }),
    Promise.resolve(SUPPLIERS),
  ])
  const relies = new Set(liens.map((l) => l.supplier))

  /*
   * Les ventes sans fournisseur reconnu forment un groupe à part.
   *
   * Les cacher laisserait croire que tout est commandable ; les mêler aux
   * autres ferait chercher un bouton « Commander » qui ne peut rien faire.
   */
  type Vente = (typeof commandes)[number]
  const groupes = new Map<string, Vente[]>()
  for (const commande of commandes) {
    const cle = commande.product.supplierId ?? '—'
    groupes.set(cle, [...(groupes.get(cle) ?? []), commande])
  }

  res.json({
    fournisseurs: [...groupes].map(([supplierId, ventes]) => {
      const connu = connecteurs.find((s) => s.id === supplierId)
      return {
        supplierId,
        label: connu?.label ?? (supplierId === '—' ? 'Fournisseur non reconnu' : supplierId),
        relie: relies.has(supplierId),
        // Ce qui reste à commander : le chiffre qui décide de l'ordre du jour.
        aCommander: ventes.filter((v) => !v.supplierOrderId).length,
        ventes: ventes.map((v) => ({
          id: v.id,
          platform: v.platform,
          status: v.status,
          amount: Number(v.amount),
          currency: v.currency,
          createdAt: v.createdAt,
          buyerName: v.buyerName,
          buyerAddress: v.buyerAddress,
          supplierOrderId: v.supplierOrderId,
          supplierOrderStatus: v.supplierOrderStatus,
          supplierOrderError: v.supplierOrderError,
          supplierOrderUrl: v.supplierOrderUrl,
          trackingNumber: v.trackingNumber,
          produit: {
            id: v.product.id,
            titre: v.product.aiTitle || v.product.title,
            image: Array.isArray(v.product.images) ? (v.product.images as string[])[0] ?? null : null,
            supplierRef: v.product.supplierRef,
            cout: Number(v.product.price),
          },
        })),
      }
    }),
  })
})
