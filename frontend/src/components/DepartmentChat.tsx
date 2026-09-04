import { FicheAgentChat } from './VignetteProfil'
import { useEffect, useRef, useState } from 'react'
import { Send, Coins, Info, Mic, MicOff } from 'lucide-react'
import { api } from '../lib/api'

type Message = Awaited<ReturnType<typeof api.chatHistory>>['messages'][number]

/**
 * La conversation avec un chef de rayon.
 *
 * Une question hors de son rayon n'est pas facturée : le vendeur qui paie pour
 * s'entendre dire « je ne m'occupe pas de ça » aurait raison de le mal prendre.
 * L'écran l'affiche explicitement, plutôt que de laisser deviner ce qui a été
 * décompté.
 */
export function DepartmentChat({
  departmentId,
  agentName,
  emoji = '🛍️',
  role = 'Chef de rayon',
}: {
  departmentId: string
  agentName: string
  emoji?: string
  /** Le rayon tenu, montre dans la fiche en tete du tchat. */
  role?: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const recognition = useRef<any>(null)

  /**
   * La dictée, quand le navigateur sait le faire.
   *
   * Chrome expose la reconnaissance vocale, Firefox et Safari non. Le micro
   * n'apparaît donc que là où il fonctionne : un bouton qui ne fait rien vaut
   * moins que pas de bouton.
   */
  const voiceSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  function toggleVoice() {
    if (!voiceSupported) return

    if (listening) {
      recognition.current?.stop()
      setListening(false)
      return
    }

    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const engine = new Recognition()
    engine.lang = 'fr-FR'
    engine.interimResults = true
    engine.continuous = false

    engine.onresult = (event: any) => {
      // On recompose tout depuis le début : les moteurs renvoient des segments
      // provisoires qu'ils corrigent ensuite, et concaténer donnerait des
      // répétitions.
      let texte = ''
      for (let i = 0; i < event.results.length; i++) texte += event.results[i][0].transcript
      setQuestion(texte)
    }
    engine.onerror = () => setListening(false)
    engine.onend = () => setListening(false)

    recognition.current = engine
    engine.start()
    setListening(true)
  }

  useEffect(() => {
    api
      .chatHistory(departmentId)
      .then((r) => setMessages(r.messages))
      .catch(() => setError("Impossible de charger la conversation"))
  }, [departmentId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function ask() {
    const text = question.trim()
    if (!text || busy) return

    setBusy(true)
    setError(null)
    // La question s'affiche immédiatement : attendre la réponse pour la montrer
    // donnerait l'impression que rien n'a été envoyé.
    const pending: Message = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      billed: true,
      createdAt: new Date().toISOString(),
    }
    setMessages((list) => [...list, pending])
    setQuestion('')

    try {
      const res = await api.askDepartment(departmentId, text)
      setMessages((list) => [...list, res.message])
      if (res.credits !== null && res.credits !== undefined) setCredits(res.credits)
    } catch (e) {
      setMessages((list) => list.filter((m) => m.id !== pending.id))
      setQuestion(text)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/5">
      {/* La fiche du chef, en tete de la conversation (06/09/2026). */}
      <FicheAgentChat prenom={agentName} role={role} emoji={emoji} />
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Info size={14} className="shrink-0 text-gray-500" />
        <p className="text-xs text-gray-400">
          {`${agentName} ne répond que sur son rayon. Une question hors sujet n'est pas facturée.`}
        </p>
        {credits !== null && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-gray-400">
            <Coins size={13} />
            <span>{`${credits} crédit(s)`}</span>
          </span>
        )}
      </div>

      <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {!messages.length && (
          <p className="py-8 text-center text-sm text-gray-500">
            {`Posez votre première question à ${agentName}.`}
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
                <p className="mb-1 text-[11px] font-semibold text-emerald-300">{agentName}</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{m.content}</p>
              {m.role === 'agent' && !m.billed && (
                <p className="mt-1 text-[11px] text-gray-500">Hors rayon — non facturé</p>
              )}
            </div>
          </div>
        ))}

        {busy && <p className="text-xs text-gray-500">{`${agentName} réfléchit…`}</p>}
        <div ref={endRef} />
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder={listening ? "Parlez…" : `Une question pour ${agentName} ?`}
          className="flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            title={listening ? 'Arrêter la dictée' : 'Dicter votre question'}
            className={
              listening
                ? 'shrink-0 rounded-xl border border-red-400/40 bg-red-400/15 px-3 py-2 text-red-300'
                : 'shrink-0 rounded-xl border border-white/10 px-3 py-2 text-gray-400 hover:bg-white/5'
            }
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        )}
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
