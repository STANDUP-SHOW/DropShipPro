import { Bot, ClipboardList, Inbox, ScrollText, ShoppingCart } from 'lucide-react'
import { pont, useDesktop, type SectionPanneau } from '../../lib/desktopPower'

const ENTREES: { section: SectionPanneau; label: string; icon: typeof Bot; compte?: 'nbLiens' | 'nbAchats' | 'nbAnnonces' }[] = [
  { section: 'auto', label: 'Mode tout automatique', icon: Bot },
  { section: 'partages', label: 'Produits partagés', icon: Inbox, compte: 'nbLiens' },
  { section: 'achats', label: 'Commandes fournisseurs', icon: ShoppingCart, compte: 'nbAchats' },
  { section: 'publication', label: 'Publication par session', icon: ClipboardList, compte: 'nbAnnonces' },
  { section: 'journal', label: 'Journal', icon: ScrollText },
]

/**
 * « Sur ce poste » (DESKTOP POWER, 24/10/2026) : depuis que l'application ouvre
 * le site en pleine page, ses panneaux locaux (mode tout automatique, liens
 * partagés, commandes chez les fournisseurs sans API, publication par session,
 * journal) s'ouvrent d'ici. Rien n'est rendu hors de l'application.
 */
export function MenuPoste() {
  const p = pont()
  const etat = useDesktop()
  if (!p) return null
  return (
    <div className="mt-1 border-t border-white/5 pt-1">
      <p className="px-3 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Sur ce poste</p>
      {ENTREES.map((e) => {
        const n = e.compte && etat ? etat[e.compte] : 0
        return (
          <button
            key={e.section}
            type="button"
            onClick={() => p.panneau(e.section)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm text-gray-300 transition hover:bg-white/[0.04] hover:text-white"
          >
            <e.icon size={16} />
            <span className="flex-1">{e.label}</span>
            {n > 0 ? <span className="rounded-full bg-[var(--marque-rose)] px-1.5 text-[10px] font-bold text-white">{n}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
