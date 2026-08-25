import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Sparkles, Download, Trash2, Info, MessageSquare, Link2, BarChart3 } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'

type State = Awaited<ReturnType<typeof api.visualState>>
type Detail = Awaited<ReturnType<typeof api.productVisuals>>
type Product = { id: string; title: string; aiTitle?: string | null }

/**
 * Les régies auxquelles un vendeur voudra relier son compte.
 *
 * Rien n'est relié aujourd'hui, et la page le dit au lieu de le laisser croire.
 * Chaque ligne porte ce que le raccordement exigera réellement : ce ne sont pas
 * des détails d'implémentation mais des démarches que le vendeur devra faire
 * lui-même, souvent longues, et qu'il vaut mieux connaître avant de les
 * attendre.
 */
const REGIES = [
  {
    id: 'meta',
    label: 'Meta — Facebook et Instagram',
    exige: "Un compte Business Manager, une page, et une application Meta validée par leur revue.",
  },
  {
    id: 'google',
    label: 'Google Ads',
    exige: "Un compte Google Ads actif et un jeton de développeur, accordé après examen du compte.",
  },
  {
    id: 'tiktok',
    label: 'TikTok Ads',
    exige: 'Un compte TikTok for Business et une application approuvée sur leur console développeur.',
  },
  {
    id: 'x',
    label: 'X Ads',
    exige: "Un compte publicitaire X et un accès à l'API Ads, accordé au cas par cas.",
  },
  {
    id: 'snapchat',
    label: 'Snapchat Ads',
    exige: 'Un compte Snap Business et une application enregistrée.',
  },
  {
    id: 'pinterest',
    label: 'Pinterest Ads',
    exige: 'Un compte professionnel Pinterest et un accès API validé.',
  },
]

/**
 * Le service marketing.
 *
 * Trois choses au même endroit, parce qu'elles ne se décident pas séparément :
 * à qui parler avant de dépenser, quoi produire, et où le diffuser. L'atelier
 * publicité vivait seul dans son coin ; un visuel produit sans avoir regardé la
 * marge du produit est un visuel qu'on paiera deux fois.
 *
 * Ce que la page ne fait pas, et le dit : elle n'engage aucun budget. Le
 * ciblage et les enchères restent chez la régie, là où le vendeur voit ce qui
 * part de son compte.
 */
export default function Marketing() {
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
        <span>Marketing</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Le service de Nadia : quel produit mérite un budget, quel angle convertit, quel format pour
        quel réseau — et le visuel qui va avec, aux dimensions exactes de chaque régie.
      </p>

      {/* ---------- Parler à la responsable avant de dépenser ---------- */}
      <Link
        to="/agents/marketing"
        className="mt-5 flex max-w-3xl items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
      >
        <span className="text-2xl">📣</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Demander l'avis de Nadia</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
            Elle connaît votre catalogue et la marge de chaque produit. Avant de payer un visuel puis
            un budget, demandez-lui si ce produit supporte un coût d'acquisition — c'est la question
            qui décide, et elle refusera de vous conseiller un budget quand la marge ne suit pas.
          </span>
        </span>
        <MessageSquare size={16} className="mt-0.5 shrink-0 text-purple-300" />
      </Link>

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p className="text-xs leading-relaxed text-sky-100">
          Nous produisons <b>le visuel</b>, pas la campagne. Vous le téléchargez et vous le publiez
          vous-même : c'est chez la régie que vous fixez le budget et le ciblage, et que vous voyez
          ce que vous dépensez.
        </p>
      </div>

      {state ? (
        <p className="mt-4 text-sm text-gray-300">
          {`Il vous reste ${state.credits} image(s).`}
          {!state.configured ? (
            <span className="ml-2 text-xs text-amber-300">
              La génération n'est pas encore configurée sur le serveur.
            </span>
          ) : null}
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {/* ---------- Créer une publicité ---------- */}
      <h2 className="mt-8 font-bold">Créer une publicité</h2>
      <p className="mt-1 text-xs text-gray-500">
        Choisissez le produit, puis les réseaux où la publicité sera diffusée.
      </p>

      {products.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          Aucune annonce au catalogue : importez un produit avant de lui faire une publicité.
        </p>
      ) : (
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

              {openId === p.id && detail && detail.product.id === p.id ? (
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
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Comptes publicitaires ---------- */}
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <Link2 size={16} className="text-purple-300" />
        <span>Mes comptes publicitaires</span>
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        Relier un compte servira à deux choses : publier le visuel sans passer par un
        téléchargement, et rapatrier ici les chiffres de vos campagnes. <b>Aucune régie n'est
        reliée aujourd'hui</b>, et aucune ne peut l'être depuis cette page : chacune exige une
        application validée par ses équipes, une démarche qui prend des semaines et qui se fait au
        nom de votre entreprise, pas au nôtre. Ce qui suit dit ce que chaque raccordement
        demandera, pour que vous puissiez commencer les démarches qui comptent pour vous.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {REGIES.map((r) => (
          <li key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{r.label}</span>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                non relié
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{r.exige}</p>
          </li>
        ))}
      </ul>

      {/* ---------- Suivi des campagnes ---------- */}
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <BarChart3 size={16} className="text-purple-300" />
        <span>Suivi de mes campagnes</span>
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        Cette place attend les chiffres de vos campagnes — dépense, impressions, clics, coût par
        acquisition, marge nette par produit — régie par régie. Elle restera vide tant qu'aucun
        compte n'est relié : afficher des chiffres inventés ou des exemples serait pire que le vide,
        puisque c'est sur eux qu'on décide de couper une campagne ou de la doubler.
      </p>
      <p className="mt-3 max-w-3xl rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-gray-400">
        En attendant, Nadia sait lire les chiffres que vous lui recopiez depuis le gestionnaire de
        la régie : donnez-lui la dépense, le nombre de ventes et le produit concerné, elle vous dira
        si la campagne gagne ou perd de l'argent, et à partir de quel coût par acquisition il faut
        l'arrêter.
      </p>
    </Layout>
  )
}
