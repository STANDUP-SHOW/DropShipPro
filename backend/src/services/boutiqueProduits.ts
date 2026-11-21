import { prisma } from '../lib/prisma.js'
import { publishToPlatform } from './publisher.js'

/**
 * Les produits d'une boutique DropShop, rangés depuis le studio.
 *
 * Avant le 21/11/2026, une boutique créée démarrait VIDE : un produit n'y
 * entrait que publié un par un sur « Mon site » en désignant cette boutique,
 * geste que personne ne connaissait. Résultat signalé par max : « coquilles
 * vides ». Désormais :
 *  - à la création, une boutique vide reçoit les produits du vendeur qui ne
 *    sont dans aucune autre de ses boutiques (`remplirSiVide`) ;
 *  - le studio liste tous ses produits et les met ou les retire d'un clic.
 *
 * Mettre en boutique = ranger (`shopId`) + publier sur « Mon site », par le
 * même chemin que la publication manuelle (et donc la diffusion Market).
 */

export interface ProduitStudio {
  id: string
  titre: string
  prix: number
  image: string | null
  dansBoutique: boolean
  autreBoutique: string | null
  vendable: boolean
}

function premiereImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const i = images.find((x) => typeof x === 'string' && x)
  return typeof i === 'string' ? i : null
}

export async function produitsDuStudio(userId: string, shopId: string): Promise<ProduitStudio[]> {
  const produits = await prisma.product.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    select: {
      id: true,
      title: true,
      aiTitle: true,
      sellingPrice: true,
      images: true,
      shopId: true,
      shop: { select: { name: true } },
      publications: { where: { platform: 'OWN_SITE', status: 'PUBLISHED' }, select: { id: true } },
    },
  })
  return produits.map((p) => {
    const publie = p.publications.length > 0
    return {
      id: p.id,
      titre: p.aiTitle || p.title,
      prix: Number(p.sellingPrice),
      image: premiereImage(p.images),
      dansBoutique: publie && p.shopId === shopId,
      autreBoutique: publie && p.shopId && p.shopId !== shopId ? p.shop?.name ?? 'une autre boutique' : null,
      vendable: Number(p.sellingPrice) > 0,
    }
  })
}

/** Range et publie ces produits dans la boutique. Un produit sans prix de vente est refusé, pas publié à 0 €. */
export async function mettreEnBoutique(userId: string, shopId: string, ids: string[]): Promise<{ ajoutes: number; sansPrix: number }> {
  const produits = await prisma.product.findMany({ where: { userId, id: { in: ids } }, select: { id: true, sellingPrice: true } })
  let ajoutes = 0
  let sansPrix = 0
  for (const p of produits) {
    if (!(Number(p.sellingPrice) > 0)) {
      sansPrix++
      continue
    }
    await prisma.product.update({ where: { id: p.id }, data: { shopId } })
    await publishToPlatform(p.id, 'OWN_SITE')
    ajoutes++
  }
  return { ajoutes, sansPrix }
}

/** Retire ces produits de la vitrine (le produit reste dans le compte). */
export async function retirerDeBoutique(userId: string, shopId: string, ids: string[]): Promise<number> {
  const r = await prisma.publication.deleteMany({
    where: { platform: 'OWN_SITE', productId: { in: ids }, product: { userId, shopId } },
  })
  return r.count
}

/**
 * Une boutique sans aucun produit reçoit ceux du vendeur qui ne sont en vente
 * dans aucune autre de ses boutiques. On ne déplace jamais un produit déjà en
 * vitrine ailleurs : ce serait vider une autre boutique sans le dire.
 */
export async function remplirSiVide(userId: string, shopId: string): Promise<number> {
  const deja = await prisma.publication.count({ where: { platform: 'OWN_SITE', status: 'PUBLISHED', product: { shopId } } })
  if (deja > 0) return 0
  const libres = await prisma.product.findMany({
    where: {
      userId,
      sellingPrice: { gt: 0 },
      OR: [
        { shopId: null },
        { shopId },
        { publications: { none: { platform: 'OWN_SITE', status: 'PUBLISHED' } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true },
  })
  if (!libres.length) return 0
  const { ajoutes } = await mettreEnBoutique(userId, shopId, libres.map((p) => p.id))
  return ajoutes
}
