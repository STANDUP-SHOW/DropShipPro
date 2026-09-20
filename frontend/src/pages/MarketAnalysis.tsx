import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TrendingUp, ExternalLink, Loader2, ArrowLeft, Info, Newspaper } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { ReportList } from '../components/ReportList'
import { StudioAnalyses } from '../components/StudioAnalyses'
import { AnalysesRapports } from '../components/AnalysesRapports'
import { SelectionAnalyse, PLAFOND_ANALYSE, type Mode } from '../components/SelectionAnalyse'
import { api } from '../lib/api'

type Result = Awaited<ReturnType<typeof api.marketAnalysis>>['results'][number]

const euro = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)

const COMPETITION_STYLE: Record<string, string> = {
  faible: 'bg-emerald-500/20 text-emerald-300',
  moyenne: 'bg-yellow-500/20 text-yellow-300',
  forte: 'bg-red-500/20 text-red-300',
}

/**
 * Market analysis for the listings selected in the catalogue.
 *
 * Ids arrive through router state rather than the URL: a hundred ids would not
 * fit in a query string, and this page is never meant to be bookmarked.
 *
 * **Et la page sait désormais choisir elle-même.** Elle ne savait travailler que
 * sur une sélection venue de « Mes annonces » : ouverte depuis le menu, elle
 * n'offrait rien pour analyser une annonce déjà importée. Le bloc de sélection
 * (catégorie obligatoire, puis les annonces de cette catégorie) est en tête ;
 * l'arrivée par « Mes annonces » continue de lancer l'analyse toute seule.
 */
export default function MarketAnalysisPage() {
  const location = useLocation()
  const selection = (location.state as { productIds?: string[] } | null)?.productIds ?? []

  /*
   * Cinq produits par passage au maximum (07/09/2026).
   *
   * Chaque produit lance un vrai appel modèle + des recherches web : c'est le
   * geste le plus coûteux de l'app. Le serveur refuse au-delà de cinq ; on
   * plafonne ici pour que le vendeur reçoive une analyse plutôt qu'une erreur,
   * et on lui dit combien ont été laissées de côté.
   */
  const productIds = selection.slice(0, PLAFOND_ANALYSE)
  const laissees = selection.length - productIds.length

  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('mes-annonces')
  const started = useRef(false)

  const lancer = useCallback((ids: string[]) => {
    if (!ids.length) return
    setRunning(true)
    setError(null)
    api
      .marketAnalysis(ids)
      .then((data) => setResults(Array.isArray(data?.results) ? data.results : []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Analyse impossible'))
      .finally(() => setRunning(false))
  }, [])

  useEffect(() => {
    // Guard against the double invocation React does in development: each run
    // spends credits, so a second one is not acceptable.
    if (started.current || productIds.length === 0) return
    started.current = true
    lancer(productIds)
  }, [productIds, lancer])

  return (
    <Layout>
      <BlocSection id="marche" />

      {/* MCP Info Block */}
      <div className="mb-6 max-w-2xl rounded-2xl border border-white/10 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-blue-500/10 p-6 overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-purple-300"
            >
              <rect x="8" y="8" width="48" height="48" rx="8" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="2" />
              <circle cx="24" cy="24" r="4" fill="currentColor" />
              <circle cx="40" cy="24" r="4" fill="currentColor" />
              <circle cx="32" cy="40" r="4" fill="currentColor" />
              <line x1="24" y1="28" x2="32" y2="36" stroke="currentColor" strokeWidth="2" />
              <line x1="40" y1="28" x2="32" y2="36" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Model Context Protocol</h3>
            <p className="text-sm text-gray-300 mt-1">
              Les analyses de marché utilisent le protocole MCP pour accéder à vos données en toute sécurité
            </p>
          </div>
        </div>
      </div>

      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={15} />
        <span>Retour à mes annonces</span>
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <TrendingUp className="text-purple-300" size={24} />
        <span>Analyses de marché</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Quatre façons de regarder un marché <b>avant</b> de publier : qui vend déjà, qui fait de la
        publicité, quelles boutiques occupent la niche, et lequel de vos fournisseurs est le moins
        cher sur la même référence.
      </p>

      {laissees > 0 && (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {`L'analyse se fait par 5 au maximum : les ${PLAFOND_ANALYSE} premières annonces sont traitées ici. Resélectionnez les ${laissees} restante(s) pour un second passage.`}
        </p>
      )}

      {/*
        Le choix de ce qu'on analyse, en tête.

        **Cette page était un cul-de-sac quand on l'ouvrait depuis le menu** :
        elle ne savait travailler que sur une sélection d'annonces venue de
        « Mes annonces », et sans sélection elle n'affichait qu'un message
        expliquant qu'il fallait aller ailleurs. Les deux gestes se posent
        maintenant ici : une annonce du catalogue, ou un sujet libre — on
        analyse souvent AVANT d'importer, sinon on paie un catalogue pour
        découvrir ensuite que la niche est saturée.
      */}
      <SelectionAnalyse
        onLancer={lancer}
        enCours={running}
        preselection={productIds}
        onModeChange={setMode}
      />

      {mode === 'libre' && <StudioAnalyses />}

      {/*
        Les analyses quotidiennes des agents, toutes catégories (19/09/2026).

        Elles arrivent chaque matin, une par rayon, et elles n'avaient jusqu'ici
        qu'une seule vitrine : Fresh news, qui en montre une à la fois, celle du
        jour. Ici c'est la lecture inverse — la liste par date, qu'on déplie —
        et c'est la même table, filtrable par rayon.
      */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-bold">
          <Newspaper size={16} className="text-emerald-400" />
          <span>Les analyses du jour, rayon par rayon</span>
        </h2>
        <p className="mt-1 max-w-3xl text-xs text-gray-500">
          Une analyse par rayon et par jour, écrite par les agents. Cliquez une ligne pour la lire ;
          la liste des vingt produits qu'elle porte s'importe depuis l'analyse elle-même.
        </p>
        <AnalysesRapports type="rayon" avecFiltreCategorie />
      </section>

      {running && (
        <div className="mt-6 rounded-xl border border-purple-400/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-purple-300 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium">
                Analyse en cours — laissez cette page ouverte
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                L'agent cherche sur le web pour chaque produit. Comptez une trentaine de secondes
                par annonce.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}

      <div className="mt-6 space-y-4">
        {results.map((result) => {
          const a = result.analysis
          return (
            <article key={result.productId} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link to={`/products/${result.productId}`} className="font-semibold hover:text-purple-300">
                  {result.title}
                </Link>
                {a?.competition && (
                  <span className={`rounded-full px-2.5 py-1 text-xs ${COMPETITION_STYLE[a.competition] ?? 'bg-gray-500/20 text-gray-300'}`}>
                    {`Concurrence ${a.competition}`}
                  </span>
                )}
              </div>

              {result.error && <p className="mt-2 text-sm text-red-400">{result.error}</p>}

              {a && (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-gray-200">{a.verdict}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <p className="text-xs text-gray-500">Prix constatés</p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {a.priceLow === null && a.priceHigh === null
                          ? '—'
                          : `${euro(a.priceLow)} à ${euro(a.priceHigh)}`}
                      </p>
                    </div>
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <p className="text-xs text-gray-500">Prix conseillé</p>
                      <p className="mt-0.5 text-sm font-semibold text-purple-200">{euro(a.suggestedPrice)}</p>
                    </div>
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <p className="text-xs text-gray-500">Livraison</p>
                      <p className="mt-0.5 text-sm font-semibold">{a.deliveryTime ?? '—'}</p>
                    </div>
                    <div className="rounded-lg bg-black/20 px-3 py-2">
                      <p className="text-xs text-gray-500">Provenance</p>
                      <p className="mt-0.5 text-sm font-semibold">{a.origin ?? '—'}</p>
                    </div>
                  </div>

                  {a.reasoning && (
                    <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-300">
                      {a.reasoning}
                    </p>
                  )}

                  {/* Une analyse peut revenir sans relevé ni source — un
                      fournisseur muet, une recherche vide. Lire .length
                      dessus faisait tomber toute la page (20/09/2026). */}
                  {(a.findings ?? []).length > 0 && (
                    <>
                      <h3 className="mt-5 text-sm font-semibold">Déjà en vente sur</h3>
                      <div className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10">
                        {(a.findings ?? []).map((f, i) => (
                          <div key={`${f.marketplace}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-gray-300">{f.marketplace}</span>
                            <span className="flex items-center gap-3">
                              <span className="font-semibold">{euro(f.price)}</span>
                              {f.url && (
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-purple-300 hover:underline"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {(a.sources ?? []).length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs text-purple-300">
                        {`Sources consultées (${(a.sources ?? []).length})`}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {(a.sources ?? []).map((s) => (
                          <li key={s} className="truncate text-xs text-gray-500">
                            <a href={s} target="_blank" rel="noreferrer" className="hover:text-gray-300">
                              {s}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </article>
          )
        })}
      </div>

      {results.length > 0 && (
        <p className="mt-8 flex gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-gray-400">
          <Info size={14} className="mt-0.5 shrink-0 text-purple-300" />
          <span>
            Ces prix sont des observations relevées sur le web au moment de l'analyse, pas un
            relevé officiel. Vérifiez avant de fixer un prix définitif — les sources sont données
            pour ça.
          </span>
        </p>
      )}

      {/* Toutes les analyses consignées : celles des chefs de rayon en
          IA AUTO-MODE et celles lancées depuis Mes annonces (nommées
          produits-date-utilisateur). Même table que la rubrique « Mes
          analyses » de chaque rayon — une écriture, deux vitrines. */}
      <section className="mt-10">
        <h2 className="font-bold">Mes analyses</h2>
        <p className="mt-1 text-xs text-gray-500">
          Les analyses rédigées par vos chefs de rayon en IA AUTO-MODE, et celles lancées depuis
          vos annonces. Cliquez une ligne pour la lire, l'exporter ou la partager.
        </p>
        <ReportList section="MARKET" triable />
      </section>
    </Layout>
  )
}
