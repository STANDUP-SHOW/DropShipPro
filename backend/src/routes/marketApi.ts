import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin, type AuthedRequest } from '../middleware/auth.js'
import { etatCompte, lienInscription, lienTableauDeBord, MarketIndisponible, rembourserLigne } from '../services/marketStripe.js'
import { lireIdentite, identiteDe, emettreFacture, pageFacture, ErreurFacture } from '../services/marketFactures.js'
import { sendMail } from '../services/mailer.js'
import { COMMISSION, marketUrl, offresDe } from '../services/market.js'
import { rattraperBoutiquesSurMarket } from '../services/marketAuto.js'

/**
 * DropShop Market, côté application : l'espace vendeur et l'admin simplifié.
 *
 *   /api/market/vendeur          état (Stripe, annonces, ventes, adresses des flux)
 *   /api/market/vendeur/stripe   lien d'inscription Stripe (création du compte Express)
 *   /api/market/vendeur/stripe/tableau  lien vers le tableau de bord Stripe Express
 *   /api/market/vendeur/ventes   ventes, retours, factures (28/10/2026)
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
    const [stripe, annonces, ventes, shops, reglage] = await Promise.all([
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
      prisma.user.findUnique({ where: { id: userId }, select: { marketAuto: true } }),
    ])
    const base = marketUrl()
    res.json({
      commission: COMMISSION,
      auto: reglage?.marketAuto ?? true,
      stripe,
      annonces: annonces.map((p) => {
        const offres = offresDe(p.product)
        return {
          productId: p.productId,
          titre: p.product.aiTitle || p.product.title,
          url: `${base}${offres[0].cheminProduit}`,
          variantes: offres.filter((o) => o.cle).length,
          prime: p.product.marketPrime,
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

/**
 * Publication automatique : tout produit publié sur la boutique du vendeur part
 * aussi sur le Market, sauf s'il la désactive ici. Désactiver n'enlève rien de
 * ce qui est déjà en ligne : cela arrête seulement les prochaines diffusions.
 */
marketApiRouter.put('/vendeur/auto', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ actif: z.boolean() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Demande invalide.' })
  try {
    await prisma.user.update({ where: { id: req.userId! }, data: { marketAuto: parsed.data.actif } })
    // Réactiver remet sur le Market ce qui a été mis en boutique entre-temps.
    const ajoutes = parsed.data.actif ? await rattraperBoutiquesSurMarket(req.userId!) : 0
    res.json({ ok: true, auto: parsed.data.actif, ajoutes })
  } catch (err) {
    console.error('[market] auto', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "Le réglage n'a pas pu être enregistré.", motif: 'auto' })
  }
})

/**
 * Le mode Prime d'une annonce : « livré en 24 h ».
 *
 * Le vendeur le déclare lui-même et s'y engage (stock en France, expédition le
 * jour même) : la promesse est affichée aux acheteurs et déclarée à Google, qui
 * la contrôle. Un article qui part de l'étranger ne peut pas être Prime.
 */
const primeSchema = z.object({ prime: z.boolean(), engagement: z.boolean().optional() })

marketApiRouter.post('/vendeur/annonces/:productId/prime', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = primeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Demande invalide.' })
  if (parsed.data.prime && !parsed.data.engagement) {
    return res.status(400).json({ error: "Pour passer un article en Prime, confirmez qu'il est en stock en France et expédié le jour même." })
  }
  try {
    const r = await prisma.product.updateMany({
      where: { id: req.params.productId, userId: req.userId!, publications: { some: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED' } } },
      data: { marketPrime: parsed.data.prime },
    })
    if (!r.count) return res.status(404).json({ error: "Cet article n'est pas publié sur DropShop Market." })
    res.json({ ok: true, prime: parsed.data.prime })
  } catch (err) {
    console.error('[market] prime', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "Le mode Prime n'a pas pu être enregistré.", motif: 'prime' })
  }
})

// ——— Admin simplifié ———

marketApiRouter.get('/admin', requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  try {
    const depuis = new Date(Date.now() - 30 * 24 * 3600_000)
    const [annonces, annoncesPrime, vendeursActifs, inscrits, ventes, totaux, totaux30] = await Promise.all([
      prisma.publication.count({ where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED' } }),
      prisma.publication.count({ where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', product: { marketPrime: true } } }),
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
        annoncesPrime,
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
        prime: p.product.marketPrime,
      })),
    })
  } catch (err) {
    console.error('[market] admin annonces', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Annonces indisponibles.', motif: 'admin-annonces' })
  }
})

/** L'admin retire le badge Prime d'une annonce (promesse de 24 h non tenue). */
marketApiRouter.post('/admin/annonces/:productId/retirer-prime', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const r = await prisma.product.updateMany({ where: { id: req.params.productId }, data: { marketPrime: false } })
    if (!r.count) return res.status(404).json({ error: 'Annonce introuvable.' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[market] retrait prime', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "Le retrait du badge Prime n'a pas pu être enregistré.", motif: 'retrait-prime' })
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

// ——— Ventes, retours, factures et remboursements du vendeur (28/10/2026) ———

const STATUTS_RETOUR: Record<string, string> = { DEMANDE: 'Demandé', ACCEPTE: 'Accepté', REFUSE: 'Refusé', REMBOURSE: 'Remboursé' }
const MOTIFS: Record<string, string> = {
  retractation: 'Rétractation (14 jours)',
  defectueux: 'Produit défectueux ou abîmé',
  'non-conforme': 'Produit non conforme',
  erreur: 'Mauvais article reçu',
  'non-recu': 'Colis non reçu',
}

marketApiRouter.get('/vendeur/ventes', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const [user, lignes] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { factureIdentite: true } }),
      prisma.order.findMany({
        where: { userId: req.userId!, platform: 'DROPSHOP_MARKET', paidAt: { not: null } },
        include: { product: { select: { title: true, aiTitle: true } }, marketRetours: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { paidAt: 'desc' },
        take: 300,
      }),
    ])
    const identite = identiteDe(user.factureIdentite)
    res.json({
      identite: identite ?? (user.factureIdentite as Record<string, unknown> | null) ?? null,
      identiteComplete: Boolean(identite),
      ventes: lignes.map((o) => {
        const r = o.marketRetours[0]
        return {
          id: o.id,
          numero: o.marketNumero,
          titre: o.product.aiTitle || o.product.title,
          variante: o.variante,
          quantite: o.quantity,
          montant: Number(o.amount),
          commission: Number(o.commission ?? 0),
          acheteur: o.buyerName,
          email: o.buyerEmail,
          payeeLe: o.paidAt,
          statut: o.status,
          suivi: o.trackingNumber,
          partVersee: Boolean(o.stripeTransferId),
          facture: o.factureNumero,
          avoir: o.avoirNumero,
          rembourseLe: o.rembourseAt,
          retour: r
            ? { id: r.id, statut: r.statut, statutLibelle: STATUTS_RETOUR[r.statut] ?? r.statut, motif: MOTIFS[r.motif] ?? r.motif, message: r.message, reponse: r.reponse, adresseRetour: r.adresseRetour, demandeLe: r.createdAt }
            : null,
        }
      }),
    })
  } catch (err) {
    console.error('[market] ventes', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Vos ventes Market n\'ont pas pu être chargées.', motif: 'ventes' })
  }
})

marketApiRouter.put('/vendeur/facturation', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const identite = lireIdentite(req.body?.identite)
    await prisma.user.update({ where: { id: req.userId! }, data: { factureIdentite: identite as unknown as object } })
    res.json({ identite, identiteComplete: true })
  } catch (err) {
    if (err instanceof ErreurFacture) return res.status(400).json({ error: err.message })
    console.error('[market] facturation', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "L'identité de facturation n'a pas pu être enregistrée.", motif: 'facturation' })
  }
})

marketApiRouter.post('/vendeur/commandes/:id/facture', requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json({ numero: await emettreFacture(req.params.id, req.userId!) })
  } catch (err) {
    if (err instanceof ErreurFacture) return res.status(409).json({ error: err.message })
    console.error('[market] facture', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "La facture n'a pas pu être émise.", motif: 'facture' })
  }
})

/** La facture (ou l'avoir) en HTML, pour l'ouvrir et l'imprimer. */
marketApiRouter.get('/vendeur/commandes/:id/facture', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const o = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.userId! }, select: { id: true } })
    const html = o ? await pageFacture(o.id, req.query.type === 'avoir' ? 'avoir' : 'facture') : null
    if (!html) return res.status(404).json({ error: 'Aucune facture pour cette vente.' })
    res.set('Cache-Control', 'no-store').type('html').send(html)
  } catch (err) {
    console.error('[market] lecture facture', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "La facture n'a pas pu être affichée.", motif: 'lecture-facture' })
  }
})

marketApiRouter.post('/vendeur/commandes/:id/rembourser', requireAuth, async (req: AuthedRequest, res) => {
  try {
    res.json(await rembourserLigne(req.params.id, req.userId!))
  } catch (err) {
    if (err instanceof MarketIndisponible) return res.status(409).json({ error: err.message })
    erreur(res, err, 'remboursement')
  }
})

const reponseRetour = z.object({
  action: z.enum(['accepter', 'refuser']),
  message: z.string().trim().max(2000).optional().default(''),
  adresse: z.string().trim().max(500).optional().default(''),
})

marketApiRouter.post('/vendeur/retours/:id', requireAuth, async (req: AuthedRequest, res) => {
  const p = reponseRetour.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Réponse invalide.' })
  const { action, message, adresse } = p.data
  if (action === 'accepter' && adresse.length < 10) return res.status(400).json({ error: "Indiquez l'adresse où l'acheteur doit renvoyer le colis." })
  if (action === 'refuser' && message.length < 10) return res.status(400).json({ error: "Expliquez à l'acheteur pourquoi vous refusez (10 caractères au moins)." })
  try {
    const r = await prisma.marketRetour.findFirst({
      where: { id: req.params.id, order: { userId: req.userId! } },
      include: { order: { include: { product: { select: { title: true, aiTitle: true } } } } },
    })
    if (!r) return res.status(404).json({ error: 'Demande de retour introuvable.' })
    if (r.statut === 'REMBOURSE') return res.status(409).json({ error: 'Ce retour est déjà remboursé.' })
    const statut = action === 'accepter' ? 'ACCEPTE' : 'REFUSE'
    await prisma.marketRetour.update({ where: { id: r.id }, data: { statut, reponse: message || null, adresseRetour: action === 'accepter' ? adresse : r.adresseRetour, majAt: new Date() } })

    const o = r.order
    if (o.buyerEmail) {
      const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const titre = esc(o.product.aiTitle || o.product.title)
      await sendMail({
        to: o.buyerEmail,
        subject: `DropShop Market — votre demande de retour ${action === 'accepter' ? 'est acceptée' : "n'est pas acceptée"}${o.marketNumero ? ` (${o.marketNumero})` : ''}`,
        heading: action === 'accepter' ? 'Votre retour est accepté.' : "Le vendeur n'accepte pas ce retour.",
        body:
          action === 'accepter'
            ? `${o.quantity} × ${titre}<br><br>Renvoyez le produit, dans son état d'origine, à cette adresse :<br><b>${esc(adresse).replace(/\n/g, '<br>')}</b>${message ? `<br><br>Message du vendeur : « ${esc(message)} »` : ''}<br><br>Vous êtes remboursé au plus tard 14 jours après votre demande ; le remboursement peut attendre la réception du colis ou la preuve de son envoi. Gardez votre preuve de dépôt.`
            : `${o.quantity} × ${titre}<br><br>Réponse du vendeur : « ${esc(message)} »<br><br>Si vous pensez que c'est une erreur (rétractation dans les 14 jours, produit défectueux ou non conforme), répondez depuis la page de contact du Market : nous suivons votre demande.`,
        ...(o.marketNumero ? { actionLabel: 'Voir ma commande', actionUrl: `${marketUrl()}/suivi?numero=${encodeURIComponent(o.marketNumero)}&email=${encodeURIComponent(o.buyerEmail)}` } : {}),
        footer: 'DropShop Market (drop-shop.cloud).',
        brand: 'DropShop Market',
      }).catch((e) => console.error('[market] email de retour', e instanceof Error ? e.message : e))
    }
    res.json({ ok: true, statut })
  } catch (err) {
    console.error('[market] retour', err instanceof Error ? err.message : err)
    res.status(500).json({ error: "La réponse n'a pas pu être enregistrée.", motif: 'retour' })
  }
})
