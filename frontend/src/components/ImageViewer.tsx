import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Loader2 } from 'lucide-react'

/**
 * Ouvrir un visuel en grand, et le télécharger pour de bon.
 *
 * Deux gestes qui n'étaient pas les mêmes et qui l'étaient devenus : le bouton
 * « télécharger » du book était un simple lien qui ouvrait l'image dans un
 * onglet. Sur un fichier servi par R2, le navigateur l'affiche au lieu de
 * l'enregistrer — le vendeur croyait avoir téléchargé sa publicité et ne la
 * retrouvait nulle part.
 *
 * D'où le passage par un blob : on récupère le fichier, on force le nom, et le
 * navigateur l'écrit vraiment sur le disque. C'est aussi ce qui permet de lui
 * donner un nom lisible — `pub-instagram-montre-acier.jpg` plutôt que l'identifiant.
 */

/** Un nom de fichier qu'on retrouve dans son dossier de téléchargements. */
function nomDeFichier(url: string, etiquette?: string | null): string {
  const extension = url.split('?')[0].split('.').pop()?.toLowerCase()
  const suffixe = extension && extension.length <= 4 ? extension : 'jpg'

  const base = (etiquette ?? 'visuel')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return `${base || 'visuel'}.${suffixe}`
}

/**
 * Télécharge vraiment le fichier.
 *
 * Le repli sur un simple lien n'est pas de la coquetterie : une image servie par
 * un domaine tiers peut refuser la lecture par script (CORS). Mieux vaut alors
 * ouvrir l'onglet que de ne rien faire du tout et laisser le vendeur cliquer
 * dans le vide.
 */
export async function telechargerImage(url: string, etiquette?: string | null): Promise<void> {
  const nom = nomDeFichier(url, etiquette)
  try {
    const reponse = await fetch(url)
    if (!reponse.ok) throw new Error(String(reponse.status))
    const blob = await reponse.blob()
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = nom
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
    // Libéré au tour suivant : révoquer tout de suite annule le téléchargement
    // sur certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(lien.href), 10000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * La visionneuse : l'image en grand, par-dessus la page.
 *
 * Dans un portail sur `document.body` pour la même raison que la fenêtre
 * « Diffuser » : une barre collante ou un ancêtre transformé capture les clics
 * et rend la fenêtre inerte sans qu'aucune erreur ne s'affiche.
 */
export function ImageViewer({
  url,
  etiquette,
  sousTitre,
  onClose,
}: {
  url: string
  etiquette?: string | null
  sousTitre?: string | null
  onClose: () => void
}) {
  const [enCours, setEnCours] = useState(false)

  // Échap ferme, et le fond de page ne défile plus derrière.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', touche)
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', touche)
      document.body.style.overflow = avant
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{etiquette ?? 'Visuel'}</p>
            {sousTitre ? <p className="truncate text-xs text-gray-400">{sousTitre}</p> : null}
          </div>

          <button
            type="button"
            onClick={async () => {
              setEnCours(true)
              await telechargerImage(url, etiquette)
              setEnCours(false)
            }}
            disabled={enCours}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            {enCours ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span>Télécharger</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            className="shrink-0 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X size={15} />
          </button>
        </div>

        <img
          src={url}
          alt={etiquette ?? ''}
          className="max-h-[80vh] w-auto self-center rounded-xl object-contain"
        />
      </div>
    </div>,
    document.body,
  )
}
