import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { AnneauPastille, Barre, DemiJauge, Jauge, Pastilles, Segments } from './stats/formes'

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

export function BandeauJauges() {
  const [jauges, setJauges] = useState<Jauges | null>(cache?.valeur ?? null)

  useEffect(() => {
    if (cache && Date.now() - cache.horodatage < 60_000) return
    api
      .jauges()
      .then((j) => {
        cache = { valeur: j, horodatage: Date.now() }
        setJauges(j)
      })
      .catch(() => {
        // Session expirée ou API muette : le bandeau s'efface, il ne bloque pas.
      })
  }, [])

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
      dessin: <AnneauPastille part={part(jauges.annonces.fait, jauges.annonces.total, 0.35)} encre={{ de: '#ff5c8a', a: '#fb923c' }} />,
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
      dessin: <Pastilles part={part(jauges.agents.fait, jauges.agents.total, 0.4)} graine={3} />,
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
   * UNE seule ligne, toujours — demandé le 05/09/2026. Six cellules en flex
   * qui se partagent la largeur ; quand l'écran se resserre, les textes
   * disparaissent et il ne reste que les jauges, belles et cliquables, le
   * détail passant dans l'infobulle. Jamais deux lignes.
   */
  const cellule =
    'flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 py-2 backdrop-blur-xl lg:justify-start lg:px-3'

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-5 border-b border-white/[0.06] bg-[#08070f]/80 px-6 py-2.5 backdrop-blur-xl md:-mx-8 md:px-8">
      <div className="flex flex-nowrap gap-2">
        {blocs.map((b) => (
          <Link
            key={b.label}
            to={b.to}
            title={`${b.label} : ${b.valeur} — ${b.action}`}
            className={`${cellule} transition hover:border-white/[0.18]`}
          >
            <span className="w-9 shrink-0 [&_svg]:h-auto [&_svg]:w-full">{b.dessin}</span>
            {/* Le titre reste écrit, en blanc, même compressé (05/09/2026) ;
                seuls la valeur et le geste s'effacent sur écran étroit. */}
            <span className="min-w-0">
              <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-white">{b.label}</span>
              <span className="hidden truncate text-sm font-bold leading-tight lg:block">{b.valeur}</span>
              <span className="hidden truncate text-[10px] text-purple-300 lg:block">{b.action}</span>
            </span>
          </Link>
        ))}

        {/* Le sixième bloc : la jauge d'ensemble, sans porte — c'est un état,
            pas un geste. */}
        <div className={cellule} title={`Utilisation : ${jauges.utilisation} % du potentiel de l'appli`}>
          <span className="w-9 shrink-0 [&_svg]:h-auto [&_svg]:w-full">
            <Jauge part={Math.max(jauges.utilisation > 0 ? 0 : 0.42, jauges.utilisation / 100)} encre={{ de: '#fbbf24', a: '#fb7185' }} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-white">Plateforme</span>
            <span className="hidden text-sm font-bold leading-tight lg:block">{jauges.utilisation} %</span>
            <span className="hidden truncate text-[10px] text-gray-500 lg:block">du potentiel utilisé</span>
          </span>
        </div>
      </div>
    </div>
  )
}
