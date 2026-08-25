import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Layout } from '../components/Layout'
import { SupportChat } from '../components/SupportChat'

/**
 * La conversation avec un agent, sur sa propre page.
 *
 * Elle ne sert plus qu'aux liens directs — un favori, une orientation de la
 * hotline, une adresse partagée. Depuis la page de l'équipe, la conversation
 * s'ouvre sur place : changer de page pour poser une question faisait perdre la
 * liste des agents, donc l'idée d'en essayer un autre.
 */
export default function SupportAgent() {
  const { key = '' } = useParams()

  return (
    <Layout>
      <Link to="/agents" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
        <ArrowLeft size={13} />
        <span>Mes agents</span>
      </Link>

      <div className="mt-4 max-w-3xl">
        <SupportChat agentKey={key} />
      </div>
    </Layout>
  )
}
