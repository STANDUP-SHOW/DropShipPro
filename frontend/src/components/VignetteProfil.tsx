import { BadgeCheck } from 'lucide-react'

/**
 * La vignette profil des agents — le modèle « social media » fourni le
 * 06/09/2026, passé à notre charte : carte de verre sur le fond sombre, des
 * orbes lumineux flous derrière, la photo ronde cerclée de blanc, le prénom
 * avec son badge, et la pilule blanche qui porte le RÔLE à la place de
 * « Follow ».
 *
 * La photo arrive par la prop `photo` (la planche est en route) ; sans elle,
 * l'emoji de l'agent occupe le cercle sur un dégradé — l'échange se fera sans
 * toucher aux pages.
 */

/** Les paires d'orbes, dans les teintes de l'application. */
const ORBES: Array<[string, string]> = [
  ['#f97316', '#fbbf24'], // feu — celles du modèle
  ['#8b5cf6', '#e879f9'], // violet → fuchsia
  ['#38bdf8', '#818cf8'], // glace
  ['#f472b6', '#fb7185'], // rose
]

/** Une graine stable par prénom : les orbes d'un agent ne bougent pas. */
function graine(texte: string): number {
  let g = 0
  for (let i = 0; i < texte.length; i++) g = (g * 31 + texte.charCodeAt(i)) % 9973
  return g
}

export function VignetteProfil({
  prenom,
  role,
  emoji,
  photo = null,
  stats,
  compact = false,
  coin,
  children,
}: {
  prenom: string
  role: string
  emoji: string
  /** L'adresse de la photo détourée ; l'emoji sert tant qu'elle manque. */
  photo?: string | null
  /** Jusqu'à trois compteurs, comme la rangée posts/followers du modèle. */
  stats?: Array<{ valeur: string; libelle: string }>
  compact?: boolean
  /** Le coin haut droit — la pastille d'état d'un agent, par exemple. */
  coin?: React.ReactNode
  /** Ce que la fiche porte sous la pilule : mission, prix, interrupteurs. */
  children?: React.ReactNode
}) {
  const g = graine(prenom)
  const [orbeA1, orbeA2] = ORBES[g % ORBES.length]
  const [orbeB1, orbeB2] = ORBES[(g + 1) % ORBES.length]
  const cercle = compact ? 'h-16 w-16 text-3xl' : 'h-24 w-24 text-5xl'

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.07] p-5 text-center backdrop-blur-2xl"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 14px 40px rgba(0,0,0,0.35)' }}
    >
      {/* Les orbes du modèle, flous derrière le verre. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-6 top-1/3 h-24 w-24 rounded-full opacity-60 blur-xl"
        style={{ background: `radial-gradient(circle at 35% 30%, ${orbeA2}, ${orbeA1})` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -right-4 h-28 w-28 rounded-full opacity-50 blur-xl"
        style={{ background: `radial-gradient(circle at 40% 35%, ${orbeB2}, ${orbeB1})` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-5 right-8 h-14 w-14 rounded-full opacity-40 blur-lg"
        style={{ background: `radial-gradient(circle at 40% 35%, ${orbeA1}, ${orbeB2})` }}
      />

      {/* La photo — carrée à coins ronds, comme nos blocs (06/09/2026). */}
      <div className="relative mx-auto">
        <span
          className={`relative mx-auto flex ${cercle} items-center justify-center overflow-hidden rounded-2xl ring-2 ring-white/80 ring-offset-2 ring-offset-transparent`}
          style={
            photo
              ? undefined
              : { background: `linear-gradient(135deg, ${orbeA1}33, ${orbeB1}55)` }
          }
        >
          {photo ? (
            <img src={photo} alt={prenom} className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{emoji}</span>
          )}
        </span>
      </div>

      {/* Le prénom et son badge, à la place de « Username ». */}
      <p className={`relative mt-3 flex items-center justify-center gap-1.5 font-bold ${compact ? 'text-base' : 'text-lg'}`}>
        <span>{prenom}</span>
        <BadgeCheck size={compact ? 14 : 16} className="text-amber-400" />
      </p>

      {/* La rangée de compteurs du modèle, quand la page en a. */}
      {stats?.length ? (
        <div className="relative mt-3 flex items-start justify-center gap-6">
          {stats.slice(0, 3).map((s) => (
            <div key={s.libelle}>
              <p className="text-sm font-bold leading-tight">{s.valeur}</p>
              <p className="text-[11px] text-gray-400">{s.libelle}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* La pilule blanche : le rôle, à la place de « Follow ». */}
      <p className="relative mt-4">
        <span className="inline-block rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[0_2px_10px_rgba(255,255,255,0.15)]">
          {role}
        </span>
      </p>

      {coin ? <span className="absolute right-3 top-3">{coin}</span> : null}

      {children ? <div className="relative mt-4 text-left">{children}</div> : null}
    </div>
  )
}

/**
 * La fiche d'agent des fenêtres de tchat (06/09/2026) : posée en tête de la
 * conversation — le portrait carré à coins ronds, le prénom badgé, le rôle.
 * La même identité que la vignette profil, au format bandeau.
 */
export function FicheAgentChat({
  prenom,
  role,
  emoji,
  photo = null,
}: {
  prenom: string
  role: string
  emoji: string
  photo?: string | null
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl ring-1 ring-white/40"
        style={photo ? undefined : { background: 'linear-gradient(135deg, #8b5cf633, #38bdf855)' }}
      >
        {photo ? <img src={photo} alt={prenom} className="h-full w-full object-cover" /> : <span aria-hidden>{emoji}</span>}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-bold leading-tight">
          <span>{prenom}</span>
          <BadgeCheck size={14} className="shrink-0 text-amber-400" />
        </p>
        <p className="mt-0.5 inline-block rounded-lg bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-900">
          {role}
        </p>
      </div>
    </div>
  )
}
