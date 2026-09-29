/**
 * La marque, dans l'en-tête et sur les pages publiques.
 *
 * Charte du 29/09/2026 (docs/marque/) : l'icône (le cube orange → rose) et le
 * mot « DropShipper » sont deux images SÉPARÉES, pas l'assemblage complet.
 * Réglé avec Max le même jour : l'icône en grand (deux fois l'ancienne taille),
 * le mot à la moitié — le D fait la moitié de la hauteur de l'icône, centré
 * verticalement sur elle.
 *
 * La mesure vient du fichier lui-même (logo-v2-dropshipper.png rogné,
 * 810 px de haut) : le D, contour blanc compris, va de la ligne 9 à la ligne
 * 639, soit 631 px. Le mot est mis à l'échelle (icône / 2) / 631, puis placé
 * pour que le milieu du D tombe au milieu de l'icône ; les jambages des « p »
 * descendent sans agrandir la ligne.
 *
 * La hauteur de l'icône est `min(size × 2,5 px, 9vw)` : jamais plus large que
 * l'écran sur un téléphone (l'ensemble fait ~4,7 fois la hauteur de l'icône).
 */
const HAUTEUR_MOT = 810
const HAUT_DU_D = 9
const HAUTEUR_DU_D = 631
/** La hauteur du D rapportée à celle de l'icône. */
const PART_DU_D = 0.5

export function Logo({ size = 28 }: { size?: number }) {
  const h = `min(${Math.round(size * 2.5)}px, 9vw)`
  const echelle = PART_DU_D / HAUTEUR_DU_D
  return (
    <div className="flex shrink-0 items-start" style={{ height: h, gap: `calc(${h} * 0.14)` }}>
      <img src="/marque/dropshipper-icone.png" alt="" aria-hidden style={{ width: h, height: h }} className="block shrink-0" />
      <img
        src="/marque/dropshipper-mot.png"
        alt="DropShipper IA"
        style={{
          height: `calc(${h} * ${HAUTEUR_MOT * echelle})`,
          width: 'auto',
          // Milieu du D sur le milieu de l'icône.
          marginTop: `calc(${h} * ${(1 - PART_DU_D) / 2 - HAUT_DU_D * echelle})`,
        }}
        className="block max-w-none shrink-0"
      />
    </div>
  )
}
