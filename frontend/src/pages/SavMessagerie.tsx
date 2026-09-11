import { useEffect, useState } from 'react'
import { Inbox, Send, Sparkles, Copy, Check, MailWarning, Mail, CheckCheck, Archive, MailPlus, Plus, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { BandeauDemo } from '../components/ModeDemo'
import { DEMO_CONVERSATIONS_FOURNISSEURS, demoFilConversationFournisseur } from '../lib/demoJeux'

type Summary = Awaited<ReturnType<typeof api.listSupplierConversations>>['conversations'][number]
type Full = Awaited<ReturnType<typeof api.getSupplierConversation>>

const TABS = [
  { id: 'OPEN', label: 'À traiter' },
  { id: 'WAITING', label: 'En attente du fournisseur' },
  { id: 'CLOSED', label: 'Archivées' },
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
 * La messagerie fournisseurs — jumelle de la messagerie market places, dans
 * l'autre sens.
 *
 * Ici, ce sont les échanges du vendeur avec ses fournisseurs : rupture, délai,
 * facture, litige. Même écran que la boîte acheteurs (tabs, filtre, tri, fil,
 * rédaction par l'IA), même honnêteté : la page dit, fil par fil, si le message
 * partira vraiment par e-mail ou s'il faudra le coller dans la messagerie du
 * fournisseur. Comme les fournisseurs n'écrivent pas les premiers, le vendeur
 * ouvre lui-même un fil avec « Nouveau message ».
 */
export default function SavMessagerie() {
  const [conversations, setConversations] = useState<Summary[]>([])
  const [demo] = useDemo()
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
  const [fournisseur, setFournisseur] = useState('')
  const [tri, setTri] = useState<'recent' | 'ancien'>('recent')
  const [seulementNonLus, setSeulementNonLus] = useState(false)

  // Le formulaire « Nouveau message fournisseur ».
  const [compose, setCompose] = useState(false)
  const [nomFournisseur, setNomFournisseur] = useState('')
  const [emailFournisseur, setEmailFournisseur] = useState('')
  const [sujet, setSujet] = useState('')
  const [corps, setCorps] = useState('')

  function load() {
    setLoading(true)
    api
      .listSupplierConversations()
      .then((r) => setConversations(r.conversations))
      .catch(() => setError('Impossible de charger votre messagerie fournisseurs'))
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
    // Un fil de démonstration se sert depuis le jeu : rien ne part.
    if (openId.startsWith('demo-')) {
      setFull(demoFilConversationFournisseur(openId) as unknown as Full)
      return
    }
    api.getSupplierConversation(openId).then(setFull).catch(() => setFull(null))
  }, [openId])

  const sourceConversations: Summary[] = demo
    ? (DEMO_CONVERSATIONS_FOURNISSEURS as unknown as Summary[])
    : conversations
  const fournisseurs = [...new Set(sourceConversations.map((c) => c.supplierName))].sort()

  const shown = sourceConversations
    .filter((c) => c.status === tab)
    .filter((c) => !fournisseur || c.supplierName === fournisseur)
    .filter((c) => !seulementNonLus || c.unread)
    .sort((a, b) => {
      const da = new Date(a.lastMessageAt).getTime()
      const db = new Date(b.lastMessageAt).getTime()
      return tri === 'recent' ? db - da : da - db
    })

  async function archiver(id: string) {
    if (id.startsWith('demo-')) return
    await api.setSupplierConversationStatus(id, 'CLOSED').catch(() => undefined)
    if (openId === id) setOpenId(null)
    load()
  }

  async function remettreNonLu(id: string) {
    if (id.startsWith('demo-')) return
    await api.setSupplierConversationUnread(id, true).catch(() => undefined)
    if (openId === id) setOpenId(null)
    load()
  }

  async function send() {
    if (!full || !reply.trim() || full.id.startsWith('demo-')) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.replySupplierConversation(full.id, reply.trim(), drafted)
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
    if (full?.id.startsWith('demo-')) return
    if (!full) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.draftSupplierConversation(full.id)
      setReply(res.text)
      setDrafted(true)
      setNotice("Brouillon rédigé. Relisez-le avant d'envoyer.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (full?.id.startsWith('demo-')) return
    if (!full) return
    await api.setSupplierConversationStatus(full.id, 'CLOSED').catch(() => undefined)
    setOpenId(null)
    load()
  }

  /** Ouvrir un nouveau fil : le vendeur écrit le premier au fournisseur. */
  async function creerFil() {
    if (!nomFournisseur.trim()) return
    if (demo) {
      setNotice("La création d'un fil est indisponible en démonstration.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.creerFilFournisseur({
        supplierName: nomFournisseur.trim(),
        supplierEmail: emailFournisseur.trim() || undefined,
        subject: sujet.trim() || undefined,
        body: corps.trim() || undefined,
      })
      setCompose(false)
      setNomFournisseur('')
      setEmailFournisseur('')
      setSujet('')
      setCorps('')
      load()
      setOpenId(res.id)
      setTab(corps.trim() ? 'WAITING' : 'OPEN')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <BlocSection id="sav-fournisseurs" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Inbox size={22} className="text-amber-400" />
            <span>Messagerie fournisseurs</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Vos échanges avec vos fournisseurs : rupture, délai, facture, litige. L'IA peut rédiger
            le message ; vous le relisez et vous l'envoyez.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCompose((v) => !v)}
          className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
        >
          <Plus size={15} />
          <span>Nouveau message</span>
        </button>
      </div>

      {/* Le formulaire d'ouverture d'un fil : les fournisseurs n'écrivent pas
          les premiers, c'est donc au vendeur d'ouvrir la conversation. */}
      {compose && (
        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Nouveau message fournisseur</h2>
            <button type="button" onClick={() => setCompose(false)} className="text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={nomFournisseur}
              onChange={(e) => setNomFournisseur(e.target.value)}
              placeholder="Fournisseur (ex. AliExpress, BigBuy)"
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
            />
            <input
              value={emailFournisseur}
              onChange={(e) => setEmailFournisseur(e.target.value)}
              placeholder="E-mail du fournisseur (facultatif)"
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
            />
          </div>
          <input
            value={sujet}
            onChange={(e) => setSujet(e.target.value)}
            placeholder="Objet (facultatif)"
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            rows={3}
            placeholder="Votre message (facultatif — vous pourrez aussi le rédiger ensuite)"
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
          />
          <p className="mt-2 text-[11px] text-gray-500">
            Avec un e-mail, le message part par e-mail. Sans e-mail, il est enregistré et se colle
            dans la messagerie du fournisseur.
          </p>
          <button
            type="button"
            onClick={creerFil}
            disabled={busy || !nomFournisseur.trim() || demo}
            className="btn-gradient mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <Send size={14} />
            <span>Ouvrir le fil</span>
          </button>
          {demo && (
            <p className="mt-2 text-[11px] text-amber-300">
              Indisponible en démonstration : la création d'un fil part vers l'API.
            </p>
          )}
        </div>
      )}

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
            {`${t.label} (${sourceConversations.filter((c) => c.status === t.id).length})`}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none"
        >
          <option value="">Tous les fournisseurs</option>
          {fournisseurs.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          value={tri}
          onChange={(e) => setTri(e.target.value as typeof tri)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none"
        >
          <option value="recent">Plus récent d'abord</option>
          <option value="ancien">Plus ancien d'abord</option>
        </select>

        <button
          type="button"
          onClick={() => setSeulementNonLus((v) => !v)}
          className={
            seulementNonLus
              ? 'rounded-lg bg-amber-400/20 px-3 py-1.5 text-sm font-semibold text-amber-300'
              : 'rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:bg-white/5'
          }
        >
          {`Non lus (${sourceConversations.filter((c) => c.unread).length})`}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {loading && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}

      {!loading && !sourceConversations.length && (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucun échange fournisseur pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Ouvrez un fil avec « Nouveau message » pour contacter un fournisseur — rupture, délai,
            facture ou litige.
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
                    ? 'w-full rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-left'
                    : 'w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10'
                }
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                    {c.supplierName}
                  </span>
                  {c.unread && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                  <span className="ml-auto text-[11px] text-gray-500">{when(c.lastMessageAt)}</span>
                </div>
                {c.subject && <p className="mt-1 truncate text-sm font-semibold">{c.subject}</p>}
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">{c.preview}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                  {c.channel === 'email' ? <Mail size={11} /> : <MailWarning size={11} />}
                  <span>{c.channel === 'email' ? 'réponse par e-mail' : 'réponse à coller'}</span>
                </p>
              </button>

              <div className="mt-1 flex gap-3 px-1">
                {c.status !== 'CLOSED' ? (
                  <button
                    type="button"
                    onClick={() => archiver(c.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300"
                  >
                    <Archive size={10} />
                    <span>Archiver</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      if (c.id.startsWith('demo-')) return
                      await api.setSupplierConversationStatus(c.id, 'OPEN').catch(() => undefined)
                      load()
                    }}
                    className="text-[11px] text-gray-500 hover:text-gray-300"
                  >
                    Remettre en cours
                  </button>
                )}
                {!c.unread ? (
                  <button
                    type="button"
                    onClick={() => remettreNonLu(c.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300"
                  >
                    <MailPlus size={10} />
                    <span>Marquer non lu</span>
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {!shown.length && sourceConversations.length > 0 && (
            <li className="text-sm text-gray-500">Rien dans cet onglet.</li>
          )}
        </ul>

        {full && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <p className="font-semibold">{full.supplierName}</p>
                <p className="text-xs text-gray-500">{full.subject ?? 'Échange fournisseur'}</p>
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
                        ? 'à coller chez le fournisseur'
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
              placeholder="Votre message au fournisseur…"
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
                <span>{full.channel === 'email' ? 'Envoyer' : 'Enregistrer le message'}</span>
              </button>

              <button
                type="button"
                onClick={draft}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"
              >
                <Sparkles size={13} />
                <span>Faire rédiger (1 drop)</span>
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

      <BandeauDemo />
    </Layout>
  )
}
