import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, Radar, Search, Sparkles, Store, FileText, ShieldCheck, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Catalogue = Awaited<ReturnType<typeof api.departmentCatalogue>>
type Profile = Catalogue['profiles'][number]
type Plan = Catalogue['plans'][number]
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

/**
 * Le gros badge néon des fiches (demande du 05/09/2026) : vert fluo
 * « EMBAUCHÉ » quand le chef est en poste, rouge néon « INACTIF » sinon.
 * L'état se lit de loin, sans déchiffrer une date d'échéance. Cliquable vers
 * la fiche du rayon quand elle existe — c'est là qu'on embauche ou réabonne.
 */
function BadgeEmbauche({ actif, to }: { actif: boolean; to?: string }) {
  const contenu = (
    <span
      className={
        (actif
          ? 'border-emerald-400/70 bg-emerald-400/10 text-emerald-300'
          : 'border-red-500/70 bg-red-500/10 text-red-400') +
        ' flex w-full items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-black uppercase tracking-widest'
      }
      style={
        actif
          ? {
              textShadow: '0 0 8px rgba(52,211,153,0.9)',
              boxShadow: '0 0 14px rgba(52,211,153,0.45), inset 0 0 10px rgba(52,211,153,0.12)',
            }
          : {
              textShadow: '0 0 8px rgba(248,113,113,0.9)',
              boxShadow: '0 0 14px rgba(239,68,68,0.4), inset 0 0 10px rgba(239,68,68,0.12)',
            }
      }
    >
      <span className={(actif ? 'bg-emerald-300' : 'bg-red-400') + ' h-2 w-2 animate-pulse rounded-full'} />
      <span>{actif ? 'Embauché' : 'Inactif'}</span>
    </span>
  )
  return to ? (
    <Link to={to} className="block">
      {contenu}
    </Link>
  ) : (
    contenu
  )
}

export default function Rayons() {
  const [catalogue, setCatalogue] = useState<Profile[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [hired, setHired] = useState<Hired[]>([])
  const [confirming, setConfirming] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  function load() {
    api
      .departmentCatalogue()
      .then((c) => {
        setCatalogue(c.profiles)
        setPlans(c.plans)
      })
      .catch(() => setError('Catalogue indisponible'))
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
                    {/*
                      Le rayon en titre, l'agent en dessous.

                      Le vendeur cherche « Électronique » quand il veut voir ses
                      montres connectées ; il ne se souvient pas que c'est Malik
                      qui s'en occupe. Le prénom garde toute son utilité au
                      moment de lui parler — pas au moment de le trouver.
                    */}
                    <p className="mt-1 font-semibold leading-tight">{d.label}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{`Tenu par ${d.agentName}`}</p>
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

                {/* L'échéance, dite clairement : un agent qui s'arrête sans
                    prévenir passe pour une panne. */}
                <p className={d.active ? 'mt-1 text-[11px] text-gray-500' : 'mt-1 text-[11px] text-amber-300'}>
                  {d.active
                    ? d.paidUntil
                      ? `Travaille jusqu'au ${new Date(d.paidUntil).toLocaleDateString('fr-FR')}`
                      : 'Actif'
                    : d.paidUntil
                      ? `${d.agentName} est à l'arrêt — abonnement expiré`
                      : `${d.agentName} attend sa formule pour se mettre au travail`}
                </p>

                <div className="mt-3 space-y-2">
                  <BadgeEmbauche actif={d.active} to={`/rayon/${d.id}`} />
                  {/* Sous l'INACTIF, le geste qui répare : la formule se
                      choisit sur la fiche du rayon. */}
                  {!d.active && (
                    <Link
                      to={`/rayon/${d.id}`}
                      className="btn-gradient block w-full rounded-lg px-3 py-2 text-center text-sm font-semibold"
                    >
                      Embaucher
                    </Link>
                  )}
                </div>
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
              <p className="mt-2 font-semibold leading-tight">{p.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{`${p.agentName} le tiendrait`}</p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-500">{p.focus}</p>

              <div className="mt-3 flex flex-wrap gap-1">
                {p.covers.slice(0, 4).map((c) => (
                  <span key={c} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                    {c}
                  </span>
                ))}
              </div>

              {p.hired ? (
                /* Le rayon est confié : l'état réel (payé ou non) vient de la
                   liste des rayons, et le badge mène à la fiche. */
                <div className="mt-3">
                  <BadgeEmbauche
                    actif={hired.find((h) => h.key === p.key)?.active ?? false}
                    to={(() => {
                      const h = hired.find((r) => r.key === p.key)
                      return h ? `/rayon/${h.id}` : undefined
                    })()}
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <BadgeEmbauche actif={false} />
                  <button
                    type="button"
                    onClick={() => setConfirming(p)}
                    className="btn-gradient w-full rounded-lg px-3 py-2 text-sm font-semibold"
                  >
                    Embaucher
                  </button>
                </div>
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

            {/* Pas d'essai gratuit — décision du 05/09/2026 : un chef
                travaille quand il est embauché. La formule se choisit sur la
                page du rayon, juste après. */}
            <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
              <p className="text-xs font-semibold text-emerald-300">
                {`${confirming.agentName} se met au travail dès sa formule choisie — à partir de 1 € la journée.`}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">Son salaire :</p>
              <ul className="mt-2 space-y-1">
                {plans.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2 text-[11px] text-gray-400">
                    <span className="font-semibold text-gray-200">
                      {`${p.label} — ${(p.amount / 100).toFixed(2)} €`}
                    </span>
                    <span>{p.pitch}</span>
                  </li>
                ))}
              </ul>
            </div>

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
