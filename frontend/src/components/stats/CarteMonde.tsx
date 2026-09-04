import { useEffect, useMemo, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { CENTRES_ISO, MONDE_D } from './monde-trace'

/**
 * La grande carte du monde du tableau de bord.
 *
 * **Deuxième version, sur retour du 03/09/2026** : « je voudrais une carte du
 * monde réelle, pas en pointillés ; montrer des clients sur toute la planète
 * et fournisseurs également ; et pour livraisons, de grandes flèches qui
 * partent de France vers les pays du monde. »
 *
 * Le tracé vient de Natural Earth (domaine public) : les vrais contours de
 * 178 pays, projetés une fois pour toutes par `genere-monde.cjs`, avec le
 * centre de chacun. Tous les pays de la planète sont donc plaçables — un
 * client au Japon s'allume au Japon, pas dans une liste de six pays écrite à
 * la main.
 *
 * Trois langages selon la vue, parce que les données ne disent pas la même
 * chose : ventes, clients et fournisseurs sont des **présences** — des halos
 * posés sur les pays ; les livraisons sont des **trajets** — de grandes
 * flèches courbes qui partent de la France, épaisses comme leur volume.
 */

export interface PointCarte {
  pays: string
  n: number
}

export type CarteData = Record<'ventes' | 'clients' | 'fournisseurs' | 'livraisons', PointCarte[]>

/**
 * Du nom français au code ISO3 du tracé.
 *
 * Les données portent des noms en français (« France » est la valeur par
 * défaut du formulaire de commande). La table couvre large et tolère les
 * graphies sans accent ; un pays absent reste compté dans la liste de droite,
 * avec la mention « non placé ».
 */
const ISO: Record<string, string> = {
  france: 'FRA', belgique: 'BEL', allemagne: 'DEU', espagne: 'ESP', italie: 'ITA',
  suisse: 'CHE', 'pays-bas': 'NLD', 'pays bas': 'NLD', portugal: 'PRT',
  'royaume-uni': 'GBR', 'royaume uni': 'GBR', angleterre: 'GBR', pologne: 'POL',
  autriche: 'AUT', luxembourg: 'LUX', irlande: 'IRL', suède: 'SWE', suede: 'SWE',
  norvège: 'NOR', norvege: 'NOR', danemark: 'DNK', finlande: 'FIN', grèce: 'GRC',
  grece: 'GRC', roumanie: 'ROU', tchéquie: 'CZE', tchequie: 'CZE', hongrie: 'HUN',
  croatie: 'HRV', bulgarie: 'BGR', slovaquie: 'SVK', slovénie: 'SVN', slovenie: 'SVN',
  chine: 'CHN', 'états-unis': 'USA', 'etats-unis': 'USA', usa: 'USA', canada: 'CAN',
  brésil: 'BRA', bresil: 'BRA', mexique: 'MEX', japon: 'JPN', inde: 'IND',
  australie: 'AUS', 'nouvelle-zélande': 'NZL', 'nouvelle-zelande': 'NZL',
  maroc: 'MAR', algérie: 'DZA', algerie: 'DZA', tunisie: 'TUN', sénégal: 'SEN',
  senegal: 'SEN', "côte d'ivoire": 'CIV', "cote d'ivoire": 'CIV', cameroun: 'CMR',
  turquie: 'TUR', vietnam: 'VNM', 'viêt nam': 'VNM', thaïlande: 'THA', thailande: 'THA',
  'corée du sud': 'KOR', 'coree du sud': 'KOR', russie: 'RUS', ukraine: 'UKR',
  'émirats arabes unis': 'ARE', 'emirats arabes unis': 'ARE', 'arabie saoudite': 'SAU',
  égypte: 'EGY', egypte: 'EGY', 'afrique du sud': 'ZAF', argentine: 'ARG', chili: 'CHL',
  colombie: 'COL', pérou: 'PER', perou: 'PER', indonésie: 'IDN', indonesie: 'IDN',
  malaisie: 'MYS', philippines: 'PHL', israël: 'ISR', israel: 'ISR',
}

function centreDe(pays: string): [number, number] | undefined {
  const propre = pays.toLowerCase().trim()
  const iso = ISO[propre] ?? (propre.length === 3 ? propre.toUpperCase() : undefined)
  return iso ? CENTRES_ISO[iso] : undefined
}

/*
 * Trois vues — retour du 05/09/2026 : « ventes » sortait la même statistique
 * que « clients », elle est retirée. Tout est en flèches désormais, chacune
 * sa couleur : clients en bleu (le monde achète, les flèches arrivent en
 * France), fournisseurs en jaune (les sources convergent vers la France),
 * livraisons en orange (elles partent de France vers le monde).
 */
const VUES = [
  { id: 'clients', label: 'Clients', sens: 'vers-france' },
  { id: 'fournisseurs', label: 'Fournisseurs', sens: 'vers-france' },
  { id: 'livraisons', label: 'Livraisons', sens: 'depuis-france' },
] as const

const COULEURS: Record<(typeof VUES)[number]['id'], [string, string]> = {
  clients: ['#3b82f6', '#60a5fa'],
  fournisseurs: ['#eab308', '#fbbf24'],
  livraisons: ['#f97316', '#fb923c'],
}

/**
 * Une grande flèche courbe de la France vers un pays.
 *
 * Quadratique, bombée vers le haut : la corde d'un vol long-courrier, pas un
 * trait d'arpenteur. La pointe est calculée sur la tangente d'arrivée pour
 * regarder dans le sens du voyage, et l'épaisseur suit le volume.
 */
function Fleche({ de, vers, poids, couleur }: { de: [number, number]; vers: [number, number]; poids: number; couleur: string }) {
  const [x1, y1] = de
  const [x2, y2] = vers
  const dist = Math.hypot(x2 - x1, y2 - y1)
  const cx = (x1 + x2) / 2
  const cy = Math.min(y1, y2) - Math.max(4, dist * 0.22)

  // La tangente au point d'arrivée d'une quadratique : P2 - C.
  const angle = Math.atan2(y2 - cy, x2 - cx)
  const t = 2.4 + poids
  const pointe = [
    [x2, y2],
    [x2 - t * Math.cos(angle - 0.42), y2 - t * Math.sin(angle - 0.42)],
    [x2 - t * Math.cos(angle + 0.42), y2 - t * Math.sin(angle + 0.42)],
  ]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

  return (
    <g>
      <path
        d={`M${x1} ${y1} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}`}
        fill="none"
        stroke={couleur}
        strokeWidth={0.7 + poids * 0.9}
        strokeLinecap="round"
        opacity="0.85"
        style={{ filter: `drop-shadow(0 0 1.5px ${couleur})` }}
      />
      <polygon points={pointe} fill={couleur} />
    </g>
  )
}

export function CarteMonde({ carte }: { carte: CarteData }) {
  /*
   * La carte est animée : elle bascule toute seule toutes les deux secondes
   * entre clients, fournisseurs et livraisons (05/09/2026). Un clic sur une
   * pastille saute à sa vue ; la ronde reprend de là.
   */
  const [indexVue, setIndexVue] = useState(0)
  useEffect(() => {
    const ronde = setInterval(() => setIndexVue((i) => (i + 1) % VUES.length), 2000)
    return () => clearInterval(ronde)
  }, [])
  const vue = VUES[indexVue].id
  const sens = VUES[indexVue].sens
  const points = carte[vue] ?? []
  const [de, a] = COULEURS[vue]
  const max = Math.max(...points.map((p) => p.n), 1)

  const situes = useMemo(
    () =>
      points
        .map((p) => ({ ...p, centre: centreDe(p.pays) }))
        .filter((p): p is PointCarte & { centre: [number, number] } => Boolean(p.centre)),
    [points],
  )
  const nonSitues = points.filter((p) => !centreDe(p.pays))
  const france = CENTRES_ISO.FRA

  return (
    <section
      className="rounded-2xl border border-white/[0.12] bg-white/[0.05] p-4 backdrop-blur-2xl"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 40px rgba(0,0,0,0.35)' }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
            <Globe2 size={12} className="inline -mt-0.5" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-200">Carte du monde</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VUES.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setIndexVue(i)}
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
        <div className="grid gap-3 @3xl:grid-cols-[1fr_230px]">
          {/* 8..150 : l'essentiel des terres habitées, sans les mers australes. */}
          <svg viewBox="0 8 360 142" className="w-full" aria-hidden>
            <path d={MONDE_D} fill="rgba(148, 121, 255, 0.10)" stroke="rgba(255,255,255,0.16)" strokeWidth="0.28" strokeLinejoin="round" />

            {/* La France, cœur du trafic, allumée en permanence. */}
            <circle cx={france[0]} cy={france[1]} r="2.6" fill={`${de}44`} />
            <circle cx={france[0]} cy={france[1]} r="1.2" fill={a} style={{ filter: `drop-shadow(0 0 2px ${de})` }} />

            {/* Tout est trajet : les clients et les fournisseurs convergent
                vers la France, les livraisons en partent — chacun sa couleur. */}
            {situes
              .filter((p) => p.pays.toLowerCase().trim() !== 'france')
              .map((p) => (
                <Fleche
                  key={`${vue}-${p.pays}`}
                  de={sens === 'depuis-france' ? france : p.centre}
                  vers={sens === 'depuis-france' ? p.centre : france}
                  poids={(p.n / max) * 1.6}
                  couleur={a}
                />
              ))}
          </svg>

          <div>
            {points.length === 0 ? (
              <p className="text-xs leading-relaxed text-gray-500">
                Rien à situer sur la période : cette vue s'allumera avec vos premières{' '}
                {vue === 'fournisseurs' ? 'sources' : vue}.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {points.slice(0, 8).map((p, i) => (
                  <li key={p.pays} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${de}, ${a})`, opacity: 1 - i * 0.1 }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-300">{p.pays}</span>
                    <span className="text-xs font-bold text-gray-200">{p.n.toLocaleString('fr-FR')}</span>
                    <span className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
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
