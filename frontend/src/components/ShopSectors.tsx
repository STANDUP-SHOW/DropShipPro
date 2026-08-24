import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '../lib/api'

/** Nom lisible de chaque rayon, aligné sur les chefs de rayon. */
const LABELS: Record<string, string> = {
  'high-tech': 'High-tech et informatique',
  'objets-connectes': 'Objets connectés et domotique',
  electromenager: 'Électroménager et cuisine',
  'mode-femme': 'Mode et accessoires femme',
  'mode-homme': 'Mode et accessoires homme',
  bricolage: 'Bricolage et outillage',
  jardinage: 'Jardinage et extérieur',
  'maison-deco': 'Maison et décoration',
  beaute: 'Beauté et soins',
  sport: 'Sport et fitness',
  bebe: 'Bébé et puériculture',
  animalerie: 'Animalerie',
  'auto-moto': 'Auto et moto',
  'jeux-consoles': 'Jeux et consoles',
  'bijoux-montres': 'Bijoux et montres',
}

/**
 * Les rayons vendus par une boutique.
 *
 * C'est ce qui décide des catégories proposées à l'import. Sans ce réglage, un
 * vendeur de high-tech déroulait quarante catégories de mode pour trouver
 * « casque audio » — le catalogue ne couvrait d'ailleurs que la mode homme.
 *
 * Ne rien cocher veut dire « tout » : un vendeur qui n'a pas encore dit ce qu'il
 * vend doit voir toutes les catégories, jamais aucune.
 */
export function ShopSectors({
  shopId,
  selected,
  onChange,
}: {
  shopId: string
  selected: string[]
  onChange: (sectors: string[]) => void
}) {
  const [sectors, setSectors] = useState<Array<{ sector: string; count: number }>>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .listCategories()
      .then((r) => setSectors(r.sectors.filter((s) => s.sector !== 'tous')))
      .catch(() => setSectors([]))
  }, [])

  async function toggle(sector: string) {
    const next = selected.includes(sector)
      ? selected.filter((s) => s !== sector)
      : [...selected, sector]

    onChange(next)
    setSaving(true)
    try {
      await api.renameShop(shopId, { sectors: next })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  if (!sectors.length) return null

  return (
    <details className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2">
      <summary className="cursor-pointer text-xs text-gray-400">
        {selected.length
          ? `Rayons vendus : ${selected.length} sélectionné(s)`
          : 'Rayons vendus — toutes les catégories sont proposées'}
      </summary>

      <p className="mt-2 text-[11px] text-gray-500">
        Cochez ce que vend cette boutique : seules ces catégories seront proposées à l'import. Rien
        de coché signifie toutes.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {sectors.map((s) => (
          <button
            key={s.sector}
            type="button"
            onClick={() => toggle(s.sector)}
            disabled={saving}
            className={
              selected.includes(s.sector)
                ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300'
                : 'rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-gray-400 hover:bg-white/5'
            }
          >
            {selected.includes(s.sector) && <Check size={10} />}
            <span>{LABELS[s.sector] ?? s.sector}</span>
          </button>
        ))}
      </div>

      {saved && <p className="mt-2 text-[11px] text-emerald-300">Enregistré</p>}
    </details>
  )
}
