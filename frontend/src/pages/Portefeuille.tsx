import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Wallet, CheckCircle2, Clock, ArrowUpRight, Banknote, AlertTriangle } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, type Portefeuille as Donnees } from '../lib/api'

/**
 * Le portefeuille du vendeur (21/11/2026) : où est l'argent de ses ventes,
 * vitrines DropShop et DropShop Market confondues. En argent de test tant que
 * la plateforme tourne avec des clés Stripe de test : c'est dit en haut.
 */

const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

const STATUTS: Record<Donnees['ventes'][number]['statut'], { libelle: string; classe: string }> = {
  versee: { libelle: 'Virée sur votre compte', classe: 'bg-emerald-400/15 text-emerald-200' },
  'en-attente': { libelle: 'En attente', classe: 'bg-amber-400/15 text-amber-200' },
  'chez-vous': { libelle: 'Encaissée sur votre Stripe', classe: 'bg-sky-400/15 text-sky-200' },
  remboursee: { libelle: 'Remboursée', classe: 'bg-white/10 text-gray-400' },
}

export default function Portefeuille() {
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [params] = useSearchParams()

  function charger() {
    api.portefeuille().then(setD).catch((e) => setErreur(e instanceof Error ? e.message : 'Portefeuille illisible'))
  }
  useEffect(charger, [])

  async function ouvrir(action: 'activer' | 'stripe') {
    setOccupe(action)
    setErreur(null)
    try {
      const { url } = action === 'activer' ? await api.portefeuilleActiver() : await api.portefeuilleStripe()
      window.location.href = url
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Stripe ne répond pas')
      setOccupe(null)
    }
  }

  async function retirer() {
    setOccupe('retirer')
    setErreur(null)
    try {
      const r = await api.portefeuilleRetirer()
      setInfo(`${euros(r.montant)} en route vers votre IBAN${r.arrivee ? `, arrivée prévue le ${new Date(r.arrivee).toLocaleDateString('fr-FR')}` : ''}.`)
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Retrait refusé')
    } finally {
      setOccupe(null)
    }
  }

  const carte = 'rounded-2xl border border-white/10 bg-[#191E2E] p-4'
  const actif = Boolean(d?.compte.actif)

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#f28a4b] to-[#e85290]"><Wallet size={22} /></span>
          <div>
            <h1 className="text-2xl font-bold">Mon portefeuille</h1>
            <p className="text-sm text-[#B8C0D0]">L'argent de vos ventes : vitrines DropShop et DropShop Market.</p>
          </div>
        </header>

        {d?.mode === 'test' ? (
          <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Mode test : les paiements et les montants ci-dessous sont de l'argent de test Stripe, rien n'est réellement débité ni versé.</span>
          </p>
        ) : null}
        {params.get('stripe') === 'retour' ? <p className="text-sm text-emerald-200">Retour de Stripe : votre état est relu ci-dessous.</p> : null}

        {!d && !erreur ? <p className="text-sm text-[#B8C0D0]">Chargement…</p> : null}

        {d ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className={carte}>
                <p className="flex items-center gap-1.5 text-xs text-[#B8C0D0]"><Clock size={13} /> En attente</p>
                <p className="mt-1 text-2xl font-bold">{euros(d.solde.enAttente)}</p>
                <p className="mt-1 text-xs text-[#B8C0D0]">Ventes payées, pas encore virées{actif ? '' : ' : activez vos paiements pour les recevoir'}. Frais Stripe déduits au virement.</p>
              </div>
              <div className={carte}>
                <p className="flex items-center gap-1.5 text-xs text-[#B8C0D0]"><Banknote size={13} /> Disponible sur votre compte Stripe</p>
                <p className="mt-1 text-2xl font-bold">{d.solde.surCompte ? euros(d.solde.surCompte.disponible) : '—'}</p>
                <p className="mt-1 text-xs text-[#B8C0D0]">
                  {d.solde.surCompte ? `Plus ${euros(d.solde.surCompte.enCours)} en cours chez Stripe (quelques jours).` : 'Visible dès que vos paiements sont activés.'}
                </p>
              </div>
              <div className={carte}>
                <p className="flex items-center gap-1.5 text-xs text-[#B8C0D0]"><CheckCircle2 size={13} /> Déjà virées</p>
                <p className="mt-1 text-2xl font-bold">{euros(d.solde.verse)}</p>
                <p className="mt-1 text-xs text-[#B8C0D0]">
                  {d.solde.chezVous ? `Et ${euros(d.solde.chezVous)} encaissés directement sur votre propre clé Stripe.` : 'Virées depuis la plateforme vers votre compte Stripe.'}
                </p>
              </div>
            </section>

            <section className={carte}>
              {actif ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex items-center gap-1.5 text-sm text-emerald-200"><CheckCircle2 size={15} /> Paiements activés : vos ventes vous sont virées automatiquement.</p>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" onClick={retirer} disabled={!!occupe || !d.solde.surCompte?.disponible} className="btn-gradient rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                      {occupe === 'retirer' ? 'Retrait…' : 'Retirer vers mon IBAN'}
                    </button>
                    <button type="button" onClick={() => ouvrir('stripe')} disabled={!!occupe} className="flex items-center gap-1 rounded-xl border border-white/15 px-4 py-2 text-sm text-[#F5F7FA] hover:bg-white/5 disabled:opacity-40">
                      Mes virements chez Stripe <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-[#B8C0D0]">
                    {d.compte.inscrit ? 'Votre inscription Stripe n\'est pas terminée.' : 'Pour recevoir l\'argent de vos ventes, activez vos paiements :'} formulaire Stripe, gratuit, quelques minutes (identité et IBAN, saisis chez Stripe, jamais chez nous).
                  </p>
                  <button type="button" onClick={() => ouvrir('activer')} disabled={!!occupe} className="btn-gradient ml-auto rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                    {occupe === 'activer' ? 'Ouverture de Stripe…' : d.compte.inscrit ? "Terminer l'inscription Stripe" : 'Activer mes paiements'}
                  </button>
                </div>
              )}
              {info ? <p className="mt-2 text-sm text-emerald-200">{info}</p> : null}
            </section>

            <section className={carte}>
              <h2 className="mb-3 text-sm font-bold">Historique des ventes</h2>
              {d.ventes.length === 0 ? (
                <p className="text-sm text-[#B8C0D0]">
                  Aucune vente payée pour l'instant. Vos ventes apparaîtront ici dès qu'un client paie sur une de vos <Link to="/creer-boutique" className="underline">boutiques</Link> ou sur <Link to="/dropshop-market" className="underline">DropShop Market</Link>.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {d.ventes.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                      <span className="w-24 shrink-0 text-xs text-[#B8C0D0]">{new Date(v.date).toLocaleDateString('fr-FR')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{v.quantite > 1 ? `${v.quantite} × ` : ''}{v.titre}</span>
                        <span className="text-xs text-[#B8C0D0]">{v.canal}{v.commission ? ` · commission ${euros(v.commission)}` : ''}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUTS[v.statut].classe}`}>{STATUTS[v.statut].libelle}</span>
                      <b className="w-24 text-right">{euros(v.part)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
        {erreur ? <p className="text-sm text-red-300">{erreur}</p> : null}
      </div>
    </Layout>
  )
}
