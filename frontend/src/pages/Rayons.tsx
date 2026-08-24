import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, Radar, Search, Sparkles, Store, FileText, ShieldCheck, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Profile = Awaited<ReturnType<typeof api.departmentCatalogue>>[number]
type Hired = Awaited<ReturnType<typeof api.listDepartments>>[number]

/** Ce que fait un chef de rayon, dit une fois, en haut de page. */
const MISSIONS = [
  {
    icon: Search,
    title: 'Il explore les plateformes fournisseurs',
    text: "Temu, AliExpress, DHgate, Banggood, JoyBuy. Il cherche les produits qui se vendent le plus, avec des critères précis : entrepôt européen, délai de livraison, garantie, prix d'achat, volume de ventes déjà réalisées, tendance à la hausse.",
  },
  {
    icon: Radar,
    title: 'Il explore les réseaux sociaux',
    text: "Campagnes publicitaires qui tournent, formats qui marchent, retours et commentaires, produits qui percent sur TikTok Shop. Il relève ce qui attire les acheteurs avant que le marché ne sature.",
  },
  {
    icon: Store,
    title: 'Il explore vos places de marché',
    text: "Ce qui s'y vend, à quel prix, avec quelle concurrence. C'est ce qui transforme un prix d'achat en marge réelle plutôt qu'en estimation.",
  },
  {
    icon: FileText,
    title: 'Il vous remet un rapport chaque jour',
    text: "Un rapport par source et par secteur, archivé. Vous relisez celui d'il y a trois semaines et vous comparez.",
  },
  {
    icon: Sparkles,
    title: 'Et une liste de produits gagnants, prêts à publier',
    text: "Chaque jour : prix d'achat, prix de vente conseillé, marge, concurrence constatée, et sur quelles places de marché le vendre. Il ne vous reste qu'à valider.",
  },
  {
    icon: ShieldCheck,
    title: 'Il propose, vous décidez',
    text: "Rien n'est importé ni publié sans votre geste — sauf si vous confiez cela au pilote automatique, qui a besoin d'au moins un chef de rayon pour travailler.",
  },
]

export default function Rayons() {
  const [catalogue, setCatalogue] = useState<Profile[]>([])
  const [hired, setHired] = useState<Hired[]>([])
  const [confirming, setConfirming] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  function load() {
    api.departmentCatalogue().then(setCatalogue).catch(() => setError('Catalogue indisponible'))
    api.listDepartments().then(setHired).catch(() => undefined)
  }

  useEffect(load, [])

  async function hire(profile: Profile) {
    setBusy(true)
    setError(null)
    try {
      const created = await api.hireDepartment(profile.key)
      setConfirming(null)
      load()
      navigate(`/rayon/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function release(d: Hired) {
    if (
      !window.confirm(
        `Rendre le rayon ${d.label} ? ${d.agentName} ne déposera plus rien, mais ses trouvailles restent dans votre veille.`,
      )
    )
      return
    await api.releaseDepartment(d.id).catch((e) => setError((e as Error).message))
    load()
  }

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <UserPlus size={22} className="text-emerald-400" />
        <span>Chefs de rayon IA</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Confiez un rayon à un agent. Il explore les fournisseurs, les réseaux sociaux et les places
        de marché, vous remet un rapport chaque jour, et vous propose une liste de produits gagnants
        prêts à publier.
      </p>

      <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="font-bold">Ce que fait un chef de rayon</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {MISSIONS.map((m) => {
            const Icon = m.icon
            return (
              <li key={m.title} className="flex gap-3">
                <span className="mt-0.5 shrink-0 rounded-lg bg-white/10 p-2 text-emerald-400">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{m.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{m.text}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {hired.length > 0 && (
        <section className="mt-6">
          <h2 className="font-bold">Vos rayons</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hired.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/rayon/${d.id}`} className="min-w-0 flex-1">
                    <p className="text-2xl">{d.emoji}</p>
                    <p className="mt-1 font-semibold">{d.agentName}</p>
                    <p className="text-xs text-gray-400">{d.label}</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => release(d)}
                    title="Rendre ce rayon"
                    className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-500 hover:bg-white/5 hover:text-red-400"
                  >
                    <X size={13} />
                  </button>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {d.pending > 0
                    ? `${d.pending} produit(s) en attente de votre avis`
                    : 'Rien de nouveau à arbitrer'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-bold">Intégrer un chef de rayon</h2>
        <p className="mt-1 text-xs text-gray-500">
          Un agent par secteur. Chacun connaît ses fournisseurs, ses saisons et ses pièges.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalogue.map((p) => (
            <li
              key={p.key}
              className={
                p.hired
                  ? 'rounded-xl border border-white/10 bg-black/20 p-4 opacity-50'
                  : 'flex flex-col rounded-xl border border-white/10 bg-white/5 p-4'
              }
            >
              <p className="text-3xl">{p.emoji}</p>
              <p className="mt-2 font-semibold">{p.agentName}</p>
              <p className="text-xs text-gray-400">{p.label}</p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-500">{p.focus}</p>

              <div className="mt-3 flex flex-wrap gap-1">
                {p.covers.slice(0, 4).map((c) => (
                  <span key={c} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                    {c}
                  </span>
                ))}
              </div>

              {p.hired ? (
                <p className="mt-3 text-center text-xs text-emerald-400">Déjà en poste</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(p)}
                  className="btn-gradient mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold"
                >
                  Ajouter cet agent
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12131a] p-6">
            <p className="text-4xl">{confirming.emoji}</p>
            <h3 className="mt-3 text-lg font-bold">
              {`Confier le rayon ${confirming.label} à ${confirming.agentName} ?`}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">{confirming.focus}</p>
            <p className="mt-3 text-xs text-gray-500">
              {`Un onglet « ${confirming.label} » sera créé. ${confirming.agentName} y déposera ses trouvailles ; vous gardez la main sur tout ce qui est importé ou publié.`}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => hire(confirming)}
                disabled={busy}
                className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {busy ? 'Création…' : 'Oui, intégrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
