/**
 * Une frise de logos qui défile sans fin, pleine largeur, 150 px de haut.
 *
 * Demandée le 24/09/2026 par Max pour l'accueil : sous le bloc des
 * fournisseurs, leurs logos de droite à gauche ; sous le bloc de la diffusion,
 * les 314 canaux de l'annuaire sur deux lignes, dans l'autre sens. La liste est
 * rendue deux fois à la suite et la piste glisse d'exactement une moitié : la
 * seconde copie prend la place de la première au moment où la boucle repart,
 * et l'œil ne voit pas la couture. L'espacement est un `padding` de chaque
 * élément, pas un `gap` de la piste : avec un gap, la moitié ne tombe pas sur
 * un tour complet et la frise saute d'un demi-espace à chaque boucle.
 *
 * Chaque logo est posé sur une carte blanche : la plupart des logos de canaux
 * sont sombres sur fond transparent et disparaîtraient sur le fond du site.
 * Sans fichier (`logo: null`), une pastille aux initiales dans la couleur de
 * la marque tient la place. La vitesse suit le nombre de logos (une durée
 * fixe ferait défiler 314 logos huit fois plus vite que 38). Le survol met en
 * pause ; `prefers-reduced-motion` arrête tout et laisse défiler à la main.
 */

export interface LogoFrise {
  id: string
  label: string
  /** L'adresse du fichier depuis la racine du site, ou null : pastille. */
  logo: string | null
  /** La couleur de la pastille de repli. */
  couleur?: string
}

function initiales(label: string): string {
  const mots = label.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
  return (mots.length >= 2 ? mots[0][0] + mots[1][0] : label.slice(0, 2)).toUpperCase()
}

export function FriseLogos({
  logos,
  sens = 'gauche',
  secondesParLogo = 2.2,
  className = '',
}: {
  logos: LogoFrise[]
  /** Vers où les logos vont : `gauche` = de droite à gauche. */
  sens?: 'gauche' | 'droite'
  secondesParLogo?: number
  className?: string
}) {
  if (logos.length === 0) return null
  const duree = Math.max(20, Math.round(logos.length * secondesParLogo))
  return (
    <div className={`frise ${className}`} aria-label={`${logos.length} logos`}>
      <ul className="frise-piste" data-sens={sens} style={{ animationDuration: `${duree}s` }}>
        {[...logos, ...logos].map((l, i) => {
          const copie = i >= logos.length
          return (
            <li key={`${l.id}-${i}`} className="flex h-full shrink-0 items-center px-4" aria-hidden={copie || undefined} title={l.label}>
              <span className="flex h-24 w-44 items-center justify-center rounded-2xl bg-white p-3 shadow-lg shadow-black/30">
                {l.logo ? (
                  <img
                    src={l.logo}
                    alt={copie ? '' : l.label}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-xl text-xl font-extrabold text-white"
                    style={{ background: l.couleur || '#7c3aed' }}
                  >
                    {initiales(l.label)}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
