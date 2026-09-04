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

  const part = (fait: number, total: number) => Math.min(1, total > 0 ? fait / total : 0)
  const nombre = (n: number) => n.toLocaleString('fr-FR')

  const blocs = [
    {
      label: 'Annonces',
      valeur: `${nombre(jauges.annonces.fait)} / ${nombre(jauges.annonces.total)}`,
      action: 'Publiez des annonces',
      to: '/dashboard',
      dessin: <AnneauPastille part={part(jauges.annonces.fait, jauges.annonces.total)} encre={{ de: '#ff5c8a', a: '#fb923c' }} />,
    },
    {
      label: 'Fournisseurs',
      valeur: `${jauges.fournisseurs.fait} / ${jauges.fournisseurs.total}`,
      action: 'Ajoutez des fournisseurs',
      to: '/fournisseurs',
      dessin: <DemiJauge part={part(jauges.fournisseurs.fait, jauges.fournisseurs.total)} encre={{ de: '#a3e635', a: '#2dd4bf' }} graine={1} />,
    },
    {
      label: 'Market places',
      valeur: `${jauges.marketplaces.fait} / ${jauges.marketplaces.total}`,
      action: 'Ajoutez des market places',
      to: '/plateformes-vente',
      dessin: <Segments part={part(jauges.marketplaces.fait, jauges.marketplaces.total)} encre={{ de: '#22d3ee', a: '#818cf8' }} graine={2} />,
    },
    {
      label: 'Agents IA',
      valeur: `${jauges.agents.fait} / ${jauges.agents.total}`,
      action: 'Ajoutez des chefs de rayon',
      to: '/rayons',
      dessin: <Pastilles part={part(jauges.agents.fait, jauges.agents.total)} graine={3} />,
    },
    {
      label: 'Réseaux sociaux',
      valeur: `${jauges.sociaux.fait} / ${jauges.sociaux.total}`,
      action: 'Ajoutez vos réseaux',
      to: '/marketing',
      dessin: <Barre part={part(jauges.sociaux.fait, jauges.sociaux.total)} encre={{ de: '#e879f9', a: '#f472b6' }} />,
    },
  ]

  const cellule =
    'flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl'

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-5 border-b border-white/[0.06] bg-[#08070f]/80 px-6 py-2.5 backdrop-blur-xl md:-mx-8 md:px-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {blocs.map((b) => (
          <Link key={b.label} to={b.to} className={`${cellule} transition hover:border-white/[0.18]`}>
            <span className="w-9 shrink-0 [&_svg]:h-auto [&_svg]:w-full">{b.dessin}</span>
            <span className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-gray-500">{b.label}</span>
              <span className="block truncate text-sm font-bold leading-tight">{b.valeur}</span>
              <span className="block truncate text-[10px] text-purple-300">{b.action}</span>
            </span>
          </Link>
        ))}

        {/* Le sixième bloc : la jauge d'ensemble, sans porte — c'est un état,
            pas un geste. */}
        <div className={cellule}>
          <span className="w-9 shrink-0 [&_svg]:h-auto [&_svg]:w-full">
            <Jauge part={jauges.utilisation / 100} encre={{ de: '#fbbf24', a: '#fb7185' }} />
          </span>
          <span className="min-w-0">
            <span className="block text-[9px] font-semibold uppercase tracking-wider text-gray-500">Utilisation</span>
            <span className="block text-sm font-bold leading-tight">{jauges.utilisation} %</span>
            <span className="block truncate text-[10px] text-gray-500">du potentiel de l'appli</span>
          </span>
        </div>
      </div>
    </div>
  )
}
