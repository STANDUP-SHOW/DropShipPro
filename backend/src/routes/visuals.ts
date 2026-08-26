import { Router } from 'express'
import { ecrireAccroche } from '../services/adCopywriter.js'
import { SansPolice } from '../services/adComposer.js'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  AD_FORMATS,
  ImageGenUnavailable,
  generateAdVisual,
  imageGenConfigured,
  regenerateProductPhoto,
} from '../services/imageGen.js'

/**
 * Les agents visuels : photos de produit et visuels publicitaires.
 *
 * Un crédit image par image produite, décompté après coup. Une génération qui
 * échoue ne se facture pas : le vendeur n'a rien reçu.
 */
export const visualsRouter = Router()
visualsRouter.use(requireAuth)

/**
 * Recharges d'images. Prix TTC en centimes, comme partout ailleurs.
 *
 * Une image coûte environ 0,032 € à produire. La dégressivité tient jusqu'à cinq
 * mille — de 68 % à 45 % de marge — puis se resserre : 20 % sur dix mille, et
 * seulement 1 % sur vingt-cinq mille, soit quatre euros de bénéfice sur une
 * vente à huit cents. Ce dernier palier ne laisse aucune place à une hausse de
 * tarif du fournisseur ; il est là parce qu'il a été décidé, pas parce qu'il est
 * confortable.
 */
export const IMAGE_PACKS = [
  { id: 'img-100', label: '100 images', amount: 1000, images: 100 },
  { id: 'img-250', label: '250 images', amount: 2200, images: 250 },
  { id: 'img-500', label: '500 images', amount: 4000, images: 500 },
  { id: 'img-1000', label: '1 000 images', amount: 7000, images: 1000 },
  { id: 'img-2500', label: '2 500 images', amount: 16000, images: 2500 },
  { id: 'img-5000', label: '5 000 images', amount: 29000, images: 5000 },
  { id: 'img-10000', label: '10 000 images', amount: 40000, images: 10000 },
  { id: 'img-25000', label: '25 000 images', amount: 80000, images: 25000 },
]

export function findImagePack(id: string) {
  return IMAGE_PACKS.find((p) => p.id === id) ?? null
}

visualsRouter.get('/state', async (req: AuthedRequest, res) => {
  const [user, produced] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { imageCredits: true },
    }),
    prisma.generatedImage.count({ where: { userId: req.userId! } }),
  ])

  res.json({
    credits: user.imageCredits,
    produced,
    configured: imageGenConfigured(),
    packs: IMAGE_PACKS,
    // Au-delà du plus gros paquet, le prix se négocie : le dire dans la réponse
    // évite à l'interface de deviner.
    beyond: "Au-delà de 25 000 images, écrivez-nous : le tarif se négocie.",
    formats: Object.entries(AD_FORMATS).map(([id, f]) => ({ id, ...f })),
  })
})

/** Les images déjà produites pour un produit : payées une fois, gardées. */
visualsRouter.get('/product/:id', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    select: { id: true, title: true, aiTitle: true, images: true, sourceCategory: true },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const generated = await prisma.generatedImage.findMany({
    where: { userId: req.userId!, productId: product.id },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ product, generated })
})

const photoSchema = z.object({
  productId: z.string(),
  count: z.number().int().min(1).max(6).default(1),
  hint: z.string().trim().max(300).optional(),
})

/**
 * Prend un crédit image, ou refuse.
 *
 * Le décompte est conditionnel en base : deux générations lancées en même temps
 * ne doivent pas passer avec un seul crédit restant.
 */
async function takeImageCredit(userId: string): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, imageCredits: { gte: 1 } },
    data: { imageCredits: { decrement: 1 } },
  })
  return count > 0
}

visualsRouter.post('/photos', async (req: AuthedRequest, res) => {
  const parsed = photoSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Demande invalide' })

  if (!imageGenConfigured()) {
    return res.status(503).json({ error: "La génération d'images n'est pas encore configurée." })
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, userId: req.userId! },
    select: { id: true, title: true, aiTitle: true, images: true, sourceCategory: true },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const sourceImages = (Array.isArray(product.images) ? product.images : []).filter(
    (i): i is string => typeof i === 'string',
  )
  if (!sourceImages.length) {
    return res.status(400).json({ error: "Ce produit n'a aucune photo à retravailler." })
  }

  const produced = []
  const errors: string[] = []

  for (let i = 0; i < parsed.data.count; i++) {
    if (!(await takeImageCredit(req.userId!))) {
      errors.push('Crédits images épuisés.')
      break
    }

    try {
      const result = await regenerateProductPhoto({
        sourceImages,
        title: product.aiTitle || product.title,
        category: product.sourceCategory,
        hint: parsed.data.hint,
      })

      produced.push(
        await prisma.generatedImage.create({
          data: {
            userId: req.userId!,
            productId: product.id,
            kind: 'photo',
            path: result.path,
            width: result.width,
            height: result.height,
            prompt: result.prompt,
          },
        }),
      )
    } catch (err) {
      // Rien produit, rien facturé.
      await prisma.user.update({
        where: { id: req.userId! },
        data: { imageCredits: { increment: 1 } },
      })
      errors.push(err instanceof ImageGenUnavailable ? err.message : `Génération impossible : ${(err as Error).message}`)
      break
    }
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { imageCredits: true },
  })

  res.status(produced.length ? 201 : 502).json({ images: produced, credits: user.imageCredits, errors })
})

const adSchema = z.object({
  productId: z.string(),
  platforms: z.array(z.string()).min(1).max(6),
  count: z.number().int().min(1).max(4).default(1),
  hint: z.string().trim().max(300).optional(),
  /** Le texte du bouton, son adresse et l argument : ils sont dessines, pas generes. */
  ctaLabel: z.string().trim().max(30).optional(),
  ctaUrl: z.string().trim().max(80).optional(),
  argument: z.string().trim().max(60).optional(),
  /**
   * Afficher le prix de vente sur le visuel.
   *
   * Vrai par defaut, parce qu une publicite sans prix convertit moins. Mais un
   * prix affiche est une promesse : le vendeur qui teste un positionnement, ou
   * qui vend une gamme a prix variables, doit pouvoir le retirer.
   */
  showPrice: z.boolean().optional(),
  /**
   * La boutique dont le logo signe la publicite.
   *
   * Un vendeur qui tient deux sites ne signe pas ses pubs du meme logo. Absent,
   * on prend celui de la boutique du produit, puis celui du compte.
   */
  shopId: z.string().trim().optional(),
})

visualsRouter.post('/ads', async (req: AuthedRequest, res) => {
  const parsed = adSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Demande invalide' })

  if (!imageGenConfigured()) {
    return res.status(503).json({ error: "La génération d'images n'est pas encore configurée." })
  }

  const platforms = parsed.data.platforms.filter((p) => AD_FORMATS[p])
  if (!platforms.length) return res.status(400).json({ error: 'Aucune destination valable' })

  const [product, vendeur] = await Promise.all([
    prisma.product.findFirst({
      where: { id: parsed.data.productId, userId: req.userId! },
      select: {
        id: true,
        title: true,
        aiTitle: true,
        images: true,
        sellingPrice: true,
        currency: true,
        shop: { select: { name: true, logo: true } },
        // De quoi ecrire l accroche : le composeur n en avait pas besoin, la
        // redactrice si.
        description: true,
        aiDescription: true,
        bulletPoints: true,
        sourceCategory: true,
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: { shopName: true, watermarkImage: true },
    }),
  ])
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const sourceImages = (Array.isArray(product.images) ? product.images : []).filter(
    (i): i is string => typeof i === 'string',
  )
  if (!sourceImages.length) {
    return res.status(400).json({ error: "Ce produit n'a aucune photo à utiliser." })
  }

  /**
   * L'offre posée sur le visuel.
   *
   * Elle vient de l'annonce, jamais du modèle : le prix affiché sur une
   * publicité est une promesse, et un prix inventé se paie en litiges. Le logo
   * est celui du filigrane — le vendeur l'a déjà déposé, lui en redemander un
   * second serait le même fichier à téléverser deux fois.
   */
  /*
   * Le logo, dans l ordre ou le vendeur l attend.
   *
   * Celui qu il a choisi pour cette publicite, sinon celui de la boutique ou
   * l annonce est rangee, sinon celui du compte. Aucun n existe : la publicite
   * part sans logo plutot que de ne pas partir.
   */
  const boutiquePub = parsed.data.shopId
    ? await prisma.shop.findFirst({ where: { id: parsed.data.shopId, userId: req.userId! } })
    : null
  const logoPub = boutiquePub?.logo ?? product.shop?.logo ?? vendeur.watermarkImage ?? null

  const prix = Number(product.sellingPrice)
  const copy = {
    title: product.aiTitle || product.title,
    price:
      parsed.data.showPrice === false ? '' : `${prix.toFixed(2).replace('.', ',')} ${product.currency}`,
    shopName: product.shop?.name ?? vendeur.shopName ?? null,
    logo: logoPub,
    ctaLabel: parsed.data.ctaLabel?.trim() || 'Commander',
    ctaUrl: parsed.data.ctaUrl?.trim() || null,
    argument: parsed.data.argument?.trim() || null,
  }

  const produced = []
  const errors: string[] = []

  // Les angles deja servis pour ce produit, pour que la deuxieme publicite ne
  // soit pas la copie de la premiere.
  const anglesServis: string[] = []

  outer: for (const platform of platforms) {
    for (let i = 0; i < parsed.data.count; i++) {
      if (!(await takeImageCredit(req.userId!))) {
        errors.push('Crédits images épuisés.')
        break outer
      }

      try {
        /*
         * L accroche, ecrite avant de composer.
         *
         * Le titre d une annonce n est pas une accroche : « Montre automatique
         * acier inoxydable 22 rubis » se cherche et se compare, mais ne dit rien
         * a qui ne cherchait pas deja une montre. Trois publicites tamponnees du
         * meme titre donnaient trois fois la meme image.
         *
         * Ce que le vendeur a dicte lui-meme n est jamais ecrase : il a vu son
         * produit, la machine non.
         */
        const accroche = parsed.data.argument?.trim()
          ? null
          : await ecrireAccroche({
              titre: product.aiTitle || product.title,
              description: product.aiDescription || product.description,
              arguments: Array.isArray(product.bulletPoints)
                ? (product.bulletPoints as unknown[]).filter((b): b is string => typeof b === 'string')
                : [],
              prix: copy.price || 'non affiché',
              categorie: product.sourceCategory,
              platform,
              dejaVus: anglesServis,
            })

        if (accroche) anglesServis.push(accroche.angle)

        const copyEcrit = accroche
          ? {
              ...copy,
              title: accroche.titre,
              argument: accroche.argument || copy.argument,
              ctaLabel: parsed.data.ctaLabel?.trim() || accroche.bouton,
            }
          : copy

        const result = await generateAdVisual({
          sourceImages,
          title: product.aiTitle || product.title,
          platform,
          hint: parsed.data.hint,
          copy: copyEcrit,
        })

        produced.push(
          await prisma.generatedImage.create({
            data: {
              userId: req.userId!,
              productId: product.id,
              kind: 'ad',
              platform,
              path: result.path,
              width: result.width,
              height: result.height,
              prompt: result.prompt,
            },
          }),
        )
      } catch (err) {
        await prisma.user.update({
          where: { id: req.userId! },
          data: { imageCredits: { increment: 1 } },
        })
        errors.push(
          err instanceof SansPolice || err instanceof ImageGenUnavailable
            ? err.message
            : `Génération impossible : ${(err as Error).message}`,
        )
        // Sans police, les suivantes echoueront pareil : inutile de les tenter.
        if (err instanceof SansPolice) break outer
        break outer
      }
    }
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { imageCredits: true },
  })

  res.status(produced.length ? 201 : 502).json({ images: produced, credits: user.imageCredits, errors })
})

/**
 * Retenir une image générée pour l'annonce.
 *
 * Elle rejoint la galerie du produit : c'est le seul geste qui la fait sortir de
 * l'atelier et arriver chez l'acheteur.
 */
visualsRouter.post('/:id/keep', async (req: AuthedRequest, res) => {
  const image = await prisma.generatedImage.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!image) return res.status(404).json({ error: 'Image introuvable' })

  const product = await prisma.product.findUniqueOrThrow({ where: { id: image.productId } })
  const current = (Array.isArray(product.images) ? product.images : []).filter(
    (i): i is string => typeof i === 'string',
  )

  if (!current.includes(image.path)) {
    await prisma.product.update({
      where: { id: product.id },
      // En tête : une mise en situation vend mieux qu'un fond blanc, et la
      // première photo est celle que voit l'acheteur dans les résultats.
      data: { images: [image.path, ...current].slice(0, 12) },
    })
  }

  await prisma.generatedImage.update({ where: { id: image.id }, data: { kept: true } })
  res.json({ ok: true })
})

visualsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.generatedImage.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!count) return res.status(404).json({ error: 'Image introuvable' })
  res.status(204).send()
})

/**
 * Le book de l'agent : tout ce qu'il a produit, toutes annonces confondues.
 *
 * Les images étaient rangées par produit, donc invisibles tant qu'on n'ouvrait
 * pas la bonne fiche. Un vendeur qui a payé trente visuels veut les revoir sans
 * se rappeler pour quel article il les avait demandés — et retrouver celui qui
 * avait bien marché pour le reprendre.
 */
visualsRouter.get('/gallery', async (req: AuthedRequest, res) => {
  const kind = req.query.kind === 'ad' ? 'ad' : req.query.kind === 'photo' ? 'photo' : undefined

  const images = await prisma.generatedImage.findMany({
    where: { userId: req.userId!, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 120,
    include: { product: { select: { id: true, title: true, aiTitle: true } } },
  })

  res.json({
    count: images.length,
    images: images.map((i) => ({
      id: i.id,
      kind: i.kind,
      path: i.path,
      platform: i.platform,
      width: i.width,
      height: i.height,
      kept: i.kept,
      createdAt: i.createdAt,
      productId: i.product?.id ?? null,
      productTitle: i.product ? i.product.aiTitle || i.product.title : null,
    })),
  })
})
