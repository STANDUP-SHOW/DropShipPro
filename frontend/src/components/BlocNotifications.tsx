import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, Inbox, PackageX, Truck, LifeBuoy } from 'lucide-react'
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
  /**
   * Le libellé du téléphone, où la tuile n'a plus qu'un tiers de la largeur.
   *
   * « Livraison à expédier » y sortait « L. », et les cinq tuiles montraient
   * cinq chiffres colorés que plus rien ne nommait. Un mot qui tient vaut
   * mieux qu'une phrase coupée : l'infobulle garde le nom entier, et le nom
   * entier revient dès qu'il y a la place.
   */
  court: string
  icone: typeof ShoppingBag
  to: string
  teinte: string
}> = [
  { cle: 'commandes', label: 'Nouvelle commande', court: 'Commandes', icone: ShoppingBag, to: '/orders', teinte: '#34d399' },
  { cle: 'messagesClient', label: 'Message client', court: 'Messages', icone: Inbox, to: '/messages', teinte: '#22d3ee' },
  { cle: 'fournisseur', label: 'Souci fournisseur', court: 'Fournisseur', icone: PackageX, to: '/sav-fournisseurs', teinte: '#fb7185' },
  { cle: 'aExpedier', label: 'Livraison à expédier', court: 'À expédier', icone: Truck, to: '/livraisons', teinte: '#fbbf24' },
  { cle: 'ticketsSav', label: 'Ticket SAV', court: 'Tickets SAV', icone: LifeBuoy, to: '/tickets', teinte: '#a78bfa' },
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

  /*
   * Plus de cadre ni d'en-tête : le titre vit au-dessus, dans le bandeau, et
   * les cinq tuiles se partagent la largeur exactement comme les six jauges du
   * dessus — même bordure, même fond, même hauteur. C'est ce qui fait tenir les
   * deux lignes sur le même gabarit.
   *
   * **Cinq `flex-1` dans 343 px, cela faisait 60 px par tuile.** Le libellé,
   * écrit en 9 px puis tronqué, se réduisait à « N. », « M. », « S. », « L. »,
   * « T. » — cinq chiffres colorés que rien ne nommait, et l'infobulle censée
   * porter le nom ne s'ouvre pas au doigt. Sur téléphone, les tuiles défilent
   * donc de côté par crans, assez larges pour porter leur nom en entier ; la
   * ligne unique et sa hauteur ne bougent pas, ce qui compte sur un écran où
   * les bandeaux partagés occupent déjà la moitié de la page.
   */
  return (
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
      {TUILES.map((t) => {
        const n = affiches?.[t.cle] ?? 0
        const actif = n > 0
        return (
          <Link
            key={t.cle}
            to={t.to}
            title={`${t.label} : ${n}`}
            className="flex w-[8.75rem] shrink-0 snap-start items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition hover:border-white/[0.18] sm:w-auto sm:min-w-0 sm:flex-1"
          >
            <t.icone size={18} style={{ color: actif ? t.teinte : '#6b7280' }} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span
                className="block text-lg font-extrabold leading-none"
                style={{ color: actif ? t.teinte : '#6b7280' }}
              >
                {n.toLocaleString('fr-FR')}
              </span>
              <span className="mt-1 block truncate text-[10px] font-semibold uppercase leading-tight tracking-wide text-gray-400 xl:text-[9px]">
                <span className="xl:hidden">{t.court}</span>
                <span className="hidden xl:inline">{t.label}</span>
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
