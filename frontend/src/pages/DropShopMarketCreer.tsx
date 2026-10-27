import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { LogoDropShopEntete } from '../components/LogoDropShop'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ModeMarket, StudioBoutiques } from './CreerBoutique'

/**
 * DropShop Market — « Créer mon dropshop » (27/10/2026, demande de Max).
 *
 * La deuxième façon de vendre sur le Market (drop-shop.cloud/vendre) : créer
 * sa boutique IA directement, sans passer par DropShipper IA. Trois temps,
 * sans le menu de DropShipper :
 *
 * 1. un compte (email + mot de passe — le même compte que DropShipper, qui
 *    porte la boutique, ses commandes et sa clé Stripe) ;
 * 2. 9,90 € par Stripe, dans la page : crédités en drops qui couvrent
 *    exactement la création (500) et le Back Office (300), voir
 *    PACK_DROPSHOP_MARKET dans backend/src/services/tarifs.ts ;
 * 3. le studio DropShop de DropShipper, tel quel (`StudioBoutiques` en mode
 *    Market) : les boutiques sont créées au même endroit, et le bloc « Admin »
 *    apparaît une fois la boutique générée.
 */

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

const MARKET = 'https://drop-shop.cloud'
/** Ce que les 9,90 € créditent : le studio ne s'ouvre qu'une fois couvert. */
const DROPS_CREATION_MARKET = 800

export default function DropShopMarketCreer() {
  const { user, loading } = useAuth()

  return (
    <div className="min-h-screen text-gray-100">
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <a href={MARKET} className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white">
            <ArrowLeft size={15} />
            <img src="/marque/dropshop/logo.png" alt="DropShop Market" className="h-8 w-auto" />
          </a>
          <a href={`${MARKET}/vendre`} className="ml-auto rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/5">
            Vendre sur DropShop Market
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6">
        {loading ? (
          <p className="mt-10 text-center text-sm text-gray-400">Chargement…</p>
        ) : user ? (
          <Parcours />
        ) : (
          <Compte />
        )}
        <PubDropShipper />
      </main>
    </div>
  )
}

/* ---------- 1. Le compte ---------- */

function Compte() {
  const { login, register } = useAuth()
  const [nouveau, setNouveau] = useState(true)
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErreur(null)
    try {
      if (nouveau) await register(email.trim(), motDePasse)
      else await login(email.trim(), motDePasse)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Connexion impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <Offre />
      <form onSubmit={envoyer} className="cadre-dropshop rounded-3xl p-5">
        <h2 className="text-lg font-extrabold text-white">{nouveau ? 'Créez votre compte' : 'Connectez-vous'}</h2>
        <p className="mt-1 text-xs text-gray-400">Il porte votre boutique, ses commandes et votre back-office.</p>
        <label className="mt-4 block text-xs font-bold text-gray-300">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-violet-400/70" />
        </label>
        <label className="mt-3 block text-xs font-bold text-gray-300">
          Mot de passe
          <input type="password" required minLength={8} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete={nouveau ? 'new-password' : 'current-password'} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-violet-400/70" />
          <span className="mt-1 block font-normal text-gray-500">8 caractères au moins.</span>
        </label>
        {erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}
        <button type="submit" disabled={busy} className="btn-dropshop mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          <span>{nouveau ? 'Créer mon compte' : 'Me connecter'}</span>
        </button>
        <button type="button" onClick={() => setNouveau((v) => !v)} className="mt-3 w-full text-center text-xs text-gray-400 underline hover:text-gray-200">
          {nouveau ? "J'ai déjà un compte" : 'Créer un compte'}
        </button>
      </form>
    </div>
  )
}

function Offre() {
  return (
    <section>
      <h1 className="flex flex-wrap items-center gap-3 text-3xl font-black tracking-tight">
        <LogoDropShopEntete size={72} />
        <span className="texte-dropshop">Créer mon dropshop</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300">
        Votre boutique en ligne, écrite par l'IA, directement depuis DropShop Market. Vous racontez votre commerce,
        l'IA vous propose trois boutiques, vous choisissez la vôtre, elle l'écrit en quelques minutes : design unique,
        panier, commande, emails, paiement Stripe, sans aucune mention DropShipper.
      </p>
      <div className="mt-5 flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-black text-white">9,90 €</span>
        <span className="text-sm text-gray-400">une seule fois · back-office compris · modifications à volonté</span>
      </div>
      <ul className="mt-5 grid max-w-2xl grid-cols-1 gap-2 text-sm text-gray-300 sm:grid-cols-2">
        {[
          'Back-office : commandes, livraisons, produits, réglages',
          'Paiements encaissés sur votre compte Stripe',
          'Modifications à volonté, par simple demande',
          'Vos produits publiés automatiquement sur DropShop Market',
        ].map((l) => (
          <li key={l} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-gray-400">
        Astuce : en passant par <a href="https://www.drop-shipper.fr/register?source=dropshop-market" className="font-semibold text-orange-300 underline">DropShipper IA</a>, le dropshop ne coûte que <b className="text-gray-200">5 €</b>.
      </p>
    </section>
  )
}

/* ---------- 2. Le paiement, puis 3. le studio ---------- */

function Parcours() {
  const [params, setParams] = useSearchParams()
  const sessionId = params.get('session_id')
  const [pret, setPret] = useState<boolean | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const [boutiques, compte] = await Promise.all([api.listShops(), api.myBilling()])
    const hebergee = boutiques.some((b) => (b as { platform?: string | null }).platform === 'dropshipper')
    setPret(hebergee || compte.credits >= DROPS_CREATION_MARKET)
  }, [])

  useEffect(() => {
    charger().catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible'))
  }, [charger])

  // Retour de Stripe : la vérité est demandée à Stripe, comme sur la page Crédits.
  useEffect(() => {
    if (!sessionId) return
    api
      .confirmPayment(sessionId)
      .then(async (r) => {
        setConfirmation(r.granted ? 'Paiement reçu : votre dropshop vous attend.' : "Paiement non abouti : rien n'a été débité.")
        if (r.granted) await charger()
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Confirmation impossible'))
      .finally(() => setParams({}, { replace: true }))
  }, [sessionId, charger, setParams])

  async function payer() {
    setBusy(true)
    setErreur(null)
    try {
      const r = await api.startCheckoutDropshopMarket()
      setClientSecret(r.clientSecret)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Paiement indisponible')
    } finally {
      setBusy(false)
    }
  }

  if (pret === null) return <p className="mt-10 text-center text-sm text-gray-400">{erreur ?? 'Chargement…'}</p>

  if (pret) {
    return (
      <ModeMarket.Provider value>
        {confirmation ? <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{confirmation}</p> : null}
        <StudioBoutiques />
      </ModeMarket.Provider>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <Offre />
      <section className="cadre-dropshop rounded-3xl p-5">
        {confirmation ? <p className="mb-3 text-sm text-amber-200">{confirmation}</p> : null}
        {clientSecret ? (
          stripePromise ? (
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <p className="text-sm text-orange-200">Clé publique Stripe absente : ajoutez VITE_STRIPE_PUBLISHABLE_KEY dans Vercel.</p>
          )
        ) : (
          <>
            <h2 className="text-lg font-extrabold text-white">Votre dropshop pour 9,90 €</h2>
            <p className="mt-1 text-xs text-gray-400">Paiement sécurisé par Stripe, une seule fois. La création commence juste après.</p>
            <button type="button" onClick={payer} disabled={busy} className="btn-dropshop mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              <span>Payer 9,90 € et créer mon dropshop</span>
            </button>
          </>
        )}
        {erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}
      </section>
    </div>
  )
}

/* ---------- La grande publicité DropShipper IA ---------- */

function PubDropShipper() {
  return (
    <section className="relative mt-12 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#f28a4b]/20 via-[#e85290]/15 to-transparent p-6 sm:p-10">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#f28a4b] to-[#e85290]" />
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <img src="/marque/dropshipper-complet.png" alt="DropShipper IA" className="h-12 w-auto" />
          <h2 className="mt-5 text-2xl font-black leading-tight text-white sm:text-4xl">
            Connectez votre dropshop à plus de 315 marketplaces, Shopify et les réseaux sociaux
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300">
            Avec DropShipper IA, importez vos produits depuis n'importe quelle boutique, l'IA réécrit vos annonces et les
            publie partout où vos clients achètent : marketplaces, Shopify, Facebook, Instagram, TikTok… Et votre dropshop
            ne coûte que <b className="text-white">5 €</b>.
          </p>
          <ul className="mt-5 grid grid-cols-1 gap-2 text-sm text-gray-200 sm:grid-cols-3">
            <li className="rounded-xl bg-black/25 p-3"><b className="block text-white">315+ marketplaces</b>eBay, Fnac, Carrefour, Leclerc, Kaufland…</li>
            <li className="rounded-xl bg-black/25 p-3"><b className="block text-white">Shopify</b>Votre catalogue synchronisé</li>
            <li className="rounded-xl bg-black/25 p-3"><b className="block text-white">Réseaux sociaux</b>Publications et pubs créées par l'IA</li>
          </ul>
        </div>
        <a
          href="https://www.drop-shipper.fr/register?source=dropshop-market"
          className="btn-gradient inline-flex items-center justify-center rounded-full px-8 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-lg transition hover:brightness-110"
        >
          S'inscrire sur DropShipper IA
        </a>
      </div>
    </section>
  )
}
