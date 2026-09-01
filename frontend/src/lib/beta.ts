/**
 * Le client des chantiers ouverts.
 *
 * À part du client général, et pour la même raison que les routes le sont côté
 * serveur : ce qui est derrière n'est pas fini, et le mêler au reste le ferait
 * passer pour livré.
 *
 * Le code accompagne **chaque** requête, dans un en-tête. Deux conséquences
 * voulues : l'adresse ne le porte jamais — une URL se retrouve dans
 * l'historique et dans les journaux — et il n'y a pas de session bêta à
 * expirer, donc rien qui reste ouvert après un rechargement.
 */

import { getToken, apiRoot } from './api'

/** Le code, gardé le temps de l'onglet seulement. */
const CLE = 'dsp-beta-code'

export function codeBeta(): string {
  try {
    return sessionStorage.getItem(CLE) ?? ''
  } catch {
    // Navigation privée ou stockage bloqué : la page redemandera le code.
    return ''
  }
}

export function retenirCode(code: string) {
  try {
    sessionStorage.setItem(CLE, code)
  } catch {
    /* rien à faire : la session vivra en mémoire, dans l'état du composant */
  }
}

export function oublierCode() {
  try {
    sessionStorage.removeItem(CLE)
  } catch {
    /* idem */
  }
}

async function beta<T>(path: string, options: RequestInit = {}, code = codeBeta()): Promise<T> {
  const token = getToken()
  const res = await fetch(`${apiRoot}/api/beta${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-beta-code': code,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `Erreur ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export interface FicheImprimerie {
  id: string
  name: string
  sourceUrl: string
  sourceRef: string | null
  category: string | null
  images: string[]
  dimensions: number
  marginPercent: number
  shopId: string | null
  active: boolean
  capturedAt: string | null
  updatedAt: string
  grille: {
    lignes: number
    min: number | null
    max: number | null
    quantites: number[]
    delais: number[]
  }
  manque: string[]
}

export interface ApercuImprimerie {
  boutiques: Array<{ id: string; name: string; shopKey: string; feedUrl: string; enLigne: number }>
  total: number
  enLigne: number
  lignesTarifaires: number
}

export const betaApi = {
  /** Vérifie le code. Ne renvoie rien d'autre : c'est une porte, pas une ressource. */
  unlock: (code: string) =>
    beta<{ ok: true; modules: string[] }>('/unlock', { method: 'POST', body: JSON.stringify({ code }) }, code),

  apercu: () => beta<ApercuImprimerie>('/print/overview'),
  fiches: () => beta<FicheImprimerie[]>('/print/products'),
  fiche: (id: string) => beta<any>(`/print/products/${id}`),
  format: () => beta<unknown>('/print/format'),

  deposer: (releve: unknown) =>
    beta<FicheImprimerie & { remplacee: boolean }>('/print/products', {
      method: 'POST',
      body: JSON.stringify(releve),
    }),

  modifier: (id: string, champs: Partial<Pick<FicheImprimerie, 'name' | 'category' | 'images' | 'marginPercent' | 'shopId' | 'active'>> & { description?: string }) =>
    beta<FicheImprimerie>(`/print/products/${id}`, { method: 'PATCH', body: JSON.stringify(champs) }),

  supprimer: (id: string) => beta<void>(`/print/products/${id}`, { method: 'DELETE' }),
}
