import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Loader2, Layers, Puzzle } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'

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
      setProducts(await api.listProducts())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    api.listCategories().then(setCatalog)
  }, [])

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

  return (
    <Layout>
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

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold">Mes annonces</h2>
          <span className="text-xs text-gray-400">
            {visible.length} / {products.length} annonce(s)
          </span>
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

        {loading ? (
          <p className="text-gray-400 text-sm mt-4">Chargement...</p>
        ) : visible.length === 0 ? (
          <p className="text-gray-400 text-sm mt-4">
            {products.length === 0 ? 'Aucune annonce pour le moment.' : 'Aucune annonce ne correspond à ce filtre.'}
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {visible.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:border-purple-400/50 transition"
              >
                <div className="aspect-square bg-black/30">
                  {p.images?.[0] && <img src={assetUrl(p.images[0])} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium line-clamp-2">{p.aiTitle || p.title}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-bold text-purple-300">
                      {Number(p.sellingPrice ?? 0).toFixed(2)} {p.currency}
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
