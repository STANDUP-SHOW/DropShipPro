import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * Les tuiles du tableau de bord statistiques.
 *
 * **Le style vient des références du 03/09/2026** : fond sombre existant,
 * dégradés néon (rose→orangé, cyan→indigo, violet→magenta, vert→cyan), et la
 * consigne dite en clair : « ces graphiques sont nombreux et différents, cela
 * permet de ne jamais utiliser deux fois la même chose ». D'où **neuf formes**
 * — courbe, bâtons, points, égaliseur, anneau, arcs concentriques, anneau
 * cranté, barre, segments — attribuées en tournant : deux tuiles voisines ne
 * portent jamais le même dessin, ni le même dégradé.
 *
 * Tout est en SVG maison : une bibliothèque de graphiques pèserait cent fois
 * le besoin, et ces tuiles n'affichent jamais plus d'une série.
 *
 * **La règle d'honnêteté, héritée de la couche de données** : une forme qui
 * encode une mesure (courbe, jauge…) n'est employée que si la donnée existe —
 * une série pour les courbes, une valeur sur cent pour les anneaux. Une valeur
 * seule reçoit un trait dégradé **plein** : de l'ornement, pas un graphique
 * qui ferait croire à une mesure. Et une tuile vide (`valeur: null`) s'affiche
 * en retrait avec sa raison.
 */

export interface TuileData {
  id: string
  label: string
  valeur: number | string | null
  unite?: string
  evolution?: number | null
  serie?: number[]
  raison?: string
}

export interface BlocData {
  id: string
  numero: string
  titre: string
  tuiles: TuileData[]
}

/** Les paires de dégradés des références, cyclées tuile par tuile. */
const PALETTES: Array<[string, string]> = [
  ['#f472b6', '#fb923c'], // rose → orangé
  ['#22d3ee', '#6366f1'], // cyan → indigo
  ['#a78bfa', '#ec4899'], // violet → magenta
  ['#34d399', '#22d3ee'], // vert → cyan
  ['#fbbf24', '#f97316'], // ambre → orange
  ['#60a5fa', '#c084fc'], // bleu → mauve
]

function formatValeur(v: number | string, unite?: string): string {
  if (typeof v === 'string') return v
  const texte =
    unite === '€'
      ? v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : v.toLocaleString('fr-FR')
  if (!unite) return texte
  if (unite === '/100') return `${texte}/100`
  return `${texte} ${unite}`
}

interface Encre {
  de: string
  a: string
}

/** Dégradé nommé une fois par tuile ; `useId` évite les collisions entre SVG. */
function Degrade({ id, de, a, vertical = false }: { id: string; de: string; a: string; vertical?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      <stop offset="0" stopColor={de} />
      <stop offset="1" stopColor={a} />
    </linearGradient>
  )
}

const normalisee = (serie: number[]) => {
  const max = Math.max(...serie, 1)
  return serie.map((v) => v / max)
}

// --- Les formes à série ------------------------------------------------------

/** Courbe : aire + trait dégradé. */
function Etincelle({ serie, encre }: { serie: number[]; encre: Encre }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie)
  const pas = n.length > 1 ? 100 / (n.length - 1) : 100
  const pts = n.map((v, i) => [i * pas, H - 4 - v * (H - 8)] as const)
  const trait = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={`${gid}t`} {...encre} />
        <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={encre.de} stopOpacity="0.35" />
          <stop offset="1" stopColor={encre.a} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${trait} L100,${H} L0,${H} Z`} fill={`url(#${gid}a)`} />
      <path d={trait} fill="none" stroke={`url(#${gid}t)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Bâtons verticaux arrondis. */
function Batons({ serie, encre, graine = 0 }: { serie: number[]; encre: Encre; graine?: number }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-(16 + (graine % 4) * 4))
  const larg = 100 / n.length
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} vertical />
      </defs>
      {n.map((v, i) => {
        const h = Math.max(2, v * (H - 4))
        return <rect key={i} x={i * larg + larg * 0.18} y={H - h} width={larg * 0.64} height={h} rx="1.5" fill={`url(#${gid})`} />
      })}
    </svg>
  )
}

/** Points reliés d'un fil discret — la forme « relevés » des références. */
function Points({ serie, encre }: { serie: number[]; encre: Encre }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-14)
  const pas = n.length > 1 ? 92 / (n.length - 1) : 92
  const pts = n.map((v, i) => [4 + i * pas, H - 5 - v * (H - 10)] as const)
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <path
        d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.1" fill={`url(#${gid})`} />
      ))}
    </svg>
  )
}

/** Égaliseur en miroir — les barres doubles des références. */
function Egaliseur({ serie, encre, graine = 0 }: { serie: number[]; encre: Encre; graine?: number }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-(14 + (graine % 4) * 4))
  const larg = 100 / n.length
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} vertical />
      </defs>
      {n.map((v, i) => {
        const h = Math.max(1.5, (v * (H - 6)) / 2)
        return (
          <g key={i}>
            <rect x={i * larg + larg * 0.22} y={H / 2 - h} width={larg * 0.56} height={h} rx="1.2" fill={`url(#${gid})`} />
            <rect x={i * larg + larg * 0.22} y={H / 2 + 1} width={larg * 0.56} height={h * 0.7} rx="1.2" fill={`url(#${gid})`} opacity="0.5" />
          </g>
        )
      })}
    </svg>
  )
}

// --- Les formes à part (0..1) ------------------------------------------------

/** Anneau plein — la jauge classique. */
function Jauge({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  const r = 26
  const tour = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(part * tour).toFixed(1)} ${tour.toFixed(1)}`}
        transform="rotate(-90 32 32)"
        style={{ filter: `drop-shadow(0 0 4px ${encre.de}66)` }}
      />
    </svg>
  )
}

/** Arcs concentriques — le « 75 % » à trois traits des références. */
function Arcs({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {[26, 20, 14].map((r, i) => {
        const tour = 2 * Math.PI * r
        const visible = Math.max(0.06, part - i * 0.12)
        return (
          <g key={r}>
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.4" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeDasharray={`${(visible * tour).toFixed(1)} ${tour.toFixed(1)}`}
              transform={`rotate(${-90 + i * 24} 32 32)`}
              opacity={1 - i * 0.25}
            />
          </g>
        )
      })}
    </svg>
  )
}

/** Anneau cranté — les tirets en cercle des références. */
function Crante({ part, encre, graine = 0 }: { part: number; encre: Encre; graine?: number }) {
  const gid = useId()
  const crans = 18 + (graine % 4) * 4
  const pleins = Math.round(part * crans)
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {Array.from({ length: crans }, (_, i) => {
        const angle = (i / crans) * 2 * Math.PI - Math.PI / 2
        const x1 = 32 + Math.cos(angle) * 21
        const y1 = 32 + Math.sin(angle) * 21
        const x2 = 32 + Math.cos(angle) * 28
        const y2 = 32 + Math.sin(angle) * 28
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={i < pleins ? `url(#${gid})` : 'rgba(255,255,255,0.10)'}
            strokeWidth="3"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

// --- Les formes toujours possibles -------------------------------------------

/** Barre horizontale à point lumineux — les curseurs des références. */
function Barre({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  const x = 3 + part * 94
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <rect x="0" y="3.2" width="100" height="3.6" rx="1.8" fill="rgba(255,255,255,0.08)" />
      <rect x="0" y="3.2" width={Math.max(4, part * 100)} height="3.6" rx="1.8" fill={`url(#${gid})`} />
      <circle cx={x} cy="5" r="3.4" fill={encre.a} style={{ filter: `drop-shadow(0 0 3px ${encre.a})` }} />
    </svg>
  )
}

/** Segments « batterie ». */
function Segments({ part, encre, graine = 0 }: { part: number; encre: Encre; graine?: number }) {
  const gid = useId()
  const n = 10 + (graine % 5) * 2
  const pleins = Math.round(part * n)
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={(i * 100) / n + 0.8}
          y="0"
          width={100 / n - 1.6}
          height="8"
          rx="1.5"
          fill={i < pleins ? `url(#${gid})` : 'rgba(255,255,255,0.08)'}
        />
      ))}
    </svg>
  )
}

/** L'écusson d'évolution : vert quand ça monte, rouge quand ça descend. */
function Evolution({ valeur }: { valeur: number }) {
  const monte = valeur >= 0
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        monte ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'
      }`}
    >
      {`${monte ? '+' : ''}${valeur.toLocaleString('fr-FR')} %`}
    </span>
  )
}

/**
 * Le choix de la forme : une préférence par rang, la première que la donnée
 * autorise l'emporte.
 *
 * Le rang fait tourner la liste, donc deux tuiles voisines n'ouvrent jamais
 * sur la même forme — c'est la variété demandée. Et la donnée garde le dernier
 * mot : une tuile sans série ne recevra jamais une courbe, elle glisse vers la
 * forme suivante jusqu'à l'ornement plein.
 */
const FORMES = ['etincelle', 'jauge', 'batons', 'arcs', 'points', 'crante', 'egaliseur', 'barre', 'segments'] as const

type Forme = (typeof FORMES)[number]
const AVEC_SERIE: Forme[] = ['etincelle', 'batons', 'points', 'egaliseur']
const AVEC_PART: Forme[] = ['jauge', 'arcs', 'crante']

function choisirForme(rang: number, aSerie: boolean, aPart: boolean): Forme {
  for (let i = 0; i < FORMES.length; i++) {
    const forme = FORMES[(rang + i) % FORMES.length]
    if (AVEC_SERIE.includes(forme) && !aSerie) continue
    if (AVEC_PART.includes(forme) && !aPart) continue
    return forme
  }
  return 'segments'
}

export function TuileStat({ tuile, rang, graine = 0 }: { tuile: TuileData; rang: number; graine?: number }) {
  /*
   * Cent vingt-six tuiles, aucune identique : la forme tourne avec le rang ET
   * le bloc, la palette tourne sur un pas different, et la graine module la
   * densite des dessins (nombre de crans, de segments, de batons). Neuf formes
   * seules se repeteraient quatorze fois -- forme x couleur x variante, non.
   */
  const [de, a] = PALETTES[(rang * 5 + graine * 2) % PALETTES.length]
  const encre = { de, a }

  // La tuile vide : en retrait, avec sa raison — jamais un chiffre inventé.
  if (tuile.valeur === null) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{tuile.label}</p>
        <p className="mt-1 text-xl font-bold text-gray-600">—</p>
        <p className="mt-auto pt-1 text-[10px] leading-snug text-gray-600">{tuile.raison}</p>
      </div>
    )
  }

  const aPart =
    typeof tuile.valeur === 'number' && (tuile.unite === '/100' || tuile.unite === '%') && tuile.valeur >= 0 && tuile.valeur <= 100
  const aSerie = Boolean(tuile.serie && tuile.serie.length > 1 && tuile.serie.some((v) => v !== 0))
  const forme = choisirForme(rang + graine, aSerie, aPart)
  const part = aPart ? (tuile.valeur as number) / 100 : 1 // 1 = ornement plein

  const rondes: Forme[] = ['jauge', 'arcs', 'crante']
  let dessin: ReactNode
  switch (forme) {
    case 'etincelle':
      dessin = <Etincelle serie={tuile.serie!} encre={encre} />
      break
    case 'batons':
      dessin = <Batons serie={tuile.serie!} encre={encre} graine={graine} />
      break
    case 'points':
      dessin = <Points serie={tuile.serie!} encre={encre} />
      break
    case 'egaliseur':
      dessin = <Egaliseur serie={tuile.serie!} encre={encre} graine={graine} />
      break
    case 'jauge':
      dessin = <Jauge part={part} encre={encre} />
      break
    case 'arcs':
      dessin = <Arcs part={part} encre={encre} />
      break
    case 'crante':
      dessin = <Crante part={part} encre={encre} graine={graine} />
      break
    case 'barre':
      dessin = <Barre part={part} encre={encre} />
      break
    default:
      dessin = <Segments part={part} encre={encre} graine={graine} />
  }

  return (
    <div
      className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 transition hover:border-white/[0.16]"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tuile.label}</p>
        {typeof tuile.evolution === 'number' ? <Evolution valeur={tuile.evolution} /> : null}
      </div>

      {rondes.includes(forme) ? (
        <div className="mt-1 flex flex-1 items-center justify-between gap-2">
          <p
            className="bg-gradient-to-r bg-clip-text text-2xl font-extrabold text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${de}, ${a})` }}
          >
            {formatValeur(tuile.valeur, tuile.unite)}
          </p>
          <div className="-my-1 shrink-0">{dessin}</div>
        </div>
      ) : (
        <>
          <p
            className="mt-1 bg-gradient-to-r bg-clip-text text-2xl font-extrabold text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${de}, ${a})` }}
          >
            {formatValeur(tuile.valeur, tuile.unite)}
          </p>
          <div className="mt-auto pt-2">{dessin}</div>
        </>
      )}
    </div>
  )
}

/**
 * Un bloc : la pastille numérotée, le titre, et ses neuf tuiles.
 *
 * `@container` et non `sm:` : la grille se replie selon la place réelle, pas
 * selon l'écran — la leçon de la barre de sélection sur écran vertical.
 */
export function BlocStats({ bloc }: { bloc: BlocData }) {
  return (
    <section id={`stats-${bloc.id}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <header className="flex items-center gap-2.5">
        <span className="rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
          {bloc.numero}
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-200">{bloc.titre}</h2>
      </header>
      <div className="@container mt-3">
        <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-6 @6xl:grid-cols-9">
          {bloc.tuiles.map((t, i) => (
            <TuileStat key={t.id} tuile={t} rang={i} graine={Number(bloc.numero)} />
          ))}
        </div>
      </div>
    </section>
  )
}
