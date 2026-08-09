import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, Copy, Check, Trash2, ExternalLink } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, downloadWithAuth, assetUrl } from '../lib/api'

const PLATFORMS = [
  { key: 'OWN_SITE', label: 'Mon site', auto: true, sellUrl: null as string | null },
  { key: 'EBAY', label: 'eBay', auto: true, sellUrl: 'https://www.ebay.fr/sl/sell' },
  { key: 'LEBONCOIN', label: 'Leboncoin', auto: false, sellUrl: 'https://www.leboncoin.fr/deposer-une-annonce' },
  { key: 'VINTED', label: 'Vinted', auto: false, sellUrl: 'https://www.vinted.fr/items/new' },
  { key: 'AMAZON', label: 'Amazon', auto: true, sellUrl: 'https://sellercentral.amazon.fr' },
]

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="text-xs flex items-center gap-1 text-purple-300 hover:text-purple-200"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="mt-1 text-sm bg-black/20 rounded-lg p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState<any>(null)
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [assistPanel, setAssistPanel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [purchasePrice, setPurchasePrice] = useState(0)
  const [shippingCost, setShippingCost] = useState(0)
  const [sellingPrice, setSellingPrice] = useState(0)

  const costPrice = purchasePrice + shippingCost
  const grossMargin = sellingPrice - costPrice

  async function load() {
    if (!id) return
    const [p, cats] = await Promise.all([api.getProduct(id), api.categoryPreview(id)])
    setProduct(p)
    setCategories(cats)
    setPurchasePrice(Number(p.price))
    setShippingCost(Number(p.shippingCost ?? 0))
    setSellingPrice(Number(p.sellingPrice ?? 0))
  }

  useEffect(() => {
    load()
  }, [id])

  async function saveField(field: string, value: unknown) {
    if (!id) return
    setSaving(true)
    try {
      await api.updateProduct(id, { [field]: value })
    } finally {
      setSaving(false)
    }
  }

  async function onPublish() {
    if (!id || !selected.length) return
    await api.publishProduct(id, selected)
    const manualTarget = selected.find((s) => PLATFORMS.find((p) => p.key === s && !p.auto))
    if (manualTarget) setAssistPanel(manualTarget)
    await load()
  }

  async function onDelete() {
    if (!id) return
    await api.deleteProduct(id)
    navigate('/dashboard')
  }

  if (!product) return <Layout><p className="text-gray-400">Chargement...</p></Layout>

  const finalPrice = sellingPrice.toFixed(2)
  const activeAssist = PLATFORMS.find((p) => p.key === assistPanel)

  return (
    <Layout>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{product.aiTitle || product.title}</h1>
          <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1 mt-1">
            Source : {product.sourceSite} <ExternalLink size={11} />
          </a>
        </div>
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 p-2" title="Supprimer">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div>
          <div className="grid grid-cols-3 gap-2">
            {(product.images as string[]).map((img, i) => (
              <img key={i} src={assetUrl(img)} alt="" className="aspect-square rounded-lg object-cover bg-black/20" />
            ))}
          </div>
          <button
            onClick={() => downloadWithAuth(`/products/${id}/photos.zip`, `photos-${id}.zip`)}
            className="mt-3 inline-flex items-center gap-2 text-sm rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            <Download size={15} /> Télécharger les photos (.zip)
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400">Titre (remixé par l'IA)</label>
            <input
              defaultValue={product.aiTitle}
              onBlur={(e) => saveField('aiTitle', e.target.value)}
              className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Description (remixée par l'IA)</label>
            <textarea
              defaultValue={product.aiDescription}
              onBlur={(e) => saveField('aiDescription', e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
            <h3 className="text-sm font-bold">Calcul de marge</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">Prix d'achat fournisseur</label>
                <input
                  type="number"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(Number(e.target.value))}
                  onBlur={(e) => saveField('price', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Frais de transport</label>
                <input
                  type="number"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(Number(e.target.value))}
                  onBlur={(e) => saveField('shippingCost', Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Prix de revente (prix affiché sur l'annonce)</label>
              <input
                type="number"
                step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                onBlur={(e) => saveField('sellingPrice', Number(e.target.value))}
                className="mt-1 w-full rounded-lg bg-white/10 border border-purple-400/40 px-3 py-2 text-base font-bold text-purple-200 outline-none focus:border-purple-400"
              />
            </div>

            <div className="border-t border-white/10 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Coût de revient</span>
                <span>{costPrice.toFixed(2)} {product.currency}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Marge brute</span>
                <span className={grossMargin >= 0 ? 'text-emerald-300' : 'text-red-400'}>
                  {grossMargin >= 0 ? '+' : ''}{grossMargin.toFixed(2)} {product.currency}
                  {costPrice > 0 && (
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      ({((grossMargin / costPrice) * 100).toFixed(0)} %)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                const suggested = Number(((purchasePrice + shippingCost) * 1.5).toFixed(2))
                setSellingPrice(suggested)
                saveField('sellingPrice', suggested)
              }}
              className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 w-full"
            >
              Appliquer une marge de +50 %
            </button>
          </div>
          {saving && <p className="text-xs text-gray-500">Enregistrement...</p>}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="font-bold">Publier</h2>
        <p className="text-xs text-gray-400 mt-1">
          Catégorie source : {product.sourceCategory || 'non détectée'}
        </p>
        <div className="grid sm:grid-cols-2 gap-2 mt-4">
          {PLATFORMS.map((p) => {
            const pub = product.publications?.find((x: any) => x.platform === p.key)
            return (
              <label key={p.key} className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(p.key)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, p.key] : s.filter((x) => x !== p.key)))
                  }
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.label} {!p.auto && <span className="text-[10px] text-orange-300">(assisté)</span>}</p>
                  <p className="text-xs text-gray-400">{categories[p.key]}</p>
                </div>
                {pub && (
                  <span className={`text-xs rounded-full px-2 py-0.5 ${pub.status === 'PUBLISHED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {pub.status === 'PUBLISHED' ? 'Publié' : 'En attente'}
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <button onClick={onPublish} disabled={!selected.length} className="btn-gradient mt-4 rounded-lg px-5 py-2.5 font-semibold disabled:opacity-50">
          Publier sur {selected.length || '...'} plateforme(s)
        </button>
      </div>

      {activeAssist && (
        <div className="mt-6 rounded-xl border border-orange-400/30 bg-orange-500/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Assistant {activeAssist.label} — pas d'API, à coller manuellement</h2>
            <div className="flex items-center gap-2">
              <a href={activeAssist.sellUrl!} target="_blank" rel="noreferrer" className="text-sm rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
                Ouvrir {activeAssist.label} ↗
              </a>
              <button onClick={() => setAssistPanel(null)} className="text-gray-400 hover:text-white text-sm">✕</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <CopyField label="Titre" value={product.aiTitle} />
            <CopyField label="Prix" value={`${finalPrice} ${product.currency}`} />
            <CopyField label="Description" value={product.aiDescription} />
            <CopyField label="Catégorie suggérée" value={categories[activeAssist.key] || ''} />
          </div>
          <button
            onClick={() => downloadWithAuth(`/products/${id}/photos.zip`, `photos-${id}.zip`)}
            className="mt-3 inline-flex items-center gap-2 text-sm rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            <Download size={15} /> Télécharger les photos à glisser dans le formulaire
          </button>
          <p className="text-xs text-gray-500 mt-3">
            Astuce : l'extension navigateur DropShip Pro (à venir) remplira ce formulaire automatiquement.
          </p>
        </div>
      )}
    </Layout>
  )
}
