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
   * Le libellé du téléphone.
   *
   * Les cinq tuiles se partageaient 311 px de large sur un écran de 375 : une
   * fois retirés le cadre, l'icône et l'écart, il restait DIX pixels de texte
   * par tuile, et « Livraison à expédier » sortait en « L. ». Cinq lettres
   * seules, sur toutes les pages du site. Le libellé court tient dans une
   * tuile de téléphone ; le complet revient dès `lg`, et reste dans l'infobulle.
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
  { cle: 'ticketsSav', label: 'Ticket SAV', court: 'Tickets', icone: LifeBuoy, to: '/tickets', teinte: '#a78bfa' },
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
   * Sur téléphone, elles ne se partagent plus rien : cinq tuiles dans 311 px ne
   * laissent pas la place d'un mot. La ligne devient une bande qui défile de
   * côté, comme les six jauges juste au-dessus — même geste, même gabarit, et
   * la hauteur de la page ne bouge pas. Au-dessus de `lg`, la largeur suffit et
   * les tuiles se repartagent la ligne comme avant.
   */
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:overflow-x-visible lg:pb-0">
      {TUILES.map((t) => {
        const n = affiches?.[t.cle] ?? 0
        const actif = n > 0
        return (
          <Link
            key={t.cle}
            to={t.to}
            title={`${t.label} : ${n}`}
            className="flex min-w-[8rem] flex-1 shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition hover:border-white/[0.18] lg:min-w-0 lg:shrink"
          >
            <t.icone size={18} style={{ color: actif ? t.teinte : '#6b7280' }} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span
                className="block text-lg font-extrabold leading-none"
                style={{ color: actif ? t.teinte : '#6b7280' }}
              >
                {n.toLocaleString('fr-FR')}
              </span>
              {/* Bas de casse sur téléphone : « FOURNISSEUR » en capitales
                  demande 83 px quand la tuile en offre 66, et se coupe ; le
                  même mot écrit normalement en demande 62. Les capitales et
                  l'interlettrage reviennent dès `lg`, où la place est là. */}
              <span className="mt-1 block truncate text-[10px] font-semibold leading-tight text-gray-400 lg:text-[9px] lg:uppercase lg:tracking-wide">
                <span className="lg:hidden">{t.court}</span>
                <span className="hidden lg:inline">{t.label}</span>
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
