import { useEffect, useState } from 'react'
import { Store, Share2, Sparkles, Rocket, Search, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

/**
 * Les demandes d'analyse pré-formatées et tarifées d'un chef de rayon.
 *
 * Voulues le 10/09/2026 : à côté du chat libre (dont le montant s'ajuste à la
 * question), de vraies demandes cadrées, avec leur prix affiché d'avance —
 * analyse marché ou réseaux sociaux sur des produits de mes annonces, et
 * extraction de produits gagnants (avec ou sans publication).
 */

type Produit = { id: string; aiTitle?: string | null; title?: string | null }
type Resultat = { productId: string; titre: string; texte: string }

const ARC_EN_CIEL = 'linear-gradient(90deg,#eab308,#84cc16,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)'

export function DemandesAnalyse({ departmentId, agentName }: { departmentId: string; agentName: string }) {
  const [produits, setProduits] = useState<Produit[]>([])
  const [recherche, setRecherche] = useState('')
  const [choisis, setChoisis] = useState<string[]>([])
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState<string | null>(null)
  const [resultats, setResultats] = useState<{ titre: string; lignes: Resultat[] } | null>(null)
  const [extraction, setExtraction] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    api.listProducts().then((p) => setProduits(p as Produit[])).catch(() => undefined)
  }, [])

  const nom = (p: Produit) => p.aiTitle || p.title || 'Sans titre'
  const filtres = produits.filter((p) => nom(p).toLowerCase().includes(recherche.toLowerCase().trim()))

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
      setResultats({ titre: type === 'sociale' ? 'Analyse réseaux sociaux' : 'Analyse de marché', lignes: r.results })
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
        <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
          {filtres.slice(0, 60).map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-white/5">
              <input type="checkbox" checked={choisis.includes(p.id)} onChange={() => basculer(p.id)} className="accent-purple-500" />
              <span className="truncate text-gray-200">{nom(p)}</span>
            </label>
          ))}
          {!filtres.length && <p className="px-1.5 py-2 text-xs text-gray-500">Aucun produit dans vos annonces.</p>}
        </div>
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
          detail="Suggestions d'annonces qui marcheraient, Facebook Ad Library, TikTok Shop."
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
          Analyse complète marché + social (tendances, algorithmes, années précédentes, calendrier
          des fêtes commerciales : soldes, Black Friday, Noël, été, Pâques, fête des mères/pères…),
          puis extraction de gagnants archivés dans « Produits gagnants ».
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
          nécessite l'Auto-Shipper activé.
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
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-300">{l.texte}</p>
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
