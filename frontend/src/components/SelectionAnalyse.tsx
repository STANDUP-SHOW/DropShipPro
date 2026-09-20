import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Boxes, Check, Loader2, Search, Sparkles, Globe } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { ApercuProduit, eurosProduit, photosProduit, type ProduitApercu } from './ApercuProduit'

/**
 * Le haut de la page Analyses de marché : sur QUOI porte l'analyse.
 *
 * **La page ne posait pas la question.** Elle ne savait travailler que sur une
 * sélection venue de « Mes annonces » : ouverte depuis le menu, elle n'offrait
 * que le studio à sujet libre, et rien pour analyser une annonce déjà importée
 * — alors que c'est le geste le plus courant, celui qui connaît le prix
 * d'achat et le prix de vente.
 *
 * **La catégorie est obligatoire, et c'est le point de la mécanique.** Un
 * catalogue de trois cents annonces ne se parcourt pas à la recherche d'un
 * titre tronqué ; et une analyse se lit par rayon, pas produit par produit au
 * hasard. Tant qu'aucune catégorie n'est choisie, la liste reste fermée : c'est
 * ce qui distingue « je n'ai rien sélectionné » de « il n'y a rien ».
 *
 * **Cinq produits au maximum**, et le plafond est dit avant le clic : le
 * serveur refuse au-delà (`analysisSchema`, max 5), chaque produit lançant un
 * vrai appel modèle et ses recherches web.
 */

type Produit = ProduitApercu & { categoryId?: string | null; createdAt?: string }

export const PLAFOND_ANALYSE = 5

export function SelectionAnalyse({
  onLancer,
  enCours,
  /** Les annonces déjà cochées ailleurs (« Mes annonces »), pour les retrouver ici. */
  preselection = [],
  /** Bascule vers le studio à sujet libre, rendu par la page au-dessus des résultats. */
  onModeChange,
}: {
  onLancer: (productIds: string[]) => void
  enCours: boolean
  preselection?: string[]
  onModeChange?: (mode: Mode) => void
}) {
  const [produits, setProduits] = useState<Produit[]>([])
  const [catalogue, setCatalogue] = useState<Array<{ id: string; label: string }>>([])
  const [categorie, setCategorie] = useState('')
  const [recherche, setRecherche] = useState('')
  const [choisis, setChoisis] = useState<string[]>(preselection.slice(0, PLAFOND_ANALYSE))
  const [prixUnitaire, setPrixUnitaire] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('mes-annonces')
  /** L'annonce survolée et l'endroit où sa carte s'ouvre, en coordonnées d'écran. */
  const [survol, setSurvol] = useState<{ produit: Produit; x: number; y: number } | null>(null)

  useEffect(() => {
    api.listProducts().then((p) => setProduits(Array.isArray(p) ? (p as Produit[]) : [])).catch(() => undefined)
    api
      .listCategories()
      // Une reponse d'une autre forme vide le selecteur ; elle ne doit pas
      // emporter la page d'analyses avec elle.
      .then((r) => setCatalogue(Array.isArray(r?.categories) ? r.categories : []))
      .catch(() => undefined)
    // Le tarif vient du serveur, jamais recopié ici : un prix faux affiché
    // d'avance est pire qu'un prix absent.
    api
      .listPlans()
      .then((p) => setPrixUnitaire(typeof p.tarifs?.analyse === 'number' ? p.tarifs.analyse : null))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  const nom = (p: Produit) => p.aiTitle || p.title || 'Sans titre'

  /*
   * Seules les catégories réellement présentes au catalogue sont proposées, avec
   * leur nombre d'annonces : dérouler deux cent vingt-quatre sous-catégories dont
   * trois sont utilisées ne choisit rien.
   */
  const categoriesUtilisees = useMemo(() => {
    const compte = new Map<string, number>()
    for (const p of produits) {
      if (p.categoryId) compte.set(p.categoryId, (compte.get(p.categoryId) ?? 0) + 1)
    }
    const labels = new Map(catalogue.map((c) => [c.id, c.label]))
    const liste = [...compte.entries()].map(([id, n]) => ({ id, label: labels.get(id) ?? id, n }))
    return liste.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [produits, catalogue])

  /** Les annonces sans catégorie : sans cette entrée, elles seraient inatteignables. */
  const sansRayon = useMemo(() => produits.filter((p) => !p.categoryId).length, [produits])

  const filtres = useMemo(() => {
    if (!categorie) return []
    const terme = recherche.trim().toLowerCase()
    return produits
      .filter((p) => (categorie === 'sans-rayon' ? !p.categoryId : p.categoryId === categorie))
      .filter((p) => (terme ? nom(p).toLowerCase().includes(terme) : true))
  }, [produits, categorie, recherche])

  const complet = choisis.length >= PLAFOND_ANALYSE

  function basculer(id: string) {
    setChoisis((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id)
      if (c.length >= PLAFOND_ANALYSE) return c
      return [...c, id]
    })
  }

  /**
   * Où ouvrir l'aperçu : à droite de la ligne, rabattu contre le bord de la
   * fenêtre. Posé en fixe dans un portail — la liste défile, et une boîte à
   * `overflow` découpe tout ce qu'un enfant dépasse.
   */
  function montrer(p: Produit, ligne: HTMLElement) {
    const r = ligne.getBoundingClientRect()
    const LARGEUR = 320
    const HAUTEUR = 260
    const x = Math.max(8, Math.min(r.right + 12, window.innerWidth - LARGEUR - 8))
    const y = Math.max(8, Math.min(r.top, window.innerHeight - HAUTEUR - 8))
    setSurvol({ produit: p, x, y })
  }

  const total = prixUnitaire === null ? null : prixUnitaire * choisis.length

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-base font-bold">
        Qu'est-ce que vous voulez analyser, un ou plusieurs de vos produits ?
      </h2>
      <p className="mt-1 text-xs text-gray-400">
        Choisissez une catégorie, cochez jusqu'à {PLAFOND_ANALYSE} annonces, et lancez. Ou analysez
        un produit que vous n'avez pas encore importé.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <BoutonMode
          actif={mode === 'mes-annonces'}
          icone={Boxes}
          titre="Mes annonces"
          detail="Une annonce déjà importée — son prix d'achat et son prix de vente sont connus."
          onClick={() => setMode('mes-annonces')}
        />
        <BoutonMode
          actif={mode === 'libre'}
          icone={Globe}
          titre="Un produit non importé"
          detail="Un produit, une niche, une idée : analysez avant d'acheter un catalogue."
          onClick={() => setMode('libre')}
        />
      </div>

      {mode === 'libre' ? null : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-gray-300" htmlFor="analyse-categorie">
              Catégorie
              <span className="ml-1 text-red-300">*</span>
            </label>
            <select
              id="analyse-categorie"
              value={categorie}
              onChange={(e) => {
                setCategorie(e.target.value)
                setRecherche('')
              }}
              className="min-w-[14rem] flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
            >
              <option value="" className="bg-[#1b1633]">
                Choisissez une catégorie…
              </option>
              {categoriesUtilisees.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#1b1633]">
                  {`${c.label} (${c.n})`}
                </option>
              ))}
              {sansRayon > 0 && (
                <option value="sans-rayon" className="bg-[#1b1633]">
                  {`Sans catégorie (${sansRayon})`}
                </option>
              )}
            </select>
          </div>

          {!categorie ? (
            <p className="mt-3 text-xs text-gray-500">
              {produits.length
                ? 'La liste de vos annonces se déplie dès que la catégorie est choisie.'
                : "Aucune annonce au catalogue : importez un produit, ou analysez un produit non importé ci-dessus."}
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <Search size={14} className="shrink-0 text-gray-500" />
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Chercher dans cette catégorie…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
                />
                <span className="shrink-0 text-[11px] text-gray-500">
                  {`${choisis.length}/${PLAFOND_ANALYSE} sélectionné(s)`}
                </span>
              </div>

              <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-1.5">
                {filtres.map((p) => {
                  const coche = choisis.includes(p.id)
                  const photo = photosProduit(p)[0]
                  return (
                    <label
                      key={p.id}
                      onMouseEnter={(e) => montrer(p, e.currentTarget)}
                      onMouseLeave={() => setSurvol(null)}
                      className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm ${
                        coche ? 'bg-purple-500/10' : 'hover:bg-white/5'
                      } ${!coche && complet ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={coche}
                        disabled={!coche && complet}
                        onChange={() => basculer(p.id)}
                        className="accent-purple-500"
                      />
                      {photo ? (
                        <img
                          src={assetUrl(photo)}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-black/30 text-[9px] text-gray-500">
                          —
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-gray-200">{nom(p)}</span>
                      <span className="shrink-0 tabular-nums text-[11px] text-gray-400">
                        {eurosProduit(p.sellingPrice, p.currency)}
                      </span>
                    </label>
                  )
                })}
                {!filtres.length && (
                  <p className="px-1.5 py-3 text-xs text-gray-500">
                    {recherche
                      ? 'Aucune annonce de cette catégorie ne porte ces mots.'
                      : 'Aucune annonce dans cette catégorie.'}
                  </p>
                )}
              </div>

              {complet && (
                <p className="mt-2 text-[11px] text-amber-200">
                  {`${PLAFOND_ANALYSE} produits au maximum par passage : décochez-en un pour en choisir un autre.`}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onLancer(choisis)}
                  disabled={enCours || !choisis.length}
                  className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40"
                >
                  {enCours ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>
                    {enCours
                      ? 'Analyse en cours…'
                      : `Lancer l'analyse${choisis.length ? ` (${choisis.length})` : ''}`}
                  </span>
                </button>
                {total !== null && (
                  <span className="text-xs text-amber-200">
                    {`${prixUnitaire} drops par produit${choisis.length ? ` — ${total} drops` : ''}`}
                  </span>
                )}
                {choisis.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChoisis([])}
                    className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-200"
                  >
                    Tout décocher
                  </button>
                )}
              </div>

              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-500">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-300" />
                <span>
                  Une annonce déjà analysée est rendue telle quelle, sans être repayée. Survolez une
                  ligne pour revoir sa photo, son prix et sa marge.
                </span>
              </p>
            </>
          )}
        </>
      )}

      {survol
        ? createPortal(
            <div className="pointer-events-none fixed z-50" style={{ left: survol.x, top: survol.y }}>
              <ApercuProduit product={survol.produit} />
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

export type Mode = 'mes-annonces' | 'libre'

function BoutonMode({
  actif,
  icone: Icone,
  titre,
  detail,
  onClick,
}: {
  actif: boolean
  icone: typeof Boxes
  titre: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`rounded-xl border p-3 text-left transition ${
        actif
          ? 'border-purple-400/60 bg-purple-500/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icone size={15} className={actif ? 'text-purple-300' : 'text-gray-400'} />
        {titre}
      </span>
      <span className="mt-1 block text-[11px] leading-relaxed text-gray-400">{detail}</span>
    </button>
  )
}
