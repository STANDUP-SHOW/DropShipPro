import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Store, CreditCard, ExternalLink, Copy, Check, Rss, ShieldCheck, Ban } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../lib/auth'
import { demoAutorise } from '../lib/demo'
import { api, type MarketVendeur, type MarketAdmin } from '../lib/api'

/**
 * DropShop Market (drop-shop.cloud) côté vendeur : activer ses paiements
 * Stripe (inscription gratuite, 5 % par vente), voir ses annonces et ses ventes,
 * et copier les adresses des flux (Google Merchant Center, Meta, comparateurs,
 * Google Ads Editor). Pour publier, le vendeur choisit « DropShop Market » comme
 * destination, comme n'importe quel canal.
 *
 * Le compte admin voit en plus l'admin simplifié : chiffres, vendeurs, ventes,
 * et le retrait d'une annonce. La vraie porte est côté serveur (requireAdmin).
 */

const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')

function CopierAdresse({ libelle, url }: { libelle: string; url: string }) {
  const [copie, setCopie] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-400">{libelle}</div>
        <div className="truncate font-mono text-xs">{url}</div>
      </div>
      <button
        type="button"
        className="rounded-lg p-2 hover:bg-white/10"
        aria-label={`Copier l'adresse ${libelle}`}
        onClick={() => {
          navigator.clipboard.writeText(url)
          setCopie(true)
          setTimeout(() => setCopie(false), 1500)
        }}
      >
        {copie ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  )
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-gray-400">{libelle}</div>
      <div className="text-xl font-bold">{valeur}</div>
    </div>
  )
}

function AdminMarket() {
  const [donnees, setDonnees] = useState<MarketAdmin | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [annonces, setAnnonces] = useState<Array<{ productId: string; titre: string; url: string; prix: number }>>([])

  const charger = useCallback(() => {
    api.marketAdmin().then(setDonnees).catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible'))
  }, [])
  useEffect(charger, [charger])

  const voir = (userId: string) => {
    if (ouvert === userId) return setOuvert(null)
    setOuvert(userId)
    setAnnonces([])
    api.marketAdminAnnonces(userId).then((r) => setAnnonces(r.annonces)).catch(() => setAnnonces([]))
  }

  const retirer = async (productId: string) => {
    const raison = window.prompt('Raison du retrait (le vendeur la lira) :')
    if (!raison) return
    try {
      await api.marketRetirer(productId, raison)
      setAnnonces((l) => l.filter((a) => a.productId !== productId))
      charger()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Retrait impossible')
    }
  }

  if (erreur) return <p className="text-sm text-red-300">{erreur}</p>
  if (!donnees) return <p className="text-sm text-gray-400">Chargement de l'admin…</p>
  const c = donnees.chiffres

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre libelle="Annonces en ligne" valeur={c.annonces} />
        <Chiffre libelle="Vendeurs (paiements actifs)" valeur={`${c.vendeursAvecAnnonces} (${c.vendeursPaiementsActifs})`} />
        <Chiffre libelle="Ventes · 30 jours" valeur={`${c.ventes} · ${c.ventes30j}`} />
        <Chiffre libelle="Commissions · 30 jours" valeur={`${euros(c.commissions)} · ${euros(c.commissions30j)}`} />
      </div>
      <p className="text-xs text-gray-400">Volume vendu : {euros(c.volume)} au total, {euros(c.volume30j)} sur 30 jours. Les virements et litiges se gèrent dans le tableau de bord Stripe Connect de la plateforme.</p>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="bg-white/[0.04] px-4 py-2 text-sm font-semibold">Vendeurs</div>
        {donnees.vendeurs.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">Aucun vendeur pour le moment.</p>}
        {donnees.vendeurs.map((v) => (
          <div key={v.id} className="border-t border-white/10">
            <button type="button" onClick={() => voir(v.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/[0.04]">
              <span className="min-w-0 flex-1 truncate">{v.nom || v.email}</span>
              <span className="text-gray-400">{v.annonces} annonce{v.annonces > 1 ? 's' : ''}</span>
              <span className={v.paiements ? 'text-emerald-300' : 'text-amber-300'}>{v.paiements ? 'Paiements actifs' : 'Paiements inactifs'}</span>
            </button>
            {ouvert === v.id && (
              <div className="space-y-1 bg-black/20 px-4 py-2">
                {annonces.map((a) => (
                  <div key={a.productId} className="flex items-center gap-2 text-sm">
                    <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{a.titre}</a>
                    <span className="text-gray-400">{euros(a.prix)}</span>
                    <button type="button" onClick={() => retirer(a.productId)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">
                      <Ban size={12} /> Retirer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="bg-white/[0.04] px-4 py-2 text-sm font-semibold">Dernières ventes</div>
        {donnees.ventes.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">Aucune vente pour le moment.</p>}
        {donnees.ventes.map((o) => (
          <div key={o.id} className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{o.titre}{o.variante ? ` (${o.variante})` : ''}</span>
            <span className="hidden text-gray-400 md:inline">{o.vendeur}</span>
            <span>{euros(o.montant)}</span>
            <span className="text-emerald-300">+{euros(o.commission)}</span>
            <span className="text-gray-400">{date(o.payeeLe)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DropShopMarket() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [donnees, setDonnees] = useState<MarketVendeur | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const estAdmin = demoAutorise(user?.email)

  useEffect(() => {
    api.marketVendeur().then(setDonnees).catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible'))
  }, [])

  const ouvrirStripe = async (tableau: boolean) => {
    setEnCours(true)
    try {
      const { url } = tableau ? await api.marketStripeTableau() : await api.marketStripe()
      window.location.href = url
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Stripe ne répond pas')
      setEnCours(false)
    }
  }

  const stripe = donnees?.stripe

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Store className="text-emerald-400" /> DropShop Market
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          La place de marché des boutiques DropShop, sur{' '}
          <a className="text-emerald-300 hover:underline" href="https://drop-shop.cloud" target="_blank" rel="noreferrer">drop-shop.cloud</a>.
          Inscription gratuite, paiement par Stripe, 5 % de commission sur chaque vente. Chaque variante de vos produits a sa page et son annonce Google Shopping.
        </p>
      </div>

      {erreur && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erreur}</p>}
      {params.get('stripe') === 'retour' && stripe && !stripe.actif && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Stripe vérifie encore vos informations. Les paiements s'activent dès qu'il a terminé ; rechargez cette page dans quelques minutes.
        </p>
      )}

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><CreditCard size={18} /> Paiements</h2>
        {!donnees ? (
          <p className="text-sm text-gray-400">Chargement…</p>
        ) : stripe?.actif ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-sm text-emerald-300"><ShieldCheck size={16} /> Paiements actifs : vos ventes arrivent sur votre compte Stripe, moins 5 %.</span>
            <button type="button" disabled={enCours} onClick={() => ouvrirStripe(true)} className="rounded-xl border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10">
              Mon tableau de bord Stripe
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              {stripe?.inscrit
                ? "Votre inscription Stripe n'est pas terminée. Vos produits sont déjà visibles sur le Market, mais l'achat s'ouvre quand Stripe a validé votre compte."
                : "Pour vendre, activez vos paiements : Stripe vous demande votre identité et votre IBAN sur son propre formulaire. Rien de cela ne passe par DropShipper."}
            </p>
            <button type="button" disabled={enCours} onClick={() => ouvrirStripe(false)} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
              {stripe?.inscrit ? "Terminer l'inscription Stripe" : 'Activer mes paiements (gratuit)'}
            </button>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-1 text-lg font-semibold">Mes annonces sur le Market</h2>
        <p className="mb-3 text-sm text-gray-400">
          Pour publier, ouvrez un produit dans <Link className="text-emerald-300 hover:underline" to="/dashboard">Mes annonces</Link> et choisissez « DropShop Market » parmi les destinations.
        </p>
        {donnees && donnees.annonces.length === 0 && <p className="text-sm text-gray-400">Aucune annonce publiée pour le moment.</p>}
        <div className="space-y-1">
          {donnees?.annonces.map((a) => (
            <a key={a.productId} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.05]">
              <span className="min-w-0 flex-1 truncate">{a.titre}</span>
              {a.variantes > 0 && <span className="text-xs text-gray-400">{a.variantes} variantes = {a.variantes} pages</span>}
              <ExternalLink size={14} className="text-gray-400" />
            </a>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-lg font-semibold">Mes ventes</h2>
        {donnees && donnees.ventes.length === 0 && <p className="text-sm text-gray-400">Aucune vente pour le moment.</p>}
        {donnees?.ventes.map((o) => (
          <div key={o.id} className="flex items-center gap-3 border-t border-white/10 py-2 text-sm first:border-t-0">
            <span className="min-w-0 flex-1 truncate">{o.quantite} × {o.titre}{o.variante ? ` (${o.variante})` : ''}</span>
            <span className="hidden text-gray-400 md:inline">{o.acheteur}</span>
            <span>{euros(o.montant)}</span>
            <span className="text-gray-400">−{euros(o.commission)}</span>
            <span className="text-gray-400">{date(o.payeeLe)}</span>
          </div>
        ))}
      </section>

      {donnees && (
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Rss size={18} /> Flux produits du Market</h2>
          <p className="mb-3 text-sm text-gray-400">
            Une ligne par variante, regroupées par produit (item_group_id). À coller dans Google Merchant Center, le catalogue Meta, un comparateur de prix, ou à importer dans Google Ads Editor.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {donnees.flux.parBoutique.map((b) => (
              <CopierAdresse key={b.google} libelle={`Google Merchant · ${b.nom}`} url={b.google} />
            ))}
            {estAdmin && (
              <>
                <CopierAdresse libelle="Google Merchant · tout le Market" url={donnees.flux.google} />
                <CopierAdresse libelle="Catalogue Meta · tout le Market" url={donnees.flux.meta} />
                <CopierAdresse libelle="Comparateurs de prix · tout le Market" url={donnees.flux.comparateurs} />
                <CopierAdresse libelle="Google Ads Editor (CSV) · tout le Market" url={donnees.flux.googleAds} />
              </>
            )}
          </div>
        </section>
      )}

      {estAdmin && (
        <section className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <h2 className="mb-3 text-lg font-semibold">Admin DropShop Market</h2>
          <AdminMarket />
        </section>
      )}
    </Layout>
  )
}
