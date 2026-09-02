import { useEffect, useState } from 'react'
import { Gauge, Loader2, Check, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

/**
 * L'agent qui reprend l'annonce, sur la fiche de l'annonce.
 *
 * **Il existait déjà, et personne ne le voyait.** La note était calculée, les
 * corrections écrites critère par critère — « titre un peu court, visez 50 à
 * 70 » — et il n'y avait aucun bouton pour les appliquer. Le vendeur lisait un
 * bulletin. Sur trois cents annonces, un diagnostic qu'il faut exécuter à la
 * main n'existe pas.
 *
 * **Ce qu'il ne fait pas est affiché aussi**, et c'est délibéré : il ne peut ni
 * ajouter une photo, ni fixer un prix, ni inventer une taille. Une annonce à
 * deux photos plafonne donc à 86, et le seul geste utile est d'en ajouter
 * trois. Annoncer « 100 % optimisée » sur une annonce à deux photos serait la
 * même promesse creuse que la présélection de photos qui cochait n'importe quoi.
 */

type Note = Awaited<ReturnType<typeof api.noteAnnonce>>

export function OptimizerAgentBlock({
  productId,
  onOptimise,
}: {
  productId: string
  /** Recharger la fiche : les textes viennent de changer en base. */
  onOptimise: () => void
}) {
  const [note, setNote] = useState<Note | null>(null)
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [rapport, setRapport] = useState<{
    gain: number
    changements: string[]
    aVous: string[]
    complet: boolean
  } | null>(null)

  useEffect(() => {
    api.noteAnnonce(productId).then(setNote).catch(() => undefined)
  }, [productId])

  async function reprendre() {
    setBusy(true)
    setErreur(null)
    try {
      const r = await api.optimiserAnnonce(productId)
      if (!r.reecrit) {
        setErreur("L'IA n'a pas répondu. Rien n'a été modifié, aucun crédit n'a été pris.")
        return
      }
      setNote((n) => (n ? { ...n, score: r.apres.score, checks: r.apres.checks } : n))
      setRapport({
        gain: r.apres.score - r.avant.score,
        changements: r.changements,
        aVous: r.aVous,
        complet: r.complet,
      })
      onOptimise()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Reprise impossible')
    } finally {
      setBusy(false)
    }
  }

  if (!note) return null

  const manques = note.checks.filter((c) => c.fix)
  const couleur =
    note.score >= 85 ? 'text-emerald-300' : note.score >= 60 ? 'text-amber-300' : 'text-red-300'

  return (
    <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <header className="flex items-start gap-2.5">
        <span className="text-xl">🔍</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">Hugo — Agent Qualité</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Je relis cette annonce comme le ferait une place de marché, et je reprends ce qui
            s'écrit : titre, description, arguments, attributs, mots-clés.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-2xl font-bold tabular-nums ${couleur}`}>{note.score}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-600">sur 100</div>
        </div>
      </header>

      {/* Le détail, critère par critère : une note sans son détail ne se corrige pas. */}
      <div className="mt-4 space-y-1.5">
        {note.checks.map((c) => {
          const plein = c.points === c.max
          return (
            <div key={c.label} className="flex items-start gap-2 text-xs">
              <span className={`mt-0.5 shrink-0 ${plein ? 'text-emerald-400' : 'text-gray-600'}`}>
                {plein ? <Check size={12} /> : <AlertTriangle size={12} />}
              </span>
              <span className="w-32 shrink-0 text-gray-400">{c.label}</span>
              <span className="w-12 shrink-0 tabular-nums text-gray-500">{`${c.points}/${c.max}`}</span>
              {c.fix ? <span className="min-w-0 flex-1 text-gray-500">{c.fix}</span> : null}
            </div>
          )
        })}
      </div>

      {manques.length === 0 ? (
        <p className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
          Annonce complète : rien à reprendre.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={reprendre}
            disabled={busy}
            className="btn-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />}
            <span>{busy ? 'Hugo reprend l’annonce…' : "Optimiser l'annonce"}</span>
          </button>
          <p className="mt-2 text-center text-[11px] text-gray-500">
            1 crédit annonce — rendu si l'IA ne répond pas.
          </p>
        </>
      )}

      {rapport ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
            {rapport.gain > 0
              ? `+${rapport.gain} points. ${rapport.changements.join(' · ')}`
              : 'Rien à reprendre côté rédaction : la note ne bouge pas.'}
          </p>
          {/*
            Ce qui reste, et pourquoi il ne pouvait pas le faire.
            Sans cette liste, une annonce bloquée à 86 ressemble à un échec de
            l'agent, alors que le seul geste utile appartient au vendeur.
          */}
          {rapport.aVous.length ? (
            <div className="rounded-lg border border-amber-400/25 bg-amber-500/5 px-3 py-2">
              <p className="text-xs font-semibold text-amber-100">
                {rapport.complet
                  ? 'Tout ce qui s’écrit est fait. Il reste ce que je ne peux pas faire à votre place :'
                  : 'Il reste ceci, que je ne peux pas faire à votre place :'}
              </p>
              <ul className="mt-1 space-y-0.5">
                {rapport.aVous.map((a) => (
                  <li key={a} className="text-[11px] leading-snug text-amber-100/80">
                    {`— ${a}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}
    </section>
  )
}
