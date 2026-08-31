import type { Product, Shop, User } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { marquerPourExport, signatureFiligrane } from './watermark.js'
import type { WatermarkOptions, WatermarkPosition } from './watermark.js'

/**
 * Les photos telles qu'elles quittent DropShipper.
 *
 * Le filigrane ne se pose plus à l'import mais ici, au dernier moment. Ce qui
 * change, et c'est tout le sujet : l'original reste intact en base. Le vendeur
 * peut changer de logo sans rien réimporter, l'agent photo travaille sur une
 * image propre, et une publicité ne se retrouve plus avec deux marques
 * superposées.
 *
 * Le résultat est gardé avec la signature des réglages qui l'ont produit. Même
 * signature, on ressert ; signature différente, on refait. Sans ce cache, une
 * boutique de trois cents annonces recomposerait mille cinq cents images à
 * chaque relecture de son flux.
 */

/**
 * Les réglages de marque qui s'appliquent à cette annonce.
 *
 * La boutique l'emporte sur le compte, et c'est la raison d'être du logo par
 * boutique : un vendeur qui tient un site de mode et un site high-tech ne signe
 * pas ses photos de la même façon. Chaque champ retombe séparément sur celui du
 * compte — une boutique qui n'a réglé que sa position garde le logo du compte.
 */
export function reglagesFiligrane(user: User, shop?: Shop | null): WatermarkOptions {
  /*
   * Texte ou logo : un choix, plus une consequence de ce qui existe.
   *
   * Le logo l'emportait des qu'il etait present. Un vendeur qui deposait un
   * logo pour sa fiche boutique voyait ses photos signees avec, sans l'avoir
   * demande, et ne pouvait revenir au texte qu'en supprimant le fichier.
   *
   * La boutique decide pour elle-meme, ou s'en remet au compte.
   */
  const mode = shop?.watermarkMode ?? user.watermarkMode ?? 'logo'
  const logo = shop?.logo || user.watermarkImage

  return {
    text: shop?.watermarkText || user.watermarkText || shop?.name || user.shopName || 'DropShip Pro',
    // En mode texte, aucun logo n'est transmis : le composeur pose le logo des
    // qu'il en recoit un.
    imagePath: mode === 'logo' ? logo : null,
    scale: shop?.watermarkScale ?? user.watermarkScale,
    opacity: shop?.watermarkOpacity ?? user.watermarkOpacity,
    position: (shop?.watermarkPosition ?? user.watermarkPosition) as WatermarkPosition,
    // Une boutique peut couper le filigrane sans que le compte le coupe.
    enabled: shop ? shop.watermarkEnabled && user.watermarkEnabled : user.watermarkEnabled,
  }
}

/** Les images d'une annonce, sous leur forme brute. */
function imagesDe(produit: Product): string[] {
  return (Array.isArray(produit.images) ? produit.images : []).filter(
    (i): i is string => typeof i === 'string',
  )
}

/**
 * Rend les photos à publier, marquées si besoin.
 *
 * Trois cas, dans l'ordre où ils se présentent :
 *
 * - **L'annonce est antérieure au changement** : ses fichiers portent déjà la
 *   marque, cuite dedans. On ne peut pas l'en retirer, et poser la nouvelle
 *   par-dessus en ferait deux. Elles partent telles quelles.
 * - **Le résultat est déjà en cache** pour ces réglages : on le ressert.
 * - **Sinon** on marque, et on garde.
 */
export async function imagesPourExport(produit: Product, shopId?: string | null): Promise<string[]> {
  const images = imagesDe(produit)
  if (!images.length) return []

  // Le fichier porte déjà la marque : rien à ajouter, et surtout rien à
  // superposer.
  if (produit.imagesWatermarked) return images

  const [user, shop] = await Promise.all([
    prisma.user.findUnique({ where: { id: produit.userId } }),
    shopId || produit.shopId
      ? prisma.shop.findUnique({ where: { id: (shopId || produit.shopId)! } })
      : Promise.resolve(null),
  ])
  if (!user) return images

  const reglages = reglagesFiligrane(user, shop)
  const signature = signatureFiligrane(reglages)

  const enCache = Array.isArray(produit.exportImages) ? produit.exportImages : null
  if (produit.exportSignature === signature && enCache?.length) {
    return enCache.filter((i): i is string => typeof i === 'string')
  }

  const marquees = await marquerPourExport(images, reglages, produit.aiTitle || produit.title)

  await prisma.product.update({
    where: { id: produit.id },
    data: { exportImages: marquees, exportSignature: signature },
  })

  return marquees
}

/**
 * Oublie les images marquées d'un vendeur.
 *
 * Appelé quand les réglages du compte changent. La signature suffirait à les
 * faire refaire d'elles-mêmes, mais vider explicitement évite de garder des
 * fichiers que plus personne ne servira — et rend le changement visible tout de
 * suite plutôt qu'à la prochaine publication.
 */
export async function oublierImagesExport(userId: string): Promise<number> {
  const { count } = await prisma.product.updateMany({
    where: { userId, exportSignature: { not: null } },
    data: { exportImages: undefined, exportSignature: null },
  })
  return count
}
