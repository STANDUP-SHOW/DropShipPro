import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X, ExternalLink, TrendingUp, Package } from 'lucide-react'
import { api } from '../lib/api'

type Signal = Awaited<ReturnType<typeof api.listSignals>>['signals'][number]

/** Les métriques arrivent sans schéma imposé : on affiche ce qui est venu. */
function metricLabel(key: string) {
  const known: Record<string, string> = {
    gmv: 'CA',
    units: 'unités',
    price: 'prix moyen',
    growth: 'croissance',
    affiliate: 'part affiliation',
    rank: 'classement',
  }
  return known[key] ?? key
}

export function SignalList({
  kind,
  scope,
  department,
}: {
  kind: 'SOCIAL' | 'MARKET'
  scope: 'ALL' | 'PERSONAL'
  department?: string
}) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .listSignals(kind, department)
      .then((r) => setSignals(r.signals))
      .catch(() => setError('Impossible de charger la veille'))
      .finally(() => setLoading(false))
  }, [kind, department])

  const shown = useMemo(
    () => signals.filter((s) => s.status !== 'REJECTED' && (scope === 'ALL' || s.personal)),
    [signals, scope],
  )

  async function setStatus(s: Signal, status: string) {
    try {
      await api.setSignalStatus(s.id, status)
      setSignals((list) => list.map((x) => (x.id === s.id ? { ...x, status: status as never } : x)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (loading) return <p className="mt-6 text-sm text-gray-500">Chargement…</p>
  if (error) return <p className="mt-6 text-sm text-red-400">{error}</p>

  if (!shown.length) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
        <p className="text-sm text-gray-400">
          {scope === 'PERSONAL'
            ? "Aucun signal ne concerne vos produits pour l'instant."
            : 'Aucun signal pour le moment.'}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          {scope === 'PERSONAL'
            ? 'Un signal devient « personnel » quand il recoupe une de vos annonces.'
            : 'Vos agents de veille déposent leurs observations ici.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="mt-5 space-y-3">
      {shown.map((s) => (
        <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {s.platform && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                    {s.platform}
                  </span>
                )}
                {s.personal && (
                  <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-300">
                    Concerne mes produits
                  </span>
                )}
                {s.isNew && (
                  <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                    Nouveauté
                  </span>
                )}
                {s.brand && <span className="text-[11px] text-gray-500">{s.brand}</span>}
              </div>

              <p className="mt-1 font-semibold">{s.title}</p>
              {s.summary && <p className="mt-1 text-xs leading-relaxed text-gray-400">{s.summary}</p>}
            </div>

            {(s.trendScore !== null || s.engagementScore !== null) && (
              <div className="shrink-0 text-right">
                {s.trendScore !== null && (
                  <p className="flex items-center justify-end gap-1 text-lg font-bold text-emerald-400">
                    <TrendingUp size={16} />
                    <span>{s.trendScore}</span>
                  </p>
                )}
                <p className="text-[11px] text-gray-500">tendance estimée</p>
              </div>
            )}
          </div>

          {s.metrics && Object.keys(s.metrics).length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              {Object.entries(s.metrics)
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-gray-500">{metricLabel(key)}</dt>
                    <dd className="font-semibold">{String(value)}</dd>
                  </div>
                ))}
            </dl>
          )}

          {s.matchedProducts.length > 0 && (
            <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/5 p-2">
              <p className="text-[11px] text-sky-300">Vos annonces concernées</p>
              <ul className="mt-1 space-y-1">
                {s.matchedProducts.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/products/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs text-gray-300 underline-offset-2 hover:underline"
                    >
                      <Package size={12} />
                      <span>{p.title}</span>
                    </Link>
                    {/* Les mots du rapprochement : au vendeur de juger s'il tient. */}
                    <span className="ml-1 text-[11px] text-gray-600">{`(${p.on.join(', ')})`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <ExternalLink size={13} />
                <span>Ouvrir la source</span>
              </a>
            )}

            {s.status === 'NEW' && (
              <button
                type="button"
                onClick={() => setStatus(s, 'KEPT')}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <Check size={13} />
                <span>Garder</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setStatus(s, 'REJECTED')}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-red-400"
            >
              <X size={13} />
              <span>Écarter</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
