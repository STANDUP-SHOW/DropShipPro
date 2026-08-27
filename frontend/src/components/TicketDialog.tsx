import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { LifeBuoy, X, Send, Loader2, ArrowRight } from 'lucide-react'
import { api, type TicketComplet } from '../lib/api'

/**
 * Signaler un problème, et lire la réponse tout de suite.
 *
 * Le rendu de crédit automatique a été écarté volontairement : un bouton qui
 * recrédite tout seul se presse par réflexe, et n'apprend rien à personne — ni
 * pourquoi le résultat était mauvais, ni combien de fois ça arrive.
 *
 * Ici le vendeur explique, la hotline répond dans la foulée, et c'est elle qui
 * oriente vers le SAV ou le comptable. La réponse immédiate n'est pas de la
 * figuration : quelqu'un qui signale un problème à minuit et n'a rien avant le
 * lendemain range l'application du côté des logiciels qui ne répondent pas.
 */

/** Les motifs proposés, formulés comme le vendeur les dirait. */
const MOTIFS: Record<string, { titre: string; suggestion: string }> = {
  pub: {
    titre: 'Cette publicité est inutilisable',
    suggestion:
      "Dites ce qui ne va pas : texte illisible, aucune force de vente, prix absent, visuel identique aux précédents…",
  },
  image: {
    titre: 'Cette image ne convient pas',
    suggestion: "Dites ce qui ne va pas : produit méconnaissable, cadrage, couleurs…",
  },
  import: {
    titre: "Cet import s'est mal passé",
    suggestion: 'Photos manquantes, mauvaise catégorie, prix faux, variantes absentes…',
  },
  publication: {
    titre: 'Cette publication a échoué',
    suggestion: "Dites sur quelle plateforme, et ce que le message d'erreur disait.",
  },
  facturation: { titre: 'Une question de facturation', suggestion: 'Crédits, abonnement, avoir…' },
  autre: { titre: 'Autre chose', suggestion: 'Décrivez le problème en quelques lignes.' },
}

export function TicketDialog({
  kind = 'autre',
  productId,
  generatedImageId,
  sujetPropose,
  onClose,
}: {
  kind?: keyof typeof MOTIFS
  productId?: string
  generatedImageId?: string
  /** Proposé dans le champ sujet : le vendeur le corrige s'il veut. */
  sujetPropose?: string
  onClose: () => void
}) {
  const motif = MOTIFS[kind] ?? MOTIFS.autre
  const [sujet, setSujet] = useState(sujetPropose ?? motif.titre)
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ticket, setTicket] = useState<TicketComplet | null>(null)

  async function envoyer() {
    if (texte.trim().length < 5 || busy) return
    setBusy(true)
    setErreur(null)
    try {
      setTicket(
        await api.openTicket({
          subject: sujet.trim() || motif.titre,
          body: texte.trim(),
          kind,
          productId,
          generatedImageId,
        }),
      )
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le ticket n'a pas pu être ouvert.")
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <LifeBuoy size={19} className="shrink-0 text-purple-300" />
            <span>{ticket ? 'Ticket ouvert' : 'Signaler un problème'}</span>
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {ticket ? (
          <>
            {/* --- La réponse de la hotline, dans la foulée ------------------ */}
            <p className="mt-3 text-sm font-medium">{ticket.subject}</p>
            {ticket.creditsSpent ? (
              <p className="mt-0.5 text-xs text-gray-500">
                {`${ticket.creditsSpent} crédit(s) ${ticket.creditKind} engagé(s) sur cet objet.`}
              </p>
            ) : null}

            <ul className="mt-4 space-y-2">
              {ticket.messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-xl border px-3 py-2.5 text-sm ${
                    m.author === 'vendeur'
                      ? 'border-white/10 bg-white/5'
                      : 'border-purple-400/25 bg-purple-500/10'
                  }`}
                >
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
                    {m.author === 'vendeur' ? 'Vous' : (m.agentKey ?? 'Agent')}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </li>
              ))}
            </ul>

            {ticket.refundedCredits ? (
              <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-200">
                {`Avoir accordé : ${ticket.refundedCredits} crédit(s) ${ticket.creditKind} recrédité(s).`}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Fermer
              </button>
              <Link
                to="/tickets"
                onClick={onClose}
                className="btn-gradient flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <span>Suivre mes tickets</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">{motif.suggestion}</p>

            <input
              value={sujet}
              onChange={(e) => setSujet(e.target.value)}
              maxLength={140}
              placeholder="Sujet"
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
            />

            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Ce qui s'est passé, en quelques lignes."
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
            />

            {erreur ? (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                {erreur}
              </p>
            ) : null}

            <button
              type="button"
              onClick={envoyer}
              disabled={busy || texte.trim().length < 5}
              className="btn-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              <span>{busy ? 'Camille vous lit…' : 'Envoyer à la hotline'}</span>
            </button>

            <p className="mt-2 text-center text-[11px] leading-relaxed text-gray-500">
              Camille répond tout de suite et transmet à Marc (SAV) ou Béatrice (comptable) si un
              avoir se justifie.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
