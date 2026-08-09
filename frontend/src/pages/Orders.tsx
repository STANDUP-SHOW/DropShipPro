import { useEffect, useState, type FormEvent } from 'react'
import { PackageCheck, Truck, ExternalLink, Plus } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nouvelle vente',
  ORDERED_FROM_SUPPLIER: 'Commandé au fournisseur',
  SHIPPED: 'Expédié',
  DELIVERED: 'Livré',
  REFUNDED: 'Remboursé',
}
const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-pink-500/20 text-pink-300',
  ORDERED_FROM_SUPPLIER: 'bg-blue-500/20 text-blue-300',
  SHIPPED: 'bg-purple-500/20 text-purple-300',
  DELIVERED: 'bg-emerald-500/20 text-emerald-300',
  REFUNDED: 'bg-gray-500/20 text-gray-300',
}

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const [o, p] = await Promise.all([api.listOrders(), api.listProducts()])
    setOrders(o)
    setProducts(p)
  }

  useEffect(() => {
    load()
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await api.createOrder({
      productId: fd.get('productId'),
      platform: fd.get('platform'),
      buyerName: fd.get('buyerName'),
      amount: Number(fd.get('amount')),
      buyerAddress: {
        street: fd.get('street'),
        city: fd.get('city'),
        zip: fd.get('zip'),
        country: 'France',
      },
    })
    setShowForm(false)
    e.currentTarget.reset()
    await load()
  }

  async function markShipped(id: string) {
    await api.updateOrder(id, { status: 'SHIPPED' })
    await load()
  }

  async function markOrderedFromSupplier(id: string) {
    await api.updateOrder(id, { status: 'ORDERED_FROM_SUPPLIER' })
    await load()
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Commandes</h1>
          <p className="text-gray-400 text-sm mt-1">
            Aucune plateforme connectée en API pour l'instant : enregistrez les ventes manuellement.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
          <Plus size={15} /> Nouvelle vente
        </button>
      </div>

      {showForm && (
        <form onSubmit={onCreate} className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 grid sm:grid-cols-2 gap-3">
          <select name="productId" required className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm sm:col-span-2">
            <option value="">Produit vendu...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.aiTitle || p.title}</option>
            ))}
          </select>
          <select name="platform" required className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm">
            <option value="">Plateforme...</option>
            <option value="OWN_SITE">Mon site</option>
            <option value="LEBONCOIN">Leboncoin</option>
            <option value="VINTED">Vinted</option>
            <option value="EBAY">eBay</option>
            <option value="AMAZON">Amazon</option>
          </select>
          <input name="amount" type="number" step="0.01" required placeholder="Montant reçu (€)" className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm" />
          <input name="buyerName" required placeholder="Nom de l'acheteur" className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm" />
          <input name="street" required placeholder="Adresse" className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm" />
          <input name="city" required placeholder="Ville" className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm" />
          <input name="zip" required placeholder="Code postal" className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm" />
          <button className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold sm:col-span-2">Enregistrer la vente</button>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {orders.length === 0 && <p className="text-gray-400 text-sm">Aucune commande pour le moment.</p>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{o.product?.aiTitle || o.product?.title}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {o.buyerName} — {o.amount} {o.currency} · {o.platform}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {o.buyerAddress?.street}, {o.buyerAddress?.zip} {o.buyerAddress?.city}
                </p>
              </div>
              <span className={`text-xs rounded-full px-2 py-1 shrink-0 ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <a
                href={o.product?.sourceUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => markOrderedFromSupplier(o.id)}
                className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 flex items-center gap-1.5"
              >
                Commander chez le fournisseur <ExternalLink size={12} />
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(`${o.buyerAddress?.street}, ${o.buyerAddress?.zip} ${o.buyerAddress?.city}, ${o.buyerAddress?.country}`)}
                className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5"
              >
                Copier l'adresse client
              </button>
              {o.status !== 'SHIPPED' && o.status !== 'DELIVERED' && (
                <button onClick={() => markShipped(o.id)} className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 flex items-center gap-1.5">
                  <Truck size={12} /> Marquer expédié
                </button>
              )}
              {o.status === 'SHIPPED' && (
                <span className="text-xs text-emerald-300 flex items-center gap-1"><PackageCheck size={12} /> Expédié</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
