import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Stripe } from '@stripe/stripe-js'
import { FileText, Download, CreditCard, Plus, Trash2 } from 'lucide-react'
import { api, downloadWithAuth } from '../lib/api'

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/**
 * Invoices, listed and downloaded from our own domain.
 *
 * The PDF is proxied by the API rather than linked to Stripe: a seller looking
 * for a receipt should never end up on a page that is not ours, and the link
 * Stripe hands out is public to anyone who has it.
 */
export function Invoices() {
  const [invoices, setInvoices] = useState<Awaited<ReturnType<typeof api.listInvoices>>['invoices']>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listInvoices()
      .then((d) => setInvoices(d.invoices))
      .catch(() => {
        // No customer yet, or billing off: an empty list is the right answer.
      })
  }, [])

  if (!invoices.length) return null

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileText size={18} className="text-purple-300" />
        <span>Mes factures</span>
      </h2>

      <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-gray-300">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</span>
            <span className="hidden text-gray-500 sm:inline">{inv.number ?? '—'}</span>
            <span className="font-semibold">{euros(inv.total)}</span>
            <button
              type="button"
              disabled={busy === inv.id}
              onClick={async () => {
                setBusy(inv.id)
                setError(null)
                try {
                  await downloadWithAuth(`/billing/invoices/${inv.id}/pdf`, `facture-${inv.number ?? inv.id}.pdf`)
                } catch {
                  setError('Téléchargement impossible pour le moment.')
                } finally {
                  setBusy(null)
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
            >
              <Download size={12} />
              <span>{busy === inv.id ? '…' : 'PDF'}</span>
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  )
}

/** The card form itself — mounted inside our page, filled inside Stripe's iframe. */
function AddCardForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!stripe || !elements) return
        setBusy(true)
        setError(null)

        const { error: err } = await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: `${window.location.origin}/abonnement` },
          // Only leave the page when the bank demands authentication.
          redirect: 'if_required',
        })

        if (err) {
          setError(err.message ?? "La carte n'a pas pu être enregistrée.")
          setBusy(false)
          return
        }
        setBusy(false)
        onDone()
      }}
      className="mt-4"
    >
      <PaymentElement />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <button
        disabled={!stripe || busy}
        className="btn-gradient mt-4 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {busy ? 'Enregistrement…' : 'Enregistrer la carte'}
      </button>
    </form>
  )
}

/** Registered cards, added and removed without leaving the site. */
export function PaymentMethods({ stripePromise }: { stripePromise: Promise<Stripe | null> | null }) {
  const [cards, setCards] = useState<Awaited<ReturnType<typeof api.listCards>>['cards']>([])
  const [setupSecret, setSetupSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { cards } = await api.listCards()
    setCards(cards)
  }

  useEffect(() => {
    load().catch(() => {
      // Nothing registered yet.
    })
  }, [])

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CreditCard size={18} className="text-purple-300" />
        <span>Moyens de paiement</span>
      </h2>

      {cards.length > 0 && (
        <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {cards.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="uppercase text-gray-300">{`${c.brand} •••• ${c.last4}`}</span>
              <span className="text-xs text-gray-500">
                {c.expMonth && c.expYear ? `expire ${String(c.expMonth).padStart(2, '0')}/${c.expYear}` : ''}
              </span>
              <button
                type="button"
                onClick={async () => {
                  setError(null)
                  try {
                    await api.deleteCard(c.id)
                    await load()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Suppression impossible')
                  }
                }}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
                title="Supprimer cette carte"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {setupSecret && stripePromise ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <Elements stripe={stripePromise} options={{ clientSecret: setupSecret, locale: 'fr' }}>
            <AddCardForm
              onDone={async () => {
                setSetupSecret(null)
                await load()
              }}
            />
          </Elements>
        </div>
      ) : (
        <button
          type="button"
          onClick={async () => {
            setError(null)
            try {
              const { clientSecret } = await api.createSetupIntent()
              setSetupSecret(clientSecret)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Ajout impossible')
            }
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
        >
          <Plus size={14} />
          <span>Ajouter une carte</span>
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  )
}
