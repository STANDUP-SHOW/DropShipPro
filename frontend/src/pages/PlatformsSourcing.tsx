import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageSearch, X, Puzzle, Link2, ExternalLink, AlertTriangle } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { PlatformLogo } from '../components/PlatformLogo'

type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]

const CHEMIN: Record<string, { label: string; detail: string; ton: string }> = {
  extension: {
    label: 'Extension obligatoire',
    detail:
      "Ce site construit sa fiche en JavaScript : un serveur qui la demande ne reçoit qu'une page vide. L'extension lit la page déjà affichée dans votre navigateur, avec le prix et la galerie complète.",
    ton: 'bg-amber-400/15 text-amber-300',
  },
  url: {
    label: "Import par l'adresse",
    detail: "Collez l'adresse du produit dans Mes annonces : le serveur lit la page directement.",
    ton: 'bg-sky-400/15 text-sky-300',
  },
  'les-deux': {
    label: "Adresse ou extension",
    detail:
      "Les deux fonctionnent. L'extension reste plus complète : elle voit les options et la galerie entière, que le serveur rate parfois.",
    ton: 'bg-emerald-400/15 text-emerald-300',
  },
}

/**
 * L'annuaire des plateformes d'acquisition.
 *
 * Séparé des destinations de vente, et pas par goût du rangement : ce ne sont
 * ni les mêmes comptes, ni les mêmes gestes, et une même marque peut être les
 * deux — on achète sur AliExpress, on vend sur eBay, et Etsy est les deux à la
 * fois. Les mélanger obligeait le vendeur à lire chaque ligne pour savoir de
 * quel côté elle tombait.
 *
 * Ce que chaque fiche dit, parce que c'est ce qui coûte cher de découvrir
 * après : par où passe l'import, d'où part la marchandise, et ce qui va
 * surprendre.
 */
export default function PlatformsSourcing() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ouvert, setOuvert] = useState<Supplier | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listSuppliers()
      .then(setSuppliers)
      .catch(() => setError("L'annuaire n'a pas pu être chargé"))
  }, [])

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <PackageSearch size={22} className="text-emerald-400" />
        <span>Plateformes d'acquisition</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Là où vous allez chercher vos produits. Pour chacune : par où passe l'import, d'où part la
        marchandise, et ce qui va vous surprendre.
      </p>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-gray-500">
        Ces plateformes ne demandent aucun raccordement : vous n'avez pas de compte à relier ici.
        Un import se lance depuis <Link to="/dashboard" className="underline">Mes annonces</Link>,
        en collant une adresse, ou depuis le bouton que l'extension pose sur la fiche du
        fournisseur.
      </p>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suppliers.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setOuvert(s)}
              className="flex h-full w-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
            >
              <div className="flex items-start gap-3">
                <PlatformLogo id={s.id} label={s.label} color={s.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.label}</p>
                  <p className="truncate text-[11px] text-gray-500">{s.origine}</p>
                </div>
              </div>

              <p className="mt-3 flex-1 text-xs leading-relaxed text-gray-500">{s.quoi}</p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHEMIN[s.importPath].ton}`}
                >
                  {CHEMIN[s.importPath].label}
                </span>
                {s.attention ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                    <AlertTriangle size={9} />
                    <span>à savoir</span>
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>

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
                  <p className="text-xs text-gray-500">{ouvert.origine}</p>
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

            <p className="mt-4 text-sm leading-relaxed text-gray-300">{ouvert.quoi}</p>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                {ouvert.importPath === 'extension' ? (
                  <Puzzle size={13} className="text-amber-300" />
                ) : (
                  <Link2 size={13} className="text-sky-300" />
                )}
                <span>{CHEMIN[ouvert.importPath].label}</span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                {CHEMIN[ouvert.importPath].detail}
              </p>
              {ouvert.adapte ? (
                <p className="mt-2 text-[11px] text-emerald-300">
                  Un relevé de photos dédié à ce site est écrit dans l'extension : la galerie
                  complète est récupérée, pas seulement la photo affichée.
                </p>
              ) : null}
            </div>

            {ouvert.attention ? (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                  <AlertTriangle size={13} />
                  <span>À savoir avant de vous lancer</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-100">{ouvert.attention}</p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <a
                href={`https://${ouvert.domain}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
              >
                <span>{`Ouvrir ${ouvert.label}`}</span>
                <ExternalLink size={13} />
              </a>
              <Link
                to="/dashboard"
                className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Importer un produit
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  )
}
