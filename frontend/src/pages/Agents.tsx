import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { SupportChat } from '../components/SupportChat'
import { BoutonAutoMode } from '../components/BoutonAutoMode'

type Roster = Awaited<ReturnType<typeof api.agentRoster>>
type Agent = Roster['pipeline'][number]

const STATE_STYLE: Record<string, string> = {
  actif: 'bg-emerald-400/15 text-emerald-300',
  inactif: 'bg-white/10 text-gray-400',
  indisponible: 'bg-red-400/15 text-red-300',
}

function AgentCard({
  agent,
  ouvert,
  onOuvrir,
  onAuto,
}: {
  agent: Agent
  ouvert: boolean
  onOuvrir: (key: string) => void
  onAuto: (key: string, enabled: boolean) => Promise<void>
}) {
  const card = (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl">{agent.emoji}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_STYLE[agent.state]}`}>
          {agent.state}
        </span>
      </div>

      <p className="mt-2 font-semibold">{agent.name}</p>
      <p className="text-xs text-gray-400">{agent.role}</p>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-500">{agent.does}</p>

      {/* Ce que l'agent ne fait pas : sur du conseil comptable ou juridique,
          c'est aussi important que ce qu'il fait. */}
      {agent.caveat ? (
        <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-relaxed text-gray-400">
          {agent.caveat}
        </p>
      ) : null}

      {agent.monthly ? (
        <p className="mt-2 text-[11px] font-semibold text-sky-300">
          {agent.hired && agent.paidUntil
            ? `Embauché jusqu'au ${new Date(agent.paidUntil).toLocaleDateString('fr-FR')}`
            : `${(agent.monthly / 100).toFixed(2)} € par mois`}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">Compris dans votre abonnement</p>
      )}

      {agent.note ? <p className="mt-2 text-[11px] text-amber-300">{agent.note}</p> : null}

      {agent.where ? (
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-gray-400">
          <span>
            {agent.family === 'comptoir' ? (ouvert ? 'Fermer la conversation' : 'Lui parler') : agent.where}
          </span>
          <ArrowRight size={11} />
        </p>
      ) : null}
    </div>
  )

  /*
   * Un agent de comptoir ouvre sa conversation sous sa carte, sans quitter la
   * page. Changer de page pour poser une question faisait perdre la liste, donc
   * l'idée d'en essayer un autre. Les agents de chaîne, eux, mènent bien
   * ailleurs : leur travail se voit dans une autre page.
   */
  /*
   * L'interrupteur AUTO-MODE vit SOUS la carte, jamais dedans : la carte est
   * elle-même un bouton (comptoir) ou un lien (chaîne), et un bouton imbriqué
   * dans l'un ou l'autre est du HTML invalide au clavier imprévisible.
   */
  const interrupteur = (
    <div className="mt-2">
      <BoutonAutoMode compact actif={Boolean(agent.autoMode)} onBascule={(enabled) => onAuto(agent.key, enabled)} />
    </div>
  )

  if (agent.family === 'comptoir') {
    return (
      <li className={ouvert ? 'sm:col-span-2 lg:col-span-3' : 'flex flex-col'}>
        <button
          type="button"
          onClick={() => onOuvrir(agent.key)}
          className={`block w-full text-left ${ouvert ? '' : 'flex-1'}`}
        >
          {card}
        </button>
        {interrupteur}
        {ouvert ? (
          <div className="mt-3">
            <SupportChat agentKey={agent.key} onRoute={onOuvrir} />
          </div>
        ) : null}
      </li>
    )
  }

  return agent.href ? (
    <li className="flex flex-col">
      <Link to={agent.href} className="block flex-1">
        {card}
      </Link>
      {interrupteur}
    </li>
  ) : (
    <li className="flex flex-col">
      <div className="flex-1">{card}</div>
      {interrupteur}
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
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Users size={22} className="text-emerald-400" />
        <span>Mes agents ADMIN</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        L'équipe fournie avec l'application : elle importe, réécrit, contrôle, publie, photographie
        et répond. Vous n'avez rien à installer, et rien à embaucher.
      </p>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Les <b>chefs de rayon</b> sont ailleurs, dans{' '}
        <Link to="/rayons" className="text-purple-300 underline">
          Mes rayons
        </Link>{' '}
        : ils s'embauchent un par un, dépendent des rayons que vous travaillez vraiment, et se
        paient à part. Les mélanger ici laissait croire qu'ils étaient inclus.
      </p>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      {!roster && !error ? <p className="mt-6 text-sm text-gray-500">Chargement…</p> : null}

      {roster
        ? roster.categories.map((cat) => {
            const membres = tous.filter((a) => a.category === cat.key)
            if (!membres.length) return null
            return (
              <section key={cat.key} className="mt-8">
                <h2 className="font-bold">Mes agents {cat.label}</h2>
                <p className="mt-1 text-xs text-gray-500">{cat.hint}</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {membres.map((a) => (
                    <AgentCard
                      key={a.key}
                      agent={a}
                      ouvert={ouvert === a.key}
                      onOuvrir={(k) => setOuvert((actuel) => (actuel === k ? null : k))}
                      onAuto={basculerAuto}
                    />
                  ))}
                </ul>
              </section>
            )
          })
        : null}

    </Layout>
  )
}
