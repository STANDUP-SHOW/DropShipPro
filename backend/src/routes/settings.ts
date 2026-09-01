import { Router } from 'express'
import { selfCheck } from '../services/selfCheck.js'
import { z } from 'zod'
import multer from 'multer'
import { findSupplier } from '../services/suppliers.js'
import { veillerFournisseurs, rattraperReferences } from '../services/stockWatch.js'
import { prisma } from '../lib/prisma.js'
import { Prisma } from '@prisma/client'
import { catalogueThemes, themeConnu } from '../services/themes.js'
import { adresseLibre } from '../services/shopSlug.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { PLATFORM_IDS } from '../services/platforms.js'
import { saveWatermarkLogo } from '../services/watermark.js'
import {
  normalizeShopDomain,
  jetonParClientCredentials,
  autorisationManquante,
} from '../services/shopify.js'
import { diagnostiquerJetonShopify } from '../services/shopifyToken.js'
import { generateApiKey } from '../middleware/apiKey.js'
import { oublierImagesExport } from '../services/exportImages.js'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

const profileSchema = z.object({
  shopName: z.string().optional(),
  watermarkText: z.string().optional(),
  watermarkEnabled: z.boolean().optional(),
  watermarkScale: z.number().int().min(5).max(60).optional(),
  watermarkOpacity: z.number().int().min(10).max(100).optional(),
  /// Agent de controle visuel, actif ou non.
  controlAgent: z.boolean().optional(),
  /// Ce qui est appose : le texte, ou le logo depose.
  watermarkMode: z.enum(['texte', 'logo']).optional(),
  watermarkPosition: z
    .enum(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'center'])
    .optional(),
})

/**
 * Les reglages du compte, filigrane compris.
 *
 * /auth/me ne renvoyait que le nom de boutique et le texte : l ecran ne pouvait
 * donc pas afficher le logo depose, ni la position, ni l intensite, et le
 * vendeur ne pouvait pas s en servir.
 */
settingsRouter.get('/profile', async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } })
  res.json({
    id: user.id,
    email: user.email,
    shopName: user.shopName,
    controlAgent: user.controlAgent,
    watermarkEnabled: user.watermarkEnabled,
    watermarkText: user.watermarkText,
    watermarkImage: user.watermarkImage,
    watermarkScale: user.watermarkScale,
    watermarkOpacity: user.watermarkOpacity,
    watermarkPosition: user.watermarkPosition,
    watermarkMode: user.watermarkMode,
    shopKey: user.shopKey,
  })
})

settingsRouter.patch('/profile', async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })
  const user = await prisma.user.update({ where: { id: req.userId! }, data: parsed.data })
  res.json({ id: user.id, email: user.email, controlAgent: user.controlAgent, shopName: user.shopName, watermarkText: user.watermarkText, watermarkEnabled: user.watermarkEnabled, watermarkImage: user.watermarkImage, watermarkScale: user.watermarkScale, watermarkOpacity: user.watermarkOpacity, watermarkPosition: user.watermarkPosition, watermarkMode: user.watermarkMode, shopKey: user.shopKey })
})

// JPEG is accepted now that a flat light background is cleared on upload: most
// sellers only have their logo as a JPEG, and refusing it sent them away.
const ACCEPTED_LOGO = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ACCEPTED_LOGO.includes(file.mimetype))
  },
}).single('logo')

settingsRouter.put('/watermark-logo', (req: AuthedRequest, res) => {
  uploadLogo(req, res, async (err) => {
    if (err) {
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({ error: tooBig ? 'Fichier trop lourd (2 Mo maximum)' : "Envoi impossible" })
    }
    if (!req.file) return res.status(400).json({ error: 'Envoyez une image de logo (PNG, SVG, JPEG ou WebP)' })

    try {
      const watermarkImage = await saveWatermarkLogo(req.file.buffer, req.file.mimetype)
      await prisma.user.update({ where: { id: req.userId! }, data: { watermarkImage } })
      // Les photos deja marquees portent l ancien logo : elles sont oubliees.
      await oublierImagesExport(req.userId!)
      res.json({ watermarkImage })
    } catch (e) {
      console.error('logo de filigrane illisible', e)
      res.status(400).json({ error: "Ce fichier n'a pas pu être lu comme une image" })
    }
  })
})

settingsRouter.delete('/watermark-logo', async (req: AuthedRequest, res) => {
  // The file itself is left on disk: older products still reference it.
  await prisma.user.update({ where: { id: req.userId! }, data: { watermarkImage: null } })
  res.json({ ok: true })
})

/**
 * The seller's shops.
 *
 * One key per shop, because one key for the whole account meant every site
 * received every product: a menswear store and a tech store cannot share a feed.
 * Each listing belongs to one shop, and a shop's key only ever exposes its own.
 */
settingsRouter.get('/shops', async (req: AuthedRequest, res) => {
  const shops = await prisma.shop.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { products: true } } },
  })

  res.json(
    shops.map((s) => ({
      id: s.id,
      name: s.name,
      shopKey: s.shopKey,
      slug: s.slug,
      platform: s.platform,
      logo: s.logo,
      sectors: Array.isArray(s.sectors) ? s.sectors : [],
      products: s._count.products,
      createdAt: s.createdAt,
      /*
       * Le filigrane de cette boutique, et non celui du compte.
       *
       * Un vendeur qui tient un site high-tech, un site de mode homme et un
       * site de cuisine ne les signe pas de la même façon : trois noms, trois
       * logos. Le modèle le portait déjà ; l'écran ne le lisait pas, et
       * proposait un seul réglage pour tout le monde.
       *
       * `null` veut dire « comme le compte » : c'est ce qu'attend un vendeur
       * qui n'a qu'une boutique, et ça évite de recopier trois fois la même
       * chose pour celui qui en a quatre.
       */
      watermarkEnabled: s.watermarkEnabled,
      watermarkMode: s.watermarkMode,
      watermarkText: s.watermarkText,
      watermarkScale: s.watermarkScale,
      watermarkOpacity: s.watermarkOpacity,
      watermarkPosition: s.watermarkPosition,

      /*
       * L'apparence de la vitrine.
       *
       * Rendue ici plutôt que par un appel séparé : l'écran « Mes sites »
       * affiche déjà un bloc par boutique, et le thème y a sa place. Une
       * requête de plus par boutique pour trois champs ferait quatre allers
       * pour un vendeur qui en a quatre.
       */
      themeId: s.themeId,
      themeTokens: s.themeTokens ?? null,
      storefront: s.storefront ?? null,
    })),
  )
})

const shopSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Indicative only: wordpress, prestashop, magento, shopify, autre. */
  platform: z.string().trim().max(30).optional(),
  /**
   * Les rayons vendus par cette boutique.
   *
   * C'est ce qui décide des catégories proposées à l'import : un vendeur de
   * high-tech ne doit pas dérouler quarante catégories de mode. Vide veut dire
   * « tous » — qui n'a rien déclaré doit tout voir, jamais rien.
   */
  sectors: z.array(z.string().trim().max(40)).max(20).optional(),

  /*
   * Le filigrane, boutique par boutique.
   *
   * Chaque champ retombe séparément sur celui du compte quand il vaut `null` :
   * une boutique qui n'a réglé que sa position garde le logo du compte. Tout ou
   * rien obligerait à tout ressaisir pour changer un détail.
   */
  watermarkEnabled: z.boolean().optional(),
  /// Null veut dire « comme le compte ».
  watermarkMode: z.enum(['texte', 'logo']).nullable().optional(),
  watermarkText: z.string().trim().max(60).nullable().optional(),
  watermarkScale: z.number().int().min(5).max(60).nullable().optional(),
  watermarkOpacity: z.number().int().min(5).max(100).nullable().optional(),
  // Les ancrages de sharp, pas des noms inventes : une valeur hors de cette
  // liste ferait echouer la composition au moment de l export, pas ici.
  watermarkPosition: z
    .enum(['northwest','north','northeast','west','center','east','southwest','south','southeast'])
    .nullable()
    .optional(),

  /*
   * L apparence de la vitrine.
   *
   *  est verifie contre la bibliotheque et non simplement stocke : un
   * identifiant inconnu ne casserait rien -- la resolution retombe sur le
   * defaut -- mais le vendeur croirait avoir choisi un theme et verrait toujours
   * l autre, sans qu aucun message ne le lui dise.
   */
  themeId: z.string().refine(themeConnu, { message: 'Theme inconnu' }).optional(),
  themeTokens: z.record(z.string()).nullable().optional(),
  storefront: z
    .object({
      annonce: z.string().max(200).optional(),
      accroche: z.string().max(120).optional(),
      accrocheSuite: z.string().max(120).optional(),
      sousTitre: z.string().max(400).optional(),
      fraisPort: z.number().min(0).max(999).optional(),
      portOffertDes: z.number().min(0).max(9999).optional(),
    })
    .nullable()
    .optional(),
})

/**
 * La bibliotheque, pour l ecran de choix.
 *
 * Servie plutot que recopiee dans le front : c est la meme liste que celle qui
 * resout l apparence, et deux listes censees rester identiques finissent
 * toujours par diverger.
 */
settingsRouter.get('/themes', (_req: AuthedRequest, res) => {
  res.json(catalogueThemes())
})

/**
 * Prisma refuse `undefined` dans un champ Json, et `null` y a un sens.
 *
 * `null` veut dire « efface », `undefined` veut dire « ne touche pas ». Les
 * confondre ferait qu'une modification du seul nom de boutique effacerait ses
 * couleurs et ses textes — le genre de perte qu'on ne remarque qu'en regardant
 * sa vitrine le lendemain.
 */
function avecJson(champs: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...champs }
  for (const cle of ['themeTokens', 'storefront']) {
    if (!(cle in champs)) continue
    data[cle] = champs[cle] === null ? Prisma.DbNull : (champs[cle] as Prisma.InputJsonValue)
  }
  return data as never
}

settingsRouter.post('/shops', async (req: AuthedRequest, res) => {
  const parsed = shopSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Donnez un nom de boutique' })

  const shop = await prisma.shop.create({
    data: avecJson({
      ...parsed.data,
      userId: req.userId!,
      // L adresse de la vitrine est posee des la creation : la reclamer plus
      // tard obligerait le vendeur a la demander, et personne ne demande ce
      // qu il ne sait pas exister.
      slug: await adresseLibre(parsed.data.name),
    }),
  })
  res.status(201).json({ id: shop.id, name: shop.name, shopKey: shop.shopKey, platform: shop.platform })
})

settingsRouter.patch('/shops/:id', async (req: AuthedRequest, res) => {
  const parsed = shopSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    // Le message du schema est rendu : « Theme inconnu » se corrige,
    // « Champs invalides » envoie chercher lequel.
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Champs invalides' })
  }

  const { count } = await prisma.shop.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: avecJson(parsed.data),
  })
  if (!count) return res.status(404).json({ error: 'Boutique introuvable' })
  res.json({ ok: true })
})

/**
 * Deleting a shop leaves its listings alone: they lose their shop and stop being
 * served by any feed, which is recoverable. Deleting them with it would not be.
 *
 * The last one goes too. A seller who only publishes on Vinted and Leboncoin has
 * no site to feed, and refusing to remove a shop they never wanted would be
 * inventing an obligation.
 */
settingsRouter.delete('/shops/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.shop.deleteMany({ where: { id: req.params.id, userId: req.userId! } })
  if (!count) return res.status(404).json({ error: 'Boutique introuvable' })
  res.status(204).send()
})

settingsRouter.get('/credentials', async (req: AuthedRequest, res) => {
  const creds = await prisma.platformCredential.findMany({ where: { userId: req.userId! } })
  res.json(
    creds.map((c) => ({
      id: c.id,
      platform: c.platform,
      label: c.label,
      connected: c.connected,
      // Enough to show *which* shop is connected, never the token itself.
      hint: shopDomainOf(c.data),
    })),
  )
})

function shopDomainOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const domain = (data as Record<string, unknown>).shopDomain
  return typeof domain === 'string' ? domain : null
}

const credSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  label: z.string().optional(),
  data: z.record(z.string()).default({}),
})

// Stores platform API credentials (e.g. eBay OAuth token) once the user has them.
// `connected` flips to true only once real credentials are saved — that's the
// signal publisher.ts / orders webhooks use to know a platform is live vs. stubbed.
settingsRouter.put('/credentials', async (req: AuthedRequest, res) => {
  const parsed = credSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  let data = parsed.data.data

  // Shopify is the one destination that really publishes, so its credentials are
  // checked here rather than discovered as a failure at publication time.
  if (parsed.data.platform === 'SHOPIFY' && Object.keys(data).length > 0) {
    const shopDomain = normalizeShopDomain(data.shopDomain ?? '')
    const accessToken = (data.accessToken ?? '').trim()
    if (!shopDomain) {
      return res.status(400).json({
        error: "Adresse de boutique invalide : attendu quelque chose comme ma-boutique.myshopify.com",
      })
    }
    /*
     * Deux voies, et le vendeur en choisit une.
     *
     * Le jeton `shpat_` vient de l'administration de la boutique ; le couple
     * Client ID / Client Secret vient du Dev Dashboard, qui ne délivre plus
     * aucun jeton. Exiger le premier revenait à dire au marchand qui a monté son
     * app dans le Dev Dashboard de tout refaire ailleurs.
     */
    const clientId = (data.clientId ?? '').trim()
    const clientSecret = (data.clientSecret ?? '').trim()

    if (!accessToken && !(clientId && clientSecret)) {
      return res.status(400).json({
        error:
          "Donnez soit le jeton d'accès Admin (shpat_…, depuis l'administration de votre boutique), soit le Client ID et le Client Secret (depuis le Dev Dashboard).",
      })
    }

    if (accessToken) {
      const probleme = diagnostiquerJetonShopify(accessToken)
      if (probleme) return res.status(400).json({ error: probleme })
      data = { shopDomain, accessToken }
    } else {
      /*
       * Éprouvé tout de suite plutôt qu'à la première publication.
       *
       * Un Client Secret faux ne se voit nulle part : l'écran dirait « connecté »
       * et la première diffusion échouerait, des jours plus tard, sur trente
       * annonces à la fois. Un échange coûte un appel — le faire maintenant.
       */
      try {
        const echange = await jetonParClientCredentials({ shopDomain, clientId, clientSecret })

        // L'échange ne demande pas d'autorisation : il rend celles que l'app
        // déclare déjà. Un jeton valide sans write_products publierait zéro
        // annonce, et l'écran dirait « Connecté ».
        const manque = autorisationManquante(echange.scope)
        if (manque) return res.status(400).json({ error: manque })
      } catch (err) {
        return res
          .status(400)
          .json({ error: err instanceof Error ? err.message : 'Shopify a refusé ces identifiants.' })
      }
      data = { shopDomain, clientId, clientSecret }
    }

    const cred = await prisma.platformCredential.upsert({
      where: { userId_platform: { userId: req.userId!, platform: 'SHOPIFY' } },
      create: { ...parsed.data, data, userId: req.userId!, connected: true },
      update: { ...parsed.data, data, connected: true },
    })
    return res.json({
      id: cred.id,
      platform: cred.platform,
      label: cred.label,
      connected: cred.connected,
    })
  }

  const cred = await prisma.platformCredential.upsert({
    where: { userId_platform: { userId: req.userId!, platform: parsed.data.platform } },
    create: { ...parsed.data, data, userId: req.userId!, connected: Object.keys(data).length > 0 },
    update: { ...parsed.data, data, connected: Object.keys(data).length > 0 },
  })
  res.json({ id: cred.id, platform: cred.platform, label: cred.label, connected: cred.connected })
})

/**
 * Les clés d'API du compte.
 *
 * Une clé sert à un agent extérieur, pas à un humain : elle n'ouvre que
 * /api/agent, où l'on peut déposer des trouvailles et rien de plus.
 */
settingsRouter.get('/api-keys', async (req: AuthedRequest, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
  })
  res.json(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      // Le début seulement : la clé entière n'est plus lisible après sa création.
      prefix: k.prefix,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
    })),
  )
})

settingsRouter.post('/api-keys', async (req: AuthedRequest, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Donnez un nom à cette clé' })

  const active = await prisma.apiKey.count({ where: { userId: req.userId!, revokedAt: null } })
  if (active >= 10) return res.status(400).json({ error: 'Dix clés actives au maximum' })

  const { key, keyHash, prefix } = generateApiKey()
  const record = await prisma.apiKey.create({
    data: { userId: req.userId!, name: parsed.data.name, keyHash, prefix },
  })

  // La seule et unique fois où la clé en clair sort d'ici.
  res.status(201).json({ id: record.id, name: record.name, prefix, key })
})

/**
 * Révoquer plutôt que supprimer : une clé qui a servi laisse une trace, et
 * savoir qu'un accès a existé vaut mieux que de le faire disparaître.
 */
settingsRouter.delete('/api-keys/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id: req.params.id, userId: req.userId!, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (!count) return res.status(404).json({ error: 'Clé introuvable' })
  res.status(204).send()
})

/**
 * Les comptes de régie publicitaire.
 *
 * Ce que l'application fait de ces identifiants aujourd'hui : rien, sinon les
 * conserver. Ni diffusion, ni relevé de campagne ne sont écrits. C'est dit au
 * vendeur au moment où il colle son jeton, parce qu'un compte marqué « relié »
 * qui ne remonte aucun chiffre se lit comme une panne, et qu'on cherche alors
 * pendant des jours un défaut qui n'existe pas.
 *
 * Le jeton n'est jamais renvoyé au navigateur : on ne renvoie que sa présence,
 * et l'identifiant de compte, qui n'est pas un secret.
 */
const AD_NETWORKS = ['meta', 'google', 'tiktok', 'x', 'snapchat', 'pinterest'] as const

settingsRouter.get('/ad-accounts', async (req: AuthedRequest, res) => {
  const comptes = await prisma.adAccount.findMany({ where: { userId: req.userId! } })
  res.json(
    comptes.map((c) => ({
      network: c.network,
      accountId: c.accountId,
      connected: c.connected,
      updatedAt: c.updatedAt,
    })),
  )
})

const adSchema = z.object({
  network: z.enum(AD_NETWORKS),
  accountId: z.string().trim().min(1).max(120),
  token: z.string().trim().min(1).max(4000),
})

settingsRouter.put('/ad-accounts', async (req: AuthedRequest, res) => {
  const parsed = adSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Renseignez l'identifiant du compte et le jeton d'accès." })
  }

  const { network, accountId, token } = parsed.data
  const compte = await prisma.adAccount.upsert({
    where: { userId_network: { userId: req.userId!, network } },
    create: { userId: req.userId!, network, accountId, token, connected: true },
    update: { accountId, token, connected: true },
  })

  res.json({ network: compte.network, accountId: compte.accountId, connected: compte.connected })
})

settingsRouter.delete('/ad-accounts/:network', async (req: AuthedRequest, res) => {
  const { count } = await prisma.adAccount.deleteMany({
    where: { userId: req.userId!, network: req.params.network },
  })
  if (!count) return res.status(404).json({ error: 'Compte introuvable' })
  res.status(204).send()
})

/**
 * Les fournisseurs reliés par leur API officielle.
 *
 * Ce que l'application fait de ces identifiants aujourd'hui : rien de plus que
 * les conserver. Aucun connecteur n'est écrit — ni lecture de catalogue, ni
 * commande, ni suivi — et l'interface le dit avant la saisie. Un fournisseur
 * marqué « relié » qui ne rapporte aucun produit se lit sinon comme une panne.
 *
 * Les valeurs ne ressortent jamais : on renvoie les noms des champs remplis,
 * jamais leur contenu.
 */
settingsRouter.get('/supplier-links', async (req: AuthedRequest, res) => {
  const liens = await prisma.supplierConnection.findMany({ where: { userId: req.userId! } })
  res.json(
    liens.map((l) => ({
      supplier: l.supplier,
      connected: l.connected,
      champs: Object.keys((l.data ?? {}) as Record<string, unknown>),
      updatedAt: l.updatedAt,
    })),
  )
})

const supplierLinkSchema = z.object({
  supplier: z.string().trim().min(1).max(40),
  data: z.record(z.string().trim().min(1).max(500)),
})

settingsRouter.put('/supplier-links', async (req: AuthedRequest, res) => {
  const parsed = supplierLinkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const fournisseur = findSupplier(parsed.data.supplier)
  if (!fournisseur?.api) {
    return res.status(400).json({ error: "Ce fournisseur ne publie pas d'API officielle." })
  }

  // Les champs sont ceux que le fournisseur nomme : un formulaire qui enverrait
  // autre chose se trompe de fournisseur.
  const attendus = new Set(fournisseur.api.champs.map((c) => c.cle))
  const data = Object.fromEntries(
    Object.entries(parsed.data.data).filter(([cle]) => attendus.has(cle)),
  )
  const manquants = fournisseur.api.champs
    .filter((c) => !c.optionnel && !data[c.cle])
    .map((c) => c.label)
  if (manquants.length) {
    return res.status(400).json({ error: `Il manque : ${manquants.join(', ')}` })
  }

  const lien = await prisma.supplierConnection.upsert({
    where: { userId_supplier: { userId: req.userId!, supplier: fournisseur.id } },
    create: { userId: req.userId!, supplier: fournisseur.id, data, connected: true },
    update: { data, connected: true },
  })

  res.json({ supplier: lien.supplier, connected: lien.connected })
})

settingsRouter.delete('/supplier-links/:supplier', async (req: AuthedRequest, res) => {
  const { count } = await prisma.supplierConnection.deleteMany({
    where: { userId: req.userId!, supplier: req.params.supplier },
  })
  if (!count) return res.status(404).json({ error: 'Fournisseur non relié' })
  res.status(204).send()
})

/**
 * Lance la veille sur les prix et les stocks fournisseurs.
 *
 * Déclenchée à la main pour l'instant. Ce n'est pas un oubli : mieux vaut un
 * relevé que le vendeur demande et regarde qu'un relevé nocturne dont personne
 * ne lit le rapport. La programmation viendra quand on saura ce qu'il en fait.
 */
settingsRouter.post('/supplier-watch', async (req: AuthedRequest, res) => {
  const resultat = await veillerFournisseurs(req.userId!)
  res.json(resultat)
})

/** Les produits reliés à un fournisseur, et leur dernier relevé. */
settingsRouter.get('/supplier-watch', async (req: AuthedRequest, res) => {
  await rattraperReferences(req.userId!)

  const produits = await prisma.product.findMany({
    where: { userId: req.userId!, supplierId: { not: null } },
    select: {
      id: true,
      title: true,
      aiTitle: true,
      supplierId: true,
      supplierRef: true,
      supplierPrice: true,
      supplierStock: true,
      supplierCheckedAt: true,
      price: true,
      sellingPrice: true,
      currency: true,
      status: true,
    },
    orderBy: { supplierCheckedAt: 'asc' },
    take: 200,
  })

  const total = await prisma.product.count({ where: { userId: req.userId! } })

  res.json({
    surveilles: produits.length,
    total,
    produits: produits.map((p) => ({
      ...p,
      price: Number(p.price),
      sellingPrice: Number(p.sellingPrice),
      supplierPrice: p.supplierPrice === null ? null : Number(p.supplierPrice),
    })),
  })
})

/**
 * Le logo d'une boutique.
 *
 * Un vendeur qui tient un site de mode et un site high-tech ne signe pas ses
 * photos de la même façon. Le logo du compte reste le défaut ; celui-ci le
 * remplace pour les annonces rangées dans cette boutique.
 */
settingsRouter.put('/shops/:id/logo', (req: AuthedRequest, res) => {
  uploadLogo(req, res, async (err) => {
    if (err) {
      const tropGros = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({ error: tropGros ? 'Fichier trop lourd (2 Mo maximum)' : 'Envoi impossible' })
    }
    if (!req.file) return res.status(400).json({ error: 'Envoyez une image (PNG, SVG, JPEG ou WebP)' })

    const boutique = await prisma.shop.findFirst({ where: { id: req.params.id, userId: req.userId! } })
    if (!boutique) return res.status(404).json({ error: 'Boutique introuvable' })

    try {
      const logo = await saveWatermarkLogo(req.file.buffer, req.file.mimetype)
      await prisma.shop.update({ where: { id: boutique.id }, data: { logo } })

      // Les photos deja marquees avec l ancien logo doivent etre refaites. La
      // signature s en chargerait au prochain export ; vider tout de suite rend
      // le changement visible sans attendre une publication.
      await oublierImagesExport(req.userId!)

      res.json({ logo })
    } catch (e) {
      console.error('logo de boutique illisible', e)
      res.status(400).json({ error: "Ce fichier n'a pas pu être lu comme une image" })
    }
  })
})

settingsRouter.delete('/shops/:id/logo', async (req: AuthedRequest, res) => {
  const { count } = await prisma.shop.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { logo: null },
  })
  if (!count) return res.status(404).json({ error: 'Boutique introuvable' })
  await oublierImagesExport(req.userId!)
  res.json({ ok: true })
})

/**
 * L'état réel des services, lisible sans ouvrir les journaux de l'hébergeur.
 *
 * Le déclencheur : « générer ad — erreur 502 ». Le serveur disait déjà pourquoi
 * — police absente, clé refusée, crédits épuisés — mais l'explication vivait
 * dans un champ que le navigateur ne lisait pas, et le journal Railway n'est
 * pas un endroit où l'on envoie un vendeur.
 *
 * Réservé au compte connecté : la liste dit ce qui manque à l'installation,
 * c'est-à-dire exactement ce qu'il faut savoir pour l'attaquer.
 */
settingsRouter.get('/diagnostic', async (_req: AuthedRequest, res) => {
  res.json(await selfCheck())
})
