import { Link, useLocation } from 'react-router-dom'
import { Fragment, useEffect, useState } from 'react'
import { Package, ShoppingBag, Settings as SettingsIcon, LogOut, BookOpen, Inbox, Truck, Users, Megaphone, Store, Calculator, Boxes, Images, FolderTree, LifeBuoy, ChevronRight, LayoutDashboard, Link2, Puzzle, TrendingUp, Trophy, Newspaper, Mail, Search, Menu as MenuIcon, X } from 'lucide-react'
import { DropCoin } from './DropCoin'
import { Logo } from './Logo'
import { FondVivant } from './FondVivant'
import { BoutonTheme } from './BoutonTheme'
import { MenuBoutiques } from './MenuBoutiques'
import { BandeauJauges } from './BandeauJauges'
import { BandeauNotifications } from './BandeauNotifications'
import { useAuth } from '../lib/auth'
import { demoAutorise } from '../lib/demo'
import { useNeonVarie } from '../lib/neonColors'
import { api } from '../lib/api'

/**
 * L'icône d'Auto-Shipper : l'animation de sa page en miniature — le noyau
 * bleu et les anneaux segmentés feu et glace. Pas de « AI » au centre, il
 * serait illisible à seize pixels.
 */
function IconeAutoShipper({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="ico-as-feu" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <radialGradient id="ico-as-noyau" cx="0.38" cy="0.32" r="0.9">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#2563eb" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="4.2" fill="url(#ico-as-noyau)" />
      <circle cx="12" cy="12" r="7" stroke="url(#ico-as-feu)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="5 3 2 4" fill="none" />
      <circle cx="12" cy="12" r="9.6" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="6 3 1 5" opacity="0.85" fill="none" />
    </svg>
  )
}

const NAV = [
  // Le tableau de bord d abord : l accueil du vendeur, ce sont ses chiffres.
  { to: '/statistiques', label: 'Dashboard', icon: LayoutDashboard },
  // La page « Pilote auto » est devenue l'agent AUTO-SHIPPER AI (06/09/2026) ;
  // son entrée porte l'icône et le dégradé bleu → jaune de son animation.
  { to: '/pilote', label: 'Auto-SHIPPER IA', icon: IconeAutoShipper },
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
  /**
   * `externe` : l'entrée quitte l'application et s'ouvre dans un autre onglet.
   */
  entrees: Array<{ to: string; label: string; icon: React.ElementType; externe?: boolean }>
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
      // Parcourir le catalogue de ceux qui sont reliés, et importer de là :
      // la capacité vivait dans les connecteurs sans aucun écran pour y aller.
      { to: '/catalogues', label: 'Catalogues connectés', icon: Search },
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
      // Les deux boutiques — la nôtre et celle de Shopify — ne sont plus deux
      // entrées plates : elles ont leur bloc à trois onglets (Créez, Modifier,
      // Consulter), rendu juste après cette section. Voir MenuBoutiques.tsx.
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
      { to: '/fresh-news', label: 'Fresh news', icon: Newspaper },
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
    entrees: [
      { to: '/sav-fournisseurs', label: 'Service après-vente', icon: LifeBuoy },
      { to: '/messagerie-fournisseurs', label: 'Messagerie fournisseurs', icon: Inbox },
    ],
  },
  {
    titre: 'Comptabilité',
    entrees: [{ to: '/comptabilite', label: 'Comptabilité', icon: Calculator }],
  },
  {
    titre: 'DropShipper',
    entrees: [
      { to: '/settings', label: 'Réglages', icon: SettingsIcon },
      { to: '/credits', label: 'Mes crédits', icon: DropCoin },
      { to: '/tickets', label: 'Mes tickets', icon: LifeBuoy },
      // Réservée à l'admin : filtrée au rendu par demoAutorise(user).
      { to: '/admin/newsletter', label: 'Newsletter', icon: Mail },
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

export function Layout({ children }: { children: React.ReactNode; large?: boolean }) {
  const { pathname, search, hash } = useLocation()
  /** Une entree avec ?etat= ou #ancre n est active que sur sa variante exacte. */
  const estActive = (to: string) =>
    to.includes('?') || to.includes('#') ? pathname + search + hash === to : pathname === to
  const { logout, user } = useAuth()
  // Peint chaque bloc d'une couleur de néon variée (vert/jaune/bleu/rose/orange/
  // violet/bleu-ciel), au lieu d'un rose uniforme — et suit les blocs qui se
  // montent après le chargement des données.
  useNeonVarie()
  const [solde, setSolde] = useState<{ credits: number; euroParDrop: number } | null>(null)
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

  /**
   * Le menu latéral sur téléphone : un tiroir, fermé par défaut.
   *
   * **Il n'y avait rien.** Le menu faisait 224 px de large, `shrink-0`, sans
   * aucune règle d'écran : sur un téléphone de 375 px il mangeait 60 % de la
   * largeur, et les 40 % restants devaient contenir la page entière. Rien ne
   * permettait de le replier — l'application était inutilisable en mobilité,
   * alors que c'est là qu'un vendeur relève ses commandes.
   *
   * Le tiroir se ferme **à chaque changement de page** : sur un écran de
   * téléphone il recouvre tout, et le laisser ouvert après un clic cacherait
   * la page qu'on vient de demander. Au-dessus de `md`, il redevient la
   * colonne fixe d'avant et cet état n'a plus aucun effet.
   */
  const [menuOuvert, setMenuOuvert] = useState(false)
  useEffect(() => {
    setMenuOuvert(false)
  }, [pathname])

  useEffect(() => {
    api
      .myBilling()
      .then((b) => setSolde({ credits: b.credits, euroParDrop: b.euroParDrop }))
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
    <div className="min-h-screen text-white md:flex">
      <FondVivant />

      {/*
        La barre de téléphone : la seule chose qui reste à l'écran quand le
        menu est un tiroir. Elle porte les trois gestes qu'on ne doit jamais
        avoir à chercher — ouvrir le menu, revenir à l'accueil, voir son solde
        — et rien d'autre : la place manque, et chaque élément ajouté ici
        repousse la page vers le bas sur tous les écrans.
      */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-[#08070f]/85 px-4 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setMenuOuvert(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOuvert}
          className="-ml-1 rounded-lg p-1.5 text-gray-300 transition hover:bg-white/10 hover:text-white"
        >
          <MenuIcon size={22} />
        </button>
        <Link to="/dashboard" className="min-w-0 shrink">
          <Logo size={20} />
        </Link>
        {solde ? (
          <Link
            to="/credits"
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5"
          >
            <DropCoin size={18} className="shrink-0" />
            <span className="text-xs font-extrabold text-white">
              {solde.credits.toLocaleString('fr-FR')}
            </span>
          </Link>
        ) : null}
      </header>

      {/*
        Le voile. Il assombrit la page ET il ferme le tiroir : sur téléphone,
        toucher à côté est le geste attendu pour refermer un panneau, et sans
        lui la seule sortie serait la croix — qu'on ne trouve pas toujours du
        pouce. `md:hidden` parce qu'au-dessus il n'y a pas de tiroir à fermer.
      */}
      {menuOuvert ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenuOuvert(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 bg-[#08070f]/95 p-4 backdrop-blur-xl transition-transform duration-200 ease-out md:relative md:z-10 md:w-56 md:max-w-none md:shrink-0 md:translate-x-0 md:overflow-visible md:bg-black/35 ${
          menuOuvert ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link to="/dashboard" className="min-w-0">
            <Logo size={22} />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
            className="-mr-1 rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <BoutonTheme />
        <nav className="space-y-1 flex-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to)
            return (
              <Fragment key={item.to}>
                <Link
                  to={item.to}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon size={16} />
                  {/* Auto-Shipper porte les couleurs de son animation : bold,
                      du bleu du noyau au jaune de l'anneau de feu. */}
                  {item.to === '/pilote' ? (
                    <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-amber-400 bg-clip-text font-bold text-transparent">
                      {item.label}
                    </span>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </Link>

                {/* Le portefeuille de drops vivait ici depuis le 10/09/2026. Il
                    est parti dans le bandeau du haut le 16/09 : un solde n'est
                    pas une destination de navigation, c'est un chiffre qu'on
                    surveille en travaillant — et dans un menu devenu tiroir sur
                    téléphone, il disparaissait entièrement. Voir BlocDrops. */}
              </Fragment>
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

              {section.entrees
                .filter((item) => item.to !== '/admin/newsletter' || demoAutorise(user?.email))
                .map((item) => {
                  const classes = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    !item.externe && estActive(item.to)
                      ? 'bg-purple-500/20 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`

                  return item.externe ? (
                    <a key={item.to} href={item.to} target="_blank" rel="noreferrer noopener" className={classes}>
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </a>
                  ) : (
                    <Link key={item.to} to={item.to} className={classes}>
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}

              {/* Les deux boutiques, en bas de Diffusion : titre en gras de la
                  marque, prix à côté, et trois onglets sur le dégradé rose. */}
              {section.titre === 'Diffusion' ? <MenuBoutiques /> : null}
            </div>
          ))}

        </nav>
        <div className="border-t border-white/10 pt-3 text-xs text-gray-400">
          {/* Le solde vit désormais dans son bloc, sous Dashboard : plus de
              badge répété ici. */}
          <p className="truncate">{user?.email}</p>
          <button onClick={logout} className="mt-2 flex items-center gap-1.5 text-gray-400 hover:text-white">
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </aside>
      {/* `min-w-0` : sans lui, un tableau ou un titre long élargit le `flex-1`
          au-delà de l'écran et c'est la page ENTIÈRE qui défile de côté. */}
      <main className="relative min-w-0 flex-1 overflow-x-hidden px-4 pb-6 md:px-8 md:pb-8">
        {/* Les six jauges, fixes en tête de chaque page : fait sur possible,
            et la porte vers l'endroit où on agit (04/09/2026). */}
        <BandeauJauges />
        {/*
          Toutes les pages partagent le cadre du bandeau des six jauges —
          demandé le 06/09/2026 : « tous les affichages justifiés autour des
          six boutons du haut ». Le couloir de lecture à 1024 px laissait un
          tiers d'écran vide en 16/9 pendant que les jauges s'étendaient ;
          `large` ne distingue plus rien, il reste pour ne rien casser.
        */}
        <div className="mx-auto max-w-[1800px]">
          {/*
            La ligne « Notifications + Extension », sous les six jauges et sur
            toutes les pages (10/09/2026). Elle remplace l'ancien bandeau
            d'avertissement d'extension : au Chrome Web Store, une version en
            retard se met à jour toute seule — plus d'alarme permanente, juste
            l'état dans le bloc Extension, et le détail au survol.
          */}
          <BandeauNotifications />
          {/* Le menu horizontal mobile (Dashboard / Pilote auto / Agents)
              doublait le menu latéral : retiré le 05/09/2026 à la demande. */}
          {children}
        </div>
      </main>
    </div>
  )
}
