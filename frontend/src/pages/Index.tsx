import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Logo } from '../components/Logo'
import { api, isAuthed } from '../lib/api'
import { CHROME_STORE_URL } from '../lib/extension'
import { ReviewGrid, Stars, type PublicReview } from '../components/Reviews'
import { BoucleTheme } from '../components/BoucleTheme'
import accueil from '../data/accueil-themes.json'
import { FriseLogos, type LogoFrise } from '../components/FriseLogos'
import PiedDePagePublic from '../components/PiedDePagePublic'
import fournisseurs from '../data/fournisseurs.json'
import canaux from '../data/canaux.json'

/*
 * Les frises de logos (24/09/2026) : sous « fournisseurs », les 38 fournisseurs
 * de droite à gauche ; sous « diffusion », les 314 canaux de l'annuaire sur
 * deux lignes qui vont dans l'autre sens — et en sens contraire l'une de
 * l'autre. Les deux JSON sont engendrés (exporter-fournisseurs.ts,
 * build-channel-directory.cjs) : rien n'est recopié à la main ici.
 */
const FOURNISSEURS_FRISE: LogoFrise[] = fournisseurs.fournisseurs.map((f) => ({ id: f.id, label: f.label, logo: f.logo, couleur: f.color, large: f.large }))
const CANAUX_FRISE: [LogoFrise[], LogoFrise[]] = [[], []]
canaux.canaux.forEach((c, i) => CANAUX_FRISE[i % 2].push({ id: c.id, label: c.label, logo: c.logo, large: c.large }))

/**
 * La page d'accueil : ce que fait DropShipper IA, thème par thème.
 *
 * D'abord refaite le 23/09/2026 sur la demande de Max, « à la manière de Channable » :
 * un gros titre et une courte description d'un côté, une illustration de
 * l'autre, un fond qui alterne, et ainsi de suite pour chaque thème. Les
 * thèmes, leurs textes et leurs images vivent dans `data/accueil-themes.json`
 * — la même table que la version pré-rendue pour les robots et les pages
 * « en savoir plus » (/fonctions/<slug>/), écrites par build-geo.cjs. Un texte
 * changé ici sans l'être là-bas ferait deux accueils différents selon qu'on
 * est un visiteur ou un robot.
 *
 * Synthétisée le 03/10/2026 sur la demande de Max (« plus simple, plus fluide,
 * droit à l'essentiel ; les détails vont dans les pages Plus d'informations ») :
 * une promesse, « Comment ça marche » en trois étapes, « Ce que l'IA fait pour
 * vous » en six lignes, le mode auto, le tarif, l'appel final. Les textes courts
 * sont dans `synthese` du même JSON ; les thèmes complets y restent pour les
 * pages /fonctions/<slug>/ et la version pré-rendue pour les robots.
 */
const S = accueil.synthese

/**
 * Le menu court de l'accueil : des libellés d'un mot. Il envoie sur les pages
 * détaillées (/fonctions/<slug>/, celles du bouton « Plus d'informations »),
 * plus sur des ancres de la page (Max, 03/10/2026).
 */
const NAV = [
  { href: '/fonctions/scraping-produits/', label: 'Import' },
  { href: '/fonctions/annonces-ia/', label: 'Annonces' },
  { href: '/fonctions/dropshop-ia/', label: 'Boutiques' },
  { href: '/fonctions/diffusion/', label: 'Diffusion' },
  { href: '/fonctions/analyses-de-marche/', label: 'Analyses' },
  { href: '/fonctions/auto-shipper/', label: 'Auto-mode' },
  { href: '/tarifs/', label: 'Tarifs' },
  { href: '/api-power/', label: 'API Power' },
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
  const [menuOuvert, setMenuOuvert] = useState(false)

  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#08070f]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-4">
          <Logo />
          <nav className="hidden items-center gap-5 whitespace-nowrap text-sm text-white lg:flex" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-purple-300">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to={isAuthed() ? '/dashboard' : '/login'}
              className="whitespace-nowrap rounded-lg border border-purple-400/40 bg-white/5 px-3 py-2 text-sm font-medium transition hover:bg-white/10 md:px-4"
            >
              {isAuthed() ? 'Tableau de bord' : 'Se connecter'}
            </Link>
            {/* Mobile : le même menu, replié derrière un bouton. */}
            <button
              type="button"
              onClick={() => setMenuOuvert((o) => !o)}
              aria-expanded={menuOuvert}
              aria-label={menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
              className="rounded-lg border border-white/15 bg-white/5 p-2 lg:hidden"
            >
              {menuOuvert ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOuvert && (
          <nav className="border-t border-white/5 px-4 pb-4 lg:hidden" aria-label="Sections">
            <div className="grid grid-cols-2 gap-2 pt-3">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="rounded-lg bg-white/5 px-3 py-2.5 text-sm font-medium">
                  {n.label}
                </a>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main>
        {/* La promesse en trois lignes (synthèse de Max, 03/10/2026). */}
        <section className="mx-auto max-w-6xl px-5 pb-12 pt-12 text-center md:px-6 md:pb-20 md:pt-20">
          <h1 className="mx-auto max-w-4xl text-[2.1rem] font-extrabold leading-[1.1] tracking-tight md:text-6xl">
            {accueil.hero.titre.replace(" avec l'IA", '')} <span className="text-gradient-brand">avec l'IA</span>
          </h1>
          <p className="texte-neon mx-auto mt-5 max-w-3xl text-lg md:mt-6 md:text-2xl">{S.promesse}</p>
          <p className="mx-auto mt-5 max-w-3xl text-sm font-medium text-purple-200 md:text-base">{S.prix}</p>
          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              to={cible}
              className="btn-gradient inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold shadow-lg shadow-purple-900/40 transition hover:opacity-90"
            >
              Commencer — 120 drops offerts <ArrowRight size={18} />
            </Link>
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center gap-2.5 rounded-xl border-2 border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
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
        </section>

        {/* Comment ça marche : trois étapes. Sur PC chaque étape montre la boucle
            de son thème ; sur mobile, le texte seul, pour rester court et léger. */}
        <section id="comment-ca-marche" className="scroll-mt-20 border-t border-white/5 bg-[#0b0714]">
          <div className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-20">
            <h2 className="neon neon-1 text-center text-3xl font-extrabold tracking-tight md:text-5xl">Comment ça marche</h2>
            <ol className="mt-8 grid gap-4 md:mt-12 md:grid-cols-3 md:gap-6">
              {S.etapes.map((e, i) => (
                <li key={e.slug} className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <a href={`/fonctions/${e.slug}/`} aria-label={`${e.titre} — plus d'informations`} className="hidden aspect-[16/10] overflow-hidden md:block">
                    <BoucleTheme poster={`/images/accueil/${e.slug}.jpg`} slug={e.slug} alt={e.titre} />
                  </a>
                  <div className="flex flex-1 flex-col p-5 md:p-6">
                    <p className="flex items-center gap-3 text-xl font-bold md:text-2xl">
                      <span className="btn-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base">{i + 1}</span>
                      {e.titre}
                    </p>
                    <p className="texte-neon mt-3 flex-1 text-base md:text-lg">{e.texte}</p>
                    <PlusInfos slug={e.slug} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {/* Les frises n'ajoutent aucune marge : elles ne doivent pas écarter les blocs. */}
          <FriseLogos logos={CANAUX_FRISE[0]} sens="droite" />
          <FriseLogos logos={CANAUX_FRISE[1]} sens="gauche" />
        </section>

        {/* Ce que l'IA fait pour vous : six lignes, chacune vers sa page. */}
        <section id="ce-que-fait-l-ia" className="scroll-mt-20 border-t border-white/5 bg-gradient-to-b from-[#160d2e] to-[#0b0714]">
          <div className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-20">
            <h2 className="neon neon-2 text-center text-3xl font-extrabold tracking-tight md:text-5xl">Ce que l'IA fait pour vous</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-12 md:gap-5 lg:grid-cols-3">
              {S.ia.map((x) => (
                <li key={x.slug}>
                  <a
                    href={`/fonctions/${x.slug}/`}
                    className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-purple-400/40 hover:bg-white/[0.06] md:p-6"
                  >
                    <span className="text-lg font-bold md:text-xl">{x.titre}</span>
                    <span className="texte-neon mt-2 flex-1 text-base">{x.texte}</span>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-300 group-hover:underline">
                      Plus d'informations <ArrowRight size={15} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <FriseLogos logos={FOURNISSEURS_FRISE} sens="gauche" />
        </section>

        {/* Mode auto et tarif : côte à côte sur PC, l'un sous l'autre sur mobile. */}
        <section className="border-t border-white/5 bg-[#0f0a1f]">
          <div className="mx-auto grid max-w-6xl gap-4 px-5 py-12 md:grid-cols-2 md:gap-6 md:px-6 md:py-20">
            {[
              { ...S.auto, surtitre: 'Mode auto', neon: 'neon-3' },
              { ...S.tarif, surtitre: 'Tarif clair', neon: 'neon-4' },
            ].map((b) => (
              <div key={b.slug} className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">{b.surtitre}</p>
                <h2 className={`neon ${b.neon} mt-3 text-2xl font-extrabold leading-tight md:text-3xl`}>{b.titre}</h2>
                <p className="texte-neon mt-4 flex-1 text-base md:text-lg">{b.texte}</p>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <OffreLien href={b.href} label={b.bouton} />
                  <PlusInfos slug={b.slug} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Les douze derniers avis. Masqué tant que personne ne s'est exprimé :
            une section « Avis » vide inspire moins confiance que pas de section. */}
        {reviews.length > 0 && (
          <section className="texte-neon border-t border-white/5 bg-[#0b0714]">
            <div className="mx-auto max-w-6xl px-6 py-16">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Ce qu'en disent les utilisateurs</h2>
                  {average !== null && (
                    <div className="mt-2 flex items-center gap-3">
                      <Stars rating={Math.round(average)} size={16} />
                      <span className="text-sm text-white">{`${average.toFixed(1)} sur 5 — ${count} avis`}</span>
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
            <p className="texte-neon mt-4 text-lg">Compte gratuit, 120 drops offerts, aucun abonnement.</p>
            <Link to={cible} className="btn-gradient mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-semibold shadow-lg shadow-purple-900/40 transition hover:opacity-90">
              Créer mon compte <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        {/* Crawl path to the static SEO pages: without a link from the home page,
            Google only ever learns about them through the sitemap. Plain <a>, not
            <Link>: these are real HTML files, not React routes. */}
        <nav className="mx-auto max-w-6xl border-t border-white/10 px-6 pb-2 pt-8 text-left">
          <h2 className="text-sm font-semibold text-white">Vendre sur les marketplaces</h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white">
            {SEO_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-purple-300">
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      </main>
      {/* Same footer as the static pages: one table, src/data/pied-de-page.json. */}
      <PiedDePagePublic />
    </div>
  )
}

/** Le lien « Plus d'informations » vers la page détaillée du thème. */
function PlusInfos({ slug }: { slug: string }) {
  return (
    <a href={`/fonctions/${slug}/`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-300 hover:underline">
      Plus d'informations <ArrowRight size={15} />
    </a>
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
