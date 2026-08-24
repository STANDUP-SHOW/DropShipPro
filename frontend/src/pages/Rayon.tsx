import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Sparkles, Truck, Share2, Store, Globe, User } from 'lucide-react'
import { Layout } from '../components/Layout'
import { RecommendedProducts } from '../components/RecommendedProducts'
import { OpportunityList } from '../components/OpportunityList'
import { SignalList } from '../components/SignalList'
import { api } from '../lib/api'

type Department = Awaited<ReturnType<typeof api.listDepartments>>[number]

const TABS = [
  { id: 'ADVICE' as const, label: 'Produits conseillés', icon: Sparkles },
  { id: 'SUPPLIERS' as const, label: 'Fournisseurs', icon: Truck },
  { id: 'SOCIAL' as const, label: 'Réseaux sociaux', icon: Share2 },
  { id: 'MARKET' as const, label: 'Places de marché', icon: Store },
]

/**
 * Le bureau d'un chef de rayon.
 *
 * Quatre pages : ce qu'il conseille aujourd'hui, et les trois sources d'où ça
 * vient. La première est celle qu'on ouvre le matin ; les trois autres servent
 * quand on veut comprendre pourquoi il propose ça.
 */
export default function Rayon() {
  const { id = '' } = useParams()
  const [department, setDepartment] = useState<Department | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('ADVICE')
  const [scope, setScope] = useState<'ALL' | 'PERSONAL'>('ALL')
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    api
      .listDepartments()
      .then((list) => {
        const found = list.find((d) => d.id === id)
        if (found) setDepartment(found)
        else setMissing(true)
      })
      .catch(() => setMissing(true))
  }, [id])

  if (missing) {
    return (
      <Layout>
        <p className="text-sm text-gray-400">Ce rayon n'existe pas ou n'est plus confié.</p>
        <Link to="/rayons" className="mt-3 inline-block text-sm underline">
          Retour aux chefs de rayon
        </Link>
      </Layout>
    )
  }

  if (!department) {
    return (
      <Layout>
        <p className="text-sm text-gray-500">Chargement…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <Link
        to="/rayons"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft size={13} />
        <span>Chefs de rayon</span>
      </Link>

      <h1 className="mt-3 flex items-center gap-3 text-2xl font-bold">
        <span className="text-3xl">{department.emoji}</span>
        <span>{`${department.label} — ${department.agentName}`}</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">{department.focus}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold'
                  : 'inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:bg-white/5'
              }
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Le filtre global/personnel n'a de sens que sur les sources : la liste
          conseillée est par nature tournée vers ce qu'on ne vend pas encore. */}
      {tab !== 'ADVICE' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScope('ALL')}
            className={
              scope === 'ALL'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-300'
                : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            <Globe size={13} />
            <span>Veille globale</span>
          </button>
          <button
            type="button"
            onClick={() => setScope('PERSONAL')}
            className={
              scope === 'PERSONAL'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-300'
                : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            <User size={13} />
            <span>Ma veille</span>
          </button>
        </div>
      )}

      {tab === 'ADVICE' && <RecommendedProducts department={department.id} />}
      {tab === 'SUPPLIERS' && <OpportunityList scope={scope} department={department.id} />}
      {tab === 'SOCIAL' && <SignalList kind="SOCIAL" scope={scope} department={department.id} />}
      {tab === 'MARKET' && <SignalList kind="MARKET" scope={scope} department={department.id} />}
    </Layout>
  )
}
