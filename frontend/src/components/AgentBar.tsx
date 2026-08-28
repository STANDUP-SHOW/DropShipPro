import { useEffect, useRef, useState } from 'react'
import { Send, Mic, MicOff, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../lib/api'

/**
 * L'agent de la page, en haut, toujours ouvert.
 *
 * Discuter avec un agent envoyait dans un écran à part : le vendeur qui a une
 * question en regardant ses publicités devait quitter ses publicités pour la
 * poser. Il ne la posait donc pas.
 *
 * La barre reste au-dessus du contenu, repliée sur une seule ligne, et se
 * déplie quand une réponse arrive. Elle ne remplace pas la page de l'agent —
 * elle évite d'y aller pour une question de dix secondes.
 *
 * **La voix passe par le navigateur**, pas par un service. `SpeechRecognition`
 * est gratuit, ne demande aucune clé, n'envoie rien à nos serveurs et ne coûte
 * rien à l'usage. Il n'existe que sur Chrome et Edge : le bouton ne s'affiche
 * pas ailleurs plutôt que d'apparaître et de ne rien faire.
 */

/** Ce que le navigateur expose, quand il l'expose. */
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

  const moteur = new Moteur()
  moteur.lang = 'fr-FR'
  // Une seule phrase à la fois : la dictée continue ramasse la conversation de
  // la pièce dès qu'on oublie de couper.
  moteur.continuous = false
  moteur.interimResults = false
  return moteur
}

export function AgentBar({
  agentKey,
  nom,
  emoji,
  exemple,
}: {
  agentKey: string
  nom: string
  emoji: string
  /** Une question type, pour que le champ ne soit pas muet. */
  exemple: string
}) {
  const [question, setQuestion] = useState('')
  const [reponse, setReponse] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deplie, setDeplie] = useState(false)
  const [ecoute, setEcoute] = useState(false)
  const [quota, setQuota] = useState<{ utilise: number; plafond: number } | null>(null)
  const moteur = useRef<Reconnaissance | null>(null)

  const [vocalDispo] = useState(() => typeof window !== 'undefined' && moteurVocal() !== null)

  // Le moteur vocal est arrêté quand on quitte la page : laissé actif, il garde
  // le micro ouvert et le navigateur affiche l'indicateur d'enregistrement.
  useEffect(() => () => moteur.current?.stop(), [])

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
      // Ajouté à ce qui est déjà tapé : le vendeur dicte souvent après avoir
      // commencé à écrire.
      setQuestion((actuel) => (actuel ? `${actuel} ${dit}` : dit))
    }
    m.onerror = () => setEcoute(false)
    m.onend = () => setEcoute(false)

    m.start()
    setEcoute(true)
  }

  async function demander() {
    const texte = question.trim()
    if (texte.length < 2 || busy) return

    setBusy(true)
    setDeplie(true)
    setReponse(null)
    try {
      const res = await api.askSupport(agentKey, texte)
      setReponse(res.message.content)
      setQuestion('')
      if (res.quota) setQuota(res.quota)
    } catch (e) {
      setReponse(
        e instanceof Error ? e.message : "La réponse n'est pas arrivée. Réessayez dans un instant.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-purple-400/20 bg-purple-500/[0.07] p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xl leading-none" title={nom}>
          {emoji}
        </span>

        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') demander()
          }}
          placeholder={ecoute ? 'Je vous écoute…' : exemple}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm outline-none focus:border-purple-400/70"
        />

        {/* Le micro n'apparaît que là où il fonctionne. */}
        {vocalDispo ? (
          <button
            type="button"
            onClick={dicter}
            title={ecoute ? 'Arrêter la dictée' : 'Dicter ma question'}
            className={`shrink-0 rounded-xl p-2 transition ${
              ecoute
                ? 'bg-red-500/80 text-white'
                : 'border border-white/10 text-gray-300 hover:bg-white/10'
            }`}
          >
            {ecoute ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={demander}
          disabled={busy || question.trim().length < 2}
          className="btn-gradient shrink-0 rounded-xl p-2 disabled:opacity-40"
          title={`Demander à ${nom}`}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>

        {reponse ? (
          <button
            type="button"
            onClick={() => setDeplie((v) => !v)}
            title={deplie ? 'Replier' : 'Revoir la réponse'}
            className="shrink-0 rounded-xl border border-white/10 p-2 text-gray-400 hover:bg-white/10"
          >
            {deplie ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        ) : null}
      </div>

      {deplie && (busy || reponse) ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-relaxed">
          {busy ? (
            <p className="text-gray-400">{`${nom} vous répond…`}</p>
          ) : (
            <p className="whitespace-pre-wrap">{reponse}</p>
          )}
        </div>
      ) : null}

      {/*
        Le compteur du jour, à partir de la moitié seulement.
        Un plafond découvert au moment du refus se lit comme une panne ; le même
        plafond affiché se lit comme une règle.
      */}
      {quota && quota.utilise >= quota.plafond / 2 ? (
        <p
          className={`mt-1.5 text-right text-[11px] ${
            quota.utilise >= quota.plafond ? 'text-amber-300' : 'text-gray-500'
          }`}
        >
          {`${quota.utilise}/${quota.plafond} réponses aujourd'hui`}
        </p>
      ) : null}
    </section>
  )
}
