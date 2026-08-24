import { useEffect, useState } from 'react'
import { Eye, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * L'agent de contrôle visuel.
 *
 * Il regarde les photos avant la mise en ligne : les tris automatiques savent
 * d'où vient une image et quelle taille elle fait, pas ce qu'elle montre. Une
 * bannière hébergée sur le bon serveur, au bon format, passe tous les filtres.
 *
 * Réglable, parce qu'il coûte un appel par import : un vendeur qui relit chaque
 * annonce lui-même peut s'en passer, celui qui laisse le pilote publier seul
 * n'en a aucune envie.
 */
export function ControlAgentToggle() {
  const { user, refresh } = useAuth()
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user && typeof user.controlAgent === 'boolean') setEnabled(user.controlAgent)
  }, [user])

  async function toggle(next: boolean) {
    setEnabled(next)
    setSaving(true)
    try {
      await api.updateProfile({ controlAgent: next })
      await refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Eye size={16} className="text-sky-400" />
        <span>Agent de contrôle</span>
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        Avant chaque mise en ligne, il regarde les photos et écarte ce qui n'est pas le produit :
        bannières, tableaux de tailles, visuels d'un autre article. Il garde toutes les vraies
        photos — neuf s'il y en a neuf — relève les couleurs réellement visibles et vérifie que les
        tailles vont avec le produit.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          disabled={saving}
          className="mt-0.5 h-5 w-5 accent-emerald-400"
        />
        <span className="text-sm">
          <span className="font-semibold">
            {enabled ? 'Contrôle actif' : 'Contrôle désactivé'}
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            {enabled
              ? "Chaque import est relu. Indispensable si le pilote automatique publie sans vous."
              : "Les photos partent telles que le tri automatique les a choisies."}
          </span>
        </span>
      </label>

      {!enabled && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-xs text-amber-100">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          <span>
            En mode automatique, plus rien ne relit vos annonces avant publication.
          </span>
        </p>
      )}

      {saved && <p className="mt-2 text-xs text-emerald-300">Réglage enregistré</p>}
    </div>
  )
}
