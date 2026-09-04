import type { ReactNode } from 'react'
import {
  Boxes,
  Calculator,
  FolderTree,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Package,
  Settings,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  Wrench,
} from 'lucide-react'
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
  Ecarts,
  Egaliseur,
  Empilees,
  Etincelle,
  Jalons,
  Jauge,
  Lignes,
  MatricePoints,
  Onde,
  Pastilles,
  Points,
  Radar,
  RangeesPilules,
  Rayures,
  Secteurs,
  Segments,
  TroisLignes,
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
 *    chapeau une fois servie. Neuf tuiles, neuf dessins différents —
 *    trente-deux formes au chapeau, il en reste toujours.
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
  /**
   * La forme epinglee pour cette tuile, quand quelqu un l a choisie a la main
   * -- le scenario de demonstration le fait pour marier chaque donnee a son
   * dessin. Le tirage la respecte et la sort du chapeau en premier.
   */
  forme?: Forme
  raison?: string
}

export interface BlocData {
  id: string
  numero: string
  titre: string
  tuiles: TuileData[]
}

/** Les dix dégradés néon des planches — saturés, jamais ternes. */
const PALETTES: Array<[string, string]> = [
  ['#ff5c8a', '#fb923c'],
  ['#22d3ee', '#818cf8'],
  ['#e879f9', '#f472b6'],
  ['#a3e635', '#22d3ee'],
  ['#fbbf24', '#fb923c'],
  ['#60a5fa', '#e879f9'],
  ['#2dd4bf', '#a3e635'],
  ['#fb7185', '#fbbf24'],
  ['#a78bfa', '#22d3ee'],
  ['#f472b6', '#a78bfa'],
]

const FORMES = [
  'etincelle',
  'camembert',
  'jauge',
  'vague',
  'rangeespilules',
  'anneaux',
  'anneaupastille',
  'batons',
  'troislignes',
  'cylindres',
  'arcs',
  'aires',
  'barresh',
  'demijauge',
  'points',
  'secteurs',
  'jalons',
  'crante',
  'barresligne',
  'ecarts',
  'radar',
  'pastilles',
  'egaliseur',
  'matricepoints',
  'demicamembert',
  'rayures',
  'lignes',
  'onde',
  'curseurs',
  'barre',
  'empilees',
  'segments',
] as const

export type Forme = (typeof FORMES)[number]

const AVEC_SERIE: Forme[] = ['etincelle', 'vague', 'batons', 'aires', 'points', 'barresligne', 'egaliseur', 'lignes', 'empilees', 'ecarts', 'onde', 'troislignes']
const AVEC_PARTS: Forme[] = ['camembert', 'anneaux', 'barresh', 'jalons', 'radar', 'demicamembert', 'curseurs', 'cylindres', 'secteurs', 'rangeespilules', 'matricepoints']
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
 * Le pas de sept est premier avec trente-deux, donc le parcours visite toutes
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
const RONDES: Forme[] = ['jauge', 'anneaupastille', 'arcs', 'crante', 'camembert', 'anneaux', 'radar', 'curseurs', 'demijauge', 'cylindres', 'demicamembert', 'secteurs']

export function TuileStat({ tuile, rang, graine = 0, forme }: { tuile: TuileData; rang: number; graine?: number; forme?: Forme }) {
  const [de, a] = PALETTES[(rang + graine * 3) % PALETTES.length]
  const encre = { de, a }

  if (tuile.valeur === null) {
    return (
      <div className="flex h-full flex-col rounded-xl p-3">
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
    case 'batons': dessin = <Batons serie={tuile.serie!} graine={graine + rang} />; break
    case 'aires': dessin = <Aires serie={tuile.serie!} graine={graine + rang} />; break
    case 'points': dessin = <Points serie={tuile.serie!} graine={graine + rang} />; break
    case 'barresligne': dessin = <BarresLigne serie={tuile.serie!} encre={encre} graine={graine + rang} />; break
    case 'egaliseur': dessin = <Egaliseur serie={tuile.serie!} graine={graine + rang} />; break
    case 'lignes': dessin = <Lignes serie={tuile.serie!} encre={encre} />; break
    case 'empilees': dessin = <Empilees serie={tuile.serie!} graine={graine + rang} />; break
    case 'ecarts': dessin = <Ecarts serie={tuile.serie!} graine={graine + rang} />; break
    case 'onde': dessin = <Onde serie={tuile.serie!} graine={graine + rang} />; break
    case 'troislignes': dessin = <TroisLignes serie={tuile.serie!} graine={graine + rang} />; break
    case 'camembert': dessin = <Camembert parts={tuile.parts!} graine={graine + rang} />; break
    case 'secteurs': dessin = <Secteurs parts={tuile.parts!} graine={graine + rang} />; break
    case 'anneaux': dessin = <Anneaux parts={tuile.parts!} graine={graine + rang} />; break
    case 'barresh': dessin = <BarresH parts={tuile.parts!} graine={graine + rang} />; break
    case 'rangeespilules': dessin = <RangeesPilules parts={tuile.parts!} graine={graine + rang} />; break
    case 'matricepoints': dessin = <MatricePoints parts={tuile.parts!} graine={graine + rang} />; break
    case 'jalons': dessin = <Jalons parts={tuile.parts!} graine={graine + rang} />; break
    case 'radar': dessin = <Radar parts={tuile.parts!} encre={encre} />; break
    case 'demicamembert': dessin = <DemiCamembert parts={tuile.parts!} graine={graine + rang} />; break
    case 'curseurs': dessin = <Curseurs parts={tuile.parts!} graine={graine + rang} />; break
    case 'cylindres': dessin = <Cylindres parts={tuile.parts!} graine={graine + rang} />; break
    case 'jauge': dessin = <Jauge part={part} encre={encre} />; break
    case 'anneaupastille': dessin = <AnneauPastille part={part} encre={encre} />; break
    case 'arcs': dessin = <Arcs part={part} graine={graine + rang} />; break
    case 'demijauge': dessin = <DemiJauge part={part} encre={encre} graine={graine + rang} />; break
    case 'crante': dessin = <Crante part={part} graine={graine + rang} />; break
    case 'pastilles': dessin = <Pastilles part={part} graine={graine + rang} />; break
    case 'rayures': dessin = <Rayures part={part} encre={encre} />; break
    case 'barre': dessin = <Barre part={part} encre={encre} />; break
    default: dessin = <Segments part={part} encre={encre} graine={graine} />
  }

  const valeurEnDegrade = (taille: string) => (
    <p className={`break-words bg-gradient-to-r bg-clip-text font-extrabold leading-tight text-transparent ${taille}`} style={{ backgroundImage: `linear-gradient(90deg, ${de}, ${a})` }}>
      {formatValeur(tuile.valeur!, tuile.unite)}
    </p>
  )

  return (
    // Sans cadre au repos — seule la section porte un bloc. Le liseré néon ne
    // s'allume qu'au survol (demandé le 04/09/2026), dans la couleur de la
    // tuile ; la bordure transparente évite tout déplacement au premier hover.
    <div
      data-forme={choisie}
      className="@container flex h-full flex-col overflow-hidden rounded-xl border border-transparent p-3 transition hover:bg-white/[0.02]"
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${de}66`; e.currentTarget.style.boxShadow = `0 0 16px ${de}26` }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tuile.label}</p>
        {typeof tuile.evolution === 'number' ? <Evolution valeur={tuile.evolution} /> : null}
      </div>

      {RONDES.includes(choisie) ? (
        <div className="mt-1 flex flex-1 items-center justify-between gap-2">
          <div className="min-w-0">{valeurEnDegrade('@[13rem]:text-2xl text-lg')}</div>
          {/* Le dessin retrecit avec la tuile : sorti de son cadre, il ecrasait
              la tuile voisine -- signale le 03/09/2026. */}
          <div className="-my-1 w-12 shrink-0 @[13rem]:w-16 [&_svg]:h-auto [&_svg]:w-full">{dessin}</div>
        </div>
      ) : (
        <>
          <div className="mt-1 min-w-0">{valeurEnDegrade('@[13rem]:text-2xl text-lg')}</div>
          <div className="mt-auto w-full pt-2">{dessin}</div>
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
export function BlocStats({ bloc, enTete }: { bloc: BlocData; enTete?: ReactNode }) {
  const graine = Number(bloc.numero) || 0
  // Les formes epinglees sortent du chapeau avant le tirage : elles priment.
  const prises = new Set<Forme>(bloc.tuiles.map((t) => t.forme).filter((f): f is Forme => Boolean(f)))
  /*
   * L empreinte de la tuile entre dans le depart du tirage : sans elle, les
   * memes rangs tiraient les memes regions du chapeau et six formes ne
   * sortaient jamais -- mesure en production, 20 servies sur 26, la plus
   * frequente sept fois. L identifiant disperse sur tout le chapeau.
   */
  const empreinte = (texte: string) => {
    let h = 0
    for (let j = 0; j < texte.length; j++) h = (h * 31 + texte.charCodeAt(j)) | 0
    return Math.abs(h)
  }
  const attribution = bloc.tuiles.map((tuile, i) => {
    if (tuile.valeur === null) return undefined
    if (tuile.forme) return tuile.forme
    const forme = tirerForme(i * 5 + graine * 13 + empreinte(tuile.id), capacitesDe(tuile), prises)
    prises.add(forme)
    return forme
  })

  /*
   * La presentation de la maquette : chaque section a SA couleur d accent --
   * pastille numerotee pleine, titre teinte, filet discret sous l en-tete.
   * Quatorze pastilles violettes identiques ne s epelaient pas ; le vendeur
   * doit reconnaitre sa section a sa couleur autant qu a sa silhouette.
   */
  const ACCENTS = ['#fb923c', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#22d3ee', '#fb7185', '#a3e635', '#60a5fa', '#ec4899', '#2dd4bf', '#c084fc', '#f87171', '#818cf8']
  const accent = ACCENTS[(graine - 1 + ACCENTS.length) % ACCENTS.length]

  /*
   * L'icône du sujet, à la place du numéro — demandé le 05/09/2026 : un
   * chiffre dans une pastille ne disait rien, l'icône dit le bloc d'un
   * coup d'œil, dans le même petit bloc coloré.
   */
  const ICONES: Record<string, React.ElementType> = {
    'vue-generale': LayoutDashboard,
    acquisition: Link2,
    fournisseurs: Boxes,
    catalogue: Package,
    rayons: FolderTree,
    marketplaces: Store,
    marche: TrendingUp,
    ventes: ShoppingBag,
    livraisons: Truck,
    'sav-clients': LifeBuoy,
    messagerie: Inbox,
    'sav-fournisseurs': Wrench,
    finances: Calculator,
    plateforme: Settings,
  }
  const Icone = ICONES[bloc.id] ?? LayoutDashboard

  return (
    // Le verre dépoli des références glassmorphism : fond presque transparent,
    // flou d'arrière-plan épais, arête haute éclairée — les formes du fond
    // vivant se devinent au travers.
    <section
      id={`stats-${bloc.id}`}
      className="rounded-2xl border border-white/[0.12] bg-white/[0.05] p-4 backdrop-blur-2xl"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 40px rgba(0,0,0,0.35)' }}
    >
      <header className="flex items-center gap-2.5 border-b pb-2" style={{ borderColor: `${accent}33` }}>
        <span className="grid h-6 w-6 place-items-center rounded-md text-black/80" style={{ backgroundColor: accent }}>
          <Icone size={14} />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>{bloc.titre}</h2>
        {/* Les commandes de la page (périodes, démo) se posent ici, justifiées
            à droite du titre — demandé le 05/09/2026 pour la Vue générale. */}
        {enTete ? <div className="ml-auto">{enTete}</div> : null}
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
