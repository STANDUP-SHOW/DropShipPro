import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Play, AlertTriangle, Info, Plus, Store, ArrowRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BoutonAutoMode } from '../components/BoutonAutoMode'
import { api } from '../lib/api'

type Config = Awaited<ReturnType<typeof api.getAutopilot>>
type Run = Awaited<ReturnType<typeof api.autopilotRuns>>['runs'][number]
type Roster = Awaited<ReturnType<typeof api.agentRoster>>
type Agent = Roster['pipeline'][number]
type Rayon = Awaited<ReturnType<typeof api.listDepartments>>[number]

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
          <circle cx="130" cy="130" r="98" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeDasharray="2 7" />
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

/**
 * AUTO-SHIPPER AI — le pilote automatique, présenté comme un agent.
 *
 * La page suit la fiche de recadrage du 06/09/2026 : l'agent se présente,
 * montre ce qu'il exige pour travailler seul (les agents ADMIN en mode auto,
 * au moins un chef de rayon embauché pour les acquisitions, des places de
 * marché reliées pour la diffusion), puis ses réglages et son journal. Les
 * mises en garde restent en bas — jamais avant les blocs.
 */
export default function Autopilot() {
  const [config, setConfig] = useState<Config | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [roster, setRoster] = useState<Roster | null>(null)
  const [rayons, setRayons] = useState<Rayon[]>([])
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadRuns() {
    api.autopilotRuns().then((r) => setRuns(r.runs)).catch(() => undefined)
  }

  useEffect(() => {
    api.getAutopilot().then(setConfig).catch(() => setError('Réglages indisponibles'))
    api.agentRoster().then(setRoster).catch(() => undefined)
    api.listDepartments().then(setRayons).catch(() => undefined)
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

  async function basculerRayon(id: string, enabled: boolean) {
    const r = await api.setRayonAuto(id, enabled)
    setRayons((liste) => liste.map((d) => (d.id === id ? { ...d, autoMode: r.autoMode } : d)))
  }

  if (!config) {
    return (
      <Layout>
        <p className="text-sm text-gray-500">{error ?? 'Chargement…'}</p>
      </Layout>
    )
  }

  const s = config.settings
  const agents: Agent[] = roster ? [...roster.pipeline, ...roster.support] : []
  const enPoste = rayons.filter((r) => r.active)

  function update(patch: Partial<typeof s>) {
    setConfig((c) => (c ? { ...c, settings: { ...c.settings, ...patch } } : c))
  }

  async function save(next = s) {
    setSaving(true)
    setError(null)
    try {
      await api.saveAutopilot(next)
      setMessage('Réglages enregistrés')
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setRunning(true)
    setError(null)
    setMessage(null)
    try {
      const r = await api.runAutopilot()
      setMessage(
        `${r.imported} importée(s), ${r.published} publiée(s), ${r.skipped} écartée(s), ${r.failed} en échec.`,
      )
      loadRuns()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function toggleDestination(id: string) {
    const next = s.destinations.includes(id)
      ? s.destinations.filter((d) => d !== id)
      : [...s.destinations, id]
    update({ destinations: next })
  }

  return (
    <Layout>
      {/* Le titre de la fiche : AUTO-SHIPPER AI, du bleu au rouge, en gras. */}
      <h1 className="flex items-center justify-center gap-3 text-center text-3xl font-black tracking-tight">
        <Bot size={30} className="text-sky-400" />
        {/* Le dégradé du titre reprend l'animation : la glace du noyau vers
            le feu de l'anneau — bleu → jaune (06/09/2026). */}
        <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-amber-400 bg-clip-text text-transparent">
          AUTO-SHIPPER AI
        </span>
      </h1>
      <p className="mt-1 text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
        Le pilote automatique
      </p>

      <AnimationAutoShipper />

      {/* L'agent se présente, dans ses mots. */}
      <div className="mx-auto max-w-xl text-center">
        <p className="text-sm leading-relaxed text-sky-300">
          Salut, je suis Auto-Shipper.
          <br />
          Je suis capable de gérer pour toi intégralement mon système.
        </p>
        <ul className="mx-auto mt-4 inline-flex flex-col items-start gap-1.5">
          {SYSTEME.map((ligne) => (
            <li key={ligne.label} className="flex items-center gap-2.5 text-sm text-gray-200">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: ligne.couleur, boxShadow: `0 0 6px ${ligne.couleur}` }}
              />
              <span>{ligne.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 1. Les agents ADMIN en mode auto. */}
      <section className="mt-10">
        <p className="text-center text-sm text-gray-300">
          Pour travailler en totale autonomie, je dois travailler avec :{' '}
          <b>mes agents ADMIN</b> <span className="font-semibold text-sky-300">en mode auto</span>.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <li key={a.key} className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="text-xl">{a.emoji}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="truncate text-[11px] text-gray-500">{a.role}</p>
                </div>
              </div>
              <div className="mt-2">
                <BoutonAutoMode compact actif={Boolean(a.autoMode)} onBascule={(enabled) => basculerAgent(a.key, enabled)} />
              </div>
            </li>
          ))}
          {!agents.length && <li className="text-center text-xs text-gray-500 sm:col-span-2 lg:col-span-4">Chargement de l'équipe…</li>}
        </ul>
      </section>

      {/* 2. Les acquisitions : au moins un chef de rayon. */}
      <section className="mt-10">
        <p className="text-center text-sm text-gray-300">
          Pour faire les acquisitions, <b>au moins un chef de rayon doit être embauché</b> — c'est
          lui qui génère <span className="text-fuchsia-300">la liste de produits à importer chaque jour</span>.
        </p>

        <p className="mt-5 text-center text-sm font-bold uppercase tracking-wide text-yellow-300">
          Ajouter rayon automatique
        </p>
        <div className="mt-2 flex justify-center">
          <Link
            to="/rayons"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 backdrop-blur transition hover:bg-white/15"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600">
              <Plus size={14} className="text-white" />
            </span>
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text text-sm font-black uppercase tracking-widest text-transparent">
              Rayons Boost
            </span>
          </Link>
        </div>

        {enPoste.length > 0 && (
          <ul className="mt-5 space-y-3">
            {enPoste.map((d) => (
              <li key={d.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to={`/rayon/${d.id}`}
                    className="rounded-xl bg-yellow-300 px-3 py-1.5 text-sm font-black uppercase text-black"
                  >
                    {d.label}
                  </Link>
                  <span className={d.autoMode ? 'text-sm font-semibold text-sky-300' : 'text-sm text-gray-500'}>
                    {d.autoMode ? 'rayon auto-mode activé' : 'rayon auto-mode désactivé'}
                  </span>
                  <span className="ml-auto">
                    <BoutonAutoMode actif={d.autoMode} onBascule={(enabled) => basculerRayon(d.id, enabled)} />
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <span className="text-2xl">{d.emoji}</span>
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-gray-400">
                    {`Chaque matin et chaque soir, ${d.agentName} génère une analyse de marché et élabore une liste de produits, en indiquant le prix d'achat constaté et le prix de vente suggéré. Ses réglages vivent dans son rayon ; ses rapports s'archivent dans `}
                    <Link to="/analyse-marche" className="text-purple-300 underline">
                      Analyses de marché
                    </Link>
                    {', ses listes dans '}
                    <Link to="/produits-gagnants" className="text-purple-300 underline">
                      Produits gagnants
                    </Link>
                    {'.'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. La diffusion : des places de marché reliées. */}
      <section className="mt-10">
        <p className="text-center text-sm font-bold uppercase tracking-wide text-yellow-300">
          Ajouter plateforme diffusion auto
        </p>
        <div className="mt-2 flex justify-center">
          <Link
            to="/plateformes-vente"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-white/15"
          >
            <Store size={15} />
            <span>
              menu markets places <span className="text-emerald-300">reliées</span>
            </span>
            <ArrowRight size={13} className="text-gray-400" />
          </Link>
        </div>
        <p className="mx-auto mt-3 max-w-md text-center text-xs leading-relaxed text-gray-400">
          Pour publier automatiquement vos annonces, <b>les plateformes doivent être reliées</b>. Si
          la place de marché n'est pas dans la liste ci-dessous, reliez-la depuis le menu Market
          places.
        </p>
      </section>

      {/* 4. Publications auto : les réglages du pilote et son journal. */}
      <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-center text-lg font-bold text-sky-300">Publications auto</h2>

        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => {
              const next = { ...s, enabled: e.target.checked }
              update({ enabled: e.target.checked })
              save(next)
            }}
            className="h-5 w-5 accent-sky-400"
          />
          <span className="font-semibold">
            {s.enabled ? 'Auto-Shipper activé' : 'Auto-Shipper désactivé'}
          </span>
          {s.enabled ? (
            <span className="rounded-full bg-sky-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
              un passage par tranche de 12 h — 5 crédits la tranche
            </span>
          ) : null}
        </label>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-400">Imports maximum par jour</label>
            <input
              type="number"
              min={1}
              max={50}
              value={s.dailyLimit}
              onChange={(e) => update({ dailyLimit: Number(e.target.value) || 1 })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {`Plafond de cette version : 50 par jour. Soit ${s.dailyLimit} crédit(s) d'annonce par jour au maximum.`}
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400">Marge minimale exigée</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                value={s.minMargin}
                onChange={(e) => update({ minMargin: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Un produit sans prix marché relevé est écarté : la marge est alors inconnue.
            </p>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={s.requireEuStock}
            onChange={(e) => update({ requireEuStock: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-sky-400"
          />
          <span className="text-sm">
            <span>N'importer que si le stock européen est confirmé</span>
            <span className="mt-0.5 block text-[11px] text-gray-500">
              Sévère : la plupart des trouvailles arrivent avec un stock « non vérifié ».
            </span>
          </span>
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={s.autoPublish}
            onChange={(e) => update({ autoPublish: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-sky-400"
          />
          <span className="text-sm">
            <span>Publier automatiquement après import</span>
            <span className="mt-0.5 block text-[11px] text-gray-500">
              Sur les plateformes reliées cochées ci-dessous, sans repasser par vous.
            </span>
          </span>
        </label>

        {s.autoPublish && (
          <div className="mt-3 flex flex-wrap gap-2">
            {config.destinations.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDestination(d.id)}
                className={
                  s.destinations.includes(d.id)
                    ? 'rounded-full px-3 py-1.5 text-xs font-bold text-white'
                    : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
                }
                style={
                  s.destinations.includes(d.id)
                    ? { background: d.color, boxShadow: `0 0 10px ${d.color}66` }
                    : undefined
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={runNow}
            disabled={running || !s.enabled}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          >
            <Play size={14} />
            <span>{running ? 'Passage en cours…' : 'Lancer un passage maintenant'}</span>
          </button>

          {message && <span className="text-xs text-emerald-300">{message}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        {!s.enabled && (
          <p className="mt-3 flex items-center gap-1 text-xs text-gray-500">
            <Info size={13} />
            <span>Activez Auto-Shipper pour pouvoir lancer un passage.</span>
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-bold">Ce qu'il a fait</h2>
        <p className="mt-1 text-xs text-gray-500">
          Chaque passage, avec le détail de chaque décision. Vous devez pouvoir comprendre au réveil
          ce qui s'est décidé pendant la nuit.
        </p>

        {!runs.length && (
          <p className="mt-4 rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-xs text-gray-500">
            Aucun passage pour l'instant.
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
              >
                <p className="text-sm font-semibold">
                  {new Date(r.createdAt).toLocaleString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-xs text-gray-500">
                  {`${r.imported} importée(s) · ${r.published} publiée(s) · ${r.skipped} écartée(s) · ${r.failed} en échec`}
                </p>
              </button>

              {openRun === r.id && Array.isArray(r.log) && (
                <ul className="mt-1 space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
                  {r.log.map((line, i) => (
                    <li key={i} className="flex flex-wrap gap-2 text-xs">
                      <span className={ACTION_STYLE[line.action] ?? 'text-gray-400'}>
                        {line.action}
                      </span>
                      <span className="text-gray-300">{line.titre}</span>
                      <span className="text-gray-500">{`— ${line.raison}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/*
        Le bloc infos de la fiche, EN BAS comme toutes les mises en garde
        (règle du 05/09/2026) : ce que fait un chef en mode auto, ce que fait
        Auto-Shipper, les limites et le tarif de cette version.
      */}
      <div className="mt-8 rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-5">
        <h2 className="font-bold text-yellow-200">Infos</h2>

        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <div className="text-xs leading-relaxed text-yellow-100/90">
            <p className="font-semibold text-yellow-200">Quand un chef de rayon passe en mode auto :</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>toutes les 12 h, une analyse de marché fournisseurs et produits phares ;</li>
              <li>une analyse des tendances côté markets places ;</li>
              <li>une sélection de 10 produits phares à importer ;</li>
              <li>le classement de chaque liste dans le tableau Produits gagnants.</li>
            </ul>
          </div>

          <div className="text-xs leading-relaxed text-yellow-100/90">
            <p className="font-semibold text-yellow-200">Ce que fait Auto-Shipper :</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>il récupère matin et soir la liste des produits gagnants mise à jour par vos chefs de rayon ;</li>
              <li>il importe ces articles dans Mes annonces, un par un, avec contrôle des images avant publication ;</li>
              <li>il ajuste les prix de vente selon votre marge minimale ;</li>
              <li>il publie vos annonces sur les markets places reliées que vous avez cochées.</li>
            </ul>
          </div>
        </div>

        <p className="mt-4 text-xs font-semibold leading-relaxed text-yellow-200">
          Pour l'instant, cette version de DropShipper IA limite la publication auto à 50 annonces
          par jour — soit 1 500 par mois en mode auto. Tarif du mode auto : 5 crédits par tranche de
          12 h d'activité (reprise des produits gagnants, sélection, publication auto et archivage
          du journal). Chaque annonce importée consomme en plus son crédit d'annonce, comme partout
          dans l'application.
        </p>
      </div>

      {/* La seule mise en garde légale, toujours en dernier. */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="text-xs leading-relaxed text-amber-100">
          <p>
            <b>Chaque import consomme un crédit</b> et remplit votre catalogue. Le plafond quotidien
            est la seule chose qui vous protège d'un agent trop généreux : commencez bas.
          </p>
          <p className="mt-1">
            Vinted, Leboncoin et Facebook Marketplace exigent que vous validiez vous-même — publier
            à votre place enfreindrait leurs conditions et ferait suspendre votre compte vendeur.
          </p>
        </div>
      </div>
    </Layout>
  )
}
