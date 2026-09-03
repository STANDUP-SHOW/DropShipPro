import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocStats, type BlocData } from '../components/stats/TuileStat'
import { api } from '../lib/api'

/**
 * L'accueil statistiques : les quatorze blocs de la maquette, empilés.
 *
 * Chaque bloc reprend une partie du menu — vue générale, acquisition,
 * fournisseurs, catalogue, marketplaces, ventes, livraisons, messagerie, SAV
 * clients, SAV fournisseurs, finances, rayons, marché, plateforme — et chaque
 * partie retrouvera son bloc en tête de sa propre page : même adresse, même
 * calcul, jamais deux chiffres différents pour la même chose selon l'écran.
 *
 * La période se choisit en tête : les évolutions comparent toujours à la
 * période précédente de même durée, c'est le serveur qui fait ce calcul.
 */

const PERIODES = [
  { id: '7', label: '7 jours', jours: 7 },
  { id: '30', label: '30 jours', jours: 30 },
  { id: '90', label: '90 jours', jours: 90 },
  { id: '365', label: '1 an', jours: 365 },
]

export default function Statistiques() {
  const [blocs, setBlocs] = useState<BlocData[] | null>(null)
  const [periode, setPeriode] = useState('30')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger(jours: number) {
    setChargement(true)
    setErreur(null)
    try {
      const au = new Date()
      const du = new Date(au.getTime() - jours * 86400000)
      const r = await api.tableauStats(du, au)
      setBlocs(r.blocs)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Statistiques indisponibles')
    } finally {
      setChargement(false)
    }
  }

  useEffect(() => {
    charger(PERIODES.find((p) => p.id === periode)?.jours ?? 30)
  }, [periode])

  return (
    <Layout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-wide">STATISTIQUES</h1>
          <p className="mt-0.5 text-xs text-gray-500">Vue complète de votre activité</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriode(p.id)}
              className={
                periode === p.id
                  ? 'rounded-full bg-purple-500/25 px-3 py-1.5 text-xs font-semibold text-purple-200'
                  : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
              }
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => charger(PERIODES.find((p) => p.id === periode)?.jours ?? 30)}
            title="Recalculer"
            className="rounded-full border border-white/10 p-2 text-gray-400 hover:bg-white/5"
          >
            <RefreshCw size={13} className={chargement ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {erreur ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{erreur}</p>
      ) : null}

      {!blocs && !erreur ? <p className="mt-6 text-sm text-gray-500">Calcul en cours…</p> : null}

      {blocs ? (
        <div className={`mt-4 space-y-4 transition ${chargement ? 'opacity-60' : ''}`}>
          {blocs.map((bloc) => (
            <BlocStats key={bloc.id} bloc={bloc} />
          ))}
          {/*
            Ce que ce tableau ne dit pas, dit une fois plutôt que caché : une
            tuile en retrait n'est pas en panne, sa donnée n'existe pas encore
            et la raison est écrite dessus. Un chiffre inventé serait pire.
          */}
          <p className="pb-2 text-center text-[11px] text-gray-600">
            Les tuiles en retrait attendent leur donnée — la raison est écrite dessus. Aucun chiffre n'est estimé.
          </p>
        </div>
      ) : null}
    </Layout>
  )
}
