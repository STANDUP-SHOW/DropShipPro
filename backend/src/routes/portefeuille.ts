import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { getStripe } from '../services/billing.js'
import { etatCompte, lienInscription, lienTableauDeBord } from '../services/marketStripe.js'

/**
 * Le portefeuille du vendeur (21/11/2026, demande de max : « le client demande
 * où est sa wallet », même en argent de test).
 *
 * Une seule vue pour l'argent de ses ventes, vitrines DropShop et DropShop
 * Market confondues :
 * - **en attente** : ventes payées sur le Stripe de la plateforme, pas encore
 *   virées (paiements non activés, ou virement en cours) ;
 * - **sur son compte Stripe** : le solde réel de son compte Connect,
 *   disponible et en cours, lu chez Stripe — jamais recalculé chez nous ;
 * - l'historique de ses ventes, ligne par ligne.
 *
 * Le mode (test ou réel) est dit tel quel : il vient de la clé posée par max.
 */
export const portefeuilleRouter = Router()
portefeuilleRouter.use(requireAuth)

type Statut = 'versee' | 'en-attente' | 'chez-vous' | 'remboursee'

function modeStripe(): 'test' | 'reel' | null {
  const cle = process.env.STRIPE_SECRET_KEY || ''
  if (!cle) return null
  return cle.startsWith('sk_live') || cle.startsWith('rk_live') ? 'reel' : 'test'
}

portefeuilleRouter.get('/', async (req: AuthedRequest, res) => {
  const userId = req.userId!
  try {
    const compte = await etatCompte(userId).catch((e) => {
      console.error('[portefeuille] état Stripe', e instanceof Error ? e.message : e)
      return { inscrit: false, actif: false, detailsEnvoyes: false, virements: false, erreur: true as const }
    })

    const lignes = await prisma.order.findMany({
      where: { userId, platform: { in: ['OWN_SITE', 'DROPSHOP_MARKET'] }, paidAt: { not: null } },
      include: { product: { select: { title: true, aiTitle: true, shop: { select: { name: true } } } } },
      orderBy: { paidAt: 'desc' },
      take: 200,
    })

    const ventes = lignes.map((o) => {
      const montant = Number(o.amount)
      const commission = Number(o.commission ?? 0)
      const plateforme = o.commission != null
      const statut: Statut =
        o.status === 'REFUNDED' ? 'remboursee' : !plateforme ? 'chez-vous' : o.stripeTransferId ? 'versee' : 'en-attente'
      return {
        id: o.id,
        date: o.paidAt,
        canal: o.platform === 'DROPSHOP_MARKET' ? 'DropShop Market' : `Vitrine ${o.product.shop?.name ?? ''}`.trim(),
        titre: o.product.aiTitle || o.product.title,
        quantite: o.quantity,
        montant,
        commission,
        part: Math.round((montant - commission) * 100) / 100,
        statut,
      }
    })

    const somme = (s: Statut) => Math.round(ventes.filter((v) => v.statut === s).reduce((t, v) => t + v.part, 0) * 100) / 100

    // Le solde réel du compte Connect, lu chez Stripe.
    let surCompte: { disponible: number; enCours: number } | null = null
    const s = getStripe()
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeConnectId: true } })
    if (s && user?.stripeConnectId && compte.actif) {
      try {
        const b = await s.balance.retrieve({}, { stripeAccount: user.stripeConnectId })
        const eur = (l: Array<{ amount: number; currency: string }>) => l.filter((x) => x.currency === 'eur').reduce((t, x) => t + x.amount, 0) / 100
        surCompte = { disponible: eur(b.available), enCours: eur(b.pending) }
      } catch (e) {
        console.error('[portefeuille] solde Stripe', e instanceof Error ? e.message : e)
      }
    }

    res.json({
      mode: modeStripe(),
      compte,
      solde: { enAttente: somme('en-attente'), verse: somme('versee'), chezVous: somme('chez-vous'), surCompte },
      ventes,
    })
  } catch (e) {
    console.error('[portefeuille]', e instanceof Error ? e.message : e)
    res.status(500).json({ error: 'Portefeuille illisible pour le moment. Réessayez dans un instant.' })
  }
})

/** Activer (ou terminer) ses paiements : formulaire Stripe hébergé, retour sur le portefeuille. */
portefeuilleRouter.post('/activer', async (req: AuthedRequest, res) => {
  try {
    res.json({ url: await lienInscription(req.userId!, '/portefeuille') })
  } catch (e) {
    console.error('[portefeuille] inscription Stripe', e instanceof Error ? e.message : e)
    res.status(502).json({ error: 'Stripe ne répond pas pour le moment. Réessayez dans un instant.' })
  }
})

/**
 * Retirer : virement du solde disponible vers l'IBAN du vendeur. Si Stripe le
 * refuse (virements automatiques, solde trop récent…), on rend son tableau de
 * bord Stripe, où il voit et gère ses virements.
 */
portefeuilleRouter.post('/retirer', async (req: AuthedRequest, res) => {
  const s = getStripe()
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { stripeConnectId: true, stripeConnectReady: true } })
  if (!s || !user?.stripeConnectId || !user.stripeConnectReady) {
    return res.status(400).json({ error: "Activez d'abord vos paiements : c'est là que Stripe vous demande votre IBAN." })
  }
  try {
    const b = await s.balance.retrieve({}, { stripeAccount: user.stripeConnectId })
    const dispo = b.available.filter((x) => x.currency === 'eur').reduce((t, x) => t + x.amount, 0)
    if (dispo <= 0) return res.status(400).json({ error: "Rien n'est encore disponible au retrait : les ventes récentes restent « en cours » quelques jours chez Stripe." })
    const virement = await s.payouts.create({ amount: dispo, currency: 'eur' }, { stripeAccount: user.stripeConnectId })
    res.json({ ok: true, montant: dispo / 100, arrivee: virement.arrival_date ? new Date(virement.arrival_date * 1000) : null })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[portefeuille] retrait', message)
    const url = await lienTableauDeBord(req.userId!).catch(() => null)
    res.status(409).json({ error: `Stripe n'a pas accepté le retrait : ${message}`, tableauDeBord: url })
  }
})

/** Le tableau de bord Stripe Express du vendeur : virements, IBAN, relevés. */
portefeuilleRouter.post('/stripe', async (req: AuthedRequest, res) => {
  try {
    const url = await lienTableauDeBord(req.userId!)
    if (!url) return res.status(400).json({ error: "Activez d'abord vos paiements." })
    res.json({ url })
  } catch (e) {
    console.error('[portefeuille] tableau de bord Stripe', e instanceof Error ? e.message : e)
    res.status(502).json({ error: 'Stripe ne répond pas pour le moment. Réessayez dans un instant.' })
  }
})
