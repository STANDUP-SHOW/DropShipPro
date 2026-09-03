import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Package, ShoppingBag, Settings as SettingsIcon, LogOut, BookOpen, Coins , Plane, Inbox, Truck, Users, Megaphone, Store, Calculator, Boxes, Images, FolderTree, LifeBuoy, ChevronRight, LayoutDashboard, Link2, Puzzle, TrendingUp } from 'lucide-react'
import { Logo } from './Logo'
import { ExtensionVersion } from './ExtensionVersion'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

const NAV = [
  // Le tableau de bord d abord : l accueil du vendeur, ce sont ses chiffres.
  { to: '/statistiques', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pilote', label: 'Pilote auto', icon: Plane },
  { to: '/agents', label: 'Mes agents ADMIN', icon: Users },
]

/**
 * Les sections du menu, dans l'ordre du travail : on source un produit, on le
 * met en vente, on le fait connaître.
 *
 * Trois blocs quasi identiques vivaient recopiés dans le rendu, ce qui rendait
 * l'ajout d'un quatrième mécanique et l'oubli d'un détail probable. Une table,
 * un rendu.
 */
/*
 * La découpe du 03/09/2026, appliquée telle quelle : acquisition, sourcing,
 * produits, diffusion, marketing, rayons IA, ventes en trois états,
 * livraisons, deux SAV séparés, comptabilité, puis l'outil lui-même.
 *
 * « Autorisation spéciale » en est sortie à la demande — la route reste
 * servie, la porte est côté serveur. L'imprimerie n'apparaît pas : produits
 * seulement.
 */
const SECTIONS: Array<{
  titre: string
  entrees: Array<{ to: string; label: string; icon: React.ElementType }>
}> = [
  {
    titre: 'Acquisition produits',
    entrees: [
      { to: '/acquisition', label: 'Comment acquérir', icon: Link2 },
      { to: '/acquisition#extension', label: 'Extension Chrome', icon: Puzzle },
    ],
  },
  {
    titre: 'Sourcing',
    entrees: [{ to: '/fournisseurs', label: 'Fournisseurs', icon: Boxes }],
  },
  {
    titre: 'Produits',
    entrees: [
      { to: '/dashboard', label: 'Mes annonces', icon: Package },
      { to: '/categories', label: 'Catégories', icon: FolderTree },
    ],
  },
  {
    titre: 'Diffusion',
    entrees: [
      { to: '/plateformes-vente', label: 'Market places', icon: Store },
      { to: '/mes-sites', label: 'Mes sites', icon: Store },
    ],
  },
  {
    titre: 'Marketing',
    entrees: [
      { to: '/marketing', label: 'Commercialisation', icon: Megaphone },
      { to: '/mes-pubs', label: 'Mes pubs', icon: Images },
    ],
  },
  {
    // Les rayons confiés aux agents se déplient juste sous cette section —
    // leur liste est vivante, elle vient de l'API.
    titre: 'Mes rayons IA',
    entrees: [{ to: '/analyse-marche', label: 'Analyses de marché', icon: TrendingUp }],
  },
  {
    /*
     * Les trois états d'une vente, chacun sa porte : un vendeur qui vient
     * expédier ne veut pas revoir les commandes terminées, et inversement.
     * `?etat=` est lu par la page, qui filtre.
     */
    titre: 'Ventes',
    entrees: [
      { to: '/orders?etat=nouvelles', label: 'Nouvelles commandes', icon: ShoppingBag },
      { to: '/orders?etat=en-cours', label: 'En cours', icon: ShoppingBag },
      { to: '/orders?etat=terminees', label: 'Terminées', icon: ShoppingBag },
    ],
  },
  {
    titre: 'Livraisons',
    entrees: [
      { to: '/livraisons?etat=en-cours', label: 'En cours', icon: Truck },
      { to: '/livraisons?etat=terminees', label: 'Terminées', icon: Truck },
    ],
  },
  {
    titre: 'SAV clients',
    entrees: [
      { to: '/sav', label: 'Service après-vente', icon: LifeBuoy },
      { to: '/messages', label: 'Messagerie market places', icon: Inbox },
    ],
  },
  {
    /*
     * Séparé du SAV clients, et c'est la découpe qui le veut : un litige avec
     * un acheteur et un litige avec un fournisseur ne se traitent ni au même
     * moment ni avec les mêmes armes.
     */
    titre: 'SAV fournisseurs',
    entrees: [{ to: '/sav-fournisseurs', label: 'Service après-vente', icon: LifeBuoy }],
  },
  {
    titre: 'Comptabilité',
    entrees: [{ to: '/comptabilite', label: 'Comptabilité', icon: Calculator }],
  },
  {
    titre: 'DropShipper',
    entrees: [
      { to: '/settings', label: 'Réglages', icon: SettingsIcon },
      { to: '/abonnement', label: 'Mes crédits', icon: Coins },
      { to: '/tickets', label: 'Mes tickets', icon: LifeBuoy },
      { to: '/guide', label: "Mode d'emploi", icon: BookOpen },
      { to: '/guide#contact', label: 'Aide & contact', icon: LifeBuoy },
    ],
  },
]

export function Layout({ children, large = false }: { children: React.ReactNode; large?: boolean }) {
  const { pathname, search, hash } = useLocation()
  /** Une entree avec ?etat= ou #ancre n est active que sur sa variante exacte. */
  const estActive = (to: string) =>
    to.includes('?') || to.includes('#') ? pathname + search + hash === to : pathname === to
  const { logout, user } = useAuth()
  const [solde, setSolde] = useState<{ credits: number; premium: boolean } | null>(null)
  /**
   * Les rayons confiés, chacun à son nom.
   *
   * « Veille » ne disait rien à personne. Un vendeur qui tient quatre rayons
   * cherche ce que Karim a trouvé, pas la section veille numéro trois.
   */
  const [rayons, setRayons] = useState<Array<{ id: string; agentName: string; label: string; emoji: string; pending: number }>>([])
  /** Le rayon ouvert, s'il y en a un : la liste se déplie alors d'elle-même. */
  const rayonActif = rayons.find((r) => pathname.startsWith(`/rayon/${r.id}`))?.id ?? null
  /** Ce qui attend, tous rayons confondus — affiché sur le titre replié. */
  const enAttente = rayons.reduce((n, r) => n + r.pending, 0)

  useEffect(() => {
    api
      .myBilling()
      .then((b) => setSolde({ credits: b.credits, premium: b.premium }))
      .catch(() => {
        // Ancienne session ou API indisponible : on n'affiche simplement rien.
      })
  }, [pathname])

  useEffect(() => {
    api
      .listDepartments()
      .then(setRayons)
      .catch(() => {
        // Session expirée ou API muette : le menu se passe des rayons.
      })
  }, [pathname])

  return (
    <div className="min-h-screen bg-app-gradient text-white flex">
      <aside className="w-56 shrink-0 border-r border-white/10 p-4 flex flex-col">
        <Link to="/dashboard" className="mb-8 block">
          <Logo size={22} />
        </Link>
        <nav className="space-y-1 flex-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </Link>
            )
          })}

          {SECTIONS.map((section) => (
            <div key={section.titre} className="mt-6">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {section.titre}
              </p>
              {section.entrees.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    estActive(item.to)
                      ? 'bg-purple-500/20 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}

          {rayons.length > 0 && (
            /*
              Replié par défaut, et c'est le point.
              Vingt-quatre rayons déroulés à la verticale poussaient le solde de
              crédits et l'adresse du compte hors de l'écran : le bas du menu
              n'existait plus. Un rayon actif rouvre la liste tout seul — s'y
              trouver et ne pas la voir serait pire que la longueur.
            */
            <details className="group pt-3" open={rayonActif !== null}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 pb-1 text-[11px] uppercase tracking-wide text-gray-600 hover:text-gray-400">
                <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
                <span>Mes rayons</span>
                <span className="ml-auto normal-case tracking-normal text-gray-600">
                  {/* Le compte, et les fiches en attente : de quoi savoir s'il
                      faut ouvrir, sans avoir à ouvrir. */}
                  {enAttente > 0 ? `${rayons.length} · ${enAttente} en attente` : rayons.length}
                </span>
              </summary>
              {rayons.map((r) => {
                const active = pathname.startsWith(`/rayon/${r.id}`)
                return (
                  <Link
                    key={r.id}
                    to={`/rayon/${r.id}`}
                    /*
                      Le rayon, pas l'agent qui le tient.
                      Le vendeur cherche « Électronique » quand il veut voir ses
                      montres connectées ; il ne se souvient pas que c'est Malik
                      qui s'en occupe. Le prénom reste au survol, et sur la page
                      du rayon où il a un sens : c'est là qu'on lui parle.
                    */
                    title={`${r.label} — ${r.agentName}`}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-base leading-none">{r.emoji}</span>
                    <span className="truncate">{r.label}</span>
                    {r.pending > 0 && (
                      <span className="ml-auto rounded-full bg-emerald-400/20 px-1.5 text-[11px] text-emerald-300">
                        {r.pending}
                      </span>
                    )}
                  </Link>
                )
              })}
            </details>
          )}
        </nav>
        <div className="border-t border-white/10 pt-3 text-xs text-gray-400">
          {solde && (
            <Link
              to="/abonnement"
              className="mb-2 flex items-center gap-1.5 rounded-lg bg-purple-500/15 px-2 py-1.5 text-purple-200 hover:bg-purple-500/25"
            >
              <Coins size={13} />
              <span>{solde.premium ? 'Illimité' : `${solde.credits} annonce(s)`}</span>
            </Link>
          )}
          <p className="truncate">{user?.email}</p>
          <button onClick={logout} className="mt-2 flex items-center gap-1.5 text-gray-400 hover:text-white">
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-8 overflow-x-hidden">
        {/*
          Le tableau de bord occupe tout l'écran, comme la maquette : cent
          vingt-six tuiles dans un couloir de 1024 px n'auraient jamais leurs
          neuf colonnes. Les autres pages gardent leur colonne de lecture.
        */}
        <div className={large ? 'mx-auto max-w-[1800px]' : 'mx-auto max-w-5xl'}>
          {/*
            Dans la mise en page, donc sur tous les écrans.
            Une extension en retard fausse ce que le vendeur voit partout — pas
            seulement dans la fenêtre de publication, seul endroit qui la
            détectait jusqu'ici. Le bandeau ne s'affiche que si une extension
            est installée ET qu'elle est antérieure.
          */}
          <ExtensionVersion />
          <div className="md:hidden flex items-center gap-1 mb-6 -mx-2 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm mx-2 ${
                  pathname.startsWith(item.to) ? 'bg-white/10' : 'text-gray-400'
                }`}
              >
                <item.icon size={16} /> <span>{item.label}</span>
              </Link>
            ))}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
