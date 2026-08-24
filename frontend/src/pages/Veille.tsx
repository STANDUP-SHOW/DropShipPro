import { useState } from 'react'
import { Radar, Truck, Share2, Store, Globe, User } from 'lucide-react'
import { Layout } from '../components/Layout'
import { OpportunityList } from '../components/OpportunityList'
import { SignalList } from '../components/SignalList'

const SOURCES = [
  {
    id: 'SUPPLIERS' as const,
    label: 'Fournisseurs',
    icon: Truck,
    hint: 'Les produits repérés chez Temu, AliExpress, DHgate, Banggood…',
  },
  {
    id: 'SOCIAL' as const,
    label: 'Réseaux sociaux',
    icon: Share2,
    hint: 'Ce qui marche sur TikTok, Instagram et Facebook : marques, formats, tendances.',
  },
  {
    id: 'MARKET' as const,
    label: 'Places de marché',
    icon: Store,
    hint: 'Prix constatés, concurrence et positionnement sur les marketplaces.',
  },
]

const SCOPES = [
  {
    id: 'ALL' as const,
    label: 'Veille globale',
    icon: Globe,
    hint: 'Ce que fait le marché, que vous vendiez ces produits ou non.',
  },
  {
    id: 'PERSONAL' as const,
    label: 'Ma veille',
    icon: User,
    hint: 'Uniquement ce qui recoupe vos propres annonces.',
  },
]

/**
 * La veille, en un seul endroit.
 *
 * Trois sources plutôt que trois pages : on passe de l'une à l'autre sans arrêt,
 * et un signal TikTok se lit à côté du produit fournisseur qu'il concerne, pas
 * dans un autre écran.
 *
 * Le second axe est celui qui compte vraiment à l'usage : « le marché fait ceci »
 * et « vos produits sont concernés » n'appellent pas la même réaction, et le
 * second se noie dans le premier quand vingt-cinq signaux tombent chaque jour.
 */
export default function Veille() {
  const [source, setSource] = useState<(typeof SOURCES)[number]['id']>('SUPPLIERS')
  const [scope, setScope] = useState<(typeof SCOPES)[number]['id']>('ALL')

  const current = SOURCES.find((s) => s.id === source)!

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Radar size={22} className="text-emerald-400" />
        <span>Veille</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Ce que vos agents observent chez les fournisseurs, sur les réseaux et sur les places de
        marché. Vous gardez, vous écartez, vous importez — rien ne part tout seul.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {SOURCES.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={
                source === s.id
                  ? 'inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold'
                  : 'inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:bg-white/5'
              }
            >
              <Icon size={15} />
              <span>{s.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SCOPES.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              title={s.hint}
              className={
                scope === s.id
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-300'
                  : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/5'
              }
            >
              <Icon size={13} />
              <span>{s.label}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {scope === 'PERSONAL'
          ? `${current.hint} — filtré sur ce qui recoupe vos annonces.`
          : current.hint}
      </p>

      {source === 'SUPPLIERS' ? (
        <OpportunityList scope={scope} />
      ) : (
        <SignalList kind={source} scope={scope} />
      )}
    </Layout>
  )
}
