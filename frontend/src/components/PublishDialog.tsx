import { useEffect, useState } from 'react'
import { Radio, X, Zap, AlertTriangle } from 'lucide-react'

export interface PlatformInfo {
  id: string
  label: string
  automatable: boolean
  sellUrl: string | null
  note: string
  color: string
  warning?: string
  unavailable?: boolean
}

/** Posts a diffusion order to the extension and waits for it to acknowledge. */
function startExtensionSession(productId: string, platforms: string[]): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    function onReply(event: MessageEvent) {
      if (event.source !== window) return
      if (event.data?.source !== 'droppost-extension' || event.data?.type !== 'dsp-start-session-result') return
      window.removeEventListener('message', onReply)
      resolve(event.data.response ?? { ok: false })
    }
    window.addEventListener('message', onReply)
    window.postMessage(
      { source: 'droppost-app', type: 'dsp-start-session', payload: { productId, platforms } },
      window.location.origin,
    )
    // The bridge answers within a tick when installed; otherwise fall back.
    setTimeout(() => {
      window.removeEventListener('message', onReply)
      resolve({ ok: false, error: 'extension-absente' })
    }, 4000)
  })
}

export function PublishDialog({
  productId,
  platforms,
  onClose,
  onPublished,
}: {
  productId: string
  platforms: PlatformInfo[]
  onClose: () => void
  onPublished: (selected: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [extensionReady, setExtensionReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // The bridge stamps <html> as soon as it runs, so this catches an extension
    // that announced itself long before this dialog existed.
    if (document.documentElement.dataset.dropshipProExtension) {
      setExtensionReady(true)
      return
    }

    function onReady(event: MessageEvent) {
      if (event.source === window && event.data?.type === 'dsp-extension-ready') setExtensionReady(true)
    }
    window.addEventListener('message', onReady)
    // Ask, in case the bridge loaded after the marker check above.
    window.postMessage({ source: 'droppost-app', type: 'dsp-ping' }, window.location.origin)

    return () => window.removeEventListener('message', onReady)
  }, [])

  const available = platforms.filter((p) => !p.unavailable)
  const warned = selected
    .map((id) => platforms.find((p) => p.id === id))
    .filter((p): p is PlatformInfo => Boolean(p?.warning))

  async function diffuse() {
    if (!selected.length) return
    setBusy(true)
    setMessage(null)
    try {
      await onPublished(selected)
      const result = await startExtensionSession(productId, selected)
      setMessage(
        result.ok
          ? `Diffusion lancée : un onglet par plateforme vient de s'ouvrir. Ne les fermez pas, DropShip Pro remplit les annonces.`
          : "Annonce enregistrée. Installez l'extension Chrome pour que le remplissage se fasse tout seul.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Radio size={18} className="text-purple-300" /> Diffuser votre annonce
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Choisissez les marketplaces. Un onglet s'ouvrira pour chacune et l'IA remplira le formulaire.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-2 mt-4">
          {available.map((p) => {
            const isSelected = selected.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() =>
                  setSelected((s) => (isSelected ? s.filter((x) => x !== p.id) : [...s, p.id]))
                }
                style={{
                  backgroundColor: isSelected ? p.color : 'transparent',
                  borderColor: p.color,
                }}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                  isSelected ? 'text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                  style={{ backgroundColor: p.color }}
                >
                  {p.label.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-left leading-tight">Publier sur {p.label}</span>
              </button>
            )
          })}
        </div>

        {warned.length > 0 && (
          <div className="mt-4 space-y-2">
            {warned.map((p) => (
              <p
                key={p.id}
                className="flex gap-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200"
              >
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <b>{p.label}</b> — {p.warning}
                </span>
              </p>
            ))}
          </div>
        )}

        {message && <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">{message}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {extensionReady ? '✓ Extension détectée' : "Extension non détectée — remplissage manuel"}
          </span>
          <button
            onClick={diffuse}
            disabled={!selected.length || busy}
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold disabled:opacity-40"
          >
            <Zap size={16} />
            {busy ? 'Diffusion…' : `Diffuser votre annonce (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
