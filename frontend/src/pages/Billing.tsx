import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { DropCoin } from '../components/DropCoin'
import { Invoices, PaymentMethods } from '../components/BillingSections'

/**
 * Le portefeuille en drops — la page « Mes crédits ».
 *
 * Une seule monnaie (07/09/2026) : les drops. Le vendeur voit son solde et sa
 * valeur en euros, recharge, lit le relevé de chaque mouvement, et retrouve en
 * bas la grille tarifaire complète — ce que chaque action coûte, en drops et en
 * monnaie réelle. Plus d'abonnement, plus de location : on paie ce qu'on consomme.
 */

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

type Plans = Awaited<ReturnType<typeof api.listPlans>>
type Billing = Awaited<ReturnType<typeof api.myBilling>>
type Mouvement = Awaited<ReturnType<typeof api.walletTransactions>>['mouvements'][number]

const euros = (montant: number) => `${montant.toFixed(2).replace('.', ',')} €`
const dollars = (montant: number) => `$${montant.toFixed(2)}`
const nombre = (n: number) => n.toLocaleString('fr-FR')

/**
 * L'ordre et les libellés de la grille tarifaire. Les clés sont celles de
 * `tarifs.ts` côté serveur ; ce qui n'est pas listé ici est ignoré, pour qu'un
 * nouveau tarif technique n'apparaisse pas sans libellé.
 */
const ACTIONS: Array<{ cle: string; label: string; detail: string }> = [
  { cle: 'import', label: 'Importer une annonce', detail: 'Scraper une fiche + la réécrire par l’IA' },
  { cle: 'importLot', label: 'Importer en lot (par annonce)', detail: 'Réécriture groupée, moitié prix' },
  { cle: 'reecriture', label: 'Réécrire une annonce', detail: 'Reprendre titre, description, attributs' },
  { cle: 'analyse', label: 'Analyse de marché (par produit)', detail: 'Recherche web + prix constatés' },
  { cle: 'image', label: 'Générer une image', detail: 'Une mise en situation du produit' },
  { cle: 'pub', label: 'Créer une publicité', detail: 'Accroche rédigée + visuel composé' },
  { cle: 'questionComptoir', label: 'Question à un agent de comptoir', detail: 'Hotline, SAV, commercial…' },
  { cle: 'questionChef', label: 'Question à un chef de rayon', detail: 'Avocat, comptable, chef de secteur…' },
  { cle: 'conseilProduit', label: 'Conseil produit approfondi', detail: 'Un chef fouille fournisseurs et réseaux' },
  { cle: 'autoModePassage', label: 'AUTO-MODE (un passage de rayon)', detail: 'Analyse + 10 produits gagnants, toutes les 12 h' },
  { cle: 'autoShipperImport', label: 'AUTO-SHIPPER (une annonce)', detail: 'Import + publication automatiques' },
]

export default function BillingPage() {
  const [plans, setPlans] = useState<Plans | null>(null)
  const [billing, setBilling] = useState<Billing | null>(null)
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [suite, setSuite] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')

  const load = useCallback(async () => {
    const [p, b, releve] = await Promise.all([api.listPlans(), api.myBilling(), api.walletTransactions()])
    setPlans(p)
    setBilling(b)
    setMouvements(releve.mouvements)
    setSuite(releve.suite)
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Chargement impossible'))
  }, [load])

  // Retour de paiement : la vérité est demandée à Stripe plutôt que déduite de
  // l'URL, et les drops sont crédités ici même si le webhook a échoué.
  const confirmer = useCallback(
    async (id: string) => {
      try {
        const res = await api.confirmPayment(id)
        setConfirmation(
          res.granted
            ? `Recharge reçue. ${nombre(res.credits ?? 0)} drops ajoutés à votre portefeuille.`
            : "Paiement non abouti — rien n'a été débité.",
        )
        if (res.granted) await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Confirmation impossible')
      }
    },
    [load],
  )

  useEffect(() => {
    if (sessionId) confirmer(sessionId)
  }, [sessionId, confirmer])

  async function recharger(planId: string) {
    setBusy(planId)
    setError(null)
    try {
      const { clientSecret } = await api.startCheckout(planId)
      setClientSecret(clientSecret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paiement indisponible')
      setBusy(null)
    }
  }

  async function voirPlus() {
    if (!suite) return
    const releve = await api.walletTransactions(suite)
    setMouvements((m) => [...m, ...releve.mouvements])
    setSuite(releve.suite)
  }

  const euroParDrop = billing?.euroParDrop ?? plans?.euroParDrop ?? 0.01
  const usdParDrop = plans?.usdParDrop ?? 0.011
  const solde = billing?.credits ?? 0

  return (
    <Layout>
      <h1 className="text-2xl font-bold">Mes crédits</h1>

      {confirmation && (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {confirmation}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {/* Le solde, en drops et en euros. */}
      <div className="mt-6 flex flex-wrap items-center gap-5 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-purple-500/5 p-6">
        <DropCoin size={64} />
        <div>
          <p className="text-3xl font-bold">
            {nombre(solde)} <span className="text-amber-300">drops</span>
          </p>
          <p className="mt-0.5 text-sm text-gray-400">
            {`Valeur ≈ ${euros(solde * euroParDrop)} · 1 drop = ${euros(euroParDrop)}`}
          </p>
        </div>
        <a
          href="#recharger"
          className="btn-gradient ml-auto rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Recharger
        </a>
      </div>

      {plans && !plans.enabled && (
        <p className="mt-4 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          Les paiements ne sont pas encore activés sur ce serveur.
        </p>
      )}

      {/* Paiement, dans la page. Stripe monte son formulaire en iframe : le
          numéro de carte ne transite jamais par notre code ni nos serveurs. */}
      {clientSecret && (
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Paiement sécurisé</h2>
            <button
              type="button"
              onClick={() => {
                setClientSecret(null)
                setBusy(null)
              }}
              className="text-xs text-gray-400 hover:text-white"
            >
              Annuler
            </button>
          </div>
          {stripePromise ? (
            <div className="mt-4">
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          ) : (
            <p className="mt-3 text-sm text-orange-200">
              Clé publique Stripe absente : ajoutez VITE_STRIPE_PUBLISHABLE_KEY dans Vercel.
            </p>
          )}
        </section>
      )}

      {/* Recharger */}
      <h2 id="recharger" className="mt-10 text-lg font-bold">
        Recharger mon portefeuille
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        Sans abonnement ni engagement. Vos drops n'expirent pas. 1 drop = {euros(euroParDrop)}.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans?.packs.map((pack) => (
          <div key={pack.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2">
              <DropCoin size={22} />
              <p className="text-xl font-bold">{nombre(pack.drops)} drops</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-amber-200">{euros(pack.amount / 100)}</p>
            <button
              type="button"
              onClick={() => recharger(pack.id)}
              disabled={!plans.enabled || busy !== null}
              className="btn-gradient mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {busy === pack.id ? 'Ouverture…' : 'Recharger'}
            </button>
          </div>
        ))}
      </div>

      {/* Le relevé du portefeuille : chaque mouvement, en direct. */}
      <h2 className="mt-10 text-lg font-bold">Relevé du compte</h2>
      <p className="mt-1 text-sm text-gray-400">
        Chaque mouvement de votre portefeuille : rechargements et actions facturées.
      </p>

      {mouvements.length === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
          Aucun mouvement pour l'instant. Vos rechargements et vos actions apparaîtront ici.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="divide-y divide-white/5">
            {mouvements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-gray-500">
                  {new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>
                <span className="flex-1 truncate text-gray-200">{m.motif}</span>
                <span
                  className={`w-24 shrink-0 text-right font-semibold tabular-nums ${
                    m.delta >= 0 ? 'text-emerald-300' : 'text-gray-300'
                  }`}
                >
                  {`${m.delta >= 0 ? '+' : '−'}${nombre(Math.abs(m.delta))}`}
                </span>
                <span className="hidden w-20 shrink-0 text-right text-xs text-gray-500 tabular-nums sm:block">
                  {nombre(m.balance)}
                </span>
              </div>
            ))}
          </div>
          {suite && (
            <button
              type="button"
              onClick={voirPlus}
              className="w-full border-t border-white/5 px-4 py-2.5 text-xs text-gray-400 hover:bg-white/5 hover:text-white"
            >
              Voir plus
            </button>
          )}
        </div>
      )}

      {/* L'explication de la monnaie, puis la grille complète. */}
      <section className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <DropCoin size={96} className="shrink-0" />
          <div>
            <h2 className="text-xl font-bold">Les drops, la monnaie de DropShipper</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-300">
              Un drop est notre monnaie interne. Elle rend chaque geste clair : vous ne payez ni
              abonnement ni location d'agent, seulement ce que vous consommez. Un drop vaut{' '}
              <b>{euros(euroParDrop)}</b> (≈ {dollars(usdParDrop)}), et il ne périme jamais. Vous
              accédez à tout — chefs de rayon, avocat, comptable, pilotes automatiques — et chaque
              action indique son prix en drops avant que vous ne cliquiez.
            </p>
          </div>
        </div>

        <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Ce que coûte chaque action
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4 font-medium">Action</th>
                <th className="py-2 px-3 text-right font-medium">Drops</th>
                <th className="py-2 px-3 text-right font-medium">Euros</th>
                <th className="py-2 pl-3 text-right font-medium">Dollars US</th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.filter((a) => plans?.tarifs?.[a.cle] !== undefined).map((a) => {
                const drops = plans!.tarifs[a.cle]
                return (
                  <tr key={a.cle} className="border-t border-white/5">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-gray-100">{a.label}</p>
                      <p className="text-xs text-gray-500">{a.detail}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-200">
                        <DropCoin size={14} />
                        {nombre(drops)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">
                      {euros(drops * euroParDrop)}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-gray-400">
                      {dollars(drops * usdParDrop)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Publier une annonce sur vos destinations est <b>gratuit</b>, autant de fois que vous
          voulez : seul le travail de l'IA est facturé.
        </p>
      </section>

      <PaymentMethods stripePromise={stripePromise} />
      <Invoices />
    </Layout>
  )
}
