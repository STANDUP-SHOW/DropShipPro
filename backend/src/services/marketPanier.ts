import type { Request, Response } from 'express'
import { annonces, type Annonce, type Offre } from './market.js'
import { cookies, poserCookie } from './marketClients.js'

/**
 * Le panier de DropShop Market, gardé dans un cookie : il marche sans compte,
 * comme sur Amazon, et survit à la connexion. Le cookie ne contient que des
 * identifiants d'offre et des quantités ; le prix est TOUJOURS relu en base au
 * moment d'afficher et de payer, jamais pris dans le cookie.
 *
 * Lisible par le script de la page (pas HttpOnly) : l'en-tête, servi depuis un
 * cache, y lit le nombre d'articles. Rien de sensible n'y est.
 */

export const COOKIE_PANIER = 'dsm_panier'
export const MAX_LIGNES = 30
export const MAX_QUANTITE = 10

export interface LignePanier {
  offre: string
  quantite: number
}

export function lirePanier(req: Request): LignePanier[] {
  const brut = cookies(req)[COOKIE_PANIER] ?? ''
  const vues = new Map<string, number>()
  for (const morceau of brut.split('|')) {
    const [offre, q] = morceau.split('~')
    if (!offre || !/^[A-Za-z0-9-]{4,80}$/.test(offre)) continue
    const quantite = Math.min(MAX_QUANTITE, Math.max(1, Number.parseInt(q ?? '1', 10) || 1))
    vues.set(offre, Math.min(MAX_QUANTITE, (vues.get(offre) ?? 0) + quantite))
  }
  return [...vues.entries()].slice(0, MAX_LIGNES).map(([offre, quantite]) => ({ offre, quantite }))
}

export function ecrirePanier(req: Request, res: Response, lignes: LignePanier[]) {
  const valeur = lignes
    .slice(0, MAX_LIGNES)
    .map((l) => `${l.offre}~${l.quantite}`)
    .join('|')
  poserCookie(req, res, COOKIE_PANIER, valeur, { maxAgeS: valeur ? 60 * 86400 : 0, httpOnly: false })
}

export function ajouter(lignes: LignePanier[], offre: string, quantite: number): LignePanier[] {
  const q = Math.min(MAX_QUANTITE, Math.max(1, quantite))
  const existante = lignes.find((l) => l.offre === offre)
  if (existante) return lignes.map((l) => (l.offre === offre ? { ...l, quantite: Math.min(MAX_QUANTITE, l.quantite + q) } : l))
  return [...lignes, { offre, quantite: q }].slice(-MAX_LIGNES)
}

export function modifier(lignes: LignePanier[], offre: string, quantite: number): LignePanier[] {
  if (quantite <= 0) return lignes.filter((l) => l.offre !== offre)
  return lignes.map((l) => (l.offre === offre ? { ...l, quantite: Math.min(MAX_QUANTITE, quantite) } : l))
}

export interface LigneResolue {
  annonce: Annonce
  offre: Offre
  quantite: number
  /** En euros, prix relu en base. */
  total: number
}

/**
 * Relit chaque ligne en base. Une offre retirée du Market disparaît du panier ;
 * une offre épuisée reste visible, marquée, et n'est pas payée.
 */
export async function resoudre(lignes: LignePanier[]): Promise<{ lignes: LigneResolue[]; epuisees: LigneResolue[]; disparues: number }> {
  if (!lignes.length) return { lignes: [], epuisees: [], disparues: 0 }
  const ids = [...new Set(lignes.map((l) => l.offre.split('-')[0]))]
  const liste = await annonces({ productIds: ids, limite: ids.length })
  const parProduit = new Map(liste.map((a) => [a.product.id, a]))
  const ok: LigneResolue[] = []
  const epuisees: LigneResolue[] = []
  let disparues = 0
  for (const l of lignes) {
    const annonce = parProduit.get(l.offre.split('-')[0])
    const offre = annonce?.offres.find((o) => o.id === l.offre)
    if (!annonce || !offre) {
      disparues++
      continue
    }
    const r = { annonce, offre, quantite: l.quantite, total: Math.round(offre.prix * l.quantite * 100) / 100 }
    ;(offre.disponible ? ok : epuisees).push(r)
  }
  return { lignes: ok, epuisees, disparues }
}

export function totalPanier(lignes: LigneResolue[]): number {
  return Math.round(lignes.reduce((s, l) => s + l.total, 0) * 100) / 100
}
