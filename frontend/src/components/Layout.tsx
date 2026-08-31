import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Package, ShoppingBag, Settings as SettingsIcon, LogOut, BookOpen, Coins , Plane, Inbox, Truck, Users, Megaphone, PackageSearch, Store, Calculator, Plug, Boxes, Images, FolderTree, LifeBuoy } from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

const NAV = [
  { to: '/pilote', label: 'Pilote auto', icon: Plane },
  { to: '/dashboard', label: 'Mes annonces', icon: Package },
  { to: '/agents', label: 'Mes agents ADMIN', icon: Users },
  { to: '/plateformes-acquisition', label: 'Acquisition', icon: PackageSearch },
  { to: '/api-sourcing-connect', label: 'API fournisseurs', icon: Plug },
  { to: '/gestion-fournisseur', label: 'Gestion fournisseur', icon: Boxes },
  { to: '/plateformes-vente', label: 'Vente', icon: Store },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/mes-pubs', label: 'Mes pubs', icon: Images },
  { to: '/categories', label: 'Catégories', icon: FolderTree },
  { to: '/messages', label: 'Messages', icon: Inbox },
  { to: '/orders', label: 'Commandes', icon: ShoppingBag },
  { to: '/livraisons', label: 'Livraisons', icon: Truck },
  { to: '/comptabilite', label: 'Comptabilité', icon: Calculator },
  { to: '/abonnement', label: 'Mes crédits', icon: Coins },
  { to: '/tickets', label: 'Mes tickets', icon: LifeBuoy },
  { to: '/guide', label: 'Aide', icon: BookOpen },
  { to: '/mes-sites', label: 'Mes sites', icon: Store },
  { to: '/settings', label: 'Réglages', icon: SettingsIcon },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { logout, user } = useAuth()
  const [solde, setSolde] = useState<{ credits: number; premium: boolean } | null>(null)
  /**
   * Les rayons confiés, chacun à son nom.
   *
   * « Veille » ne disait rien à personne. Un vendeur qui tient quatre rayons
   * cherche ce que Karim a trouvé, pas la section veille numéro trois.
   */
  const [rayons, setRayons] = useState<Array<{ id: string; agentName: string; label: string; emoji: string; pending: number }>>([])

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

          {rayons.length > 0 && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-[11px] uppercase tracking-wide text-gray-600">
                Mes rayons
              </p>
              {rayons.map((r) => {
                const active = pathname.startsWith(`/rayon/${r.id}`)
                return (
                  <Link
                    key={r.id}
                    to={`/rayon/${r.id}`}
                    title={r.label}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-base leading-none">{r.emoji}</span>
                    <span className="truncate">{r.agentName}</span>
                    {r.pending > 0 && (
                      <span className="ml-auto rounded-full bg-emerald-400/20 px-1.5 text-[11px] text-emerald-300">
                        {r.pending}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
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
        <div className="mx-auto max-w-5xl">
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
