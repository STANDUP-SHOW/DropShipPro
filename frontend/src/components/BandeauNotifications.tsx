import { BlocNotifications } from './BlocNotifications'
import { BlocExtension } from './BlocExtension'

/**
 * La ligne sous le bandeau des six jauges : deux blocs pleine largeur, style
 * tableau de bord (demandé le 10/09/2026). À gauche, le grand bloc
 * « Notifications » ; à droite, l'état de l'extension Chrome.
 */
export function BandeauNotifications() {
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <BlocNotifications />
      </div>
      <div className="lg:col-span-1">
        <BlocExtension />
      </div>
    </div>
  )
}
