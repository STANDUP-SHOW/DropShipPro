import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Stripe } from '@stripe/stripe-js'
import { FileText, Download, Printer, CreditCard, Plus, Trash2 } from 'lucide-react'
import { api, downloadWithAuth } from '../lib/api'
import { useAuth } from '../lib/auth'

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

/** Un rechargement, tel que « Mes crédits » le connaît. */
interface Paiement {
  id: string
  planId: string
  amount: number
  credits: number
  createdAt: string
}

/**
 * Un reçu imprimable au nom de DropShipper IA, ouvert dans une fenêtre à part.
 *
 * Il sert quand aucune facture Stripe n'est encore disponible : chaque recharge
 * a ainsi toujours un justificatif « au nom de DropShipper IA » (demandé le
 * 10/09/2026). La facture Stripe, quand elle existe, reste la pièce de
 * référence — elle porte les mentions légales réglées dans le compte Stripe.
 */
function imprimerRecu(p: Paiement, email?: string | null) {
  const num = `DSI-${new Date(p.createdAt).getFullYear()}-${p.id.slice(-6).toUpperCase()}`
  const date = new Date(p.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const ttc = euros(p.amount)
  const drops = p.credits.toLocaleString('fr-FR')
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) return
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${num}</title>
    <style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:40px;background:#fff}
      .wrap{max-width:620px;margin:0 auto}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #ec4899;padding-bottom:16px}
      .brand{font-size:22px;font-weight:800;background:linear-gradient(120deg,#f472b6,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}
      .brand small{display:block;font-size:11px;font-weight:600;color:#888;margin-top:2px}
      h1{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:0}
      .meta{font-size:12px;color:#555;text-align:right;line-height:1.6}
      .to{margin:26px 0;font-size:13px;color:#333}
      .to b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin-bottom:3px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#999;border-bottom:1px solid #ddd;padding:8px 0}
      td{padding:12px 0;border-bottom:1px solid #f0f0f0}
      .r{text-align:right}
      .tot{display:flex;justify-content:flex-end;gap:40px;margin-top:16px;font-size:15px;font-weight:700}
      .foot{margin-top:40px;font-size:11px;color:#999;line-height:1.6;border-top:1px solid #eee;padding-top:14px}
      @media print{body{padding:0}}
    </style></head><body><div class="wrap">
    <div class="head">
      <div><div class="brand">DropShipper IA<small>www.drop-shipper.fr</small></div></div>
      <div><h1>Reçu de paiement</h1><div class="meta">N° ${num}<br>${date}</div></div>
    </div>
    <div class="to"><b>Client</b>${email ?? '—'}</div>
    <table><thead><tr><th>Description</th><th class="r">Montant TTC</th></tr></thead>
    <tbody><tr><td>Rechargement du portefeuille — ${drops} drops</td><td class="r">${ttc}</td></tr></tbody></table>
    <div class="tot"><span>Total payé TTC</span><span>${ttc}</span></div>
    <div class="foot">Payé par carte bancaire. Ce reçu vaut justificatif de paiement.<br>
    DropShipper IA — les mentions légales complètes (SIRET, TVA) figurent sur la facture officielle.</div>
    </div></body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

/**
 * Mes factures — les rechargements du vendeur, au nom de DropShipper IA.
 *
 * Deux sources, dans cet ordre : les factures Stripe (le vrai PDF, servi par
 * notre domaine, jamais un lien Stripe public) ; à défaut, un reçu imprimable
 * bâti à partir de nos propres paiements, pour qu'AUCUNE recharge ne reste sans
 * justificatif. La section est toujours présente, même vide, pour se trouver.
 */
export function Invoices({ payments = [] }: { payments?: Paiement[] }) {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Awaited<ReturnType<typeof api.listInvoices>>['invoices']>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listInvoices()
      .then((d) => setInvoices(d.invoices))
      .catch(() => {
        // Pas encore de client Stripe, ou facturation coupée : on retombe sur
        // les reçus bâtis depuis nos paiements.
      })
  }, [])

  const email = (user as { email?: string } | null)?.email ?? null

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileText size={18} className="text-purple-300" />
        <span>Mes factures</span>
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        Un justificatif par rechargement, au nom de DropShipper IA.
      </p>

      {invoices.length ? (
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
      ) : payments.length ? (
        <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-gray-300">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</span>
              <span className="hidden text-gray-500 sm:inline">{`${p.credits.toLocaleString('fr-FR')} drops`}</span>
              <span className="font-semibold">{euros(p.amount)}</span>
              <button
                type="button"
                onClick={() => imprimerRecu(p, email)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <Printer size={12} />
                <span>Reçu</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
          Vos factures apparaîtront ici dès votre premier rechargement.
        </p>
      )}
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
          confirmParams: { return_url: `${window.location.origin}/credits` },
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
