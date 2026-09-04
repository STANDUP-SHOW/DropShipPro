import { useState } from 'react'
import { Sparkles } from 'lucide-react'

/**
 * L'interrupteur « IA AUTO-MODE » d'un agent — le même sur toutes les fiches.
 *
 * Levé, l'agent exécute sa tâche en autonomie : un chef de rayon produit son
 * analyse et ses dix gagnants toutes les douze heures, un agent
 * d'administration traite messages, comptabilité et factures. Le bouton dit
 * son état sans qu'on lise le libellé : dégradé allumé et point qui respire
 * quand il tourne, gris éteint sinon.
 *
 * La bascule est optimiste côté parent : c'est lui qui appelle l'API et
 * revient en arrière si elle refuse (agent pas en poste → 402 expliqué).
 */
export function BoutonAutoMode({
  actif,
  onBascule,
  compact = false,
}: {
  actif: boolean
  /** Reçoit l'état voulu ; lève pour refuser (le message est affiché). */
  onBascule: (enabled: boolean) => Promise<void>
  /** Version resserrée pour les cartes d'agent. */
  compact?: boolean
}) {
  const [occupe, setOccupe] = useState(false)
  const [refus, setRefus] = useState<string | null>(null)

  async function basculer(e: React.MouseEvent) {
    // Sur une carte entière cliquable, le bouton ne doit pas ouvrir la carte.
    e.preventDefault()
    e.stopPropagation()
    if (occupe) return
    setOccupe(true)
    setRefus(null)
    try {
      await onBascule(!actif)
    } catch (err) {
      setRefus(err instanceof Error ? err.message : 'Réglage impossible')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <span className={compact ? 'block' : 'inline-block'}>
      <button
        type="button"
        onClick={basculer}
        disabled={occupe}
        title={
          actif
            ? 'IA AUTO-MODE activé — cliquez pour arrêter les tâches autonomes.'
            : 'IA AUTO-MODE désactivé — cliquez pour que cet agent travaille tout seul.'
        }
        className={
          (actif
            ? 'border-transparent bg-gradient-to-r from-violet-500 via-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(192,86,255,0.45)]'
            : 'border-white/15 bg-white/5 text-gray-400 hover:border-fuchsia-400/40 hover:text-fuchsia-200') +
          ` inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wide transition disabled:opacity-60 ${
            compact ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-[11px]'
          }`
        }
      >
        <Sparkles size={compact ? 11 : 13} className={actif ? 'animate-pulse' : undefined} />
        <span>IA AUTO-MODE</span>
        <span
          className={
            (actif ? 'bg-emerald-300 animate-pulse' : 'bg-gray-600') +
            ' inline-block h-1.5 w-1.5 rounded-full'
          }
        />
      </button>
      {refus ? <span className="mt-1 block text-[11px] leading-snug text-amber-300">{refus}</span> : null}
    </span>
  )
}
