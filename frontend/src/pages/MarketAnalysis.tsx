import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExternalLink, Loader2, Info, ArrowUpRight, Globe } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { ReportList } from '../components/ReportList'
import { StudioAnalyses } from '../components/StudioAnalyses'
import { Markdown } from '../components/Markdown'
import { ListeProduitsRapport } from '../components/ListeProduitsRapport'
import { PageCreative, Entete, Fenetre } from '../components/creative/Creative'
import { GrilleRapports, Provenance, dateLongue, liste, pagePublique, type LigneRapport } from '../components/creative/Veille'
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
  const etude = useRef<HTMLElement>(null)

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
      <PageCreative>
        <Entete
          surtitre="08 / Analyses de marché"
          ligne1="Avant de publier."
          ligne2="Prenez de l'avance."
          chapo="Concurrents, publicités, boutiques et fournisseurs : choisissez ce que vous souhaitez comprendre avant de passer à l'action."
        />

        <div className="v-deux mt-8">
          <div className="v-affiche-marche" aria-hidden>
            <span className="c-etiquette relative !text-[#3e2220]">DropShipper / Intelligence</span>
            <strong>
              LOOK
              <br />
              AHEAD.
            </strong>
            <span className="v-etoile">✳</span>
            <span className="c-etiquette relative !text-[#3e2220]">Observer → Comparer → Décider</span>
          </div>

          <div className="v-carte flex flex-col gap-4">
            <p className="c-etiquette !text-[var(--c-lime)]">Votre prochaine étude</p>
            <p className="text-2xl font-semibold leading-tight">
              Un produit.
              <br />
              Quatre perspectives.
            </p>
            <div className="v-perspectives">
              {PERSPECTIVES.map((q, i) => (
                <button key={q} type="button" onClick={() => etude.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <b>{String(i + 1).padStart(2, '0')}</b>
                  <span>{q}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-[var(--c-texte-2)]">
              {`À partir d'une annonce importée ou d'une idée de produit. Jusqu'à ${PLAFOND_ANALYSE} annonces par passage. Les analyses passent par le protocole MCP pour accéder à vos données en toute sécurité.`}
            </p>
          </div>
        </div>

        {laissees > 0 && (
          <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {`L'analyse se fait par 5 au maximum : les ${PLAFOND_ANALYSE} premières annonces sont traitées ici. Resélectionnez les ${laissees} restante(s) pour un second passage.`}
          </p>
        )}

        {/*
          Le choix de ce qu'on analyse : une annonce du catalogue, ou un sujet
          libre — on analyse souvent AVANT d'importer, sinon on paie un
          catalogue pour découvrir ensuite que la niche est saturée.
        */}
        <section ref={etude} className="mt-12 scroll-mt-24">
          <h2 className="c-h2">Préparer une étude</h2>
          <div className="v-outil mt-4">
            <SelectionAnalyse onLancer={lancer} enCours={running} preselection={productIds} onModeChange={setMode} />
            {mode === 'libre' && <StudioAnalyses />}
          </div>
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

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
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

        {/*
          Les analyses quotidiennes des agents, toutes catégories : une par
          rayon et par jour. La grille montre les plus récentes ; une carte
          ouvre le rapport, sa liste de produits et sa page publique.
        */}
        <RapportsAuPremierPlan />

        {/* Toutes les analyses consignées : celles des chefs de rayon en
            IA AUTO-MODE et celles lancées depuis Mes annonces. Même table que
            la rubrique « Mes analyses » de chaque rayon. */}
        <section className="mt-12">
          <h2 className="c-h2">Mes analyses</h2>
          <p className="mt-1 text-xs text-[var(--c-texte-2)]">
            Les analyses rédigées par vos chefs de rayon en IA AUTO-MODE, et celles lancées depuis vos annonces. Cliquez une ligne pour la
            lire, l'exporter ou la partager.
          </p>
          <div className="v-outil mt-4">
            <ReportList section="MARKET" triable />
          </div>
        </section>

        <Provenance texte="Analyses des agents et de vos chefs de rayon" libelle="Toutes les pages publiques des analyses" to="/analyses/" />
      </PageCreative>
    </Layout>
  )
}

const PERSPECTIVES = [
  'Qui vend déjà ?',
  'Qui fait de la publicité ?',
  'Quelles boutiques occupent la niche ?',
  'Quel fournisseur est le moins cher ?',
] as const

/** Neuf cartes d'abord (trois rangées), puis le reste à la demande. */
const CARTES = 9

function RapportsAuPremierPlan() {
  const [lignes, setLignes] = useState<LigneRapport[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; nom: string }>>([])
  const [categorie, setCategorie] = useState('')
  const [tout, setTout] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<LigneRapport | null>(null)
  const [complet, setComplet] = useState<Awaited<ReturnType<typeof api.analyseRapport>> | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setChargement(true)
    setErreur(null)
    api
      .analysesRapports({ type: 'rayon', categorie: categorie || undefined, limite: 120 })
      .then((d) => {
        setLignes(liste<LigneRapport>(d?.analyses))
        if (!categorie) setCategories(liste<{ id: string; nom: string }>(d?.categories))
      })
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setChargement(false))
  }, [categorie])

  useEffect(() => {
    setComplet(null)
    setMessage(null)
    if (!ouvert) return
    api.analyseRapport(ouvert.id).then(setComplet).catch(() => setComplet(null))
  }, [ouvert])

  const visibles = tout ? lignes : lignes.slice(0, CARTES)

  return (
    <section className="mt-14">
      <div className="v-titre-section">
        <div>
          <h2 className="c-h2">Vos rapports, au premier plan.</h2>
          <p>Une analyse par rayon et par jour, écrite par les agents, la plus récente en tête.</p>
        </div>
        {categories.length ? (
          <label className="flex items-center gap-2 text-xs text-[var(--c-texte-2)]">
            Rayon
            <select className="c-champ !w-auto" value={categorie} onChange={(e) => { setCategorie(e.target.value); setTout(false) }}>
              <option value="">Tous</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {erreur ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
      {chargement ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-[var(--c-texte-2)]"><Loader2 size={14} className="animate-spin" /> Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--c-texte-2)]">Aucune analyse déposée pour ce rayon.</p>
      ) : (
        <div className="mt-5">
          <GrilleRapports rapports={visibles} numerotee actif={ouvert?.id} onOuvrir={setOuvert} />
          {lignes.length > CARTES ? (
            <button type="button" className="c-bouton-sec mt-4" onClick={() => setTout((t) => !t)}>
              {tout ? 'Montrer moins de rapports' : `Montrer les ${lignes.length - CARTES} autres rapports`}
            </button>
          ) : null}
        </div>
      )}

      {ouvert ? (
        <Fenetre titre={`${ouvert.categorieNom} · ${ouvert.titre || ouvert.themeNom}`} onClose={() => setOuvert(null)} large>
          <p className="mt-1 text-xs text-[var(--c-texte-2)]">
            {`${dateLongue(ouvert.day)} · ${ouvert.produits} produit${ouvert.produits > 1 ? 's' : ''} dans ce rapport · ${ouvert.sources} source${ouvert.sources > 1 ? 's' : ''}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={pagePublique(ouvert)} target="_blank" rel="noreferrer" className="c-bouton-sec !text-xs">
              <Globe size={12} /> Page publique du rapport
            </a>
            <Link to={`/fresh-news?categorie=${ouvert.categorie}&jour=${ouvert.day}`} className="c-bouton-sec !text-xs">
              Lire l'édition Fresh news <ArrowUpRight size={12} />
            </Link>
          </div>
          {complet ? (
            <>
              <div className="mt-4"><Markdown texte={complet.body} /></div>
              {message ? <p className="mt-3 text-xs text-[var(--c-lime)]">{message}</p> : null}
              {liste(complet.produits).length ? (
                <ListeProduitsRapport produits={complet.produits} origine={complet.id} onMessage={setMessage} />
              ) : null}
            </>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-sm text-[var(--c-texte-2)]"><Loader2 size={14} className="animate-spin" /> Le rapport arrive…</p>
          )}
        </Fenetre>
      ) : null}
    </section>
  )
}
