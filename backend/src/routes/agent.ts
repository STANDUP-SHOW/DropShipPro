import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireApiKey, requireDesktop, type AgentRequest } from '../middleware/apiKey.js'
import { importerAdresse } from '../services/productImport.js'
import { reserveCredits, refundCredits } from '../services/billing.js'
import { DROPS } from '../services/tarifs.js'
import { ScrapeBlockedError } from '../services/scraper.js'
import { SEUIL_DROPS } from './marketReports.js'
import { comptesDe, publier as publierSocial, socialConfigure } from '../services/socialGateway.js'
import { brouillonPour } from '../services/socialDraft.js'
import { requireAdmin } from '../middleware/auth.js'
import { lireRapport, RapportInvalide } from '../services/marketReports.js'
import { enregistrerRapportPoste } from '../services/rapportsPoste.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { findDepartment } from '../services/departments.js'
import { runAutopilot } from '../services/autopilot.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { imagesPourExport } from '../services/exportImages.js'
import { etatPour } from '../services/productCondition.js'
import { titleForChannel } from '../services/channelCopy.js'
import type { Platform } from '@prisma/client'

/**
 * La porte d'entrée des agents de veille.
 *
 * Un agent extérieur — celui qui surveille les fournisseurs et les réseaux —
 * dépose ici ce qu'il a trouvé. Il ne peut rien faire d'autre : ni importer, ni
 * publier, ni payer. Ces trois gestes engagent le catalogue du vendeur, son
 * argent et ses comptes marchands ; ils restent derrière une session humaine.
 */
export const agentRouter = Router()

agentRouter.use(rateLimit({ name: 'agent', windowMs: 60_000, max: 120 }))
agentRouter.use(requireApiKey)

/** De quoi vérifier une clé fraîchement collée, sans rien écrire. */
agentRouter.get('/me', async (req: AgentRequest, res) => {
  const [user, waiting] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true, credits: true, plan: true } }),
    prisma.opportunity.count({ where: { userId: req.userId!, status: 'NEW' } }),
  ])
  res.json({ ok: true, compte: user?.email, credits: user?.credits, plan: user?.plan, opportunitesEnAttente: waiting })
})

/**
 * Traduit le rayon annoncé par l'agent en rayon réellement confié.
 *
 * Un agent peut se déclarer d'un rayon que le vendeur n'a pas ouvert. Le dépôt
 * n'est pas refusé pour autant — la trouvaille reste bonne — mais elle atterrit
 * dans la veille générale, et la réponse le dit plutôt que de le taire.
 */
async function resolveDepartment(userId: string, key: string | undefined) {
  if (!key) return { id: null as string | null, warning: null as string | null }
  const profile = findDepartment(key)
  if (!profile) return { id: null, warning: `Rayon « ${key} » inconnu, dépôt rangé dans la veille générale.` }

  const dept = await prisma.department.findUnique({ where: { userId_key: { userId, key: profile.key } } })
  if (!dept) {
    return { id: null, warning: `Rayon « ${profile.label} » non confié, dépôt rangé dans la veille générale.` }
  }
  // Plus d'abonnement (07/09/2026) : un rayon confié reçoit toujours ses dépôts.
  return { id: dept.id, warning: null }
}

const opportunitySchema = z.object({
  source: z.string().trim().min(1).max(40),
  /** Clé du rayon, quand l'agent en tient un : high-tech, jardinage… */
  department: z.string().trim().max(40).optional(),
  sourceUrl: z.string().url().max(2000),
  title: z.string().trim().min(1).max(300),
  image: z.string().url().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  sourcePrice: z.number().nonnegative(),
  /** Prix moyen constaté sur les places de marché. Absent est une réponse valable. */
  marketPrice: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  /**
   * Compteur de ventes de la plateforme source. Il faut le laisser vide quand
   * elle n'en publie pas — un zéro inventé se lirait comme « ne se vend pas ».
   */
  salesCount: z.number().int().nonnegative().optional(),
  /**
   * Trois états. Omettre le champ veut dire « je n'ai pas pu vérifier », ce qui
   * est le cas le plus fréquent d'une veille automatique — et ce n'est pas la
   * même chose que « pas de stock en Europe ».
   */
  euStock: z.boolean().nullable().optional(),
  /**
   * Nombre de jours, ou le texte de la plateforme : « 3-5 jours ouvrés »,
   * « sous 48h ». Un scan de trois heures ne doit pas être perdu parce que le
   * délai est arrivé sous une forme inattendue.
   */
  deliveryDays: z.union([z.number(), z.string()]).optional(),
  warranty: z.string().trim().max(120).optional(),
  isNew: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  raw: z.unknown().optional(),
})

/**
 * Lit un délai de livraison quelle que soit sa forme.
 *
 * Le premier vrai lot déposé par un agent a été perdu en entier parce qu'il
 * envoyait « 3-5 jours ouvrés » là où un entier était attendu. Le texte est donc
 * conservé tel quel, et le nombre en est extrait quand il s'y trouve : la borne
 * haute d'un intervalle, parce qu'un vendeur qui promet un délai doit annoncer
 * le pire, pas le meilleur.
 */
function readDelivery(value: number | string | undefined): { days: number | null; text: string | null } {
  if (value === undefined || value === null) return { days: null, text: null }
  if (typeof value === 'number') {
    return { days: Number.isFinite(value) ? Math.min(365, Math.max(0, Math.round(value))) : null, text: null }
  }

  const text = value.trim().slice(0, 120)
  const numbers = text.match(/\d+/g)
  if (!numbers) return { days: null, text: text || null }

  const worst = Math.max(...numbers.map(Number))
  return { days: worst <= 365 ? worst : null, text }
}

const batchSchema = z.object({
  opportunities: z.array(opportunitySchema).min(1).max(100),
})

/**
 * Dépôt d'un lot de trouvailles.
 *
 * Le même produit repéré à chaque passage ne doit pas empiler des doublons : la
 * ligne est mise à jour. Une opportunité déjà arbitrée — gardée, écartée,
 * importée — ne repasse pas en « nouvelle », sinon un scan toutes les trois
 * heures ressusciterait indéfiniment ce que le vendeur a écarté.
 */
agentRouter.post('/opportunities', async (req: AgentRequest, res) => {
  const parsed = batchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Lot invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  let created = 0
  let updated = 0
  const warnings: string[] = []
  const rejected: Array<{ sourceUrl: string; raison: string }> = []

  for (const o of parsed.data.opportunities) {
    const delivery = readDelivery(o.deliveryDays)
    const dept = await resolveDepartment(req.userId!, o.department)
    if (dept.warning && !warnings.includes(dept.warning)) warnings.push(dept.warning)
    const data = {
      source: o.source,
      title: o.title,
      image: o.image ?? null,
      category: o.category ?? null,
      sourcePrice: o.sourcePrice,
      marketPrice: o.marketPrice ?? null,
      currency: o.currency?.toUpperCase() ?? 'EUR',
      salesCount: o.salesCount ?? null,
      euStock: o.euStock ?? null,
      deliveryDays: delivery.days,
      deliveryText: delivery.text,
      warranty: o.warranty ?? null,
      isNew: o.isNew ?? false,
      notes: o.notes ?? null,
      raw: (o.raw ?? null) as never,
      departmentId: dept.id,
    }

    try {
      const existing = await prisma.opportunity.findUnique({
        where: { userId_sourceUrl: { userId: req.userId!, sourceUrl: o.sourceUrl } },
        select: { id: true, status: true },
      })

      if (!existing) {
        await prisma.opportunity.create({ data: { ...data, sourceUrl: o.sourceUrl, userId: req.userId! } })
        created++
      } else {
        // Les chiffres sont rafraîchis, l'arbitrage du vendeur est intouchable.
        await prisma.opportunity.update({ where: { id: existing.id }, data })
        updated++
      }
    } catch (e) {
      rejected.push({ sourceUrl: o.sourceUrl, raison: (e as Error).message })
    }
  }

  res.status(201).json({
    recues: parsed.data.opportunities.length,
    creees: created,
    mises_a_jour: updated,
    rejetees: rejected,
    avertissements: warnings,
  })
})

/** Ce que l'agent a déjà déposé, pour qu'il sache où il en est entre deux passages. */
agentRouter.get('/opportunities', async (req: AgentRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null
  const valid = ['NEW', 'KEPT', 'REJECTED', 'IMPORTED']

  const items = await prisma.opportunity.findMany({
    where: {
      userId: req.userId!,
      ...(status && valid.includes(status) ? { status: status as 'NEW' } : {}),
    },
    orderBy: { detectedAt: 'desc' },
    take: 200,
  })

  res.json({ count: items.length, opportunities: items })
})

const shareSchema = z.object({
  url: z.string().url().max(2000),
  /** Transmis par le partage système (Web Share Target : title, text, url) quand il y en a un. */
  title: z.string().trim().max(300).optional(),
  note: z.string().trim().max(4000).optional(),
  /** "mobile" par défaut ; laisse la place à un autre client demain (desktop, extension…). */
  source: z.string().trim().max(40).optional(),
})

/**
 * Le bouton « partager » du mobile : une URL, rien d'autre d'exigé.
 *
 * Volontairement séparé de `/opportunities`, qui attend un lot déjà analysé
 * (prix, marge…). Ici l'utilisateur vient de voir un produit dans une autre
 * app et clique « partager » — lui demander un prix ferait échouer le geste.
 * Le lien atterrit dans la file `SharedLink`, que l'application desktop (à
 * venir) videra pour lancer le téléchargement automatique chez le fournisseur.
 */
agentRouter.post('/share', async (req: AgentRequest, res) => {
  const parsed = shareSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Partage invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  const { url, title, note, source } = parsed.data
  const data = { title: title ?? null, note: note ?? null, source: source || 'mobile' }

  // Repartager le même lien remonte les infos (titre, note) sans dupliquer la
  // ligne — utile si un premier partage n'avait pas de titre et le suivant en a un.
  const link = await prisma.sharedLink.upsert({
    where: { userId_url: { userId: req.userId!, url } },
    create: { ...data, url, userId: req.userId! },
    update: data,
  })

  res.status(201).json({ ok: true, id: link.id, status: link.status })
})

/** Ce que l'application desktop récupère pour lancer le téléchargement automatique. */
agentRouter.get('/share', async (req: AgentRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null
  const valid = ['NEW', 'CLAIMED', 'DONE']

  const items = await prisma.sharedLink.findMany({
    where: {
      userId: req.userId!,
      ...(status && valid.includes(status) ? { status: status as 'NEW' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  res.json({ count: items.length, links: items })
})

/** L'application desktop marque un lien pris en charge, pour ne pas le retélécharger au passage suivant. */
agentRouter.post('/share/:id/claim', async (req: AgentRequest, res) => {
  const status = req.body?.status === 'DONE' ? 'DONE' : 'CLAIMED'
  const result = await prisma.sharedLink.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { status, claimedAt: new Date() },
  })
  if (result.count === 0) return res.status(404).json({ error: 'Lien introuvable' })
  res.json({ ok: true, status })
})

/**
 * La file de publication de l'application desktop.
 *
 * Les places de marché à session (Vinted, Leboncoin, Facebook) n'ont pas d'API :
 * `publisher.ts` y laisse la publication en PENDING. L'application desktop, dans
 * la session du vendeur, prend ces annonces ici. Aucune migration : c'est la
 * table `Publication` telle qu'elle est.
 *
 * Une clé machine peut LIRE la fiche à publier et DIRE ce qui s'est passé ; elle
 * ne déclenche rien chez nous. Le résultat n'accepte que PUBLISHED ou FAILED,
 * sur une publication PENDING du compte de la clé.
 */
const PLATEFORMES_SESSION = ['VINTED', 'LEBONCOIN', 'FACEBOOK'] as const

agentRouter.get('/publications', async (req: AgentRequest, res) => {
  try {
    const demandee = typeof req.query.platform === 'string' ? req.query.platform.toUpperCase() : null
    const plateformes = demandee && (PLATEFORMES_SESSION as readonly string[]).includes(demandee) ? [demandee as (typeof PLATEFORMES_SESSION)[number]] : [...PLATEFORMES_SESSION]

    const publications = await prisma.publication.findMany({
      where: { status: 'PENDING', platform: { in: plateformes }, product: { userId: req.userId! } },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    const items = []
    for (const p of publications) {
      const images = await imagesPourExport(p.product)
      items.push({
        id: p.id,
        platform: p.platform,
        productId: p.productId,
        // L'annonce RÉÉCRITE (titre à la longueur de la plateforme), pas le texte source du fournisseur.
        title: titleForChannel(p.product, p.platform),
        description: p.product.aiDescription || p.product.description,
        price: Number(p.product.sellingPrice ?? 0),
        category: p.targetCategory ?? null,
        condition: etatPour(p.product.condition, p.platform),
        ean: p.product.ean ?? null,
        images,
      })
    }
    res.json({ count: items.length, publications: items })
  } catch (e) {
    console.error('agent publications', e)
    res.status(500).json({ error: 'Impossible de lire la file de publication' })
  }
})

/**
 * Ce que l'application desktop fait de plus qu'un agent de veille : importer un
 * produit reçu (drops du vendeur, remboursés si rien n'est livré) et le mettre en
 * file de publication. Clé de type desktop seulement (`requireDesktop`).
 */
agentRouter.post('/import', requireDesktop as never, async (req: AgentRequest, res) => {
  const parsed = z.object({ url: z.string().url().max(2000), shareId: z.string().max(60).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'URL invalide' })

  const credit = await reserveCredits(req.userId!, DROPS.import, "Import d'une annonce (application desktop)")
  if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

  try {
    const { produit, reecrit, notes } = await importerAdresse(req.userId!, parsed.data.url)
    if (!reecrit) await refundCredits(req.userId!, DROPS.import)
    if (parsed.data.shareId) {
      await prisma.sharedLink.updateMany({ where: { id: parsed.data.shareId, userId: req.userId! }, data: { status: 'DONE', claimedAt: new Date() } })
    }
    res.status(201).json({ id: (produit as { id: string }).id, title: (produit as { title?: string }).title ?? null, reecrit, notes })
  } catch (err) {
    await refundCredits(req.userId!, DROPS.import)
    if (err instanceof ScrapeBlockedError) return res.status(422).json({ error: err.message })
    console.error('agent import', err)
    res.status(502).json({ error: "Cette page n'a pas pu être lue depuis notre serveur." })
  }
})

/**
 * La liste du jour des produits gagnants : une adresse par produit, tirée des
 * rapports des chefs de rayon (les mêmes que « Fresh news », avec le même seuil de
 * 500 drops). L'application desktop l'importe en groupe puis publie.
 *
 * Ne sortent que les produits que le SERVEUR sait importer (`import` api ou url :
 * les pages qui exigent l'extension sont écartées et comptées), avec une marge
 * connue au moins égale à `margeMin`, et que le vendeur n'a pas déjà en catalogue.
 * `categories` (rayons séparés par des virgules) restreint la liste aux rayons
 * choisis par le vendeur ; vide = tous. La réponse rend toujours `categories`,
 * les rayons du jour, pour que l'application puisse les proposer.
 */
agentRouter.get('/gagnants', requireDesktop as never, async (req: AgentRequest, res) => {
  try {
    const q = z.object({ margeMin: z.coerce.number().min(0).max(100).default(20), max: z.coerce.number().int().min(1).max(1000).default(500), categories: z.string().max(4000).optional() }).safeParse(req.query)
    if (!q.success) return res.status(400).json({ error: 'margeMin (0-100) et max (1-1000) attendus' })
    const rayon = (s: string) => s.trim().toLowerCase()
    const voulues = new Set((q.data.categories ?? '').split(',').map(rayon).filter(Boolean))

    const moi = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { credits: true } })
    if (moi.credits < SEUIL_DROPS) {
      return res.status(402).json({ error: `Les rapports du jour sont offerts aux comptes qui ont au moins ${SEUIL_DROPS} drops en banque. Il vous en manque ${SEUIL_DROPS - moi.credits}.`, seuil: SEUIL_DROPS, drops: moi.credits })
    }

    const dernier = await prisma.marketReport.findFirst({ orderBy: { day: 'desc' }, select: { day: true } })
    if (!dernier) return res.json({ jour: null, count: 0, ecartes: { extension: 0, dejaImportes: 0, margeInconnue: 0 }, categories: [], produits: [] })
    const rapports = await prisma.marketReport.findMany({ where: { day: dernier.day }, select: { categorie: true, produits: true } })

    const vus = new Set<string>()
    const ecartes = { extension: 0, dejaImportes: 0, margeInconnue: 0 }
    type Candidat = { url: string; titre: string; fournisseur: string; margePct: number; import: string; categorie: string }
    const candidats: Candidat[] = []
    const categories = [...new Set(rapports.map((r) => r.categorie))].sort((a, b) => a.localeCompare(b, 'fr'))
    for (const r of rapports) {
      if (voulues.size && !voulues.has(rayon(r.categorie))) continue
      for (const p of (r.produits ?? []) as unknown as Array<Record<string, unknown>>) {
        const url = typeof p.url === 'string' ? p.url : ''
        if (!/^https?:\/\//i.test(url) || vus.has(url)) continue
        vus.add(url)
        if (p.import === 'extension') {
          ecartes.extension++
          continue
        }
        const marge = typeof p.margePct === 'number' ? p.margePct : null
        if (marge === null) {
          ecartes.margeInconnue++
          continue
        }
        if (marge < q.data.margeMin) continue
        candidats.push({ url, titre: String(p.titre ?? ''), fournisseur: String(p.fournisseur ?? ''), margePct: marge, import: String(p.import ?? 'url'), categorie: r.categorie })
      }
    }

    const dejaLa = new Set((await prisma.product.findMany({ where: { userId: req.userId!, sourceUrl: { in: candidats.map((c) => c.url) } }, select: { sourceUrl: true } })).map((p) => p.sourceUrl))
    const produits = candidats.filter((c) => !dejaLa.has(c.url)).sort((a, b) => b.margePct - a.margePct)
    ecartes.dejaImportes = candidats.length - produits.length
    res.json({ jour: dernier.day, count: Math.min(produits.length, q.data.max), ecartes, categories, produits: produits.slice(0, q.data.max) })
  } catch (e) {
    console.error('agent gagnants', e)
    res.status(500).json({ error: 'Impossible de lire la liste des gagnants' })
  }
})

/**
 * Publie un produit sur les réseaux sociaux reliés du vendeur (Facebook, Instagram,
 * TikTok…), au brouillon de chaque réseau (`brouillonPour`). Clé desktop.
 * Sans réseau relié ou sans moteur social activé, la réponse le dit : ce n'est pas
 * une erreur. Un compte qui refuse n'empêche pas les autres ; le détail est rendu.
 * L'application desktop n'appelle qu'une fois par produit importé (elle le note).
 */
agentRouter.post('/social', requireDesktop as never, async (req: AgentRequest, res) => {
  const parsed = z.object({ productId: z.string().min(1).max(60) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'productId attendu' })
  const produit = await prisma.product.findFirst({ where: { id: parsed.data.productId, userId: req.userId! } })
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })

  if (!socialConfigure()) return res.json({ ok: true, publies: 0, comptes: 0, raison: "Le module réseaux sociaux n'est pas encore activé sur ce compte.", erreurs: [] })
  const comptes = (await comptesDe(req.userId!, { publicitaires: false })).filter((c) => c.connected)
  if (!comptes.length) return res.json({ ok: true, publies: 0, comptes: 0, raison: 'Aucun réseau social relié : reliez-en dans Réseaux sociaux.', erreurs: [] })

  const medias = (await imagesPourExport(produit)).slice(0, 4)
  let publies = 0
  const erreurs: Array<{ reseau: string; erreur: string }> = []
  for (const compte of comptes) {
    try {
      const brouillon = brouillonPour(produit, compte.platform, null)
      await publierSocial(req.userId!, { comptes: [compte.externalId], texte: brouillon.texte, medias })
      publies++
    } catch (err) {
      erreurs.push({ reseau: compte.platform, erreur: err instanceof Error ? err.message.slice(0, 200) : 'refus' })
    }
  }
  res.json({ ok: true, publies, comptes: comptes.length, erreurs })
})

const fileSchema = z.object({ productId: z.string().min(1).max(60), platforms: z.array(z.enum(PLATEFORMES_SESSION)).min(1).max(3) })

agentRouter.post('/publications', requireDesktop as never, async (req: AgentRequest, res) => {
  const parsed = fileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'productId et platforms (VINTED, LEBONCOIN, FACEBOOK) attendus' })
  const produit = await prisma.product.findFirst({ where: { id: parsed.data.productId, userId: req.userId! }, select: { id: true } })
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })

  const creees: string[] = []
  for (const platform of new Set(parsed.data.platforms)) {
    const existante = await prisma.publication.findUnique({ where: { productId_platform: { productId: produit.id, platform } } })
    // Une annonce déjà publiée ou en attente n'est pas remise en file : pas de doublon sur la plateforme.
    if (existante && existante.status !== 'FAILED') continue
    await prisma.publication.upsert({
      where: { productId_platform: { productId: produit.id, platform } },
      create: { productId: produit.id, platform, status: 'PENDING' },
      update: { status: 'PENDING', error: null, publishedAt: null },
    })
    creees.push(platform)
  }
  res.status(201).json({ ok: true, enFile: creees })
})

const resultatSchema = z.object({
  status: z.enum(['PUBLISHED', 'FAILED']),
  externalUrl: z.string().url().max(2000).optional(),
  error: z.string().trim().max(500).optional(),
})

agentRouter.post('/publications/:id/resultat', async (req: AgentRequest, res) => {
  const parsed = resultatSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Résultat invalide : status PUBLISHED ou FAILED attendu' })
  const { status, externalUrl, error } = parsed.data
  const maj = await prisma.publication.updateMany({
    where: { id: req.params.id, status: 'PENDING', platform: { in: [...PLATEFORMES_SESSION] }, product: { userId: req.userId! } },
    data: status === 'PUBLISHED' ? { status, externalUrl: externalUrl ?? null, error: null, publishedAt: new Date() } : { status, error: error ?? 'Échec signalé par l’application desktop', publishedAt: null },
  })
  if (maj.count === 0) return res.status(404).json({ error: 'Publication introuvable, déjà traitée, ou hors des places de marché à session' })
  res.json({ ok: true, status })
})

/**
 * Les achats à faire chez les fournisseurs SANS API : ce que l'application desktop
 * prépare dans la session du vendeur (fiche du fournisseur, variante, panier,
 * adresse du client) et où elle S'ARRÊTE, au paiement — mémo auto-fulfillment § III.
 * Une vente dont le fournisseur est relié par API n'est pas là : le serveur la
 * commande lui-même (`supplier-order`). Clé desktop.
 */
agentRouter.get('/achats', requireDesktop as never, async (req: AgentRequest, res) => {
  try {
    const [ventes, liens] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.userId!, status: 'NEW' },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { product: { select: { id: true, title: true, aiTitle: true, sourceUrl: true, sourceSite: true, supplierId: true, price: true, shippingCost: true, variants: true, images: true } } },
      }),
      prisma.supplierConnection.findMany({ where: { userId: req.userId!, connected: true }, select: { supplier: true } }),
    ])
    const parApi = new Set(liens.map((l) => l.supplier))
    const achats = ventes
      .filter((v) => !(v.product.supplierId && parApi.has(v.product.supplierId)))
      .map((v) => ({
        id: v.id,
        platform: v.platform,
        createdAt: v.createdAt,
        quantity: v.quantity,
        buyerName: v.buyerName,
        buyerAddress: v.buyerAddress,
        buyerEmail: v.buyerEmail ?? null,
        variante: v.supplierVariantRef ?? null,
        erreur: v.supplierOrderError ?? null,
        produit: {
          id: v.product.id,
          titre: v.product.aiTitle || v.product.title,
          sourceUrl: v.product.sourceUrl,
          fournisseur: v.product.sourceSite ?? null,
          coutUnitaire: Number(v.product.price),
          port: Number(v.product.shippingCost ?? 0),
          variantes: v.product.variants ?? null,
          image: Array.isArray(v.product.images) ? ((v.product.images as unknown[])[0] as string | undefined) ?? null : null,
        },
      }))
    res.json({ count: achats.length, achats })
  } catch (e) {
    console.error('agent achats', e)
    res.status(500).json({ error: 'Impossible de lire les achats à faire' })
  }
})

const resultatAchatSchema = z.object({
  /** PREPARED : panier et adresse remplis, le vendeur paie lui-même. FAILED : ce qui a bloqué, en clair. */
  status: z.enum(['PREPARED', 'FAILED']),
  error: z.string().trim().max(500).optional(),
  supplierOrderUrl: z.string().url().max(2000).optional(),
})

/** Ce que la préparation a donné. Rien ne passe en « commandé » ici : c'est le paiement du vendeur qui le dit (`/achats/done`). */
agentRouter.post('/achats/:id/resultat', requireDesktop as never, async (req: AgentRequest, res) => {
  const parsed = resultatAchatSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Résultat invalide : status PREPARED ou FAILED attendu' })
  const { status, error, supplierOrderUrl } = parsed.data
  const maj = await prisma.order.updateMany({
    where: { id: req.params.id, userId: req.userId!, status: 'NEW' },
    data: status === 'PREPARED' ? { supplierOrderError: null, ...(supplierOrderUrl ? { supplierOrderUrl } : {}) } : { supplierOrderError: error ?? 'Préparation impossible (application desktop)' },
  })
  if (maj.count === 0) return res.status(404).json({ error: 'Vente introuvable ou déjà commandée' })
  res.json({ ok: true, status })
})

/** Le vendeur a payé chez le fournisseur : la vente passe en « commandée », comme sur le site (`/orders/purchases/done`). */
agentRouter.post('/achats/done', requireDesktop as never, async (req: AgentRequest, res) => {
  const parsed = z.object({ orderIds: z.array(z.string()).min(1).max(200), supplierOrderUrl: z.string().url().max(2000).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'orderIds attendu' })
  const { count } = await prisma.order.updateMany({
    where: { id: { in: parsed.data.orderIds }, userId: req.userId!, status: 'NEW' },
    data: { status: 'ORDERED_FROM_SUPPLIER', supplierOrderedAt: new Date(), supplierOrderError: null, ...(parsed.data.supplierOrderUrl ? { supplierOrderUrl: parsed.data.supplierOrderUrl } : {}) },
  })
  res.json({ ok: true, updated: count })
})

const signalSchema = z.object({
  /** SOCIAL : réseaux sociaux. MARKET : places de marché, prix, concurrence. */
  kind: z.enum(['SOCIAL', 'MARKET']),
  department: z.string().trim().max(40).optional(),
  platform: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(4000).optional(),
  url: z.string().url().max(2000).optional(),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(120).optional(),
  /**
   * Chiffres libres : GMV, unités vendues, prix moyen, croissance. Aucun schéma
   * imposé, parce qu'aucune plateforme ne publie les mêmes.
   */
  metrics: z.record(z.union([z.number(), z.string()])).optional(),
  /**
   * Scores de 0 à 100. Ce sont des estimations issues de signaux publics, pas
   * des taux de conversion : les plateformes ne les publient pas.
   */
  engagementScore: z.number().int().min(0).max(100).optional(),
  trendScore: z.number().int().min(0).max(100).optional(),
  isNew: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  raw: z.unknown().optional(),
})

const signalsBatchSchema = z.object({ signals: z.array(signalSchema).min(1).max(100) })

/**
 * Empreinte de déduplication.
 *
 * L'URL serait le choix évident, mais la plupart des signaux n'en ont pas : « les
 * bagues connectées percent en France » ne pointe nulle part. Le titre normalisé
 * fait le travail, et un même constat reformulé à la marge crée une ligne de
 * plus — ce qui vaut mieux que d'écraser deux observations distinctes.
 */
function fingerprintOf(s: { kind: string; platform?: string; title: string }) {
  const title = s.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return `${s.kind}:${(s.platform ?? '').toLowerCase()}:${title}`.slice(0, 400)
}

agentRouter.post('/signals', async (req: AgentRequest, res) => {
  const parsed = signalsBatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Lot invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  let created = 0
  let updated = 0
  const warnings: string[] = []
  const rejected: Array<{ title: string; raison: string }> = []

  for (const s of parsed.data.signals) {
    const fingerprint = fingerprintOf(s)
    const dept = await resolveDepartment(req.userId!, s.department)
    if (dept.warning && !warnings.includes(dept.warning)) warnings.push(dept.warning)
    const data = {
      kind: s.kind,
      platform: s.platform ?? null,
      title: s.title,
      summary: s.summary ?? null,
      url: s.url ?? null,
      category: s.category ?? null,
      brand: s.brand ?? null,
      metrics: (s.metrics ?? null) as never,
      engagementScore: s.engagementScore ?? null,
      trendScore: s.trendScore ?? null,
      isNew: s.isNew ?? false,
      notes: s.notes ?? null,
      raw: (s.raw ?? null) as never,
      departmentId: dept.id,
    }

    try {
      const existing = await prisma.signal.findUnique({
        where: { userId_fingerprint: { userId: req.userId!, fingerprint } },
        select: { id: true },
      })

      if (!existing) {
        await prisma.signal.create({ data: { ...data, fingerprint, userId: req.userId! } })
        created++
      } else {
        // Les chiffres sont rafraîchis, l'arbitrage du vendeur reste intact.
        await prisma.signal.update({ where: { id: existing.id }, data })
        updated++
      }
    } catch (e) {
      rejected.push({ title: s.title, raison: (e as Error).message })
    }
  }

  res.status(201).json({
    recus: parsed.data.signals.length,
    crees: created,
    mis_a_jour: updated,
    rejetes: rejected,
    avertissements: warnings,
  })
})

const reportSchema = z.object({
  department: z.string().trim().max(40).optional(),
  /** SOCIAL, SUPPLIERS ou MARKET. */
  section: z.enum(['SOCIAL', 'SUPPLIERS', 'MARKET']),
  /** Jour couvert, AAAA-MM-JJ. Aujourd'hui par défaut. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().trim().min(1).max(200),
  /** Le corps du rapport, en Markdown simple. */
  body: z.string().trim().min(1).max(60000),
  summary: z.record(z.union([z.number(), z.string()])).optional(),
})

/**
 * Le rapport du jour.
 *
 * Un redépôt le même jour, pour la même section et le même rayon, remplace le
 * précédent : un agent qui repasse à 8h puis à 11h corrige son rapport, il n'en
 * publie pas deux. Les jours passés, eux, ne sont jamais touchés.
 */
agentRouter.post('/reports', async (req: AgentRequest, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Rapport invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  const dept = await resolveDepartment(req.userId!, parsed.data.department)
  const day = parsed.data.day ?? new Date().toISOString().slice(0, 10)

  const data = {
    section: parsed.data.section,
    day,
    title: parsed.data.title,
    body: parsed.data.body,
    summary: (parsed.data.summary ?? null) as never,
    departmentId: dept.id,
  }

  // Lecture avant écriture plutôt qu'un upsert : la clé porte un departmentId
  // qui peut être NULL, et Prisma ne sait pas viser une ligne par une clé nulle.
  const existing = await prisma.report.findFirst({
    where: { userId: req.userId!, departmentId: dept.id, section: data.section, day },
    select: { id: true },
  })

  const report = existing
    ? await prisma.report.update({ where: { id: existing.id }, data })
    : await prisma.report.create({ data: { ...data, userId: req.userId! } })

  res.status(201).json({
    id: report.id,
    jour: report.day,
    section: report.section,
    remplace: Boolean(existing),
    avertissement: dept.warning,
  })
})

/**
 * Dépôt d'un rapport de marché des 48 agents locaux (MARKET-ANALYSES/).
 *
 * Réservé au compte administrateur : ces rapports sont GLOBAUX (lus par tous
 * les vendeurs à ≥ 500 drops), une clé d'agent ordinaire ne doit pas pouvoir
 * écrire dans le journal de tout le monde. Le corps est le Markdown du
 * rapport, lu selon le contrat du README — refusé s'il ne le respecte pas,
 * avec la raison, pour que l'agent qui l'a écrit se corrige.
 */
agentRouter.post('/market-reports', requireAdmin as never, async (req: AgentRequest, res) => {
  const parsed = z.object({ markdown: z.string().min(50).max(400_000) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Envoyez { markdown } : le rapport complet.' })

  let lu
  try {
    lu = lireRapport(parsed.data.markdown)
  } catch (err) {
    if (err instanceof RapportInvalide) return res.status(422).json({ error: err.message })
    throw err
  }

  const cle = { day: lu.day, categorie: lu.categorie, theme: lu.theme, type: lu.type }
  const data = {
    titre: lu.titre,
    accroche: lu.accroche,
    body: lu.body,
    produits: lu.produits as never,
    sources: lu.sources,
  }
  const rapport = await prisma.marketReport.upsert({
    where: { day_categorie_theme_type: cle },
    create: { ...cle, ...data },
    update: data,
  })
  res.status(201).json({ id: rapport.id, ...cle, produits: lu.produits.length })
})

/**
 * Dépôt d'un rapport MarketSpy complet par le Poste d'analyses (analyses/).
 *
 * C'est CE chemin qui met un rapport en ligne : le site lit rapports.db et la
 * base du Poste (voir services/rapportsPoste.ts), pas la table de
 * `/market-reports` ci-dessus que plus aucun écran ne lit. Un seul envoi range
 * le rapport RAYON (analyse + produits) et le rapport MARKETING (prompts,
 * tendances) chacun à sa place. Même réserve qu'au-dessus : administrateur
 * seulement, ces rapports sont lus par tous les vendeurs.
 */
agentRouter.post('/rapports-poste', requireAdmin as never, async (req: AgentRequest, res) => {
  const rapport = (req.body as { rapport?: unknown } | undefined)?.rapport
  try {
    const rangé = enregistrerRapportPoste(rapport)
    res.status(201).json({ ok: true, ...rangé })
  } catch (err) {
    if (err instanceof RapportInvalide) return res.status(422).json({ error: err.message })
    console.error('[rapports-poste] écriture impossible :', err)
    res.status(500).json({ error: 'Écriture impossible sur le serveur.', motif: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * Déclenchement du pilote automatique par un agent extérieur.
 *
 * C'est la seule route de /api/agent qui agit au lieu de déposer, et elle est
 * volontairement sans paramètre : l'agent dit « c'est l'heure », le pilote fait
 * ce que le vendeur a réglé. Un agent ne choisit ni le budget, ni les
 * destinations, ni les seuils.
 */
agentRouter.post('/autopilot/run', async (req: AgentRequest, res) => {
  const result = await runAutopilot(req.userId!)
  res.json(result)
})

/**
 * Ecrit a la main plutot que deduit du schema zod.
 *
 * z.infer rend unknown sur ce schema : la liste des plateformes est un tuple
 * de vingt entrees, et l inference lache au-dela. Le type explicite coute deux
 * lignes et rend les erreurs lisibles.
 */
interface InboundMessage {
  platform: Platform
  externalId?: string
  customerName: string
  customerEmail?: string
  subject?: string
  productId?: string
  department?: string
  body: string
}

const inboundSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  /** Identifiant de la conversation chez la plateforme, quand elle en donne un. */
  externalId: z.string().trim().max(200).optional(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email().optional(),
  subject: z.string().trim().max(200).optional(),
  productId: z.string().optional(),
  department: z.string().trim().max(40).optional(),
  body: z.string().trim().min(1).max(8000),
})

/**
 * Un message d'acheteur récupéré par l'extension ou par un agent.
 *
 * Un identifiant externe évite de rouvrir une conversation à chaque relevé :
 * sans lui, chaque passage créerait un fil de plus pour le même acheteur.
 */
agentRouter.post('/messages', async (req: AgentRequest, res) => {
  const parsed = z.object({ messages: z.array(inboundSchema).min(1).max(50) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Lot invalide',
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')} : ${i.message}`),
    })
  }

  let created = 0
  let appended = 0

  // Type explicite : l inference de zod lache sur un schema imbrique de cette
  // taille, et laisse les champs optionnels en unknown.
  for (const m of parsed.data.messages as InboundMessage[]) {
    const dept = await resolveDepartment(req.userId!, m.department)

    const existing = m.externalId
      ? await prisma.conversation.findFirst({
          where: { userId: req.userId!, platform: m.platform, externalId: m.externalId },
          select: { id: true },
        })
      : null

    if (existing) {
      await prisma.customerMessage.create({
        data: { conversationId: existing.id, direction: 'IN', body: m.body, author: m.customerName },
      })
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { lastMessageAt: new Date(), unread: true, status: 'OPEN' },
      })
      appended++
    } else {
      await prisma.conversation.create({
        data: {
          userId: req.userId!,
          platform: m.platform,
          externalId: m.externalId ?? null,
          customerName: m.customerName,
          customerEmail: m.customerEmail ?? null,
          subject: m.subject ?? null,
          productId: m.productId ?? null,
          departmentId: dept.id,
          messages: { create: { direction: 'IN', body: m.body, author: m.customerName } },
        },
      })
      created++
    }
  }

  res.status(201).json({ recus: parsed.data.messages.length, conversations_ouvertes: created, messages_ajoutes: appended })
})
