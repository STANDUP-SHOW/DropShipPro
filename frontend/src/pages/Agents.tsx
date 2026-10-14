import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, ChevronDown } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { SupportChat } from '../components/SupportChat'
import { BoutonAutoMode } from '../components/BoutonAutoMode'
import { photoAgent } from '../lib/agentsPhotos'
import { ficheAgent } from '../lib/agentsTaches'

type Roster = Awaited<ReturnType<typeof api.agentRoster>>
type Agent = Roster['pipeline'][number]

const STATE_STYLE: Record<string, string> = {
  actif: 'bg-emerald-400/15 text-emerald-300',
  inactif: 'bg-white/10 text-gray-400',
  indisponible: 'bg-red-400/15 text-red-300',
}

/**
 * Comment chaque agent se paie, dit au vendeur (10/09/2026).
 *
 * — plateforme : compris dans la plateforme (les administratifs, en mode auto) ;
 * — annonces   : compris dans vos achats d'annonces (la production) ;
 * — demande    : payé à la demande, en drops (image, publicité, contrôle) ;
 * — question   : payé à la question, en drops (l'avocat, seul).
 */
const ACCESS_LABEL: Record<string, string> = {
  plateforme: 'Inclus dans la plateforme',
  annonces: "Inclus dans vos achats d'annonces",
  demande: 'Payé à la demande, en drops',
  question: 'Payé à la question, en drops',
}

/**
 * Une case d'agent, rectangulaire, d'après la maquette de max (14/10/2026) :
 * la fonction en titre, le prénom dessous, la photo à droite et une phrase
 * courte. « Voir le rôle » déplie la case sur ses tâches, une par ligne.
 *
 * La grille est en `items-start` : une case dépliée grandit seule, sans
 * étirer ses voisines de rangée.
 */
function AgentCard({
  agent,
  ouvert,
  deplie,
  onOuvrir,
  onDeplier,
  onAuto,
}: {
  agent: Agent
  ouvert: boolean
  deplie: boolean
  onOuvrir: (key: string) => void
  onDeplier: (key: string) => void
  onAuto: (key: string, enabled: boolean) => Promise<void>
}) {
  const comptoir = agent.family === 'comptoir'
  const fiche = ficheAgent(agent.key, agent.does)
  const photo = photoAgent(agent.key)
  const idTaches = `taches-${agent.key}`

  return (
    <li className="case-ds flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-tight">{agent.role}</h3>
          <p className="mt-0.5 text-xs text-gray-400">{agent.name}</p>
          <p className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-gray-300">{fiche.bref}</p>
        </div>
        {photo ? (
          <img
            src={photo}
            alt={`Portrait de ${agent.name}`}
            width={72}
            height={72}
            loading="lazy"
            className="h-[72px] w-[72px] shrink-0 rounded-xl border border-white/10 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-3xl"
          >
            {agent.emoji}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_STYLE[agent.state]}`}>{agent.state}</span>
        <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-300">
          {ACCESS_LABEL[agent.access] ?? 'Accessible'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onDeplier(agent.key)}
          aria-expanded={deplie}
          aria-controls={idTaches}
          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold hover:border-white/30"
        >
          <span>{deplie ? 'Masquer le rôle' : 'Voir le rôle'}</span>
          <ChevronDown size={13} className={`transition-transform ${deplie ? 'rotate-180' : ''}`} />
        </button>

        {/* L'action : lui parler (comptoir) ou aller voir son travail (chaîne). */}
        {comptoir ? (
          <button
            type="button"
            onClick={() => onOuvrir(agent.key)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--marque-rose)] hover:underline"
          >
            <span>{ouvert ? 'Fermer la conversation' : 'Lui parler'}</span>
            <ArrowRight size={12} />
          </button>
        ) : agent.href ? (
          <Link to={agent.href} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
            <span>{agent.where}</span>
            <ArrowRight size={12} />
          </Link>
        ) : agent.where ? (
          <span className="text-xs text-gray-500">{agent.where}</span>
        ) : null}
      </div>

      {deplie ? (
        <div id={idTaches} className="mt-3 border-t border-white/10 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ses tâches</p>
          <ul className="mt-2 space-y-1.5">
            {fiche.taches.map((t) => (
              <li key={t} className="flex gap-2 text-xs leading-relaxed text-gray-300">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--marque-rose)]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>

          {/* Ce que l'agent ne fait pas : sur du conseil comptable ou juridique,
              c'est aussi important que ce qu'il fait. */}
          {agent.caveat ? (
            <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-relaxed text-gray-400">
              {agent.caveat}
            </p>
          ) : null}
          {agent.note ? <p className="mt-2 text-[11px] text-amber-300">{agent.note}</p> : null}

          {/* L'avocat ne propose JAMAIS l'AUTO-MODE : il ne se paie qu'à la question. */}
          {agent.access !== 'question' ? (
            <div className="mt-3">
              <BoutonAutoMode compact actif={Boolean(agent.autoMode)} onBascule={(enabled) => onAuto(agent.key, enabled)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * L'équipe, rangée par service.
 *
 * Elle était rangée par mécanique — « la chaîne de production », « le comptoir »
 * — ce qui dit comment on s'en sert, pas à quoi ils servent. Un vendeur qui
 * cherche quelqu'un pour ses photos ne se demande pas si l'agent discute ou
 * produit. Les services suivent donc l'organigramme d'une vraie maison :
 * administratif, production, marketing, logistique, puis les chefs de rayon,
 * qui sont les seuls à s'embaucher un par un.
 */
export default function Agents() {
  const [roster, setRoster] = useState<Roster | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** L agent dont la conversation est ouverte, une seule a la fois. */
  const [ouvert, setOuvert] = useState<string | null>(null)
  /** Les cases dépliées sur leurs tâches ; plusieurs peuvent l'être à la fois. */
  const [deplies, setDeplies] = useState<Set<string>>(() => new Set())
  /** Le tri par fonction : un seul bloc de boutons groupés (consigne de max, 14/10/2026). */
  const [fonction, setFonction] = useState<string>('toutes')

  function deplier(key: string) {
    setDeplies((actuel) => {
      const suite = new Set(actuel)
      if (suite.has(key)) suite.delete(key)
      else suite.add(key)
      return suite
    })
  }

  useEffect(() => {
    api.agentRoster().then(setRoster).catch(() => setError("L'équipe n'a pas pu être chargée"))
  }, [])

  const tous: Agent[] = roster ? [...roster.pipeline, ...roster.support] : []

  /** Bascule l'AUTO-MODE d'un agent et reflète la réponse du serveur. */
  async function basculerAuto(key: string, enabled: boolean) {
    const r = await api.setAgentAuto(key, enabled)
    setRoster((actuel) => {
      if (!actuel) return actuel
      const maj = (liste: Agent[]) => liste.map((a) => (a.key === key ? { ...a, autoMode: r.autoMode } : a))
      return { ...actuel, pipeline: maj(actuel.pipeline), support: maj(actuel.support) }
    })
  }

  return (
    <Layout>
      <div className="flex items-center gap-2.5">
        <Users size={22} className="text-[var(--marque-orange)]" />
        <h1 className="text-xl font-extrabold tracking-wide">MES AGENTS IA</h1>
      </div>
      <p className="mt-0.5 max-w-3xl text-xs text-gray-500">
        L'équipe fournie avec l'application, rangée par fonction : elle importe, réécrit, contrôle,
        publie, photographie et répond. Ouvrez « Voir le rôle » pour lire les tâches de chacun.
      </p>
      <p className="mt-1 max-w-3xl text-xs text-gray-500">
        Les <b className="text-gray-300">chefs de rayon</b> sont dans{' '}
        <Link to="/rayons" className="text-[var(--marque-rose)] underline">
          Mes rayons
        </Link>
        {' '}: ils se confient un par un, selon les rayons que vous travaillez.
      </p>

      {roster ? (
        <div role="group" aria-label="Trier par fonction" className="mt-4 inline-flex flex-wrap rounded-lg border border-white/10 p-0.5">
          {[{ key: 'toutes', label: 'Toutes les fonctions' }, ...roster.categories].map((c) => {
            const n = c.key === 'toutes' ? tous.length : tous.filter((a) => a.category === c.key).length
            if (!n) return null
            const actif = fonction === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFonction(c.key)}
                aria-pressed={actif}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${actif ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {`${c.label} · ${n}`}
              </button>
            )
          })}
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      {!roster && !error ? <p className="mt-6 text-sm text-gray-500">Chargement…</p> : null}

      {roster
        ? roster.categories.map((cat) => {
            const membres = tous.filter((a) => a.category === cat.key)
            if (!membres.length || (fonction !== 'toutes' && fonction !== cat.key)) return null
            // L'agent de comptoir dont la conversation est ouverte, s'il est de
            // cette section : son tchat s'affiche en pleine largeur sous la grille.
            const agentOuvert = membres.find((a) => a.key === ouvert && a.family === 'comptoir')
            return (
              <section key={cat.key} className="mt-6">
                <h2 className="text-sm font-bold">{cat.label}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{cat.hint}</p>
                <ul className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {membres.map((a) => (
                    <AgentCard
                      key={a.key}
                      agent={a}
                      ouvert={ouvert === a.key}
                      deplie={deplies.has(a.key)}
                      onOuvrir={(k) => setOuvert((actuel) => (actuel === k ? null : k))}
                      onDeplier={deplier}
                      onAuto={basculerAuto}
                    />
                  ))}
                </ul>
                {agentOuvert ? (
                  <div className="mt-3">
                    <SupportChat
                      agentKey={agentOuvert.key}
                      onRoute={(k) => setOuvert((actuel) => (actuel === k ? null : k))}
                    />
                  </div>
                ) : null}
              </section>
            )
          })
        : null}

    </Layout>
  )
}
