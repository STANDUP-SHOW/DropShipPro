import type { Platform } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { mapCategory } from './categoryMapping.js'

/**
 * No marketplace has a connected seller account yet (that requires per-platform
 * OAuth/API credentials with a verified seller account — see Settings). Until then,
 * "publishing" records the intent and target category so the back office reflects
 * exactly what will go out, and flips to PUBLISHED automatically for OWN_SITE
 * (served immediately via the public catalog API) while everything else stays
 * PENDING until the platform is connected in Settings.
 */
export async function publishToPlatform(productId: string, platform: Platform) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  const targetCategory = mapCategory(product.sourceCategory, platform, product.categoryId)

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
