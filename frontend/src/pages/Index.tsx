import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Logo } from '../components/Logo'
import { api, isAuthed } from '../lib/api'
import { CHROME_STORE_URL } from '../lib/extension'
import { ReviewGrid, Stars, type PublicReview } from '../components/Reviews'
import { AccueilDiaporama, ImageOuRepli } from '../components/AccueilDiaporama'
import accueil from '../data/accueil-themes.json'
import { FriseLogos, type LogoFrise } from '../components/FriseLogos'
import fournisseurs from '../data/fournisseurs.json'
import canaux from '../data/canaux.json'

/*
 * Les frises de logos (24/09/2026) : sous « fournisseurs », les 38 fournisseurs
 * de droite à gauche ; sous « diffusion », les 314 canaux de l'annuaire sur
 * deux lignes qui vont dans l'autre sens — et en sens contraire l'une de
 * l'autre. Les deux JSON sont engendrés (exporter-fournisseurs.ts,
 * build-channel-directory.cjs) : rien n'est recopié à la main ici.
 */
const FOURNISSEURS_FRISE: LogoFrise[] = fournisseurs.fournisseurs.map((f) => ({ id: f.id, label: f.label, logo: f.logo, couleur: f.color }))
const CANAUX_FRISE: [LogoFrise[], LogoFrise[]] = [[], []]
canaux.canaux.forEach((c, i) => CANAUX_FRISE[i % 2].push({ id: c.id, label: c.label, logo: c.logo }))

/**
 * La page d'accueil : ce que fait DropShipper IA, thème par thème.
 *
 * Refaite le 23/09/2026 sur la demande de Max, « à la manière de Channable » :
 * un gros titre et une courte description d'un côté, une illustration de
 * l'autre, un fond qui alterne, et ainsi de suite pour chaque thème. Les
 * thèmes, leurs textes et leurs images vivent dans `data/accueil-themes.json`
 * — la même table que la version pré-rendue pour les robots et les pages
 * « en savoir plus » (/fonctions/<slug>/), écrites par build-geo.cjs. Un texte
 * changé ici sans l'être là-bas ferait deux accueils différents selon qu'on
 * est un visiteur ou un robot.
 *
 * Le diaporama d'arrivée envoie sur la section du thème ; chaque section envoie
 * sur sa page détaillée et sur l'offre correspondante.
 */
const THEMES = accueil.themes

/** Le menu court de l'accueil : des libellés d'un mot, la liste complète est dans la page. */
const NAV = [
  { href: '#scraping-produits', label: 'Import' },
  { href: '#annonces-ia', label: 'Annonces' },
  { href: '#dropshop-ia', label: 'Boutiques' },
  { href: '#diffusion', label: 'Diffusion' },
  { href: '#analyses-de-marche', label: 'Analyses' },
  { href: '#auto-shipper', label: 'Auto-mode' },
  { href: '/tarifs/', label: 'Tarifs' },
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

  const cible = isAuthed() ? '/dashboard' : '/register'

  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#08070f]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <nav className="hidden items-center gap-5 whitespace-nowrap text-sm text-gray-300 lg:flex" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>
          <Link
            to={isAuthed() ? '/dashboard' : '/login'}
            className="rounded-lg border border-purple-400/40 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            {isAuthed() ? 'Tableau de bord' : 'Se connecter'}
          </Link>
        </div>
      </header>

      <main>
        {/* Le héros : la phrase de Max, et le diaporama des thèmes. */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 text-center md:pt-20">
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
            {accueil.hero.titre.replace(" avec l'IA", '')} <span className="text-gradient-brand">avec l'IA</span>
          </h1>
          <p className="mt-4 text-2xl font-semibold text-gray-200 md:text-3xl">{accueil.hero.sousTitre}</p>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">{accueil.hero.texte}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={cible}
              className="btn-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold shadow-lg shadow-purple-900/40 transition hover:opacity-90"
            >
              Commencer — 120 drops offerts <ArrowRight size={18} />
            </Link>
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2.5 rounded-xl border-2 border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="9" fill="#fff" />
                <path d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-9.53 6.94L6.7 13.9A20 20 0 0 1 24 4Z" fill="#ea4335" />
                <path d="M6.7 13.9 14.47 27.4A10 10 0 0 0 24 34c.7 0 1.37-.07 2.02-.2l-7.7 13.34A20 20 0 0 1 6.7 13.9Z" fill="#34a853" />
                <path d="M41.32 14A20 20 0 0 1 26.02 47.8L33.7 34.4A10 10 0 0 0 34 14Z" fill="#fbbc05" />
              </svg>
              Extension Chrome
            </a>
          </div>
          <p className="mt-3 text-xs text-gray-500">Sans abonnement. 1 drop = 0,01 €. Une annonce importée et réécrite par l'IA : 0,12 €.</p>

          <AccueilDiaporama themes={THEMES} />
        </section>

        {/* Un thème par section : titre, texte, illustration, fond qui alterne. */}
        {THEMES.map((t, i) => {
          const inverse = i % 2 === 1
          return (
            <section
              key={t.slug}
              id={t.slug}
              className={`scroll-mt-20 border-t border-white/5 ${
                i % 3 === 0 ? 'bg-[#0b0714]' : i % 3 === 1 ? 'bg-gradient-to-b from-[#160d2e] to-[#0b0714]' : 'bg-[#0f0a1f]'
              }`}
            >
              <div className={`mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24 ${inverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">{t.eyebrow}</p>
                  <h2 className={`neon neon-${(i % 6) + 1} mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-5xl`}>{t.titre}</h2>
                  <p className="mt-5 text-lg text-gray-300">{t.accroche}</p>
                  <ul className="mt-6 space-y-2.5">
                    {t.points.map((p) => (
                      <li key={p} className="flex gap-3 text-sm text-gray-400">
                        <Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href={`/fonctions/${t.slug}/`}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
                    >
                      Plus d'informations <ArrowRight size={16} />
                    </a>
                    <OffreLien href={t.offre.href} label={t.offre.label} />
                  </div>
                </div>
                <a
                  href={`/fonctions/${t.slug}/`}
                  aria-label={`${t.titre} — plus d'informations`}
                  className="block aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/40 transition hover:-translate-y-1 hover:shadow-purple-950/50"
                >
                  <ImageOuRepli src={t.image} slug={t.slug} alt={t.titre} actif={i < 2} />
                </a>
              </div>
              {t.slug === 'fournisseurs' ? <FriseLogos logos={FOURNISSEURS_FRISE} sens="gauche" className="mb-6" /> : null}
              {t.slug === 'diffusion' ? (
                <div className="mb-6 space-y-3">
                  <FriseLogos logos={CANAUX_FRISE[0]} sens="droite" />
                  <FriseLogos logos={CANAUX_FRISE[1]} sens="gauche" />
                </div>
              ) : null}
            </section>
          )
        })}

        {/* Les douze derniers avis. Masqué tant que personne ne s'est exprimé :
            une section « Avis » vide inspire moins confiance que pas de section. */}
        {reviews.length > 0 && (
          <section className="border-t border-white/5 bg-[#0b0714]">
            <div className="mx-auto max-w-6xl px-6 py-16">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Ce qu'en disent les utilisateurs</h2>
                  {average !== null && (
                    <div className="mt-2 flex items-center gap-3">
                      <Stars rating={Math.round(average)} size={16} />
                      <span className="text-sm text-gray-400">{`${average.toFixed(1)} sur 5 — ${count} avis`}</span>
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
            </div>
          </section>
        )}

        <section className="border-t border-white/5 bg-gradient-to-b from-[#160d2e] to-[#0b0714]">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center">
            <h2 className="text-3xl font-extrabold md:text-4xl">Prenez l'annonce n'importe où. Publiez-la partout.</h2>
            <p className="mt-4 text-gray-400">Compte gratuit, 120 drops offerts, aucun abonnement.</p>
            <Link to={cible} className="btn-gradient mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-semibold shadow-lg shadow-purple-900/40 transition hover:opacity-90">
              Créer mon compte <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        {/* Crawl path to the static SEO pages: without a link from the home page,
            Google only ever learns about them through the sitemap. Plain <a>, not
            <Link>: these are real HTML files, not React routes. */}
        <nav className="mx-auto max-w-6xl border-t border-white/10 px-6 pb-16 pt-8 text-left">
          <h2 className="text-sm font-semibold text-gray-300">Vendre sur les marketplaces</h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400">
            {SEO_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-purple-300">
                {link.label}
              </a>
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-500">
            <a href="/analyses/" className="hover:text-gray-300">
              Analyses de marché
            </a>
            {' · '}
            <a href="/tarifs/" className="hover:text-gray-300">
              Tarifs
            </a>
            {' · '}
            <a href="/faq/" className="hover:text-gray-300">
              Questions fréquentes
            </a>
            {' · '}
            <a href="/a-propos/" className="hover:text-gray-300">
              À propos
            </a>
            {' · '}
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

/** L'offre : une route de l'application (Link) ou une page/site externe (a). */
function OffreLien({ href, label }: { href: string; label: string }) {
  const classe = 'btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg shadow-purple-900/30 transition hover:opacity-90'
  if (href.startsWith('http')) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={classe}>
        {label} <ArrowRight size={16} />
      </a>
    )
  }
  // Les pages statiques (/tarifs/, /analyses/, /vendre-sur-…/) finissent par « / » : ce sont de vrais fichiers, pas des routes React.
  if (href.endsWith('/')) {
    return (
      <a href={href} className={classe}>
        {label} <ArrowRight size={16} />
      </a>
    )
  }
  return (
    <Link to={isAuthed() && href === '/register' ? '/dashboard' : href} className={classe}>
      {label} <ArrowRight size={16} />
    </Link>
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
