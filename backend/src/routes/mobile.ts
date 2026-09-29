/**
 * API Link — le contrat de l'application mobile DropShipper (compagnon).
 *
 * Écrit le 29/09/2026 sur le contrat envoyé par Max (docs/v2/api-link-mobile.md) :
 * mêmes chemins, mêmes noms de champs, pour que l'application se branche sans
 * couche d'adaptation. Monté sous `/api/mobile`.
 *
 * Trois règles propres à ce routeur :
 *
 * - **Les erreurs sortent en `{ "detail": "…" }`**, le format que l'application
 *   attend. Le reste de l'API répond `{ error }` : un filtre sur `res.json`
 *   traduit, ce qui permet de réutiliser `requireAuth` tel quel (même jeton JWT
 *   de 30 jours que le site, même refus d'un compte disparu).
 * - **Aucune donnée n'est inventée.** Chaque chiffre du tableau de bord se
 *   recalcule depuis les commandes, les tickets et la file de partage ; ce qui
 *   n'existe pas encore vaut `null`, jamais un zéro qui ressemblerait à une
 *   mesure.
 * - **Les notifications sont DÉRIVÉES de l'état réel**, comme le bloc
 *   « Notifications » du site (stats.ts) : une vente à commander, une commande
 *   fournisseur qui attend son règlement, un colis parti, un solde bas, un
 *   ticket ouvert. Seul l'état lu / traité est stocké (MobileNotificationState),
 *   sous une clé stable par objet (`sale:<id>`, `pay:<id>`…). Rien à tenir à
 *   jour ailleurs dans le code : une notification disparaît quand sa cause
 *   disparaît.
 *
 * « Approve & Pay » ne paie rien : la plateforme ne règle jamais un
 * fournisseur à la place du vendeur (docs/v2/DECISIONS.md). L'action renvoie
 * l'adresse où il règle lui-même.
 */
import { Router, type Response, type NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, signToken, type AuthedRequest } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { appUrl } from '../services/mailer.js'

export const mobileRouter = Router()

// Le format d'erreur du contrat : { detail }. Toute réponse 4xx/5xx qui sort en
// { error } (requireAuth, rateLimit…) est traduite au passage.
mobileRouter.use((_req, res: Response, next: NextFunction) => {
  const json = res.json.bind(res)
  res.json = (corps: unknown) => {
    if (res.statusCode >= 400 && corps && typeof corps === 'object' && 'error' in corps && !('detail' in corps)) {
      const { error, ...reste } = corps as { error: unknown }
      return json({ detail: typeof error === 'string' ? error : 'Erreur', ...reste })
    }
    return json(corps)
  }
  next()
})

const LIMITE_JETON_JOURS = 30

// ------------------------------------------------------------------ 1. Auth

function utilisateurPublic(u: { id: string; email: string; shopName: string | null; credits: number }) {
  return {
    id: u.id,
    email: u.email,
    name: u.shopName || u.email.split('@')[0],
    picture: null,
    // Pas d'abonnement chez nous : tout se paie en drops. Le solde est donné à côté.
    plan: 'Drops',
    drops: u.credits,
  }
}

const identifiantsSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) })

mobileRouter.post('/auth/login', rateLimit({ name: 'mobile-login', windowMs: 900_000, max: 15 }), async (req, res) => {
  const parsed = identifiantsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ detail: 'Email ou mot de passe invalide' })
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: parsed.data.email, mode: 'insensitive' } } })
    // Un seul message pour les trois cas (compte inconnu, compte Google sans mot
    // de passe, mot de passe faux) : comme /api/auth/login, rien n'est révélé.
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ detail: 'Email ou mot de passe incorrect' })
    }
    res.json({ token: signToken(user.id), expires_in_days: LIMITE_JETON_JOURS, user: utilisateurPublic(user) })
  } catch (err) {
    console.error('mobile login', err)
    res.status(503).json({ detail: 'Service momentanément indisponible' })
  }
})

// Tout ce qui suit exige le jeton.
mobileRouter.use(requireAuth)

/** Express 4 fait PENDRE une requête dont le handler async lève : chaque route passe par ici. */
function route(fn: (req: AuthedRequest, res: Response) => Promise<unknown>) {
  return (req: AuthedRequest, res: Response) => {
    fn(req, res).catch((err) => {
      console.error('api mobile', req.path, err)
      if (!res.headersSent) res.status(500).json({ detail: 'Erreur serveur, réessayez.' })
    })
  }
}

mobileRouter.get(
  '/auth/me',
  route(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
    res.json({ user: utilisateurPublic(user) })
  }),
)

// ------------------------------------------------------------- 2. Dashboard

type LigneVente = {
  amount: unknown
  quantity: number
  createdAt: Date
  supplierOrderId: string | null
  supplierOrderCost: unknown
  product: { supplierPrice: unknown; price: unknown; shippingCost: unknown } | null
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

/** Ce qu'une vente a coûté : le coût réel chez le fournisseur s'il est connu, sinon l'estimation de la fiche (même formule que supplierOrders.ts : prix fournisseur, à défaut prix d'achat relevé, plus le port). */
function coutDe(o: LigneVente): number {
  if (o.supplierOrderCost !== null && o.supplierOrderCost !== undefined) return n(o.supplierOrderCost)
  if (!o.product) return 0
  const achat = o.product.supplierPrice !== null && o.product.supplierPrice !== undefined ? n(o.product.supplierPrice) : n(o.product.price)
  return achat * (o.quantity || 1) + n(o.product.shippingCost)
}

async function ventesDepuis(userId: string, depuis: Date): Promise<LigneVente[]> {
  return prisma.order.findMany({
    where: { userId, createdAt: { gte: depuis }, status: { not: 'REFUNDED' } },
    select: {
      amount: true,
      quantity: true,
      createdAt: true,
      supplierOrderId: true,
      supplierOrderCost: true,
      product: { select: { supplierPrice: true, price: true, shippingCost: true } },
    },
  })
}

const arrondi = (x: number) => Math.round(x * 100) / 100

mobileRouter.get(
  '/dashboard/summary',
  route(async (req, res) => {
    const depuis = new Date(Date.now() - 30 * 86_400_000)
    const ventes = await ventesDepuis(req.userId!, depuis)
    const brut = ventes.reduce((s, o) => s + n(o.amount), 0)
    const net = brut - ventes.reduce((s, o) => s + coutDe(o), 0)
    res.json({
      currency: 'EUR',
      period: '30d',
      revenue_gross: arrondi(brut),
      net_profit: arrondi(net),
      margin_pct: brut > 0 ? Math.round((net / brut) * 1000) / 10 : null,
      // « Traitées par l'IA » = commandes déposées chez le fournisseur par la plateforme.
      ai_orders_processed: ventes.filter((o) => o.supplierOrderId).length,
      ai_orders_total: ventes.length,
    })
  }),
)

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

mobileRouter.get(
  '/dashboard/chart',
  route(async (req, res) => {
    const range = req.query.range === '24h' || req.query.range === '30d' ? req.query.range : '7d'
    const heures = range === '24h'
    const pas = heures ? 3_600_000 : 86_400_000
    const nombre = heures ? 24 : range === '30d' ? 30 : 7
    // Seaux alignés sur l'heure ou le jour (heure de Paris approximée par l'heure du serveur, UTC sur Railway).
    const maintenant = new Date()
    const fin = heures
      ? new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(), maintenant.getUTCHours() + 1))
      : new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + 1))
    const debut = new Date(fin.getTime() - nombre * pas)
    const ventes = await ventesDepuis(req.userId!, debut)
    const points = Array.from({ length: nombre }, (_, i) => {
      const t0 = debut.getTime() + i * pas
      const d = new Date(t0)
      return {
        label: heures ? `${String(d.getUTCHours()).padStart(2, '0')}h` : nombre === 7 ? JOURS[d.getUTCDay()] : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
        start: d.toISOString(),
        revenue: 0,
        profit: 0,
      }
    })
    for (const o of ventes) {
      const i = Math.floor((o.createdAt.getTime() - debut.getTime()) / pas)
      if (i < 0 || i >= nombre) continue
      points[i].revenue += n(o.amount)
      points[i].profit += n(o.amount) - coutDe(o)
    }
    res.json({ range, currency: 'EUR', points: points.map((p) => ({ ...p, revenue: arrondi(p.revenue), profit: arrondi(p.profit) })) })
  }),
)

mobileRouter.get(
  '/dashboard/copilot',
  route(async (req, res) => {
    const userId = req.userId!
    const depuis = new Date(Date.now() - 30 * 86_400_000)
    const [tickets, file, rayons, pilote] = await Promise.all([
      prisma.ticket.findMany({
        where: { userId, createdAt: { gte: depuis } },
        select: { status: true, messages: { select: { author: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
      }),
      prisma.sharedLink.count({ where: { userId, status: 'NEW' } }),
      prisma.department.count({ where: { userId, autoMode: true, OR: [{ paidUntil: null }, { paidUntil: { gt: new Date() } }] } }),
      prisma.autopilot.findUnique({ where: { userId }, select: { enabled: true } }),
    ])
    // Délai de réponse : du premier message du vendeur à la première réponse d'un agent.
    const delais: number[] = []
    for (const t of tickets) {
      const premier = t.messages.find((m) => m.author === 'vendeur')
      const reponse = premier && t.messages.find((m) => m.author === 'agent' && m.createdAt >= premier.createdAt)
      if (premier && reponse) delais.push((reponse.createdAt.getTime() - premier.createdAt.getTime()) / 1000)
    }
    res.json({
      avg_response_seconds: delais.length ? Math.round(delais.reduce((s, d) => s + d, 0) / delais.length) : null,
      resolution_rate: tickets.length ? Math.round((tickets.filter((t) => t.status !== 'OUVERT').length / tickets.length) * 100) : null,
      sourcing_queue: file,
      active_agents: rayons + (pilote?.enabled ? 1 : 0),
    })
  }),
)

// --------------------------------------------------------- 3. Notifications

type TypeNotif = 'rpa_validation' | 'low_balance' | 'ai_escalation' | 'new_sale' | 'order_shipped'

interface Notif {
  id: string
  type: TypeNotif
  critical: boolean
  title: string
  body: string
  actions: Array<{ id: string; label: string; style: 'primary' | 'ghost' }>
  read: boolean
  resolved: boolean
  resolution: string | null
  created_at: string
  /** Où ouvrir l'objet sur le site ; ajouté au contrat, sans effet si l'application l'ignore. */
  url: string | null
}

/** Préférences par défaut : celles de l'exemple du contrat. */
const PREFS_DEFAUT = { new_sales: false, order_shipped: false, low_balance_margin: true, rpa_validation: true, ai_escalation: true }
type Prefs = typeof PREFS_DEFAUT
const PREF_DU_TYPE: Record<TypeNotif, keyof Prefs> = {
  new_sale: 'new_sales',
  order_shipped: 'order_shipped',
  low_balance: 'low_balance_margin',
  rpa_validation: 'rpa_validation',
  ai_escalation: 'ai_escalation',
}

/** Sous ce solde, un vendeur ne peut plus importer dix annonces : on le prévient. */
const SOLDE_BAS = 120

function lirePrefs(brut: unknown): Prefs {
  const p = { ...PREFS_DEFAUT }
  if (brut && typeof brut === 'object') {
    for (const k of Object.keys(PREFS_DEFAUT) as Array<keyof Prefs>) {
      const v = (brut as Record<string, unknown>)[k]
      if (typeof v === 'boolean') p[k] = v
    }
  }
  return p
}

const euros = (v: unknown) => `${n(v).toFixed(2).replace('.', ',')} €`

/** Les notifications du compte, dérivées de l'état réel, filtrées par ses préférences. */
async function notificationsDe(userId: string): Promise<Notif[]> {
  const depuis = new Date(Date.now() - 14 * 86_400_000)
  const [user, aCommander, aRegler, parties, tickets, etats] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true, mobilePrefs: true } }),
    prisma.order.findMany({
      where: { userId, status: 'NEW', createdAt: { gte: depuis } },
      select: { id: true, amount: true, platform: true, createdAt: true, product: { select: { title: true, aiTitle: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.order.findMany({
      where: { userId, status: 'ORDERED_FROM_SUPPLIER', trackingNumber: null, supplierOrderId: { not: null }, supplierOrderedAt: { gte: depuis } },
      select: { id: true, buyerName: true, supplierOrderUrl: true, supplierOrderCost: true, supplierOrderedAt: true, product: { select: { title: true, aiTitle: true } } },
      orderBy: { supplierOrderedAt: 'desc' },
      take: 50,
    }),
    prisma.order.findMany({
      where: { userId, status: 'SHIPPED', updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      select: { id: true, trackingNumber: true, carrier: true, updatedAt: true, product: { select: { title: true, aiTitle: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.ticket.findMany({ where: { userId, status: 'OUVERT' }, select: { id: true, subject: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.mobileNotificationState.findMany({ where: { userId } }),
  ])
  const prefs = lirePrefs(user.mobilePrefs)
  const titreDe = (p: { title: string; aiTitle: string | null } | null) => (p ? p.aiTitle || p.title : 'Produit')
  const site = appUrl()

  const brutes: Array<Omit<Notif, 'read' | 'resolved' | 'resolution'>> = [
    ...aRegler.map((o) => ({
      id: `pay:${o.id}`,
      type: 'rpa_validation' as const,
      critical: true,
      title: `Commande prête à être réglée pour ${o.buyerName}`,
      body: `${titreDe(o.product)} a été déposé chez le fournisseur${o.supplierOrderCost ? ` (${euros(o.supplierOrderCost)})` : ''}. Il attend votre règlement : rien n'est débité sans vous.`,
      actions: [
        { id: 'approve_pay', label: 'Régler chez le fournisseur', style: 'primary' as const },
        { id: 'review', label: 'Voir la commande', style: 'ghost' as const },
      ],
      created_at: (o.supplierOrderedAt ?? new Date()).toISOString(),
      url: o.supplierOrderUrl ?? `${site}/orders`,
    })),
    ...(user.credits < SOLDE_BAS
      ? [
          {
            // Une par jour : relue le lendemain si le solde est toujours bas.
            id: `balance:${new Date().toISOString().slice(0, 10)}`,
            type: 'low_balance' as const,
            critical: user.credits < 20,
            title: 'Solde de drops bas',
            body: `Il vous reste ${user.credits} drops, soit moins de dix imports. Rechargez pour que les imports et l'AUTO-SHIPPER continuent.`,
            actions: [{ id: 'refill_wallet', label: 'Recharger', style: 'primary' as const }],
            created_at: new Date().toISOString(),
            url: `${site}/billing`,
          },
        ]
      : []),
    ...tickets.map((t) => ({
      id: `ticket:${t.id}`,
      type: 'ai_escalation' as const,
      critical: Date.now() - t.createdAt.getTime() > 86_400_000,
      title: 'Un agent attend votre décision',
      body: t.subject,
      actions: [
        { id: 'take_over', label: 'Reprendre la main', style: 'primary' as const },
        { id: 'review', label: 'Voir', style: 'ghost' as const },
      ],
      created_at: t.createdAt.toISOString(),
      url: `${site}/tickets`,
    })),
    ...aCommander.map((o) => ({
      id: `sale:${o.id}`,
      type: 'new_sale' as const,
      critical: false,
      title: 'Nouvelle vente',
      body: `${titreDe(o.product)} — ${euros(o.amount)} sur ${o.platform}. À commander chez le fournisseur.`,
      actions: [{ id: 'review', label: 'Voir la commande', style: 'primary' as const }],
      created_at: o.createdAt.toISOString(),
      url: `${site}/orders`,
    })),
    ...parties.map((o) => ({
      id: `ship:${o.id}`,
      type: 'order_shipped' as const,
      critical: false,
      title: 'Colis expédié',
      body: `${titreDe(o.product)}${o.trackingNumber ? ` — suivi ${o.trackingNumber}${o.carrier ? ` (${o.carrier})` : ''}` : ''}.`,
      actions: [{ id: 'review', label: 'Voir', style: 'ghost' as const }],
      created_at: o.updatedAt.toISOString(),
      url: `${site}/orders`,
    })),
  ]

  const etatDe = new Map(etats.map((e) => [e.key, e]))
  return brutes
    .filter((b) => prefs[PREF_DU_TYPE[b.type]])
    .map((b) => {
      const e = etatDe.get(b.id)
      return { ...b, read: e?.read ?? false, resolved: e?.resolved ?? false, resolution: e?.resolution ?? null }
    })
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.created_at.localeCompare(a.created_at))
}

mobileRouter.get(
  '/notifications',
  route(async (req, res) => {
    const items = await notificationsDe(req.userId!)
    res.json({ unread: items.filter((i) => !i.read).length, items })
  }),
)

async function marquer(userId: string, key: string, data: { read?: boolean; resolved?: boolean; resolution?: string | null }) {
  await prisma.mobileNotificationState.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, read: data.read ?? false, resolved: data.resolved ?? false, resolution: data.resolution ?? null },
    update: data,
  })
}

mobileRouter.post(
  '/notifications/read-all',
  route(async (req, res) => {
    const items = await notificationsDe(req.userId!)
    for (const i of items.filter((x) => !x.read)) await marquer(req.userId!, i.id, { read: true })
    res.json({ status: 'ok' })
  }),
)

mobileRouter.post(
  '/notifications/:id/read',
  route(async (req, res) => {
    const items = await notificationsDe(req.userId!)
    if (!items.some((i) => i.id === req.params.id)) return res.status(404).json({ detail: 'Notification introuvable' })
    await marquer(req.userId!, req.params.id, { read: true })
    res.json({ status: 'ok' })
  }),
)

const ACTIONS = ['approve_pay', 'refill_wallet', 'take_over', 'review'] as const

mobileRouter.post(
  '/notifications/:id/action',
  route(async (req, res) => {
    const parsed = z.object({ action_id: z.enum(ACTIONS) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ detail: `action_id attendu parmi : ${ACTIONS.join(', ')}` })
    const items = await notificationsDe(req.userId!)
    const item = items.find((i) => i.id === req.params.id)
    if (!item) return res.status(404).json({ detail: 'Notification introuvable' })
    if (!item.actions.some((a) => a.id === parsed.data.action_id)) {
      return res.status(400).json({ detail: `Cette notification ne propose pas l'action « ${parsed.data.action_id} ».` })
    }

    const MESSAGES: Record<(typeof ACTIONS)[number], { resolution: string | null; message: string; resolved: boolean }> = {
      // Nous ne réglons jamais un fournisseur à la place du vendeur : on lui ouvre la page où il règle.
      approve_pay: { resolution: 'payment_opened', resolved: true, message: 'Ouvrez la commande chez le fournisseur pour la régler : rien n’est débité sans vous.' },
      refill_wallet: { resolution: 'refill_opened', resolved: true, message: 'Rechargez vos drops depuis la page Facturation.' },
      take_over: { resolution: 'taken_over', resolved: true, message: 'Vous reprenez la main : la conversation vous attend sur le site.' },
      review: { resolution: null, resolved: false, message: 'Ouvrez l’objet sur le site pour le consulter.' },
    }
    const m = MESSAGES[parsed.data.action_id]
    await marquer(req.userId!, item.id, { read: true, ...(m.resolved ? { resolved: true, resolution: m.resolution } : {}) })
    res.json({
      item: { ...item, read: true, resolved: m.resolved || item.resolved, resolution: m.resolved ? m.resolution : item.resolution },
      message: m.message,
      url: item.url,
    })
  }),
)

mobileRouter.post(
  '/register-push',
  route(async (req, res) => {
    const parsed = z
      .object({ platform: z.enum(['ios', 'android']), device_token: z.string().trim().min(10).max(4096), user_id: z.string().optional() })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ detail: 'platform (ios|android) et device_token requis' })
    // Le compte est celui du jeton, jamais celui du corps : sinon n'importe qui
    // inscrirait son téléphone aux alertes d'un autre.
    await prisma.pushDevice.upsert({
      where: { deviceToken: parsed.data.device_token },
      create: { userId: req.userId!, platform: parsed.data.platform, deviceToken: parsed.data.device_token },
      update: { userId: req.userId!, platform: parsed.data.platform },
    })
    res.json({ status: 'registered' })
  }),
)

// ---------------------------------------------------------------- 4. Partage

/** Paramètres de pistage retirés d'une adresse partagée : ils ne désignent pas le produit. */
// Préfixes (`utm_…`) ou noms EXACTS : un préfixe court retirerait aussi un
// paramètre utile — « sk » emportait `sku_id`, qui désigne la variante (banc).
const PISTAGE = /^(utm_\w*|mc_\w*|sr_\w*|pd_rd_\w*|pf_rd_\w*|algo_\w*|aff_\w*|spm|scm|_t|aff|src|ref|ref_|referrer|fbclid|gclid|share_?\w*|psc|smid|th|linkCode|tag|ascsubtag|gatewayAdapt|pdp_npi|btsid|ws_ab_test|_randl_\w*|terminal_id|afSmartRedirect)$/i

export function adressePropre(brut: string): string | null {
  const trouvee = /https?:\/\/[^\s<>"']+/i.exec(brut)?.[0]
  if (!trouvee) return null
  let u: URL
  try {
    u = new URL(trouvee.replace(/[),.;!?]+$/, ''))
  } catch {
    return null
  }
  for (const k of [...u.searchParams.keys()]) if (PISTAGE.test(k)) u.searchParams.delete(k)
  u.hash = ''
  return u.toString()
}

const SOURCES: Array<[RegExp, string]> = [
  [/aliexpress\./i, 'AliExpress'],
  [/temu\./i, 'Temu'],
  [/amazon\./i, 'Amazon'],
  [/vinted\./i, 'Vinted'],
  [/leboncoin\./i, 'Leboncoin'],
  [/shein\./i, 'Shein'],
  [/tiktok\./i, 'TikTok'],
  [/ebay\./i, 'eBay'],
  [/cjdropshipping\./i, 'CJ Dropshipping'],
  [/bigbuy\./i, 'BigBuy'],
  [/facebook\.|fb\.com/i, 'Facebook'],
]

const STATUT: Record<string, string> = { NEW: 'queued', CLAIMED: 'processing', DONE: 'done' }

function partagePublic(l: { id: string; url: string; source: string; status: string; createdAt: Date; title: string | null }) {
  return { id: l.id, clean_url: l.url, source: l.source, title: l.title, status: STATUT[l.status] ?? 'queued', created_at: l.createdAt.toISOString() }
}

mobileRouter.post(
  '/products/share',
  route(async (req, res) => {
    const parsed = z
      .object({ text: z.string().max(5000).optional(), url: z.string().max(2000).optional(), source: z.string().trim().max(40).optional() })
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ detail: 'Partage invalide' })
    const { text, url, source } = parsed.data
    const propre = adressePropre(url || '') ?? adressePropre(text || '')
    if (!propre) return res.status(400).json({ detail: 'Aucune adresse de produit trouvée dans ce partage.' })
    const origine = source || SOURCES.find(([re]) => re.test(propre))?.[1] || new URL(propre).hostname.replace(/^www\./, '')
    // Le texte partagé porte souvent le titre de la fiche : gardé en note, sans l'adresse.
    const note = text ? text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 2000) || null : null
    const link = await prisma.sharedLink.upsert({
      where: { userId_url: { userId: req.userId!, url: propre } },
      create: { userId: req.userId!, url: propre, source: origine, note },
      update: { source: origine, ...(note ? { note } : {}) },
    })
    res.status(201).json({ item: partagePublic(link), message: 'Produit envoyé dans votre espace DropShipper Desktop !' })
  }),
)

mobileRouter.get(
  '/products/shared',
  route(async (req, res) => {
    const liens = await prisma.sharedLink.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json({ items: liens.map(partagePublic) })
  }),
)

// ---------------------------------------------------------------- 5. Réglages

mobileRouter.get(
  '/settings/notifications',
  route(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { mobilePrefs: true } })
    res.json(lirePrefs(user.mobilePrefs))
  }),
)

mobileRouter.put(
  '/settings/notifications',
  route(async (req, res) => {
    const parsed = z
      .object({
        new_sales: z.boolean().optional(),
        order_shipped: z.boolean().optional(),
        low_balance_margin: z.boolean().optional(),
        rpa_validation: z.boolean().optional(),
        ai_escalation: z.boolean().optional(),
      })
      .strict()
      .safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ detail: `Champs attendus : ${Object.keys(PREFS_DEFAUT).join(', ')} (booléens)` })
    const actuel = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { mobilePrefs: true } })
    const prefs = { ...lirePrefs(actuel.mobilePrefs), ...parsed.data }
    await prisma.user.update({ where: { id: req.userId! }, data: { mobilePrefs: prefs } })
    res.json(prefs)
  }),
)
