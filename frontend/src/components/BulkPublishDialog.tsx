import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
 */
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
  const batchable = platforms.filter((p) => p.batchable)
  const manual = platforms.filter((p) => p.integration === 'extension')

  // Pre-selecting the destinations that really publish saves the most common
  // click (« tout mon catalogue sur ma boutique ») without hiding the others.
  const [selected, setSelected] = useState<string[]>(
    batchable.filter((p) => p.integration === 'live').map((p) => p.id),
  )
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

  async function run() {
    if (!selected.length || busy) return
    setBusy(true)
    setError(null)
    setResults([])
    setSummary(null)
    try {
      const res = await api.publishBatch(productIds, selected, shopId || undefined)
      setSummary({ published: res.published, pending: res.pending, failed: res.failed })
      // Only the failures are worth listing one by one; the rest is a count.
      setResults(res.results.filter((r) => r.status === 'FAILED'))
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication en lot impossible')
    } finally {
      setBusy(false)
    }
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
                <PlatformBadge label={p.label} color={p.color} size={24} />
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
            {`${selected.length} destination(s) — ${productIds.length} annonce(s)`}
          </span>
          <button
            type="button"
            onClick={run}
            disabled={!selected.length || busy}
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold disabled:opacity-40"
          >
            <Zap size={16} />
            {busy ? 'Publication en cours…' : 'Publier le lot'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
