import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { BlocData, TuileData } from '../stats/TuileStat'
import { Etiquette, Evolution, GrandGraphique, Valeur, ecrire, nombre } from '../stats/VueEnsemble'
import { blocsDemo } from '../../lib/statsDemo'
import { useDemo } from '../../lib/demo'
import { api } from '../../lib/api'

/**
 * Le bloc statistique réduit de la page Fournisseurs (demande de Max du
 * 14/10/2026) : demi-page, un grand graphique, trois petits chiffres dessous,
 * et le reste du bloc derrière un bouton qui déplie.
 *
 * Même présentation que les blocs réduits de Mes annonces et d'Acquérir des
 * produits, mêmes données que la vue d'ensemble (/stats/tableau, bloc
 * « fournisseurs », trente jours). La courbe trace les commandes passées aux
 * fournisseurs et le montant des achats, jour par jour ; rien n'est estimé.
 */

const TEINTES = ['#e85290', '#a78bfa', '#fdbf06']
const SOUS = ['actifs', 'en-cours', 'retards']

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

export function StatsFournisseurs({ className = '' }: { className?: string }) {
  const [bloc, setBloc] = useState<BlocData | null>(null)
  const [demo, setDemo] = useState(false)
  const [ouvert, setOuvert] = useState(false)
  const [demoGlobal] = useDemo()

  useEffect(() => {
    const au = new Date()
    const du = new Date(au.getTime() - 30 * 86400000)
    api
      .tableauStats(du, au)
      .then((r) => {
        const blocs = demoGlobal ? blocsDemo(r.blocs) : r.blocs
        setBloc(blocs.find((b) => b.id === 'fournisseurs') ?? null)
        setDemo(demoGlobal)
      })
      .catch(() => {
        // Les statistiques sont un bandeau, pas la page : leur panne ne doit
        // jamais empêcher de travailler en dessous.
      })
  }, [demoGlobal])

  if (!bloc) return null

  const lire = (id: string) => bloc.tuiles.find((t) => t.id === id)
  const commandes = lire('commandes')
  const achats = lire('achats')
  const sous = SOUS.map(lire).filter((t): t is TuileData => !!t)
  const montres = new Set(['commandes', ...SOUS])
  const reste = bloc.tuiles.filter((t) => !montres.has(t.id))
  const maxSous = Math.max(0, ...sous.map((t) => nombre(t) ?? 0))

  return (
    <section className={`case-ds flex min-w-0 flex-col p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--texte)]">{bloc.titre}</h2>
        <span className="text-[10px] text-[var(--texte-3)]">30 derniers jours</span>
      </div>

      <Etiquette>{commandes?.label ?? '—'}</Etiquette>
      <div className="flex items-center gap-2">
        <p
          title={ecrire(commandes) === '—' ? commandes?.raison : undefined}
          className={`text-4xl font-extrabold leading-tight ${ecrire(commandes) === '—' ? 'text-[var(--texte-3)]' : 'text-[var(--texte)]'}`}
        >
          {ecrire(commandes)}
        </p>
        <Evolution t={commandes} />
      </div>

      <div className="mt-3 flex min-h-[200px] flex-1">
        <GrandGraphique a={commandes} b={achats} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {sous.map((t, i) => (
          <PetitChiffre key={t.id} t={t} teinte={TEINTES[i % TEINTES.length]} max={maxSous} />
        ))}
      </div>

      {reste.length ? (
        <>
          {ouvert ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {reste.map((t) => (
                <div key={t.id} className="min-w-0 rounded-xl bg-white/[0.03] p-3">
                  <Etiquette>{t.label}</Etiquette>
                  <Valeur t={t} petite />
                  {ecrire(t) === '—' && t.raison ? <p className="mt-0.5 text-[10px] leading-snug text-[var(--texte-3)]">{t.raison}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setOuvert((v) => !v)}
              aria-expanded={ouvert}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--marque-orange)] hover:underline"
            >
              {ouvert ? 'Réduire' : `Voir les ${reste.length} autres statistiques`}
              <ChevronDown size={13} className={`transition ${ouvert ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-[10px] text-[var(--texte-3)]">
              {demo ? 'Chiffres de démonstration. ' : ''}
              <Link to="/statistiques" className="text-[var(--marque-orange)] underline-offset-2 hover:underline">
                Vue d'ensemble
              </Link>
            </span>
          </div>
        </>
      ) : null}
    </section>
  )
}
