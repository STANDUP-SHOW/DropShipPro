import type { Platform, Product } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { mapCategory } from './categoryMapping.js'
import { publishToShopify, readShopifyCredentials } from './shopify.js'

/**
 * Records a publication, and actually pushes the product where that is possible.
 *
 * Two destinations are real today: OWN_SITE (served immediately by the public
 * catalog API) and SHOPIFY (Admin API call, once the merchant has saved the token
 * of a custom app in Réglages). Every marketplace still stays PENDING — they all
 * require per-platform OAuth with a validated seller account.
 *
 * `apiBaseUrl` is this API's public address: Shopify downloads the watermarked
 * photos itself, so the relative /storage paths have to be made absolute.
 */
export async function publishToPlatform(productId: string, platform: Platform, apiBaseUrl?: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  const targetCategory = mapCategory(product.sourceCategory, platform, product.categoryId)

  if (platform === 'SHOPIFY') return publishShopify(product, targetCategory, apiBaseUrl)

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
