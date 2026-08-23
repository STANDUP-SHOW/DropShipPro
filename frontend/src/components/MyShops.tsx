import { useEffect, useState } from 'react'
import { Store, Plus, Trash2, Copy, Check } from 'lucide-react'
import { api, apiRoot } from '../lib/api'
import type { ShopOption } from './ShopPicker'

/** Indicative, and deliberately not exhaustive: it only labels the card. */
const CMS = ['WooCommerce', 'PrestaShop', 'Magento', 'WordPress', 'Shopify', 'Autre']

function feedUrl(shopKey: string) {
  return `${apiRoot || window.location.origin}/api/public/shops/${shopKey}/products`
}

/**
 * Les sites du vendeur, une clé de catalogue par site.
 *
 * Une seule clé pour tout le compte envoyait le catalogue entier à chaque site :
 * un vendeur qui tient une boutique de mode et une boutique high-tech recevait
 * les casques audio dans la mode. Chaque site a donc sa clé, et chaque annonce
 * est rangée dans un site au moment de la publication.
 */
export function MyShops() {
  const [shops, setShops] = useState<ShopOption[]>([])
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState(CMS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  function load() {
    api.listShops().then(setShops).catch(() => setError('Impossible de charger vos sites'))
  }

  useEffect(load, [])

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createShop({ name: name.trim(), platform })
      setName('')
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(shop: ShopOption) {
    const warning =
      shop.products > 0
        ? `Supprimer « ${shop.name} » ? Ses ${shop.products} annonce(s) sont conservées mais ne seront plus diffusées par ce site.`
        : `Supprimer « ${shop.name} » ?`
    if (!window.confirm(warning)) return
    try {
      await api.deleteShop(shop.id)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function copy(shopKey: string) {
    navigator.clipboard.writeText(feedUrl(shopKey))
    setCopied(shopKey)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="mt-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Store size={16} className="text-emerald-400" />
        <span>Mes sites</span>
      </h2>
      <p className="mt-1 text-xs text-gray-400">
        Facultatif : si vous vendez uniquement sur des marketplaces, vous n'avez rien à faire ici.
        Sinon, un site = une clé. Vos annonces publiées sur « Mon site » sont servies à la boutique
        que vous choisissez au moment de diffuser, et l'adresse se transmet à votre développeur avec
        la documentation.
      </p>

      {!shops.length && (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-gray-500">
          Aucun site branché — c'est très bien ainsi si vous passez par Vinted, Leboncoin, eBay ou
          Shopify. Ajoutez-en un seulement le jour où vous voudrez alimenter votre propre boutique.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {shops.map((shop) => (
          <li key={shop.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{shop.name}</p>
                <p className="text-xs text-gray-500">
                  {shop.platform
                    ? `${shop.platform} — ${shop.products} annonce(s)`
                    : `${shop.products} annonce(s)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(shop)}
                title="Supprimer ce site"
                className="shrink-0 rounded-lg border border-white/10 p-2 text-gray-400 hover:bg-white/5 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={feedUrl(shop.shopKey)}
                onFocus={(e) => e.target.select()}
                className="flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => copy(shop.shopKey)}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
              >
                {copied === shop.shopKey ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nom du site (ex. Ma boutique mode)"
          className="flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/10 px-2 py-2 text-sm outline-none"
        >
          {CMS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="btn-gradient inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          <Plus size={14} />
          <span>Ajouter</span>
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <p className="mt-3 text-xs text-gray-500">
        Une adresse de catalogue n'expose que les annonces rangées dans ce site, en lecture seule.
        Elle peut figurer dans le code de votre boutique.
      </p>
    </div>
  )
}
