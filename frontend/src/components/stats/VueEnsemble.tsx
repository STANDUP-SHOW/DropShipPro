import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'
import type { BlocData, TuileData } from './TuileStat'

/**
 * La vue d'ensemble « compilée » (maquette de Max du 13/10/2026) : des cases
 * de tailles différentes, un grand graphique des ventes, de petits graphiques
 * dessous, et des boutons allumés qui mènent là où l'on agit.
 *
 * Tout ce qui s'affiche ici vient des blocs de /stats/tableau — les mêmes que
 * le détail plus bas, mode démonstration compris. Une tuile sans donnée
 * affiche « — » avec sa raison au survol ; rien n'est estimé.
 */

/** Les teintes des graphiques, prises dans les chartes maison (jamais le bleu nuit + cyan). */
const TEINTES = ['#f28a4b', '#e85290', '#a78bfa', '#fdbf06', '#34d399', '#94a3b8']

type Lire = (bloc: string, tuile: string) => TuileData | undefined

export function lecteur(blocs: BlocData[]): Lire {
  const index = new Map<string, TuileData>()
  for (const b of blocs) for (const t of b.tuiles) index.set(`${b.id}/${t.id}`, t)
  return (bloc, tuile) => index.get(`${bloc}/${tuile}`)
}

const nombre = (t?: TuileData) => (typeof t?.valeur === 'number' && Number.isFinite(t.valeur) ? t.valeur : null)

/** Une valeur écrite à la française, avec son unité ; « — » quand elle manque. */
export function ecrire(t?: TuileData): string {
  if (!t || t.valeur === null || t.valeur === undefined || t.valeur === '') return '—'
  const brut = typeof t.valeur === 'number' ? t.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : String(t.valeur)
  if (!t.unite) return brut
  return t.unite === '/100' ? `${brut}/100` : `${brut} ${t.unite}`
}

function Evolution({ t }: { t?: TuileData }) {
  if (typeof t?.evolution !== 'number' || !Number.isFinite(t.evolution)) return null
  const monte = t.evolution >= 0
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${monte ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
      {monte ? '+' : ''}
      {t.evolution.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
    </span>
  )
}

/** Une case de la grille : `taille` en colonnes sur 12 (écran large). */
export function Case({
  titre,
  lien,
  libelleLien,
  taille,
  children,
  enTete,
  className = '',
}: {
  titre?: string
  lien?: string
  libelleLien?: string
  taille: 3 | 4 | 5 | 6 | 7 | 8 | 12
  children: ReactNode
  enTete?: ReactNode
  className?: string
}) {
  const colonnes: Record<number, string> = {
    3: 'md:col-span-3 xl:col-span-3',
    4: 'md:col-span-3 xl:col-span-4',
    5: 'md:col-span-6 xl:col-span-5',
    6: 'md:col-span-6 xl:col-span-6',
    7: 'md:col-span-6 xl:col-span-7',
    8: 'md:col-span-6 xl:col-span-8',
    12: 'md:col-span-6 xl:col-span-12',
  }
  return (
    <section className={`case-ds col-span-2 flex min-w-0 flex-col p-4 ${colonnes[taille]} ${className}`}>
      {titre || enTete ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titre ? <h2 className="text-sm font-bold text-[var(--texte)]">{titre}</h2> : <span />}
          {enTete}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col">{children}</div>
      {lien ? (
        <Link to={lien} className="mt-3 inline-flex items-center gap-1 self-start text-xs font-semibold text-[var(--marque-orange)] hover:underline">
          {libelleLien ?? 'Ouvrir'} <ArrowRight size={12} />
        </Link>
      ) : null}
    </section>
  )
}

/** Le petit libellé en capitales des tuiles, à la taille de nos tuiles. */
const Etiquette = ({ children }: { children: ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">{children}</p>
)

/** La valeur forte, à la taille de nos tuiles (text-2xl, extra-gras). */
function Valeur({ t, petite = false }: { t?: TuileData; petite?: boolean }) {
  const v = ecrire(t)
  return (
    <p title={v === '—' ? t?.raison : undefined} className={`font-extrabold leading-tight ${petite ? 'text-lg' : 'text-2xl'} ${v === '—' ? 'text-[var(--texte-3)]' : 'text-[var(--texte)]'}`}>
      {v}
    </p>
  )
}

/** Une courbe minuscule, sans axe : la tendance, pas le détail. */
function Etincelle({ serie, teinte }: { serie?: number[]; teinte: string }) {
  if (!serie || serie.length < 2 || serie.every((v) => v === 0)) return <div className="h-8" />
  const max = Math.max(...serie)
  const min = Math.min(...serie)
  const pas = 100 / (serie.length - 1)
  const y = (v: number) => 28 - ((v - min) / (max - min || 1)) * 24
  const points = serie.map((v, i) => `${(i * pas).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={`0,30 ${points} 100,30`} fill={teinte} opacity="0.12" stroke="none" />
      <polyline points={points} fill="none" stroke={teinte} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** Une case chiffre : libellé, valeur, évolution, et sa tendance. */
export function CaseChiffre({ t, teinte, lien }: { t?: TuileData; teinte: string; lien: string }) {
  return (
    <Link to={lien} className="case-ds group col-span-1 flex min-w-0 flex-col gap-1 p-3 transition md:p-4 hover:border-[var(--trait-fort)] md:col-span-3 xl:col-span-3">
      <div className="flex items-start justify-between gap-2">
        <Etiquette>{t?.label ?? '—'}</Etiquette>
        <Evolution t={t} />
      </div>
      <Valeur t={t} />
      <div className="mt-auto pt-1">
        <Etincelle serie={t?.serie} teinte={teinte} />
      </div>
      <span className="h-0.5 w-10 rounded-full" style={{ background: teinte }} />
    </Link>
  )
}

/**
 * Le grand graphique : deux séries par jour sur la même période, chacune à sa
 * propre échelle (des euros et des commandes ne se lisent pas sur un même axe).
 */
export function GrandGraphique({ a, b }: { a?: TuileData; b?: TuileData }) {
  const sa = a?.serie ?? []
  const sb = b?.serie ?? []
  const n = Math.max(sa.length, sb.length)
  const vide = n < 2 || [...sa, ...sb].every((v) => v === 0)
  const trace = (serie: number[]) => {
    const max = Math.max(...serie, 0) || 1
    const pas = 1000 / Math.max(1, serie.length - 1)
    return serie.map((v, i) => `${(i * pas).toFixed(1)},${(270 - (v / max) * 240).toFixed(1)}`).join(' ')
  }
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-[var(--texte-2)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-[#f28a4b]" /> {a?.label ?? 'CA'} · <b className="text-[var(--texte)]">{ecrire(a)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-[#e85290]" /> {b?.label ?? 'Commandes'} · <b className="text-[var(--texte)]">{ecrire(b)}</b>
        </span>
      </div>
      <div className="relative min-h-[200px] flex-1">
        <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Évolution des ventes sur la période">
          {[30, 110, 190, 270].map((y) => (
            <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--trait)" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
          ))}
          {!vide && sa.length > 1 ? (
            <>
              <defs>
                <linearGradient id="ve-aire" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f28a4b" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#f28a4b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline points={`0,270 ${trace(sa)} 1000,270`} fill="url(#ve-aire)" stroke="none" />
              <polyline points={trace(sa)} fill="none" stroke="#f28a4b" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          {!vide && sb.length > 1 ? (
            <polyline points={trace(sb)} fill="none" stroke="#e85290" strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {vide ? (
          <p className="absolute inset-0 flex items-center justify-center text-center text-sm text-[var(--texte-3)]">
            Aucune vente sur la période : la courbe se dessinera à la première commande.
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[var(--texte-3)]">
        <span>Début de période</span>
        <span>Aujourd’hui</span>
      </div>
    </div>
  )
}

/** Un anneau de proportion, la valeur au centre. */
export function Anneau({ pour, teinte, centre, taille = 76 }: { pour: number | null; teinte: string; centre: string; taille?: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const p = pour === null ? 0 : Math.max(0, Math.min(100, pour))
  return (
    <svg width={taille} height={taille} viewBox="0 0 76 76" className="shrink-0" aria-hidden>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--trait)" strokeWidth="8" />
      {p > 0 ? <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={teinte}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
      /> : null}
      <text x="38" y="42" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--texte)">
        {centre}
      </text>
    </svg>
  )
}

/** Une répartition en beignet, avec sa légende. */
export function Beignet({ parts, vide }: { parts?: Array<{ label: string; valeur: number }>; vide: string }) {
  const liste = (parts ?? []).filter((p) => p.valeur > 0).slice(0, 6)
  const total = liste.reduce((s, p) => s + p.valeur, 0)
  if (!total) return <p className="py-4 text-xs text-[var(--texte-3)]">{vide}</p>
  const r = 28
  const c = 2 * Math.PI * r
  let deja = 0
  return (
    <div className="flex items-center gap-4">
      <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" aria-hidden>
        {liste.map((p, i) => {
          const longueur = (p.valeur / total) * c
          const arc = (
            <circle
              key={p.label}
              cx="38"
              cy="38"
              r={r}
              fill="none"
              stroke={TEINTES[i % TEINTES.length]}
              strokeWidth="12"
              strokeDasharray={`${longueur} ${c - longueur}`}
              strokeDashoffset={-deja}
              transform="rotate(-90 38 38)"
            />
          )
          deja += longueur
          return arc
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-[11px]">
        {liste.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: TEINTES[i % TEINTES.length] }} />
            <span className="min-w-0 flex-1 truncate text-[var(--texte-2)]">{p.label}</span>
            <b className="text-[var(--texte)]">{Math.round((p.valeur / total) * 100)} %</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Des barres horizontales, la plus longue à 100 %. */
export function Barres({ parts, vide, unite = '' }: { parts?: Array<{ label: string; valeur: number }>; vide: string; unite?: string }) {
  const liste = (parts ?? []).filter((p) => p.valeur > 0).slice(0, 5)
  const max = Math.max(0, ...liste.map((p) => p.valeur))
  if (!max) return <p className="py-4 text-xs text-[var(--texte-3)]">{vide}</p>
  return (
    <ul className="space-y-2">
      {liste.map((p, i) => (
        <li key={p.label}>
          <div className="mb-1 flex justify-between gap-2 text-[11px]">
            <span className="truncate text-[var(--texte-2)]">{p.label}</span>
            <b className="text-[var(--texte)]">
              {p.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              {unite}
            </b>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--trait)]">
            <div className="h-full rounded-full" style={{ width: `${(p.valeur / max) * 100}%`, background: TEINTES[i % TEINTES.length] }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Une jauge horizontale « fait sur total ». */
export function Progression({ label, fait, total, teinte }: { label: string; fait: number | null; total: number | null; teinte: string }) {
  const pour = fait !== null && total ? Math.min(100, (fait / total) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[var(--texte-2)]">{label}</span>
        <b className="text-[var(--texte)]">
          {fait === null ? '—' : fait.toLocaleString('fr-FR')}
          {total !== null ? <span className="font-medium text-[var(--texte-3)]"> / {total.toLocaleString('fr-FR')}</span> : null}
        </b>
      </div>
      <div className="h-2 rounded-full bg-[var(--trait)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pour}%`, background: teinte }} />
      </div>
    </div>
  )
}

/** Une barre découpée en étapes : le chemin d'une commande, de la vente à la livraison. */
export function Etapes({ etapes }: { etapes: Array<{ label: string; t?: TuileData }> }) {
  const valeurs = etapes.map((e) => nombre(e.t) ?? 0)
  const total = valeurs.reduce((s, v) => s + v, 0)
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--trait)]">
        {total
          ? valeurs.map((v, i) => (v ? <div key={etapes[i].label} style={{ width: `${(v / total) * 100}%`, background: TEINTES[i % TEINTES.length] }} /> : null))
          : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {etapes.map((e, i) => (
          <li key={e.label} className="flex items-center gap-2 text-[11px]">
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: TEINTES[i % TEINTES.length] }} />
            <span className="min-w-0 flex-1 truncate text-[var(--texte-2)]">{e.label}</span>
            <b className="text-[var(--texte)]">{ecrire(e.t)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Trois petits chiffres côte à côte. */
export function Trio({ items }: { items: Array<{ label: string; t?: TuileData }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl bg-white/[0.03] px-2 py-2.5 text-center">
          <p className="text-lg font-extrabold text-[var(--texte)]" title={ecrire(it.t) === '—' ? it.t?.raison : undefined}>
            {ecrire(it.t)}
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-[var(--texte-2)]">{it.label}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Une ligne « à traiter » : le compte, ce qu'il veut dire, et un bouton qui
 * s'allume dès qu'il y a quelque chose à faire.
 */
export function LigneATraiter({ t, label, aide, vers, teinte }: { t?: TuileData; label: string; aide: string; vers: string; teinte: string }) {
  const n = nombre(t)
  const allume = (n ?? 0) > 0
  return (
    <div className="flex items-center gap-3 border-b border-[var(--trait)] py-2.5 last:border-b-0">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold"
        style={{ background: `${teinte}22`, color: allume ? teinte : 'var(--texte-3)' }}
      >
        {n === null ? '—' : n.toLocaleString('fr-FR')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--texte)]">{label}</p>
        <p className="truncate text-[11px] text-[var(--texte-3)]">{aide}</p>
      </div>
      <Link
        to={vers}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
          allume ? 'btn-gradient shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'border border-[var(--trait)] text-[var(--texte-2)] hover:border-[var(--trait-fort)] hover:text-[var(--texte)]'
        }`}
      >
        Voir
      </Link>
    </div>
  )
}

/** La case AUTO-SHIPPER : le passage automatique, en trois temps, et son bouton. */
export function CaseAutoShipper() {
  return (
    <section className="case-ds relative col-span-2 flex min-w-0 flex-col justify-between gap-4 overflow-hidden p-5 md:col-span-6 xl:col-span-8">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#e53576] via-[#f27f40] to-[#ffca0a]" />
      <div className="flex items-start gap-3">
        <img src="/marque/autoshipper-icone-64.png" alt="" aria-hidden width={40} height={40} className="shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Votre équipe IA</p>
          <h2 className="text-base font-bold text-[var(--texte)]">
            <span className="bg-gradient-to-r from-[#e53576] via-[#f27f40] to-[#ffca0a] bg-clip-text font-extrabold text-transparent">AUTO-SHIPPER</span>{' '}
            trouve, prépare et diffuse vos produits.
          </h2>
          <p className="mt-1 text-xs text-[var(--texte-2)]">Choisissez vos rayons et vos règles, puis gardez le contrôle de chaque passage.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {['01 · Trouver', '02 · Préparer', '03 · Diffuser'].map((etape, i) => (
          <span key={etape} className="flex items-center gap-2">
            <span className="rounded-lg border border-[var(--trait)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--texte-2)]">{etape}</span>
            {i < 2 ? <ChevronRight size={14} className="text-[var(--texte-3)]" /> : null}
          </span>
        ))}
        <Link to="/pilote" className="btn-gradient ml-auto rounded-lg px-4 py-2 text-sm font-bold">
          Configurer AUTO-SHIPPER
        </Link>
      </div>
    </section>
  )
}

export { Etiquette, Valeur, Evolution, nombre }
