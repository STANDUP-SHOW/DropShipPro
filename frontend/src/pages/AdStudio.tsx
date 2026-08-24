import { useEffect, useState } from 'react'
import { Megaphone, Sparkles, Download, Trash2, Info } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'

type State = Awaited<ReturnType<typeof api.visualState>>
type Detail = Awaited<ReturnType<typeof api.productVisuals>>
type Product = { id: string; title: string; aiTitle?: string | null }

/**
 * L'atelier publicité.
 *
 * On produit un visuel, pas une campagne. Le budget, le ciblage et les enchères
 * restent chez la plateforme, là où le vendeur voit ce qu'il dépense : une
 * application qui engage de l'argent publicitaire à sa place est une application
 * qu'on n'ose plus laisser tourner.
 */
export default function AdStudio() {
  const [state, setState] = useState<State | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set(['instagram']))
  const [count, setCount] = useState(1)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.visualState().then(setState).catch(() => setError('Atelier indisponible'))
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

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function generate() {
    if (!openId || !chosen.size) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.generateAds(openId, [...chosen], count, hint.trim() || undefined)
      if (res.errors.length) setError(res.errors.join(' · '))
      setDetail((d) => (d ? { ...d, generated: [...res.images, ...d.generated] } : d))
      setState((s) => (s ? { ...s, credits: res.credits } : s))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await api.deleteImage(id).catch(() => undefined)
    setDetail((d) => (d ? { ...d, generated: d.generated.filter((g) => g.id !== id) } : d))
  }

  const ads = detail?.generated.filter((g) => g.kind === 'ad') ?? []
  const total = chosen.size * count

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Megaphone size={22} className="text-emerald-400" />
        <span>Publicité IA</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Des visuels publicitaires à partir des photos de votre produit, au format de chaque réseau.
      </p>

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p className="text-xs leading-relaxed text-sky-100">
          Nous produisons <b>le visuel</b>, pas la campagne. Vous le téléchargez et vous le publiez
          vous-même : c'est chez la plateforme que vous fixez le budget et le ciblage, et que vous
          voyez ce que vous dépensez.
        </p>
      </div>

      {state && (
        <p className="mt-4 text-sm text-gray-300">
          {`Il vous reste ${state.credits} image(s).`}
          {!state.configured && (
            <span className="ml-2 text-xs text-amber-300">
              La génération n'est pas encore configurée sur le serveur.
            </span>
          )}
        </p>
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
                {openId === p.id ? 'Fermer' : 'Créer une publicité pour ce produit'}
              </p>
            </button>

            {openId === p.id && detail && detail.product.id === p.id && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-gray-400">Où sera diffusée cette publicité ?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state?.formats.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggle(f.id)}
                      title={f.note}
                      className={
                        chosen.has(f.id)
                          ? 'rounded-full bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-300'
                          : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
                      }
                    >
                      {`${f.label} · ${f.width}×${f.height}`}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex-1">
                    <span className="block text-xs text-gray-400">
                      Informations supplémentaires (facultatif)
                    </span>
                    <input
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      placeholder="Ex. angle rentrée, cible bricoleurs, ambiance chantier"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                    />
                  </label>

                  <label>
                    <span className="block text-xs text-gray-400">Visuels par format</span>
                    <select
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      className="mt-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={generate}
                    disabled={busy || !chosen.size || !state?.configured}
                    className="btn-gradient inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    <Sparkles size={14} />
                    <span>{busy ? 'Création…' : `Générer (${total} crédit(s))`}</span>
                  </button>
                </div>

                <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {ads.map((g) => (
                    <li key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                      <img src={assetUrl(g.path)} alt="" className="w-full rounded-lg object-cover" />
                      <p className="mt-1 text-[11px] text-gray-500">
                        {`${g.platform ?? ''} · ${g.width}×${g.height}`}
                      </p>
                      <div className="mt-1 flex gap-1">
                        <a
                          href={assetUrl(g.path)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5"
                        >
                          <Download size={11} />
                          <span>Télécharger</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => remove(g.id)}
                          className="inline-flex items-center rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400 hover:bg-white/5 hover:text-red-400"
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
    </Layout>
  )
}
