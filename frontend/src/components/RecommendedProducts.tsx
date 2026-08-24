import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Trash2, ExternalLink, Puzzle, HelpCircle, Check } from 'lucide-react'
import { api } from '../lib/api'

type Opportunity = Awaited<ReturnType<typeof api.listOpportunities>>['opportunities'][number]

function euro(value: number | null, currency: string) {
  if (value === null) return '—'
  return value.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR' })
}

/**
 * Les produits conseillés du jour, avec sélection multiple.
 *
 * L'import se fait un par un même en lot, et volontairement : chacun consomme un
 * crédit, appelle le modèle et télécharge des photos. Les lancer tous ensemble
 * ferait tomber le lot entier sur la première erreur, et le vendeur ne saurait
 * pas lequel a été facturé.
 */
export function RecommendedProducts({ department }: { department: string }) {
  const [items, setItems] = useState<Opportunity[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api
      .listOpportunities(undefined, department)
      .then((r) => setItems(r.opportunities.filter((o) => o.status !== 'REJECTED')))
      .catch(() => setError('Impossible de charger les produits conseillés'))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [department])

  // Seuls les produits importables directement peuvent partir en lot : sur Temu
  // et AliExpress le serveur ne reçoit qu'une coquille vide, il faut l'extension.
  const importable = useMemo(
    () => items.filter((o) => o.status !== 'IMPORTED' && !o.needsExtension),
    [items],
  )
  const selected = useMemo(() => items.filter((o) => chosen.has(o.id)), [items, chosen])
  const selectedImportable = selected.filter((o) => !o.needsExtension && o.status !== 'IMPORTED')

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setChosen((current) =>
      current.size === items.length ? new Set() : new Set(items.map((o) => o.id)),
    )
  }

  async function importSelection() {
    setReport(null)
    setError(null)
    let done = 0
    const failed: string[] = []

    for (const o of selectedImportable) {
      setRunning(o.id)
      try {
        const product = (await api.importProduct(o.sourceUrl)) as { id: string }
        await api.setOpportunityStatus(o.id, 'IMPORTED', product.id)
        setItems((list) =>
          list.map((x) => (x.id === o.id ? { ...x, status: 'IMPORTED', productId: product.id } : x)),
        )
        done++
      } catch (e) {
        // Le lot continue : un lien mort ne doit pas coûter les suivants.
        failed.push(`${o.title} — ${(e as Error).message}`)
      }
    }

    setRunning(null)
    setChosen(new Set())
    setReport(
      failed.length
        ? `${done} annonce(s) importée(s), ${failed.length} en échec : ${failed.join(' · ')}`
        : `${done} annonce(s) importée(s). Publiez-les depuis Mes annonces.`,
    )
  }

  async function deleteSelection() {
    if (!window.confirm(`Retirer ${selected.length} produit(s) de la liste ?`)) return
    for (const o of selected) {
      await api.deleteOpportunity(o.id).catch(() => undefined)
    }
    setItems((list) => list.filter((o) => !chosen.has(o.id)))
    setChosen(new Set())
  }

  if (loading) return <p className="mt-6 text-sm text-gray-500">Chargement…</p>

  if (!items.length) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
        <p className="text-sm text-gray-400">Aucun produit conseillé pour le moment.</p>
        <p className="mt-2 text-xs text-gray-500">
          Votre chef de rayon dépose ici ce qu'il trouve, jour après jour.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={chosen.size === items.length && items.length > 0}
            onChange={toggleAll}
            className="h-4 w-4 accent-emerald-400"
          />
          <span>Tout sélectionner</span>
        </label>

        <span className="text-xs text-gray-500">{`${chosen.size} sélectionné(s)`}</span>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={importSelection}
            disabled={!selectedImportable.length || running !== null}
            className="btn-gradient inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            <Download size={13} />
            <span>
              {running
                ? 'Import en cours…'
                : `Importer la sélection (${selectedImportable.length} crédit(s))`}
            </span>
          </button>
          <button
            type="button"
            onClick={deleteSelection}
            disabled={!selected.length || running !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 size={13} />
            <span>Supprimer</span>
          </button>
        </div>
      </div>

      {selected.length > selectedImportable.length && (
        <p className="mt-2 text-xs text-amber-300">
          {`${selected.length - selectedImportable.length} produit(s) sélectionné(s) ne peuvent pas être importés en lot : Temu et AliExpress exigent l'extension, ouvrez leur fiche.`}
        </p>
      )}

      {report && <p className="mt-2 text-xs text-emerald-300">{report}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {importable.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Tous les produits de cette liste passent par l'extension.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {items.map((o) => (
          <li
            key={o.id}
            className={
              chosen.has(o.id)
                ? 'rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-4'
                : 'rounded-xl border border-white/10 bg-white/5 p-4'
            }
          >
            <div className="flex gap-3">
              <input
                type="checkbox"
                checked={chosen.has(o.id)}
                onChange={() => toggle(o.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                        {o.source}
                      </span>
                      {o.isNew && (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                          Nouveauté
                        </span>
                      )}
                      {o.status === 'IMPORTED' && (
                        <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-300">
                          Importé
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-semibold">{o.title}</p>
                    {o.notes && (
                      <p className="mt-1 text-xs leading-relaxed text-gray-400">{o.notes}</p>
                    )}
                  </div>

                  {o.marginPercent !== null && (
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-emerald-400">{`+${o.marginPercent} %`}</p>
                      <p className="text-[11px] text-gray-500">marge estimée</p>
                    </div>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-gray-500">Prix fournisseur</dt>
                    <dd className="font-semibold">{euro(o.sourcePrice, o.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Prix marché</dt>
                    <dd className="font-semibold">{euro(o.marketPrice, o.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Stock Europe</dt>
                    <dd className={o.euStock === null ? 'text-gray-500' : 'font-semibold'}>
                      {o.euStock === null ? (
                        <span className="inline-flex items-center gap-1">
                          <HelpCircle size={12} />
                          <span>non vérifié</span>
                        </span>
                      ) : (
                        <span>{o.euStock ? 'oui' : 'non'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Livraison</dt>
                    <dd className="font-semibold">{o.delivery ?? '—'}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={o.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  >
                    <ExternalLink size={13} />
                    <span>Voir chez le fournisseur</span>
                  </a>

                  {o.status === 'IMPORTED' && o.productId && (
                    <Link
                      to={`/products/${o.productId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300"
                    >
                      <Check size={13} />
                      <span>Voir l'annonce</span>
                    </Link>
                  )}

                  {o.status !== 'IMPORTED' && o.needsExtension && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
                      <Puzzle size={13} />
                      <span>Import par l'extension, depuis la fiche</span>
                    </span>
                  )}

                  {running === o.id && <span className="text-xs text-gray-400">Import en cours…</span>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
