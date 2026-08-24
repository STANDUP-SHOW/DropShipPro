import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Sparkles, Truck, Share2, Store, Globe, User, MessagesSquare } from 'lucide-react'
import { Layout } from '../components/Layout'
import { RecommendedProducts } from '../components/RecommendedProducts'
import { OpportunityList } from '../components/OpportunityList'
import { SignalList } from '../components/SignalList'
import { ReportList } from '../components/ReportList'
import { DepartmentChat } from '../components/DepartmentChat'
import { api } from '../lib/api'

type Department = Awaited<ReturnType<typeof api.listDepartments>>[number]

const TABS = [
  { id: 'ADVICE' as const, label: 'Produits conseillés', icon: Sparkles },
  { id: 'SUPPLIERS' as const, label: 'Fournisseurs', icon: Truck },
  { id: 'SOCIAL' as const, label: 'Réseaux sociaux', icon: Share2 },
  { id: 'MARKET' as const, label: 'Places de marché', icon: Store },
  { id: 'CHAT' as const, label: 'Discuter', icon: MessagesSquare },
]

/**
 * Le bureau d'un chef de rayon.
 *
 * Cinq pages : ce qu'il conseille aujourd'hui, les trois sources d'où ça vient,
 * et de quoi lui parler. La première est celle qu'on ouvre le matin ; les autres
 * servent quand on veut comprendre pourquoi il propose ça.
 */
export default function Rayon() {
  const { id = '' } = useParams()
  const [department, setDepartment] = useState<Department | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('ADVICE')
  const [scope, setScope] = useState<'ALL' | 'PERSONAL'>('ALL')
  const [view, setView] = useState<'LIVE' | 'REPORTS'>('LIVE')
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
      {tab !== 'ADVICE' && tab !== 'CHAT' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('LIVE')}
            className={
              view === 'LIVE'
                ? 'rounded-full bg-white/15 px-3 py-1 text-xs font-semibold'
                : 'rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            Trouvailles
          </button>
          <button
            type="button"
            onClick={() => setView('REPORTS')}
            className={
              view === 'REPORTS'
                ? 'rounded-full bg-white/15 px-3 py-1 text-xs font-semibold'
                : 'rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            Rapports du jour
          </button>

          <span className="mx-1 h-4 w-px bg-white/10" />

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
      {tab === 'CHAT' && (
        <DepartmentChat departmentId={department.id} agentName={department.agentName} />
      )}

      {tab === 'SUPPLIERS' &&
        (view === 'REPORTS' ? (
          <ReportList section="SUPPLIERS" department={department.id} />
        ) : (
          <OpportunityList scope={scope} department={department.id} />
        ))}
      {tab === 'SOCIAL' &&
        (view === 'REPORTS' ? (
          <ReportList section="SOCIAL" department={department.id} />
        ) : (
          <SignalList kind="SOCIAL" scope={scope} department={department.id} />
        ))}
      {tab === 'MARKET' &&
        (view === 'REPORTS' ? (
          <ReportList section="MARKET" department={department.id} />
        ) : (
          <SignalList kind="MARKET" scope={scope} department={department.id} />
        ))}
    </Layout>
  )
}
