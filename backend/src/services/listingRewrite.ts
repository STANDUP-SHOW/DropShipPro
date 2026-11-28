import type { Product } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { enhanceListing } from './aiEnhancer.js'
import { substanceSource } from './sourceQuality.js'

/**
 * Refaire la réécriture d'une annonce déjà importée, sans retourner sur la page.
 *
 * **Le besoin est né d'une panne.** Le 02/09/2026, `claude-sonnet-4-5` a cessé
 * d'être servi et l'IA est tombée. `enhanceListing` avale son propre échec par
 * conception — une clé morte ne doit pas détruire un import — donc les annonces
 * ont continué d'arriver, avec le texte brut du fournisseur, sans attributs ni
 * arguments de vente, et sans qu'aucune erreur ne s'affiche. Trente annonces
 * inutilisables, importées de bonne foi.
 *
 * **Pourquoi ça ne repasse pas par la page source.** Les fiches AliExpress,
 * Temu et Shein ne se relisent pas depuis un serveur — c'est tout le sujet de
 * l'extension. Mais l'annonce a gardé le titre et la description d'origine :
 * c'est exactement ce que le premier import avait envoyé au modèle. La
 * réécriture peut donc se refaire à l'identique, y compris pour un produit
 * AliExpress, et sans que le vendeur rouvre quoi que ce soit.
 *
 * Ce qui manque par rapport au premier passage : `pageText`, le corps de la
 * page, qui porte les caractéristiques techniques et n'est pas conservé. Le
 * résultat est donc au moins aussi bon que l'annonce ratée, souvent bien
 * meilleur, parfois un peu en dessous d'un import réussi. Le dire vaut mieux que
 * de laisser croire à une remise à neuf complète.
 */

export interface Reecriture {
  /** Faux quand le modèle n'a pas répondu : rien n'a changé, rien n'est facturé. */
  reecrit: boolean
  /** Pourquoi rien n'a été réécrit, dit au vendeur tel quel. */
  raison?: string
  /** Ce qu'il faut écrire en base, ou `null` s'il n'y a rien à changer. */
  champs: Record<string, unknown> | null
  /** Ce qui a bougé, dit au vendeur. */
  changements: string[]
}

/**
 * Le texte de la fiche fournisseur gardé pour cette annonce.
 *
 * 28/11/2026 : le bouton « Réécrire » échouait sur presque toutes les annonces
 * AliExpress. Sur ces fiches la description relevée est vide : toute la matière
 * est dans le corps de la page (`pageText`), que l'import envoyait au modèle
 * mais ne gardait pas. La réécriture repartait donc du seul titre, et la garde
 * « texte trop maigre » la refusait à chaque fois (constaté sur 3 des 4 fiches
 * AliExpress réelles du banc). Désormais `sourceText` est gardé à l'import ;
 * pour les annonces plus anciennes importées en lot, la file de réécriture en
 * avait gardé une copie.
 */
export async function texteDeLaFiche(produit: Product): Promise<string | null> {
  if (produit.sourceText?.trim()) return produit.sourceText
  const job = await prisma.rewriteJob.findUnique({ where: { productId: produit.id }, select: { entree: true } })
  const page = (job?.entree as { pageText?: unknown } | null)?.pageText
  return typeof page === 'string' && page.trim() ? page : null
}

/** Ce qui empêche la réécriture, AVANT tout drop et tout appel au modèle ; `null` si elle peut partir. */
export function refusAvantAppel(produit: Product, pageText: string | null): string | null {
  const ok = substanceSource({ title: produit.title, description: produit.description ?? '', pageText }).assezPourEcrire
  if (ok) return null
  return pageText
    ? "La fiche du fournisseur relevée à l'import contient trop peu de texte pour être réécrite sans inventer. " +
        'Réimportez-la depuis la fiche ouverte et défilée jusqu’en bas. Aucun drop n’a été pris.'
    : "Le texte de la fiche du fournisseur n'a pas été gardé pour cette annonce (importée avant le 28/11/2026) : " +
        'seul le titre est connu, la réécrire inventerait. Réimportez-la depuis la fiche. Aucun drop n’a été pris.'
}

export async function reecrireAnnonce(produit: Product, pageText?: string | null): Promise<Reecriture> {
  const source = {
    title: produit.title,
    description: produit.description,
    category: produit.sourceCategory,
    pageText: pageText === undefined ? await texteDeLaFiche(produit) : pageText,
  }

  /*
   * Le texte du fournisseur, pas celui de l'IA.
   *
   * Repartir de `aiTitle` ferait réécrire une réécriture : sur une annonce
   * ratée, `aiTitle` **est** le titre du fournisseur, mais sur une annonce
   * réussie ce serait une copie de copie, qui s'éloigne du produit à chaque
   * passage.
   */
  const reecrite = await enhanceListing(source)
  if (!reecrite.enhanced) {
    return { reecrit: false, champs: null, changements: [], raison: reecrite.raison ?? "L'IA n'a pas répondu." }
  }

  const champs: Record<string, unknown> = {
    // Sans ce drapeau, l'annonce réécrite gardait le bandeau « la réécriture n'a pas abouti ».
    aiEnhanced: true,
    rewritePending: false,
    aiTitle: reecrite.title,
    aiDescription: reecrite.description,
    metaTitle: reecrite.metaTitle,
    metaDescription: reecrite.metaDescription,
    metaKeywords: reecrite.metaKeywords,
    titleVariants: reecrite.titleVariants ?? undefined,
  }

  const changements = [`Titre et description réécrits (${reecrite.description.length} caractères)`]

  /*
   * Les arguments et les attributs ne s'écrasent que s'ils apportent plus.
   *
   * Un vendeur a pu compléter les siens à la main entre-temps ; un modèle qui
   * en rend moins ne doit pas les remplacer. Sur une annonce ratée, ils sont
   * vides, donc tout passe.
   */
  const bulletsActuels = Array.isArray(produit.bulletPoints) ? produit.bulletPoints.length : 0
  if (reecrite.bulletPoints.length > bulletsActuels) {
    champs.bulletPoints = reecrite.bulletPoints
    changements.push(`${reecrite.bulletPoints.length} arguments de vente`)
  }

  const attributsActuels = Object.keys((produit.attributes as Record<string, string>) ?? {}).length
  if (Object.keys(reecrite.attributes).length > attributsActuels) {
    champs.attributes = reecrite.attributes
    changements.push(`${Object.keys(reecrite.attributes).length} attributs`)
  }

  return { reecrit: true, champs, changements }
}
