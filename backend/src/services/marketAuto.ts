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
