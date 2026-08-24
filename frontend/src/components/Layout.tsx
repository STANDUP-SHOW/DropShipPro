import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Package, ShoppingBag, Settings as SettingsIcon, LogOut, BookOpen, Coins , Radar, UserPlus } from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

const NAV = [
  { to: '/dashboard', label: 'Mes annonces', icon: Package },
  { to: '/rayons', label: 'Chefs de rayon', icon: UserPlus },
  { to: '/veille', label: 'Veille', icon: Radar },
  { to: '/orders', label: 'Commandes', icon: ShoppingBag },
  { to: '/abonnement', label: 'Mon compte', icon: Coins },
  { to: '/guide', label: 'Aide', icon: BookOpen },
  { to: '/settings', label: 'Réglages', icon: SettingsIcon },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { logout, user } = useAuth()
  const [solde, setSolde] = useState<{ credits: number; premium: boolean } | null>(null)

  useEffect(() => {
    api
      .myBilling()
      .then((b) => setSolde({ credits: b.credits, premium: b.premium }))
      .catch(() => {
        // Ancienne session ou API indisponible : on n'affiche simplement rien.
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
