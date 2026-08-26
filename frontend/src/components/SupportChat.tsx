import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Coins, ArrowRight } from 'lucide-react'
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
 * Extraite de sa page pour pouvoir s'ouvrir là où l'on a cliqué. Discuter avec
 * un agent envoyait sur une page à part, dont il fallait revenir pour en
 * essayer un autre ; on comparait donc mal, et l'équipe se lisait comme une
 * liste de liens plutôt que comme un comptoir.
 *
 * `onRoute` laisse la page décider de ce que fait une orientation de la
 * hotline : changer d'agent sur place quand elle est affichée dans la liste,
 * naviguer quand elle occupe sa propre page.
 */
export function SupportChat({
  agentKey,
  onRoute,
  /** Question pré-remplie, non envoyée : le vendeur la relit et la complète. */
  amorce,
}: {
  agentKey: string
  onRoute?: (key: string) => void
  amorce?: string
}) {
  const [data, setData] = useState<History | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState(amorce ?? '')
  const [busy, setBusy] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  /** Ce que l agent a deja repondu aujourd hui, et son plafond. */
  const [quota, setQuota] = useState<{ utilise: number; plafond: number } | null>(null)
  const [route, setRoute] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Une nouvelle amorce remplace la précédente : demander l'avis sur un second
  // produit sans que la question du premier reste dans le champ.
  useEffect(() => {
    if (amorce) setQuestion(amorce)
  }, [amorce])

  useEffect(() => {
    setRoute(null)
    setMissing(false)
    setData(null)
    api
      .supportHistory(agentKey)
      .then((r) => {
        setData(r)
        setMessages(r.messages)
      })
      .catch(() => setMissing(true))
  }, [agentKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
      const res = await api.askSupport(agentKey, text)
      setMessages((list) => [...list, res.message])
      if (res.credits !== null) setCredits(res.credits)
      if (res.quota) setQuota(res.quota)
      if (res.route) setRoute(res.route)
    } catch (e) {
      setMessages((list) => list.filter((m) => m.id !== pending.id))
      setQuestion(text)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (missing) return <p className="text-sm text-gray-400">Cet agent n'existe pas.</p>
  if (!data) return <p className="text-sm text-gray-500">Chargement…</p>

  const orientation = route ? ROUTES[route] : null

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <p className="text-xs text-gray-400">Une question posée coûte un crédit.</p>
        {/*
          Le compteur du jour, annonce d avance.
          Un plafond decouvert au moment du refus se lit comme une panne. Le
          meme plafond affiche des la troisieme reponse se lit comme une regle.
        */}
        {quota && quota.utilise >= quota.plafond / 2 ? (
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              quota.utilise >= quota.plafond ? 'text-amber-300' : 'text-gray-500'
            }`}
            title={`Chaque agent répond ${quota.plafond} fois par jour dans son abonnement.`}
          >
            {`${quota.utilise}/${quota.plafond} aujourd'hui`}
          </span>
        ) : null}
        {credits !== null ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400">
            <Coins size={13} />
            <span>{`${credits} crédit(s)`}</span>
          </span>
        ) : null}
      </div>

      <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {!messages.length ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {`Posez votre première question à ${data.agent.name}.`}
          </p>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-400/15 px-4 py-2.5'
                  : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5'
              }
            >
              {m.role === 'agent' ? (
                <p className="mb-1 text-[11px] font-semibold text-emerald-300">{data.agent.name}</p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{m.content}</p>
            </div>
          </div>
        ))}

        {busy ? <p className="text-xs text-gray-500">{`${data.agent.name} regarde…`}</p> : null}
        <div ref={endRef} />
      </div>

      {orientation ? (
        <div className="border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              // Sur la page de l'équipe, changer d'agent se fait sans quitter la
              // liste ; ailleurs, l'orientation reste une navigation.
              if (onRoute && route && route !== 'rayon') onRoute(route)
              else navigate(orientation.href)
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-400/20"
          >
            <span>{`Continuer avec ${orientation.label}`}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      ) : null}

      {error ? <p className="px-4 pb-2 text-xs text-red-400">{error}</p> : null}

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
  )
}
