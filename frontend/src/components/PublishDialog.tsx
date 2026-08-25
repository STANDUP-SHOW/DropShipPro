import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Radio, X, Zap, AlertTriangle, ExternalLink } from 'lucide-react'
import { PublishTargets } from './PublishTargets'
import { type PlatformInfo } from '../lib/platforms'

export type { PlatformInfo }

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

export interface PublishOutcome {
  platform: string
  status: string
  error: string | null
  externalUrl: string | null
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
  onPublished: (selected: string[], shopId?: string) => Promise<PublishOutcome[] | void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  /**
   * Les boutiques cochées, par leur identifiant.
   *
   * Plusieurs, et non une : un vendeur qui tient un site mode et un site
   * high-tech veut parfois envoyer la même annonce aux deux. « Mon site » était
   * une case unique, et le choix du site se faisait après, dans une liste
   * déroulante — ce qui ne voulait plus rien dire dès qu'il y en avait deux.
   */
  const [shopIds, setShopIds] = useState<string[]>([])
  const [extensionReady, setExtensionReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<PublishOutcome[]>([])

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

  // Closing on Escape as well as on the backdrop: the dialog is now rendered in a
  // portal, so it is no longer inside anything that could swallow the click.
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

  const toggleShop = useCallback((id: string) => {
    setShopIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }, [])

  const warned = selected
    .map((id) => platforms.find((p) => p.id === id))
    .filter((p): p is PlatformInfo => Boolean(p?.warning))
  const needsExtension = selected.some((id) => platforms.find((p) => p.id === id)?.integration === 'extension')

  async function diffuse() {
    if (!selected.length && !shopIds.length) return
    setBusy(true)
    setMessage(null)
    setOutcomes([])
    try {
      const resultats: PublishOutcome[] = []

      // Une publication par boutique cochée : le serveur range l'annonce dans
      // une seule boutique à la fois, et deux sites veulent deux appels.
      for (const shop of shopIds) {
        const r = await onPublished(['OWN_SITE'], shop)
        if (Array.isArray(r)) resultats.push(...r)
      }

      if (selected.length) {
        const r = await onPublished(selected, undefined)
        if (Array.isArray(r)) resultats.push(...r)
      }

      if (resultats.length) setOutcomes(resultats)

      // The extension is only worth waking up when a manual marketplace is in the
      // batch: an API destination is already done at this point.
      if (needsExtension) {
        const result = await startExtensionSession(productId, selected)
        setMessage(
          result.ok
            ? "Diffusion lancée : un onglet par plateforme vient de s'ouvrir. Ne les fermez pas, DropShipper IA remplit les annonces."
            : "Annonce enregistrée. Installez l'extension Chrome pour que le remplissage se fasse tout seul.",
        )
      } else {
        setMessage('Annonce envoyée. Le détail par plateforme est ci-dessous.')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Publication impossible')
    } finally {
      setBusy(false)
    }
  }

  // Rendered at the end of <body>: inside the page, a sticky bar or a transformed
  // ancestor can end up on top of the dialog and eat the clicks on the platform
  // buttons — which is what made the selection counter stay at 0.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-4"
      // mousedown, not click: a click that starts inside the panel and ends on the
      // backdrop (a drag over a label) would otherwise close the dialog.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Radio size={18} className="text-purple-300" /> Diffuser votre annonce
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Cochez vos destinations. Les plateformes en API publient tout de suite ; les autres
              ouvrent un onglet que l'extension remplit pour vous.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>
        <PublishTargets
          platforms={platforms}
          selected={selected}
          onToggle={toggle}
          shopIds={shopIds}
          onToggleShop={toggleShop}
        />

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

        {message ? <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">{message}</p> : null}

        {/* Per-destination result: a refused Shopify token has to be readable, not
            hidden behind a generic "annonce enregistrée". */}
        {outcomes.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {outcomes.map((o) => {
              const info = platforms.find((p) => p.id === o.platform)
              const tone =
                o.status === 'PUBLISHED'
                  ? 'text-emerald-300'
                  : o.status === 'FAILED'
                    ? 'text-red-400'
                    : 'text-yellow-300'
              return (
                <li key={o.platform} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <span className="font-semibold">{info?.label ?? o.platform}</span>{' '}
                  <span className={tone}>
                    {o.status === 'PUBLISHED' ? 'publié' : o.status === 'FAILED' ? 'échec' : 'en attente'}
                  </span>
                  {o.externalUrl ? (
                    <a
                      href={o.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-purple-300 hover:underline"
                    >
                      voir l'annonce <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {o.error ? <span className="block text-gray-400 mt-0.5">{o.error}</span> : null}
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {extensionReady ? '✓ Extension détectée' : 'Extension non détectée — remplissage manuel'}
          </span>
          <button
            type="button"
            onClick={diffuse}
            disabled={(!selected.length && !shopIds.length) || busy}
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold disabled:opacity-40"
          >
            <Zap size={16} />
            {busy ? 'Diffusion…' : `Diffuser votre annonce (${selected.length + shopIds.length})`}
          </button>
        </div>

        {/* One single string: juxtaposed text expressions in JSX have already cost
            us a « removeChild » crash here. */}
        <p className="mt-3 text-center text-xs text-gray-500">
          {selected.length + shopIds.length === 0
            ? 'Aucune destination sélectionnée'
            : `${selected.length + shopIds.length} destination(s) sélectionnée(s)`}
        </p>
      </div>
    </div>,
    document.body,
  )
}
