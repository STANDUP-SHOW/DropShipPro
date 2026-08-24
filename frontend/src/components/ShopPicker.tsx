import { useEffect, useState } from 'react'
import { Store } from 'lucide-react'
import { api } from '../lib/api'

export interface ShopOption {
  id: string
  name: string
  shopKey: string
  platform: string | null
  /** Les rayons vendus par cette boutique. Vide = toutes les categories. */
  sectors: string[]
  products: number
}

/**
 * Where does this listing go?
 *
 * A seller with a fashion store and a tech store has two feeds, and putting a
 * pair of headphones in the fashion catalogue is not a small mistake — it is the
 * whole point of separating them. The choice is made here, at publication time,
 * rather than hidden in the settings where nobody would look for it.
 *
 * With a single shop the question has one answer, so the picker stays out of the
 * way and simply says where it is going.
 */
export function ShopPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (shopId: string) => void
}) {
  const [shops, setShops] = useState<ShopOption[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api
      .listShops()
      .then((list) => {
        setShops(list)
        // Preselect so a seller with one shop never has to answer an obvious
        // question, and so the choice is never silently empty.
        if (list.length && !value) onChange(list[0].id)
      })
      .catch(() => setFailed(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (failed || !shops.length) return null

  if (shops.length === 1) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
        <Store size={14} className="shrink-0 text-emerald-400" />
        <span>{`Destination : ${shops[0].name}`}</span>
      </p>
    )
  }

  return (
    <label className="mt-3 block">
      <span className="mb-1 flex items-center gap-2 text-xs text-gray-400">
        <Store size={14} />
        <span>Sur quel site publier ?</span>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
      >
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.platform ? `${s.name} — ${s.platform}` : s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
