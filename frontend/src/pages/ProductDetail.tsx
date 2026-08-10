import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, Copy, Check, Trash2, ExternalLink, Radio } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, downloadWithAuth, assetUrl } from '../lib/api'
import { PublishDialog, type PlatformInfo } from '../components/PublishDialog'

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
  const [assistPanel, setAssistPanel] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [catalog, setCatalog] = useState<Array<{ id: string; group: string; label: string }>>([])
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
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

  useEffect(() => {
    api.listCategories().then(setCatalog)
    api.listPlatforms().then(setPlatforms)
  }, [])

  async function saveField(field: string, value: unknown) {
    if (!id) return
    setSaving(true)
    try {
      await api.updateProduct(id, { [field]: value })
    } finally {
      setSaving(false)
    }
  }

  const variants: Record<string, string[]> = product?.variants ?? {}
  const bulletPoints: string[] = product?.bulletPoints ?? []
  const attributes: Record<string, string> = product?.attributes ?? {}

  /** Saves images and reflects the new order locally so the grid doesn't flicker. */
  async function saveImages(next: string[]) {
    setProduct({ ...product, images: next })
    await saveField('images', next)
  }

  function moveImage(index: number, direction: -1 | 1) {
    const next = [...(product.images as string[])]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    saveImages(next)
  }

  function removeImage(index: number) {
    saveImages((product.images as string[]).filter((_, i) => i !== index))
  }

  async function saveVariants(next: Record<string, string[]>) {
    setProduct({ ...product, variants: next })
    await saveField('variants', next)
  }

  function addVariantGroup() {
    // Empty key would collide with an existing blank row, so number the new one.
    const name = variants['Nouvelle option'] ? `Option ${Object.keys(variants).length + 1}` : 'Nouvelle option'
    saveVariants({ ...variants, [name]: [] })
  }

  function removeVariantGroup(name: string) {
    const next = { ...variants }
    delete next[name]
    saveVariants(next)
  }

  function renameVariantGroup(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    // Rebuild in place so renaming doesn't reorder the rows under the user.
    const next = Object.fromEntries(
      Object.entries(variants).map(([k, v]) => (k === oldName ? [trimmed, v] : [k, v])),
    )
    saveVariants(next)
  }

  function setVariantValues(name: string, raw: string) {
    const values = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    saveVariants({ ...variants, [name]: values })
  }

  async function onDelete() {
    if (!id) return
    await api.deleteProduct(id)
    navigate('/dashboard')
  }

  if (!product) return <Layout><p className="text-gray-400">Chargement...</p></Layout>

  const finalPrice = sellingPrice.toFixed(2)
  const activeAssist = platforms.find((p) => p.id === assistPanel)

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
              <div key={img + i} className="relative group">
                <img src={assetUrl(img)} alt="" className="aspect-square w-full rounded-lg object-cover bg-black/20" />
                {i === 0 && (
                  <span className="absolute top-1 left-1 rounded bg-purple-600/90 px-1.5 py-0.5 text-[10px] font-semibold">
                    Principale
                  </span>
                )}
                {/* Controls stay visible on touch screens, where there is no hover. */}
                <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition max-md:opacity-100">
                  <button
                    onClick={() => moveImage(i, -1)}
                    disabled={i === 0}
                    title="Déplacer vers la gauche"
                    className="rounded bg-black/70 px-1.5 py-0.5 text-xs disabled:opacity-30 hover:bg-black/90"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => removeImage(i)}
                    title="Supprimer cette photo"
                    className="rounded bg-black/70 px-1.5 py-0.5 text-xs text-red-300 hover:bg-black/90"
                  >
                    ✕
                  </button>
                  <button
                    onClick={() => moveImage(i, 1)}
                    disabled={i === (product.images as string[]).length - 1}
                    title="Déplacer vers la droite"
                    className="rounded bg-black/70 px-1.5 py-0.5 text-xs disabled:opacity-30 hover:bg-black/90"
                  >
                    ›
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            La première photo sert de vignette principale sur toutes les plateformes.
          </p>
          <button
            onClick={() => downloadWithAuth(`/products/${id}/photos.zip`, `photos-${id}.zip`)}
            className="mt-3 inline-flex items-center gap-2 text-sm rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            <Download size={15} /> Télécharger les photos (.zip)
          </button>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Variantes disponibles</h3>
              <button
                onClick={addVariantGroup}
                className="text-xs rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5"
              >
                + Option
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Tailles, couleurs… reprises dans l'annonce. Séparez les valeurs par des virgules.
            </p>

            {Object.keys(variants).length === 0 ? (
              <p className="text-xs text-gray-500 mt-3">
                Aucune variante. L'extension les récupère automatiquement depuis la page fournisseur.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {Object.entries(variants).map(([name, values]) => (
                  <div key={name} className="flex items-start gap-2">
                    <input
                      defaultValue={name}
                      onBlur={(e) => renameVariantGroup(name, e.target.value)}
                      placeholder="Taille"
                      className="w-28 shrink-0 rounded-lg bg-white/10 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <input
                      defaultValue={values.join(', ')}
                      onBlur={(e) => setVariantValues(name, e.target.value)}
                      placeholder="S, M, L, XL"
                      className="flex-1 rounded-lg bg-white/10 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <button
                      onClick={() => removeVariantGroup(name)}
                      title="Supprimer cette option"
                      className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-red-300 hover:bg-white/5"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-bold">Arguments de vente</h3>
            <p className="text-xs text-gray-500 mt-1">
              Indexés par Amazon, Cdiscount et les marketplaces Mirakl. Une ligne par argument.
            </p>
            {bulletPoints.length === 0 ? (
              <p className="text-xs text-gray-500 mt-3">Aucun argument généré.</p>
            ) : (
              <textarea
                defaultValue={bulletPoints.join('\n')}
                onBlur={(e) =>
                  saveField(
                    'bulletPoints',
                    e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
                  )
                }
                rows={Math.min(10, bulletPoints.length + 1)}
                className="mt-2 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-xs outline-none focus:border-purple-400"
              />
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Attributs produit</h3>
              <span className="text-xs text-gray-500">{Object.keys(attributes).length} attribut(s)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Convertis en filtres de recherche par les marketplaces — plus il y en a, mieux le produit ressort.
            </p>
            {Object.keys(attributes).length === 0 ? (
              <p className="text-xs text-gray-500 mt-3">Aucun attribut généré.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {Object.entries(attributes).map(([name, value]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-gray-400 truncate" title={name}>
                      {name}
                    </span>
                    <input
                      defaultValue={value}
                      onBlur={(e) => saveField('attributes', { ...attributes, [name]: e.target.value })}
                      className="flex-1 rounded-lg bg-white/10 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-bold">Mots-clés SEO</h3>
            <textarea
              defaultValue={product.metaKeywords ?? ''}
              onBlur={(e) => saveField('metaKeywords', e.target.value)}
              rows={3}
              placeholder="mot-clé 1, mot-clé 2, …"
              className="mt-2 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-xs outline-none focus:border-purple-400"
            />
            <p className="text-xs text-gray-500 mt-1">
              {(product.metaKeywords ?? '').split(',').filter((k: string) => k.trim()).length} mot(s)-clé(s)
            </p>
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

        <div className="mt-3">
          <label className="text-xs text-gray-400">
            Catégorie du produit
            {product.sourceCategory && (
              <span className="text-gray-500"> — détectée sur la source : « {product.sourceCategory} »</span>
            )}
          </label>
          <select
            value={product.categoryId ?? ''}
            onChange={async (e) => {
              const value = e.target.value || null
              setProduct({ ...product, categoryId: value })
              await saveField('categoryId', value)
              if (id) setCategories(await api.categoryPreview(id))
            }}
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          >
            <option value="">— Choisir une catégorie —</option>
            {[...new Set(catalog.map((c) => c.group))].map((group) => (
              <optgroup key={group} label={group}>
                {catalog
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        {/* Existing publications, so the seller sees at a glance where the listing already went. */}
        {product.publications?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {product.publications.map((pub: any) => {
              const info = platforms.find((p) => p.id === pub.platform)
              return (
                <span
                  key={pub.platform}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info?.color ?? '#a855f7' }} />
                  {info?.label ?? pub.platform}
                  <span className={pub.status === 'PUBLISHED' ? 'text-emerald-300' : 'text-yellow-300'}>
                    {pub.status === 'PUBLISHED' ? 'publié' : 'en attente'}
                  </span>
                </span>
              )
            })}
          </div>
        )}

        <button
          onClick={() => setPublishOpen(true)}
          className="btn-gradient mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold"
        >
          <Radio size={17} /> Publier cette annonce
        </button>
      </div>

      {publishOpen && id && (
        <PublishDialog
          productId={id}
          platforms={platforms}
          onClose={() => setPublishOpen(false)}
          onPublished={async (chosen) => {
            await api.publishProduct(id, chosen)
            await load()
          }}
        />
      )}

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
            <CopyField label="Catégorie suggérée" value={categories[activeAssist.id] || ''} />
            {Object.keys(variants).length > 0 && (
              <CopyField
                label="Variantes"
                value={Object.entries(variants)
                  .map(([name, values]) => `${name} : ${values.join(', ')}`)
                  .join('\n')}
              />
            )}
            {bulletPoints.length > 0 && <CopyField label="Arguments de vente" value={bulletPoints.join('\n')} />}
            {Object.keys(attributes).length > 0 && (
              <CopyField
                label="Attributs"
                value={Object.entries(attributes)
                  .map(([k, v]) => `${k} : ${v}`)
                  .join('\n')}
              />
            )}
            {product.metaKeywords && <CopyField label="Mots-clés" value={product.metaKeywords} />}
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
