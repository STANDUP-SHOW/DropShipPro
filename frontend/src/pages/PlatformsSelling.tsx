import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, X, ExternalLink, AlertTriangle, Search, Check } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { PlatformLogo } from '../components/PlatformLogo'
import { ChannelDirectory } from '../components/ChannelDirectory'
import { INTEGRATION_LABEL, INTEGRATION_STYLE, type PlatformInfo } from '../lib/platforms'
import { PlatformCredentials } from '../components/PlatformCredentials'

/** Ce que chaque mode d'intégration veut dire, en clair et pour un vendeur. */
const EXPLICATION: Record<string, string> = {
  live: "Vos annonces partent toutes seules, dès que vous cliquez sur Publier. Rien à faire de plus.",
  feed: "Nous produisons un flux que la plateforme vient lire toute seule, à intervalle régulier. Vous branchez l'adresse du flux une fois chez elle.",
  'api-ready':
    "Le raccordement est écrit de notre côté, mais la plateforme exige un compte vendeur validé par ses équipes avant de délivrer les accès. La demande se fait chez elle, à votre nom.",
  extension:
    "Pas d'API publique : la publication se fait dans votre navigateur. L'extension remplit le formulaire à votre place, et c'est vous qui cliquez sur Publier — publier à votre place ferait suspendre votre compte.",
  none: "Aucune publication n'est possible : cette enseigne n'est pas une place de marché ouverte aux vendeurs tiers.",
}

/**
 * L'annuaire des plateformes de vente.
 *
 * Séparé des plateformes d'acquisition : on n'y fait pas les mêmes gestes, et
 * une même marque peut être des deux côtés — on achète sur AliExpress, on vend
 * sur eBay, et Etsy est les deux à la fois.
 *
 * L'ordre est celui de ce que le vendeur peut faire aujourd'hui : ce qui publie
 * tout seul d'abord, ce qui demande une démarche ensuite, ce qui est impossible
 * en dernier. Un annuaire alphabétique mettrait Amazon — compte vendeur validé,
 * plusieurs semaines — devant « Mon site », qui marche dans la minute.
 */
export default function PlatformsSelling() {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [ouvert, setOuvert] = useState<PlatformInfo | null>(null)
  const [recherche, setRecherche] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listPlatforms()
      .then((p) => setPlatforms(p as PlatformInfo[]))
      .catch(() => setError("L'annuaire n'a pas pu être chargé"))
  }, [])

  const rang: Record<string, number> = {
    live: 0,
    feed: 1,
    'api-ready': 2,
    extension: 3,
    none: 4,
  }

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return [...platforms]
      .filter((p) => !terme || p.label.toLowerCase().includes(terme))
      .sort((a, b) => rang[a.integration] - rang[b.integration] || a.label.localeCompare(b.label))
  }, [platforms, recherche])

  const groupes = useMemo(() => {
    const map = new Map<string, PlatformInfo[]>()
    for (const p of visibles) {
      const liste = map.get(p.integration) ?? []
      liste.push(p)
      map.set(p.integration, liste)
    }
    return [...map.entries()]
  }, [visibles])

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Store size={22} className="text-emerald-400" />
        <span>Plateformes de vente</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Où vos annonces peuvent partir. Rangées par ce que vous pouvez en faire aujourd'hui, et non
        par ordre alphabétique : ce qui publie tout seul d'abord, ce qui demande une démarche
        ensuite.
      </p>

      <label className="relative mt-5 block max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher une plateforme"
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400/60"
        />
      </label>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {groupes.map(([integration, liste]) => (
        <section key={integration} className="mt-8">
          <h2 className="flex items-center gap-2 font-bold">
            <span>{INTEGRATION_LABEL[integration as keyof typeof INTEGRATION_LABEL]}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-normal text-gray-400">
              {liste.length}
            </span>
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            {EXPLICATION[integration]}
          </p>

          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liste.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOuvert(p)}
                  className="flex h-full w-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
                >
                  <div className="flex items-start gap-3">
                    <PlatformLogo id={p.id} label={p.label} color={p.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.label}</p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] ${
                          INTEGRATION_STYLE[p.integration]
                        }`}
                      >
                        {INTEGRATION_LABEL[p.integration]}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 flex-1 text-xs leading-relaxed text-gray-500">{p.note}</p>

                  {p.warning ? (
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-amber-300">
                      <AlertTriangle size={9} />
                      <span>à savoir avant de publier</span>
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ChannelDirectory />

      {ouvert ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOuvert(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <PlatformLogo id={ouvert.id} label={ouvert.label} color={ouvert.color} size={44} />
                <div>
                  <h2 className="font-bold">{ouvert.label}</h2>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${
                      INTEGRATION_STYLE[ouvert.integration]
                    }`}
                  >
                    {INTEGRATION_LABEL[ouvert.integration]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOuvert(null)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-gray-300">{ouvert.note}</p>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs font-semibold">Ce que vous pouvez y faire</p>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                {EXPLICATION[ouvert.integration]}
              </p>
              {ouvert.batchable ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
                  <Check size={11} />
                  <span>Publication en lot possible : plusieurs annonces d'un coup.</span>
                </p>
              ) : null}
            </div>

            {ouvert.warning ? (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                  <AlertTriangle size={13} />
                  <span>À savoir avant de publier</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-100">{ouvert.warning}</p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {ouvert.sellUrl ? (
                <a
                  href={ouvert.sellUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                >
                  <span>{`Ouvrir ${ouvert.label}`}</span>
                  <ExternalLink size={13} />
                </a>
              ) : null}

              <Link to="/guide" className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
                Mode d'emploi
              </Link>

              {/* « Activer » ne promet rien : il mène là où le raccordement se
                  fait réellement, Réglages pour une clé d'API, le guide sinon. */}
              {ouvert.integration === 'api-ready' || ouvert.integration === 'live' ? (
                <Link to="/settings" className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold">
                  Activer
                </Link>
              ) : ouvert.integration === 'extension' ? (
                <Link to="/guide" className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold">
                  Installer l'extension
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/*
        Les identifiants, sur la page qui les explique.
        Ils vivaient dans Réglages : le vendeur lisait ici « Shopify — jeton
        shpat_ » puis partait chercher le champ ailleurs. Restreints aux
        plateformes de vente, parce que les fournisseurs n'ont rien à y faire.
      */}
      <PlatformCredentials
        titre="Vos clés de vente"
        only={platforms.filter((p) => !p.unavailable).map((p) => p.id)}
      />
    </Layout>
  )
}
