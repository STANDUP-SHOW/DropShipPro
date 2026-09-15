import { useEffect, useState } from 'react'

/**
 * L'extension installée, telle qu'elle se présente.
 *
 * L'extension annonce sa version sur `<html data-dropship-pro-extension>` et
 * répond aux `dsp-ping` par un message `dsp-extension-ready` ; depuis le
 * 15/09/2026 elle dit aussi d'où elle vient (`store`) : Chrome écrit
 * `update_url` dans le manifeste d'une copie du Chrome Web Store, jamais dans
 * une copie chargée à la main.
 *
 * **On ne compare plus la version installée à celle du code livré.** Le store
 * ne lit pas notre dépôt : une version n'y arrive que quand on la téléverse,
 * et le site annonçait « la 1.32.0 est disponible, Chrome propage » alors que
 * le store servait encore la 1.30.0 — une promesse que personne ne pouvait
 * tenir. Ce qui se sait vraiment, et qui suffit : une copie du store est à
 * jour par construction ; une copie manuelle ne le sera jamais, et c'est ça
 * qu'on signale.
 */

interface Copie {
  version: string
  /** true : Chrome Web Store ; false : chargée à la main ; null : pont trop ancien pour le dire. */
  store: boolean | null
}

function copieMarquee(): Copie | null {
  const version = document.documentElement.dataset.dropshipProExtension
  if (!version) return null
  const drapeau = document.documentElement.dataset.dropshipProExtensionStore
  return { version, store: drapeau === '1' ? true : drapeau === '0' ? false : null }
}

export interface EtatExtension {
  /** La version de la copie retenue (celle du store quand il y en a une), ou null. */
  installee: string | null
  /** Une extension est présente. */
  presente: boolean
  /** La copie retenue vient du Chrome Web Store : Chrome la tient à jour. */
  store: boolean
  /** Une copie chargée à la main est installée (seule, ou en plus de celle du store). */
  copieDev: boolean
}

export function useExtensionVersion(): EtatExtension {
  const [copies, setCopies] = useState<Copie[]>(() => {
    const c = copieMarquee()
    return c ? [c] : []
  })

  useEffect(() => {
    // Chaque copie installée répond au ping — quand le vendeur a gardé une copie
    // manuelle à côté de celle du store, on les voit toutes les deux.
    const surReponse = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== 'dsp-extension-ready' || !e.data.version) return
      const copie: Copie = {
        version: String(e.data.version),
        store: typeof e.data.store === 'boolean' ? e.data.store : null,
      }
      setCopies((avant) =>
        avant.some((c) => c.version === copie.version && c.store === copie.store) ? avant : [...avant, copie],
      )
    }
    window.addEventListener('message', surReponse)
    window.postMessage({ source: 'droppost-app', type: 'dsp-ping' }, window.location.origin)
    return () => window.removeEventListener('message', surReponse)
  }, [])

  const duStore = copies.find((c) => c.store === true)
  const manuelle = copies.find((c) => c.store === false)
  const retenue = duStore ?? copies[0] ?? null
  return {
    installee: retenue?.version ?? null,
    presente: copies.length > 0,
    store: Boolean(duStore),
    copieDev: Boolean(manuelle),
  }
}
