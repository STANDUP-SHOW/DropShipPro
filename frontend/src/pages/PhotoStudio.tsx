import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { Camera, Sparkles, Check, Trash2, Download, ImageOff } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'
import { AgentBook } from '../components/AgentBook'
import { AgentBar } from '../components/AgentBar'

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

type State = Awaited<ReturnType<typeof api.visualState>>
type Detail = Awaited<ReturnType<typeof api.productVisuals>>
type Product = { id: string; title: string; aiTitle?: string | null; images?: unknown }

/**
 * L'atelier photo.
 *
 * L'agent ne dessine pas de produit : il reprend celui des photos et le remet en
 * situation. Un vendeur qui publierait l'image d'un objet que son fournisseur ne
 * livre pas récolte un litige, puis une suspension — la photo doit montrer ce
 * qui arrivera dans le colis.
 */
export default function PhotoStudio() {
  const [state, setState] = useState<State | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [hint, setHint] = useState('')
  const [count, setCount] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  function loadState() {
    api.visualState().then(setState).catch(() => setError('Atelier indisponible'))
  }

  useEffect(() => {
    loadState()
    api.listProducts().then(setProducts).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!openId) {
      setDetail(null)
      return
    }
    setError(null)
    api.productVisuals(openId).then(setDetail).catch(() => setDetail(null))
  }, [openId])

  async function generate() {
    if (!openId) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.generatePhotos(openId, count, hint.trim() || undefined)
      if (res.errors.length) setError(res.errors.join(' · '))
      setDetail((d) => (d ? { ...d, generated: [...res.images, ...d.generated] } : d))
      setState((s) => (s ? { ...s, credits: res.credits } : s))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function keep(id: string) {
    await api.keepImage(id).catch((e) => setError((e as Error).message))
    setDetail((d) =>
      d ? { ...d, generated: d.generated.map((g) => (g.id === id ? { ...g, kept: true } : g)) } : d,
    )
  }

  async function remove(id: string) {
    await api.deleteImage(id).catch(() => undefined)
    setDetail((d) => (d ? { ...d, generated: d.generated.filter((g) => g.id !== id) } : d))
  }

  async function buy(packId: string) {
    setError(null)
    try {
      const { clientSecret: secret } = await api.startCheckout(packId)
      setClientSecret(secret)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const photos = detail?.generated.filter((g) => g.kind === 'photo') ?? []

  return (
    <Layout>
      <AgentBar
        agentKey="marketing"
        nom="Lea"
        emoji="📸"
        exemple="Demandez : quelle mise en situation pour ce produit ?"
      />

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Camera size={22} className="text-emerald-400" />
        <span>Marketing photo</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Léa reprend les photos de votre produit et les remet en situation, comme un photographe en
        studio. Elle ne fait que de la photo, et n'invente jamais un produit : celui de la photo est
        celui que recevra l'acheteur. Pour une publicité — logo, prix, bouton vers la boutique —
        c'est Laurence, dans Marketing.
      </p>

      {state && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <p className="text-sm">
              <b>{`Vous m'avez embauché pour ${state.credits + state.produced} images.`}</b>
            </p>
            <p className="text-xs text-gray-400">
              {`Nous en avons généré ${state.produced}. Il vous en reste ${state.credits}.`}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            {state.packs.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => buy(p.id)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                {`${p.label} — ${(p.amount / 100).toFixed(0)} €`}
              </button>
            ))}
          </div>

          {!state.configured && (
            <p className="w-full text-xs text-amber-300">
              La génération d'images n'est pas encore configurée sur le serveur.
            </p>
          )}
        </div>
      )}

      {clientSecret && stripePromise && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Paiement sécurisé</h2>
            <button
              type="button"
              onClick={() => setClientSecret(null)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Annuler
            </button>
          </div>
          <div className="mt-4">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        </section>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <h2 className="mt-8 font-bold">Vos produits</h2>
      <ul className="mt-3 space-y-2">
        {products.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
              className={
                openId === p.id
                  ? 'w-full rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-left'
                  : 'w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10'
              }
            >
              <p className="truncate text-sm font-semibold">{p.aiTitle || p.title}</p>
              <p className="text-xs text-gray-500">
                {openId === p.id ? 'Fermer' : 'Modifier les images de ce produit'}
              </p>
            </button>

            {openId === p.id && detail && detail.product.id === p.id && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex-1">
                    <span className="block text-xs text-gray-400">
                      Une précision pour l'agent (facultatif)
                    </span>
                    <input
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      placeholder="Ex. en extérieur, en usage, ambiance atelier"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label>
                    <span className="block text-xs text-gray-400">Images</span>
                    <select
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      className="mt-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={generate}
                    disabled={busy || !state?.configured}
                    className="btn-gradient inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    <Sparkles size={14} />
                    <span>{busy ? 'Création…' : `Créer les images (${count} crédit(s))`}</span>
                  </button>
                </div>

                {!photos.length && !busy && (
                  <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <ImageOff size={13} />
                    <span>Aucune image générée pour ce produit.</span>
                  </p>
                )}

                <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {photos.map((g) => (
                    <li key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                      <img
                        src={assetUrl(g.path)}
                        alt=""
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => keep(g.id)}
                          disabled={g.kept}
                          className={
                            g.kept
                              ? 'inline-flex items-center gap-1 rounded-lg bg-emerald-400/15 px-2 py-1 text-[11px] text-emerald-300'
                              : 'inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5'
                          }
                        >
                          <Check size={11} />
                          <span>{g.kept ? 'Retenue' : 'Valider'}</span>
                        </button>
                        <a
                          href={assetUrl(g.path)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5"
                        >
                          <Download size={11} />
                        </a>
                        <button
                          type="button"
                          onClick={() => remove(g.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400 hover:bg-white/5 hover:text-red-400"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!products.length && (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-gray-500">
          Importez d'abord une annonce : l'agent travaille à partir de ses photos.
        </p>
      )}
      <AgentBook
        kind="photo"
        titre="Le book de Léa"
        vide="Aucune photo produite pour l’instant. Celles que Léa fera resteront ici, toutes annonces confondues."
      />
    </Layout>
  )
}
