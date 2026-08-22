import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Coins, Check, Infinity as InfinityIcon, ExternalLink } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Plans = Awaited<ReturnType<typeof api.listPlans>>
type Billing = Awaited<ReturnType<typeof api.myBilling>>

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/** Price per listing — the number that actually lets someone compare the packs. */
function unitPrice(amount: number, credits: number) {
  return `${(amount / 100 / credits).toFixed(3).replace('.', ',')} € / annonce`
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plans | null>(null)
  const [billing, setBilling] = useState<Billing | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()

  const paiement = params.get('paiement')

  async function load() {
    const [p, b] = await Promise.all([api.listPlans(), api.myBilling()])
    setPlans(p)
    setBilling(b)
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Chargement impossible'))
  }, [])

  async function buy(planId: string) {
    setBusy(planId)
    setError(null)
    try {
      const { url } = await api.startCheckout(planId)
      // Stripe hosts the payment page: we never see a card number.
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paiement indisponible')
      setBusy(null)
    }
  }

  async function openPortal() {
    setBusy('portal')
    try {
      const { url } = await api.openBillingPortal()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portail indisponible')
      setBusy(null)
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold">Mon compte</h1>

      {paiement === 'ok' && (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Paiement reçu. Vos annonces sont créditées — si le solde ci-dessous n'a pas encore bougé,
          rechargez la page dans quelques secondes.
        </p>
      )}
      {paiement === 'annule' && (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
          Paiement annulé. Rien n'a été débité.
        </p>
      )}

      {/* Solde */}
      <div className="mt-6 rounded-2xl border border-purple-400/30 bg-purple-500/5 p-5">
        {billing?.premium ? (
          <div className="flex items-center gap-3">
            <InfinityIcon className="text-purple-300" size={28} />
            <div>
              <p className="text-lg font-bold">Premium — annonces illimitées</p>
              <p className="text-xs text-gray-400">
                {billing.premiumUntil
                  ? `Renouvellement le ${new Date(billing.premiumUntil).toLocaleDateString('fr-FR')}`
                  : 'Abonnement actif'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Coins className="text-purple-300" size={28} />
            <div>
              <p className="text-lg font-bold">
                {`${billing?.credits ?? 0} annonce(s) disponible(s)`}
              </p>
              <p className="text-xs text-gray-400">
                Une annonce est décomptée à l'import. La publication est offerte, sur toutes les
                destinations, autant de fois que vous voulez.
              </p>
            </div>
          </div>
        )}

        {billing && billing.payments.length > 0 && (
          <button
            type="button"
            onClick={openPortal}
            disabled={busy === 'portal'}
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-purple-300 hover:underline"
          >
            <span>Factures, moyen de paiement, résiliation</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {plans && !plans.enabled && (
        <p className="mt-4 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          Les paiements ne sont pas encore activés sur ce serveur.
        </p>
      )}

      {/* Packs */}
      <h2 className="mt-10 text-lg font-bold">Recharger</h2>
      <p className="mt-1 text-sm text-gray-400">
        Sans abonnement ni engagement. Vos annonces n'expirent pas.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans?.packs.map((pack) => (
          <div key={pack.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
            <p className="text-2xl font-bold">{euros(pack.amount)}</p>
            <p className="mt-1 font-semibold text-purple-200">{pack.label}</p>
            <p className="mt-0.5 text-xs text-gray-500">{unitPrice(pack.amount, pack.credits)}</p>
            <button
              type="button"
              onClick={() => buy(pack.id)}
              disabled={!plans.enabled || busy !== null}
              className="btn-gradient mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {busy === pack.id ? 'Ouverture…' : 'Acheter'}
            </button>
          </div>
        ))}
      </div>

      {/* Premium */}
      {plans && (
        <div className="mt-8 rounded-2xl border border-purple-400/40 bg-gradient-to-br from-purple-500/15 to-pink-500/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{plans.premium.label}</h2>
              <p className="mt-1 text-3xl font-bold">
                {`${euros(plans.premium.amount)} / mois`}
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <Check size={15} className="text-emerald-400" />
                  <span>Imports illimités, sans décompte</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={15} className="text-emerald-400" />
                  <span>Publication en lot sur toutes les destinations</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={15} className="text-emerald-400" />
                  <span>Résiliable à tout moment, actif jusqu'à la fin du mois payé</span>
                </li>
              </ul>
              {/* Announced up front rather than discovered mid-month. */}
              <p className="mt-3 text-xs text-gray-500">
                {`Usage loyal : ${plans.premium.monthlyFairUse.toLocaleString('fr-FR')} imports par mois. Au-delà, nous vous contactons avant toute limitation.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => buy(plans.premium.id)}
              disabled={!plans.enabled || busy !== null || billing?.premium}
              className="btn-gradient shrink-0 rounded-xl px-6 py-3 font-semibold disabled:opacity-40"
            >
              {billing?.premium ? 'Déjà abonné' : busy === plans.premium.id ? 'Ouverture…' : 'M’abonner'}
            </button>
          </div>
        </div>
      )}

      {/* Historique */}
      {billing && billing.payments.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-bold">Historique</h2>
          <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {billing.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-gray-300">
                  {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                </span>
                <span className="text-gray-400">
                  {p.credits > 0 ? `${p.credits} annonces` : 'Abonnement Premium'}
                </span>
                <span className="font-semibold">{euros(p.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
