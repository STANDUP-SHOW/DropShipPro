import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Sparkles, Truck, Share2, Store, Globe, User, MessagesSquare, Search, TrendingUp } from 'lucide-react'
import { Layout } from '../components/Layout'
import { RecommendedProducts } from '../components/RecommendedProducts'
import { OpportunityList } from '../components/OpportunityList'
import { SignalList } from '../components/SignalList'
import { ReportList } from '../components/ReportList'
import { BoutonAutoMode } from '../components/BoutonAutoMode'
import { DepartmentChat } from '../components/DepartmentChat'
import { ProductInfo } from '../components/ProductInfo'
import { DepartmentSales } from '../components/DepartmentSales'
import { api } from '../lib/api'

/**
 * Clé publiable — publique par nature, elle identifie le compte et ne permet
 * rien seule. Chargée hors du composant pour qu'un rendu ne recharge pas
 * Stripe.js.
 */
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

type Department = Awaited<ReturnType<typeof api.listDepartments>>[number]

const TABS = [
  { id: 'ADVICE' as const, label: 'Produits gagnants', icon: Sparkles },
  { id: 'INFO' as const, label: 'Info sur un produit', icon: Search },
  { id: 'SUPPLIERS' as const, label: 'Fournisseurs', icon: Truck },
  { id: 'SOCIAL' as const, label: 'Réseaux sociaux', icon: Share2 },
  { id: 'MARKET' as const, label: 'Places de marché', icon: Store },
  { id: 'SALES' as const, label: 'Ses ventes', icon: TrendingUp },
  { id: 'CHAT' as const, label: 'Messagerie', icon: MessagesSquare },
]

/**
 * Le bureau d'un chef de rayon.
 *
 * Cinq pages : ce qu'il conseille aujourd'hui, les trois sources d'où ça vient,
 * et de quoi lui parler. La première est celle qu'on ouvre le matin ; les autres
 * servent quand on veut comprendre pourquoi il propose ça.
 */
export default function Rayon() {
  const { id = '' } = useParams()
  const [department, setDepartment] = useState<Department | null>(null)
  // Le rayon s'ouvre sur son chef : le tchat, avec « Mes analyses » listées
  // dessous (05/09/2026) — les autres onglets restent à un clic.
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('CHAT')
  const [scope, setScope] = useState<'ALL' | 'PERSONAL'>('ALL')
  const [view, setView] = useState<'LIVE' | 'REPORTS'>('LIVE')
  const [missing, setMissing] = useState(false)
  const [plans, setPlans] = useState<Array<{ id: string; label: string; amount: number; pitch: string }>>([])
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  /** L'état de l'enquête lancée à la main : 'en-cours', ou le résultat dit. */
  const [enquete, setEnquete] = useState<string | null>(null)

  function chargerRayon() {
    api
      .listDepartments()
      .then((list) => {
        const found = list.find((d) => d.id === id)
        if (found) setDepartment(found)
        else setMissing(true)
      })
      .catch(() => setMissing(true))
  }

  useEffect(() => {
    chargerRayon()
    api
      .departmentCatalogue()
      .then((c) => setPlans(c.plans))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /*
   * Le retour de Stripe atterrit ICI, pas sur la page Facturation : le
   * paiement d'un chef de rayon renvoie vers son rayon. Sans cette
   * confirmation, l'argent était encaissé et l'abonnement jamais prolongé —
   * « je paie, il reste à l'arrêt », constaté le 04/09/2026.
   */
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id')
    if (!sessionId) return
    api
      .confirmPayment(sessionId)
      .then((res: { granted?: boolean; agent?: string; paidUntil?: string }) => {
        if (res.granted) {
          setConfirmation(
            `Paiement reçu : ${res.agent ?? 'le chef de rayon'} travaille${res.paidUntil ? ` jusqu'au ${new Date(res.paidUntil).toLocaleDateString('fr-FR')}` : ''}.`,
          )
          chargerRayon()
        }
      })
      .catch((err) => setPayError(err instanceof Error ? err.message : 'Paiement non confirmé — contactez le support.'))
      .finally(() => {
        // Le paramètre ne doit pas survivre : un rechargement reconfirmerait.
        window.history.replaceState({}, '', window.location.pathname)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * Prolonger le rayon.
   *
   * Le paiement se fait dans l'application, comme le reste : le vendeur revient
   * sur son rayon, pas sur une page de compte où il faudrait le retrouver.
   */
  async function renew(planId: string) {
    if (!department) return
    setPaying(true)
    setPayError(null)
    try {
      const { clientSecret: secret } = await api.startCheckout(`agent:${planId}`, department.id)
      // Le formulaire se monte plus bas : pas de redirection, le vendeur reste
      // sur le rayon qu'il est en train de prolonger.
      setClientSecret(secret)
    } catch (e) {
      setPayError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  if (missing) {
    return (
      <Layout>
        <p className="text-sm text-gray-400">Ce rayon n'existe pas ou n'est plus confié.</p>
        <Link to="/rayons" className="mt-3 inline-block text-sm underline">
          Retour aux chefs de rayon
        </Link>
      </Layout>
    )
  }

  if (!department) {
    return (
      <Layout>
        <p className="text-sm text-gray-500">Chargement…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <Link
        to="/rayons"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft size={13} />
        <span>Chefs de rayon</span>
      </Link>

      <h1 className="mt-3 flex items-center gap-3 text-2xl font-bold">
        <span className="text-3xl">{department.emoji}</span>
        <span>{`${department.label} — ${department.agentName}`}</span>
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-300">
          {`${department.agentName} est votre chef de rayon ${department.label.toLowerCase()}.`}
        </p>
        <button
          type="button"
          onClick={() => setTab('CHAT')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/20"
        >
          <MessagesSquare size={13} />
          <span>{`Discuter avec ${department.agentName}`}</span>
        </button>
      </div>

      <p className="mt-2 max-w-3xl text-sm text-gray-400">{department.focus}</p>

      {confirmation ? (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {confirmation}
        </p>
      ) : null}

      {/* L'état de l'abonnement, dit avant le travail : un agent arrêté qui
          affiche une page vide passe pour une panne. */}
      <div
        className={
          department.active
            ? 'mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3'
            : 'mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3'
        }
      >
        <p className="text-xs text-gray-300">
          {department.active
            ? department.paidUntil
              ? `${department.agentName} travaille jusqu'au ${new Date(department.paidUntil).toLocaleDateString('fr-FR')}.`
              : `${department.agentName} est en poste.`
            : department.paidUntil
              ? `${department.agentName} est à l'arrêt : son abonnement a expiré. Ses trouvailles et vos échanges sont conservés.`
              : `${department.agentName} n'est pas encore en poste : choisissez sa formule pour qu'il se mette au travail.`}
        </p>

        {department.active ? (
          <button
            type="button"
            disabled={enquete === 'en-cours'}
            onClick={() => {
              setEnquete('en-cours')
              api
                .lancerEnquete(department.id)
                .then((r) =>
                  setEnquete(
                    r.raison ??
                      (r.deposees
                        ? `${r.deposees} produit(s) gagnant(s) déposé(s) — regardez l'onglet des trouvailles.`
                        : `Rien de neuf : les ${r.relevees} produits du flux étaient déjà repérés.`),
                  ),
                )
                .catch((err) => setEnquete(err instanceof Error ? err.message : "L'enquête a échoué."))
            }}
            className="rounded-lg border border-purple-400/40 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/10 disabled:opacity-50"
          >
            {enquete === 'en-cours' ? 'Enquête en cours…' : "Lancer l'enquête du jour"}
          </button>
        ) : null}
        {enquete && enquete !== 'en-cours' ? (
          <span className="max-w-xs text-xs leading-snug text-emerald-200">{enquete}</span>
        ) : null}

        {/* L'interrupteur AUTO-MODE : analyse de marché + dix gagnants toutes
            les douze heures, compris dans le salaire. Le refus (rayon pas en
            poste) est affiché par le bouton lui-même. */}
        <BoutonAutoMode
          actif={department.autoMode}
          onBascule={async (enabled) => {
            const r = await api.setRayonAuto(department.id, enabled)
            setDepartment((d) => (d ? { ...d, autoMode: r.autoMode } : d))
          }}
        />

        <div className="ml-auto flex flex-wrap gap-2">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => renew(p.id)}
              disabled={paying}
              title={p.pitch}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
            >
              {`${p.label} — ${(p.amount / 100).toFixed(2)} €`}
            </button>
          ))}
        </div>

        {payError && <p className="w-full text-xs text-red-400">{payError}</p>}
      </div>

      {clientSecret && (
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

          {/* Stripe monte son formulaire dans une iframe : le numéro de carte ne
              passe ni par notre code ni par nos serveurs. */}
          {stripePromise ? (
            <div className="mt-4">
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          ) : (
            <p className="mt-3 text-sm text-red-400">
              Le paiement est momentanément indisponible.
            </p>
          )}
        </section>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold'
                  : 'inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:bg-white/5'
              }
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Le filtre global/personnel n'a de sens que sur les sources : la liste
          conseillée est par nature tournée vers ce qu'on ne vend pas encore. */}
      {tab !== 'ADVICE' && tab !== 'CHAT' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('LIVE')}
            className={
              view === 'LIVE'
                ? 'rounded-full bg-white/15 px-3 py-1 text-xs font-semibold'
                : 'rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            Trouvailles
          </button>
          <button
            type="button"
            onClick={() => setView('REPORTS')}
            className={
              view === 'REPORTS'
                ? 'rounded-full bg-white/15 px-3 py-1 text-xs font-semibold'
                : 'rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            Rapports du jour
          </button>

          <span className="mx-1 h-4 w-px bg-white/10" />

          <button
            type="button"
            onClick={() => setScope('ALL')}
            className={
              scope === 'ALL'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-300'
                : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            <Globe size={13} />
            <span>Veille globale</span>
          </button>
          <button
            type="button"
            onClick={() => setScope('PERSONAL')}
            className={
              scope === 'PERSONAL'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-300'
                : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            <User size={13} />
            <span>Ma veille</span>
          </button>
        </div>
      )}

      {tab === 'ADVICE' && <RecommendedProducts department={department.id} />}
      {tab === 'SALES' && (
        <DepartmentSales departmentId={department.id} agentName={department.agentName} />
      )}
      {tab === 'INFO' && (
        <ProductInfo departmentId={department.id} agentName={department.agentName} />
      )}
      {tab === 'CHAT' && (
        <>
          <DepartmentChat departmentId={department.id} agentName={department.agentName} emoji={department.emoji} role={department.label} />

          {/* Les analyses de l'AUTO-MODE, sous la conversation : la même ligne
              que la page Analyses de marché lit — une écriture, deux vitrines. */}
          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-bold">
              <TrendingUp size={16} className="text-purple-300" />
              <span>Mes analyses</span>
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {`Les analyses de marché rédigées par ${department.agentName} — en IA AUTO-MODE, une par demi-journée.`}
            </p>
            <ReportList section="MARKET" department={department.id} />
          </section>
        </>
      )}

      {tab === 'SUPPLIERS' &&
        (view === 'REPORTS' ? (
          <ReportList section="SUPPLIERS" department={department.id} />
        ) : (
          <OpportunityList scope={scope} department={department.id} />
        ))}
      {tab === 'SOCIAL' &&
        (view === 'REPORTS' ? (
          <ReportList section="SOCIAL" department={department.id} />
        ) : (
          <SignalList kind="SOCIAL" scope={scope} department={department.id} />
        ))}
      {tab === 'MARKET' &&
        (view === 'REPORTS' ? (
          <ReportList section="MARKET" department={department.id} />
        ) : (
          <SignalList kind="MARKET" scope={scope} department={department.id} />
        ))}
    </Layout>
  )
}
