import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Link2, Loader2, Layers, Puzzle, Trash2, LayoutGrid, List, Radio, CheckSquare, Square, TrendingUp } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BulkPublishDialog } from '../components/BulkPublishDialog'
import { api, assetUrl } from '../lib/api'
import type { PlatformInfo } from '../lib/platforms'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  READY: 'Prêt',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-300',
  READY: 'bg-blue-500/20 text-blue-300',
  PUBLISHED: 'bg-emerald-500/20 text-emerald-300',
  ARCHIVED: 'bg-gray-500/20 text-gray-400',
}

export default function Dashboard() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchUrls, setBatchUrls] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Array<{ id: string; group: string; label: string }>>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)

  // Kept between visits: someone who works in list mode expects to find it again.
  const [view, setView] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('droppost_view') === 'list' ? 'list' : 'grid'),
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const navigate = useNavigate()

  const labelById = new Map(catalog.map((c) => [c.id, c.label]))

  const usedCategories = [...new Set(products.map((p) => p.categoryId).filter(Boolean))]
    .map((id) => ({
      id: id as string,
      label: labelById.get(id as string) ?? 'Non classé',
      count: products.filter((p) => p.categoryId === id).length,
    }))
    .sort((a, b) => b.count - a.count)

  const needle = search.trim().toLowerCase()
  const visible = products
    .filter((p) => !categoryFilter || p.categoryId === categoryFilter)
    .filter((p) => !needle || `${p.aiTitle ?? ''} ${p.title ?? ''}`.toLowerCase().includes(needle))

  async function load() {
    setLoading(true)
    try {
      const list = await api.listProducts()
      setProducts(list)
      // A listing deleted from another tab must not stay in the selection and
      // make the batch endpoint answer « annonce introuvable ».
      setSelectedIds((current) => current.filter((id) => list.some((p: any) => p.id === id)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    api.listCategories().then(setCatalog)
    api.listPlatforms().then(setPlatforms)
  }, [])

  useEffect(() => {
    localStorage.setItem('droppost_view', view)
  }, [view])

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  // Selecting acts on what is on screen, not on the whole catalogue: a filter is
  // there precisely to narrow what the next action will touch.
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds.includes(p.id))
  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        const ids = new Set(visible.map((p) => p.id))
        return current.filter((id) => !ids.has(id))
      }
      return [...new Set([...current, ...visible.map((p) => p.id)])]
    })
  }

  async function onImport(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setImporting(true)
    try {
      await api.importProduct(url)
      setUrl('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import")
    } finally {
      setImporting(false)
    }
  }

  async function onBatchImport(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBatchSummary(null)
    const urls = batchUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 25)
    if (!urls.length) return
    setImporting(true)
    try {
      const res = await api.importBatch(urls)
      setBatchSummary(`${res.imported} importés, ${res.failed} échoués sur ${urls.length}`)
      setBatchUrls('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import par lot")
    } finally {
      setImporting(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.deleteProduct(pendingDelete.id)
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id))
      setPendingDelete(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Layout>
      {/* Deleting a listing can't be undone, so it goes through a confirmation
          rather than firing on the thumbnail click. */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1b1633] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold">Supprimer cette annonce ?</h2>
            <p className="mt-2 text-sm text-gray-300 line-clamp-2">
              {pendingDelete.aiTitle || pendingDelete.title}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              L'annonce et ses photos filigranées seront définitivement effacées.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Importer un produit</h1>
          <p className="text-gray-400 text-sm mt-1">Collez l'URL d'un produit — Temu, JoyBuy, ou n'importe quel site.</p>
        </div>
        <a
          href={assetUrl('/api/public/extension.zip')}
          download="dropship-pro-extension.zip"
          className="inline-flex items-center gap-2 rounded-lg border border-purple-400/40 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
          title="Remplit automatiquement les formulaires Vinted, Leboncoin et eBay"
        >
          <Puzzle size={16} className="text-purple-300" /> Extension Chrome
        </a>
      </div>

      <form onSubmit={onImport} className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            required
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/10 pl-9 pr-3 py-2.5 outline-none focus:border-purple-400"
          />
        </div>
        <button disabled={importing} className="btn-gradient rounded-lg px-5 font-semibold disabled:opacity-50 flex items-center gap-2">
          {importing && <Loader2 className="animate-spin" size={16} />}
          Importer
        </button>
        <button
          type="button"
          onClick={() => setBatchOpen((v) => !v)}
          className="rounded-lg border border-white/10 px-4 text-sm text-gray-300 hover:bg-white/5 flex items-center gap-1.5"
        >
          <Layers size={15} /> Lot
        </button>
      </form>

      {batchOpen && (
        <form onSubmit={onBatchImport} className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-sm text-gray-400">Une URL par ligne, 25 maximum.</p>
          <textarea
            value={batchUrls}
            onChange={(e) => setBatchUrls(e.target.value)}
            rows={5}
            placeholder={'https://...\nhttps://...'}
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
          <div className="flex items-center gap-3">
            <button disabled={importing} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Importer le lot
            </button>
            {batchSummary && <span className="text-sm text-gray-400">{batchSummary}</span>}
          </div>
        </form>
      )}

      {/* An import runs 30 to 60 seconds — scraping, AI rewrite, then watermarking.
          Without this the screen looks frozen and people assume it crashed. */}
      {importing && (
        <div className="mt-4 rounded-xl border border-purple-400/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-purple-300 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium">Import en cours — laissez cette page ouverte</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Analyse de la page, réécriture par l'IA, puis filigrane sur les photos. Comptez 30 à 60 secondes.
              </p>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-purple-400 to-pink-400" />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold">Mes annonces</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {`${visible.length} / ${products.length} annonce(s)`}
            </span>
            <div className="flex rounded-lg border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                title="Vue grille"
                aria-pressed={view === 'grid'}
                className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                title="Vue liste"
                aria-pressed={view === 'list'}
                className={`rounded-md p-1.5 ${view === 'list' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Category filter, built from the categories actually present so the bar
            never offers a filter that would return nothing. */}
        {usedCategories.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCategoryFilter('')}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                categoryFilter === '' ? 'btn-gradient text-white' : 'border border-white/10 text-gray-300 hover:bg-white/5'
              }`}
            >
              Toutes
            </button>
            {usedCategories.map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setCategoryFilter(id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  categoryFilter === id ? 'btn-gradient text-white' : 'border border-white/10 text-gray-300 hover:bg-white/5'
                }`}
              >
                {label} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans mes annonces…"
          className="mt-3 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
        />

        {/* Selection bar: shown as soon as there is something to act on, so the
            bulk publish button never appears out of nowhere. */}
        {visible.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="inline-flex items-center gap-2 text-xs text-gray-300 hover:text-white"
            >
              {allVisibleSelected ? <CheckSquare size={15} className="text-purple-300" /> : <Square size={15} />}
              {/* Wrapped in its own element: a bare text expression next to another
                  expression is what makes React lose the node and throw
                  « insertBefore / removeChild » when both change at once. */}
              <span>{allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {`${selectedIds.length} sélectionnée(s)`}
              </span>
              {/* L'analyse consomme un crédit par produit : le libellé le dit,
                  personne ne doit le découvrir sur sa facture. */}
              <button
                type="button"
                onClick={() => navigate('/analyse-marche', { state: { productIds: selectedIds } })}
                disabled={!selectedIds.length}
                title="Un crédit par produit analysé"
                className="inline-flex items-center gap-2 rounded-lg border border-purple-400/40 px-4 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-500/10 disabled:opacity-40"
              >
                <TrendingUp size={15} />
                {`Analyse de marché IA (${selectedIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                disabled={!selectedIds.length}
                className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <Radio size={15} />
                {`Publier en lot (${selectedIds.length})`}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm mt-4">Chargement...</p>
        ) : visible.length === 0 ? (
          <p className="text-gray-400 text-sm mt-4">
            {products.length === 0 ? 'Aucune annonce pour le moment.' : 'Aucune annonce ne correspond à ce filtre.'}
          </p>
        ) : view === 'grid' ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {visible.map((p) => {
              const isSelected = selectedIds.includes(p.id)
              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  className={`group relative rounded-xl overflow-hidden border bg-white/5 transition ${
                    isSelected ? 'border-purple-400' : 'border-white/10 hover:border-purple-400/50'
                  }`}
                >
                  <div className="aspect-square bg-black/30">
                    {p.images?.[0] && <img src={assetUrl(p.images[0])} alt="" className="w-full h-full object-cover" />}
                  </div>

                  {/* The card is a link: every control on it has to stop the click
                      from navigating. */}
                  <button
                    type="button"
                    title="Sélectionner pour une publication en lot"
                    aria-pressed={isSelected}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleSelected(p.id)
                    }}
                    className={`absolute top-2 left-2 rounded-lg p-2 shadow-lg backdrop-blur transition ${
                      isSelected ? 'bg-purple-500 text-white' : 'bg-black/60 text-gray-200 hover:bg-black/80'
                    }`}
                  >
                    {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                  </button>

                  {/* Stays visible on touch screens, which have no hover state. */}
                  {/* Always visible rather than revealed on hover: a delete control
                      nobody can find is a delete control that doesn't exist. */}
                  <button
                    type="button"
                    title="Supprimer cette annonce"
                    aria-label={`Supprimer ${p.aiTitle || p.title}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setPendingDelete(p)
                    }}
                    className="absolute top-2 right-2 rounded-lg bg-red-500/85 p-2 text-white shadow-lg backdrop-blur transition hover:bg-red-500 hover:scale-105"
                  >
                    <Trash2 size={17} />
                  </button>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2">{p.aiTitle || p.title}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold text-purple-300">
                        {`${Number(p.sellingPrice ?? 0).toFixed(2)} ${p.currency}`}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLOR[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {visible.map((p) => {
              const isSelected = selectedIds.includes(p.id)
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 transition ${isSelected ? 'bg-purple-500/10' : ''}`}
                >
                  <button
                    type="button"
                    title="Sélectionner pour une publication en lot"
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(p.id)}
                    className={isSelected ? 'text-purple-300' : 'text-gray-500 hover:text-gray-300'}
                  >
                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>

                  <Link to={`/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/30">
                      {p.images?.[0] && (
                        <img src={assetUrl(p.images[0])} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm">{p.aiTitle || p.title}</p>
                    <span className="shrink-0 text-sm font-bold text-purple-300">
                      {`${Number(p.sellingPrice ?? 0).toFixed(2)} ${p.currency}`}
                    </span>
                    <span
                      className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs sm:inline ${STATUS_COLOR[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </Link>

                  <button
                    type="button"
                    title="Supprimer cette annonce"
                    aria-label={`Supprimer ${p.aiTitle || p.title}`}
                    onClick={() => setPendingDelete(p)}
                    className="shrink-0 rounded-lg p-2 text-red-400 transition hover:bg-red-500/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {bulkOpen && (
        <BulkPublishDialog
          productIds={selectedIds}
          platforms={platforms}
          onClose={() => setBulkOpen(false)}
          onDone={load}
        />
      )}
    </Layout>
  )
}
