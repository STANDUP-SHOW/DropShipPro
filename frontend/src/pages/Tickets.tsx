import { useEffect, useState } from 'react'
import { LifeBuoy, Send, Loader2, Check, ChevronRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AgentBar } from '../components/AgentBar'
import { TicketDialog } from '../components/TicketDialog'
import { api, type TicketComplet } from '../lib/api'

type Ligne = Awaited<ReturnType<typeof api.listTickets>>[number]

/**
 * Mes tickets : ce que j'ai signalé, et ce qu'on m'a répondu.
 *
 * Ce que cette page rend possible et qu'un bouton « rendez-moi mon crédit »
 * n'aurait jamais rendu : savoir, dans un mois, combien de publicités ont été
 * refusées et lesquelles. Un remboursement sans trace n'apprend rien ; un ticket
 * dit ce qui rate, sur quoi, et à quelle fréquence.
 */

const ETATS: Record<string, { label: string; style: string }> = {
  OUVERT: { label: 'Ouvert', style: 'bg-amber-500/20 text-amber-300' },
  EN_COURS: { label: 'En cours', style: 'bg-blue-500/20 text-blue-300' },
  RESOLU: { label: 'Résolu', style: 'bg-emerald-500/20 text-emerald-300' },
  REFUSE: { label: 'Refusé', style: 'bg-gray-500/20 text-gray-400' },
}

const AGENTS: Record<string, string> = {
  hotline: 'Camille — Hotline',
  sav: 'Marc — SAV',
  comptable: 'Béatrice — Comptable',
}

export default function Tickets() {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [ouvert, setOuvert] = useState<TicketComplet | null>(null)
  const [nouveau, setNouveau] = useState(false)
  const [reponse, setReponse] = useState('')
  const [busy, setBusy] = useState(false)
  const [chargement, setChargement] = useState(true)

  const charger = () =>
    api
      .listTickets()
      .then(setLignes)
      .catch(() => undefined)
      .finally(() => setChargement(false))

  useEffect(() => {
    charger()
  }, [])

  async function envoyer() {
    if (!ouvert || reponse.trim().length < 2 || busy) return
    setBusy(true)
    try {
      setOuvert(await api.replyTicket(ouvert.id, reponse.trim()))
      setReponse('')
      charger()
    } catch {
      // L'erreur remonte déjà dans le fil : ne rien afficher de plus.
    } finally {
      setBusy(false)
    }
  }

  async function fermer(id: string) {
    await api.closeTicket(id).catch(() => undefined)
    setOuvert(null)
    charger()
  }

  return (
    <Layout>
      {/* L'agent en charge de ce qui se decide ici : une question posee devant
          l ecran ne devrait pas obliger a quitter l ecran. */}
      <AgentBar
        agentKey="hotline"
        nom="Camille"
        emoji="☎️"
        exemple="Demandez à Camille : ma publicité est sortie illisible, que faire ?"
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LifeBuoy size={22} className="text-purple-300" />
            <span>Mes tickets</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Un résultat qui ne convient pas, un import raté, une question de facturation : Camille
            vous répond et transmet au SAV ou au comptable quand un avoir se justifie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNouveau(true)}
          className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Ouvrir un ticket
        </button>
      </div>

      {chargement ? <p className="text-sm text-gray-500">Chargement…</p> : null}

      {!chargement && !lignes.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold">Aucun ticket</h2>
          <p className="mt-2 text-sm text-gray-400">
            Tant mieux. Si une publicité, une image ou un import ne va pas, signalez-le depuis
            l'objet concerné : l'agent verra directement de quoi il s'agit et ce que ça vous a coûté.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        {lignes.map((t) => {
          const etat = ETATS[t.status] ?? ETATS.OUVERT
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => api.getTicket(t.id).then(setOuvert).catch(() => undefined)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-purple-400/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <p className="mt-0.5 truncate text-xs text-gray-500">{t.extrait}</p>
              </div>

              {t.refundedCredits ? (
                <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                  {`+${t.refundedCredits} crédit(s)`}
                </span>
              ) : null}

              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${etat.style}`}>
                {etat.label}
              </span>
              <ChevronRight size={16} className="shrink-0 text-gray-500" />
            </button>
          )
        })}
      </div>

      {/* --- Le fil d'un ticket ------------------------------------------- */}
      {ouvert ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOuvert(null)
          }}
        >
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{ouvert.subject}</h2>
                {ouvert.creditsSpent ? (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {`${ouvert.creditsSpent} crédit(s) ${ouvert.creditKind} engagé(s)`}
                  </p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                  (ETATS[ouvert.status] ?? ETATS.OUVERT).style
                }`}
              >
                {(ETATS[ouvert.status] ?? ETATS.OUVERT).label}
              </span>
            </div>

            <ul className="mt-4 space-y-2">
              {ouvert.messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-xl border px-3 py-2.5 text-sm ${
                    m.author === 'vendeur'
                      ? 'border-white/10 bg-white/5'
                      : 'border-purple-400/25 bg-purple-500/10'
                  }`}
                >
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {m.author === 'vendeur' ? 'Vous' : (AGENTS[m.agentKey ?? ''] ?? 'Agent')}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </li>
              ))}
            </ul>

            {ouvert.refundedCredits ? (
              <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-200">
                {`Avoir accordé par ${AGENTS[ouvert.refundedBy ?? ''] ?? 'un agent'} : ${ouvert.refundedCredits} crédit(s) ${ouvert.creditKind}.`}
              </p>
            ) : null}

            {ouvert.status !== 'RESOLU' ? (
              <>
                <textarea
                  value={reponse}
                  onChange={(e) => setReponse(e.target.value)}
                  rows={3}
                  placeholder="Répondre…"
                  className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
                />
                <button
                  type="button"
                  onClick={envoyer}
                  disabled={busy || reponse.trim().length < 2}
                  className="btn-gradient mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span>{busy ? 'Envoi…' : 'Envoyer'}</span>
                </button>
              </>
            ) : null}

            <div className="mt-4 flex justify-between gap-2">
              {ouvert.status !== 'RESOLU' ? (
                <button
                  type="button"
                  onClick={() => fermer(ouvert.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-400 hover:bg-white/5"
                >
                  <Check size={14} /> C'est réglé
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setOuvert(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nouveau ? (
        <TicketDialog
          kind="autre"
          onClose={() => {
            setNouveau(false)
            charger()
          }}
        />
      ) : null}
    </Layout>
  )
}
