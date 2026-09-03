import { useId } from 'react'

/**
 * Les vingt-six formes du tableau de bord.
 *
 * **Elles viennent des trois planches fournies le 03/09/2026** — les kits
 * d'interface en dégradés — avec la consigne : « tu vas utiliser ceux fournis
 * dans ces images maintenant ». Anneau à pastille terminale, colonnes empilées
 * bicolores, rangée de points, barre hachurée, vagues en miroir, aires en
 * couches, bâtons sous une courbe, cylindres, jalons reliés, demi-camembert à
 * secteurs… chaque archétype des planches a la sienne ici.
 *
 * Trois familles, selon ce que la donnée permet :
 * — les formes à **série** dessinent trente jours de valeurs ;
 * — les formes à **répartition** dessinent des parts (camemberts, cylindres) ;
 * — les formes à **proportion** dessinent une valeur sur cent, et servent
 *   d'ornement plein quand la tuile n'a qu'un nombre sec — jamais sur une
 *   tuile en pourcentage, où un anneau plein mentirait.
 */

export interface Encre {
  de: string
  a: string
}

export type Part = { label: string; valeur: number }

/** Une couleur par segment, piochée dans toutes les palettes. */
export const SEGMENTS_COULEURS = ['#f472b6', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb923c', '#60a5fa', '#ec4899']

export function Degrade({ id, de, a, vertical = false }: { id: string; de: string; a: string; vertical?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      <stop offset="0" stopColor={de} />
      <stop offset="1" stopColor={a} />
    </linearGradient>
  )
}

const normalisee = (serie: number[]) => {
  const max = Math.max(...serie, 1)
  return serie.map((v) => v / max)
}

/** Un tracé lissé qui passe par les milieux — les vagues des planches. */
function lisse(pts: Array<readonly [number, number]>): string {
  if (pts.length < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
  }
  const fin = pts[pts.length - 1]
  return `${d} L${fin[0].toFixed(1)},${fin[1].toFixed(1)}`
}

// ═══ Formes à SÉRIE ══════════════════════════════════════════════════════════

export function Etincelle({ serie, encre }: { serie: number[]; encre: Encre }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie)
  const pas = n.length > 1 ? 100 / (n.length - 1) : 100
  const pts = n.map((v, i) => [i * pas, H - 4 - v * (H - 8)] as const)
  const trait = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={`${gid}t`} {...encre} />
        <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={encre.de} stopOpacity="0.35" />
          <stop offset="1" stopColor={encre.a} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${trait} L100,${H} L0,${H} Z`} fill={`url(#${gid}a)`} />
      <path d={trait} fill="none" stroke={`url(#${gid}t)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Batons({ serie, encre, graine = 0 }: { serie: number[]; encre: Encre; graine?: number }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-(14 + (graine % 4) * 4))
  const larg = 100 / n.length
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} vertical />
      </defs>
      {n.map((v, i) => {
        const h = Math.max(2, v * (H - 4))
        return <rect key={i} x={i * larg + larg * 0.18} y={H - h} width={larg * 0.64} height={h} rx="1.5" fill={`url(#${gid})`} />
      })}
    </svg>
  )
}

export function Points({ serie, encre }: { serie: number[]; encre: Encre }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-12)
  const pas = n.length > 1 ? 92 / (n.length - 1) : 92
  const pts = n.map((v, i) => [4 + i * pas, H - 5 - v * (H - 10)] as const)
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.1" fill={`url(#${gid})`} />
      ))}
    </svg>
  )
}

export function Egaliseur({ serie, encre, graine = 0 }: { serie: number[]; encre: Encre; graine?: number }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-(14 + (graine % 4) * 4))
  const larg = 100 / n.length
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} vertical />
      </defs>
      {n.map((v, i) => {
        const h = Math.max(1.5, (v * (H - 6)) / 2)
        return (
          <g key={i}>
            <rect x={i * larg + larg * 0.22} y={H / 2 - h} width={larg * 0.56} height={h} rx="1.2" fill={`url(#${gid})`} />
            <rect x={i * larg + larg * 0.22} y={H / 2 + 1} width={larg * 0.56} height={h * 0.7} rx="1.2" fill={`url(#${gid})`} opacity="0.5" />
          </g>
        )
      })}
    </svg>
  )
}

/** La vague lisse en miroir des planches — une bosse au-dessus, son écho dessous. */
export function Vague({ serie, encre }: { serie: number[]; encre: Encre }) {
  const H = 32
  const n = normalisee(serie).slice(-16)
  const pas = n.length > 1 ? 100 / (n.length - 1) : 100
  const haut = n.map((v, i) => [i * pas, H / 2 - 2 - v * (H / 2 - 5)] as const)
  const bas = n.map((v, i) => [i * pas, H / 2 + 2 + v * (H / 2 - 5) * 0.7] as const)
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={`${lisse(haut)} L100,${H / 2} L0,${H / 2} Z`} fill={`${encre.de}44`} />
      <path d={lisse(haut)} fill="none" stroke={encre.de} strokeWidth="1.6" strokeLinecap="round" />
      <path d={`${lisse(bas)} L100,${H / 2} L0,${H / 2} Z`} fill={`${encre.a}33`} />
      <path d={lisse(bas)} fill="none" stroke={encre.a} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <line x1="0" y1={H / 2} x2="100" y2={H / 2} stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" />
    </svg>
  )
}

/** Les montagnes en couches des planches : la même série à trois échelles. */
export function Aires({ serie, graine = 0 }: { serie: number[]; graine?: number }) {
  const H = 32
  const n = normalisee(serie).slice(-18)
  const pas = n.length > 1 ? 100 / (n.length - 1) : 100
  const couche = (echelle: number) => {
    const pts = n.map((v, i) => [i * pas, H - 2 - v * (H - 6) * echelle] as const)
    return `${lisse(pts)} L100,${H} L0,${H} Z`
  }
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      {[1, 0.68, 0.4].map((echelle, i) => (
        <path key={i} d={couche(echelle)} fill={SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]} opacity={0.38 + i * 0.14} />
      ))}
    </svg>
  )
}

/** Les bâtons sous leur courbe — le « heart rate » des planches. */
export function BarresLigne({ serie, encre }: { serie: number[]; encre: Encre }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-18)
  const larg = 100 / n.length
  const pts = n.map((v, i) => [i * larg + larg / 2, H - 3 - v * (H - 8)] as const)
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} vertical />
      </defs>
      {n.map((v, i) => {
        const h = Math.max(1.5, v * (H - 8) * 0.85)
        return <rect key={i} x={i * larg + larg * 0.25} y={H - h} width={larg * 0.5} height={h} rx="1" fill={`url(#${gid})`} opacity="0.55" />
      })}
      <path d={lisse(pts)} fill="none" stroke={encre.a} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * La série et sa moyenne mobile sur sept jours : deux lignes, toutes deux
 * vraies — la seconde est calculée de la première, jamais inventée.
 */
export function Lignes({ serie, encre }: { serie: number[]; encre: Encre }) {
  const H = 32
  const brute = normalisee(serie)
  const moyenne = brute.map((_, i) => {
    const debut = Math.max(0, i - 6)
    const tranche = brute.slice(debut, i + 1)
    return tranche.reduce((s, v) => s + v, 0) / tranche.length
  })
  const pas = brute.length > 1 ? 100 / (brute.length - 1) : 100
  const chemin = (vals: number[]) => vals.map((v, i) => [i * pas, H - 4 - v * (H - 8)] as const)
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={chemin(brute).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={encre.de} strokeWidth="1.3" opacity="0.65" />
      <path d={lisse(chemin(moyenne))} fill="none" stroke={encre.a} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Les colonnes empilées bicolores des planches : la part faite, le reste éteint. */
export function Empilees({ serie, encre, graine = 0 }: { serie: number[]; encre: Encre; graine?: number }) {
  const gid = useId()
  const H = 32
  const n = normalisee(serie).slice(-(6 + (graine % 3) * 2))
  const larg = 100 / n.length
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} vertical />
      </defs>
      {n.map((v, i) => {
        const h = Math.max(2, v * (H - 6))
        return (
          <g key={i}>
            <rect x={i * larg + larg * 0.2} y={2} width={larg * 0.6} height={H - 4} rx="2" fill="rgba(255,255,255,0.09)" />
            <rect x={i * larg + larg * 0.2} y={H - 2 - h} width={larg * 0.6} height={h} rx="2" fill={`url(#${gid})`} />
          </g>
        )
      })}
    </svg>
  )
}

// ═══ Formes à RÉPARTITION ════════════════════════════════════════════════════

export function Camembert({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0) || 1
  const epaisseur = 9 + (graine % 3) * 2
  const r = 22
  const tour = 2 * Math.PI * r
  let depart = 0
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      {parts.map((p, i) => {
        const longueur = (p.valeur / total) * tour
        const cercle = (
          <circle
            key={p.label + i}
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]}
            strokeWidth={epaisseur}
            strokeDasharray={`${Math.max(0.8, longueur - 1.6).toFixed(1)} ${tour.toFixed(1)}`}
            strokeDashoffset={(-depart).toFixed(1)}
            transform="rotate(-90 32 32)"
          />
        )
        depart += longueur
        return cercle
      })}
    </svg>
  )
}

export function Anneaux({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const max = Math.max(...parts.map((p) => p.valeur), 1)
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      {parts.slice(0, 4).map((p, i) => {
        const r = 27 - i * 7
        const tour = 2 * Math.PI * r
        const visible = Math.max(0.07, p.valeur / max)
        return (
          <g key={p.label + i}>
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4.5" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke={SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]}
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={`${(visible * tour).toFixed(1)} ${tour.toFixed(1)}`}
              transform="rotate(-90 32 32)"
            />
          </g>
        )
      })}
    </svg>
  )
}

export function BarresH({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const max = Math.max(...parts.map((p) => p.valeur), 1)
  const lignes = parts.slice(0, 4)
  const h = 32 / lignes.length
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      {lignes.map((p, i) => (
        <g key={p.label + i}>
          <rect x="0" y={i * h + h * 0.25} width="100" height={h * 0.5} rx={h * 0.25} fill="rgba(255,255,255,0.07)" />
          <rect x="0" y={i * h + h * 0.25} width={Math.max(5, (p.valeur / max) * 100)} height={h * 0.5} rx={h * 0.25} fill={SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]} />
        </g>
      ))}
    </svg>
  )
}

export function Radar({ parts, encre }: { parts: Part[]; encre: Encre }) {
  const gid = useId()
  const axes = Math.max(3, Math.min(6, parts.length))
  const max = Math.max(...parts.map((p) => p.valeur), 1)
  const point = (i: number, ray: number) => {
    const angle = (i / axes) * 2 * Math.PI - Math.PI / 2
    return [32 + Math.cos(angle) * ray, 32 + Math.sin(angle) * ray] as const
  }
  const toile = [10, 18, 26].map((ray) => Array.from({ length: axes }, (_, i) => point(i, ray).map((v) => v.toFixed(1)).join(',')).join(' '))
  const forme = Array.from({ length: axes }, (_, i) => {
    const v = parts[i % parts.length].valeur / max
    return point(i, 6 + v * 20).map((x) => x.toFixed(1)).join(',')
  }).join(' ')
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {toile.map((points, i) => (
        <polygon key={i} points={points} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" />
      ))}
      <polygon points={forme} fill={`${encre.de}33`} stroke={`url(#${gid})`} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function Curseurs({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const max = Math.max(...parts.map((p) => p.valeur), 1)
  const lignes = parts.slice(0, 3 + (graine % 2))
  const pas = 64 / lignes.length
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      {lignes.map((p, i) => {
        const x = pas / 2 + i * pas
        const y = 58 - (p.valeur / max) * 48
        const couleur = SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]
        return (
          <g key={p.label + i}>
            <line x1={x} y1="6" x2={x} y2="58" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1={x} y1={y} x2={x} y2="58" stroke={couleur} strokeWidth="2.5" strokeLinecap="round" />
            <rect x={x - 3.2} y={y - 4.5} width="6.4" height="9" rx="2" fill={couleur} style={{ filter: `drop-shadow(0 0 3px ${couleur})` }} />
          </g>
        )
      })}
    </svg>
  )
}

/** Les cylindres 3D des planches : ellipse au sommet, fût dégradé. */
export function Cylindres({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const gid = useId()
  const max = Math.max(...parts.map((p) => p.valeur), 1)
  const lignes = parts.slice(0, 4)
  const pas = 64 / lignes.length
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      {lignes.map((p, i) => {
        const couleur = SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]
        const h = 8 + (p.valeur / max) * 42
        const x = pas / 2 + i * pas
        const larg = Math.min(11, pas * 0.62)
        return (
          <g key={p.label + i}>
            <defs>
              <linearGradient id={`${gid}${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={couleur} />
                <stop offset="1" stopColor={couleur} stopOpacity="0.45" />
              </linearGradient>
            </defs>
            <rect x={x - larg / 2} y={60 - h} width={larg} height={h} fill={`url(#${gid}${i})`} />
            <ellipse cx={x} cy={60 - h} rx={larg / 2} ry="2.4" fill={couleur} />
            <ellipse cx={x} cy="60" rx={larg / 2} ry="2.4" fill={couleur} opacity="0.35" />
          </g>
        )
      })}
    </svg>
  )
}

/** Les jalons A-B-C-D des planches : des cercles pleins reliés d'un pointillé. */
export function Jalons({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const max = Math.max(...parts.map((p) => p.valeur), 1)
  const lignes = parts.slice(0, 4)
  const pas = 100 / lignes.length
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <line x1={pas / 2} y1="12" x2={100 - pas / 2} y2="12" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="2 2.5" />
      {lignes.map((p, i) => {
        const couleur = SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]
        const x = pas / 2 + i * pas
        const r = 4 + (p.valeur / max) * 4.5
        return (
          <g key={p.label + i}>
            <circle cx={x} cy="12" r={r} fill={couleur} />
            <circle cx={x} cy="27" r="1.8" fill={couleur} opacity="0.7" />
            <line x1={x} y1={12 + r} x2={x} y2="24" stroke={couleur} strokeWidth="0.8" strokeDasharray="1.5 2" opacity="0.5" />
          </g>
        )
      })}
    </svg>
  )
}

/** Le demi-camembert à secteurs des planches, cible au centre. */
export function DemiCamembert({ parts, graine = 0 }: { parts: Part[]; graine?: number }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0) || 1
  const r = 24
  const demi = Math.PI * r
  let depart = 0
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16" aria-hidden>
      {parts.slice(0, 4).map((p, i) => {
        const longueur = (p.valeur / total) * demi
        const arc = (
          <path
            key={p.label + i}
            d={`M ${32 - r} 36 A ${r} ${r} 0 0 1 ${32 + r} 36`}
            fill="none"
            stroke={SEGMENTS_COULEURS[(i + graine) % SEGMENTS_COULEURS.length]}
            strokeWidth="10"
            strokeDasharray={`${Math.max(0.8, longueur - 1.2).toFixed(1)} ${(demi * 2).toFixed(1)}`}
            strokeDashoffset={(-depart).toFixed(1)}
          />
        )
        depart += longueur
        return arc
      })}
      <circle cx="32" cy="36" r="7" fill="none" stroke={SEGMENTS_COULEURS[graine % SEGMENTS_COULEURS.length]} strokeWidth="2.4" />
      <circle cx="32" cy="36" r="3" fill={SEGMENTS_COULEURS[(graine + 1) % SEGMENTS_COULEURS.length]} />
    </svg>
  )
}

// ═══ Formes à PROPORTION (et ornement) ═══════════════════════════════════════

export function Jauge({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  const r = 26
  const tour = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(part * tour).toFixed(1)} ${tour.toFixed(1)}`} transform="rotate(-90 32 32)" style={{ filter: `drop-shadow(0 0 4px ${encre.de}66)` }} />
    </svg>
  )
}

/** L'anneau des planches, la pastille posée au bout de l'arc. */
export function AnneauPastille({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  const r = 25
  const tour = 2 * Math.PI * r
  const angle = part * 2 * Math.PI - Math.PI / 2
  const bout = [32 + Math.cos(angle) * r, 32 + Math.sin(angle) * r] as const
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(part * tour).toFixed(1)} ${tour.toFixed(1)}`} transform="rotate(-90 32 32)" />
      <circle cx={bout[0].toFixed(1)} cy={bout[1].toFixed(1)} r="4" fill={encre.a} style={{ filter: `drop-shadow(0 0 3px ${encre.de})` }} />
    </svg>
  )
}

export function Arcs({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {[26, 20, 14].map((r, i) => {
        const tour = 2 * Math.PI * r
        const visible = Math.max(0.06, part - i * 0.12)
        return (
          <g key={r}>
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.4" />
            <circle cx="32" cy="32" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="3.4" strokeLinecap="round" strokeDasharray={`${(visible * tour).toFixed(1)} ${tour.toFixed(1)}`} transform={`rotate(${-90 + i * 24} 32 32)`} opacity={1 - i * 0.25} />
          </g>
        )
      })}
    </svg>
  )
}

export function Crante({ part, encre, graine = 0 }: { part: number; encre: Encre; graine?: number }) {
  const gid = useId()
  const crans = 18 + (graine % 4) * 4
  const pleins = Math.round(part * crans)
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {Array.from({ length: crans }, (_, i) => {
        const angle = (i / crans) * 2 * Math.PI - Math.PI / 2
        return (
          <line
            key={i}
            x1={32 + Math.cos(angle) * 21}
            y1={32 + Math.sin(angle) * 21}
            x2={32 + Math.cos(angle) * 28}
            y2={32 + Math.sin(angle) * 28}
            stroke={i < pleins ? `url(#${gid})` : 'rgba(255,255,255,0.10)'}
            strokeWidth="3"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export function DemiJauge({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  const r = 24
  const demi = Math.PI * r
  const angle = Math.PI * (1 - part)
  const aiguille = [32 + Math.cos(angle) * (r - 7), 36 - Math.sin(angle) * (r - 7)] as const
  return (
    <svg viewBox="0 0 64 42" className="h-11 w-16" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <path d={`M ${32 - r} 36 A ${r} ${r} 0 0 1 ${32 + r} 36`} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${32 - r} 36 A ${r} ${r} 0 0 1 ${32 + r} 36`} fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(part * demi).toFixed(1)} ${demi.toFixed(1)}`} style={{ filter: `drop-shadow(0 0 4px ${encre.de}55)` }} />
      <line x1="32" y1="36" x2={aiguille[0].toFixed(1)} y2={aiguille[1].toFixed(1)} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="32" cy="36" r="2.4" fill="#fff" />
    </svg>
  )
}

/** La rangée de points des planches : tant d'allumés, tant d'éteints. */
export function Pastilles({ part, encre, graine = 0 }: { part: number; encre: Encre; graine?: number }) {
  const gid = useId()
  const n = 10 + (graine % 3) * 2
  const pleins = Math.round(part * n)
  const pas = 100 / n
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={pas / 2 + i * pas} cy="5" r="3" fill={i < pleins ? `url(#${gid})` : 'rgba(255,255,255,0.10)'} />
      ))}
    </svg>
  )
}

/** La barre hachurée des planches : des traits penchés dans une gélule. */
export function Rayures({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
      <defs>
        <Degrade id={`${gid}g`} {...encre} />
        <clipPath id={`${gid}c`}>
          <rect x="0" y="1" width={Math.max(5, part * 100)} height="8" rx="4" />
        </clipPath>
      </defs>
      <rect x="0" y="1" width="100" height="8" rx="4" fill="rgba(255,255,255,0.08)" />
      <g clipPath={`url(#${gid}c)`}>
        <rect x="0" y="1" width="100" height="8" fill={`url(#${gid}g)`} opacity="0.35" />
        {Array.from({ length: 26 }, (_, i) => (
          <line key={i} x1={i * 4 - 4} y1="10" x2={i * 4} y2="0" stroke={`url(#${gid}g)`} strokeWidth="1.7" />
        ))}
      </g>
    </svg>
  )
}

export function Barre({ part, encre }: { part: number; encre: Encre }) {
  const gid = useId()
  const x = 3 + part * 94
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      <rect x="0" y="3.2" width="100" height="3.6" rx="1.8" fill="rgba(255,255,255,0.08)" />
      <rect x="0" y="3.2" width={Math.max(4, part * 100)} height="3.6" rx="1.8" fill={`url(#${gid})`} />
      <circle cx={x} cy="5" r="3.4" fill={encre.a} style={{ filter: `drop-shadow(0 0 3px ${encre.a})` }} />
    </svg>
  )
}

export function Segments({ part, encre, graine = 0 }: { part: number; encre: Encre; graine?: number }) {
  const gid = useId()
  const n = 10 + (graine % 5) * 2
  const pleins = Math.round(part * n)
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" aria-hidden>
      <defs>
        <Degrade id={gid} {...encre} />
      </defs>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={(i * 100) / n + 0.8} y="0" width={100 / n - 1.6} height="8" rx="1.5" fill={i < pleins ? `url(#${gid})` : 'rgba(255,255,255,0.08)'} />
      ))}
    </svg>
  )
}
