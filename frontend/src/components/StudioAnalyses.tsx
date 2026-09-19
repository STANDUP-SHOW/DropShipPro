import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Search, Store, Megaphone, ShoppingBag, Boxes } from 'lucide-react'
import { api } from '../lib/api'
import { PROPS_SANS_REMPLISSAGE } from '../lib/champSecret'

/**
 * Le studio d'analyses : quatre façons de regarder un marché avant de publier.
 *
 * **Pourquoi un sujet libre et pas une annonce.** Le vendeur analyse le plus
 * souvent AVANT d'importer — c'est le bon ordre, et c'est tout l'intérêt :
 * découvrir qu'une niche est saturée coûte alors une analyse, pas un catalogue
 * entier. L'analyse par annonce existante reste en dessous, inchangée.
 *
 * **Chaque volet porte son prix, affiché avant le clic.** Une analyse coûte
 * trois à quatre fois un import ; l'apprendre après coup est le meilleur moyen
 * de ne plus jamais cliquer. Le tarif vient du serveur, jamais recopié ici.
 *
 * **Chaque volet est indépendant.** Un échec chez l'un n'efface pas les
 * résultats des autres : le vendeur compare, et c'est la comparaison qui est la
 * décision.
 */

type Volet = 'marketplaces' | 'publicites' | 'boutiques' | 'fournisseurs'

interface Marketplaces {
  synthese: string
  prixBas: number | null
  prixHaut: number | null
  prixConseille: number | null
  concurrence: string | null
  offres: Array<{ place: string; vendeur: string | null; prix: number | null; note: number | null; url: string | null }>
  sources: string[]
}
interface Publicites {
  synthese: string
  angles: string[]
  publicites: Array<{ annonceur: string; plateforme: string; angle: string | null; format: string | null; depuis: string | null; url: string | null }>
  sources: string[]
  bibliotheques: Array<{ nom: string; url: string; quoi: string }>
}
interface Boutiques {
  synthese: string
  boutiques: Array<{ nom: string; url: string | null; positionnement: string | null; gammePrix: string | null; enAvant: string[] }>
  sources: string[]
}
interface Fournisseurs {
  synthese: string
  offres: Array<{ fournisseurLabel: string; titre: string; prix: number | null; devise: string; url: string | null; entrepot: string | null }>
  meilleure: { fournisseurLabel: string } | null
  ecart: number | null
  margePossible: number | null
  refus: Array<{ fournisseur: string; raison: string }>
}

const VOLETS: Array<{ id: Volet; titre: string; question: string; icone: typeof Store }> = [
  {
    id: 'marketplaces',
    titre: 'Places de marché',
    question: 'Qui vend déjà ce produit, à quel prix, avec quelles notes.',
    icone: Store,
  },
  {
    id: 'publicites',
    titre: 'Publicités concurrentes',
    question: 'Qui investit sur cette niche, depuis quand, avec quel angle — Facebook Ad Library et TikTok.',
    icone: Megaphone,
  },
  {
    id: 'boutiques',
    titre: 'Boutiques comparables',
    question: 'Ce que vendent les boutiques de la même niche, leur positionnement, leur gamme de prix.',
    icone: ShoppingBag,
  },
  {
    id: 'fournisseurs',
    titre: 'Comparaison fournisseurs',
    question: 'Pour la même référence, ce que chacun de vos fournisseurs reliés demande.',
    icone: Boxes,
  },
]

/** Les marchés proposés. Le marché n'est pas le même d'un pays à l'autre. */
const PAYS = [
  ['FR', 'France'],
  ['BE', 'Belgique'],
  ['ES', 'Espagne'],
  ['IT', 'Italie'],
  ['DE', 'Allemagne'],
  ['GB', 'Royaume-Uni'],
  ['US', 'États-Unis'],
]

const euro = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)

export function StudioAnalyses() {
  const [intitule, setIntitule] = useState('')
  const [pays, setPays] = useState('FR')
  const [tarifs, setTarifs] = useState<Record<string, number>>({})
  const [enCours, setEnCours] = useState<Volet | null>(null)
  const [resultats, setResultats] = useState<Partial<Record<Volet, unknown>>>({})
  const [erreurs, setErreurs] = useState<Partial<Record<Volet, string>>>({})

  useEffect(() => {
    api
      .studioTarifs()
      .then((t) => setTarifs(Object.fromEntries(t.volets.map((v) => [v.id, v.drops]))))
      .catch(() => {
        // Sans tarifs, on n'affiche pas de prix plutôt qu'un prix faux.
      })
  }, [])

  async function lancer(volet: Volet) {
    if (!intitule.trim()) return
    setEnCours(volet)
    setErreurs((e) => ({ ...e, [volet]: undefined }))
    try {
      const r = await api.studioAnalyse({ volet, intitule: intitule.trim(), pays })
      setResultats((v) => ({ ...v, [volet]: r.resultat }))
    } catch (e) {
      setErreurs((x) => ({ ...x, [volet]: e instanceof Error ? e.message : "L'analyse n'a pas abouti" }))
    } finally {
      setEnCours(null)
    }
  }

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        {/* La question est posée au-dessus, par le bloc de sélection : la
            reposer ici mot pour mot ferait lire deux fois la même chose. */}
        <label className="block text-sm font-semibold" htmlFor="studio-sujet">
          Décrivez le produit, la niche ou l'idée
        </label>
        <p className="mt-0.5 text-xs text-gray-400">
          Vous n'avez pas besoin de l'avoir importé — c'est le bon ordre : analyser d'abord, acheter
          le catalogue ensuite.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            {...PROPS_SANS_REMPLISSAGE}
            id="studio-sujet"
            value={intitule}
            onChange={(e) => setIntitule(e.target.value)}
            placeholder="écouteurs sans fil à réduction de bruit"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
          />
          <select
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            aria-label="Marché visé"
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
          >
            {PAYS.map(([code, nom]) => (
              <option key={code} value={code} className="bg-[#1b1633]">
                {nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {VOLETS.map((v) => {
          const prix = tarifs[v.id]
          const resultat = resultats[v.id]
          const occupe = enCours === v.id
          return (
            <article key={v.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-start gap-3">
                <v.icone size={18} className="mt-0.5 shrink-0 text-purple-300" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{v.titre}</h3>
                  <p className="mt-0.5 text-xs text-gray-400">{v.question}</p>
                </div>
                <div className="flex items-center gap-2">
                  {prix !== undefined ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        prix === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      {prix === 0 ? 'gratuit' : `${prix} drops`}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => lancer(v.id)}
                    disabled={occupe || !intitule.trim()}
                    className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
                  >
                    {occupe ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    <span>{resultat ? 'Relancer' : 'Analyser'}</span>
                  </button>
                </div>
              </div>

              {occupe ? (
                <p className="mt-3 text-xs text-gray-400">
                  {v.id === 'fournisseurs'
                    ? 'Interrogation de vos fournisseurs reliés…'
                    : 'Recherches web en cours — comptez une trentaine de secondes.'}
                </p>
              ) : null}
              {erreurs[v.id] ? <p className="mt-3 text-sm text-red-400">{erreurs[v.id]}</p> : null}

              {resultat ? <Resultat volet={v.id} valeur={resultat} /> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Resultat({ volet, valeur }: { volet: Volet; valeur: unknown }) {
  if (volet === 'marketplaces') return <VueMarketplaces d={valeur as Marketplaces} />
  if (volet === 'publicites') return <VuePublicites d={valeur as Publicites} />
  if (volet === 'boutiques') return <VueBoutiques d={valeur as Boutiques} />
  return <VueFournisseurs d={valeur as Fournisseurs} />
}

/** Le bloc de sources, commun aux trois volets qui en ont. */
function Sources({ liens }: { liens: string[] }) {
  if (!liens.length) return null
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
        {`${liens.length} source(s) consultée(s)`}
      </summary>
      <ul className="mt-1.5 space-y-1">
        {liens.map((l) => (
          <li key={l}>
            <a
              href={l}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 break-all text-xs text-purple-300 hover:text-purple-200"
            >
              {l}
              <ExternalLink size={11} className="shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

function VueMarketplaces({ d }: { d: Marketplaces }) {
  return (
    <div className="mt-3">
      <p className="text-sm text-gray-200">{d.synthese}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Chiffre label="Prix le plus bas" valeur={euro(d.prixBas)} />
        <Chiffre label="Prix le plus haut" valeur={euro(d.prixHaut)} />
        <Chiffre label="Prix conseillé" valeur={euro(d.prixConseille)} />
        <Chiffre label="Concurrence" valeur={d.concurrence ?? '—'} />
      </div>

      {d.offres.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="px-3 py-2 font-medium">Place</th>
                <th className="px-3 py-2 font-medium">Vendeur</th>
                <th className="px-3 py-2 text-right font-medium">Prix</th>
                <th className="px-3 py-2 text-right font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {d.offres.map((o, i) => (
                <tr key={`${o.place}-${i}`} className="border-t border-white/5">
                  <td className="px-3 py-2">
                    {o.url ? (
                      <a href={o.url} target="_blank" rel="noreferrer noopener" className="text-purple-300 hover:text-purple-200">
                        {o.place}
                      </a>
                    ) : (
                      o.place
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-300">{o.vendeur ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{euro(o.prix)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                    {o.note === null ? '—' : `${o.note.toFixed(1)}/5`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Sources liens={d.sources} />
    </div>
  )
}

function VuePublicites({ d }: { d: Publicites }) {
  return (
    <div className="mt-3">
      <p className="text-sm text-gray-200">{d.synthese}</p>

      {/*
        Les deux bibliothèques d'abord, et c'est voulu : c'est la partie EXACTE
        du volet. Le reste est une synthèse sourcée ; ces deux liens mènent à la
        donnée elle-même, pré-filtrée sur les mots du vendeur et son marché.
      */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {d.bibliotheques.map((b) => (
          <a
            key={b.nom}
            href={b.url}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-xl border border-purple-400/30 bg-purple-500/10 p-3 transition hover:border-purple-400/60"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
              {b.nom}
              <ExternalLink size={12} className="shrink-0 text-purple-300" />
            </span>
            <span className="mt-1 block text-xs text-gray-400">{b.quoi}</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Ces deux bibliothèques sont des applications JavaScript : nous ne les lisons pas à votre
        place, et nous ne les copions pas. Les liens ci-dessus sont pré-remplis avec vos mots-clés et
        votre marché — vous êtes dans la donnée d'origine en un clic.
      </p>

      {d.angles.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {d.angles.map((a) => (
            <span key={a} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-gray-200">
              {a}
            </span>
          ))}
        </div>
      ) : null}

      {d.publicites.length ? (
        <ul className="mt-3 space-y-2">
          {d.publicites.map((p, i) => (
            <li key={`${p.annonceur}-${i}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <b className="text-sm">{p.annonceur}</b>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-300">{p.plateforme}</span>
                {p.depuis ? <span className="text-xs text-gray-500">depuis {p.depuis}</span> : null}
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ml-auto inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200"
                  >
                    voir <ExternalLink size={11} />
                  </a>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-gray-300">
                {[p.angle, p.format].filter(Boolean).join(' · ') || '—'}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <Sources liens={d.sources} />
    </div>
  )
}

function VueBoutiques({ d }: { d: Boutiques }) {
  return (
    <div className="mt-3">
      <p className="text-sm text-gray-200">{d.synthese}</p>
      {d.boutiques.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {d.boutiques.map((b, i) => (
            <div key={`${b.nom}-${i}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <b className="min-w-0 truncate text-sm">{b.nom}</b>
                {b.gammePrix ? <span className="shrink-0 text-xs text-emerald-300">{b.gammePrix}</span> : null}
              </div>
              {b.positionnement ? <p className="mt-1 text-xs text-gray-400">{b.positionnement}</p> : null}
              {b.enAvant.length ? (
                <p className="mt-1.5 text-xs text-gray-300">En avant : {b.enAvant.join(', ')}</p>
              ) : null}
              {b.url ? (
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 break-all text-xs text-purple-300 hover:text-purple-200"
                >
                  {b.url.replace(/^https?:\/\//, '')}
                  <ExternalLink size={11} className="shrink-0" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <Sources liens={d.sources} />
    </div>
  )
}

function VueFournisseurs({ d }: { d: Fournisseurs }) {
  return (
    <div className="mt-3">
      <p className="text-sm text-gray-200">{d.synthese}</p>

      {d.offres.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="px-3 py-2 font-medium">Fournisseur</th>
                <th className="px-3 py-2 font-medium">Référence</th>
                <th className="px-3 py-2 text-right font-medium">Prix d'achat</th>
                <th className="px-3 py-2 font-medium">Entrepôt</th>
              </tr>
            </thead>
            <tbody>
              {d.offres
                .slice()
                .sort((a, b) => (a.prix ?? Infinity) - (b.prix ?? Infinity))
                .map((o, i) => (
                  <tr key={`${o.fournisseurLabel}-${i}`} className="border-t border-white/5">
                    <td className="px-3 py-2 font-medium">{o.fournisseurLabel}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-gray-300">
                      {o.url ? (
                        <a href={o.url} target="_blank" rel="noreferrer noopener" className="text-purple-300 hover:text-purple-200">
                          {o.titre}
                        </a>
                      ) : (
                        o.titre
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {o.prix === null ? '—' : `${o.prix.toFixed(2).replace('.', ',')} ${o.devise}`}
                    </td>
                    <td className="px-3 py-2 text-xs text-emerald-300">{o.entrepot ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {d.refus.length ? (
        <ul className="mt-3 space-y-1">
          {d.refus.map((r) => (
            <li key={r.fournisseur} className="text-xs text-amber-200">
              {r.fournisseur} : {r.raison}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Chiffre({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-sm font-bold tabular-nums">{valeur}</p>
      <p className="mt-0.5 text-[11px] text-gray-400">{label}</p>
    </div>
  )
}
