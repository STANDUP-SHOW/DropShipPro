import { apiRoot } from './api'

/**
 * Côté navigateur de l'affiliation (07/10/2026).
 *
 * Deux usages bien séparés :
 *  - le visiteur arrivé par ?parrain=CODE : on compte le clic et on garde le
 *    code 30 jours, pour rattacher son compte s'il s'inscrit ;
 *  - l'affilié lui-même, dans son espace : son jeton vit sous une autre clé
 *    que celui des vendeurs (`droppost_affilie`), les deux ne se mélangent pas.
 */

const CLE_PARRAIN = 'droppost_parrain'
const CLE_JETON = 'droppost_affilie'
const DUREE_MS = 30 * 86400_000

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
function ecrire(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle)
    else localStorage.setItem(cle, valeur)
  } catch {
    /* stockage bloqué : l'affiliation se perd, le site marche */
  }
}

async function appel<T>(chemin: string, options: RequestInit = {}, jeton?: string | null): Promise<T> {
  const res = await fetch(`${apiRoot}/api/affiliation${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
  })
  const corps = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(corps.error || `Erreur ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return corps as T
}

/* ---- Visiteur ---- */

/** À appeler au chargement de chaque page : compte le clic une fois par session et garde le code. */
export function capterParrain(search: string, page: string) {
  const code = new URLSearchParams(search).get('parrain')?.trim().toUpperCase()
  if (!code || !/^[A-Z0-9-]{3,40}$/.test(code)) return
  ecrire(CLE_PARRAIN, JSON.stringify({ code, t: Date.now() }))
  const deja = (() => {
    try {
      return sessionStorage.getItem(`${CLE_PARRAIN}_${code}`)
    } catch {
      return null
    }
  })()
  if (deja) return
  try {
    sessionStorage.setItem(`${CLE_PARRAIN}_${code}`, '1')
  } catch {
    /* rien */
  }
  appel('/clic', { method: 'POST', body: JSON.stringify({ code, page }) }).catch(() => {})
}

/** Après une création de compte : rattache le vendeur à l'affilié du lien, puis oublie le code. */
export async function rattacherSiParrain(jetonVendeur: string) {
  const brut = lire(CLE_PARRAIN)
  if (!brut) return
  try {
    const { code, t } = JSON.parse(brut) as { code: string; t: number }
    if (Date.now() - t <= DUREE_MS) {
      await appel('/rattacher', { method: 'POST', body: JSON.stringify({ code }) }, jetonVendeur)
    }
  } catch {
    /* un rattachement manqué ne bloque jamais l'inscription */
  }
  ecrire(CLE_PARRAIN, null)
}

/* ---- Affilié ---- */

export const jetonAffilie = () => lire(CLE_JETON)
export const deconnecterAffilie = () => ecrire(CLE_JETON, null)

export const affiliationApi = {
  inscription: (nom: string, email: string) =>
    appel<{ ok: true; message: string }>('/inscription', { method: 'POST', body: JSON.stringify({ nom, email, accepte: true }) }),
  renvoyerCode: (email: string) => appel<{ ok: true; message: string }>('/code', { method: 'POST', body: JSON.stringify({ email }) }),
  async connexion(email: string, code: string) {
    const r = await appel<{ token: string }>('/connexion', { method: 'POST', body: JSON.stringify({ email, code }) })
    ecrire(CLE_JETON, r.token)
  },
  tableau: (periode: Periode) => appel<Tableau>(`/tableau?periode=${periode}`, {}, jetonAffilie()),
}

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee'

export interface Tableau {
  lien: string
  affilie: { nom: string; email: string; code: string; depuis: string }
  taux: number
  joursActif: number
  totaux: {
    clics: number
    inscriptions: number
    filleulsPayants: number
    filleulsActifs: number
    conversion: number
    depensesCentimes: number
    gainsCentimes: number
    versesCentimes: number
    dusCentimes: number
  }
  periode: Periode
  series: Array<{ cle: string; libelle: string; clics: number; inscriptions: number; depensesCentimes: number; gainsCentimes: number }>
  filleuls: Array<{
    id: string
    email: string
    inscritLe: string
    recharges: number
    depensesCentimes: number
    gainsCentimes: number
    derniereActivite: string | null
    actif: boolean
  }>
}

export const euros = (centimes: number) =>
  (centimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
