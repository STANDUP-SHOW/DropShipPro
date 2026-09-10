import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ReceiptText } from 'lucide-react'
import { DropCoin } from './DropCoin'
import { api } from '../lib/api'

/**
 * Le portefeuille de drops, en tête du tableau de bord.
 *
 * Demandé le 10/09/2026 : « sous menu Dashboard, afficher wallet drops, bouton
 * recharger, bloc idem dashboard néon survol ». Le solde vivait jusqu'ici dans
 * un petit badge en bas du menu ; il a désormais son bloc, à l'accueil, avec la
 * recharge à un clic. Le bloc porte la signature verre du site (coin arrondi,
 * fond translucide, bordure) : le « néon survol » s'y applique tout seul.
 *
 * L'équivalent en euros est calculé, jamais stocké : `euroParDrop` fait foi, la
 * grille tarifaire complète reste sur la page « Mes crédits ».
 */
export function WalletDrops() {
  const [wallet, setWallet] = useState<{ credits: number; euroParDrop: number } | null>(null)

  useEffect(() => {
    api
      .myBilling()
      .then((b) => setWallet({ credits: b.credits, euroParDrop: b.euroParDrop }))
      .catch(() => undefined)
  }, [])

  const euros =
    wallet && wallet.euroParDrop
      ? (wallet.credits * wallet.euroParDrop).toLocaleString('fr-FR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      : null

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/[0.12] bg-white/[0.05] p-4 backdrop-blur-2xl">
      {/* Pas de box-shadow en ligne : il primerait sur le halo néon du survol. */}
      <DropCoin size={44} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Mon portefeuille</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-white">
            {wallet ? `${wallet.credits.toLocaleString('fr-FR')}` : '—'}
          </span>
          <span className="text-sm font-semibold text-gray-300">drops</span>
          {euros ? <span className="text-xs text-gray-500">≈ {euros} €</span> : null}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/credits"
          className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={15} />
          <span>Recharger</span>
        </Link>
        <Link
          to="/credits"
          title="Voir le relevé et la grille tarifaire"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5"
        >
          <ReceiptText size={15} />
          <span className="hidden sm:inline">Relevé</span>
        </Link>
      </div>
    </section>
  )
}
