import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { Arcs, Barre, Crante, DemiJauge, Jauge, Segments } from './stats/formes'

/**
 * Le bandeau fixe des six jauges — en tête de chaque page (04/09/2026).
 *
 * Six blocs statistiques qui sont aussi des portes : chacun dit « fait sur
 * possible » avec sa propre forme de jauge, nomme le geste, et mène à la page
 * où on le fait. Le sixième n'a pas de porte : c'est l'utilisation de
 * l'application par rapport à son potentiel, la moyenne des cinq autres.
 *
 * Les chiffres viennent du serveur (vrais totaux des catalogues, jamais
 * écrits en dur ici) et sont gardés une minute en mémoire de module : le
 * bandeau vit sur toutes les pages, chaque navigation ne doit pas refaire
 * l'appel.
 */

type Jauges = Awaited<ReturnType<typeof api.jauges>>

let cache: { valeur: Jauges; horodatage: number } | null = null

/**
 * Les six jauges du mode DEMO — mêmes ordres de grandeur que les chiffres du
 * tableau de bord de démonstration, pour qu'une démo en ligne soit cohérente
 * d'un bout à l'autre du site (06/09/2026).
 */
const JAUGES_DEMO: Jauges = {
  annonces: { fait: 384, total: 20000 },
  fournisseurs: { fait: 6, total: 33 },
  marketplaces: { fait: 12, total: 314 },
  agents: { fait: 8, total: 24 },
  sociaux: { fait: 5, total: 8 },
  utilisation: 46,
} as Jauges

export function BandeauJauges() {
  const [charges, setCharges] = useState<Jauges | null>(cache?.valeur ?? null)
  const [demo] = useDemo()

  useEffect(() => {
    if (cache && Date.now() - cache.horodatage < 60_000) return
    api
      .jauges()
      .then((j) => {
        cache = { valeur: j, horodatage: Date.now() }
        setCharges(j)
      })
      .catch(() => {
        // Session expirée ou API muette : le bandeau s'efface, il ne bloque pas.
      })
  }, [])

  const jauges = demo ? JAUGES_DEMO : charges
  if (!jauges) return null

  /*
   * PROVISOIRE (05/09/2026) : tant que le compte est à zéro, la jauge
   * s'amorce entre 30 et 50 % pour montrer le rendu — « sinon cases
   * noires ». Les chiffres écrits restent les vrais ; seul le dessin est
   * amorcé. À retirer quand le rendu sera validé : supprimer `plancher`.
   */
  const part = (fait: number, total: number, plancher = 0) =>
    Math.max(fait > 0 ? 0 : plancher, Math.min(1, total > 0 ? fait / total : 0))
  const nombre = (n: number) => n.toLocaleString('fr-FR')

  const blocs = [
    {
      label: 'Annonces',
      valeur: `${nombre(jauges.annonces.fait)} / ${nombre(jauges.annonces.total)}`,
      action: 'Publiez des annonces',
      to: '/dashboard',
      // Les trois teintes de la planche fournie le 06/09/2026 : orange, cyan, lime.
      dessin: <Crante part={part(jauges.annonces.fait, jauges.annonces.total, 0.35)} graine={1} teintes={['#fb923c', '#38bdf8', '#a3e635']} />,
    },
    {
      label: 'Fournisseurs',
      valeur: `${jauges.fournisseurs.fait} / ${jauges.fournisseurs.total}`,
      action: 'Ajoutez des fournisseurs',
      to: '/fournisseurs',
      dessin: <DemiJauge part={part(jauges.fournisseurs.fait, jauges.fournisseurs.total, 0.5)} encre={{ de: '#a3e635', a: '#2dd4bf' }} graine={1} />,
    },
    {
      label: 'Market places',
      valeur: `${jauges.marketplaces.fait} / ${jauges.marketplaces.total}`,
      action: 'Ajoutez des market places',
      to: '/plateformes-vente',
      dessin: <Segments part={part(jauges.marketplaces.fait, jauges.marketplaces.total, 0.3)} encre={{ de: '#22d3ee', a: '#818cf8' }} graine={2} />,
    },
    {
      label: 'Agents IA',
      valeur: `${jauges.agents.fait} / ${jauges.agents.total}`,
      action: 'Ajoutez des chefs de rayon',
      to: '/rayons',
      dessin: <Arcs part={part(jauges.agents.fait, jauges.agents.total, 0.4)} graine={2} />,
    },
    {
      label: 'Réseaux sociaux',
      valeur: `${jauges.sociaux.fait} / ${jauges.sociaux.total}`,
      action: 'Ajoutez vos réseaux',
      to: '/marketing',
      dessin: <Barre part={part(jauges.sociaux.fait, jauges.sociaux.total, 0.45)} encre={{ de: '#e879f9', a: '#f472b6' }} />,
    },
  ]

  /*
   * UNE seule ligne, toujours — demandé le 05/09/2026, et c'est toujours le
   * cas. Au-dessus de `lg`, six cellules en flex se partagent la largeur.
   *
   * **Sur téléphone, la règle se retournait contre elle-même.** Six cellules
   * `flex-1` dans 343 px tombaient à 60 px chacune : le titre, écrit en 8 px,
   * sortait tronqué en « FOURNISSEU » et « RÉSEA SOCIA », la valeur et le
   * geste étaient masqués, et la sixième jauge finissait hors de l'écran sans
   * que rien n'indique qu'elle existait. Le détail était censé passer dans
   * l'infobulle — qui ne s'ouvre pas au doigt. Il ne restait donc rien de
   * lisible, et c'est exactement ce qui était reproché à l'application sur
   * téléphone.
   *
   * La ligne reste unique : elle défile latéralement, par crans, avec des
   * cellules assez larges pour porter le titre entier et la valeur écrite.
   * Deux cellules et demie tiennent à l'écran — la troisième coupée est ce
   * qui dit qu'il y en a d'autres derrière. Aucune hauteur n'est prise en
   * plus : sur un écran de téléphone, les bandeaux partagés mangent déjà la
   * moitié de la page avant son titre.
   */
  const cellule =
    'flex w-[10.25rem] shrink-0 snap-start items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 py-2 backdrop-blur-xl lg:w-auto lg:min-w-[68px] lg:flex-1 lg:justify-start lg:gap-2.5 lg:px-3'

  return (
    // `top-14` sur téléphone : la barre du menu est collée au-dessus, et deux
    // éléments collés à `top-0` se recouvrent. Au-dessus de `md` cette barre
    // n'existe pas, donc les jauges reprennent le haut de l'écran.
    <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-white/[0.06] bg-[#08070f]/80 px-4 py-2.5 backdrop-blur-xl md:top-0 md:-mx-8 md:px-8">
      <div className="flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto pb-1">
        {blocs.map((b) => (
          <Link
            key={b.label}
            to={b.to}
            title={`${b.label} : ${b.valeur} — ${b.action}`}
            className={`${cellule} transition hover:border-white/[0.18]`}
          >
            <span className="w-7 shrink-0 lg:w-9 [&_svg]:h-auto [&_svg]:w-full">{b.dessin}</span>
            {/* Le titre reste écrit, en blanc (05/09/2026). La valeur le suit
                désormais dès le téléphone : « 12 / 30 » est le renseignement,
                le dessin n'en donne que l'allure. Seul le geste attend `lg`. */}
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[10px] font-bold uppercase leading-tight text-white lg:text-[9px] lg:tracking-wider">{b.label}</span>
              <span className="block truncate text-xs font-bold leading-tight lg:text-sm">{b.valeur}</span>
              <span className="hidden truncate text-[10px] text-purple-300 lg:block">{b.action}</span>
            </span>
          </Link>
        ))}

        {/* Le sixième bloc : la jauge d'ensemble, sans porte — c'est un état,
            pas un geste. */}
        <div className={cellule} title={`Utilisation : ${jauges.utilisation} % du potentiel de l'appli`}>
          <span className="w-7 shrink-0 lg:w-9 [&_svg]:h-auto [&_svg]:w-full">
            <Jauge part={Math.max(jauges.utilisation > 0 ? 0 : 0.42, jauges.utilisation / 100)} encre={{ de: '#fbbf24', a: '#fb7185' }} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[10px] font-bold uppercase leading-tight text-white lg:text-[9px] lg:tracking-wider">Plateforme</span>
            <span className="block truncate text-xs font-bold leading-tight lg:text-sm">{jauges.utilisation} %</span>
            <span className="hidden truncate text-[10px] text-gray-500 lg:block">du potentiel utilisé</span>
          </span>
        </div>
      </div>
    </div>
  )
}
