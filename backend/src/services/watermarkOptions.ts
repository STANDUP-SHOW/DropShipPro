import type { User } from '@prisma/client'
import type { WatermarkOptions, WatermarkPosition } from './watermark.js'

/**
 * Lit les réglages de filigrane du vendeur ; le logo l'emporte sur le texte.
 *
 * Extrait des routes parce que le pilote automatique importe la nuit, sans
 * requête HTTP : deux chemins d'import doivent poser exactement le même
 * filigrane, sans quoi les annonces d'un même vendeur ne se ressembleraient pas.
 */
export function watermarkOptionsFor(user: User): WatermarkOptions {
  return {
    text: user.watermarkText || user.shopName || 'DropShip Pro',
    imagePath: user.watermarkImage,
    scale: user.watermarkScale,
    opacity: user.watermarkOpacity,
    position: user.watermarkPosition as WatermarkPosition,
  }
}
