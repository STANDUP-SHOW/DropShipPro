import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { DropCoin } from './DropCoin'
import { api } from '../lib/api'

/**
 * Le portefeuille de drops, en tuile — déplacé du menu vers le bandeau le
 * 16/09/2026.
 *
 * **Pourquoi il n'est plus dans le menu.** Le solde n'est pas une destination,
 * c'est un chiffre qu'on surveille pendant qu'on travaille. Dans la colonne de
 * gauche il vivait au milieu des liens de navigation, et depuis que le menu
 * devient un tiroir sur téléphone il disparaissait entièrement. Ici, il est à
 * côté des cinq compteurs de notifications et des six jauges : c'est la ligne
 * des chiffres, sa place est là.
 *
 * **Le solde est relu comme les autres chiffres du bandeau** — gardé une minute
 * en mémoire de module. Le bloc vit sur toutes les pages : sans ce cache,
 * chaque navigation referait l'appel, exactement le défaut déjà corrigé sur les
 * jauges et les notifications.
 */

let cache: { valeur: { credits: number; euroParDrop: number }; horodatage: number } | null = null

export function BlocDrops() {
  const [solde, setSolde] = useState(cache?.valeur ?? null)

  useEffect(() => {
    if (cache && Date.now() - cache.horodatage < 60_000) return
    api
      .myBilling()
      .then((b) => {
        cache = { valeur: { credits: b.credits, euroParDrop: b.euroParDrop }, horodatage: Date.now() }
        setSolde(cache.valeur)
      })
      .catch(() => {
        // Session expirée ou API muette : la tuile s'efface, elle ne bloque rien.
      })
  }, [])

  if (!solde) return null

  const euros = solde.euroParDrop
    ? (solde.credits * solde.euroParDrop).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
    : null

  return (
    <Link
      to="/credits"
      title={`Portefeuille : ${solde.credits.toLocaleString('fr-FR')} drops${euros ? ` ≈ ${euros} €` : ''} — cliquez pour recharger`}
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition hover:border-white/[0.18]"
    >
      <DropCoin size={22} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-extrabold leading-none text-white">
          {solde.credits.toLocaleString('fr-FR')}
        </span>
        <span className="mt-1 block truncate text-[9px] font-semibold uppercase leading-tight tracking-wide text-gray-400">
          {euros ? `drops · ≈ ${euros} €` : 'drops'}
        </span>
      </span>
      <span
        className="btn-gradient grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white"
        aria-hidden
      >
        <Plus size={13} />
      </span>
    </Link>
  )
}
