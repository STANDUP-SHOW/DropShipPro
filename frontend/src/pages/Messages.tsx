import { useEffect, useState } from 'react'
import { Inbox, Send, Sparkles, Copy, Check, MailWarning, Mail, CheckCheck } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Summary = Awaited<ReturnType<typeof api.listConversations>>['conversations'][number]
type Full = Awaited<ReturnType<typeof api.getConversation>>

const TABS = [
  { id: 'OPEN', label: 'À traiter' },
  { id: 'WAITING', label: 'En attente du client' },
  { id: 'CLOSED', label: 'Clôturées' },
] as const

function when(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * La boîte de réception unifiée.
 *
 * Une seule liste pour toutes les plateformes, afin de ne plus ouvrir cinq
 * back-offices par jour. L'écran dit franchement, conversation par conversation,
 * si la réponse partira vraiment d'ici ou s'il faudra la coller chez la
 * plateforme : croire avoir répondu alors que rien n'est parti coûte un acheteur,
 * puis une note vendeur.
 */
export default function Messages() {
  const [conversations, setConversations] = useState<Summary[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('OPEN')
  const [openId, setOpenId] = useState<string | null>(null)
  const [full, setFull] = useState<Full | null>(null)
  const [reply, setReply] = useState('')
  const [drafted, setDrafted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    api
      .listConversations()
      .then((r) => setConversations(r.conversations))
      .catch(() => setError('Impossible de charger vos messages'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  useEffect(() => {
    if (!openId) {
      setFull(null)
      return
    }
    setReply('')
    setDrafted(false)
    setNotice(null)
    api.getConversation(openId).then(setFull).catch(() => setFull(null))
  }, [openId])

  const shown = conversations.filter((c) => c.status === tab)

  async function send() {
    if (!full || !reply.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.replyConversation(full.id, reply.trim(), drafted)
      setFull({ ...full, messages: [...full.messages, res.message] })
      setReply('')
      setDrafted(false)
      setNotice(res.notice)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function draft() {
    if (!full) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.draftConversation(full.id)
      setReply(res.text)
      setDrafted(true)
      setNotice(
        res.agentName
          ? `Brouillon rédigé par ${res.agentName}. Relisez-le avant d'envoyer.`
          : "Brouillon rédigé. Relisez-le avant d'envoyer.",
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (!full) return
    await api.setConversationStatus(full.id, 'CLOSED').catch(() => undefined)
    setOpenId(null)
    load()
  }

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Inbox size={22} className="text-emerald-400" />
        <span>Messages</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Les questions de vos acheteurs, toutes plateformes confondues. Votre chef de rayon peut
        rédiger la réponse ; vous la relisez et vous l'envoyez.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              setOpenId(null)
            }}
            className={
              tab === t.id
                ? 'rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold'
                : 'rounded-full border border-white/10 px-4 py-1.5 text-sm text-gray-400 hover:bg-white/5'
            }
          >
            {`${t.label} (${conversations.filter((c) => c.status === t.id).length})`}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {loading && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}

      {!loading && !conversations.length && (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucun message pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Les questions posées sur vos annonces arrivent ici, via l'extension ou vos agents.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
                className={
                  openId === c.id
                    ? 'w-full rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-left'
                    : 'w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10'
                }
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                    {c.platform}
                  </span>
                  {c.unread && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                  <span className="ml-auto text-[11px] text-gray-500">{when(c.lastMessageAt)}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold">{c.customerName}</p>
                {c.subject && <p className="truncate text-xs text-gray-400">{c.subject}</p>}
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">{c.preview}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                  {c.channel === 'email' ? <Mail size={11} /> : <MailWarning size={11} />}
                  <span>{c.channel === 'email' ? 'réponse par e-mail' : 'réponse à coller'}</span>
                </p>
              </button>
            </li>
          ))}
          {!shown.length && conversations.length > 0 && (
            <li className="text-sm text-gray-500">Rien dans cet onglet.</li>
          )}
        </ul>

        {full && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <p className="font-semibold">{full.customerName}</p>
                <p className="text-xs text-gray-500">
                  {full.subject ? `${full.platform} — ${full.subject}` : full.platform}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <CheckCheck size={13} />
                <span>Clôturer</span>
              </button>
            </div>

            <p
              className={
                full.channel === 'email'
                  ? 'mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-2 text-xs text-emerald-200'
                  : 'mt-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-xs text-amber-100'
              }
            >
              {full.channel === 'email' ? (
                <Mail size={13} className="mt-0.5 shrink-0" />
              ) : (
                <MailWarning size={13} className="mt-0.5 shrink-0" />
              )}
              <span>{full.notice}</span>
            </p>

            <div className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
              {full.messages.map((m) => (
                <div
                  key={m.id}
                  className={m.direction === 'OUT' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      m.direction === 'OUT'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-400/15 px-4 py-2.5'
                        : 'max-w-[80%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5'
                    }
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
                      {m.body}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {m.direction === 'OUT' && m.sentVia === 'manuel'
                        ? 'à coller chez la plateforme'
                        : m.direction === 'OUT'
                          ? 'envoyé par e-mail'
                          : when(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {notice && <p className="mt-3 text-xs text-emerald-300">{notice}</p>}

            <textarea
              value={reply}
              onChange={(e) => {
                setReply(e.target.value)
                setDrafted(false)
              }}
              rows={4}
              placeholder="Votre réponse…"
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={send}
                disabled={busy || !reply.trim()}
                className="btn-gradient inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <Send size={14} />
                <span>{full.channel === 'email' ? 'Envoyer' : 'Enregistrer la réponse'}</span>
              </button>

              <button
                type="button"
                onClick={draft}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"
              >
                <Sparkles size={13} />
                <span>
                  {full.agentName
                    ? `Faire rédiger par ${full.agentName} (1 crédit)`
                    : 'Faire rédiger (1 crédit)'}
                </span>
              </button>

              {reply.trim() && full.channel !== 'email' && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(reply)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? 'Copié' : 'Copier le texte'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
