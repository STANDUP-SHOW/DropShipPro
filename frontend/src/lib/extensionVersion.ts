import { useEffect, useState } from 'react'
import { api } from './api'

/**
 * L'état de l'extension installée par rapport à la version servie.
 *
 * L'extension annonce sa version sur `<html data-dropship-pro-extension>` et par
 * message ; l'application la compare à celle qu'elle sert (le manifeste livré).
 *
 * Depuis le passage au Chrome Web Store, une version en retard n'est plus une
 * alerte : Chrome met à jour tout seul, en quelques heures. On n'affiche donc
 * plus de bandeau — juste un état (`aJour` / `enRetard`), montré par un curseur
 * bicolore et, au survol seulement, le détail. Voir BlocExtension et la page
 * Extension.
 */

/** Compare deux versions « 1.22.0 » sans dépendance. */
function estAnterieure(installee: string, servie: string): boolean {
  const a = installee.split('.').map((n) => Number(n) || 0)
  const b = servie.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

function versionInstallee(): string | null {
  return document.documentElement.dataset.dropshipProExtension || null
}

export interface EtatExtension {
  /** La version installée dans Chrome, ou null si aucune extension détectée. */
  installee: string | null
  /** La version servie par l'application (le manifeste livré). */
  servie: string | null
  /** Une extension est présente. */
  presente: boolean
  /** Elle est en retard : Chrome la met à jour, c'est transitoire. */
  enRetard: boolean
  /** Elle est à la dernière version. */
  aJour: boolean
}

export function useExtensionVersion(): EtatExtension {
  const [installee, setInstallee] = useState<string | null>(versionInstallee)
  const [servie, setServie] = useState<string | null>(null)

  useEffect(() => {
    // Le repère sur `<html>` peut manquer si le pont a démarré après nous : on
    // demande alors, comme le fait la fenêtre de publication.
    if (!installee) {
      const surReponse = (e: MessageEvent) => {
        if (e.source === window && e.data?.type === 'dsp-extension-ready' && e.data.version) {
          setInstallee(String(e.data.version))
        }
      }
      window.addEventListener('message', surReponse)
      window.postMessage({ source: 'droppost-app', type: 'dsp-ping' }, window.location.origin)
      return () => window.removeEventListener('message', surReponse)
    }
  }, [installee])

  useEffect(() => {
    // Inutile d'appeler le serveur pour un vendeur sans extension.
    if (!installee) return
    api.versionExtension().then((r) => setServie(r.version)).catch(() => undefined)
  }, [installee])

  const presente = Boolean(installee)
  const enRetard = Boolean(installee && servie && estAnterieure(installee, servie))
  return { installee, servie, presente, enRetard, aJour: presente && !enRetard }
}
