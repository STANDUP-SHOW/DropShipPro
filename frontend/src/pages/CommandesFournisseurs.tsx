import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ExternalLink, PackageCheck, ShoppingCart, Truck } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { BandeauDemo } from '../components/ModeDemo'
import { DEMO_COMMANDES } from '../lib/demoJeux'

/**
 * Les commandes fournisseur — la vente vue du côté sourcing.
 *
 * **Voulue par la découpe, précisée le 04/09/2026** : la zone Sourcing porte
 * les fournisseurs et leurs commandes, avec trois portes d'état — en cours,
 * terminées, en SAV. Chaque porte du menu arrive ici avec son ?etat= ; la
 * page filtre, le menu promet — même mécanique que Ventes.
 *
 * Une vente NEW apparaît comme « à commander » : c'est précisément le travail
 * de cette page, la faire partir chez le fournisseur.
 */

const ETATS = [
  { cle: null, label: 'Toutes' },
  { cle: 'a-commander', label: 'À commander' },
  { cle: 'en-cours', label: 'En cours' },
  { cle: 'terminees', label: 'Terminées' },
  { cle: 'sav', label: 'En SAV' },
] as const

function etatDe(o: any): 'a-commander' | 'en-cours' | 'terminees' | 'sav' {
  if (o.supplierOrderError) return 'sav'
  if (o.status === 'NEW') return 'a-commander'
  if (o.status === 'ORDERED_FROM_SUPPLIER' || o.status === 'SHIPPED') return 'en-cours'
  return 'terminees'
}

const ETAT_BADGE: Record<string, [string, string]> = {
  'a-commander': ['À commander', 'bg-pink-500/20 text-pink-300'],
  'en-cours': ['Chez le fournisseur', 'bg-blue-500/20 text-blue-300'],
  terminees: ['Terminée', 'bg-emerald-500/20 text-emerald-300'],
  sav: ['En SAV', 'bg-red-500/20 text-red-300'],
}

/** Le nom du fournisseur, lu dans l'adresse source du produit. */
function fournisseurDe(o: any): string {
  try {
    const hote = new URL(o.product?.sourceUrl ?? '').hostname.replace(/^www\./, '')
    return hote.split('.').slice(0, -1).join('.') || hote
  } catch {
    return 'fournisseur'
  }
}

export default function CommandesFournisseurs() {
  const [commandes, setCommandes] = useState<any[] | null>(null)
  const [demo] = useDemo()
  const [params] = useSearchParams()
  const etat = params.get('etat')

  async function charger() {
    setCommandes(await api.listOrders())
  }
  useEffect(() => {
    charger().catch(() => setCommandes([]))
  }, [])

  async function commanderChezFournisseur(id: string) {
    if (id.startsWith('demo-')) return
    await api.updateOrder(id, { status: 'ORDERED_FROM_SUPPLIER' })
    await charger()
  }

  const toutes: any[] = demo ? DEMO_COMMANDES : (commandes ?? [])
  const filtrees = etat ? toutes.filter((o) => etatDe(o) === etat) : toutes
  const compte = (cle: string) => toutes.filter((o) => etatDe(o) === cle).length

  return (
    <Layout>
      <h1 className="text-xl font-extrabold tracking-wide">COMMANDES FOURNISSEURS</h1>
      <p className="mt-0.5 mb-5 text-xs text-gray-500">
        Chaque vente vue du côté sourcing : à commander, en route, livrée — ou en difficulté.
      </p>

      <BlocSection id="fournisseurs" />

      {/* Les portes d'état : celles du menu, reprises ici pour circuler. */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {ETATS.map(({ cle, label }) => (
          <Link
            key={label}
            to={cle ? `/commandes-fournisseurs?etat=${cle}` : '/commandes-fournisseurs'}
            className={`rounded-full border px-3 py-1 text-[11px] ${
              etat === cle || (!etat && !cle)
                ? 'border-purple-400/50 bg-purple-500/20 text-white'
                : 'border-white/10 text-gray-400 hover:bg-white/5'
            }`}
          >
            {label}
            {cle ? <span className="ml-1 text-gray-500">{compte(cle)}</span> : null}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {commandes === null ? <p className="text-sm text-gray-500">Lecture…</p> : null}
        {commandes !== null && toutes.length === 0 ? (
          <p className="text-sm text-gray-400">
            Aucune commande pour le moment. Les ventes enregistrées dans{' '}
            <Link to="/orders" className="text-purple-300 underline-offset-2 hover:underline">
              Ventes › Commandes
            </Link>{' '}
            apparaissent ici dès qu'il faut les couvrir chez le fournisseur.
          </p>
        ) : null}
        {commandes !== null && toutes.length > 0 && filtrees.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune commande dans cet état.</p>
        ) : null}

        {filtrees.map((o) => {
          const e = etatDe(o)
          const [badge, teinte] = ETAT_BADGE[e]
          return (
            <div key={o.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.product?.aiTitle || o.product?.title}</p>
                  <p className="mt-0.5 text-sm text-gray-400">
                    {fournisseurDe(o)}
                    {o.supplierOrderId ? ` · commande ${o.supplierOrderId}` : ''}
                    {o.supplierOrderCost ? ` · ${o.supplierOrderCost} €` : ''}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Vente {o.buyerName} du {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                    {o.supplierOrderedAt
                      ? ` — commandée au fournisseur le ${new Date(o.supplierOrderedAt).toLocaleDateString('fr-FR')}`
                      : ''}
                  </p>
                  {o.supplierOrderError ? (
                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-red-200">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>{o.supplierOrderError}</span>
                    </p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${teinte}`}>{badge}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {e === 'a-commander' && o.product?.sourceUrl ? (
                  <a
                    href={o.product.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => commanderChezFournisseur(o.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  >
                    <ShoppingCart size={12} /> Commander chez le fournisseur <ExternalLink size={12} />
                  </a>
                ) : null}
                {o.supplierOrderUrl ? (
                  <a
                    href={o.supplierOrderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  >
                    <Truck size={12} /> Suivre chez le fournisseur <ExternalLink size={12} />
                  </a>
                ) : null}
                {e === 'terminees' ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-300">
                    <PackageCheck size={12} /> Livrée
                  </span>
                ) : null}
                {e === 'sav' ? (
                  <Link
                    to="/sav-fournisseurs"
                    className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10"
                  >
                    Voir dans SAV fournisseurs
                  </Link>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <BandeauDemo />
    </Layout>
  )
}
