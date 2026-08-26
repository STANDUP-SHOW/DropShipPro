import type { Platform, Product } from '@prisma/client'
import { TITRE_MAX } from './channelRules.js'

/**
 * Le titre, adapté à chaque destination.
 *
 * Aucun titre unique ne peut convenir partout, et ce n'est pas une opinion :
 * Amazon accepte deux cents caractères et en veut au moins soixante pour être
 * bien référencé, Leboncoin coupe à cinquante. Un titre écrit pour l'un est
 * refusé par l'autre. Le moteur de conformité l'a mis en évidence en refusant
 * une annonce parfaitement correcte.
 *
 * Trois longueurs suffisent à couvrir les vingt destinations : les limites
 * réelles se groupent autour de cinquante, quatre-vingts et deux cents. Chaque
 * canal reçoit ensuite **la plus longue qui tient chez lui** — jamais une
 * troncature brutale, qui couperait au milieu d'un mot et perdrait justement le
 * mot-clé qui fait vendre.
 */

export interface TitleVariants {
  /** Jusqu'à 50 caractères : Leboncoin. */
  court: string
  /** Jusqu'à 80 : Vinted, eBay, Facebook. */
  moyen: string
  /** Le titre complet, jusqu'à 200 : Amazon, Cdiscount, Google Shopping. */
  long: string
}

/** Lit les trois longueurs stockées sur l'annonce, quand elles existent. */
export function readVariants(product: Product): TitleVariants | null {
  const raw = product.titleVariants
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const v = raw as Record<string, unknown>
  const texte = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '')

  const court = texte('court')
  const moyen = texte('moyen')
  const long = texte('long')
  if (!court && !moyen && !long) return null

  // Une longueur absente retombe sur la suivante : mieux vaut un titre un peu
  // long, que le canal coupera lui-même, que pas de titre du tout.
  return {
    court: court || moyen || long,
    moyen: moyen || long || court,
    long: long || moyen || court,
  }
}

/**
 * Raccourcit sans couper un mot.
 *
 * Le recours quand aucune variante ne tient : on retire des mots par la fin
 * plutôt que des lettres. « Montre automatique homme acier inoxyd… » ne veut
 * plus rien dire et ne se cherche pas ; « Montre automatique homme » se cherche.
 */
export function trimToWords(titre: string, max: number): string {
  const propre = titre.trim()
  if (propre.length <= max) return propre

  const mots = propre.split(/\s+/)
  let out = ''
  for (const mot of mots) {
    const essai = out ? `${out} ${mot}` : mot
    if (essai.length > max) break
    out = essai
  }

  // Un seul mot plus long que la limite : là, il faut bien couper.
  return out || propre.slice(0, max)
}

/**
 * Le titre à envoyer sur une destination donnée.
 *
 * Prend la plus longue variante qui tient. Une destination sans limite connue
 * reçoit le titre complet : inventer une contrainte qu'on n'a pas lue serait
 * pire que de laisser la plateforme trancher.
 */
export function titleForChannel(product: Product, platform: Platform): string {
  const base = (product.aiTitle || product.title || '').trim()
  const max = TITRE_MAX[platform]
  if (!max) return base

  const variants = readVariants(product)
  const candidats = variants ? [variants.long, variants.moyen, variants.court] : [base]

  for (const candidat of candidats) {
    if (candidat && candidat.length <= max) return candidat
  }

  // Aucune variante ne tient : on raccourcit la plus courte, par mots.
  const plusCourte = candidats.filter(Boolean).sort((a, b) => a.length - b.length)[0] ?? base
  return trimToWords(plusCourte, max)
}

/**
 * Ce que chaque destination recevra, pour l'afficher au vendeur.
 *
 * Montré sur la fiche : le vendeur voit d'un coup d'œil que son titre de cent
 * trente caractères devient autre chose sur Leboncoin, au lieu de le découvrir
 * en comparant deux annonces en ligne.
 */
export function titlesByChannel(product: Product): Array<{
  platform: Platform
  max: number
  titre: string
  raccourci: boolean
}> {
  const base = (product.aiTitle || product.title || '').trim()

  return (Object.keys(TITRE_MAX) as Platform[])
    .map((platform) => {
      const titre = titleForChannel(product, platform)
      return {
        platform,
        max: TITRE_MAX[platform]!,
        titre,
        raccourci: titre !== base,
      }
    })
    .sort((a, b) => a.max - b.max)
}
