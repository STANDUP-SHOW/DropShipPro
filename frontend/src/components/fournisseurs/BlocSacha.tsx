import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, MicOff, Send } from 'lucide-react'
import { photoAgent } from '../../lib/agentsPhotos'
import { api, type AgentCardData } from '../../lib/api'

/**
 * Sacha, l'agent des fournisseurs, en bas de la page Fournisseurs (demande de
 * Max du 14/10/2026) : un récap de sa fiche — son rôle, ses tâches une par
 * ligne —, la vraie discussion avec lui, et dessous le champ pour écrire ou
 * dicter.
 *
 * Tout vient du serveur : la fiche de l'équipe (/chat/agents/roster) et
 * l'historique (/chat/support/scrapper). Rien n'est écrit ici à sa place.
 */

const CLE = 'scrapper'

type Message = { id: string; role: string; content: string; createdAt: string }

/** Ce que le navigateur expose pour la dictée, quand il l'expose (Chrome, Edge). */
type Reconnaissance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function moteurVocal(): Reconnaissance | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconnaissance
    webkitSpeechRecognition?: new () => Reconnaissance
  }
  const Moteur = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Moteur) return null
  const m = new Moteur()
  m.lang = 'fr-FR'
  m.continuous = false
  m.interimResults = false
  return m
}

/** Les tâches de la fiche : la liste quand le serveur la donne, sinon les phrases de « ce qu'il fait ». */
function tachesDe(agent: AgentCardData & { taches?: string[] }): string[] {
  if (Array.isArray(agent.taches) && agent.taches.length) return agent.taches
  return agent.does
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const ETAT: Record<AgentCardData['state'], { label: string; teinte: string }> = {
  actif: { label: 'Actif', teinte: 'bg-emerald-400/15 text-emerald-300' },
  inactif: { label: 'Inactif', teinte: 'bg-white/10 text-[var(--texte-2)]' },
  indisponible: { label: 'Indisponible', teinte: 'bg-amber-400/15 text-amber-200' },
}

export function BlocSacha({ className = '' }: { className?: string }) {
  const [agent, setAgent] = useState<AgentCardData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ecoute, setEcoute] = useState(false)
  const moteur = useRef<Reconnaissance | null>(null)
  const fil = useRef<HTMLDivElement | null>(null)
  const [vocalDispo] = useState(() => typeof window !== 'undefined' && moteurVocal() !== null)

  useEffect(() => {
    api
      .agentRoster()
      .then((r) => setAgent(r.pipeline.find((a) => a.key === CLE) ?? null))
      .catch(() => undefined)
    api
      .supportHistory(CLE)
      .then((r) => setMessages(r.messages))
      .catch(() => undefined)
  }, [])

  // Le micro est coupé quand on quitte la page.
  useEffect(() => () => moteur.current?.stop(), [])

  // La dernière réponse reste en vue.
  useEffect(() => {
    if (fil.current) fil.current.scrollTop = fil.current.scrollHeight
  }, [messages, busy])

  const nom = agent?.name ?? 'Sacha'

  function dicter() {
    if (ecoute) {
      moteur.current?.stop()
      setEcoute(false)
      return
    }
    const m = moteurVocal()
    if (!m) return
    moteur.current = m
    m.onresult = (e) => {
      const dit = e.results[0]?.[0]?.transcript ?? ''
      setQuestion((actuel) => (actuel ? `${actuel} ${dit}` : dit))
    }
    m.onerror = () => setEcoute(false)
    m.onend = () => setEcoute(false)
    m.start()
    setEcoute(true)
  }

  async function envoyer() {
    const texte = question.trim()
    if (texte.length < 2 || busy) return
    setBusy(true)
    setErreur(null)
    try {
      const res = await api.askSupport(CLE, texte)
      setMessages((m) => [
        ...m,
        { id: `q-${res.message.id}`, role: 'user', content: texte, createdAt: res.message.createdAt },
        res.message,
      ])
      setQuestion('')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La réponse n'est pas arrivée. Réessayez dans un instant.")
    } finally {
      setBusy(false)
    }
  }

  const photo = photoAgent(CLE)
  const etat = agent ? ETAT[agent.state] : null

  return (
    <section className={`case-ds flex min-w-0 flex-col p-4 ${className}`}>
      {/* La fiche : qui il est et ce qu'il fait, photo à droite. */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--texte)]">{`Discuter avec ${nom}`}</h2>
            {etat ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${etat.teinte}`}>{etat.label}</span> : null}
          </div>
          {agent ? <p className="text-xs text-[var(--texte-2)]">{agent.role}</p> : null}

          {agent ? (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-3)]">Son rôle</p>
              <ul className="mt-1 space-y-1">
                {tachesDe(agent).map((t) => (
                  <li key={t} className="flex gap-2 text-xs leading-relaxed text-[var(--texte-2)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--marque-rose)]" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              {agent.where ? (
                <p className="mt-2 text-[11px] text-[var(--texte-3)]">{`Son travail se voit : ${agent.where}.`}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {photo ? (
          <img src={photo} alt={nom} className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-white/15" />
        ) : null}
      </div>

      {/* La discussion, telle qu'elle est enregistrée. */}
      <div ref={fil} className="mt-4 max-h-72 min-h-[6rem] flex-1 space-y-2 overflow-y-auto rounded-xl border border-[var(--trait)] bg-black/15 p-3">
        {messages.length === 0 && !busy ? (
          <p className="py-4 text-center text-xs text-[var(--texte-3)]">
            {`Aucune question posée à ${nom} pour l'instant.`}
          </p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed ${
              m.role === 'user'
                ? 'ml-auto rounded-br-sm bg-[var(--marque-rose)]/15 text-[var(--texte)]'
                : 'rounded-bl-sm bg-white/[0.05] text-[var(--texte-2)]'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy ? <p className="text-xs text-[var(--texte-3)]">{`${nom} vous répond…`}</p> : null}
      </div>

      {erreur ? <p className="mt-2 text-xs text-red-300">{erreur}</p> : null}

      {/* Écrire ou dicter, puis envoyer. */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') envoyer()
          }}
          placeholder={ecoute ? 'Je vous écoute…' : `Demandez à ${nom} : ce fournisseur est-il fiable pour de l'électronique ?`}
          className="min-w-0 flex-1 rounded-xl border border-[var(--trait)] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[var(--marque-rose)]"
        />
        {vocalDispo ? (
          <button
            type="button"
            onClick={dicter}
            title={ecoute ? 'Arrêter la dictée' : 'Dicter ma question'}
            className={`shrink-0 rounded-xl p-2 transition ${
              ecoute ? 'bg-red-500/80 text-white' : 'border border-[var(--trait)] text-[var(--texte-2)] hover:bg-white/10'
            }`}
          >
            {ecoute ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={envoyer}
          disabled={busy || question.trim().length < 2}
          title={`Envoyer à ${nom}`}
          className="btn-gradient shrink-0 rounded-xl p-2 disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </section>
  )
}
