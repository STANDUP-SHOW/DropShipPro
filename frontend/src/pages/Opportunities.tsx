import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radar, Check, X, Download, ExternalLink, Puzzle, HelpCircle } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Opportunity = Awaited<ReturnType<typeof api.listOpportunities>>['opportunities'][number]

const TABS = [
  { id: 'NEW', label: 'Nouvelles' },
  { id: 'KEPT', label: 'Gardées' },
  { id: 'IMPORTED', label: 'Importées' },
  { id: 'REJECTED', label: 'Écartées' },
] as const

function euro(value: number | null, currency: string) {
  if (value === null) return '—'
  return value.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR' })
}

/**
 * Ce que les agents de veille ont repéré, en attente d'arbitrage.
 *
 * L'agent propose, le vendeur dispose. Rien n'est importé sans un geste de sa
 * part : un import consomme un crédit et remplit son catalogue.
 *
 * Les colonnes disent aussi ce qu'on ignore. Un « non vérifié » affiché vaut
 * mieux qu'un « non » inventé — c'est ce qui a fait écarter à tort des produits
 * valables lors des premiers scans.
 */
export default function Opportunities() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('NEW')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api
      .listOpportunities()
      .then((r) => setItems(r.opportunities))
      .catch(() => setError('Impossible de charger vos opportunités'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const shown = useMemo(() => items.filter((o) => o.status === tab), [items, tab])
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of items) map[o.status] = (map[o.status] ?? 0) + 1
    return map
  }, [items])

  async function setStatus(o: Opportunity, status: string) {
    setBusyId(o.id)
    try {
      await api.setOpportunityStatus(o.id, status)
      setItems((list) => list.map((x) => (x.id === o.id ? { ...x, status: status as never } : x)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function importOne(o: Opportunity) {
    setBusyId(o.id)
    setError(null)
    try {
      const product = (await api.importProduct(o.sourceUrl)) as { id: string }
      await api.setOpportunityStatus(o.id, 'IMPORTED', product.id)
      setItems((list) =>
        list.map((x) => (x.id === o.id ? { ...x, status: 'IMPORTED', productId: product.id } : x)),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Radar size={22} className="text-emerald-400" />
        <span>Opportunités</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Ce que vos agents de veille ont repéré chez les fournisseurs. Vous gardez, vous écartez, et
        vous importez ce qui vous intéresse — rien ne part tout seul.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold'
                : 'rounded-full border border-white/10 px-4 py-1.5 text-sm text-gray-400 hover:bg-white/5'
            }
          >
            {`${t.label} (${counts[t.id] ?? 0})`}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {loading && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}

      {!loading && !items.length && (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucune opportunité pour le moment.</p>
          <p className="mt-2 text-xs text-gray-500">
            Vos agents déposent leurs trouvailles ici. Créez-leur une clé dans{' '}
            <Link to="/settings" className="underline">
              Réglages → Clés pour mes agents
            </Link>
            .
          </p>
        </div>
      )}

      {!loading && items.length > 0 && !shown.length && (
        <p className="mt-6 text-sm text-gray-500">Rien dans cet onglet.</p>
      )}

      <ul className="mt-5 space-y-3">
        {shown.map((o) => (
          <li key={o.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                    {o.source}
                  </span>
                  {o.isNew && (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      Nouveauté
                    </span>
                  )}
                  {o.category && <span className="text-[11px] text-gray-500">{o.category}</span>}
                </div>
                <p className="mt-1 font-semibold">{o.title}</p>
                {o.notes && <p className="mt-1 text-xs leading-relaxed text-gray-400">{o.notes}</p>}
              </div>

              {o.marginPercent !== null && (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-emerald-400">{`+${o.marginPercent} %`}</p>
                  <p className="text-[11px] text-gray-500">marge estimée</p>
                </div>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-gray-500">Prix fournisseur</dt>
                <dd className="font-semibold">{euro(o.sourcePrice, o.currency)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Prix marché</dt>
                <dd className="font-semibold">{euro(o.marketPrice, o.currency)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Stock Europe</dt>
                <dd className={o.euStock === null ? 'text-gray-500' : 'font-semibold'}>
                  {o.euStock === null ? (
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle size={12} />
                      <span>non vérifié</span>
                    </span>
                  ) : (
                    <span>{o.euStock ? 'oui' : 'non'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Livraison</dt>
                <dd className="font-semibold">{o.delivery ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Ventes constatées</dt>
                <dd className={o.salesCount === null ? 'text-gray-500' : 'font-semibold'}>
                  {o.salesCount === null ? 'non publié' : o.salesCount.toLocaleString('fr-FR')}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Garantie</dt>
                <dd className={o.warranty ? 'font-semibold' : 'text-gray-500'}>
                  {o.warranty ?? '—'}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href={o.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <ExternalLink size={13} />
                <span>Voir la fiche</span>
              </a>

              {o.status !== 'IMPORTED' &&
                (o.needsExtension ? (
                  // Le serveur ne reçoit qu'une coquille vide sur ces sites : le
                  // dire ici plutôt que de laisser le clic échouer.
                  <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
                    <Puzzle size={13} />
                    <span>Import par l'extension, depuis la fiche</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => importOne(o)}
                    disabled={busyId === o.id}
                    className="btn-gradient inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    <Download size={13} />
                    <span>{busyId === o.id ? 'Import…' : 'Importer (1 crédit)'}</span>
                  </button>
                ))}

              {o.status === 'IMPORTED' && o.productId && (
                <Link
                  to={`/products/${o.productId}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300"
                >
                  <Check size={13} />
                  <span>Voir l'annonce</span>
                </Link>
              )}

              {o.status === 'NEW' && (
                <button
                  type="button"
                  onClick={() => setStatus(o, 'KEPT')}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                >
                  <Check size={13} />
                  <span>Garder</span>
                </button>
              )}

              {o.status !== 'REJECTED' && o.status !== 'IMPORTED' && (
                <button
                  type="button"
                  onClick={() => setStatus(o, 'REJECTED')}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-red-400"
                >
                  <X size={13} />
                  <span>Écarter</span>
                </button>
              )}

              {o.status === 'REJECTED' && (
                <button
                  type="button"
                  onClick={() => setStatus(o, 'NEW')}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5"
                >
                  Remettre en liste
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Layout>
  )
}
