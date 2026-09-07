import { useId } from 'react'

/**
 * La pièce des drops — la monnaie de DropShipper.
 *
 * Une pièce d'or frappée d'un « D » barré de deux traits verticaux, comme le
 * symbole d'une monnaie. Dessinée en SVG plutôt qu'en image : une seule source
 * sert le grand format de la page d'explication et le petit du portefeuille, des
 * forfaits et des recharges, toujours nette quelle que soit la taille.
 *
 * Chaque instance a ses propres identifiants de dégradé (`useId`) : deux pièces
 * sur la même page ne se partagent pas un `id`, ce qui, sinon, ferait hériter la
 * seconde du dégradé de la première.
 */
export function DropCoin({ size = 24, className }: { size?: number; className?: string }) {
  const id = useId()
  const face = `${id}-face`
  const rim = `${id}-rim`
  const glyph = `${id}-glyph`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="drops"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7C948" />
          <stop offset="1" stopColor="#B9780C" />
        </linearGradient>
        <linearGradient id={face} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="0.5" stopColor="#F5B518" />
          <stop offset="1" stopColor="#E09410" />
        </linearGradient>
        <linearGradient id={glyph} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8A5606" />
          <stop offset="1" stopColor="#B37610" />
        </linearGradient>
      </defs>

      {/* La tranche, plus foncée, qui donne l'épaisseur de la pièce. */}
      <circle cx="50" cy="50" r="48" fill={`url(#${rim})`} />
      {/* La face, avec un liseré gravé. */}
      <circle cx="50" cy="50" r="41" fill={`url(#${face})`} stroke="#C6890F" strokeWidth="1.6" />

      {/* Le « D » barré, avec un léger relief clair au-dessus de l'ombre. */}
      <g>
        {/* Les deux traits verticaux de la monnaie, sur le fût gauche du D. */}
        <rect x="40.5" y="20" width="6" height="16" rx="3" fill={`url(#${glyph})`} />
        <rect x="40.5" y="64" width="6" height="16" rx="3" fill={`url(#${glyph})`} />
        {/* Relief : un « D » clair décalé derrière, puis le « D » foncé. */}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'Trebuchet MS', 'Segoe UI', Arial, sans-serif"
          fontWeight={800}
          fontSize="58"
          fill="#FFF3C4"
          opacity="0.55"
        >
          D
        </text>
        <text
          x="50"
          y="52.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'Trebuchet MS', 'Segoe UI', Arial, sans-serif"
          fontWeight={800}
          fontSize="58"
          fill={`url(#${glyph})`}
        >
          D
        </text>
      </g>
    </svg>
  )
}
