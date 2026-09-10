import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { SupportChat } from '../components/SupportChat'
import { BoutonAutoMode } from '../components/BoutonAutoMode'
import { VignetteProfil } from '../components/VignetteProfil'
import { photoAgent } from '../lib/agentsPhotos'

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
 * Une carte d'agent, à hauteur égale de toutes les autres.
 *
 * La carte n'est plus un gros bouton : le bouton IA AUTO-MODE vit DEDANS
 * (demandé le 10/09/2026), et un bouton dans un bouton est du HTML invalide.
 * Le pied de fiche — étiquette de prix, interrupteur, action — est collé en bas
 * (`mt-auto`) : avec `auto-rows-fr` sur la grille, toutes les cartes prennent la
 * hauteur de la plus grande, et leurs pieds s'alignent.
 *
 * La conversation d'un agent de comptoir ne s'ouvre plus DANS la grille (elle
 * gonflerait toutes les cartes), mais en pleine largeur SOUS la section.
 */
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
  const comptoir = agent.family === 'comptoir'

  return (
    <li className="h-full">
      <VignetteProfil
        prenom={agent.name}
        role={agent.role}
        emoji={agent.emoji}
        photo={photoAgent(agent.key)}
        coin={
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_STYLE[agent.state]}`}>
            {agent.state}
          </span>
        }
      >
        <p className="text-xs leading-relaxed text-gray-500">{agent.does}</p>

        {/* Ce que l'agent ne fait pas : sur du conseil comptable ou juridique,
            c'est aussi important que ce qu'il fait. */}
        {agent.caveat ? (
          <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-relaxed text-gray-400">
            {agent.caveat}
          </p>
        ) : null}

        {/* Le pied de fiche, collé en bas — c'est lui qui aligne les cartes. */}
        <div className="mt-auto pt-3">
          <p className="text-[11px] font-semibold text-sky-300">{ACCESS_LABEL[agent.access] ?? 'Accessible'}</p>
          {agent.note ? <p className="mt-1 text-[11px] text-amber-300">{agent.note}</p> : null}

          {/* Le bouton IA AUTO-MODE fait partie du bloc (10/09/2026). */}
          <div className="mt-2">
            <BoutonAutoMode compact actif={Boolean(agent.autoMode)} onBascule={(enabled) => onAuto(agent.key, enabled)} />
          </div>

          {/* L'action : lui parler (comptoir) ou aller voir son travail (chaîne). */}
          <div className="mt-2">
            {comptoir ? (
              <button
                type="button"
                onClick={() => onOuvrir(agent.key)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-300 hover:text-purple-200"
              >
                <span>{ouvert ? 'Fermer la conversation' : 'Lui parler'}</span>
                <ArrowRight size={11} />
              </button>
            ) : agent.href ? (
              <Link to={agent.href} className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200">
                <span>{agent.where}</span>
                <ArrowRight size={11} />
              </Link>
            ) : agent.where ? (
              <span className="text-[11px] text-gray-500">{agent.where}</span>
            ) : null}
          </div>
        </div>
      </VignetteProfil>
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
        : ils se confient un par un (gratuitement), dépendent des rayons que vous travaillez
        vraiment, et leurs actions se paient en drops comme le reste.
      </p>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      {!roster && !error ? <p className="mt-6 text-sm text-gray-500">Chargement…</p> : null}

      {roster
        ? roster.categories.map((cat) => {
            const membres = tous.filter((a) => a.category === cat.key)
            if (!membres.length) return null
            // L'agent de comptoir dont la conversation est ouverte, s'il est de
            // cette section : son tchat s'affiche en pleine largeur sous la grille.
            const agentOuvert = membres.find((a) => a.key === ouvert && a.family === 'comptoir')
            return (
              <section key={cat.key} className="mt-8">
                <h2 className="font-bold">Mes agents {cat.label}</h2>
                <p className="mt-1 text-xs text-gray-500">{cat.hint}</p>
                {/* `auto-rows-fr` : toutes les rangées à la hauteur de la plus
                    grande carte — les blocs font donc tous la même taille. */}
                <ul className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
