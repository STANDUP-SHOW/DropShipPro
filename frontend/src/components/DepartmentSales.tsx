import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Radio, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'

type Data = Awaited<ReturnType<typeof api.departmentSales>>

const euros = (v: number, devise = 'EUR') =>
  `${v.toFixed(2).replace('.', ',')} ${devise === 'EUR' ? '€' : devise}`

const ETAT: Record<string, string> = {
  PUBLISHED: 'text-emerald-300',
  FAILED: 'text-red-400',
  PENDING: 'text-yellow-300',
}

const ETAT_LABEL: Record<string, string> = {
  PUBLISHED: 'publiée',
  FAILED: 'échec',
  PENDING: 'en attente',
}

/**
 * Ce que le rayon a rapporté, et ce qui bouge sur les boutiques.
 *
 * Un chef de rayon conseille des produits ; la seule question qui compte
 * ensuite est de savoir si ceux-là se sont vendus. Le lien entre le rayon et
 * une annonce passe par la catégorie du produit.
 *
 * Les chiffres sont ceux des commandes enregistrées, jamais une estimation.
 * Une place de marché qui ne remonte pas ses ventes apparaît à zéro, et c'est
 * écrit : un tableau qui invente des ventes ferait prendre de mauvaises
 * décisions avec l'air d'être documenté.
 */
export function DepartmentSales({ departmentId, agentName }: { departmentId: string; agentName: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .departmentSales(departmentId)
      .then(setData)
      .catch(() => setError("Les chiffres n'ont pas pu être chargés"))
  }, [departmentId])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!data) return <p className="text-sm text-gray-500">Chargement…</p>

  const total = data.parPlateforme.reduce(
    (s, p) => ({ commandes: s.commandes + p.commandes, chiffre: s.chiffre + p.chiffre, marge: s.marge + p.marge }),
    { commandes: 0, chiffre: 0, marge: 0 },
  )

  return (
    <div className="space-y-6">
      <section>
        <h2 className="flex items-center gap-2 font-bold">
          <TrendingUp size={17} className="text-emerald-400" />
          <span>Ventes du rayon</span>
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {`${data.annonces} annonce(s) de ce rayon à votre catalogue. Les chiffres sont ceux des commandes enregistrées : une place de marché qui ne remonte pas ses ventes reste à zéro.`}
        </p>

        {data.parPlateforme.length === 0 ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
            {data.annonces === 0
              ? `Aucune annonce de ce rayon au catalogue. Importez ce que ${agentName} vous conseille pour voir ses résultats ici.`
              : 'Aucune vente enregistrée sur ce rayon pour le moment.'}
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-gray-500">Commandes</p>
                <p className="text-lg font-bold tabular-nums">{total.commandes}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-gray-500">Chiffre d'affaires</p>
                <p className="text-lg font-bold tabular-nums text-purple-200">{euros(total.chiffre)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-gray-500">Marge brute</p>
                <p
                  className={
                    total.marge >= 0
                      ? 'text-lg font-bold tabular-nums text-emerald-300'
                      : 'text-lg font-bold tabular-nums text-red-400'
                  }
                >
                  {euros(total.marge)}
                </p>
              </div>
            </div>

            <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
              {data.parPlateforme.map((p) => (
                <div key={p.platform} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="font-medium">{p.platform}</span>
                  <span className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400">{`${p.commandes} vente(s)`}</span>
                    <span className="tabular-nums text-purple-200">{euros(p.chiffre)}</span>
                    <span
                      className={p.marge >= 0 ? 'tabular-nums text-emerald-300' : 'tabular-nums text-red-400'}
                    >
                      {`${p.marge >= 0 ? '+' : ''}${euros(p.marge)}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {data.ventes.length ? (
          <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
            {data.ventes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{v.titre}</span>
                <span className="shrink-0 text-gray-500">{v.platform}</span>
                <span className="shrink-0 tabular-nums">{euros(v.montant, v.devise)}</span>
                <span className="shrink-0 text-gray-500">
                  {new Date(v.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-bold">
          <Radio size={17} className="text-purple-300" />
          <span>Ce qui est en ligne</span>
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Les annonces de ce rayon et leur état sur chaque destination — publiée, en attente, ou en
          échec avec la raison.
        </p>

        {data.publications.length === 0 ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
            Aucune annonce de ce rayon n'a encore été diffusée.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {data.publications.map((p) => (
              <li
                key={`${p.productId}-${p.platform}`}
                className="flex items-center gap-3 px-3 py-2.5 text-xs"
              >
                <Link to={`/products/${p.productId}`} className="min-w-0 flex-1 truncate hover:underline">
                  {p.titre}
                </Link>
                <span className="shrink-0 text-gray-500">{p.platform}</span>
                <span className={`shrink-0 ${ETAT[p.status] ?? 'text-gray-400'}`}>
                  {ETAT_LABEL[p.status] ?? p.status}
                </span>
                {p.externalUrl ? (
                  <a
                    href={p.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="shrink-0 text-purple-300 hover:text-purple-200"
                  >
                    <ExternalLink size={11} />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {data.publications.some((p) => p.status === 'FAILED') ? (
          <p className="mt-2 text-[11px] text-red-300">
            {data.publications.find((p) => p.status === 'FAILED')?.error ??
              'Une publication a échoué.'}
          </p>
        ) : null}
      </section>
    </div>
  )
}
