import { Link } from 'react-router-dom'
import { useDemo } from '../lib/demo'

/**
 * La bannière du mode démo — EN BAS de la page, jamais avant les blocs
 * (règle du 05/09/2026). Le mode se lève et se coupe au seul endroit qui le
 * porte : la pilule DEMO du tableau de bord (choix du 06/09/2026) — pas de
 * bouton par page.
 */
export function BandeauDemo() {
  const [actif] = useDemo()
  if (!actif) return null
  return (
    <p className="mt-6 rounded-xl border border-orange-400/40 bg-orange-500/10 px-4 py-3 text-xs text-orange-200">
      <b>Données de démonstration</b> — le mode DEMO est activé : ce que cette page montre est un
      exemple, rien n'est enregistré et aucun geste ne part. Pour retrouver vos vraies données,
      revenez au{' '}
      <Link to="/statistiques" className="font-semibold underline">
        tableau de bord
      </Link>{' '}
      et cliquez la pilule DEMO.
    </p>
  )
}
