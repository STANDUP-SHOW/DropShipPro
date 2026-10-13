import type { ElementType } from 'react'
import {
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Calculator,
  ChartColumn,
  ClipboardList,
  FolderTree,
  Globe,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Megaphone,
  Monitor,
  MessagesSquare,
  Newspaper,
  Package,
  Plug,
  Search,
  Settings,
  Share2,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Store,
  Ticket,
  TrendingUp,
  Trophy,
  Truck,
  UserRound,
  Users,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react'
import { DropCoin } from './DropCoin'
import { IconeChrome } from './IconeChrome'
import { IconeDropShop } from './LogoDropShop'
import { IconeShopify } from './MenuBoutiques'

/**
 * Le menu de l'espace connecté, rassemblé en six groupes (maquette de Max du
 * 13/10/2026) : Pilotage, Catalogue, Canaux de vente, Marketing & veille,
 * Opérations, Gestion. Chaque entrée garde son icône — demandé expressément
 * pour Mes annonces, Acquérir et l'extension, qui porte le logo de Chrome.
 *
 * Une seule table sert au menu latéral, au fil d'Ariane de la barre du haut et
 * à la recherche de page (Ctrl K) : ajouter une page ici la rend trouvable
 * partout à la fois.
 */

/** L'icône d'AUTO-SHIPPER : celle de son logo (11/10/2026). */
export function IconeAutoShipper({ size = 16 }: { size?: number }) {
  return <img src="/marque/autoshipper-icone-64.png" alt="" aria-hidden width={size} height={size} className="shrink-0 rounded-[4px]" />
}

function IconeDropShop16({ size = 16 }: { size?: number }) {
  return <IconeDropShop size={size} />
}

function IconeShopify16({ size = 16 }: { size?: number }) {
  return <IconeShopify size={size} />
}

export interface EntreeMenu {
  to: string
  label: string
  icon: ElementType
  /** Mots en plus pour la recherche de page (anciens libellés compris). */
  mots?: string
}

export interface GroupeMenu {
  id: string
  titre: string
  icon: ElementType
  /** La teinte de l'icône du groupe, prise dans les chartes maison. */
  teinte: string
  entrees: EntreeMenu[]
}

/** Entrée spéciale : le déroulant des rayons embauchés, rendu à cet endroit. */
export const RAYONS_BOOST = '#rayons-boost'

export const GROUPES: GroupeMenu[] = [
  {
    id: 'pilotage',
    titre: 'Pilotage',
    icon: LayoutDashboard,
    teinte: '#f28a4b',
    entrees: [
      { to: '/statistiques', label: "Vue d'ensemble", icon: LayoutDashboard, mots: 'dashboard tableau de bord statistiques' },
      { to: '/pilote', label: 'AUTO-SHIPPER', icon: IconeAutoShipper, mots: 'pilote automatique' },
      { to: '/agents', label: 'Mes agents IA', icon: Users, mots: 'agents admin' },
    ],
  },
  {
    id: 'catalogue',
    titre: 'Catalogue',
    icon: Package,
    teinte: '#e85290',
    entrees: [
      { to: '/dashboard', label: 'Mes annonces', icon: Package, mots: 'produits fiches' },
      { to: '/acquisition', label: 'Acquérir des produits', icon: Link2, mots: 'comment acquérir import' },
      { to: '/extension', label: 'Extension Chrome', icon: IconeChrome, mots: 'google navigateur' },
      { to: '/application-desktop', label: 'Application desktop', icon: Monitor, mots: 'dropshipper desktop windows import en lot logiciel' },
      { to: '/fournisseurs', label: 'Fournisseurs', icon: Boxes, mots: 'sourcing' },
      { to: '/catalogues', label: 'Catalogues connectés', icon: Search },
      { to: '/categories', label: 'Catégories', icon: FolderTree },
    ],
  },
  {
    id: 'canaux',
    titre: 'Canaux de vente',
    icon: ArrowUpRight,
    teinte: '#a78bfa',
    entrees: [
      { to: '/plateformes-vente', label: 'Marketplaces', icon: Store, mots: 'market places diffusion' },
      { to: '/mes-sites', label: 'Mes boutiques', icon: Globe, mots: 'mes sites vitrines' },
      { to: '/dropshop-market', label: 'DropShop Market', icon: ShoppingBasket },
      { to: '/creer-boutique', label: 'Créer une DropShop', icon: IconeDropShop16, mots: 'boutique ia' },
      { to: '/boutique-shopify', label: 'Connecter Shopify', icon: IconeShopify16 },
    ],
  },
  {
    id: 'marketing',
    titre: 'Marketing & veille',
    icon: Sparkles,
    teinte: '#fdbf06',
    entrees: [
      { to: '/marketing', label: 'Studio publicitaire', icon: Megaphone, mots: 'commercialisation publicité' },
      { to: '/reseaux', label: 'Réseaux & régies', icon: Share2, mots: 'réseaux sociaux' },
      { to: '/reseaux?vue=analyses', label: 'Analyses réseaux', icon: ChartColumn },
      { to: '/reseaux?vue=prompts', label: 'Prompts IA', icon: Wand2 },
      { to: '/rayons', label: 'Chefs de rayon', icon: UserRound, mots: 'mes chefs de rayon' },
      { to: RAYONS_BOOST, label: 'Mes rayons BOOST', icon: Sparkles },
      { to: '/fresh-news', label: 'Fresh news', icon: Newspaper, mots: 'veille' },
      { to: '/analyse-marche', label: 'Analyses de marché', icon: TrendingUp },
      { to: '/produits-gagnants', label: 'Produits gagnants', icon: Trophy },
      { to: '/api-power/', label: 'API Power', icon: Zap },
    ],
  },
  {
    id: 'operations',
    titre: 'Opérations',
    icon: ArrowLeftRight,
    teinte: '#34d399',
    entrees: [
      { to: '/orders', label: 'Commandes clients', icon: ShoppingBag, mots: 'ventes' },
      { to: '/commandes-fournisseurs', label: 'Commandes fournisseurs', icon: ClipboardList },
      { to: '/livraisons', label: 'Livraisons', icon: Truck, mots: 'expéditions suivi' },
      { to: '/sav', label: 'SAV clients', icon: LifeBuoy, mots: 'service après-vente' },
      { to: '/messages', label: 'Messages clients', icon: Inbox, mots: 'messagerie market places' },
      { to: '/sav-fournisseurs', label: 'SAV fournisseurs', icon: Wrench },
      { to: '/messagerie-fournisseurs', label: 'Messages fournisseurs', icon: MessagesSquare },
    ],
  },
  {
    id: 'gestion',
    titre: 'Gestion',
    icon: Settings,
    teinte: '#b8c0d0',
    entrees: [
      { to: '/comptabilite', label: 'Comptabilité', icon: Calculator },
      { to: '/credits', label: 'Mes crédits', icon: DropCoin, mots: 'drops solde factures' },
      { to: '/settings', label: 'Réglages', icon: Settings, mots: 'compte' },
      { to: '/api-links', label: 'Connexions avancées', icon: Plug, mots: 'api clés' },
      { to: '/tickets', label: 'Mes tickets', icon: Ticket, mots: 'assistance' },
      { to: '/guide', label: "Mode d'emploi", icon: BookOpen, mots: 'guide' },
      { to: '/guide#contact', label: 'Aide & contact', icon: LifeBuoy },
    ],
  },
]

/** Toutes les vraies pages (le déroulant des rayons n'en est pas une). */
export const PAGES = GROUPES.flatMap((g) =>
  g.entrees.filter((e) => e.to !== RAYONS_BOOST).map((e) => ({ ...e, groupe: g.titre, groupeId: g.id })),
)

/** Les entrées qui portent un paramètre : elles priment sur leur adresse nue. */
const PRECISES = PAGES.map((e) => e.to).filter((to) => to.includes('?') || to.includes('#'))

/**
 * Une entrée avec ?vue= ou #ancre n'est active que sur sa variante exacte ; une
 * entrée sans paramètre cède à l'entrée plus précise qui correspond — sinon
 * « Réseaux » et « Prompts IA » s'allumeraient ensemble sur /reseaux?vue=prompts.
 */
export function entreeActive(to: string, pathname: string, adresseComplete: string) {
  if (to.includes('?') || to.includes('#')) return adresseComplete === to
  const nu = to.replace(/\/$/, '')
  if (pathname.replace(/\/$/, '') !== nu) return false
  return !PRECISES.some((p) => p === adresseComplete && p.startsWith(`${to}?`))
}

/** La page du menu où l'on se trouve, pour le fil d'Ariane et le groupe ouvert. */
export function pageCourante(pathname: string, adresseComplete: string) {
  const exacte = PAGES.find((p) => entreeActive(p.to, pathname, adresseComplete))
  if (exacte) return exacte
  // Les sous-pages : une fiche produit vit sous Mes annonces, un rayon sous les
  // chefs de rayon, un agent sous Mes agents.
  if (pathname.startsWith('/products/')) return PAGES.find((p) => p.to === '/dashboard')
  if (pathname.startsWith('/rayon/')) return { ...PAGES.find((p) => p.to === '/rayons')!, label: 'Mes rayons BOOST' }
  if (pathname.startsWith('/agents/')) return PAGES.find((p) => p.to === '/agents')
  return undefined
}
