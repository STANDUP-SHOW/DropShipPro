import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ExternalLink, Trash2 } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { BandeauDemo } from '../components/ModeDemo'
import { DEMO_GAGNANTS } from '../lib/demoJeux'

type Gagnant = Awaited<ReturnType<typeof api.listOpportunities>>['opportunities'][number]

const euro = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)

/**
 * Les produits gagnants déposés par l'AUTO-MODE des chefs de rayon.
 *
 * Toutes les douze heures, chaque rayon dont l'interrupteur est levé dépose
 * dix produits : lien source, prix le plus bas constaté, prix de vente
 * possible, plateformes conseillées. La marge est calculée à l'affichage,
 * jamais stockée — deux prix qui bougent ne doivent pas laisser un
 * pourcentage figé derrière eux.
 *
 * Présentée façon Mes annonces : une ligne par produit, les chiffres en
 * colonnes, le lien qui part vers la fiche source.
 */
export default function ProduitsGagnants() {
  const [lignes, setLignes] = useState<Gagnant[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [demo] = useDemo()
  /* Les lignes écartées en mode démo ne le sont que pour l'écran. */
  const [ecartees, setEcartees] = useState<Set<string>>(new Set())
  const affichees: Gagnant[] = demo
    ? (DEMO_GAGNANTS as unknown as Gagnant[]).filter((g) => !ecartees.has(g.id))
    : lignes

  useEffect(() => {
    api
      .listOpportunities(undefined, undefined, true)
      .then((r) => setLignes(r.opportunities))
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [])

  async function ecarter(id: string) {
    if (id.startsWith('demo-')) {
      setEcartees((s) => new Set(s).add(id))
      return
    }
    await api.deleteOpportunity(id).catch(() => undefined)
    setLignes((l) => l.filter((g) => g.id !== id))
  }

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Trophy size={22} className="text-amber-300" />
        <span>Produits gagnants</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        La sélection déposée par vos chefs de rayon en IA AUTO-MODE : dix produits par rayon et par
        demi-journée, avec le prix le plus bas constaté, un prix de vente possible et les
        plateformes conseillées.
      </p>

      {erreur && !demo ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
      {chargement && !demo ? <p className="mt-6 text-sm text-gray-500">Chargement…</p> : null}

      {!chargement && !erreur && affichees.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucun produit gagnant déposé pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Activez l'interrupteur <b>IA AUTO-MODE</b> sur la fiche d'un{' '}
            <Link to="/rayons" className="text-purple-300 underline">
              chef de rayon
            </Link>{' '}
            en poste : sa première liste arrive dans la demi-journée.
          </p>
        </div>
      ) : null}

      {affichees.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Produit</th>
                <th className="px-3 py-3">Prix le plus bas</th>
                <th className="px-3 py-3">Prix de vente possible</th>
                <th className="px-3 py-3">Marge</th>
                <th className="px-3 py-3">Plateformes conseillées</th>
                <th className="px-3 py-3">Repéré</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {affichees.map((g) => (
                <tr key={g.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="max-w-xs px-4 py-3">
                    <a
                      href={g.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group inline-flex items-start gap-1.5"
                    >
                      <span className="line-clamp-2 font-medium text-gray-200 group-hover:text-white group-hover:underline">
                        {g.title}
                      </span>
                      <ExternalLink size={13} className="mt-0.5 shrink-0 text-gray-500 group-hover:text-white" />
                    </a>
                    {g.raw?.redacteur ? (
                      <p className="mt-0.5 text-[11px] text-gray-500">{`Proposé par ${g.raw.redacteur}`}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-200">{euro(g.sourcePrice)}</td>
                  <td className="px-3 py-3 font-semibold text-emerald-300">{euro(g.marketPrice)}</td>
                  <td className="px-3 py-3">
                    {g.marginPercent === null ? (
                      <span className="text-gray-500">—</span>
                    ) : (
                      <span
                        className={
                          (g.marginPercent >= 100
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : g.marginPercent >= 40
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-white/10 text-gray-300') + ' rounded-full px-2 py-0.5 text-xs font-bold'
                        }
                      >
                        {`+${g.marginPercent} %`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(g.raw?.plateformes ?? []).map((p) => (
                        <span key={p} className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-300">
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">
                    {new Date(g.detectedAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => ecarter(g.id)}
                      title="Écarter ce produit de la liste"
                      className="rounded-lg border border-white/10 p-1.5 text-gray-500 hover:bg-white/5 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BandeauDemo />
    </Layout>
  )
}
