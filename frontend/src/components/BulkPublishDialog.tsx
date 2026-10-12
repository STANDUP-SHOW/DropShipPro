import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PublishResult } from './PublishResult'
import { Layers, X, Zap, CheckCircle2, ExternalLink, Info } from 'lucide-react'
import { PlatformBadge } from './PlatformBadge'
import { ShopPicker } from './ShopPicker'
import { api } from '../lib/api'
import { INTEGRATION_LABEL, type PlatformInfo } from '../lib/platforms'

interface BatchResult {
  productId: string
  title: string
  platform: string
  status: string
  error: string | null
  externalUrl: string | null
}

/**
 * Publishes several listings at once.
 *
 * Only API destinations are offered: Vinted, Leboncoin and Facebook Marketplace
 * have no public API, the extension fills their form one tab at a time and the
 * seller presses « Publier » himself — there is nothing to batch there.
 *
 * Sent in packs of LOT products, one request after the other: a whole catalogue
 * in a single request outlived the proxy timeout and the server caps a request
 * at 200 listings (12/10/2026, « la liste intégrale ne passe pas »).
 */
const LOT = 25

export function BulkPublishDialog({
  productIds,
  platforms,
  onClose,
  onDone,
}: {
  productIds: string[]
  platforms: PlatformInfo[]
  onClose: () => void
  onDone: () => Promise<void> | void
}) {
  // A seller with a shop never picks the Market: everything published in the
  // shop goes there by itself. The destination stays for those without one.
  const [aUneBoutique, setAUneBoutique] = useState(false)
  useEffect(() => {
    api
      .listShops()
      .then((l) => setAUneBoutique(l.length > 0))
      .catch(() => undefined)
  }, [])
  const batchable = platforms.filter((p) => p.batchable && !(aUneBoutique && p.id === 'DROPSHOP_MARKET'))
  const manual = platforms.filter((p) => p.integration === 'extension')

  // Only « Mon site » is pre-selected: pre-checking every live destination sent
  // the catalogue to sixty channels at once when the seller meant one.
  const [selected, setSelected] = useState<string[]>(
    platforms.some((p) => p.id === 'OWN_SITE' && p.batchable) ? ['OWN_SITE'] : [],
  )
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null)
  const [shopId, setShopId] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ published: number; pending: number; failed: number } | null>(null)
  const [results, setResults] = useState<BatchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }, [])

  const [recap, setRecap] = useState<Awaited<ReturnType<typeof api.publishBatch>>['results'] | null>(null)

  async function run() {
    const destinations = selected.filter((id) => batchable.some((p) => p.id === id))
    if (!destinations.length || busy) return
    setBusy(true)
    setError(null)
    setResults([])
    setSummary(null)
    const tous: BatchResult[] = []
    try {
      for (let i = 0; i < productIds.length; i += LOT) {
        setAvance({ fait: i, total: productIds.length })
        const res = await api.publishBatch(productIds.slice(i, i + LOT), destinations, shopId || undefined)
        tous.push(...res.results)
      }
    } catch (err) {
      // What already went through is kept and shown: the packs before the
      // failure are published, and saying « impossible » would hide them.
      setError(
        `${err instanceof Error ? err.message : 'Publication en lot impossible'}` +
          (tous.length ? ` (arrêt après ${new Set(tous.map((r) => r.productId)).size} annonce(s) traitée(s))` : ''),
      )
    }
    if (tous.length) {
      setSummary({
        published: tous.filter((r) => r.status === 'PUBLISHED').length,
        pending: tous.filter((r) => r.status === 'PENDING').length,
        failed: tous.filter((r) => r.status === 'FAILED').length,
      })
      // Le recapitulatif complet, pas seulement les echecs : un lot dont rien
      // n echoue mais dont tout attend ne doit pas passer pour une reussite.
      setRecap(tous)
      // Only the failures are worth listing one by one; the rest is a count.
      setResults(tous.filter((r) => r.status === 'FAILED'))
      await onDone()
    }
    setAvance(null)
    setBusy(false)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Layers size={18} className="text-purple-300" />
              {`Publier ${productIds.length} annonce(s) en lot`}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Uniquement les destinations qui publient par API. Les plateformes assistées par
              l'extension se publient une annonce à la fois.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-2 mt-4">
          {batchable.map((p) => {
            const isSelected = selected.includes(p.id)
            return (
              <button
                type="button"
                key={p.id}
                aria-pressed={isSelected}
                onClick={() => toggle(p.id)}
                style={{ backgroundColor: isSelected ? p.color : 'transparent', borderColor: p.color }}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                  isSelected ? 'text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <PlatformBadge id={p.id} label={p.label} color={p.color} size={24} domain={p.domain} />
                <span className="text-left leading-tight">
                  <span className="block">{p.label}</span>
                  <span className="block text-[10px] font-normal opacity-70">
                    {INTEGRATION_LABEL[p.integration]}
                  </span>
                </span>
                {isSelected && <CheckCircle2 size={16} className="ml-auto shrink-0" />}
              </button>
            )
          })}
        </div>

        {aUneBoutique && (
          <p className="mt-3 flex gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
            <Info size={14} className="mt-0.5 shrink-0 text-purple-300" />
            <span>
              Chaque annonce publiée dans votre boutique (« Mon site ») est aussi sur DropShop Market,
              automatiquement, sauf si vous l'avez désactivé dans DropShop Market.
            </span>
          </p>
        )}

        <p className="mt-3 flex gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
          <Info size={14} className="mt-0.5 shrink-0 text-purple-300" />
          <span>
            {`Impossible en lot : ${manual.map((p) => p.label).join(', ')}. Ces plateformes exigent que le vendeur valide chaque annonce lui-même — ouvrez l'annonce et utilisez « Diffuser votre annonce ».`}
          </span>
        </p>

        {summary && (
          <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">
            {`${summary.published} publiée(s), ${summary.pending} en attente, ${summary.failed} en échec.`}
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {results.map((r) => (
              <li key={`${r.productId}-${r.platform}`} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs">
                <span className="font-semibold">{r.title}</span>
                <span className="block text-red-300">
                  {`${platforms.find((p) => p.id === r.platform)?.label ?? r.platform} — ${r.error ?? 'échec'}`}
                </span>
                {r.externalUrl && (
                  <a
                    href={r.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-purple-300 hover:underline"
                  >
                    voir <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {selected.includes('OWN_SITE') && <ShopPicker value={shopId} onChange={setShopId} />}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {`${selected.filter((id) => batchable.some((p) => p.id === id)).length} destination(s) — ${productIds.length} annonce(s)`}
          </span>
          <button
            type="button"
            onClick={run}
            disabled={!selected.some((id) => batchable.some((p) => p.id === id)) || busy}
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold disabled:opacity-40"
          >
            <Zap size={16} />
            {busy
              ? avance && avance.total > LOT
                ? `Publication… ${avance.fait} / ${avance.total}`
                : 'Publication en cours…'
              : 'Publier le lot'}
          </button>
        </div>
      </div>

      {recap ? (
        <PublishResult
          resultats={recap}
          platforms={platforms}
          onClose={() => {
            setRecap(null)
            onClose()
          }}
        />
      ) : null}
    </div>,
    document.body,
  )
}
