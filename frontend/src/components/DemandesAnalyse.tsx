import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Share2, Sparkles, Rocket, Search, Loader2, ExternalLink, Megaphone } from 'lucide-react'
import { createPortal } from 'react-dom'
import { api, assetUrl } from '../lib/api'
import { ApercuProduit, photosProduit, eurosProduit, type ProduitApercu } from './ApercuProduit'

/** La Facebook Ad Library, en direct, pour un produit — les vraies pubs qui tournent. */
function lienAdLibrary(titre: string) {
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=FR&q=${encodeURIComponent(titre)}&media_type=all`
}
/** TikTok : les contenus qui tournent sur le sujet. */
function lienTikTok(titre: string) {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(titre)}`
}

/**
 * Les demandes d'analyse pré-formatées et tarifées d'un chef de rayon.
 *
 * Voulues le 10/09/2026 : à côté du chat libre (dont le montant s'ajuste à la
 * question), de vraies demandes cadrées, avec leur prix affiché d'avance —
 * analyse marché ou réseaux sociaux sur des produits de mes annonces, et
 * extraction de produits gagnants (avec ou sans publication).
 */

type Produit = ProduitApercu & { createdAt?: string; categoryId?: string | null }
type PrixMarche = {
  devise: string
  min: number | null
  median: number | null
  max: number | null
  releves: Array<{ source: string; prix: number }>
}
type Resultat = { productId: string; titre: string; texte: string; prix?: PrixMarche }

const eur = (n: number | null) => (n === null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const ARC_EN_CIEL = 'linear-gradient(90deg,#eab308,#84cc16,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)'

export function DemandesAnalyse({
  departmentId,
  departmentKey,
  agentName,
}: {
  departmentId: string
  /** La clé du rayon : elle décide des annonces que ce chef peut analyser. */
  departmentKey: string
  agentName: string
}) {
  const [produits, setProduits] = useState<Produit[]>([])
  const [recherche, setRecherche] = useState('')
  const [choisis, setChoisis] = useState<string[]>([])
  /** L'annonce survolée et l'endroit où sa carte s'ouvre, en coordonnées d'écran. */
  const [survol, setSurvol] = useState<{ produit: Produit; x: number; y: number } | null>(null)
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState<string | null>(null)
  const [resultats, setResultats] = useState<{ type: 'marche' | 'sociale'; titre: string; lignes: Resultat[] } | null>(null)
  const [extraction, setExtraction] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  /**
   * Les catégories de CE rayon.
   *
   * Un chef de rayon n'analyse que ce qui le regarde : proposer tout le
   * catalogue à Camille, qui tient la mode, revenait à lui faire payer une
   * analyse de perceuse qu'elle n'a aucune raison de savoir lire.
   */
  const [categoriesDuRayon, setCategoriesDuRayon] = useState<Set<string> | null>(null)
  /** La soupape : un produit sans catégorie n'appartient à aucun rayon. */
  const [toutLeCatalogue, setToutLeCatalogue] = useState(false)

  useEffect(() => {
    api.listProducts().then((p) => setProduits(p as Produit[])).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!departmentKey) return
    api
      .listCategories({ sector: departmentKey })
      .then((r) => setCategoriesDuRayon(new Set(r.categories.map((c) => c.id))))
      // Sans le référentiel, mieux vaut tout montrer que ne rien montrer : le
      // vendeur garde la main, il ne se retrouve pas devant une liste vide sans
      // savoir pourquoi.
      .catch(() => setCategoriesDuRayon(null))
  }, [departmentKey])

  const nom = (p: Produit) => p.aiTitle || p.title || 'Sans titre'
  const duRayon = (p: Produit) =>
    !categoriesDuRayon || toutLeCatalogue ? true : Boolean(p.categoryId && categoriesDuRayon.has(p.categoryId))
  const filtres = produits
    .filter(duRayon)
    .filter((p) => nom(p).toLowerCase().includes(recherche.toLowerCase().trim()))
  /** Ce que le filtre par rayon met de côté : dit, jamais caché en silence. */
  const horsRayon = categoriesDuRayon && !toutLeCatalogue ? produits.filter((p) => !duRayon(p)).length : 0

  /**
   * Où ouvrir l'aperçu : à droite de la ligne, rabattu à gauche quand la
   * fenêtre est trop étroite, et remonté quand la carte dépasserait en bas.
   */
  function montrer(id: string, ligne: HTMLElement) {
    const p = produits.find((x) => x.id === id)
    if (!p) return
    const r = ligne.getBoundingClientRect()
    const LARGEUR = 320
    const HAUTEUR = 260
    /*
     * À droite de la ligne, et rabattue contre le bord droit de la fenêtre
     * quand elle n'y tient pas — pas à gauche : la carte atterrissait alors
     * par-dessus le menu, à un écran de la ligne survolée.
     */
    const x = Math.max(8, Math.min(r.right + 12, window.innerWidth - LARGEUR - 8))
    const y = Math.max(8, Math.min(r.top, window.innerHeight - HAUTEUR - 8))
    setSurvol({ produit: p, x, y })
  }

  function basculer(id: string) {
    setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  async function analyser(type: 'marche' | 'sociale') {
    if (!choisis.length) {
      setErreur('Sélectionnez au moins un produit de vos annonces.')
      return
    }
    setBusy(type)
    setErreur(null)
    setResultats(null)
    try {
      const r = await api.analyseProduits(departmentId, type, choisis)
      setResultats({ type, titre: type === 'sociale' ? 'Analyse réseaux sociaux' : 'Analyse de marché', lignes: r.results })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Analyse impossible')
    } finally {
      setBusy(null)
    }
  }

  async function extraire(publier: boolean) {
    setBusy(publier ? 'publier' : 'extraire')
    setErreur(null)
    setExtraction(null)
    try {
      const r = await api.extractionGagnants(departmentId, count, publier)
      const bout = r.publication
        ? ` ${r.publication.imported} importé(s), ${r.publication.published} publié(s).`
        : ''
      setExtraction(`${r.deposees} produit(s) gagnant(s) archivé(s) dans « Produits gagnants ».${bout}${r.note ? ' ' + r.note : ''}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Extraction impossible')
    } finally {
      setBusy(null)
    }
  }

  const nbChoisis = choisis.length

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Sparkles size={18} className="text-purple-300" />
        <span>Demandes d'analyse à {agentName}</span>
      </h2>
      <p className="mt-1 text-xs text-gray-400">
        Des analyses cadrées, au prix affiché d'avance. Pour discuter librement, utilisez le chat
        ci-dessous — le montant s'y ajuste à votre question.
      </p>

      {/* Le sélecteur de produits, partagé par les deux analyses par produit. */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-gray-500" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un produit de mes annonces…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
          />
          <span className="text-[11px] text-gray-500">{nbChoisis} sélectionné(s)</span>
        </div>

        {horsRayon || toutLeCatalogue ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>
              {toutLeCatalogue
                ? 'Toutes vos annonces, y compris celles des autres rayons.'
                : `Les annonces de ce rayon seulement — ${horsRayon} autre(s) mise(s) de côté.`}
            </span>
            <button
              type="button"
              onClick={() => setToutLeCatalogue((v) => !v)}
              className="underline underline-offset-2 hover:text-gray-300"
            >
              {toutLeCatalogue ? 'Revenir à ce rayon' : 'Tout mon catalogue'}
            </button>
          </p>
        ) : null}
        <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
          {filtres.slice(0, 60).map((p) => {
            const photo = photosProduit(p)[0]
            return (
              <label
                key={p.id}
                onMouseEnter={(e) => montrer(p.id, e.currentTarget)}
                onMouseLeave={() => setSurvol(null)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={choisis.includes(p.id)}
                  onChange={() => basculer(p.id)}
                  className="accent-purple-500"
                />
                {photo ? (
                  <img src={assetUrl(photo)} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md object-cover" />
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
          {!filtres.length && <p className="px-1.5 py-2 text-xs text-gray-500">
              {categoriesDuRayon && !toutLeCatalogue
                ? 'Aucune de vos annonces n\'est rangée dans ce rayon.'
                : 'Aucun produit dans vos annonces.'}
            </p>}
        </div>

        {/*
          L'aperçu est posé en fixe, dans un portail, et non en absolu sous la
          ligne : la liste défile, et une boîte à `overflow` découpe tout ce
          qu'un enfant dépasse — la carte serait sortie coupée en deux.
        */}
        {survol
          ? createPortal(
              <div
                className="pointer-events-none fixed z-50"
                style={{ left: survol.x, top: survol.y }}
              >
                <ApercuProduit product={survol.produit} />
              </div>,
              document.body,
            )
          : null}
      </div>

      {/* Les deux analyses par produit. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Carte
          icone={Store}
          titre="Analyse de marché"
          detail="Places de marché, annonces en ligne, vendus, consultés, prix de vente constaté."
          tarif={`30 drops / produit${nbChoisis ? ` — ${30 * nbChoisis} drops` : ''}`}
          bouton={busy === 'marche' ? 'Analyse…' : 'Analyser le marché'}
          occupe={busy === 'marche'}
          onClick={() => analyser('marche')}
        />
        <Carte
          icone={Share2}
          titre="Analyse réseaux sociaux"
          detail="Suggestions d'annonces qui marcheraient, Facebook Ad Library, TikTok Shop. Intégrer une annonce suggérée se fait au tarif d'import habituel."
          tarif={`30 drops / produit${nbChoisis ? ` — ${30 * nbChoisis} drops` : ''}`}
          bouton={busy === 'sociale' ? 'Analyse…' : 'Analyser le social'}
          occupe={busy === 'sociale'}
          onClick={() => analyser('sociale')}
        />
      </div>

      {/* L'extraction de produits gagnants, avec le curseur multicolore. */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-amber-300" />
          <h3 className="text-sm font-bold">Extraction de produits gagnants</h3>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
          Analyse complète : fournisseurs, places de marché et social (tendances, algorithmes, années
          précédentes, calendrier des fêtes commerciales — soldes, Black Friday, Noël, été, Pâques,
          fête des mères/pères…), puis extraction de gagnants archivés dans « Produits gagnants »,
          chacun avec le lien vers sa fiche chez le fournisseur.
        </p>

        <div className="mt-3 flex items-baseline justify-between">
          <label className="text-sm font-semibold">Nombre de produits voulus</label>
          <span className="text-2xl font-black text-amber-400">{count}</span>
        </div>
        <div className="relative mt-2">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full" style={{ background: ARC_EN_CIEL }} />
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="relative h-6 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
          />
        </div>
        <div className="mt-1 flex justify-between px-0.5 text-[10px] text-gray-500">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => extraire(false)}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {busy === 'extraire' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>Extraire — {5 * count} drops</span>
          </button>
          <button
            type="button"
            onClick={() => extraire(true)}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 via-cyan-400 to-yellow-300 px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {busy === 'publier' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            <span>Extraire &amp; publier — {6 * count} drops</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Publier ajoute le coût d'import habituel par annonce (scraping, description, mots-clés…) et
          nécessite l'Auto-SHIPPER IA activé.
        </p>
        {extraction ? <p className="mt-2 text-xs text-emerald-200">{extraction}</p> : null}
      </div>

      {erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}

      {/* Les résultats des analyses par produit. */}
      {resultats ? (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-bold text-purple-200">{resultats.titre}</h3>
          {resultats.lignes.map((l) => (
            <div key={l.productId} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-gray-100">{l.titre}</p>

              {/* Le prix marché constaté, relevé en direct (analyse marché). */}
              {resultats.type === 'marche' && l.prix && l.prix.releves.length ? (
                <div className="mt-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-2">
                  <p className="text-[11px] font-semibold text-emerald-200">
                    Prix marché constaté : {eur(l.prix.min)} – {eur(l.prix.max)} €
                    {l.prix.median !== null ? (
                      <>
                        {' '}· médian <b>{eur(l.prix.median)} €</b>
                      </>
                    ) : null}
                    <span className="text-gray-400"> · {l.prix.releves.length} relevé(s)</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {l.prix.releves.map((r, i) => (
                      <span key={i} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-300">
                        {r.source} <b className="text-gray-100">{eur(r.prix)} €</b>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-300">{l.texte}</p>

              {/* Pour l'analyse sociale : les vraies pubs en direct + l'intégration
                  d'une annonce dans Mes pubs (au tarif pub habituel). */}
              {resultats.type === 'sociale' ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={lienAdLibrary(l.titre)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-white/5"
                  >
                    <span>Facebook Ad Library</span>
                    <ExternalLink size={11} />
                  </a>
                  <a
                    href={lienTikTok(l.titre)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-300 hover:bg-white/5"
                  >
                    <span>TikTok</span>
                    <ExternalLink size={11} />
                  </a>
                  <Link
                    to={`/products/${l.productId}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-fuchsia-500 to-amber-300 px-2.5 py-1 text-[11px] font-bold text-black hover:brightness-110"
                  >
                    <Megaphone size={11} />
                    <span>Intégrer dans Mes pubs</span>
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function Carte({
  icone: Icone,
  titre,
  detail,
  tarif,
  bouton,
  occupe,
  onClick,
}: {
  icone: typeof Store
  titre: string
  detail: string
  tarif: string
  bouton: string
  occupe: boolean
  onClick: () => void
}) {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2">
        <Icone size={16} className="text-sky-300" />
        <h3 className="text-sm font-bold">{titre}</h3>
      </div>
      <p className="mt-1 flex-1 text-[11px] leading-relaxed text-gray-400">{detail}</p>
      <p className="mt-2 text-[11px] font-semibold text-amber-200">{tarif}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={occupe}
        className="btn-gradient mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {occupe ? <Loader2 size={14} className="animate-spin" /> : null}
        <span>{bouton}</span>
      </button>
    </div>
  )
}
