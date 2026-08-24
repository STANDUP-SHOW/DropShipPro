import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Send, Coins, ArrowRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type History = Awaited<ReturnType<typeof api.supportHistory>>
type Message = History['messages'][number]

/** Où mène une orientation de la hotline. */
const ROUTES: Record<string, { label: string; href: string }> = {
  commercial: { label: 'Béatrice, service commercial', href: '/agents/commercial' },
  sav: { label: 'Marc, SAV', href: '/agents/sav' },
  livraisons: { label: 'Yann, livraisons', href: '/agents/livraisons' },
  rayon: { label: 'vos chefs de rayon', href: '/rayons' },
}

/**
 * La conversation avec un agent de comptoir.
 *
 * Même mécanique que le chat d'un chef de rayon, mais l'agent lit d'abord l'état
 * réel du compte — commandes, litiges, factures — limité à son domaine. Un
 * vendeur qui demande où est un colis attend qu'on regarde, pas un conseil
 * général sur la logistique.
 */
export default function SupportAgent() {
  const { key = '' } = useParams()
  const [data, setData] = useState<History | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [route, setRoute] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    setRoute(null)
    api
      .supportHistory(key)
      .then((r) => {
        setData(r)
        setMessages(r.messages)
      })
      .catch(() => setMissing(true))
  }, [key])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function ask() {
    const text = question.trim()
    if (!text || busy) return

    setBusy(true)
    setError(null)
    setRoute(null)
    const pending: Message = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((list) => [...list, pending])
    setQuestion('')

    try {
      const res = await api.askSupport(key, text)
      setMessages((list) => [...list, res.message])
      if (res.credits !== null) setCredits(res.credits)
      if (res.route) setRoute(res.route)
    } catch (e) {
      setMessages((list) => list.filter((m) => m.id !== pending.id))
      setQuestion(text)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <Layout>
        <p className="text-sm text-gray-400">Cet agent n'existe pas.</p>
        <Link to="/agents" className="mt-3 inline-block text-sm underline">
          Retour à vos agents
        </Link>
      </Layout>
    )
  }

  if (!data) {
    return (
      <Layout>
        <p className="text-sm text-gray-500">Chargement…</p>
      </Layout>
    )
  }

  const orientation = route ? ROUTES[route] : null

  return (
    <Layout>
      <Link to="/agents" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
        <ArrowLeft size={13} />
        <span>Vos agents</span>
      </Link>

      <h1 className="mt-3 flex items-center gap-3 text-2xl font-bold">
        <span className="text-3xl">{data.agent.emoji}</span>
        <span>{`${data.agent.name} — ${data.agent.role}`}</span>
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-400">{data.agent.does}</p>

      <div className="mt-5 max-w-3xl rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <p className="text-xs text-gray-400">Une question posée coûte un crédit.</p>
          {credits !== null && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400">
              <Coins size={13} />
              <span>{`${credits} crédit(s)`}</span>
            </span>
          )}
        </div>

        <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
          {!messages.length && (
            <p className="py-8 text-center text-sm text-gray-500">
              {`Posez votre première question à ${data.agent.name}.`}
            </p>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-400/15 px-4 py-2.5'
                    : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5'
                }
              >
                {m.role === 'agent' && (
                  <p className="mb-1 text-[11px] font-semibold text-emerald-300">{data.agent.name}</p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{m.content}</p>
              </div>
            </div>
          ))}

          {busy && <p className="text-xs text-gray-500">{`${data.agent.name} regarde…`}</p>}
          <div ref={endRef} />
        </div>

        {orientation && (
          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate(orientation.href)}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-400/20"
            >
              <span>{`Continuer avec ${orientation.label}`}</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}

        {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder={`Une question pour ${data.agent.name} ?`}
            className="flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={ask}
            disabled={busy || !question.trim()}
            className="btn-gradient inline-flex shrink-0 items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <Send size={14} />
            <span>Envoyer</span>
          </button>
        </div>
      </div>
    </Layout>
  )
}
