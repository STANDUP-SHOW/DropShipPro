import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, MapPin, ExternalLink, MessageSquare, Package, Save, HelpCircle, Plus, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AgentBar } from '../components/AgentBar'
import { api } from '../lib/api'

type Order = Awaited<ReturnType<typeof api.listOrders>>[number]
type Detail = Awaited<ReturnType<typeof api.getOrder>>

const STATUS_LABEL: Record<string, string> = {
  NEW: 'À commander',
  ORDERED_FROM_SUPPLIER: 'Commandé au fournisseur',
  SHIPPED: 'Expédié',
  DELIVERED: 'Livré',
  REFUNDED: 'Remboursé',
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-amber-400/15 text-amber-300',
  ORDERED_FROM_SUPPLIER: 'bg-sky-400/15 text-sky-300',
  SHIPPED: 'bg-violet-400/15 text-violet-300',
  DELIVERED: 'bg-emerald-400/15 text-emerald-300',
  REFUNDED: 'bg-red-400/15 text-red-300',
}

const TABS = [
  { id: 'EN_COURS', label: 'En cours' },
  { id: 'DELIVERED', label: 'Livrées' },
  { id: 'ALL', label: 'Toutes' },
] as const

function address(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, string>
  return {
    street: a.street ?? '',
    zip: a.zip ?? '',
    city: a.city ?? '',
    country: a.country ?? '',
    phone: a.phone ?? '',
  }
}

/**
 * Les livraisons.
 *
 * Une commande, une adresse, un colis. Le suivi détaillé n'apparaît que si une
 * clé de suivi est configurée côté serveur ; sans elle, le lien vers le
 * transporteur reste affiché — ce qui couvre l'essentiel du besoin sans imposer
 * un abonnement à qui débute.
 */
export default function Deliveries() {
  const [orders, setOrders] = useState<Order[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('EN_COURS')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newOrderId, setNewOrderId] = useState('')
  const [newTracking, setNewTracking] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const navigate = useNavigate()

  function load() {
    setLoading(true)
    api
      .listOrders()
      .then(setOrders)
      .catch(() => setError('Impossible de charger vos commandes'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  useEffect(() => {
    if (!openId) {
      setDetail(null)
      return
    }
    setError(null)
    api.getOrder(openId).then((d) => {
      setDetail(d)
      setTracking(d.trackingNumber ?? '')
    })
  }, [openId])

  // Ce qui peut être expédié : tout ce qui n'a pas encore de numéro et n'est ni
  // livré ni remboursé. Proposer une commande déjà livrée n'aurait aucun sens.
  const shippable = orders.filter(
    (o) => !o.trackingNumber && o.status !== 'DELIVERED' && o.status !== 'REFUNDED',
  )

  const shown = orders.filter((o) =>
    tab === 'ALL' ? true : tab === 'DELIVERED' ? o.status === 'DELIVERED' : o.status !== 'DELIVERED',
  )

  async function saveTracking() {
    if (!detail || !tracking.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.setTracking(detail.id, tracking.trim())
      const fresh = await api.getOrder(detail.id)
      setDetail(fresh)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function addShipment() {
    if (!newOrderId || !newTracking.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.setTracking(newOrderId, newTracking.trim(), undefined, true)
      setAdded(
        res.tracking.generic
          ? `Expédition enregistrée. Transporteur non reconnu : le suivi universel sera utilisé.`
          : `Expédition enregistrée — ${res.tracking.carrierLabel}.`,
      )
      setNewTracking('')
      setNewOrderId('')
      setAdding(false)
      load()
      // La commande expédiée s'ouvre : le vendeur voit tout de suite le suivi.
      setOpenId(res && newOrderId ? newOrderId : null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function contact() {
    if (!detail) return
    setBusy(true)
    try {
      const res = await api.contactBuyer(detail.id)
      navigate(`/messages?conversation=${res.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      {/* L'agent en charge de ce qui se decide ici : une question posee devant
          l ecran ne devrait pas obliger a quitter l ecran. */}
      <AgentBar
        agentKey="livraisons"
        nom="Yann"
        emoji="🚚"
        exemple="Demandez à Yann : ce colis n'a pas bougé depuis huit jours, je réponds quoi ?"
      />
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Truck size={22} className="text-emerald-400" />
        <span>Livraisons</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Vos commandes en cours, l'adresse de l'acheteur et le suivi de son colis.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="btn-gradient inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold"
        >
          {adding ? <X size={14} /> : <Plus size={14} />}
          <span>{adding ? 'Annuler' : 'Ajouter une expédition'}</span>
        </button>
        <span className="text-xs text-gray-500">
          {shippable.length
            ? `${shippable.length} commande(s) en attente d'expédition`
            : 'Toutes vos commandes ont un numéro de suivi'}
        </span>
      </div>

      {adding && (
        <div className="mt-3 max-w-2xl rounded-xl border border-white/10 bg-white/5 p-4">
          {!shippable.length ? (
            <p className="text-sm text-gray-400">
              Aucune commande n'attend d'expédition.
            </p>
          ) : (
            <>
              <label className="block text-xs text-gray-400">Commande à expédier</label>
              <select
                value={newOrderId}
                onChange={(e) => setNewOrderId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              >
                <option value="">Choisissez une commande…</option>
                {shippable.map((o) => (
                  <option key={o.id} value={o.id}>
                    {`${o.buyerName} — ${o.product?.aiTitle || o.product?.title || 'produit'} (${o.platform})`}
                  </option>
                ))}
              </select>

              <label className="mt-3 block text-xs text-gray-400">Numéro de suivi</label>
              <input
                value={newTracking}
                onChange={(e) => setNewTracking(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addShipment()}
                placeholder="Ex. 6A12345678901"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Le transporteur est reconnu automatiquement à partir du numéro.
              </p>

              <button
                type="button"
                onClick={addShipment}
                disabled={busy || !newOrderId || !newTracking.trim()}
                className="btn-gradient mt-3 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {busy ? 'Enregistrement…' : "Enregistrer l'expédition"}
              </button>
            </>
          )}
        </div>
      )}

      {added && <p className="mt-3 text-xs text-emerald-300">{added}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              setOpenId(null)
            }}
            className={
              tab === t.id
                ? 'rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold'
                : 'rounded-full border border-white/10 px-4 py-1.5 text-sm text-gray-400 hover:bg-white/5'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {loading && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}

      {!loading && !orders.length && (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucune commande pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Les ventes remontent ici depuis les plateformes connectées et depuis l'extension.
          </p>
        </div>
      )}

      <ul className="mt-5 space-y-2">
        {shown.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => setOpenId(openId === o.id ? null : o.id)}
              className={
                openId === o.id
                  ? 'w-full rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-left'
                  : 'w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10'
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-300">
                  {o.platform}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[o.status] ?? 'bg-white/10 text-gray-300'}`}
                >
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <span className="ml-auto text-sm font-semibold">
                  {Number(o.amount).toLocaleString('fr-FR', { style: 'currency', currency: o.currency || 'EUR' })}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold">{o.buyerName}</p>
              <p className="truncate text-xs text-gray-500">{o.product?.aiTitle || o.product?.title}</p>
            </button>

            {openId === o.id && detail && detail.id === o.id && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                      <MapPin size={13} />
                      <span>Adresse de livraison</span>
                    </p>
                    {(() => {
                      const a = address(detail.buyerAddress)
                      if (!a) return <p className="mt-1 text-sm text-gray-500">Non communiquée</p>
                      return (
                        <address className="mt-1 text-sm not-italic leading-relaxed text-gray-200">
                          <span className="block">{detail.buyerName}</span>
                          <span className="block">{a.street}</span>
                          <span className="block">{`${a.zip} ${a.city}`}</span>
                          <span className="block">{a.country}</span>
                          {a.phone && <span className="block text-gray-400">{a.phone}</span>}
                        </address>
                      )
                    })()}
                  </div>

                  <div>
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                      <Package size={13} />
                      <span>Colis</span>
                    </p>

                    <div className="mt-1 flex gap-2">
                      <input
                        value={tracking}
                        onChange={(e) => setTracking(e.target.value)}
                        placeholder="Numéro de suivi"
                        className="flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={saveTracking}
                        disabled={busy || !tracking.trim() || tracking.trim() === detail.trackingNumber}
                        className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"
                      >
                        <Save size={13} />
                      </button>
                    </div>

                    {detail.tracking && (
                      <div className="mt-2">
                        <p className="flex items-center gap-1 text-xs text-gray-400">
                          {detail.tracking.generic && <HelpCircle size={12} />}
                          <span>{detail.tracking.carrierLabel}</span>
                        </p>
                        <a
                          href={detail.tracking.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                        >
                          <ExternalLink size={13} />
                          <span>Suivre le colis</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {detail.events && detail.events.length > 0 && (
                  <ol className="mt-4 space-y-2 border-t border-white/10 pt-3">
                    {detail.events.map((e, i) => (
                      <li key={i} className="flex gap-3 text-xs">
                        <span className="shrink-0 text-gray-500">
                          {e.date ? new Date(e.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        <span className="text-gray-200">{e.status}</span>
                        {e.location && <span className="text-gray-500">{e.location}</span>}
                      </li>
                    ))}
                  </ol>
                )}

                {detail.trackingNumber && !detail.events && (
                  <p className="mt-3 border-t border-white/10 pt-3 text-xs text-gray-500">
                    Les étapes détaillées demandent un service de suivi payant. Le lien ci-dessus
                    ouvre le suivi officiel du transporteur, qui les affiche gratuitement.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={contact}
                    disabled={busy}
                    className="btn-gradient inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    <MessageSquare size={14} />
                    <span>Contacter le client</span>
                  </button>

                  {detail.supplierOrderUrl && (
                    <a
                      href={detail.supplierOrderUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
                    >
                      <ExternalLink size={13} />
                      <span>Commande fournisseur</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Layout>
  )
}
