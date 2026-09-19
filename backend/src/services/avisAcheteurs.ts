/**
 * Les avis d'acheteurs sur un produit : une note de 1 à 5, un nom, un texte.
 *
 * Deux entrées, un seul chemin d'écriture. L'extension relève les avis affichés
 * sur la fiche du fournisseur ; le vendeur dépose un fichier CSV à trois
 * colonnes — `stars`, `User`, `Avis`. Les deux passent par `normaliser()` puis
 * `enregistrerAvis()`, pour qu'un avis refusé d'un côté le soit de l'autre.
 *
 * Ce que ce fichier ne fait pas, volontairement : inventer. Un avis sans texte
 * ni note lisible est écarté et compté ; il n'est jamais complété.
 */
import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma.js'

export interface AvisBrut {
  stars?: unknown
  author?: unknown
  text?: unknown
  photos?: unknown
  date?: unknown
}

export interface AvisPropre {
  stars: number
  author: string
  text: string
  photos: string[]
  reviewedAt: Date | null
}

export const AVIS_MAX_PAR_DEPOT = 500
export const AVIS_MAX_PAR_PRODUIT = 1000
const TEXTE_MAX = 4000

/**
 * La note, quelle que soit la façon dont elle est écrite.
 *
 * « 5 », « 4,5 », « 4/5 », « ★★★★☆ », « 5 étoiles », « 80% » (AliExpress note
 * en pourcentage dans certains exports). Arrondie à l'entier le plus proche,
 * bornée à 1–5 ; illisible → null, et l'avis est écarté plutôt que noté 5.
 */
export function lireNote(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return borner(valeur)
  if (typeof valeur !== 'string') return null
  const texte = valeur.trim()
  if (!texte) return null

  const pleines = (texte.match(/[★⭐]/g) ?? []).length
  if (pleines) return borner(pleines)

  const pourcent = texte.match(/^(\d{1,3})\s*%$/)
  if (pourcent) return borner((Number(pourcent[1]) / 100) * 5)

  const nombre = texte.replace(',', '.').match(/(\d+(?:\.\d+)?)/)
  if (!nombre) return null
  return borner(Number(nombre[1]))
}

function borner(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null
  const arrondi = Math.round(n)
  if (arrondi < 1) return 1
  if (arrondi > 5) return null // « 10 » n'est pas une note sur cinq : on ne devine pas l'échelle.
  return arrondi
}

function lireDate(valeur: unknown): Date | null {
  if (typeof valeur !== 'string' || !valeur.trim()) return null
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return null
  // Une date dans le futur ou avant le commerce en ligne est une erreur de lecture.
  if (d.getTime() > Date.now() + 86_400_000 || d.getFullYear() < 2000) return null
  return d
}

/** Un avis prêt à écrire, ou la raison pour laquelle il ne l'est pas. */
export function normaliser(brut: AvisBrut): AvisPropre | { refus: string } {
  const stars = lireNote(brut.stars)
  if (stars === null) return { refus: 'note illisible (attendu : 1 à 5)' }

  const text = typeof brut.text === 'string' ? brut.text.replace(/\s+/g, ' ').trim().slice(0, TEXTE_MAX) : ''
  if (text.length < 2) return { refus: 'texte vide' }

  const auteur = typeof brut.author === 'string' ? brut.author.replace(/\s+/g, ' ').trim().slice(0, 80) : ''

  const photos = Array.isArray(brut.photos)
    ? brut.photos.filter((p): p is string => typeof p === 'string' && /^https:\/\//i.test(p)).slice(0, 6)
    : []

  return { stars, author: auteur || 'Client', text, photos, reviewedAt: lireDate(brut.date) }
}

/** Même produit, même auteur, même texte : le même avis, quelle que soit l'entrée. */
export function empreinteDe(avis: Pick<AvisPropre, 'author' | 'text'>): string {
  return createHash('sha256').update(`${avis.author.toLowerCase()}\n${avis.text.toLowerCase()}`).digest('hex').slice(0, 32)
}

// --- Le fichier CSV ----------------------------------------------------------

/**
 * Lit un CSV sans dépendance : guillemets, guillemets doublés, retours à la
 * ligne dans un champ, séparateur `,` `;` ou tabulation.
 *
 * Le séparateur est lu sur la première ligne : Excel en français écrit des
 * points-virgules, et un avis contient presque toujours des virgules — se
 * tromper de séparateur couperait chaque texte en morceaux.
 */
export function lireCsv(contenu: string): string[][] {
  const texte = contenu.replace(/^﻿/, '')
  const premiere = texte.split(/\r?\n/, 1)[0] ?? ''
  const compte = (c: string) => premiere.split(c).length - 1
  const sep = compte(';') > compte(',') ? ';' : compte('\t') > compte(',') ? '\t' : ','

  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let entreGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') entreGuillemets = false
      else champ += c
      continue
    }
    if (c === '"' && champ.trim() === '') {
      champ = ''
      entreGuillemets = true
    } else if (c === sep) {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ)
      champ = ''
      if (ligne.some((v) => v.trim())) lignes.push(ligne)
      ligne = []
    } else champ += c
  }
  ligne.push(champ)
  if (ligne.some((v) => v.trim())) lignes.push(ligne)
  return lignes
}

const nu = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')

const EN_TETES = {
  stars: ['stars', 'star', 'etoiles', 'etoile', 'note', 'rating', 'notation'],
  author: ['user', 'utilisateur', 'nom', 'name', 'auteur', 'author', 'client', 'pseudo'],
  text: ['avis', 'review', 'texte', 'text', 'commentaire', 'comment', 'message', 'contenu'],
}

/**
 * Les avis d'un fichier à trois colonnes : stars, User, Avis.
 *
 * L'en-tête est reconnu quel que soit l'ordre et la langue ; sans en-tête,
 * l'ordre convenu s'applique (note, nom, texte). Une ligne illisible est
 * rapportée avec son numéro — le vendeur corrige son fichier, il ne devine pas.
 */
export function avisDepuisCsv(contenu: string): { avis: AvisPropre[]; refus: string[] } {
  const lignes = lireCsv(contenu)
  const refus: string[] = []
  if (!lignes.length) return { avis: [], refus: ['Le fichier est vide.'] }

  let colonnes = { stars: 0, author: 1, text: 2 }
  let debut = 0
  const tete = lignes[0].map(nu)
  const trouve = (noms: string[]) => tete.findIndex((t) => noms.includes(t))
  const s = trouve(EN_TETES.stars)
  const t = trouve(EN_TETES.text)
  if (s >= 0 && t >= 0) {
    const a = trouve(EN_TETES.author)
    colonnes = { stars: s, author: a, text: t }
    debut = 1
  } else if (lireNote(lignes[0][0]) === null) {
    // Ni en-tête reconnu ni note en première colonne : on ne devine pas les colonnes.
    return {
      avis: [],
      refus: ['Colonnes non reconnues. Attendu, dans cet ordre ou avec ces en-têtes : stars, User, Avis.'],
    }
  }

  const avis: AvisPropre[] = []
  for (let i = debut; i < lignes.length; i++) {
    if (avis.length >= AVIS_MAX_PAR_DEPOT) {
      refus.push(`Fichier coupé à ${AVIS_MAX_PAR_DEPOT} avis : déposez le reste dans un second fichier.`)
      break
    }
    const l = lignes[i]
    const propre = normaliser({
      stars: l[colonnes.stars],
      author: colonnes.author >= 0 ? l[colonnes.author] : '',
      text: l[colonnes.text],
    })
    if ('refus' in propre) refus.push(`Ligne ${i + 1} : ${propre.refus}.`)
    else avis.push(propre)
  }
  return { avis, refus }
}

// --- L'écriture --------------------------------------------------------------

export interface ResultatDepot {
  ajoutes: number
  dejaPresents: number
  refus: string[]
}

export async function enregistrerAvis(
  produit: { id: string; userId: string },
  avis: AvisPropre[],
  origine: { source: 'extension' | 'csv' | 'manuel'; sourceSite?: string | null },
  refus: string[] = [],
): Promise<ResultatDepot> {
  // Un même fichier porte parfois deux fois la même ligne.
  const uniques = new Map<string, AvisPropre>()
  for (const a of avis) uniques.set(empreinteDe(a), a)

  const existants = await prisma.buyerReview.count({ where: { productId: produit.id } })
  const place = Math.max(0, AVIS_MAX_PAR_PRODUIT - existants)
  const lot = [...uniques.entries()].slice(0, place)
  if (uniques.size > place) {
    refus.push(`Plafond de ${AVIS_MAX_PAR_PRODUIT} avis par produit atteint : ${uniques.size - place} avis non repris.`)
  }

  const ecrit = await prisma.buyerReview.createMany({
    data: lot.map(([empreinte, a]) => ({
      userId: produit.userId,
      productId: produit.id,
      stars: a.stars,
      author: a.author,
      text: a.text,
      photos: a.photos.length ? a.photos : undefined,
      source: origine.source,
      sourceSite: origine.sourceSite ?? null,
      reviewedAt: a.reviewedAt,
      empreinte,
    })),
    skipDuplicates: true,
  })

  return { ajoutes: ecrit.count, dejaPresents: lot.length - ecrit.count, refus }
}

export interface SyntheseAvis {
  nombre: number
  moyenne: number | null
  repartition: Record<1 | 2 | 3 | 4 | 5, number>
}

export function synthese(notes: number[]): SyntheseAvis {
  const repartition = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as SyntheseAvis['repartition']
  for (const n of notes) if (n >= 1 && n <= 5) repartition[n as 1]++
  const nombre = notes.length
  return {
    nombre,
    moyenne: nombre ? Math.round((notes.reduce((t, n) => t + n, 0) / nombre) * 10) / 10 : null,
    repartition,
  }
}
