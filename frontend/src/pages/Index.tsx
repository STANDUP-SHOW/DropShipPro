import { Link } from 'react-router-dom'
import { Zap, Globe, ShieldCheck, ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'
import { isAuthed } from '../lib/api'

const FEATURES = [
  {
    icon: Zap,
    color: 'text-yellow-400',
    title: 'IA Intelligente',
    text: "L'IA réécrit vos descriptions, génère des mots-clés SEO et optimise chaque annonce pour maximiser les ventes.",
  },
  {
    icon: Globe,
    color: 'text-blue-400',
    title: 'Multi-Plateforme',
    text: 'Publiez simultanément sur Leboncoin, Vinted, Amazon, eBay et votre propre site en un seul clic.',
  },
  {
    icon: ShieldCheck,
    color: 'text-emerald-400',
    title: 'Filigrane Auto',
    text: 'Protégez vos images avec le filigrane de votre boutique automatiquement appliqué sur chaque photo.',
  },
]

export default function Index() {
  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <Logo />
        <Link
          to={isAuthed() ? '/dashboard' : '/login'}
          className="rounded-lg border border-purple-400/40 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 transition"
        >
          Tableau de bord
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 text-center pt-16 pb-24">
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
          Automatisez votre <span className="text-gradient-brand">Dropshipping</span>
        </h1>
        <p className="mt-6 text-lg text-gray-300 max-w-2xl mx-auto">
          Importez un produit depuis Temu ou JoyBuy, l'IA améliore l'annonce, ajoute votre filigrane, et publie sur
          toutes les plateformes en un clic.
        </p>
        <Link
          to={isAuthed() ? '/dashboard' : '/register'}
          className="btn-gradient inline-flex items-center gap-2 mt-8 rounded-xl px-6 py-3 font-semibold shadow-lg shadow-purple-900/40 hover:opacity-90 transition"
        >
          Commencer maintenant <ArrowRight size={18} />
        </Link>

        <div className="grid md:grid-cols-3 gap-5 mt-20 text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur">
              <f.icon className={f.color} size={28} />
              <h2 className="mt-4 font-bold text-lg">{f.title}</h2>
              <p className="mt-2 text-sm text-gray-400">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
