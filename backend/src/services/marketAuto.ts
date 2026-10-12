import { prisma } from '../lib/prisma.js'

/**
 * Diffusion automatique d'une annonce de boutique sur DropShop Market.
 *
 * Tout vendeur qui publie sur sa boutique (« Mon site ») est aussi sur le
 * Market, sauf s'il a coché « ne pas publier mes produits sur DropShop Market »
 * (User.marketAuto = false). Par défaut c'est activé : c'est ce qui remplit la
 * place de marché.
 *
 * On ne crée l'annonce que s'il n'existe AUCUNE ligne Market pour ce produit :
 * un retrait de la modération (statut FAILED) ou un choix déjà fait ne doit
 * jamais être défait par une republication sur la boutique.
 */
export async function diffuserSurMarket(productId: string, userId: string): Promise<boolean> {
  const vendeur = await prisma.user.findUnique({ where: { id: userId }, select: { marketAuto: true } })
  if (!vendeur?.marketAuto) return false

  const existante = await prisma.publication.findUnique({
    where: { productId_platform: { productId, platform: 'DROPSHOP_MARKET' } },
    select: { id: true },
  })
  if (existante) return false

  await prisma.publication.create({
    data: { productId, platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', publishedAt: new Date() },
  })
  return true
}

/**
 * Rattrapage : met sur le Market les produits DÉJÀ en boutique qui n'y sont pas.
 *
 * La diffusion ci-dessus ne part qu'à la publication sur la boutique ; les
 * produits publiés avant le 07/10/2026, ou pendant que le vendeur avait coupé
 * la diffusion, n'y étaient jamais passés. Même règles : refus du vendeur
 * respecté, aucune ligne Market existante touchée (un retrait reste un retrait).
 * Idempotent, donc sans risque au démarrage comme à la réactivation.
 */
export async function rattraperBoutiquesSurMarket(userId?: string): Promise<number> {
  const candidates = await prisma.publication.findMany({
    where: {
      platform: 'OWN_SITE',
      status: 'PUBLISHED',
      product: {
        ...(userId ? { userId } : {}),
        user: { marketAuto: true },
        publications: { none: { platform: 'DROPSHOP_MARKET' } },
      },
    },
    select: { productId: true },
  })
  if (!candidates.length) return 0
  const r = await prisma.publication.createMany({
    data: candidates.map((c) => ({
      productId: c.productId,
      platform: 'DROPSHOP_MARKET' as const,
      status: 'PUBLISHED' as const,
      publishedAt: new Date(),
    })),
    skipDuplicates: true,
  })
  return r.count
}
