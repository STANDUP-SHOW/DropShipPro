import { PLATFORMS } from './platforms.js'
import type { Platform, Product } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { mapCategory } from './categoryMapping.js'
import { publishToShopify, readShopifyCredentials } from './shopify.js'

/**
 * Records a publication, and actually pushes the product where that is possible.
 *
 * Three shapes of destination. OWN_SITE and SHOPIFY are pushed to directly: the
 * public catalogue serves one, an Admin API call creates the other. Instagram,
 * the Facebook shop and Google Shopping are 'feed' channels — they come and read
 * a catalogue we expose, so publishing to them means making sure the listing is
 * in that catalogue and that the seller has wired the address on their side.
 * Every remaining marketplace stays PENDING: each needs its own OAuth with a
 * validated seller account.
 *
 * `apiBaseUrl` is this API's public address: Shopify downloads the watermarked
 * photos itself, so the relative /storage paths have to be made absolute.
 */
/** Tiré du registre : une destination ajoutée là n'a rien à redéclarer ici. */
const FEED_PLATFORMS = PLATFORMS.filter((p) => p.integration === 'feed').map((p) => p.id)

export async function publishToPlatform(productId: string, platform: Platform, apiBaseUrl?: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  const targetCategory = mapCategory(product.sourceCategory, platform, product.categoryId)

  if (platform === 'SHOPIFY') return publishShopify(product, targetCategory, apiBaseUrl)

  if (FEED_PLATFORMS.includes(platform)) {
    return publishToFeedChannel(productId, platform, product.userId)
  }

  const isReady = platform === 'OWN_SITE'

  return prisma.publication.upsert({
    where: { productId_platform: { productId, platform } },
    create: {
      productId,
      platform,
      targetCategory,
      status: isReady ? 'PUBLISHED' : 'PENDING',
      publishedAt: isReady ? new Date() : null,
    },
    update: {
      targetCategory,
      status: isReady ? 'PUBLISHED' : 'PENDING',
      publishedAt: isReady ? new Date() : null,
    },
  })
}

/**
 * A Shopify push can fail for reasons the seller must read (revoked token, wrong
 * shop address, product refused). The error is stored on the publication rather
 * than thrown: publishing to several destinations at once must not lose the ones
 * that worked.
 */
async function publishShopify(product: Product, targetCategory: string, apiBaseUrl?: string) {
  const where = { productId_platform: { productId: product.id, platform: 'SHOPIFY' as const } }

  const [user, credential] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: product.userId }, select: { shopName: true } }),
    prisma.platformCredential.findUnique({
      where: { userId_platform: { userId: product.userId, platform: 'SHOPIFY' } },
    }),
  ])

  const creds = credential?.connected ? readShopifyCredentials(credential.data) : null
  if (!creds) {
    // Not connected yet: same "en attente" behaviour as the marketplaces.
    return prisma.publication.upsert({
      where,
      create: {
        productId: product.id,
        platform: 'SHOPIFY',
        targetCategory,
        status: 'PENDING',
        error: 'Boutique Shopify non connectée : ajoutez le jeton dans Réglages.',
      },
      update: {
        targetCategory,
        status: 'PENDING',
        error: 'Boutique Shopify non connectée : ajoutez le jeton dans Réglages.',
        publishedAt: null,
      },
    })
  }

  try {
    const { externalUrl, notes } = await publishToShopify(product, user, targetCategory, creds, apiBaseUrl)
    const data = {
      targetCategory,
      status: 'PUBLISHED' as const,
      externalUrl,
      error: notes.length ? notes.join(' ') : null,
      publishedAt: new Date(),
    }
    return prisma.publication.upsert({ where, create: { productId: product.id, platform: 'SHOPIFY', ...data }, update: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Publication Shopify impossible'
    console.error('publication Shopify', e)
    const data = { targetCategory, status: 'FAILED' as const, error: message, publishedAt: null }
    return prisma.publication.upsert({ where, create: { productId: product.id, platform: 'SHOPIFY', ...data }, update: data })
  }
}

/**
 * Une destination qui lit un flux ne reçoit pas d'annonce : elle vient chercher.
 *
 * Instagram, la boutique Facebook et Google Shopping se remplissent d'un
 * catalogue qu'ils relisent d'eux-mêmes. Publier vers l'une d'elles revient donc
 * à s'assurer que le produit figure bien dans le flux — et à ne pas prétendre
 * qu'il est en ligne tant que le vendeur n'a pas branché l'adresse chez eux.
 */
export async function publishToFeedChannel(productId: string, platform: Platform, userId: string) {
  const credential = await prisma.platformCredential.findUnique({
    where: { userId_platform: { userId, platform } },
  })

  if (!credential?.connected) {
    return prisma.publication.upsert({
      where: { productId_platform: { productId, platform } },
      create: {
        productId,
        platform,
        status: 'PENDING',
        error:
          "Flux non branché : copiez l'adresse du flux dans Réglages, collez-la chez Meta ou Google, puis cochez « flux branché ».",
      },
      update: {
        status: 'PENDING',
        error:
          "Flux non branché : copiez l'adresse du flux dans Réglages, collez-la chez Meta ou Google, puis cochez « flux branché ».",
      },
    })
  }

  // Le flux ne sert que ce qui est publié sur « Mon site » : sans cela le
  // produit n'y figurerait pas, et l'annonce se dirait en ligne sans l'être.
  const own = await prisma.publication.findUnique({
    where: { productId_platform: { productId, platform: 'OWN_SITE' } },
  })
  if (!own || own.status !== 'PUBLISHED') {
    return prisma.publication.upsert({
      where: { productId_platform: { productId, platform } },
      create: {
        productId,
        platform,
        status: 'PENDING',
        error: "Publiez d'abord cette annonce sur « Mon site » : le flux ne sert que ce catalogue.",
      },
      update: {
        status: 'PENDING',
        error: "Publiez d'abord cette annonce sur « Mon site » : le flux ne sert que ce catalogue.",
      },
    })
  }

  return prisma.publication.upsert({
    where: { productId_platform: { productId, platform } },
    create: { productId, platform, status: 'PUBLISHED', publishedAt: new Date(), error: null },
    update: { status: 'PUBLISHED', publishedAt: new Date(), error: null },
  })
}
