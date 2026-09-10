import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ShoppingBag, Inbox, PackageX, Truck, LifeBuoy } from 'lucide-react'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'

/**
 * Le bloc « Notifications » — ce qui attend une action, en tête de chaque page.
 *
 * Cinq compteurs, chacun une porte vers sa page (demandé le 10/09/2026) :
 * nouvelle commande, message client, souci fournisseur, livraison à expédier,
 * ticket SAV. Présentation des blocs du tableau de bord (verre + néon survol) ;
 * chaque tuile est un bloc en verre, donc s'allume aussi au survol.
 *
 * Les chiffres sont gardés une minute en mémoire de module : le bloc vit sur
 * toutes les pages, chaque navigation ne doit pas refaire l'appel — même règle
 * que le bandeau des jauges.
 */

type Compteurs = Awaited<ReturnType<typeof api.notifications>>

let cache: { valeur: Compteurs; horodatage: number } | null = null

/**
 * Les compteurs du mode DEMO — cohérents avec le reste de la démonstration.
 *
 * Ils suivent le jeu de commandes de démonstration (DEMO_COMMANDES) : deux
 * commandes NEW, deux commandées chez le fournisseur (à expédier), une en
 * difficulté ; plus quelques messages et tickets, à l'échelle d'une boutique
 * démo active. Quand la pilule DEMO du tableau de bord est levée, ce bloc les
 * affiche comme les jauges affichent JAUGES_DEMO — jamais un chiffre de démo
 * sans que tout le site le soit.
 */
const NOTIFS_DEMO: Compteurs = {
  commandes: 2,
  messagesClient: 8,
  fournisseur: 1,
  aExpedier: 2,
  ticketsSav: 2,
}

const TUILES: Array<{
  cle: keyof Compteurs
  label: string
  icone: typeof ShoppingBag
  to: string
  teinte: string
}> = [
  { cle: 'commandes', label: 'Nouvelle commande', icone: ShoppingBag, to: '/orders', teinte: '#34d399' },
  { cle: 'messagesClient', label: 'Message client', icone: Inbox, to: '/messages', teinte: '#22d3ee' },
  { cle: 'fournisseur', label: 'Souci fournisseur', icone: PackageX, to: '/sav-fournisseurs', teinte: '#fb7185' },
  { cle: 'aExpedier', label: 'Livraison à expédier', icone: Truck, to: '/livraisons', teinte: '#fbbf24' },
  { cle: 'ticketsSav', label: 'Ticket SAV', icone: LifeBuoy, to: '/tickets', teinte: '#a78bfa' },
]

export function BlocNotifications() {
  const [compteurs, setCompteurs] = useState<Compteurs | null>(cache?.valeur ?? null)
  const [demo] = useDemo()

  useEffect(() => {
    if (cache && Date.now() - cache.horodatage < 60_000) return
    api
      .notifications()
      .then((c) => {
        cache = { valeur: c, horodatage: Date.now() }
        setCompteurs(c)
      })
      .catch(() => {
        // Session expirée ou API muette : le bloc ne bloque pas la page.
      })
  }, [])

  // La pilule DEMO du tableau de bord commande tout le site : ici aussi.
  const affiches = demo ? NOTIFS_DEMO : compteurs

  return (
    <section
      className="h-full rounded-2xl border border-white/[0.12] bg-white/[0.05] p-4 backdrop-blur-2xl"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)' }}
    >
      <header className="mb-3 flex items-center gap-2.5 border-b border-white/10 pb-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-purple-400 text-black/80">
          <Bell size={14} />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest text-purple-200">Notifications</h2>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TUILES.map((t) => {
          const n = affiches?.[t.cle] ?? 0
          const actif = n > 0
          return (
            <Link
              key={t.cle}
              to={t.to}
              title={`${t.label} : ${n}`}
              className="flex flex-col gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
            >
              <span className="flex items-center justify-between">
                <t.icone size={16} style={{ color: t.teinte }} />
                {actif ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-black/85"
                    style={{ backgroundColor: t.teinte }}
                  >
                    {n}
                  </span>
                ) : null}
              </span>
              <span
                className="text-2xl font-extrabold leading-none"
                style={{ color: actif ? t.teinte : '#6b7280' }}
              >
                {n.toLocaleString('fr-FR')}
              </span>
              <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-gray-400">
                {t.label}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
