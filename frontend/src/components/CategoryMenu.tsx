import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { api } from '../lib/api'

/**
 * Le filtre par catégorie, en menu déroulant plutôt qu'en bandeau.
 *
 * Ce que ça remplace : une file de pastilles à défilement horizontal. Avec un
 * catalogue de trente rayons, la moitié était hors écran et il fallait faire
 * glisser à l'aveugle pour retrouver « Outillage électroportatif » — un geste
 * qui n'existe nulle part ailleurs dans l'application, et que rien n'annonçait.
 *
 * Le menu montre les **rayons** d'abord, avec leur icône : vingt-quatre entrées
 * se lisent d'un coup d'œil, deux cents sous-catégories non. On entre dans un
 * rayon pour affiner, et le fil d'Ariane ramène en arrière.
 *
 * Seul ce qui est réellement au catalogue est proposé. Offrir un filtre qui ne
 * renverrait rien fait douter du filtre, pas du catalogue.
 */

type Arbre = Awaited<ReturnType<typeof api.categoryTree>>['arbre']

export interface ChoixCategorie {
  /** L'identifiant retenu — rayon ou sous-catégorie — ou `null` pour « toutes ». */
  id: string | null
  label: string
}

export function CategoryMenu({
  /** Les identifiants de catégorie réellement portés par les annonces. */
  presents,
  /** Combien d'annonces par identifiant, pour afficher les compteurs. */
  compte,
  valeur,
  onChange,
}: {
  presents: string[]
  compte: Map<string, number>
  valeur: string | null
  onChange: (choix: ChoixCategorie) => void
}) {
  const [arbre, setArbre] = useState<Arbre>([])
  const [ouvert, setOuvert] = useState(false)
  const [rayonOuvert, setRayonOuvert] = useState<Arbre[number] | null>(null)
  const [recherche, setRecherche] = useState('')
  const boite = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api
      .categoryTree()
      .then((r) => setArbre(r.arbre))
      .catch(() => undefined)
  }, [])

  // Un clic ailleurs ferme le menu : sans ça, deux menus peuvent rester
  // ouverts en même temps et on ne sait plus lequel agit.
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false)
    }
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', echap)
    }
  }, [ouvert])

  const presentsSet = useMemo(() => new Set(presents), [presents])

  /**
   * Les rayons qui contiennent au moins une annonce, et leurs sous-catégories
   * utilisées.
   *
   * Le compteur d'un rayon additionne ses sous-catégories : c'est ce que le
   * vendeur attend en le lisant, et ça évite d'entrer dans un rayon pour
   * découvrir qu'il est vide.
   */
  const rayons = useMemo(() => {
    return arbre
      .map((r) => {
        const enfants = r.enfants.filter((e) => presentsSet.has(e.id))
        const total =
          enfants.reduce((n, e) => n + (compte.get(e.id) ?? 0), 0) + (compte.get(r.id) ?? 0)
        return { ...r, enfants, total }
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [arbre, presentsSet, compte])

  /** La recherche traverse les deux niveaux : on ne sait pas où est « souris ». */
  const resultats = useMemo(() => {
    const besoin = recherche.trim().toLowerCase()
    if (!besoin) return []
    const sortie: Array<{ id: string; label: string; rayon: string; icone: string | null; n: number }> = []
    for (const r of rayons) {
      for (const e of r.enfants) {
        if (e.label.toLowerCase().includes(besoin) || r.label.toLowerCase().includes(besoin)) {
          sortie.push({ id: e.id, label: e.label, rayon: r.label, icone: r.icone, n: compte.get(e.id) ?? 0 })
        }
      }
    }
    return sortie.slice(0, 40)
  }, [recherche, rayons, compte])

  const libelleActuel = useMemo(() => {
    if (!valeur) return 'Toutes les catégories'
    for (const r of rayons) {
      if (r.id === valeur) return r.label
      const e = r.enfants.find((x) => x.id === valeur)
      if (e) return e.label
    }
    return 'Catégorie'
  }, [valeur, rayons])

  const choisir = (id: string | null, label: string) => {
    onChange({ id, label })
    setOuvert(false)
    setRayonOuvert(null)
    setRecherche('')
  }

  if (!rayons.length) return null

  return (
    <div ref={boite} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
          valeur
            ? 'border-purple-400/60 bg-purple-500/15 text-white'
            : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/25'
        }`}
      >
        <span className="max-w-[14rem] truncate">{libelleActuel}</span>
        {valeur ? (
          <span
            role="button"
            tabIndex={0}
            title="Retirer le filtre"
            onClick={(e) => {
              e.stopPropagation()
              choisir(null, 'Toutes les catégories')
            }}
            onKeyDown={(e) => e.key === 'Enter' && choisir(null, 'Toutes les catégories')}
            className="text-gray-300 hover:text-white"
          >
            <X size={13} />
          </span>
        ) : (
          <ChevronDown size={14} className="text-gray-500" />
        )}
      </button>

      {ouvert ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-xl border border-white/10 bg-[#1b1633] shadow-2xl">
          <div className="border-b border-white/10 p-2">
            <label className="relative block">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                autoFocus
                placeholder="Chercher un rayon ou une catégorie"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-purple-400/60"
              />
            </label>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {/* --- La recherche prime sur la navigation --- */}
            {recherche.trim() ? (
              resultats.length ? (
                resultats.map((r) => (
                  <Ligne
                    key={r.id}
                    icone={r.icone}
                    titre={r.label}
                    detail={r.rayon}
                    nombre={r.n}
                    actif={valeur === r.id}
                    onClick={() => choisir(r.id, r.label)}
                  />
                ))
              ) : (
                <p className="px-3 py-4 text-center text-xs text-gray-500">
                  Aucune catégorie de votre catalogue ne correspond.
                </p>
              )
            ) : rayonOuvert ? (
              /* --- Un rayon ouvert : ses sous-catégories --- */
              <>
                <button
                  type="button"
                  onClick={() => setRayonOuvert(null)}
                  className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-gray-400 hover:bg-white/5 hover:text-white"
                >
                  <ChevronDown size={13} className="rotate-90" />
                  <span>Tous les rayons</span>
                </button>

                {/* Le rayon entier reste choisissable : c'est souvent ce qu'on
                    veut, et l'obliger à choisir une sous-catégorie ferait rater
                    les annonces rangées au rayon lui-même. */}
                <Ligne
                  icone={rayonOuvert.icone}
                  titre={`Tout ${rayonOuvert.label}`}
                  nombre={rayons.find((r) => r.id === rayonOuvert.id)?.total ?? 0}
                  actif={valeur === rayonOuvert.id}
                  onClick={() => choisir(rayonOuvert.id, rayonOuvert.label)}
                />

                {rayonOuvert.enfants
                  .filter((e) => presentsSet.has(e.id))
                  .sort((a, b) => (compte.get(b.id) ?? 0) - (compte.get(a.id) ?? 0))
                  .map((e) => (
                    <Ligne
                      key={e.id}
                      titre={e.label}
                      nombre={compte.get(e.id) ?? 0}
                      actif={valeur === e.id}
                      onClick={() => choisir(e.id, e.label)}
                    />
                  ))}
              </>
            ) : (
              /* --- L'accueil : les rayons --- */
              <>
                <Ligne
                  titre="Toutes les catégories"
                  actif={!valeur}
                  onClick={() => choisir(null, 'Toutes les catégories')}
                />
                {rayons.map((r) => (
                  <Ligne
                    key={r.id}
                    icone={r.icone}
                    titre={r.label}
                    nombre={r.total}
                    fleche={r.enfants.length > 0}
                    actif={valeur === r.id}
                    onClick={() =>
                      r.enfants.length ? setRayonOuvert(r) : choisir(r.id, r.label)
                    }
                  />
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Ligne({
  icone,
  titre,
  detail,
  nombre,
  actif,
  fleche,
  onClick,
}: {
  icone?: string | null
  titre: string
  detail?: string
  nombre?: number
  actif?: boolean
  fleche?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
        actif ? 'bg-purple-500/20 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="w-5 shrink-0 text-center text-base leading-none">{icone ?? ''}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{titre}</span>
        {detail ? <span className="block truncate text-[11px] text-gray-500">{detail}</span> : null}
      </span>
      {typeof nombre === 'number' ? (
        <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[11px] text-gray-400">
          {nombre}
        </span>
      ) : null}
      {fleche ? <ChevronDown size={13} className="shrink-0 -rotate-90 text-gray-500" /> : null}
    </button>
  )
}
