import { useEffect, useState } from 'react'
import { apiRoot, getToken } from './api'

/**
 * DESKTOP POWER (demande de Max du 24/10/2026) : les pages du site qui ne
 * prennent vie que dans l'application DropShipper Desktop.
 *
 * Dans l'application, le site s'ouvre en pleine page et reçoit un pont,
 * `window.dropshipperDesktop` (desktop/site-preload.js), exposé à ses seules
 * pages. Dans un navigateur ordinaire, le pont n'existe pas : les pages le
 * disent et proposent l'installeur, sans rien simuler.
 */

export interface EtatNavigateur {
  profil: string
  ouvert: boolean
  visible?: boolean
  url?: string
  titre?: string
  chargement?: boolean
  peutRetour?: boolean
  peutAvancer?: boolean
  /** Le mot qui a fait reconnaître une vérification anti-robot sur la page. */
  bloque?: string | null
}

export interface PlateformeSession {
  id: 'VINTED' | 'LEBONCOIN' | 'FACEBOOK'
  nom: string
  session: { connecte: boolean; verifie: string } | null
  /** Le formulaire de dépôt : ne s'ouvre qu'à un compte connecté. */
  verification: string | null
  accord: string | null
  arret: { raison: string; at: string } | null
  plafond: number
  espacementMin: number
  decision: { ok: boolean; raison?: string }
}

export interface EtatDesktop {
  version: string
  relie: boolean
  compte: string | null
  nbLiens: number
  nbAnnonces: number
  nbAchats: number
  capture: boolean
  erreur: string | null
  texteAccord: string
  plateformes: PlateformeSession[]
}

type Zone = { x: number; y: number; width: number; height: number }
type Resultat = { ok: boolean; erreur?: string }

/** Les panneaux locaux de l'application (desktop/renderer/index.html). */
export type SectionPanneau = 'auto' | 'partages' | 'achats' | 'publication' | 'journal'

/** Une offre relevée par le rassembleur ; prixEur reste null s'il n'est pas affiché en euros. */
export interface OffreRassemblee {
  ref: string
  url: string
  titre: string
  image: string | null
  prixEur: number | null
  entrepot: null
}

export interface PontDesktop {
  version: string
  etat(): Promise<EtatDesktop>
  partager(url: string): Promise<Resultat>
  importer(lien: { url: string; id?: string }): Promise<Resultat & { productId?: string | null }>
  capture(actif: boolean): Promise<EtatDesktop>
  panneau(section: SectionPanneau): Promise<Resultat>
  accorder(id: string): Promise<unknown>
  retirerAccord(id: string): Promise<unknown>
  reprendre(id: string): Promise<unknown>
  /** SmartMarket : la page de recherche du fournisseur lue dans la session du vendeur (desktop/lib/rassembleur.js). */
  rassembler(demande: { fournisseur: string; q: string }): Promise<Resultat & { blocage?: boolean; url?: string; produits?: OffreRassemblee[] }>
  verifierSession(id: string): Promise<Resultat & { etat?: 'connecte' | 'absent' | 'inconnu' }>
  navigateur: {
    ouvrir(o: { profil: string; url?: string; zone?: Zone; forcer?: boolean }): Promise<Resultat & { etat?: EtatNavigateur }>
    placer(zone: Zone | null): Promise<Resultat>
    masquer(): Promise<Resultat>
    aller(adresse: string): Promise<Resultat>
    retour(): Promise<Resultat>
    avancer(): Promise<Resultat>
    recharger(): Promise<Resultat>
    lire(): Promise<Resultat & { page?: { url: string; titre: string; texte: string } }>
  }
  surNavigateur(cb: (e: EtatNavigateur) => void): () => void
  surEtat(cb: (e: EtatDesktop) => void): () => void
}

declare global {
  interface Window {
    dropshipperDesktop?: PontDesktop
  }
}

/** Le pont de l'application, ou null dans un navigateur ordinaire. */
export function pont(): PontDesktop | null {
  return typeof window !== 'undefined' && window.dropshipperDesktop ? window.dropshipperDesktop : null
}

/** L'état de l'application, tenu à jour ; null hors de l'application. */
export function useDesktop(): EtatDesktop | null {
  const [etat, setEtat] = useState<EtatDesktop | null>(null)
  useEffect(() => {
    const p = pont()
    if (!p) return
    p.etat().then(setEtat).catch(() => undefined)
    return p.surEtat(setEtat)
  }, [])
  return etat
}

/** Les routes /api/desktop-power du serveur (backend/src/routes/desktopPower.ts). */
async function appel<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${apiRoot}/api/desktop-power${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  const corps = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((corps as { error?: string }).error || `Erreur ${res.status}`)
  return corps as T
}

export interface Partage {
  id: string
  url: string
  titre: string | null
  note: string | null
  source: string
  statut: 'NEW' | 'CLAIMED' | 'DONE'
  cree: string
  pris: string | null
}

export interface ProduitAutoShipper {
  id: string
  titre: string
  image: string | null
  prixAchat: number
  prixVente: number
  devise: string
  statut: string
  fournisseur: string | null
  rayon: string | null
  source: string
  importe: string
  publications: Array<{ plateforme: string; statut: string; url: string | null }>
  ventes: number
  ca: number
  marge: number
}

export interface StatsAutoShipper {
  joursActives: number
  joursTournes: number
  coutDrops: number
  coutEuros: number
  produitsImportes: number
  produitsPublies: number
  ventes: number
  ca: number
  margeBrute: number
  profit: number
}

export interface AnalyseAds {
  id: string
  plateforme: 'facebook' | 'tiktok'
  url: string
  titre: string
  produit: string | null
  donnees: Record<string, string | null> | null
  drops: number
  createdAt: string
  body?: string
}

export const dpApi = {
  partages: () => appel<{ partages: Partage[] }>('/partages'),
  partageFait: (id: string) => appel<{ ok: true }>(`/partages/${encodeURIComponent(id)}/fait`, { method: 'POST' }),
  partageRetirer: (id: string) => appel<{ ok: true }>(`/partages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  autoshipper: () => appel<{ lots: Array<{ jour: string; produits: ProduitAutoShipper[] }>; stats: StatsAutoShipper; note: string }>('/autoshipper'),
  analysesAds: () => appel<{ tarif: number; bibliotheques: Record<'facebook' | 'tiktok', { nom: string; accueil: string }>; analyses: AnalyseAds[] }>('/ads-analyses'),
  analyseAds: (id: string) => appel<{ analyse: AnalyseAds & { body: string } }>(`/ads-analyses/${encodeURIComponent(id)}`),
  analyserAds: (o: { plateforme: 'facebook' | 'tiktok'; produit?: string; page: { url: string; titre: string; texte: string } }) =>
    appel<{ analyse: AnalyseAds & { body: string } }>('/ads-analyses', { method: 'POST', body: JSON.stringify(o) }),
}
