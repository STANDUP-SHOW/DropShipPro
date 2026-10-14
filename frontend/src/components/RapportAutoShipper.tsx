import { useEffect, useState } from 'react'
import { api } from '../lib/api'

type Rapport = Awaited<ReturnType<typeof api.autopilotRapport>>

/** Les teintes des graphiques, celles de la vue d'ensemble (jamais le bleu nuit + cyan). */
const TEINTES = ['#f28a4b', '#e85290', '#a78bfa', '#fdbf06', '#34d399', '#94a3b8']

const eur = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const dateLongue = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function Tuile({ label, valeur, teinte }: { label: string; valeur: string; teinte: string }) {
  return (
    <div className="rounded-xl border border-[var(--trait)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">{label}</p>
      <p className="mt-1 text-xl font-black text-[var(--texte)]">{valeur}</p>
      <span className="mt-2 block h-0.5 w-10 rounded-full" style={{ background: teinte }} />
    </div>
  )
}

/** Des barres horizontales, une par rayon ; « — » quand rien n'est à comparer. */
function Barres({ titre, points, format }: { titre: string; points: Array<{ label: string; valeur: number }>; format: (n: number) => string }) {
  const max = Math.max(0, ...points.map((p) => Math.abs(p.valeur)))
  return (
    <div className="rounded-xl border border-[var(--trait)] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">{titre}</p>
      {!max ? (
        <p className="py-3 text-center text-sm text-[var(--texte-3)]">—</p>
      ) : (
        <ul className="space-y-2">
          {points.map((p, i) => (
            <li key={p.label}>
              <div className="mb-1 flex justify-between gap-2 text-[11px]">
                <span className="truncate text-[var(--texte-2)]">{p.label}</span>
                <b className="text-[var(--texte)]">{format(p.valeur)}</b>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--trait)]">
                <div className="h-full rounded-full" style={{ width: `${(Math.abs(p.valeur) / max) * 100}%`, background: p.valeur < 0 ? '#f87171' : TEINTES[i % TEINTES.length] }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Le rapport des journées AUTO-SHIPPER (Max, 14/10/2026) : un menu qui ne
 * propose que les jours où le pilote est passé, puis pour le jour choisi ce
 * que ses imports ont donné. Les montants ne s'affichent qu'une fois une vente
 * enregistrée : sans vente, « — », jamais zéro euro présenté comme un résultat.
 */
export function RapportAutoShipper() {
  const [jours, setJours] = useState<string[] | null>(null)
  const [jour, setJour] = useState<string | null>(null)
  const [rapport, setRapport] = useState<Rapport | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    api
      .autopilotJours()
      .then((r) => {
        setJours(r.jours)
        setJour(r.jours[0] ?? null)
      })
      .catch(() => setJours([]))
  }, [])

  useEffect(() => {
    if (!jour) return
    setRapport(null)
    setErreur(null)
    api.autopilotRapport(jour).then(setRapport).catch((e) => setErreur((e as Error).message))
  }, [jour])

  const t = rapport?.total
  const argent = (n: number | undefined) => (t && t.ventes > 0 && n !== undefined ? eur(n) : '—')

  return (
    <section className="case-ds flex min-w-0 flex-col p-4 md:p-5 lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--texte)]">Rapport des journées Auto-SHIPPER</h2>
        {jours && jours.length > 0 && (
          <select
            value={jour ?? ''}
            onChange={(e) => setJour(e.target.value)}
            aria-label="Date du rapport"
            className="rounded-lg border border-[var(--trait-fort)] bg-[var(--panneau)] px-3 py-1.5 text-sm text-[var(--texte)]"
          >
            {jours.map((j) => (
              <option key={j} value={j}>
                {dateLongue(j)}
              </option>
            ))}
          </select>
        )}
      </div>

      {jours === null && <p className="text-sm text-[var(--texte-3)]">Chargement…</p>}
      {jours && !jours.length && (
        <p className="rounded-xl border border-dashed border-[var(--trait-fort)] px-3 py-6 text-center text-xs text-[var(--texte-3)]">
          Aucune journée pour l'instant : le premier rapport paraît après le premier passage d'Auto-SHIPPER IA.
        </p>
      )}
      {erreur && <p className="text-sm text-red-400">{erreur}</p>}

      {rapport && t && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tuile label="Produits importés" valeur={String(rapport.importes)} teinte={TEINTES[0]} />
            <Tuile label="Publiés" valeur={String(rapport.publies)} teinte={TEINTES[1]} />
            <Tuile label="Ventes générées" valeur={String(t.ventes)} teinte={TEINTES[2]} />
            <Tuile label="Achats" valeur={argent(t.achats)} teinte={TEINTES[3]} />
            <Tuile label="Chiffre d'affaires" valeur={argent(t.ca)} teinte={TEINTES[4]} />
            <Tuile
              label={t.ventes > 0 && t.margePct !== null ? `Marge réalisée · ${t.margePct.toLocaleString('fr-FR')} %` : 'Marge réalisée'}
              valeur={t.ventes > 0 ? eur(t.marge) : '—'}
              teinte={TEINTES[5]}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Barres titre="Produits importés par rayon boost" points={rapport.rayons.map((r) => ({ label: r.label, valeur: r.produits }))} format={(n) => String(n)} />
            <Barres titre="Chiffre d'affaires par rayon boost" points={rapport.rayons.map((r) => ({ label: r.label, valeur: r.ca }))} format={eur} />
            <Barres titre="Profit par rayon boost" points={rapport.rayons.map((r) => ({ label: r.label, valeur: r.marge }))} format={eur} />
          </div>

          <p className="mt-3 text-xs text-[var(--texte-3)]">
            {`${rapport.passages} passage(s) ce jour-là · ${rapport.ecartes} produit(s) écarté(s) · ${rapport.echecs} en échec. Les ventes sont celles des produits importés ce jour-là, enregistrées depuis ; les commandes remboursées ne comptent pas.`}
          </p>
        </>
      )}
    </section>
  )
}
