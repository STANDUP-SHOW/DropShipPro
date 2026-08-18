import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Globe, ShieldCheck, ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'
import { api, isAuthed, assetUrl } from '../lib/api'
import { ReviewGrid, Stars, type PublicReview } from '../components/Reviews'

const FEATURES = [
  {
    icon: Zap,
    color: 'text-yellow-400',
    title: 'IA Intelligente',
    text: "L'IA réécrit vos titres et vos descriptions, génère les attributs produit et les mots-clés SEO, et classe automatiquement l'article dans la bonne catégorie de chaque marketplace.",
  },
  {
    icon: Globe,
    color: 'text-blue-400',
    title: 'Multi-Plateforme',
    text: 'Amazon, eBay, Vinted, Leboncoin, Cdiscount, La Redoute, Google Shopping et plus de 15 marketplaces parmi les plus visitées — publiées en un seul clic.',
  },
  {
    icon: ShieldCheck,
    color: 'text-emerald-400',
    title: 'Filigrane Auto',
    text: 'Protégez vos images avec le filigrane de votre boutique automatiquement appliqué sur chaque photo.',
  },
]

export default function Index() {
  // The twelve most recent reviews, loaded client-side: the home page is served as
  // a static shell, so this arrives just after paint rather than blocking it.
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [count, setCount] = useState(0)
  const [average, setAverage] = useState<number | null>(null)

  useEffect(() => {
    api
      .listPublicReviews(12)
      .then((data) => {
        setReviews(data.reviews)
        setCount(data.count)
        setAverage(data.average)
      })
      .catch(() => {
        // The API being unreachable must not blank out the home page.
      })
  }, [])

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
          Importez un produit depuis n'importe quel site, l'IA améliore l'annonce pour les marketplaces, ajoute votre
          filigrane, et publie sur toutes les plateformes en un clic.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={isAuthed() ? '/dashboard' : '/register'}
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold shadow-lg shadow-purple-900/40 hover:opacity-90 transition"
          >
            Commencer maintenant <ArrowRight size={18} />
          </Link>

          {/* Same visual weight as the primary action: the extension is the fullest
              way to import, and it was previously buried in the settings page. */}
          <a
            href={assetUrl('/api/public/extension.zip')}
            download="dropshipper-ia-extension.zip"
            className="inline-flex items-center gap-2.5 rounded-xl border-2 border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
          >
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r="9" fill="#fff" />
              <path d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-9.53 6.94L6.7 13.9A20 20 0 0 1 24 4Z" fill="#ea4335" />
              <path d="M6.7 13.9 14.47 27.4A10 10 0 0 0 24 34c.7 0 1.37-.07 2.02-.2l-7.7 13.34A20 20 0 0 1 6.7 13.9Z" fill="#34a853" />
              <path d="M41.32 14A20 20 0 0 1 26.02 47.8L33.7 34.4A10 10 0 0 0 34 14Z" fill="#fbbc05" />
            </svg>
            Télécharger l'extension Chrome
          </a>
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Importez un produit d'un simple clic depuis n'importe quelle boutique, avec ses photos,
          son prix et ses variantes.
        </p>

        <div className="grid md:grid-cols-3 gap-5 mt-20 text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur">
              <f.icon className={f.color} size={28} />
              <h2 className="mt-4 font-bold text-lg">{f.title}</h2>
              <p className="mt-2 text-sm text-gray-400">{f.text}</p>
            </div>
          ))}
        </div>

        {/* Les douze derniers avis. Masqué tant que personne ne s'est exprimé :
            une section « Avis » vide inspire moins confiance que pas de section. */}
        {reviews.length > 0 && (
          <section className="mt-20 text-left">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Ce qu'en disent les utilisateurs</h2>
                {average !== null && (
                  <div className="mt-2 flex items-center gap-3">
                    <Stars rating={Math.round(average)} size={16} />
                    <span className="text-sm text-gray-400">
                      {`${average.toFixed(1)} sur 5 — ${count} avis`}
                    </span>
                  </div>
                )}
              </div>
              <Link to="/avis" className="text-sm text-purple-300 hover:underline">
                {count > 12 ? `Voir les ${count} avis` : 'Donner mon avis'}
              </Link>
            </div>
            <div className="mt-6">
              <ReviewGrid reviews={reviews} />
            </div>
          </section>
        )}

        {/* Crawl path to the static SEO pages: without a link from the home page,
            Google only ever learns about them through the sitemap. Plain <a>, not
            <Link>: these are real HTML files, not React routes. */}
        <nav className="mt-20 border-t border-white/10 pt-8 text-left">
          <h2 className="text-sm font-semibold text-gray-300">Vendre sur les marketplaces</h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400">
            {SEO_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-purple-300">
                {link.label}
              </a>
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-500">
            <Link to="/avis" className="hover:text-gray-300">
              Avis des utilisateurs
            </Link>
            {' · '}
            <a href="/confidentialite" className="hover:text-gray-300">
              Politique de confidentialité
            </a>
          </p>
        </nav>
      </main>
    </div>
  )
}

const SEO_LINKS = [
  { href: '/vendre-sur-marketplaces/', label: 'Toutes les plateformes' },
  { href: '/vendre-sur-vinted/', label: 'Vinted' },
  { href: '/vendre-sur-leboncoin/', label: 'Leboncoin' },
  { href: '/vendre-sur-shopify/', label: 'Shopify' },
  { href: '/vendre-sur-ebay/', label: 'eBay' },
  { href: '/vendre-sur-amazon/', label: 'Amazon' },
  { href: '/vendre-sur-facebook-marketplace/', label: 'Facebook Marketplace' },
  { href: '/vendre-sur-google-shopping/', label: 'Google Shopping' },
  { href: '/dropshipping/', label: 'Le dropshipping expliqué' },
  { href: '/logiciel-dropshipping/', label: 'Logiciel de dropshipping' },
  { href: '/vendre-sans-stock/', label: 'Vendre sans stock' },
  { href: '/importer-produits-temu-joybuy/', label: 'Importer depuis Temu' },
  { href: '/publier-annonces-plusieurs-marketplaces/', label: 'Publier en lot' },
  { href: '/filigrane-photos-produits/', label: 'Filigrane des photos' },
]
