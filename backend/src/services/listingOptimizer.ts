import type { Product } from '@prisma/client'
import { enhanceListing } from './aiEnhancer.js'
import { scoreListing, type ListingScore } from './listingScore.js'

/**
 * L'agent qui reprend une annonce jusqu'à ce qu'elle tienne debout.
 *
 * **Ce qui manquait.** La note existait, les corrections étaient écrites
 * critère par critère — « titre un peu court, visez 50 à 70 » — et personne ne
 * les appliquait. Le vendeur lisait un bulletin, sans bouton pour le suivre.
 * Sur trois cents annonces, un diagnostic qu'il faut exécuter à la main
 * n'existe pas.
 *
 * **Ce que cet agent corrige, et ce qu'il ne corrige pas.** Il touche à ce qui
 * s'écrit : titre, description, arguments de vente, attributs, mots-clés. Il ne
 * touche ni aux photos, ni au prix, ni aux options d'achat — ajouter une photo
 * demande une photo, fixer une marge est une décision commerciale, inventer une
 * taille serait mentir sur le produit. Ces trois-là restent au vendeur, et
 * l'agent le dit plutôt que de laisser croire à un échec.
 *
 * **Cent sur cent n'est donc pas toujours atteignable**, et c'est une
 * information, pas une limite honteuse : une annonce à deux photos plafonne à
 * 86, et le seul geste utile est d'en ajouter trois. Annoncer « 100 %
 * optimisée » sur une annonce à deux photos serait la même promesse creuse que
 * la présélection de photos qui cochait des tondeuses.
 */

/** Les critères qu'une réécriture peut réellement faire monter. */
const REDIGEABLES = new Set(['Titre', 'Description', 'Attributs', 'Arguments de vente', 'Mots-clés'])

export interface Optimisation {
  avant: ListingScore
  apres: ListingScore
  /** Les champs réellement modifiés, dits au vendeur dans ses mots. */
  changements: string[]
  /**
   * Ce qui reste, et que l'agent ne peut pas faire lui-même.
   *
   * Séparé des changements parce que c'est une demande, pas un compte rendu :
   * le vendeur doit savoir quoi faire ensuite, et pourquoi ça ne pouvait pas
   * être fait pour lui.
   */
  aVous: string[]
  /** Vrai quand plus rien de rédactionnel ne manque. */
  complet: boolean
  /** Faux quand le modèle n'a pas répondu : rien n'a été modifié, rien n'est facturé. */
  reecrit: boolean
}

/**
 * Ce qu'il faut demander au modèle, à partir de ce qui manque.
 *
 * La consigne est bâtie sur les critères en défaut, pas sur un texte figé : une
 * annonce dont seule la description est courte ne doit pas voir son titre
 * réécrit — il est déjà bon, et le remplacer par un autre titre correct fait
 * perdre le travail du vendeur sans gagner un point.
 */
function consigneDeReprise(note: ListingScore): string {
  const manques = note.checks
    .filter((c) => c.fix && REDIGEABLES.has(c.label))
    .map((c) => `- ${c.label} : ${c.fix}`)

  if (!manques.length) return ''

  return [
    "Cette annonce existe déjà et se vend mal sur les points suivants. Corrige-les, et uniquement ceux-là :",
    ...manques,
    '',
    "Garde le produit tel qu'il est : ne change ni la marque, ni le modèle, ni les caractéristiques.",
    "N'invente aucune donnée technique absente du texte fourni.",
  ].join('\n')
}

/**
 * Reprend une annonce et rend ce qu'il faut écrire en base.
 *
 * Rend `null` en `champs` quand il n'y avait rien à reprendre côté rédaction :
 * l'appelant évite alors une écriture inutile, et surtout n'annonce pas un
 * travail qui n'a pas eu lieu.
 */
export async function optimiserAnnonce(produit: Product): Promise<{
  optimisation: Optimisation
  champs: Record<string, unknown> | null
}> {
  const avant = scoreListing(produit)

  const aVous = avant.checks
    .filter((c) => c.fix && !REDIGEABLES.has(c.label))
    .map((c) => c.fix as string)

  const consigne = consigneDeReprise(avant)
  if (!consigne) {
    return {
      optimisation: { avant, apres: avant, changements: [], aVous, complet: true, reecrit: true },
      champs: null,
    }
  }

  const reecrite = await enhanceListing({
    title: produit.aiTitle || produit.title,
    description: produit.aiDescription || produit.description,
    category: produit.sourceCategory,
    /*
     * La consigne voyage dans le texte de la page.
     *
     * C'est le seul champ libre qu'accepte `enhanceListing`, et le détourner
     * évite d'ouvrir une seconde route vers le modèle — donc un second endroit
     * où le ton de l'application se réglerait, et divergerait.
     */
    pageText: [consigne, produit.description ?? ''].join('\n\n').slice(0, 12000),
  })

  if (!reecrite.enhanced) {
    return {
      optimisation: { avant, apres: avant, changements: [], aVous, complet: false, reecrit: false },
      champs: null,
    }
  }

  /*
   * On ne remplace que ce qui manquait, et seulement si c'est mieux.
   *
   * Un critère déjà au maximum garde sa valeur : le modèle rend une annonce
   * entière à chaque appel, et tout prendre écraserait un titre que le vendeur
   * a écrit lui-même par un titre équivalent — du travail perdu pour zéro point.
   */
  const champs: Record<string, unknown> = {}
  const changements: string[] = []
  const enDefaut = new Set(avant.checks.filter((c) => c.fix).map((c) => c.label))

  if (enDefaut.has('Titre') && reecrite.title && reecrite.title !== produit.aiTitle) {
    champs.aiTitle = reecrite.title
    champs.titleVariants = reecrite.titleVariants
    changements.push(`Titre réécrit (${reecrite.title.length} caractères)`)
  }
  if (enDefaut.has('Description') && reecrite.description.length > (produit.aiDescription ?? '').length) {
    champs.aiDescription = reecrite.description
    changements.push(`Description enrichie (${reecrite.description.length} caractères)`)
  }
  if (enDefaut.has('Attributs') && Object.keys(reecrite.attributes).length) {
    // Fusionnés : ceux que le vendeur a saisis lui-même sont plus sûrs que
    // ceux qu'un modèle déduit, et rien ne justifie de les écraser.
    const fusion = { ...reecrite.attributes, ...((produit.attributes as Record<string, string>) ?? {}) }
    champs.attributes = fusion
    changements.push(`${Object.keys(fusion).length} attributs`)
  }
  if (enDefaut.has('Arguments de vente') && reecrite.bulletPoints.length) {
    champs.bulletPoints = reecrite.bulletPoints
    changements.push(`${reecrite.bulletPoints.length} arguments de vente`)
  }
  if (enDefaut.has('Mots-clés') && reecrite.metaKeywords) {
    champs.metaKeywords = reecrite.metaKeywords
    changements.push(`${reecrite.metaKeywords.split(',').filter((k) => k.trim()).length} mots-clés`)
  }

  const apres = scoreListing({ ...produit, ...champs } as Product)
  const resteRedactionnel = apres.checks.some((c) => c.fix && REDIGEABLES.has(c.label))

  return {
    optimisation: {
      avant,
      apres,
      changements,
      aVous: apres.checks.filter((c) => c.fix && !REDIGEABLES.has(c.label)).map((c) => c.fix as string),
      complet: !resteRedactionnel,
      reecrit: true,
    },
    champs: Object.keys(champs).length ? champs : null,
  }
}
