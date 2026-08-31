import type { User } from '@prisma/client'
import type { WatermarkOptions, WatermarkPosition } from './watermark.js'

/**
 * Lit les réglages de filigrane du vendeur : texte ou logo, selon son choix.
 *
 * Extrait des routes parce que le pilote automatique importe la nuit, sans
 * requête HTTP : deux chemins d'import doivent poser exactement le même
 * filigrane, sans quoi les annonces d'un même vendeur ne se ressembleraient pas.
 */
export function watermarkOptionsFor(user: User): WatermarkOptions {
  return {
    text: user.watermarkText || user.shopName || 'DropShip Pro',
    // Le choix du vendeur, et non « le logo s'il existe » : voir
    // reglagesFiligrane, meme regle des deux cotes sous peine d'avoir deux
    // filigranes differents selon le chemin d'import.
    imagePath: user.watermarkMode === 'texte' ? null : user.watermarkImage,
    scale: user.watermarkScale,
    opacity: user.watermarkOpacity,
    position: user.watermarkPosition as WatermarkPosition,
    enabled: user.watermarkEnabled,
  }
}
