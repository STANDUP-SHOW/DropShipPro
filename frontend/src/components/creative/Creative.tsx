import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Pause, Play, X, ArrowUpRight } from 'lucide-react'
import './creative.css'

/**
 * Le socle commun des cinq pages marketing (audit « Creative House », 15/10/2026).
 *
 * Studio, Réseaux & régies, Analyses, Prompts et Chefs de rayon partagent une
 * navigation numérotée, un en-tête (sur-titre citron, titre ample dont la
 * seconde ligne est violette), un appel vers la vue suivante et un bouton qui
 * fige toutes les animations. La réduction des animations du système est lue
 * en plus : elle coupe tout, même sans clic.
 */

const CLE_PAUSE = 'creative-pause'

const PauseContexte = createContext<{ pause: boolean; reduit: boolean }>({ pause: false, reduit: false })

/** Vrai quand rien ne doit bouger : pause demandée ou animations réduites. */
export function useImmobile(): boolean {
  const { pause, reduit } = useContext(PauseContexte)
  return pause || reduit
}

function lirePause(): boolean {
  try {
    return localStorage.getItem(CLE_PAUSE) === '1'
  } catch {
    return false
  }
}

function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const suivre = () => setReduit(mq.matches)
    mq.addEventListener?.('change', suivre)
    return () => mq.removeEventListener?.('change', suivre)
  }, [])
  return Boolean(reduit)
}

export const VUES_CREATIVES = [
  { n: '01', to: '/marketing', label: 'Studio publicitaire' },
  { n: '02', to: '/reseaux', label: 'Réseaux & régies' },
  { n: '03', to: '/reseaux?vue=analyses', label: 'Analyses réseaux' },
  { n: '04', to: '/reseaux?vue=prompts', label: 'Prompts IA' },
  { n: '05', to: '/rayons', label: 'Chefs de rayon' },
] as const

function vueCourante(pathname: string, search: string): string {
  const vue = new URLSearchParams(search).get('vue')
  if (pathname === '/reseaux' && vue === 'analyses') return '03'
  if (pathname === '/reseaux' && vue === 'prompts') return '04'
  if (pathname === '/reseaux') return '02'
  if (pathname === '/rayons') return '05'
  return '01'
}

/** La page entière : la surface encrée, la navigation 01 → 05 et la pause. */
export function PageCreative({ barre, children }: { barre?: ReactNode; children: ReactNode }) {
  const [pause, setPause] = useState(lirePause)
  const reduit = useMouvementReduit()
  const { pathname, search } = useLocation()
  const active = vueCourante(pathname, search)

  function basculer() {
    setPause((p) => {
      try {
        localStorage.setItem(CLE_PAUSE, p ? '0' : '1')
      } catch {
        // Stockage refusé (navigation privée) : la pause vaut pour la visite.
      }
      return !p
    })
  }

  return (
    <PauseContexte.Provider value={{ pause, reduit }}>
      <div className="creative" data-pause={pause ? '1' : '0'}>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <nav aria-label="Marketing et veille" className="c-nav w-full min-w-0 sm:w-auto sm:flex-1">
            {VUES_CREATIVES.map((v) => (
              <Link key={v.n} to={v.to} aria-current={active === v.n ? 'page' : undefined}>
                <b>{v.n}</b>
                <span>{v.label}</span>
              </Link>
            ))}
          </nav>
          {reduit ? null : (
            <button type="button" onClick={basculer} className="c-bouton-sec shrink-0 !py-1.5 !text-xs" aria-pressed={pause}>
              {pause ? <Play size={13} /> : <Pause size={13} />}
              <span>{pause ? 'Relancer les animations' : 'Pause animations'}</span>
            </button>
          )}
        </div>
        {barre ? <div className="mt-3">{barre}</div> : null}
        {children}
      </div>
    </PauseContexte.Provider>
  )
}

/** Les chiffres de la page, dans une barre basse plutôt qu'en tête de page. */
export function BarreCompacte({ children }: { children: ReactNode }) {
  return <div className="c-barre">{children}</div>
}

export function Entete({
  surtitre,
  ligne1,
  ligne2,
  chapo,
}: {
  surtitre: string
  ligne1: string
  ligne2: string
  chapo: string
}) {
  return (
    <header className="c-entete mt-8">
      <div>
        <p className="c-surtitre">{surtitre}</p>
        <h1 className="c-h1">
          {ligne1}
          <em>{ligne2}</em>
        </h1>
      </div>
      <p className="c-chapo">{chapo}</p>
    </header>
  )
}

export function Bandeau({ mots }: { mots: string[] }) {
  // Deux fois la même suite : la piste glisse de moitié et reboucle sans saut.
  const suite = [...mots, ...mots]
  return (
    <div className="c-bandeau" aria-hidden>
      <div className="c-bandeau-piste">
        {[0, 1].map((k) => (
          <span key={k}>
            {suite.map((m, i) => (
              <span key={i}>
                {m}
                <i>✳</i>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

export function AppelSuivant({ question, libelle, to }: { question: string; libelle: string; to: string }) {
  return (
    <div className="c-appel mt-14">
      <p className="c-h2">{question}</p>
      <Link to={to} className="c-bouton">
        <span>{libelle}</span>
        <ArrowUpRight size={15} />
      </Link>
    </div>
  )
}

export function Filtres<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string }>
  valeur: T
  onChange: (v: T) => void
}) {
  return (
    <div className="c-filtres" role="group">
      {options.map((o) => (
        <button key={o.id} type="button" className="c-filtre" aria-pressed={valeur === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Une fenêtre au milieu de l'écran ; Échap la ferme. */
export function Fenetre({
  titre,
  onClose,
  large = false,
  children,
}: {
  titre: string
  onClose: () => void
  large?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onClose])

  return (
    <div className="c-fenetre-fond" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`c-fenetre ${large ? 'max-w-3xl' : 'max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="c-h2">{titre}</h2>
          <button type="button" onClick={onClose} className="c-fleche shrink-0" aria-label="Fermer">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Un nom de produit qui se lit d'un coup d'œil.
 *
 * Les titres importés traînent tout le référencement du fournisseur
 * (« Casque Bluetooth sans fil, réduction de bruit, 40 h, pliable… ») : le
 * premier segment suffit à reconnaître l'article, le titre entier reste dans
 * l'infobulle.
 */
export function nomCourt(titre: string | null | undefined, mots = 6): string {
  const t = (titre ?? '').trim()
  if (!t) return 'Sans titre'
  const segment = t.split(/\s[-–|·]\s|[,(]/)[0].trim() || t
  const liste = segment.split(/\s+/)
  return liste.length > mots ? `${liste.slice(0, mots).join(' ')}…` : segment
}

/** Le format d'une image, lu à ses dimensions. */
export function formatDe(largeur: number, hauteur: number): 'vertical' | 'carre' | 'paysage' {
  const r = largeur / Math.max(1, hauteur)
  if (r < 0.9) return 'vertical'
  if (r > 1.1) return 'paysage'
  return 'carre'
}

export const NOM_FORMAT = { vertical: 'Vertical', carre: 'Carré', paysage: 'Paysage' } as const

/*
 * La photo d'un secteur : celle des 24 rayons (public/images/rayons/), choisie
 * pour chaque catégorie des analyses quotidiennes. C'est une photo de rayon,
 * jamais présentée comme un résultat de génération.
 */
const PHOTO_DE_CATEGORIE: Record<string, string> = {
  informatique: 'electronique',
  'tv-son-photo': 'electronique',
  telephonie: 'telephones-portables-et-accessoires',
  electromenager: 'appareils-electromenagers',
  'mode-femme': 'vetements-pour-femmes',
  'mode-homme': 'vetements-pour-hommes',
  'chaussures-maroquinerie': 'chaussures',
  'bijoux-montres': 'bijoux-et-accessoires',
  beaute: 'beaute-et-sante',
  'sante-bien-etre': 'beaute-et-sante',
  bricolage: 'outils-et-bricolage',
  jardin: 'terrasse-pelouse-et-jardin',
  meubles: 'meubles',
  'maison-decoration': 'meubles',
  'linge-de-maison': 'meubles',
  'cuisine-table': 'appareils-electromenagers',
  'salle-de-bain': 'meubles',
  'loisirs-creatifs': 'arts-artisanat-et-couture',
  'jouets-jeux': 'jouets-et-jeux',
  'bebe-enfant': 'bebe-et-maternite',
  animaux: 'fournitures-pour-animaux-de-compagnie',
  sport: 'sports-et-loisirs-de-plein-air',
  'voyage-plein-air': 'sacs-et-bagages',
  automobile: 'automobile',
}

/** `rayon` : la clé d'un chef de rayon (c'est le nom du fichier) ; `categorie` : une catégorie d'analyse. */
export function photoSecteur({ rayon, categorie }: { rayon?: string; categorie?: string }): string | null {
  const id = rayon ?? (categorie ? PHOTO_DE_CATEGORIE[categorie] : undefined)
  return id ? `/images/rayons/${id}.jpg` : null
}

/** Les trois accents, tournés dans l'ordre pour donner une teinte à chaque carte. */
export const ACCENTS = ['#b39af9', '#ffa2c7', '#d9f66f', '#9ed5d1', '#efb38d', '#e8d9b2'] as const
