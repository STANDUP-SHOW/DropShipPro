import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { ACCENTS, photoSecteur } from './Creative'

/**
 * Les pièces communes des vues « Intelligence & opportunités » (maquette du
 * 16/10/2026) : la grille des rapports, la note de provenance, l'adresse de la
 * page publique d'un rapport et la lecture d'un verdict.
 */

export interface LigneRapport {
  id: string
  day: string
  type: 'rayon' | 'marketing'
  categorie: string
  categorieNom: string
  theme: string
  themeNom: string
  titre: string
  accroche: string | null
  sources: number
  produits: number
}

/** Une charge utile d'une autre forme est un état vide, jamais un écran blanc. */
export function liste<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function dateLongue(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function dateCourte(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * La page publique d'un rapport, écrite par le générateur SEO du serveur
 * (routes/analysesPubliques.ts) pour chaque rapport déposé, garde-fou appliqué
 * (ni prix d'achat, ni fournisseur, ni marge). Cette adresse est la toute
 * première forme, catégorie/date/thème : le serveur la renvoie en 301 vers
 * l'adresse actuelle de l'article, quel que soit son titre du jour.
 */
export function pagePublique(r: Pick<LigneRapport, 'categorie' | 'day' | 'theme' | 'type'>): string {
  return `/analyses/${r.categorie}/${r.day}/${r.theme}/${r.type === 'marketing' ? 'marketing/' : ''}`
}

/** Un ordre mélangé mais stable pour une même liste : la grille ne saute pas à chaque rendu. */
export function melange<T extends { id: string }>(lignes: T[], graine: string): T[] {
  const poids = (s: string) => {
    let h = 2166136261
    for (const c of s + graine) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    return h >>> 0
  }
  return [...lignes].sort((a, b) => poids(a.id) - poids(b.id))
}

export function GrilleRapports({
  rapports,
  numerotee = false,
  illustree = false,
  actif,
  onOuvrir,
}: {
  rapports: LigneRapport[]
  /** 01, 02… en tête de carte (Analyses de marché). */
  numerotee?: boolean
  /** La photo du rayon en tête de carte (Fresh news). */
  illustree?: boolean
  actif?: string | null
  onOuvrir: (r: LigneRapport) => void
}) {
  return (
    <div className="v-grille">
      {rapports.map((r, i) => {
        const photo = illustree ? photoSecteur({ categorie: r.categorie }) : null
        return (
          <button
            key={r.id}
            type="button"
            className="v-rapport"
            aria-pressed={actif === r.id}
            onClick={() => onOuvrir(r)}
          >
            {illustree ? (
              <div className="v-rapport-image">
                {photo ? <img src={photo} alt="" loading="lazy" /> : null}
                <span className="v-rapport-type" style={{ background: r.type === 'rayon' ? ACCENTS[0] : ACCENTS[1] }}>
                  {r.type === 'rayon' ? 'Marché' : 'Marketing'}
                </span>
              </div>
            ) : null}
            <div className="v-rapport-corps">
              {numerotee ? <span className="v-rapport-numero">{String(i + 1).padStart(2, '0')}</span> : null}
              <span className="v-rapport-sur">
                {r.categorieNom} / {dateLongue(r.day)}
              </span>
              <span className="v-rapport-titre">{r.titre || r.themeNom}</span>
              {r.titre && r.themeNom && r.titre !== r.themeNom ? (
                <span className="text-xs text-[var(--c-texte-2)]">{r.themeNom}</span>
              ) : null}
              <span className="v-rapport-pied">
                <span>
                  {r.type === 'rayon'
                    ? `${r.produits} produit${r.produits > 1 ? 's' : ''} dans le rapport`
                    : `${r.sources} source${r.sources > 1 ? 's' : ''} consultée${r.sources > 1 ? 's' : ''}`}
                </span>
                <span className="c-fleche !h-7 !w-7">
                  <ArrowUpRight size={13} />
                </span>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** La fin de chaque vue : d'où viennent les données, et où aller ensuite. */
export function Provenance({ texte, libelle, to }: { texte: string; libelle: string; to: string }) {
  return (
    <div className="v-provenance mt-12">
      <span>{texte}</span>
      {to.startsWith('/analyses') || to.startsWith('http') ? (
        <a href={to} className="v-lien" target={to.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
          {libelle} <ArrowUpRight size={12} />
        </a>
      ) : (
        <Link to={to} className="v-lien">
          {libelle} <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  )
}

/**
 * Le verdict d'un produit gagnant, tel que l'agent l'a écrit (« BUY IF
 * NEGOTIATED », « WATCHLIST / B2B leads »…), traduit sans rien perdre : le
 * mot-clé est traduit, la précision qui suit reste.
 */
export type FamilleVerdict = 'acheter' | 'surveiller' | 'non'

const VERDICTS: Array<{ motif: RegExp; libelle: string; famille: FamilleVerdict }> = [
  { motif: /^DON.?T BUY/i, libelle: 'Ne pas acheter', famille: 'non' },
  { motif: /^BUY NOW/i, libelle: 'Acheter maintenant', famille: 'acheter' },
  { motif: /^BUY IF NEGOTIATED/i, libelle: 'Acheter si négocié', famille: 'acheter' },
  { motif: /^BUY IF TESTED/i, libelle: 'Acheter si testé', famille: 'acheter' },
  { motif: /^BUY IF LOCAL DEAL/i, libelle: 'Acheter si bonne affaire locale', famille: 'acheter' },
  { motif: /^BREAKOUT CANDIDATE/i, libelle: 'Candidat en percée', famille: 'acheter' },
  { motif: /^WATCHLIST/i, libelle: 'À surveiller', famille: 'surveiller' },
  { motif: /^ne pas acheter/i, libelle: 'Ne pas acheter', famille: 'non' },
  { motif: /^à surveiller/i, libelle: 'À surveiller', famille: 'surveiller' },
  { motif: /^acheter/i, libelle: '', famille: 'acheter' },
  { motif: /^n[ée]gocier/i, libelle: '', famille: 'acheter' },
  { motif: /^budget test/i, libelle: '', famille: 'acheter' },
  { motif: /^pas stock/i, libelle: '', famille: 'non' },
]

export function lireVerdict(brut: string | null | undefined): { libelle: string; famille: FamilleVerdict | null } | null {
  const t = (brut ?? '').trim()
  if (!t) return null
  for (const v of VERDICTS) {
    const m = v.motif.exec(t)
    if (!m) continue
    if (!v.libelle) return { libelle: t, famille: v.famille }
    const reste = t.slice(m[0].length).replace(/^[\s/:–-]+/, '').trim()
    return { libelle: reste ? `${v.libelle} · ${reste}` : v.libelle, famille: v.famille }
  }
  return { libelle: t, famille: null }
}
