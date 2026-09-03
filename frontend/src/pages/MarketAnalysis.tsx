import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TrendingUp, ExternalLink, Loader2, ArrowLeft, Info } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
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
 */
export default function MarketAnalysisPage() {
  const location = useLocation()
  const productIds = (location.state as { productIds?: string[] } | null)?.productIds ?? []

  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // Guard against the double invocation React does in development: each run
    // spends credits, so a second one is not acceptable.
    if (started.current || productIds.length === 0) return
    started.current = true

    setRunning(true)
    api
      .marketAnalysis(productIds)
      .then((data) => setResults(data.results))
      .catch((err) => setError(err instanceof Error ? err.message : 'Analyse impossible'))
      .finally(() => setRunning(false))
  }, [productIds])

  return (
    <Layout>
      <BlocSection id="marche" />
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={15} />
        <span>Retour à mes annonces</span>
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <TrendingUp className="text-purple-300" size={24} />
        <span>Analyse de marché</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Où vos produits se vendent déjà, à quel prix, expédiés d'où et en combien de temps.
      </p>

      {productIds.length === 0 && (
        <p className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
          Aucune annonce sélectionnée. Retournez à vos annonces, cochez celles à analyser, puis
          cliquez « Analyse de marché IA ».
        </p>
      )}

      {running && (
        <div className="mt-6 rounded-xl border border-purple-400/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-purple-300 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium">
                {`Analyse de ${productIds.length} produit(s) en cours — laissez cette page ouverte`}
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

                  {a.findings.length > 0 && (
                    <>
                      <h3 className="mt-5 text-sm font-semibold">Déjà en vente sur</h3>
                      <div className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10">
                        {a.findings.map((f, i) => (
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

                  {a.sources.length > 0 && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs text-purple-300">
                        {`Sources consultées (${a.sources.length})`}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {a.sources.map((s) => (
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
    </Layout>
  )
}
