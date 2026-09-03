import { useMemo, useState } from 'react'
import { Globe2 } from 'lucide-react'

/**
 * La grande carte du monde du tableau de bord.
 *
 * **Demandée avec les références** : « on peut mettre une grande carte du
 * monde et on affiche au choix nos ventes, nos clients, nos fournisseurs, nos
 * livraisons. » Quatre vues, un commutateur, une seule carte.
 *
 * La carte est un semis de points, comme sur les maquettes néon : un masque de
 * terre de 64 × 28 cases suffit à dessiner des continents reconnaissables, et
 * pèse moins d'un kilo-octet là où un vrai fond de carte en pèserait deux
 * cents. C'est une géographie de tableau de bord — elle situe, elle ne
 * navigue pas.
 *
 * Les pays s'allument par un halo dimensionné au compte ; la liste de droite
 * donne les chiffres exacts, parce qu'un halo se compare mal à un autre halo.
 */

export interface PointCarte {
  pays: string
  n: number
}

export type CarteData = Record<'ventes' | 'clients' | 'fournisseurs' | 'livraisons', PointCarte[]>

/*
 * Le masque de terre : « # » = continent. Grossier à dessein — à cette taille,
 * l'œil reconnaît les silhouettes, pas les côtes.
 */
const TERRE = [
  '................................................................',
  '......####..............................########################',
  '...########..........##.............############################',
  '..###########.......####..........##############################',
  '..############.......##.........###############################.',
  '...###########................#################################.',
  '....#########.......###.....######################.############.',
  '.....########......#####.#########################..#########...',
  '......#######.....################################...#######....',
  '.......#####......###############################.....#####.....',
  '........####.......#############################........###.....',
  '.........###........###########.###############.........##......',
  '..........##.........#########...#############...####...........',
  '...........#..........########....###########....######.........',
  '.......................#######.....#########......#####..#......',
  '.........###...........######.......#######.......###...........',
  '........######..........#####........#####......................',
  '.......########..........####.........###............####.......',
  '......##########..........###..........#............#######.....',
  '......#########............##........................########...',
  '.......########............##.........................#######...',
  '........######..............#..........................####.##..',
  '........#####...........................................##......',
  '.........###...................................................',
  '..........##....................................................',
  '................................................................',
]

/** Les centres approchés des pays que les données citent, en cases du masque. */
const CENTRES: Record<string, [number, number]> = {
  france: [31.5, 6.5],
  allemagne: [33.5, 5.5],
  espagne: [30.5, 8],
  italie: [33.5, 7.5],
  belgique: [31.8, 5.5],
  suisse: [32.5, 6.5],
  'pays-bas': [32, 5],
  portugal: [29.8, 8],
  'royaume-uni': [30.5, 5],
  pologne: [35, 5],
  autriche: [34, 6],
  chine: [50, 8],
  'états-unis': [12, 7.5],
  'etats-unis': [12, 7.5],
  canada: [12, 4.5],
  brésil: [20, 15],
  bresil: [20, 15],
  japon: [57, 7.5],
  inde: [45, 10],
  australie: [55, 18],
  maroc: [30, 9.5],
  algérie: [32, 10],
  algerie: [32, 10],
  tunisie: [33, 9],
}

const VUES = [
  { id: 'ventes', label: 'Ventes' },
  { id: 'clients', label: 'Clients' },
  { id: 'fournisseurs', label: 'Fournisseurs' },
  { id: 'livraisons', label: 'Livraisons' },
] as const

const COULEURS: Record<(typeof VUES)[number]['id'], [string, string]> = {
  ventes: ['#f472b6', '#fb923c'],
  clients: ['#22d3ee', '#6366f1'],
  fournisseurs: ['#34d399', '#22d3ee'],
  livraisons: ['#a78bfa', '#ec4899'],
}

export function CarteMonde({ carte }: { carte: CarteData }) {
  const [vue, setVue] = useState<(typeof VUES)[number]['id']>('ventes')
  const points = carte[vue] ?? []
  const [de, a] = COULEURS[vue]
  const max = Math.max(...points.map((p) => p.n), 1)

  const cases = useMemo(() => {
    const out: Array<[number, number]> = []
    TERRE.forEach((ligne, y) => {
      for (let x = 0; x < ligne.length; x++) if (ligne[x] === '#') out.push([x, y])
    })
    return out
  }, [])

  const situes = points
    .map((p) => ({ ...p, centre: CENTRES[p.pays.toLowerCase().trim()] }))
    .filter((p): p is PointCarte & { centre: [number, number] } => Boolean(p.centre))
  const nonSitues = points.filter((p) => !CENTRES[p.pays.toLowerCase().trim()])

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
            <Globe2 size={12} className="inline -mt-0.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-200">Carte du monde</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VUES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVue(v.id)}
              className={
                vue === v.id
                  ? 'rounded-full px-3 py-1 text-[11px] font-semibold text-white'
                  : 'rounded-full border border-white/10 px-3 py-1 text-[11px] text-gray-400 hover:bg-white/5'
              }
              style={vue === v.id ? { backgroundImage: `linear-gradient(90deg, ${COULEURS[v.id][0]}66, ${COULEURS[v.id][1]}66)` } : undefined}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      <div className="@container mt-3">
        <div className="grid gap-3 @3xl:grid-cols-[1fr_220px]">
          <svg viewBox="0 0 128 52" className="w-full" aria-hidden>
            {/* Le semis de terre. */}
            {cases.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x * 2 + 1} cy={y * 2 + 1} r="0.55" fill="rgba(255,255,255,0.13)" />
            ))}
            {/* Les pays allumés, halo puis cœur. */}
            {situes.map((p) => {
              const ray = 1.6 + (p.n / max) * 4.5
              const [cx, cy] = [p.centre[0] * 2 + 1, p.centre[1] * 2 + 1]
              return (
                <g key={p.pays}>
                  <circle cx={cx} cy={cy} r={ray} fill={`${de}2e`} />
                  <circle cx={cx} cy={cy} r={ray * 0.45} fill={a} style={{ filter: `drop-shadow(0 0 3px ${de})` }} />
                </g>
              )
            })}
          </svg>

          <div>
            {points.length === 0 ? (
              <p className="text-xs leading-relaxed text-gray-500">
                Rien à situer sur la période : cette vue s'allumera avec vos premières{' '}
                {vue === 'fournisseurs' ? 'sources' : vue}.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {points.slice(0, 6).map((p, i) => (
                  <li key={p.pays} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${de}, ${a})`, opacity: 1 - i * 0.12 }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-300">{p.pays}</span>
                    <span className="text-xs font-bold text-gray-200">{p.n.toLocaleString('fr-FR')}</span>
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(p.n / max) * 100}%`, background: `linear-gradient(90deg, ${de}, ${a})` }}
                      />
                    </span>
                  </li>
                ))}
                {nonSitues.length ? (
                  <li className="pt-1 text-[10px] text-gray-600">
                    {`${nonSitues.length} pays non placé(s) sur la carte — compté(s) dans la liste.`}
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
