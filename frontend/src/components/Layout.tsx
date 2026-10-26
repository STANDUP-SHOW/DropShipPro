import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, LogOut, Menu as MenuIcon, Search, X } from 'lucide-react'
import { DropCoin } from './DropCoin'
import { Logo } from './Logo'
import { FondVivant } from './FondVivant'
import { BoutonTheme } from './BoutonTheme'
import { BandeauJauges } from './BandeauJauges'
import { BandeauNotifications } from './BandeauNotifications'
import { PastilleNotif } from './PastilleNotif'
import { MenuPoste } from './desktop/MenuPoste'
import { GROUPES, PAGES, RAYONS_BOOST, entreeActive, pageCourante, type GroupeMenu } from './menuEspace'
import { SECTION_PAR_ADRESSE, titreNouveautes, useNouveautes } from '../lib/nouveautes'
import { useAuth } from '../lib/auth'
import { useNeonVarie } from '../lib/neonColors'
import { api } from '../lib/api'

/**
 * La coque de l'espace connecté, refaite le 13/10/2026 sur la maquette de Max.
 *
 * Le menu tient en six groupes repliables (voir menuEspace.tsx) : seul le
 * groupe de la page ouverte se déplie de lui-même, les autres restent sur leur
 * titre — douze sections déroulées poussaient le solde et la déconnexion hors
 * de l'écran. Tous se replient d'un clic, celui de la page ouverte compris. Les groupes ouverts à la main sont retenus d'une visite à
 * l'autre.
 *
 * Sur l'écran large, une barre légère porte le fil d'Ariane et la recherche de
 * page (Ctrl K). Les six jauges et la ligne Notifications + Extension restent
 * en tête de chaque page, comme avant : ce sont nos blocs statistiques.
 *
 * Montserrat partout dans l'espace connecté (demande de Max), aux tailles de
 * texte d'avant : la classe .espace-connecte ne change que la famille.
 */

const CLE_GROUPES = 'menu-groupes-ouverts'

function lireGroupesOuverts(): string[] {
  try {
    const brut = localStorage.getItem(CLE_GROUPES)
    const liste = brut ? JSON.parse(brut) : []
    return Array.isArray(liste) ? liste.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function ecrireGroupesOuverts(ids: string[]) {
  try {
    localStorage.setItem(CLE_GROUPES, JSON.stringify(ids))
  } catch {
    // Stockage refusé (navigation privée) : le menu s'en passe.
  }
}

/** Sans accents ni majuscules : « reglages » trouve « Réglages ». */
const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** La recherche de page : Ctrl K (ou ⌘ K) l'ouvre, Échap la ferme. */
function RecherchePage({ ouverte, fermer }: { ouverte: boolean; fermer: () => void }) {
  const [texte, setTexte] = useState('')
  const [rang, setRang] = useState(0)
  const champ = useRef<HTMLInputElement>(null)
  const naviguer = useNavigate()

  useEffect(() => {
    if (!ouverte) return
    setTexte('')
    setRang(0)
    // Après la peinture : le champ n'existe pas encore au moment de l'effet.
    const t = window.setTimeout(() => champ.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [ouverte])

  const trouvees = useMemo(() => {
    const q = plat(texte.trim())
    if (!q) return PAGES
    return PAGES.filter((p) => plat(`${p.label} ${p.groupe} ${p.mots ?? ''}`).includes(q))
  }, [texte])

  if (!ouverte) return null

  const aller = (to: string) => {
    fermer()
    if (to.startsWith('/api-power')) window.location.href = to
    else naviguer(to)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={fermer}>
      <div
        role="dialog"
        aria-label="Rechercher une page"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--trait)] bg-[var(--panneau)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--trait)] px-4 py-3">
          <Search size={16} className="text-gray-400" />
          <input
            ref={champ}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value)
              setRang(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') fermer()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setRang((r) => Math.min(r + 1, trouvees.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setRang((r) => Math.max(r - 1, 0))
              } else if (e.key === 'Enter' && trouvees[rang]) aller(trouvees[rang].to)
            }}
            placeholder="Rechercher une page"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-400">Échap</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {trouvees.length === 0 ? <li className="px-3 py-6 text-center text-sm text-gray-400">Aucune page ne porte ce nom.</li> : null}
          {trouvees.map((p, i) => (
            <li key={p.to}>
              <button
                type="button"
                onMouseEnter={() => setRang(i)}
                onClick={() => aller(p.to)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  i === rang ? 'bg-white/[0.07] text-white' : 'text-gray-300'
                }`}
              >
                <p.icon size={16} />
                <span className="flex-1">{p.label}</span>
                <span className="text-[11px] text-gray-500">{p.groupe}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: React.ReactNode; large?: boolean }) {
  const { pathname, search, hash } = useLocation()
  const adresseComplete = pathname + search + hash
  const estActive = (to: string) => entreeActive(to, pathname, adresseComplete)
  const courante = pageCourante(pathname, adresseComplete)

  /*
   * Les pastilles de nouveautés (19/09/2026) : ce que les agents ont déposé et
   * que personne n'a encore ouvert, à côté du titre qui y mène. Un seul relevé
   * pour les cinq entrées ; ouvrir une entrée éteint la sienne.
   */
  const nouveautes = useNouveautes(adresseComplete)
  const { logout, user } = useAuth()
  useNeonVarie()
  const [solde, setSolde] = useState<{ credits: number } | null>(null)
  /** Les rayons confiés, chacun à son nom, pour le déroulant « Mes rayons BOOST ». */
  const [rayons, setRayons] = useState<Array<{ id: string; agentName: string; label: string; emoji: string; pending: number }>>([])
  const rayonActif = rayons.find((r) => pathname.startsWith(`/rayon/${r.id}`))?.id ?? null
  const enAttente = rayons.reduce((n, r) => n + r.pending, 0)

  /** Le tiroir du téléphone, fermé à chaque changement de page. */
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [recherche, setRecherche] = useState(false)
  useEffect(() => {
    setMenuOuvert(false)
  }, [pathname])

  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setRecherche((o) => !o)
      }
    }
    window.addEventListener('keydown', raccourci)
    return () => window.removeEventListener('keydown', raccourci)
  }, [])

  /*
   * Les groupes ouverts : ceux que le vendeur a dépliés lui-même, plus celui de
   * la page en cours, déplié à l'arrivée sur la page. Ce dernier se replie
   * quand même d'un clic (14/10 : « Pilotage » restait bloqué ouvert) ; changer
   * de page le rouvre, puisque chaque page remonte la coque.
   */
  const [ouverts, setOuverts] = useState<string[]>(() => lireGroupesOuverts())
  const [courantReplie, setCourantReplie] = useState(false)
  const groupeCourant = rayonActif ? 'marketing' : courante?.groupeId
  const estOuvert = (g: GroupeMenu) => ouverts.includes(g.id) || (g.id === groupeCourant && !courantReplie)
  const basculer = (g: GroupeMenu) => {
    if (g.id === groupeCourant) setCourantReplie(estOuvert(g))
    setOuverts((liste) => {
      const suivante = estOuvert(g) ? liste.filter((x) => x !== g.id) : [...liste, g.id]
      ecrireGroupesOuverts(suivante)
      return suivante
    })
  }

  useEffect(() => {
    api
      .myBilling()
      // Le solde ne s'affiche que s'il est vraiment chiffré : une réponse d'une
      // autre forme doit faire disparaître le solde, jamais la page.
      .then((b) => setSolde(Number.isFinite(b?.credits) ? { credits: b.credits } : null))
      .catch(() => {})
  }, [pathname])

  useEffect(() => {
    api
      .listDepartments()
      .then((list) => setRayons(Array.isArray(list) ? list.filter((r) => r.active) : []))
      .catch(() => {})
  }, [pathname])

  const classeEntree = (active: boolean) =>
    `relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-sm transition ${
      active
        ? 'bg-white/[0.07] font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-[#f28a4b] before:to-[#e85290]'
        : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
    }`

  const deroulantRayons = (
    <details key={RAYONS_BOOST} className="group/rayons" open={rayonActif !== null}>
      <summary className={`${classeEntree(false)} cursor-pointer list-none`}>
        <JaugeMax />
        <span className="whitespace-nowrap">
          {'Mes rayons '}
          <b className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text font-black text-transparent">BOOST</b>
        </span>
        <ChevronRight size={12} className="transition-transform group-open/rayons:rotate-90" />
        <span className="ml-auto text-[11px] text-gray-500">
          {enAttente > 0 ? `${rayons.length} · ${enAttente}` : rayons.length || ''}
        </span>
      </summary>
      {rayons.length === 0 ? (
        <Link to="/rayons" className="block py-1.5 pl-10 pr-2 text-xs text-gray-500 hover:text-white">
          Aucun rayon embauché — voir les chefs de rayon
        </Link>
      ) : (
        rayons.map((r) => (
          <Link key={r.id} to={`/rayon/${r.id}`} title={`${r.label} — ${r.agentName}`} className={`${classeEntree(pathname.startsWith(`/rayon/${r.id}`))} ml-4`}>
            <span className="text-base leading-none">{r.emoji}</span>
            <span className="truncate">{r.label}</span>
            {r.pending > 0 ? (
              <span className="ml-auto rounded-full bg-emerald-400/20 px-1.5 text-[11px] text-emerald-300">{r.pending}</span>
            ) : null}
          </Link>
        ))
      )}
    </details>
  )

  return (
    <div className="espace-connecte min-h-screen text-white md:flex">
      <FondVivant />
      <RecherchePage ouverte={recherche} fermer={() => setRecherche(false)} />

      {/* La barre du téléphone : ouvrir le menu, revenir à l'accueil, chercher une page, voir son solde. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--trait)] bg-[var(--nuit)]/95 px-4 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setMenuOuvert(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOuvert}
          className="-ml-1 rounded-lg p-1.5 text-gray-300 transition hover:bg-white/10 hover:text-white"
        >
          <MenuIcon size={22} />
        </button>
        <Link to="/statistiques" className="min-w-0 shrink">
          <Logo size={20} />
        </Link>
        <button
          type="button"
          onClick={() => setRecherche(true)}
          aria-label="Rechercher une page"
          className="ml-auto rounded-lg p-1.5 text-gray-300 transition hover:bg-white/10 hover:text-white"
        >
          <Search size={19} />
        </button>
        {solde ? (
          <Link to="/credits" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5">
            <DropCoin size={18} className="shrink-0" />
            <span className="text-xs font-extrabold text-white">{solde.credits.toLocaleString('fr-FR')}</span>
          </Link>
        ) : null}
      </header>

      {menuOuvert ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenuOuvert(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col overflow-y-auto border-r border-[var(--trait)] bg-[var(--nuit)] p-4 transition-transform duration-200 ease-out md:sticky md:top-0 md:z-10 md:h-screen md:w-64 md:max-w-none md:shrink-0 md:translate-x-0 ${
          menuOuvert ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-5 flex items-center justify-between gap-2">
          <Link to="/statistiques" className="min-w-0">
            <Logo size={16} />
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

        <nav aria-label="Navigation principale" className="flex-1 space-y-1">
          {GROUPES.map((groupe) => {
            const ouvert = estOuvert(groupe)
            // Replié, le groupe dit tout de même ce qui attend dedans.
            const attente = groupe.entrees.reduce((n, e) => {
              const s = SECTION_PAR_ADRESSE[e.to]
              return n + (s ? nouveautes[s] ?? 0 : 0)
            }, 0)
            return (
              <div key={groupe.id}>
                <button
                  type="button"
                  onClick={() => basculer(groupe)}
                  aria-expanded={ouvert}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-200 transition hover:bg-white/[0.04] hover:text-white"
                >
                  <groupe.icon size={17} style={{ color: groupe.teinte }} />
                  <span className="flex-1">{groupe.titre}</span>
                  {!ouvert && attente > 0 ? <PastilleNotif nombre={attente} titre={`${attente} nouveauté(s) dans ${groupe.titre}`} /> : null}
                  <ChevronDown size={15} className={`text-gray-500 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
                </button>
                {ouvert ? (
                  <div className="mb-2 mt-0.5 space-y-0.5 pl-2">
                    {groupe.note && !window.dropshipperDesktop ? <p className="px-3 pb-1 text-[11px] leading-snug text-gray-500">{groupe.note}</p> : null}
                    {groupe.entrees.map((item) => {
                      if (item.to === RAYONS_BOOST) return deroulantRayons
                      const section = SECTION_PAR_ADRESSE[item.to]
                      const pastille = section ? (
                        <PastilleNotif nombre={nouveautes[section]} titre={titreNouveautes(section, nouveautes[section])} className="ml-auto" />
                      ) : null
                      const contenu = (
                        <>
                          <item.icon size={16} />
                          {item.to === '/pilote' ? (
                            <span className="bg-gradient-to-r from-[#e53576] via-[#f27f40] to-[#ffca0a] bg-clip-text font-bold text-transparent">{item.label}</span>
                          ) : (
                            <span className="truncate">{item.label}</span>
                          )}
                          {pastille}
                        </>
                      )
                      // API Power est une page publique servie à part : un vrai lien.
                      return item.to.startsWith('/api-power') ? (
                        <a key={item.to} href={item.to} className={classeEntree(false)}>
                          {contenu}
                        </a>
                      ) : (
                        <Link key={item.to} to={item.to} className={classeEntree(estActive(item.to))} aria-current={estActive(item.to) ? 'page' : undefined}>
                          {contenu}
                        </Link>
                      )
                    })}
                    {groupe.id === 'desktop' ? <MenuPoste /> : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        <div className="mt-4 space-y-2 border-t border-[var(--trait)] pt-4 text-xs text-gray-400">
          <Link to="/guide" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] hover:text-white">
            <BookOpen size={14} /> Guide & assistance
          </Link>
          <BoutonTheme className="" />
          {solde ? (
            <Link
              to="/credits"
              className="flex items-center gap-2 rounded-xl border border-[var(--trait)] bg-[var(--panneau)] px-3 py-2.5 text-white transition hover:border-[var(--trait-fort)]"
            >
              <DropCoin size={18} className="shrink-0" />
              <b className="text-sm">{solde.credits.toLocaleString('fr-FR')} drops</b>
              <ChevronRight size={14} className="ml-auto text-gray-400" />
            </Link>
          ) : null}
          <div className="flex items-center gap-2 px-2 pt-1">
            <span className="min-w-0 flex-1 truncate">{user?.email}</span>
            <button onClick={logout} title="Déconnexion" aria-label="Déconnexion" className="rounded-md p-1 text-gray-400 hover:bg-white/10 hover:text-white">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* `overflow-x-clip` et non `hidden` : `hidden` ferait de main le repère
          du bandeau des jauges collé en haut (voir l'historique du fichier). */}
      <main className="relative min-w-0 flex-1 overflow-x-clip px-4 pb-6 md:px-8 md:pb-8">
        {/* La barre légère de l'écran large : où l'on est, et la recherche de page. */}
        <div className="-mx-8 hidden items-center gap-3 border-b border-[var(--trait)] px-8 py-3 md:flex">
          <p className="min-w-0 flex-1 truncate text-sm text-gray-400">
            {courante ? (
              <>
                {courante.groupe} <span className="text-gray-600">/</span> <span className="text-white">{courante.label}</span>
              </>
            ) : (
              'Espace vendeur'
            )}
          </p>
          <button
            type="button"
            onClick={() => setRecherche(true)}
            className="flex items-center gap-2 rounded-lg border border-[var(--trait)] bg-[var(--panneau)] px-3 py-1.5 text-sm text-gray-400 transition hover:border-[var(--trait-fort)] hover:text-white"
          >
            <Search size={14} /> Rechercher une page
            <kbd className="rounded border border-white/10 px-1.5 text-[10px]">Ctrl K</kbd>
          </button>
        </div>
        {/* Les six jauges, fixes en tête de chaque page (04/09/2026). */}
        <BandeauJauges />
        <div className="mx-auto max-w-[1800px]">
          <BandeauNotifications />
          {children}
        </div>
      </main>
    </div>
  )
}

/** La jauge au maximum, en dégradé : l'icône de « Mes rayons BOOST ». */
function JaugeMax({ taille = 16 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="jauge-boost" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.5" stopColor="#e879f9" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <path d="M4 18a8.5 8.5 0 1 1 17 0" stroke="url(#jauge-boost)" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="12.5" y1="18" x2="19" y2="12" stroke="url(#jauge-boost)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
