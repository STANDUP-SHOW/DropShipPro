import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, Plus } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Roster = Awaited<ReturnType<typeof api.agentRoster>>
type Agent = Roster['pipeline'][number]

const STATE_STYLE: Record<string, string> = {
  actif: 'bg-emerald-400/15 text-emerald-300',
  inactif: 'bg-white/10 text-gray-400',
  indisponible: 'bg-red-400/15 text-red-300',
}

function AgentCard({ agent }: { agent: Agent }) {
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

      {agent.note && <p className="mt-2 text-[11px] text-amber-300">{agent.note}</p>}

      {agent.where && (
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-gray-400">
          <span>{agent.family === 'comptoir' ? 'Lui parler' : agent.where}</span>
          <ArrowRight size={11} />
        </p>
      )}
    </div>
  )

  return agent.href ? (
    <li>
      <Link to={agent.href} className="block h-full">
        {card}
      </Link>
    </li>
  ) : (
    <li>{card}</li>
  )
}

/**
 * L'équipe.
 *
 * Un vendeur doit voir qui travaille pour lui, ce que chacun fait, et lequel est
 * en panne. Les agents fournis d'office viennent en premier : ils sont là dès
 * l'inscription et n'ont rien à embaucher. Les chefs de rayon suivent, parce
 * qu'ils dépendent des secteurs que le vendeur travaille vraiment.
 */
export default function Agents() {
  const [roster, setRoster] = useState<Roster | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.agentRoster().then(setRoster).catch(() => setError("L'équipe n'a pas pu être chargée"))
  }, [])

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Users size={22} className="text-emerald-400" />
        <span>Vos agents</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Une équipe fournie avec l'application : ils importent, réécrivent, contrôlent, publient et
        répondent. Vous n'avez rien à installer.
      </p>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {!roster && !error && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}

      {roster && (
        <>
          <section className="mt-7">
            <h2 className="font-bold">La chaîne de production</h2>
            <p className="mt-1 text-xs text-gray-500">
              Ils travaillent, ils ne discutent pas. Chaque annonce passe entre leurs mains dans cet
              ordre.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roster.pipeline.map((a) => (
                <AgentCard key={a.key} agent={a} />
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="font-bold">Le comptoir</h2>
            <p className="mt-1 text-xs text-gray-500">
              Ceux à qui l'on parle. Commencez par la hotline si vous ne savez pas qui appeler : elle
              vous met en relation.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {roster.support.map((a) => (
                <AgentCard key={a.key} agent={a} />
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="font-bold">Vos chefs de rayon</h2>
            <p className="mt-1 text-xs text-gray-500">
              {roster.departments
                ? `${roster.departments} rayon(s) confié(s). Chacun surveille son secteur et vous propose des produits.`
                : "Aucun rayon confié pour l'instant. C'est eux qui alimentent le pilote automatique."}
            </p>
            <Link
              to="/rayons"
              className="btn-gradient mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              <Plus size={14} />
              <span>{roster.departments ? 'Gérer mes chefs de rayon' : 'Ajouter un chef de rayon'}</span>
            </Link>
          </section>
        </>
      )}
    </Layout>
  )
}
