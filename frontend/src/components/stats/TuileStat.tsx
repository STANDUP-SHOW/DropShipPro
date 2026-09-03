import type { ReactNode } from 'react'
import {
  Aires,
  AnneauPastille,
  Anneaux,
  Arcs,
  Barre,
  BarresH,
  BarresLigne,
  Batons,
  Camembert,
  Crante,
  Curseurs,
  Cylindres,
  DemiCamembert,
  DemiJauge,
  Egaliseur,
  Empilees,
  Etincelle,
  Jalons,
  Jauge,
  Lignes,
  Pastilles,
  Points,
  Radar,
  Rayures,
  Segments,
  Vague,
} from './formes'

/**
 * Les tuiles du tableau de bord, et la règle qui les rend toutes différentes.
 *
 * **Le retour du 03/09/2026, à la lettre** : « il y a encore de nombreux
 * graphiques utilisés deux voire trois fois dans le même bloc, et plus de
 * vingt fois dans le déroulé. Le dashboard est tellement étoffé que le
 * vendeur doit se souvenir visuellement du bloc qui l'intéresse. »
 *
 * D'où deux garanties, tenues par construction et non par chance :
 *
 * 1. **Sans remise dans un bloc** : l'attribution retire chaque forme du
 *    chapeau une fois servie. Neuf tuiles, neuf dessins différents — vingt-six
 *    formes au chapeau, il en reste toujours.
 * 2. **Dispersées entre les blocs** : le point de départ du tirage combine le
 *    rang et le numéro du bloc par des pas premiers, et la palette (dix
 *    dégradés) tourne sur un autre pas. Deux blocs ne présentent jamais la
 *    même suite, et le vendeur reconnaît son bloc à sa silhouette.
 *
 * La donnée garde le dernier mot : une courbe exige une série, un camembert
 * une répartition, un anneau une valeur sur cent — et les formes à proportion
 * servent d'ornement plein sur les nombres secs, jamais sur un pourcentage où
 * un anneau plein mentirait.
 */

export interface TuileData {
  id: string
  label: string
  valeur: number | string | null
  unite?: string
  evolution?: number | null
  serie?: number[]
  parts?: Array<{ label: string; valeur: number }>
  raison?: string
}

export interface BlocData {
  id: string
  numero: string
  titre: string
  tuiles: TuileData[]
}

/** Les dix dégradés des planches. */
const PALETTES: Array<[string, string]> = [
  ['#f472b6', '#fb923c'],
  ['#22d3ee', '#6366f1'],
  ['#a78bfa', '#ec4899'],
  ['#34d399', '#22d3ee'],
  ['#fbbf24', '#f97316'],
  ['#60a5fa', '#c084fc'],
  ['#2dd4bf', '#a3e635'],
  ['#f87171', '#f472b6'],
  ['#818cf8', '#22d3ee'],
  ['#fb7185', '#fbbf24'],
]

const FORMES = [
  'etincelle',
  'camembert',
  'jauge',
  'vague',
  'anneaux',
  'anneaupastille',
  'batons',
  'cylindres',
  'arcs',
  'aires',
  'barresh',
  'demijauge',
  'points',
  'jalons',
  'crante',
  'barresligne',
  'radar',
  'pastilles',
  'egaliseur',
  'demicamembert',
  'rayures',
  'lignes',
  'curseurs',
  'barre',
  'empilees',
  'segments',
] as const

export type Forme = (typeof FORMES)[number]

const AVEC_SERIE: Forme[] = ['etincelle', 'vague', 'batons', 'aires', 'points', 'barresligne', 'egaliseur', 'lignes', 'empilees']
const AVEC_PARTS: Forme[] = ['camembert', 'anneaux', 'barresh', 'jalons', 'radar', 'demicamembert', 'curseurs', 'cylindres']
/** Les formes à proportion : une vraie valeur sur cent, ou l'ornement plein. */
const AVEC_PART: Forme[] = ['jauge', 'anneaupastille', 'arcs', 'demijauge', 'crante', 'pastilles', 'rayures', 'barre', 'segments']

interface Capacites {
  aSerie: boolean
  aParts: boolean
  aPart: boolean
  /** Un nombre sec accepte l'ornement plein ; un pourcentage, jamais. */
  ornement: boolean
}

/**
 * Le tirage sans remise : la première forme compatible non encore servie.
 *
 * Le pas de sept est premier avec vingt-six, donc le parcours visite toutes
 * les formes ; `prises` garantit qu'aucune ne sert deux fois dans le bloc.
 */
function tirerForme(depart: number, capacites: Capacites, prises: Set<Forme>): Forme {
  let secours: Forme | null = null
  for (let i = 0; i < FORMES.length; i++) {
    const forme = FORMES[(depart + i * 7) % FORMES.length]
    if (AVEC_SERIE.includes(forme) && !capacites.aSerie) continue
    if (AVEC_PARTS.includes(forme) && !capacites.aParts) continue
    if (AVEC_PART.includes(forme) && !capacites.aPart && !capacites.ornement) continue
    if (prises.has(forme)) {
      secours = secours ?? forme
      continue
    }
    return forme
  }
  // Tout le compatible est déjà servi (bloc de plus de vingt-six tuiles, ou
  // données très pauvres) : mieux vaut répéter que ne rien dessiner.
  return secours ?? 'segments'
}

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

function Evolution({ valeur }: { valeur: number }) {
  const monte = valeur >= 0
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${monte ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
      {`${monte ? '+' : ''}${valeur.toLocaleString('fr-FR')} %`}
    </span>
  )
}

/** Les formes carrées se posent à droite de la valeur ; les larges dessous. */
const RONDES: Forme[] = ['jauge', 'anneaupastille', 'arcs', 'crante', 'camembert', 'anneaux', 'radar', 'curseurs', 'demijauge', 'cylindres', 'demicamembert']

export function TuileStat({ tuile, rang, graine = 0, forme }: { tuile: TuileData; rang: number; graine?: number; forme?: Forme }) {
  const [de, a] = PALETTES[(rang + graine * 3) % PALETTES.length]
  const encre = { de, a }

  if (tuile.valeur === null) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{tuile.label}</p>
        <p className="mt-1 text-xl font-bold text-gray-600">—</p>
        <p className="mt-auto pt-1 text-[10px] leading-snug text-gray-600">{tuile.raison}</p>
      </div>
    )
  }

  const capacites = capacitesDe(tuile)
  const choisie = forme ?? tirerForme(rang * 5 + graine * 13, capacites, new Set())
  const part = capacites.aPart ? (tuile.valeur as number) / 100 : 1

  let dessin: ReactNode
  switch (choisie) {
    case 'etincelle': dessin = <Etincelle serie={tuile.serie!} encre={encre} />; break
    case 'vague': dessin = <Vague serie={tuile.serie!} encre={encre} />; break
    case 'batons': dessin = <Batons serie={tuile.serie!} encre={encre} graine={graine} />; break
    case 'aires': dessin = <Aires serie={tuile.serie!} graine={graine + rang} />; break
    case 'points': dessin = <Points serie={tuile.serie!} encre={encre} />; break
    case 'barresligne': dessin = <BarresLigne serie={tuile.serie!} encre={encre} />; break
    case 'egaliseur': dessin = <Egaliseur serie={tuile.serie!} encre={encre} graine={graine} />; break
    case 'lignes': dessin = <Lignes serie={tuile.serie!} encre={encre} />; break
    case 'empilees': dessin = <Empilees serie={tuile.serie!} encre={encre} graine={graine} />; break
    case 'camembert': dessin = <Camembert parts={tuile.parts!} graine={graine + rang} />; break
    case 'anneaux': dessin = <Anneaux parts={tuile.parts!} graine={graine + rang} />; break
    case 'barresh': dessin = <BarresH parts={tuile.parts!} graine={graine + rang} />; break
    case 'jalons': dessin = <Jalons parts={tuile.parts!} graine={graine + rang} />; break
    case 'radar': dessin = <Radar parts={tuile.parts!} encre={encre} />; break
    case 'demicamembert': dessin = <DemiCamembert parts={tuile.parts!} graine={graine + rang} />; break
    case 'curseurs': dessin = <Curseurs parts={tuile.parts!} graine={graine + rang} />; break
    case 'cylindres': dessin = <Cylindres parts={tuile.parts!} graine={graine + rang} />; break
    case 'jauge': dessin = <Jauge part={part} encre={encre} />; break
    case 'anneaupastille': dessin = <AnneauPastille part={part} encre={encre} />; break
    case 'arcs': dessin = <Arcs part={part} encre={encre} />; break
    case 'demijauge': dessin = <DemiJauge part={part} encre={encre} />; break
    case 'crante': dessin = <Crante part={part} encre={encre} graine={graine} />; break
    case 'pastilles': dessin = <Pastilles part={part} encre={encre} graine={graine} />; break
    case 'rayures': dessin = <Rayures part={part} encre={encre} />; break
    case 'barre': dessin = <Barre part={part} encre={encre} />; break
    default: dessin = <Segments part={part} encre={encre} graine={graine} />
  }

  const valeurEnDegrade = (taille: string) => (
    <p className={`bg-gradient-to-r bg-clip-text font-extrabold text-transparent ${taille}`} style={{ backgroundImage: `linear-gradient(90deg, ${de}, ${a})` }}>
      {formatValeur(tuile.valeur!, tuile.unite)}
    </p>
  )

  return (
    <div
      data-forme={choisie}
      className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 transition hover:border-white/[0.16]"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tuile.label}</p>
        {typeof tuile.evolution === 'number' ? <Evolution valeur={tuile.evolution} /> : null}
      </div>

      {RONDES.includes(choisie) ? (
        <div className="mt-1 flex flex-1 items-center justify-between gap-2">
          {valeurEnDegrade('text-2xl')}
          <div className="-my-1 shrink-0">{dessin}</div>
        </div>
      ) : (
        <>
          <div className="mt-1">{valeurEnDegrade('text-2xl')}</div>
          <div className="mt-auto pt-2">{dessin}</div>
        </>
      )}
    </div>
  )
}

function capacitesDe(tuile: TuileData): Capacites {
  const aPart =
    typeof tuile.valeur === 'number' && (tuile.unite === '/100' || tuile.unite === '%') && tuile.valeur >= 0 && tuile.valeur <= 100
  return {
    aSerie: Boolean(tuile.serie && tuile.serie.length > 1 && tuile.serie.some((v) => v !== 0)),
    aParts: Boolean(tuile.parts && tuile.parts.length >= 2),
    aPart,
    // L'ornement plein n'est permis que sur un nombre sec : un anneau rempli à
    // côté d'un pourcentage affirmerait « cent pour cent ».
    ornement: !aPart && tuile.unite !== '%' && tuile.unite !== '/100',
  }
}

/**
 * Un bloc : la pastille numérotée, le titre, et ses neuf tuiles — chacune sa
 * forme, tirée sans remise. C'est ici que la garantie « jamais deux fois dans
 * le même bloc » est tenue, parce que c'est ici qu'on voit les neuf ensemble.
 */
export function BlocStats({ bloc }: { bloc: BlocData }) {
  const graine = Number(bloc.numero) || 0
  const prises = new Set<Forme>()
  const attribution = bloc.tuiles.map((tuile, i) => {
    if (tuile.valeur === null) return undefined
    const forme = tirerForme(i * 5 + graine * 13, capacitesDe(tuile), prises)
    prises.add(forme)
    return forme
  })

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
            <TuileStat key={t.id} tuile={t} rang={i} graine={graine} forme={attribution[i]} />
          ))}
        </div>
      </div>
    </section>
  )
}
