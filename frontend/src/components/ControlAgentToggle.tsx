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
        Avant chaque mise en ligne, il regarde les photos que vous avez retenues et signale ce qui
        ne semble pas être le produit : bannières, tableaux de tailles, visuels d'un autre article.
        C'est un second regard de l'IA sur des photos que vous avez déjà choisies — utile, mais qui
        coûte quelques centimes par annonce. <strong>Désactivé par défaut</strong> : activez-le si
        vous importez vite sans regarder vos photos. L'Auto-SHIPPER IA, lui, le lance toujours (personne
        ne relit à sa place), quel que soit ce réglage.
      </p>
      {/*
        Dit franchement, parce que le contraire s'est vu.
        L'écran promettait un tri qui écarte tout seul le hors-sujet ; à l'usage,
        des tondeuses arrivaient sur une fiche de souris. Une promesse tenue à
        moitié coûte plus cher qu'une limite annoncée : le vendeur qui sait que
        la sélection lui revient la fait, celui à qui on a promis un tri
        découvre le problème après la mise en ligne.
      */}
      <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-100">
        <strong>La sélection des photos reste la vôtre.</strong> À l'import, l'extension propose
        toutes les images trouvées sur la page et n'en coche aucune : nous ne savons pas encore
        distinguer à coup sûr les photos d'une fiche des bannières et des produits recommandés qui
        l'entourent. Cet agent relit après vous, il ne choisit pas à votre place.
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
              ? "Chaque import manuel est relu par l'IA — quelques centimes de plus par annonce."
              : "Vos photos partent telles que vous les avez choisies. L'Auto-SHIPPER IA relit toujours les siennes."}
          </span>
        </span>
      </label>

      {!enabled && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-2 text-xs text-emerald-100">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          <span>
            Vous choisissez déjà vos photos à la main : ce second regard est facultatif, et le couper
            fait baisser le coût de chaque annonce. L'Auto-SHIPPER IA reste couvert de son côté.
          </span>
        </p>
      )}

      {saved && <p className="mt-2 text-xs text-emerald-300">Réglage enregistré</p>}
    </div>
  )
}
