import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

/**
 * La bascule sombre / clair, sous le titre du menu (demandée le 13/09/2026).
 *
 * Deux moitiés, lune et soleil : celle du thème en cours porte le dégradé de
 * la marque, l'autre attend. Un seul clic suffit, sur n'importe quelle moitié.
 */
export function BoutonTheme() {
  const [theme, basculer] = useTheme()
  const sombre = theme === 'dark'
  const moitie = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
      active ? 'btn-gradient text-white shadow-[0_0_14px_rgba(236,72,153,0.35)]' : 'text-gray-400 hover:text-white'
    }`
  return (
    <div
      role="group"
      aria-label="Thème de l'application"
      className="mb-6 flex rounded-lg border border-white/10 bg-white/5 p-0.5"
    >
      <button type="button" onClick={sombre ? undefined : basculer} aria-pressed={sombre} title="Mode sombre" className={moitie(sombre)}>
        <Moon size={13} /> Sombre
      </button>
      <button type="button" onClick={sombre ? basculer : undefined} aria-pressed={!sombre} title="Mode clair" className={moitie(!sombre)}>
        <Sun size={13} /> Clair
      </button>
    </div>
  )
}
