import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { BlocData, TuileData } from './TuileStat'
import { Anneau, Beignet, Etiquette, Evolution, Valeur, ecrire, nombre } from './VueEnsemble'
import { blocsDemo } from '../../lib/statsDemo'
import { useDemo } from '../../lib/demo'
import { api } from '../../lib/api'

/**
 * Les blocs statistiques réduits de Mes annonces et d'Acquérir des produits
 * (demande de Max du 14/10/2026) : un grand graphique, deux ou trois petits
 * chiffres dessous, et un bouton qui déplie le reste du bloc.
 *
 * Mêmes données que la vue d'ensemble (/stats/tableau, trente jours, mode
 * démonstration compris) : seule la présentation change. Une tuile sans
 * donnée affiche « — » avec sa raison au survol ; rien n'est estimé.
 */

const TEINTES = ['#f28a4b', '#e85290', '#a78bfa', '#fdbf06']

/** Ce que chaque bloc met en avant ; le reste attend sous « Voir plus ». */
const MISE_EN_AVANT: Record<string, { principal: string; graphique: 'courbe' | 'anneau'; anneau?: string; sous: string[] }> = {
  acquisition: { principal: 'acquis', graphique: 'courbe', sous: ['publiables', 'publies', 'nouveaux'] },
  catalogue: { principal: 'actifs', graphique: 'anneau', anneau: 'rotation', sous: ['annonces', 'variantes', 'sans-vente'] },
}

/** Une courbe d'aire sur la période, à l'échelle de sa propre série. */
function Courbe({ serie, teinte }: { serie?: number[]; teinte: string }) {
  const s = serie ?? []
  const vide = s.length < 2 || s.every((v) => v === 0)
  const max = Math.max(...s, 0) || 1
  const pas = 1000 / Math.max(1, s.length - 1)
  const points = s.map((v, i) => `${(i * pas).toFixed(1)},${(150 - (v / max) * 130).toFixed(1)}`).join(' ')
  return (
    <div className="relative h-32">
      <svg viewBox="0 0 1000 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {[20, 85, 150].map((y) => (
          <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--trait)" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
        ))}
        {!vide ? (
          <>
            <defs>
              <linearGradient id="sr-aire" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={teinte} stopOpacity="0.3" />
                <stop offset="1" stopColor={teinte} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={`0,150 ${points} 1000,150`} fill="url(#sr-aire)" stroke="none" />
            <polyline points={points} fill="none" stroke={teinte} strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      {vide ? (
        <p className="absolute inset-0 flex items-center justify-center text-center text-xs text-[var(--texte-3)]">
          Rien sur la période : la courbe se dessinera au premier import.
        </p>
      ) : null}
    </div>
  )
}

/** Un petit chiffre sous le grand graphique, avec sa barre à l'échelle des voisins. */
function PetitChiffre({ t, teinte, max }: { t?: TuileData; teinte: string; max: number }) {
  const n = nombre(t)
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.03] p-3">
      <Etiquette>{t?.label ?? '—'}</Etiquette>
      <Valeur t={t} petite />
      <div className="mt-2 h-1.5 rounded-full bg-[var(--trait)]">
        {n && max ? <div className="h-full rounded-full" style={{ width: `${Math.max(4, (n / max) * 100)}%`, background: teinte }} /> : null}
      </div>
    </div>
  )
}

function BlocReduit({ bloc, pleineLargeur }: { bloc: BlocData; pleineLargeur: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  const regle = MISE_EN_AVANT[bloc.id] ?? { principal: bloc.tuiles[0]?.id, graphique: 'courbe' as const, sous: bloc.tuiles.slice(1, 4).map((t) => t.id) }
  const lire = (id?: string) => bloc.tuiles.find((t) => t.id === id)
  const principal = lire(regle.principal)
  const anneau = lire(regle.anneau)
  const sous = regle.sous.map(lire).filter((t): t is TuileData => !!t)
  const montres = new Set([regle.principal, regle.anneau, ...regle.sous])
  const reste = bloc.tuiles.filter((t) => !montres.has(t.id))
  const maxSous = Math.max(0, ...sous.map((t) => nombre(t) ?? 0))

  return (
    <section className={`case-ds flex min-w-0 flex-col p-4 ${pleineLargeur ? 'xl:col-span-2' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--texte)]">{bloc.titre}</h2>
        <span className="text-[10px] text-[var(--texte-3)]">30 derniers jours</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Etiquette>{principal?.label ?? '—'}</Etiquette>
          <div className="flex items-center gap-2">
            <p
              title={ecrire(principal) === '—' ? principal?.raison : undefined}
              className={`text-4xl font-extrabold leading-tight ${ecrire(principal) === '—' ? 'text-[var(--texte-3)]' : 'text-[var(--texte)]'}`}
            >
              {ecrire(principal)}
            </p>
            <Evolution t={principal} />
          </div>
        </div>
      </div>

      {regle.graphique === 'anneau' ? (
        <div className="mt-2 flex items-center justify-center gap-5 py-2" title={ecrire(anneau) === '—' ? anneau?.raison : undefined}>
          <Anneau
            pour={nombre(anneau)}
            teinte={TEINTES[1]}
            centre={ecrire(anneau) === '—' ? '—' : `${nombre(anneau)?.toLocaleString('fr-FR')} %`}
            taille={128}
          />
          <div className="min-w-0">
            <Etiquette>{anneau?.label ?? ''}</Etiquette>
            <p className="mt-1 max-w-[14rem] text-xs leading-snug text-[var(--texte-2)]">Part du catalogue vendue au moins une fois sur la période.</p>
          </div>
        </div>
      ) : null}

      {regle.graphique === 'courbe' ? (
        <div className="mt-2">
          <Courbe serie={principal?.serie} teinte={TEINTES[0]} />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--texte-3)]">
            <span>Il y a 30 jours</span>
            <span>Aujourd’hui</span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {sous.map((t, i) => (
          <PetitChiffre key={t.id} t={t} teinte={TEINTES[(i + 1) % TEINTES.length]} max={maxSous} />
        ))}
      </div>

      {reste.length ? (
        <>
          {ouvert ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {reste.map((t) =>
                t.parts?.length ? (
                  <div key={t.id} className="col-span-2 rounded-xl bg-white/[0.03] p-3 md:col-span-3">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <Etiquette>{t.label}</Etiquette>
                      <b className="text-sm text-[var(--texte)]">{ecrire(t)}</b>
                    </div>
                    <Beignet parts={t.parts} vide="Aucune donnée sur la période." />
                  </div>
                ) : (
                  <div key={t.id} className="min-w-0 rounded-xl bg-white/[0.03] p-3">
                    <Etiquette>{t.label}</Etiquette>
                    <Valeur t={t} petite />
                    {ecrire(t) === '—' && t.raison ? <p className="mt-0.5 text-[10px] leading-snug text-[var(--texte-3)]">{t.raison}</p> : null}
                  </div>
                ),
              )}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            className="mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-[var(--marque-orange)] hover:underline"
          >
            {ouvert ? 'Réduire' : `Voir les ${reste.length} autres statistiques`}
            <ChevronDown size={13} className={`transition ${ouvert ? 'rotate-180' : ''}`} />
          </button>
        </>
      ) : null}
    </section>
  )
}

/** Les blocs demandés, réduits, côte à côte sur grand écran. */
export function StatsReduites({ ids }: { ids: string[] }) {
  const [blocs, setBlocs] = useState<BlocData[] | null>(null)
  const [demo, setDemo] = useState(false)
  const [demoGlobal] = useDemo()
  const cle = ids.join(',')

  useEffect(() => {
    const au = new Date()
    const du = new Date(au.getTime() - 30 * 86400000)
    api
      .tableauStats(du, au)
      .then((r) => {
        const tous = demoGlobal ? blocsDemo(r.blocs) : r.blocs
        setBlocs(cle.split(',').map((id) => tous.find((b) => b.id === id)).filter((b): b is BlocData => !!b))
        setDemo(demoGlobal)
      })
      .catch(() => {
        // Les statistiques sont un bandeau, pas la page : leur panne ne doit
        // jamais empêcher de travailler en dessous.
      })
  }, [cle, demoGlobal])

  if (!blocs?.length) return null

  return (
    <div className="mb-5">
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        {blocs.map((b) => (
          <BlocReduit key={b.id} bloc={b} pleineLargeur={blocs.length === 1} />
        ))}
      </div>
      <p className="mt-1.5 text-right text-[10px] text-[var(--texte-3)]">
        {demo ? 'Chiffres de démonstration — vos ventes les remplaceront. ' : ''}
        <Link to="/statistiques" className="text-[var(--marque-orange)] underline-offset-2 hover:underline">
          Vue d'ensemble
        </Link>
      </p>
    </div>
  )
}
