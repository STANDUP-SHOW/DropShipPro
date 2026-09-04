/**
 * Les portraits de l'équipe — la planche fournie le 06/09/2026, découpée en
 * un fichier par agent dans `public/agents/<clé>.webp` (512², studio gris).
 *
 * Seuls les treize agents d'administration ont leur portrait ; un chef de
 * rayon sans photo garde son emoji — les vignettes retombent dessus quand
 * cette fonction rend `null`.
 */

const AVEC_PHOTO = new Set([
  'hotline',
  'commercial',
  'sav',
  'comptable',
  'avocat',
  'scrapper',
  'writer',
  'control',
  'seller',
  'autopilot',
  'photo',
  'marketing',
  'livraisons',
])

export function photoAgent(key: string | null | undefined): string | null {
  return key && AVEC_PHOTO.has(key) ? `/agents/${key}.webp` : null
}
