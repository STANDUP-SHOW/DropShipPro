import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, Store, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BoutonAutoMode } from '../components/BoutonAutoMode'
import { FriseLogos, type LogoFrise } from '../components/FriseLogos'
import { photoAgent } from '../lib/agentsPhotos'
import canaux from '../data/canaux.json'
import { api, type ReglagesAutopilot } from '../lib/api'

type Config = Awaited<ReturnType<typeof api.getAutopilot>>
type Run = Awaited<ReturnType<typeof api.autopilotRuns>>['runs'][number]
type Roster = Awaited<ReturnType<typeof api.agentRoster>>
type Agent = Roster['pipeline'][number]

const ACTION_STYLE: Record<string, string> = {
  importé: 'text-emerald-300',
  publié: 'text-sky-300',
  écarté: 'text-gray-500',
  échec: 'text-red-400',
}

/** Ce que l'agent sait gérer, dans les couleurs de la fiche de recadrage. */
const SYSTEME = [
  { label: 'acquisition produits', couleur: '#4ade80' },
  { label: 'création annonces optimisées', couleur: '#38bdf8' },
  { label: 'diffusion markets places', couleur: '#c084fc' },
  { label: 'commandes', couleur: '#a3e635' },
  { label: 'hotline', couleur: '#fb923c' },
  { label: 'livraisons', couleur: '#f87171' },
  { label: 'sav', couleur: '#facc15' },
  { label: 'comptabilité', couleur: '#6366f1' },
]

/**
 * L'animation d'accueil de l'agent — posée nue sur le fond, sans bordure ni
 * cadre. Recréée EN CODE d'après la vidéo retenue par Max le 06/09/2026
 * (la « a30 » : un monogramme AI au cœur d'anneaux segmentés multicolores
 * contrarotatifs) : les MP4 d'origine portent un filigrane et ne pouvaient
 * pas être posés tels quels. Zéro fichier, zéro filigrane — du SVG animé.
 */
function AnimationAutoShipper() {
  return (
    <div className="relative mx-auto my-2 flex h-56 w-56 items-center justify-center" aria-hidden>
      <style>{`
        @keyframes dsp-as-rot { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes dsp-as-pouls { 0%,100% { opacity: .85 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .dsp-as-anime { animation: none !important } }
        .dsp-as-anime { transform-origin: 130px 130px }
      `}</style>
      <svg viewBox="0 0 260 260" className="h-full w-full">
        <defs>
          <linearGradient id="as-feu" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="as-glace" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
          <radialGradient id="as-noyau" cx="0.38" cy="0.32" r="0.9">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.55" stopColor="#2563eb" />
            <stop offset="1" stopColor="#1e1b4b" />
          </radialGradient>
        </defs>

        {/* Le halo, puis le noyau : la boule d'énergie derrière le monogramme. */}
        <circle cx="130" cy="130" r="62" fill="#38bdf8" opacity="0.14" style={{ filter: 'blur(14px)' }} />
        <circle
          className="dsp-as-anime"
          cx="130"
          cy="130"
          r="46"
          fill="url(#as-noyau)"
          style={{ animation: 'dsp-as-pouls 2.8s ease-in-out infinite', filter: 'drop-shadow(0 0 18px rgba(56,189,248,0.55))' }}
        />

        {/* L'anneau de feu : gros segments, sens horaire. */}
        <g className="dsp-as-anime" style={{ animation: 'dsp-as-rot 9s linear infinite' }}>
          <circle
            cx="130"
            cy="130"
            r="72"
            fill="none"
            stroke="url(#as-feu)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="34 22 12 30 46 18"
            style={{ filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.8))' }}
          />
        </g>

        {/* L'anneau de glace : segments fins, sens inverse. */}
        <g className="dsp-as-anime" style={{ animation: 'dsp-as-rot 6.5s linear infinite reverse' }}>
          <circle
            cx="130"
            cy="130"
            r="86"
            fill="none"
            stroke="url(#as-glace)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="52 16 8 24 30 40"
            opacity="0.9"
            style={{ filter: 'drop-shadow(0 0 5px rgba(56,189,248,0.8))' }}
          />
        </g>

        {/* Le liseré technique : pointillés serrés, rotation lente. */}
        <g className="dsp-as-anime" style={{ animation: 'dsp-as-rot 22s linear infinite' }}>
          <circle cx="130" cy="130" r="98" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.4" strokeDasharray="2 7" />
        </g>

        {/* Les huit métiers en satellites, chacun sa couleur. */}
        <g className="dsp-as-anime" style={{ animation: 'dsp-as-rot 15s linear infinite reverse' }}>
          {SYSTEME.map((s, i) => {
            const a = (i / SYSTEME.length) * 2 * Math.PI
            return (
              <circle
                key={s.label}
                cx={130 + Math.cos(a) * 112}
                cy={130 + Math.sin(a) * 112}
                r="3.4"
                fill={s.couleur}
                style={{ filter: `drop-shadow(0 0 5px ${s.couleur})` }}
              />
            )
          })}
        </g>

        {/* Le monogramme, net et lumineux par-dessus tout. */}
        <text
          x="130"
          y="130"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="system-ui, sans-serif"
          fontSize="52"
          fontWeight="900"
          fill="#f8fafc"
          style={{ filter: 'drop-shadow(0 0 10px rgba(125,211,252,0.9))', letterSpacing: '2px' }}
        >
          AI
        </text>
      </svg>
    </div>
  )
}

/** Une case de la grille, comme celles de la vue d'ensemble (#107). */
function Bloc({ titre, enTete, className = '', children }: { titre?: string; enTete?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`case-ds flex min-w-0 flex-col p-4 md:p-5 ${className}`}>
      {titre || enTete ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titre ? <h2 className="text-sm font-bold text-[var(--texte)]">{titre}</h2> : <span />}
          {enTete}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Le dégradé du logo AutoShipper (rose → orange → jaune), texte sombre pour le contraste. */
const BOUTON_AS = 'filet-autoshipper rounded-xl font-black text-[#101321] shadow-[0_0_18px_rgba(242,128,74,0.35)] transition hover:brightness-110 disabled:opacity-50'

/** Pas de plafond choisi : le maximum du serveur (24 rayons × 20 produits). */
const SANS_LIMITE = 480

/** Les canaux de l'annuaire, pour la frise (le même JSON que l'accueil). */
const CANAUX: LogoFrise[] = canaux.canaux.map((c) => ({ id: c.id, label: c.label, logo: c.logo, large: c.large }))

const drops = (n: number) => `${n.toLocaleString('fr-FR')} drops`
const euros = (n: number) => (n * 0.01).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const jourCourt = (j: string | null) => (j ? new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null)

/**
 * Auto-SHIPPER IA — le pilote automatique, en cases (maquette dictée par Max le 14/10/2026).
 *
 * Dans l'ordre : l'agent se présente ; ses agents en mode auto et l'agent de
 * contrôle à sa droite ; le choix des rayons boost ; le curseur des produits
 * par rayon ; le calcul et le gros bouton d'activation. Les réglages fins, le
 * journal et les mises en garde restent en bas. Tous les tarifs viennent de
 * GET /autopilot (services/tarifs.ts), jamais écrits ici.
 */
export default function Autopilot() {
  const [config, setConfig] = useState<Config | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [roster, setRoster] = useState<Roster | null>(null)
  const [choix, setChoix] = useState<string[]>([])
  const [listeOuverte, setListeOuverte] = useState(false)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function charger() {
    return api
      .getAutopilot()
      .then((c) => {
        setConfig(c)
        setChoix(c.rayons.filter((r) => r.boost).map((r) => r.key))
      })
      .catch(() => setError('Réglages indisponibles'))
  }

  function loadRuns() {
    api.autopilotRuns().then((r) => setRuns(r.runs)).catch(() => undefined)
  }

  useEffect(() => {
    charger()
    api.agentRoster().then(setRoster).catch(() => undefined)
    loadRuns()
  }, [])

  /** Bascule l'AUTO-MODE d'un agent d'administration et reflète la réponse. */
  async function basculerAgent(key: string, enabled: boolean) {
    const r = await api.setAgentAuto(key, enabled)
    setRoster((actuel) => {
      if (!actuel) return actuel
      const maj = (liste: Agent[]) => liste.map((a) => (a.key === key ? { ...a, autoMode: r.autoMode } : a))
      return { ...actuel, pipeline: maj(actuel.pipeline), support: maj(actuel.support) }
    })
  }

  if (!config) {
    return (
      <Layout>
        <p className="text-sm text-[var(--texte-2)]">{error ?? 'Chargement…'}</p>
      </Layout>
    )
  }

  // A server older than this page (the minutes between Vercel and Railway deploys) sends no prices: never guess them.
  if (!config.tarifs || !Array.isArray(config.rayons)) {
    return (
      <Layout>
        <p className="text-sm text-[var(--texte-2)]">Auto-SHIPPER IA est en cours de mise à jour : recharge la page dans deux minutes.</p>
      </Layout>
    )
  }

  const s = config.settings
  const t = config.tarifs
  /*
   * L'avocat, la graphiste et l'agent marketing ne figurent pas ici :
   * l'autonomie d'Auto-SHIPPER IA n'a besoin ni d'un conseil de droit, ni de
   * photos refaites, ni de publicités pour tourner (06/09/2026). Auto-SHIPPER
   * IA ne se compte pas lui-même, et l'agent de contrôle a sa propre case :
   * il se paie à l'annonce (14/10/2026).
   */
  const HORS_AUTONOMIE = ['avocat', 'photo', 'marketing', 'autopilot', 'control']
  const agents: Agent[] = roster
    ? [...roster.pipeline, ...roster.support].filter((a) => !HORS_AUTONOMIE.includes(a.key))
    : []
  const tousEnAuto = agents.length > 0 && agents.every((a) => a.autoMode)

  const rayonsChoisis = config.rayons.filter((r) => choix.includes(r.key))
  const choixEnregistre =
    choix.length === config.rayons.filter((r) => r.boost).length && config.rayons.every((r) => r.boost === choix.includes(r.key))
  const produits = s.produitsParRayon
  const nR = rayonsChoisis.length
  const parProduit = t.parProduit + (s.controleAgent ? t.controle : 0)
  // La facture : chaque rayon coché, avec son propre nombre de produits (le curseur par défaut).
  const lignes = rayonsChoisis.map((r) => ({ ...r, n: s.produitsRayons?.[r.key] ?? produits }))
  const demandes = lignes.reduce((n, l) => n + l.n, 0)
  const limite = s.dailyLimit < SANS_LIMITE
  const imports = limite ? Math.min(demandes, s.dailyLimit) : demandes
  const total = t.journee + imports * parProduit
  // Ce que les analyses du dernier jour donnent vraiment, rayon par rayon.
  const importablesDuJour = Math.min(lignes.reduce((n, l) => n + Math.min(l.n, l.importables), 0), imports)
  const plateformes = s.autoPublish ? config.destinations.filter((d) => s.destinations.includes(d.id)) : []

  /** Les réglages à envoyer, tels quels : le plafond du jour est le choix du vendeur. */
  function reglages(patch: Partial<ReglagesAutopilot> = {}): ReglagesAutopilot {
    return { ...s, produitsRayons: s.produitsRayons ?? {}, ...patch }
  }

  function produitsDuRayon(key: string, n: number) {
    const v = Math.max(0, Math.min(config!.importablesParRayon, n))
    save({ produitsRayons: { ...(s.produitsRayons ?? {}), [key]: v } })
  }

  function update(patch: Partial<typeof s>) {
    setConfig((c) => (c ? { ...c, settings: { ...c.settings, ...patch } } : c))
  }

  async function agir(nom: string, action: () => Promise<string | void>) {
    setOccupe(nom)
    setError(null)
    setMessage(null)
    try {
      const m = await action()
      if (m) setMessage(m)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOccupe(null)
    }
  }

  const save = (patch: Partial<ReglagesAutopilot> = {}) =>
    agir('reglages', async () => {
      update(patch)
      await api.saveAutopilot(reglages(patch))
      return 'Réglages enregistrés'
    })

  const activerTousLesAgents = () =>
    agir('agents', async () => {
      for (const a of agents.filter((x) => !x.autoMode)) await basculerAgent(a.key, true)
      return 'Tous les agents sont en mode auto'
    })

  const enregistrerRayons = () =>
    agir('rayons', async () => {
      await api.saveRayonsBoost(choix)
      await charger()
      return choix.length ? `${choix.length} rayon(s) boost activé(s)` : 'Plus aucun rayon boost'
    })

  const activer = () =>
    agir('activer', async () => {
      if (!choixEnregistre) await api.saveRayonsBoost(choix)
      const r = await api.activerAutopilot(reglages({ enabled: true }))
      await charger()
      loadRuns()
      return r.journeeDejaPayee
        ? "Auto-SHIPPER IA activé. La journée d'aujourd'hui était déjà payée : rien de plus n'est débité."
        : `Auto-SHIPPER IA activé : ${drops(t.journee)} débités, le premier passage est lancé. Ils sont rendus si rien n'est importé.`
    })

  const desactiver = () =>
    agir('activer', async () => {
      update({ enabled: false })
      await api.saveAutopilot(reglages({ enabled: false }))
      return 'Auto-SHIPPER IA désactivé : plus aucune journée ne sera débitée.'
    })

  function toggleDestination(id: string) {
    const next = s.destinations.includes(id) ? s.destinations.filter((d) => d !== id) : [...s.destinations, id]
    update({ destinations: next })
  }

  const iris = photoAgent('control')

  return (
    <Layout>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---------- 1. Auto-SHIPPER, le pilote automatique ---------- */}
        <Bloc className="lg:row-span-2">
          {/* Le titre est le logo AutoShipper (11/10/2026, docs/marque). */}
          <h1>
            <img src="/marque/autoshipper-complet.png" alt="Auto-SHIPPER IA" width={1400} height={234} className="h-9 w-auto max-w-full md:h-11" />
          </h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[var(--texte-2)]">Le pilote automatique</p>

          <AnimationAutoShipper />

          <p className="text-base font-semibold text-[var(--texte)]">Salut, je suis Auto-SHIPPER IA.</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--texte-2)]">
            Je travaille pour toi chaque jour, sans que tu aies à intervenir :
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--texte-2)]">
            {[
              'je reprends les produits gagnants des analyses de tes rayons boost ;',
              "je lis la fiche du fournisseur, je réécris toute l'annonce avec l'IA, je récupère les photos du produit, je pose la catégorie et le SEO ;",
              'je fixe le prix de vente au prix constaté sur le marché, et j’écarte ce qui ne tient pas ta marge minimale ;',
              "je publie sur tes plateformes reliées, et je mets en file Vinted, Leboncoin et Facebook pour l'application desktop ;",
              'je note chaque décision dans mon journal, pour que tu relises ma nuit au réveil.',
            ].map((l) => (
              <li key={l} className="flex gap-2">
                <span className="filet-autoshipper mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </Bloc>

        {/* ---------- 2. Ses agents en mode auto ---------- */}
        <Bloc
          titre="Mes agents en mode auto"
          enTete={
            <button
              type="button"
              onClick={activerTousLesAgents}
              disabled={tousEnAuto || occupe === 'agents' || !agents.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--marque-rose)] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles size={13} />
              {tousEnAuto ? 'Tous en mode auto ✓' : occupe === 'agents' ? 'Activation…' : 'Activer tous les agents en mode auto'}
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase">Gratuit</span>
            </button>
          }
        >
          <p className="text-sm text-[var(--texte-2)]">Pour travailler en totale autonomie, j'ai besoin de mes agents en mode auto.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {agents.map((a) => (
              <li key={a.key} className="flex items-center gap-2 rounded-xl border border-[var(--trait)] p-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg ring-1 ring-[var(--trait-fort)]">
                  {photoAgent(a.key) ? <img src={photoAgent(a.key)!} alt={a.name} className="h-full w-full object-cover" /> : <span aria-hidden>{a.emoji}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--texte)]">{a.name}</p>
                  <p className="truncate text-[11px] text-[var(--texte-2)]">{a.role}</p>
                  <div className="mt-1">
                    <BoutonAutoMode compact actif={Boolean(a.autoMode)} onBascule={(enabled) => basculerAgent(a.key, enabled)} />
                  </div>
                </div>
              </li>
            ))}
            {!agents.length && <li className="text-xs text-[var(--texte-3)] sm:col-span-2">Chargement de l'équipe…</li>}
          </ul>
        </Bloc>

        {/* ---------- 2 bis. L'agent de contrôle, facturé à l'annonce ---------- */}
        <Bloc>
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-[var(--trait-fort)]">
              {iris ? <img src={iris} alt="Iris" className="h-full w-full object-cover" /> : <ShieldCheck size={22} className="text-[var(--texte)]" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-[var(--texte)]">Agent de contrôle</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--texte-2)]">
                Il regarde chaque photo de l'annonce avant publication et la compare au titre et aux variantes. Il écarte ce qui n'est pas le
                produit (bannières, produits recommandés, panier) et garde les vraies photos. Une annonce dont les photos sont sûres est publiée ;
                sinon elle reste en brouillon avec la raison écrite.
              </p>
              <p className="mt-2 text-xs text-[var(--texte-3)]">
                {`Sans lui, les annonces sont importées en brouillon et attendent ta vérification avant toute publication. Rendu si le contrôle n'a pas pu se faire.`}
              </p>
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--trait)] p-3">
            <span className="text-sm font-semibold text-[var(--texte)]">
              {s.controleAgent ? 'Agent de contrôle activé' : "Activer l'agent de contrôle"}
              <span className="ml-2 font-normal text-[var(--texte-2)]">{`${t.controle} drops par annonce`}</span>
            </span>
            <input
              type="checkbox"
              checked={s.controleAgent}
              disabled={occupe === 'reglages'}
              onChange={(e) => save({ controleAgent: e.target.checked })}
              className="h-5 w-5 accent-[#f2804a]"
            />
          </label>
        </Bloc>

        {/* ---------- 3. Les rayons boost ---------- */}
        <Bloc titre="Mes rayons boost" className="lg:col-span-2">
          <p className="text-sm leading-relaxed text-[var(--texte-2)]">
            {`Pour chaque rayon, une analyse de marché et une analyse marketing des réseaux sociaux sont réalisées. De ces analyses, 20 produits gagnants sont proposés chaque jour ; parmi eux, jusqu'à ${config.importablesParRayon} sont importables directement par Auto-SHIPPER IA dans tes annonces. L'import comprend la lecture de l'annonce du fournisseur, sa réécriture intégrale par l'IA, la récupération des photos du produit, l'adaptation aux places de marché, le SEO et la catégorie.`}
          </p>
          <p className="mt-2 text-sm text-[var(--texte-2)]">
            Coche tes rayons et active-les : ils deviennent des <b className="text-[var(--texte)]">rayons boost</b>, dont les produits sont ajoutés
            automatiquement d'après les analyses.
          </p>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setListeOuverte((o) => !o)}
              aria-expanded={listeOuverte}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--trait-fort)] px-4 py-3 text-left text-sm font-semibold text-[var(--texte)]"
            >
              <span>{nR ? `${nR} rayon(s) coché(s) : ${rayonsChoisis.map((r) => r.label).join(', ')}` : 'Choisir mes rayons'}</span>
              <ChevronDown size={16} className={`shrink-0 transition ${listeOuverte ? 'rotate-180' : ''}`} />
            </button>
            {listeOuverte && (
              <ul className="mt-2 grid max-h-96 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-[var(--trait)] p-2 sm:grid-cols-2 xl:grid-cols-3">
                {config.rayons.map((r) => {
                  const coche = choix.includes(r.key)
                  return (
                    <li key={r.key}>
                      <label className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 ${coche ? 'bg-[var(--trait)]' : 'hover:bg-[var(--trait)]'}`}>
                        <input
                          type="checkbox"
                          checked={coche}
                          onChange={() => setChoix((c) => (coche ? c.filter((k) => k !== r.key) : [...c, r.key]))}
                          className="mt-0.5 h-4 w-4 accent-[#f2804a]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-[var(--texte)]">{`${r.emoji} ${r.label}`}</span>
                          <span className="block text-[11px] text-[var(--texte-2)]">
                            {r.jour
                              ? `Analyse du ${jourCourt(r.jour)} : ${r.produits} gagnant(s), ${r.importables} importable(s)`
                              : 'Pas encore d’analyse déposée'}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={enregistrerRayons}
              disabled={choixEnregistre || occupe === 'rayons'}
              className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {occupe === 'rayons' ? 'Activation…' : choixEnregistre ? 'Rayons boost à jour' : 'Activer'}
            </button>
            <span className="text-xs text-[var(--texte-3)]">Confier un rayon et le passer en boost est gratuit.</span>
          </div>
        </Bloc>

        {/* ---------- 4. Produits gagnants repris par rayon ---------- */}
        <Bloc titre="Produits gagnants repris par rayon sélectionné" enTete={<span className="text-2xl font-black text-[var(--texte)]">{produits}</span>} className="lg:col-span-2">
          <div className="relative mt-1">
            <div className="filet-autoshipper pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full" />
            <input
              type="range"
              min={1}
              max={config.importablesParRayon}
              step={1}
              value={produits}
              aria-label="Produits gagnants repris par rayon"
              onChange={(e) => update({ produitsParRayon: Number(e.target.value), produitsRayons: {} })}
              onMouseUp={() => save()}
              onTouchEnd={() => save()}
              onKeyUp={() => save()}
              className="relative h-6 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
            />
          </div>
          <div className="mt-1 flex justify-between px-0.5 text-[10px] text-[var(--texte-3)]">
            {Array.from({ length: config.importablesParRayon }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--texte-3)]">Le même nombre pour chaque rayon ; tu l'ajustes rayon par rayon dans le tarif plus bas.</p>
        </Bloc>

        {/* ---------- 5. La publication automatique ---------- */}
        <Bloc
          titre="Publication automatique"
          enTete={<span className="rounded bg-[var(--trait)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--texte)]">Gratuite</span>}
          className="lg:col-span-2"
        >
          <p className="text-sm leading-relaxed text-[var(--texte-2)]">
            {`${CANAUX.length} canaux de vente. Inscris-toi, crée tes comptes vendeurs, relie-les : DropShipper diffuse. La publication est comprise dans le prix de chaque produit importé, sans aucun drop de plus.`}
          </p>
          <div className="-mx-4 mt-3 overflow-hidden md:-mx-5">
            <FriseLogos logos={CANAUX} />
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={s.autoPublish} onChange={(e) => update({ autoPublish: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#f2804a]" />
            <span className="text-sm text-[var(--texte)]">
              Publier automatiquement après import
              <span className="mt-0.5 block text-[11px] text-[var(--texte-3)]">
                Sur les plateformes reliées cochées ci-dessous, sans repasser par toi. Vinted, Leboncoin et Facebook partent par l'application desktop.
              </span>
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {config.destinations.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDestination(d.id)}
                disabled={!s.autoPublish}
                className={
                  s.destinations.includes(d.id) && s.autoPublish
                    ? 'rounded-full px-3 py-1.5 text-xs font-bold text-white'
                    : 'rounded-full border border-[var(--trait)] px-3 py-1.5 text-xs text-[var(--texte-2)] disabled:opacity-50'
                }
                style={s.destinations.includes(d.id) && s.autoPublish ? { background: d.color } : undefined}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => save()} disabled={occupe === 'reglages'} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
              {occupe === 'reglages' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <Link to="/plateformes-vente" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--texte-2)] hover:underline">
              <Store size={13} /> Relier une plateforme <ArrowRight size={12} />
            </Link>
          </div>
        </Bloc>

        {/* ---------- 6. Les options ---------- */}
        <Bloc titre="Options" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={s.requireEuStock} onChange={(e) => save({ requireEuStock: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#f2804a]" />
              <span className="text-sm text-[var(--texte)]">
                N'importer que si le stock européen est confirmé
                <span className="mt-0.5 block text-[11px] text-[var(--texte-3)]">Sévère : la plupart des trouvailles arrivent avec un stock « non vérifié ».</span>
              </span>
            </label>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-[var(--texte)]">N'importer que si la marge dépasse</span>
                <span className="text-lg font-black text-[var(--texte)]">{`${s.minMargin} %`}</span>
              </div>
              <div className="relative mt-2">
                <div className="filet-autoshipper pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full" />
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={10}
                  value={Math.min(200, s.minMargin)}
                  aria-label="Marge minimale"
                  onChange={(e) => update({ minMargin: Number(e.target.value) })}
                  onMouseUp={() => save()}
                  onTouchEnd={() => save()}
                  onKeyUp={() => save()}
                  className="relative h-5 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--texte-3)]">Marge sur le prix d'achat. Un produit sans prix de marché relevé est écarté.</p>
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={limite}
                  onChange={(e) => save({ dailyLimit: e.target.checked ? Math.max(1, Math.min(demandes || 10, SANS_LIMITE - 1)) : SANS_LIMITE })}
                  className="mt-0.5 h-4 w-4 accent-[#f2804a]"
                />
                <span className="text-sm text-[var(--texte)]">Limiter le nombre d'imports</span>
              </label>
              {limite && (
                <div className="mt-2 flex items-center gap-2 pl-7">
                  <input
                    type="number"
                    min={1}
                    max={SANS_LIMITE - 1}
                    value={s.dailyLimit}
                    aria-label="Imports maximum par jour"
                    onChange={(e) => update({ dailyLimit: Math.max(1, Math.min(SANS_LIMITE - 1, Number(e.target.value) || 1)) })}
                    onBlur={() => save()}
                    className="w-24 rounded-lg border border-[var(--trait)] bg-transparent px-3 py-1.5 text-sm text-[var(--texte)] outline-none"
                  />
                  <span className="text-xs text-[var(--texte-2)]">imports maximum par jour</span>
                </div>
              )}
            </div>
          </div>
        </Bloc>

        {/* ---------- 7. Le tarif global, en facture détaillée, et le gros bouton ---------- */}
        <Bloc titre="Mon tarif global par jour" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--trait)] text-left text-[11px] uppercase tracking-wide text-[var(--texte-2)]">
                  <th className="py-2 font-semibold">Ligne</th>
                  <th className="py-2 text-center font-semibold">Produits</th>
                  <th className="py-2 text-right font-semibold">Prix unitaire</th>
                  <th className="py-2 text-right font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--trait)]">
                  <td className="py-2 text-[var(--texte)]">Activation d'Auto-SHIPPER IA, 24 heures</td>
                  <td className="py-2 text-center text-[var(--texte-2)]">—</td>
                  <td className="py-2 text-right text-[var(--texte-2)]">{drops(t.journee)}</td>
                  <td className="py-2 text-right font-semibold text-[var(--texte)]">{drops(t.journee)}</td>
                </tr>
                {lignes.map((l) => (
                  <tr key={l.key} className="border-b border-[var(--trait)]">
                    <td className="py-2">
                      <span className="block text-[var(--texte)]">{`${l.emoji} ${l.label}`}</span>
                      <span className="block text-[11px] text-[var(--texte-3)]">
                        {l.jour ? `${l.importables} importable(s) dans l'analyse du ${jourCourt(l.jour)}` : 'Pas encore d’analyse déposée'}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className="flex items-center justify-center gap-1.5">
                        <button type="button" onClick={() => produitsDuRayon(l.key, l.n - 1)} disabled={l.n <= 0} aria-label={`Un produit de moins pour ${l.label}`} className="h-7 w-7 rounded-lg border border-[var(--trait-fort)] text-[var(--texte)] disabled:opacity-40">
                          −
                        </button>
                        <b className="w-6 text-center text-[var(--texte)]">{l.n}</b>
                        <button type="button" onClick={() => produitsDuRayon(l.key, l.n + 1)} disabled={l.n >= config.importablesParRayon} aria-label={`Un produit de plus pour ${l.label}`} className="h-7 w-7 rounded-lg border border-[var(--trait-fort)] text-[var(--texte)] disabled:opacity-40">
                          +
                        </button>
                      </span>
                    </td>
                    <td className="py-2 text-right text-[var(--texte-2)]">
                      {s.controleAgent ? `${t.parProduit} + ${t.controle} contrôle` : drops(t.parProduit)}
                    </td>
                    <td className="py-2 text-right font-semibold text-[var(--texte)]">{drops(l.n * parProduit)}</td>
                  </tr>
                ))}
                {!lignes.length && (
                  <tr className="border-b border-[var(--trait)]">
                    <td colSpan={4} className="py-3 text-center text-xs text-[var(--texte-3)]">
                      Coche au moins un rayon boost pour composer ta journée.
                    </td>
                  </tr>
                )}
                {limite && demandes > s.dailyLimit && (
                  <tr className="border-b border-[var(--trait)]">
                    <td className="py-2 text-[var(--texte-2)]">{`Plafond choisi : ${s.dailyLimit} imports par jour`}</td>
                    <td className="py-2 text-center text-[var(--texte-2)]">{`− ${demandes - s.dailyLimit}`}</td>
                    <td className="py-2 text-right text-[var(--texte-2)]">{drops(parProduit)}</td>
                    <td className="py-2 text-right font-semibold text-[var(--texte)]">{`− ${drops((demandes - s.dailyLimit) * parProduit)}`}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="text-base font-black">
                  <td className="pt-3 text-[var(--texte)]">Total de la journée, au plus</td>
                  <td className="pt-3 text-center text-[var(--texte)]">{imports}</td>
                  <td />
                  <td className="pt-3 text-right text-[var(--texte)]">
                    {drops(total)} <span className="text-xs font-semibold text-[var(--texte-2)]">{`≈ ${euros(total)} €`}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {nR > 0 && (
            <p className="mt-4 rounded-xl border border-[var(--trait)] p-3 text-sm leading-relaxed text-[var(--texte)]">
              {plateformes.length
                ? `À la fin de la journée : jusqu'à ${imports} produit(s) gagnant(s) importé(s) et publié(s) automatiquement sur ${plateformes.length} plateforme(s) (${plateformes.map((p) => p.label).join(', ')}).`
                : `À la fin de la journée : jusqu'à ${imports} produit(s) gagnant(s) importé(s) dans tes annonces. Coche « Publier automatiquement » pour qu'ils partent aussi sur tes plateformes.`}
              <span className="mt-1 block text-xs text-[var(--texte-3)]">
                {`D'après les dernières analyses, ${importablesDuJour} produit(s) sont importables à ce réglage. Seul ce qui est importé se paie ; un produit écarté (marge, stock) ne coûte rien.`}
              </span>
            </p>
          )}

          <p className="mt-4 text-sm leading-relaxed text-[var(--texte-2)]">
            Auto-SHIPPER IA importe lui-même les fiches que notre serveur sait lire. Les produits réservés à l'extension Chrome ou à{' '}
            <Link to="/application-desktop" className="font-semibold text-[var(--texte)] underline underline-offset-2">
              l'application desktop
            </Link>{' '}
            (Temu, AliExpress, Shein…) ne sont pas importés seuls : tu les importes depuis l'extension ou l'application, qui ont leur propre
            navigateur.
          </p>

          <div className="mt-5 flex flex-col items-center gap-2">
            {s.enabled ? (
              <>
                <p className="filet-autoshipper rounded-xl px-6 py-3 text-base font-black text-[#101321]">Auto-SHIPPER IA activé ✓</p>
                <button type="button" onClick={desactiver} disabled={occupe === 'activer'} className="text-xs text-[var(--texte-2)] underline underline-offset-2">
                  Désactiver
                </button>
              </>
            ) : (
              <button type="button" onClick={activer} disabled={!nR || occupe === 'activer'} className={`${BOUTON_AS} w-full max-w-xl px-6 py-4 text-lg`}>
                {occupe === 'activer' ? 'Activation…' : 'Activer Auto-SHIPPER IA 24 heures'}
              </button>
            )}
            <p className="max-w-xl text-center text-xs leading-relaxed text-[var(--texte-3)]">
              {`À l'activation, ${drops(t.journee)} sont pris automatiquement sur ton solde, puis chaque produit importé. La journée est rendue si rien n'est importé, et chaque import en échec est remboursé. Tant qu'il reste activé, Auto-SHIPPER IA repart toutes les 24 heures.`}
            </p>
          </div>
          {message && <p className="mt-3 text-center text-sm text-emerald-300">{message}</p>}
          {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        </Bloc>

        {/* ---------- Le journal ---------- */}
        <Bloc titre="Ce qu'il a fait" className="lg:col-span-2">
          <p className="text-xs text-[var(--texte-3)]">Chaque passage, avec le détail de chaque décision.</p>
          {!runs.length && (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--trait-fort)] px-3 py-6 text-center text-xs text-[var(--texte-3)]">
              Aucun passage pour l'instant.
            </p>
          )}
          <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                  className="w-full rounded-xl border border-[var(--trait)] p-3 text-left hover:border-[var(--trait-fort)]"
                >
                  <p className="text-sm font-semibold text-[var(--texte)]">
                    {new Date(r.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-[var(--texte-2)]">
                    {`${r.imported} importée(s) · ${r.published} publiée(s) · ${r.skipped} écartée(s) · ${r.failed} en échec`}
                  </p>
                </button>
                {openRun === r.id && Array.isArray(r.log) && (
                  <ul className="mt-1 space-y-1 rounded-xl border border-[var(--trait)] p-3">
                    {r.log.map((line, i) => (
                      <li key={i} className="flex flex-wrap gap-2 text-xs">
                        <span className={ACTION_STYLE[line.action] ?? 'text-[var(--texte-2)]'}>{line.action}</span>
                        <span className="text-[var(--texte)]">{line.titre}</span>
                        <span className="text-[var(--texte-2)]">{`— ${line.raison}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Bloc>

        {/* La mise en garde, toujours en dernier (règle du 05/09/2026). */}
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 lg:col-span-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="text-xs leading-relaxed text-amber-100">
            <p>
              {`Chaque import consomme des drops (${t.parProduit} par produit, plus ${t.journee} la journée${s.controleAgent ? ` et ${t.controle} par annonce contrôlée` : ''}) et remplit ton catalogue. Le tarif ci-dessus est ton plafond du jour : commence bas.`}
            </p>
            <p className="mt-1">
              Vinted, Leboncoin et Facebook Marketplace ne sont pas publiés par le serveur : ils partent par l'application desktop, depuis ta
              propre session.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
