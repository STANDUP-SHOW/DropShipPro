import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Download,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Radio,
  ImagePlus,
  Sparkles,
  Tags,
  ListChecks,
  Search,
  Layers3,
  Calculator,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, downloadWithAuth, assetUrl, uploadProductImages } from '../lib/api'
import { PublishDialog, type PlatformInfo } from '../components/PublishDialog'
import { LoadingScreen } from '../components/LoadingScreen'
import { PriceInput } from '../components/PriceInput'

/** Section card — one visual container per topic, instead of one long column. */
function Card({
  icon: Icon,
  title,
  hint,
  action,
  children,
}: {
  icon: React.ElementType
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Icon size={17} className="mt-0.5 shrink-0 text-purple-300" />
          <div>
            <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
            {hint && <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{hint}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  )
}

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
          className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/25 p-2 text-sm">{value}</p>
    </div>
  )
}

const field =
  'w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none transition focus:border-purple-400/70 focus:bg-white/[0.08]'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [product, setProduct] = useState<any>(null)
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [catalog, setCatalog] = useState<Array<{ id: string; group: string; label: string }>>([])
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])

  const [assistPanel, setAssistPanel] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [active, setActive] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [purchasePrice, setPurchasePrice] = useState(0)
  const [shippingCost, setShippingCost] = useState(0)
  const [sellingPrice, setSellingPrice] = useState(0)

  const costPrice = purchasePrice + shippingCost
  const grossMargin = sellingPrice - costPrice
  const marginRate = costPrice > 0 ? (grossMargin / costPrice) * 100 : null

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

  async function saveField(fieldName: string, value: unknown) {
    if (!id) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.updateProduct(id, { [fieldName]: value })
      setSavedAt(new Date())
    } catch (err) {
      // Silent failure is the worst case here: the seller believes the change is
      // recorded and publishes the old text.
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const variants: Record<string, string[]> = product?.variants ?? {}
  const bulletPoints: string[] = product?.bulletPoints ?? []
  const attributes: Record<string, string> = product?.attributes ?? {}
  const images: string[] = product?.images ?? []

  /** Full save behind the explicit button. */
  async function saveAll() {
    if (!id || !product) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.updateProduct(id, {
        aiTitle: product.aiTitle,
        aiDescription: product.aiDescription,
        price: purchasePrice,
        shippingCost,
        sellingPrice,
        images,
        variants,
        bulletPoints,
        attributes,
        metaKeywords: product.metaKeywords ?? '',
        categoryId: product.categoryId ?? null,
      })
      setSavedAt(new Date())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  async function saveImages(next: string[]) {
    setProduct({ ...product, images: next })
    setActive((i) => Math.min(i, Math.max(0, next.length - 1)))
    await saveField('images', next)
  }

  function moveImage(index: number, direction: -1 | 1) {
    const next = [...images]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setActive(target)
    saveImages(next)
  }

  async function addPhotos(files: File[]) {
    if (!id || !files.length) return
    const picked = files.filter((f) => f.type.startsWith('image/'))
    if (!picked.length) return setPhotoError('Seules des images sont acceptées')

    setPhotoError(null)
    setUploading(true)
    try {
      const res = await uploadProductImages(id, picked)
      setProduct((p: any) => ({ ...p, images: res.images }))
      setSavedAt(new Date())
      if (res.added < picked.length) {
        setPhotoError(`${res.added} photo(s) ajoutée(s) sur ${picked.length} — limite de 10 par annonce.`)
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Ajout impossible')
    } finally {
      setUploading(false)
    }
  }

  async function saveVariants(next: Record<string, string[]>) {
    setProduct({ ...product, variants: next })
    await saveField('variants', next)
  }

  async function onDelete() {
    if (!id) return
    await api.deleteProduct(id)
    navigate('/dashboard')
  }

  if (!product) return <LoadingScreen message="Ouverture de l'annonce…" />

  const activeAssist = platforms.find((p) => p.id === assistPanel)
  const published = product.publications ?? []

  return (
    <Layout>
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-snug">{product.aiTitle || product.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-gray-400 hover:text-gray-200"
            >
              {product.sourceSite} <ExternalLink size={11} />
            </a>
            {published.map((pub: any) => {
              const info = platforms.find((p) => p.id === pub.platform)
              return (
                <span
                  key={pub.platform}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info?.color ?? '#a855f7' }} />
                  {info?.label ?? pub.platform}
                  <span className={pub.status === 'PUBLISHED' ? 'text-emerald-300' : 'text-yellow-300'}>
                    {pub.status === 'PUBLISHED' ? 'publié' : 'en attente'}
                  </span>
                </span>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => setConfirmDelete(true)}
          title="Supprimer cette annonce"
          className="rounded-xl border border-white/10 p-2.5 text-red-400 transition hover:border-red-400/40 hover:bg-red-500/10"
        >
          <Trash2 size={17} />
        </button>
      </div>

      {/* ---------- Barre d'état, collée en haut au défilement ---------- */}
      <div className="sticky top-0 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1b1633]/95 px-4 py-3 backdrop-blur">
        <span className="flex items-center gap-2 text-sm">
          {saving ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" />
              <span className="text-gray-300">Enregistrement…</span>
            </>
          ) : saveError ? (
            <span className="text-red-400">⚠ {saveError}</span>
          ) : savedAt ? (
            <span className="text-emerald-300">
              ✓ Enregistré à {savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-gray-400">Enregistrement automatique à chaque modification</span>
          )}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={saveAll}
            disabled={saving}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/5 disabled:opacity-50"
          >
            Valider l'annonce
          </button>
          <button
            onClick={() => setPublishOpen(true)}
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold"
          >
            <Radio size={15} /> Publier
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ---------- Colonne visuelle ---------- */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="relative overflow-hidden rounded-xl bg-black/30">
              {images.length ? (
                <>
                  <img
                    src={assetUrl(images[active] ?? images[0])}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  {active === 0 && (
                    <span className="absolute left-3 top-3 rounded-full bg-purple-600/90 px-2.5 py-1 text-[10px] font-semibold tracking-wide">
                      PHOTO PRINCIPALE
                    </span>
                  )}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setActive((i) => (i - 1 + images.length) % images.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 backdrop-blur transition hover:bg-black/80"
                        aria-label="Photo précédente"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => setActive((i) => (i + 1) % images.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 backdrop-blur transition hover:bg-black/80"
                        aria-label="Photo suivante"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="grid aspect-square place-items-center text-sm text-gray-500">Aucune photo</div>
              )}
            </div>

            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {images.map((img, i) => (
                  <div key={img + i} className="group relative">
                    <button
                      onClick={() => setActive(i)}
                      className={`block w-full overflow-hidden rounded-lg border-2 transition ${
                        i === active ? 'border-purple-400' : 'border-transparent hover:border-white/25'
                      }`}
                    >
                      <img src={assetUrl(img)} alt="" className="aspect-square w-full object-cover" />
                    </button>
                    <button
                      onClick={() => saveImages(images.filter((_, index) => index !== i))}
                      title="Supprimer cette photo"
                      className="absolute -right-1 -top-1 rounded-full bg-red-500/90 p-1 text-white opacity-0 transition group-hover:opacity-100 max-md:opacity-100"
                    >
                      <X size={11} />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 flex justify-between px-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => moveImage(i, -1)}
                        disabled={i === 0}
                        className="rounded bg-black/70 px-1 text-[10px] disabled:opacity-25"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => moveImage(i, 1)}
                        disabled={i === images.length - 1}
                        className="rounded bg-black/70 px-1 text-[10px] disabled:opacity-25"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                addPhotos([...e.dataTransfer.files])
              }}
              className={`mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-4 text-center transition ${
                dragging ? 'border-purple-400 bg-purple-500/10' : 'border-white/12 hover:border-white/25'
              }`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                onChange={(e) => {
                  addPhotos([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <ImagePlus size={19} className="text-purple-300" />
              <span className="text-sm font-medium">{uploading ? 'Traitement…' : 'Ajouter mes photos'}</span>
              <span className="text-xs text-gray-500">
                Glissez-déposez ou cliquez · 10 photos max · filigrane automatique
              </span>
            </label>
            {photoError && <p className="mt-2 text-xs text-red-400">{photoError}</p>}

            <button
              onClick={() => downloadWithAuth(`/products/${id}/photos.zip`, `photos-${id}.zip`)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5"
            >
              <Download size={15} /> Télécharger les photos (.zip)
            </button>
          </div>

          {/* ---------- Marge ---------- */}
          <Card icon={Calculator} title="Calcul de marge">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">Prix d'achat</label>
                <PriceInput
                  value={purchasePrice}
                  onLiveChange={setPurchasePrice}
                  onCommit={(v) => {
                    setPurchasePrice(v)
                    saveField('price', v)
                  }}
                  className={`${field} mt-1`}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Transport</label>
                <PriceInput
                  value={shippingCost}
                  onLiveChange={setShippingCost}
                  onCommit={(v) => {
                    setShippingCost(v)
                    saveField('shippingCost', v)
                  }}
                  className={`${field} mt-1`}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-400">Prix de revente — affiché sur l'annonce</label>
              <PriceInput
                value={sellingPrice}
                onLiveChange={setSellingPrice}
                onCommit={(v) => {
                  setSellingPrice(v)
                  saveField('sellingPrice', v)
                }}
                className="mt-1 w-full rounded-xl border border-purple-400/40 bg-purple-500/10 px-3 py-3 text-lg font-bold text-purple-100 outline-none focus:border-purple-400"
              />
            </div>

            <div className="mt-4 rounded-xl bg-black/25 p-3.5">
              <div className="flex items-baseline justify-between text-sm text-gray-400">
                <span>Coût de revient</span>
                <span className="tabular-nums">
                  {costPrice.toFixed(2)} {product.currency}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2">
                <span className="text-sm font-medium">Marge brute</span>
                <span
                  className={`text-lg font-bold tabular-nums ${grossMargin >= 0 ? 'text-emerald-300' : 'text-red-400'}`}
                >
                  {grossMargin >= 0 ? '+' : ''}
                  {grossMargin.toFixed(2)} {product.currency}
                  {marginRate !== null && (
                    <span className="ml-2 text-xs font-normal text-gray-400">({marginRate.toFixed(0)} %)</span>
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                const suggested = Number((costPrice * 1.5).toFixed(2))
                setSellingPrice(suggested)
                saveField('sellingPrice', suggested)
              }}
              className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs transition hover:bg-white/5"
            >
              Appliquer une marge de +50 %
            </button>
          </Card>
        </div>

        {/* ---------- Colonne contenu ---------- */}
        <div className="space-y-5">
          <Card icon={Sparkles} title="Annonce" hint="Rédigée par l'IA, modifiable librement.">
            <label className="text-xs text-gray-400">Titre</label>
            <input
              defaultValue={product.aiTitle}
              onBlur={(e) => {
                setProduct({ ...product, aiTitle: e.target.value })
                saveField('aiTitle', e.target.value)
              }}
              className={`${field} mt-1`}
            />
            <p className="mt-1 text-right text-xs text-gray-500">{(product.aiTitle ?? '').length} caractères</p>

            <label className="mt-3 block text-xs text-gray-400">Description</label>
            <textarea
              defaultValue={product.aiDescription}
              onBlur={(e) => {
                setProduct({ ...product, aiDescription: e.target.value })
                saveField('aiDescription', e.target.value)
              }}
              rows={7}
              className={`${field} mt-1 leading-relaxed`}
            />
          </Card>

          <Card
            icon={ListChecks}
            title="Arguments de vente"
            hint="Indexés par Amazon, Cdiscount et les marketplaces Mirakl. Une ligne par argument."
          >
            {bulletPoints.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun argument généré.</p>
            ) : (
              <textarea
                defaultValue={bulletPoints.join('\n')}
                onBlur={(e) =>
                  saveField(
                    'bulletPoints',
                    e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
                  )
                }
                rows={Math.min(9, bulletPoints.length + 1)}
                className={`${field} leading-relaxed`}
              />
            )}
          </Card>

          <Card
            icon={Tags}
            title="Attributs produit"
            hint="Convertis en filtres de recherche : plus il y en a, mieux le produit ressort."
            action={
              <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs text-gray-400">
                {Object.keys(attributes).length}
              </span>
            }
          >
            {Object.keys(attributes).length === 0 ? (
              <p className="text-xs text-gray-500">Aucun attribut généré.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(attributes).map(([name, value]) => (
                  <div key={name}>
                    <label className="text-xs text-gray-500">{name}</label>
                    <input
                      defaultValue={value}
                      onBlur={(e) => saveField('attributes', { ...attributes, [name]: e.target.value })}
                      className={`${field} mt-0.5 py-2`}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            icon={Layers3}
            title="Variantes disponibles"
            hint="Tailles, couleurs… Séparez les valeurs par des virgules."
            action={
              <button
                onClick={() => {
                  const name = variants['Nouvelle option']
                    ? `Option ${Object.keys(variants).length + 1}`
                    : 'Nouvelle option'
                  saveVariants({ ...variants, [name]: [] })
                }}
                className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs transition hover:bg-white/5"
              >
                + Option
              </button>
            }
          >
            {Object.keys(variants).length === 0 ? (
              <p className="text-xs text-gray-500">
                Aucune variante détectée. L'IA les extrait de la page fournisseur ; ajoutez-les à la
                main si besoin.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(variants).map(([name, values]) => (
                  <div key={name} className="flex items-start gap-2">
                    <input
                      defaultValue={name}
                      onBlur={(e) => {
                        const trimmed = e.target.value.trim()
                        if (!trimmed || trimmed === name) return
                        // Rebuilt in place so renaming doesn't reorder the rows.
                        saveVariants(
                          Object.fromEntries(
                            Object.entries(variants).map(([k, v]) => (k === name ? [trimmed, v] : [k, v])),
                          ),
                        )
                      }}
                      placeholder="Taille"
                      className={`${field} w-28 shrink-0 py-2 text-xs`}
                    />
                    <input
                      defaultValue={values.join(', ')}
                      onBlur={(e) =>
                        saveVariants({
                          ...variants,
                          [name]: e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
                        })
                      }
                      placeholder="S, M, L, XL"
                      className={`${field} flex-1 py-2 text-xs`}
                    />
                    <button
                      onClick={() => {
                        const next = { ...variants }
                        delete next[name]
                        saveVariants(next)
                      }}
                      className="shrink-0 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-red-300 transition hover:bg-red-500/10"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card icon={Search} title="Référencement">
            <label className="text-xs text-gray-400">Mots-clés</label>
            <textarea
              defaultValue={product.metaKeywords ?? ''}
              onBlur={(e) => {
                setProduct({ ...product, metaKeywords: e.target.value })
                saveField('metaKeywords', e.target.value)
              }}
              rows={3}
              placeholder="mot-clé 1, mot-clé 2, …"
              className={`${field} mt-1 text-xs leading-relaxed`}
            />
            <p className="mt-1 text-xs text-gray-500">
              {(product.metaKeywords ?? '').split(',').filter((k: string) => k.trim()).length} mot(s)-clé(s)
            </p>

            <label className="mt-3 block text-xs text-gray-400">
              Catégorie
              {product.sourceCategory && (
                <span className="text-gray-600"> · détectée : « {product.sourceCategory} »</span>
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
              className={`${field} mt-1`}
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

            <div className="mt-3 flex flex-wrap gap-1.5">
              {platforms
                .filter((p) => !p.unavailable && categories[p.id])
                .map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs"
                    title={categories[p.id]}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-gray-400">{p.label}</span>
                    <span className="max-w-[13rem] truncate text-gray-500">{categories[p.id]}</span>
                  </span>
                ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ---------- Assistant de publication manuelle ---------- */}
      {activeAssist && (
        <div className="mt-6 rounded-2xl border border-orange-400/30 bg-orange-500/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">{activeAssist.label} — à coller manuellement</h2>
            <div className="flex items-center gap-2">
              {activeAssist.sellUrl && (
                <a
                  href={activeAssist.sellUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                >
                  Ouvrir {activeAssist.label} ↗
                </a>
              )}
              <button onClick={() => setAssistPanel(null)} className="p-1 text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CopyField label="Titre" value={product.aiTitle ?? ''} />
            <CopyField label="Prix" value={`${sellingPrice.toFixed(2)} ${product.currency}`} />
            <CopyField label="Description" value={product.aiDescription ?? ''} />
            <CopyField label="Catégorie suggérée" value={categories[activeAssist.id] ?? ''} />
            {Object.keys(variants).length > 0 && (
              <CopyField
                label="Variantes"
                value={Object.entries(variants)
                  .map(([name, values]) => `${name} : ${values.join(', ')}`)
                  .join('\n')}
              />
            )}
            {bulletPoints.length > 0 && <CopyField label="Arguments de vente" value={bulletPoints.join('\n')} />}
          </div>
        </div>
      )}

      {publishOpen && id && (
        <PublishDialog
          productId={id}
          platforms={platforms}
          onClose={() => setPublishOpen(false)}
          onPublished={async (chosen) => {
            await api.publishProduct(id, chosen)
            const manual = chosen.find((c) => platforms.find((p) => p.id === c && !p.automatable))
            if (manual) setAssistPanel(manual)
            await load()
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1b1633] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold">Supprimer cette annonce ?</h2>
            <p className="mt-2 text-sm text-gray-300">{product.aiTitle || product.title}</p>
            <p className="mt-2 text-xs text-gray-500">
              L'annonce et ses photos filigranées seront définitivement effacées.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                onClick={onDelete}
                className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
