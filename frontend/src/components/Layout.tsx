import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Bot, Package, ShoppingBag, Settings as SettingsIcon, LogOut, BookOpen, Coins, Inbox, Truck, Users, Megaphone, Store, Calculator, Boxes, Images, FolderTree, LifeBuoy, ChevronRight, LayoutDashboard, Link2, Puzzle, TrendingUp, Trophy } from 'lucide-react'
import { Logo } from './Logo'
import { ExtensionVersion } from './ExtensionVersion'
import { FondVivant } from './FondVivant'
import { BandeauJauges } from './BandeauJauges'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

const NAV = [
  // Le tableau de bord d abord : l accueil du vendeur, ce sont ses chiffres.
  { to: '/statistiques', label: 'Dashboard', icon: LayoutDashboard },
  // La page « Pilote auto » est devenue l'agent AUTO-SHIPPER AI (06/09/2026).
  { to: '/pilote', label: 'Auto-Shipper AI', icon: Bot },
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
      { to: '/extension', label: 'Extension Chrome', icon: Puzzle },
    ],
  },
  {
    // La zone Sourcing telle que la découpe la voulait (précisée le
    // 04/09/2026) : les fournisseurs, puis leurs commandes par état.
    titre: 'Sourcing',
    // Les états (en cours, terminées, en SAV) sont des pilules SUR la page :
    // les répéter dans le menu le doublait pour rien (retirés le 04/09/2026).
    entrees: [
      { to: '/fournisseurs', label: 'Fournisseurs', icon: Boxes },
      { to: '/commandes-fournisseurs', label: 'Commandes fournisseurs', icon: ShoppingBag },
    ],
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
    // La maison des rayons (réunie le 05/09/2026) : « Mes chefs de rayon »
    // et le déroulant des rayons embauchés sont rendus en tête de section,
    // avant ces deux entrées — voir le bloc conditionnel du rendu.
    titre: 'Mes rayons IA',
    entrees: [
      { to: '/analyse-marche', label: 'Analyses de marché', icon: TrendingUp },
      { to: '/produits-gagnants', label: 'Produits gagnants', icon: Trophy },
    ],
  },
  {
    // Une seule porte : les états (nouvelles, en cours, terminées) sont des
    // pilules sur la page Commandes elle-même.
    titre: 'Ventes',
    entrees: [{ to: '/orders', label: 'Commandes', icon: ShoppingBag }],
  },
  {
    // Une seule porte, comme Ventes : les états sont des onglets sur la page.
    titre: 'Livraisons',
    entrees: [{ to: '/livraisons', label: 'Livraisons', icon: Truck }],
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

/**
 * Une jauge à son maximum, en dégradé multicolore — l'icône de la ligne
 * « MES RAYONS BOOST ». Lucide ne sait pas peindre un trait en dégradé,
 * d'où ce SVG à nous : l'arc et l'aiguille prennent le même dégradé
 * violet → fuchsia → ambre que le mot BOOST.
 */
function JaugeMax({ taille = 14 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="jauge-boost" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.5" stopColor="#e879f9" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      {/* L'arc du cadran, et l'aiguille collée à droite : plein régime. */}
      <path d="M4 18a8.5 8.5 0 1 1 17 0" stroke="url(#jauge-boost)" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="12.5" y1="18" x2="19" y2="12" stroke="url(#jauge-boost)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

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
      // Seuls les rayons dont le chef est embauché (en poste) : un rayon à
      // l'arrêt se retrouve par « Mes chefs de rayon », pas dans le déroulant.
      .then((list) => setRayons(list.filter((r) => r.active)))
      .catch(() => {
        // Session expirée ou API muette : le menu se passe des rayons.
      })
  }, [pathname])

  return (
    // Le thème glassmorphism vaut pour toute l'application (04/09/2026) :
    // fond noir vivant — les gouttes de la lampe à lave — sous des blocs en
    // verre. `relative` sur l'aside et le main les fait peindre au-dessus.
    <div className="min-h-screen text-white flex">
      <FondVivant />
      <aside className="relative w-56 shrink-0 border-r border-white/10 bg-black/35 p-4 backdrop-blur-xl flex flex-col">
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

              {/* Toute l'équipe des rayons au même endroit (05/09/2026) :
                  « Mes chefs de rayon » en première ligne, le déroulant des
                  rayons au chef embauché juste dessous — chaque rayon ouvre
                  sa fiche sur le tchat du chef, ses analyses listées sous la
                  conversation —, puis les deux pages transverses. */}
              {section.titre === 'Mes rayons IA' ? (
                <>
                  <Link
                    to="/rayons"
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      estActive('/rayons')
                        ? 'bg-purple-500/20 text-white'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Users size={18} />
                    <span>Mes chefs de rayon</span>
                  </Link>

                  {rayons.length > 0 && (
                    /*
                      Replié par défaut, et c'est le point.
                      Vingt-quatre rayons déroulés à la verticale poussaient le
                      solde de crédits et l'adresse du compte hors de l'écran.
                      Un rayon actif rouvre la liste tout seul — s'y trouver et
                      ne pas la voir serait pire que la longueur.
                    */
                    <details className="group" open={rayonActif !== null}>
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1 text-[11px] uppercase tracking-wide text-gray-500 hover:text-gray-300">
                        {/* La jauge au maximum, multicolore : c'est la promesse
                            de la ligne — des rayons poussés à fond. */}
                        <JaugeMax />
                        <span>
                          {'Mes rayons '}
                          <b className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text font-black text-transparent">
                            BOOST
                          </b>
                        </span>
                        <ChevronRight size={10} className="transition-transform group-open:rotate-90" />
                        <span className="ml-auto normal-case tracking-normal text-gray-600">
                          {enAttente > 0 ? `${rayons.length} · ${enAttente} en attente` : rayons.length}
                        </span>
                      </summary>
                      {rayons.map((r) => {
                        const active = pathname.startsWith(`/rayon/${r.id}`)
                        return (
                          <Link
                            key={r.id}
                            to={`/rayon/${r.id}`}
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
                </>
              ) : null}

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
      <main className="relative flex-1 px-6 pb-6 md:px-8 md:pb-8 overflow-x-hidden">
        {/* Les six jauges, fixes en tête de chaque page : fait sur possible,
            et la porte vers l'endroit où on agit (04/09/2026). */}
        <BandeauJauges />
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
          {/* Le menu horizontal mobile (Dashboard / Pilote auto / Agents)
              doublait le menu latéral : retiré le 05/09/2026 à la demande. */}
          {children}
        </div>
      </main>
    </div>
  )
}
