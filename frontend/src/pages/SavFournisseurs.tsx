import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, PackageX } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { api } from '../lib/api'

/**
 * Le SAV fournisseurs : ce qui coince entre vous et vos fournisseurs.
 *
 * **Voulu par la découpe du 03/09/2026**, séparé du SAV clients — un litige
 * avec un acheteur et un litige avec un fournisseur ne se traitent ni au même
 * moment ni avec les mêmes armes. Ici : les commandes fournisseur en échec,
 * avec la raison écrite par le connecteur, et les statistiques du bloc 10.
 *
 * La messagerie fournisseurs viendra s'y ranger quand elle sera reliée ; en
 * attendant, la page dit ce qui existe plutôt que de promettre.
 */
export default function SavFournisseurs() {
  const [enEchec, setEnEchec] = useState<any[] | null>(null)

  useEffect(() => {
    api
      .listOrders?.()
      ?.then((commandes: any[]) => setEnEchec(commandes.filter((o) => o.supplierOrderError)))
      .catch(() => setEnEchec([]))
  }, [])

  return (
    <Layout>
      <h1 className="text-xl font-extrabold tracking-wide">SAV FOURNISSEURS</h1>
      <p className="mt-0.5 mb-5 text-xs text-gray-500">
        Les commandes fournisseur en difficulté, et ce que chaque échec dit.
      </p>

      <BlocSection id="sav-fournisseurs" />

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <PackageX size={16} className="text-red-300" />
          <span>Commandes fournisseur en échec</span>
        </h2>

        {enEchec === null ? (
          <p className="mt-3 text-xs text-gray-500">Lecture…</p>
        ) : enEchec.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Aucune commande fournisseur en échec. Quand une commande automatique rate — rupture, variante
            introuvable, refus du fournisseur — elle apparaît ici avec sa raison, telle que le connecteur l'a
            reçue.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {enEchec.map((o) => (
              <li key={o.id} className="rounded-xl border border-red-400/20 bg-red-500/[0.05] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{o.buyerName}</p>
                  <span className="shrink-0 text-xs text-gray-500">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-red-200">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{o.supplierOrderError}</span>
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] text-gray-500">
          Le suivi complet des commandes vit dans{' '}
          <Link to="/orders" className="text-purple-300 underline-offset-2 hover:underline">
            Ventes › Commandes
          </Link>
          . La messagerie fournisseurs sera rangée ici quand elle sera reliée.
        </p>
      </section>
    </Layout>
  )
}
