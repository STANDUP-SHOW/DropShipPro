import type { Product, User } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { scrapeProduct } from './scraper.js'
import { enhanceListing, extractVariants } from './aiEnhancer.js'
import { selectProductImages, PHOTOS_PAR_ANNONCE } from './imageSelect.js'
import { reparerVariantes } from './variantRepair.js'
import { reviewImages, applyVerdict } from './controlAgent.js'
import { resoudreCategorie } from './categories.js'
import { rapatrierImages } from './watermark.js'
import { supplierFields } from './suppliers.js'

/**
 * L'import d'une annonce, en un seul endroit.
 *
 * **Il y en avait deux, et elles avaient divergé.** L'import par adresse et
 * l'import en lot faisaient le même travail dans deux blocs recopiés — et le
 * second avait pris du retard sur le premier sans que personne s'en aperçoive.
 * Relevé le 02/09/2026, l'import en lot sautait :
 *
 * - **Le tri des photos.** Il prenait `scraped.images` dans l'ordre du DOM,
 *   c'est-à-dire l'en-tête du site, le menu, les bannières. Une annonce sur deux
 *   était illustrée par un logo.
 * - **Les variantes.** Aucune. Ni relevé de la page, ni réparation des familles :
 *   vingt annonces importées en lot n'avaient pas une seule taille ni couleur.
 * - **L'agent de contrôle**, quand le vendeur l'a activé et le paie.
 * - **`imagesWatermarked: false`.** La colonne vaut `true` par défaut, donc les
 *   annonces importées en lot étaient réputées **déjà marquées** : leur filigrane
 *   n'a jamais été posé, et rien ne le signalait.
 *
 * Aucun de ces quatre défauts n'était visible en lisant le code de l'import en
 * lot — ils ne se voient qu'en le comparant à l'autre. C'est pour ça qu'il n'y a
 * plus qu'une routine : les deux entrées, plus l'extension, appellent la même.
 */

export interface ResultatImport {
  produit: Product
  /** Faux quand le modèle n'a pas répondu : l'appelant rend le crédit. */
  reecrit: boolean
  /** Ce qui mérite d'être dit au vendeur sans être une erreur. */
  notes: string[]
}

export interface OptionsImport {
  /** La boutique de destination, quand le vendeur en a désigné une. */
  shopId?: string | null
  /**
   * Ce que l'extension a déjà relevé sur la page.
   *
   * Elle lit le DOM affiché, là où le serveur ne reçoit qu'une coquille sur les
   * sites bâtis en JavaScript. Quand elle a relevé quelque chose, ça l'emporte.
   */
  releve?: {
    images?: string[]
    variantes?: Record<string, string[]>
  } | null
}

/**
 * Importe une adresse et crée l'annonce.
 *
 * Ne touche pas aux crédits : c'est l'appelant qui réserve et rend, parce que
 * l'import simple et l'import en lot ne les comptent pas de la même façon.
 */
export async function importerAdresse(
  userId: string,
  url: string,
  options: OptionsImport = {},
): Promise<ResultatImport> {
  const notes: string[] = []

  const scraped = await scrapeProduct(url)
  const user: User = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const enhanced = await enhanceListing({
    title: scraped.title,
    description: scraped.description,
    category: scraped.sourceCategory,
    pageText: scraped.pageText,
  })

  /*
   * Les photos sont choisies, jamais prises dans l'ordre d'apparition.
   *
   * Cet ordre donne l'en-tête du site, pas la galerie. C'est la première chose
   * que l'import en lot avait perdue.
   */
  const releveesParExtension = (options.releve?.images ?? []).filter(Boolean)
  const chosen = releveesParExtension.length
    ? releveesParExtension.slice(0, PHOTOS_PAR_ANNONCE)
    : await selectProductImages(
        scraped.images,
        PHOTOS_PAR_ANNONCE,
        scraped.declaredImages,
        scraped.domImages,
        scraped.chromeImages,
      )

  // Les options d'achat se lisent dans le texte de la page : aucune balise ne
  // les déclare, et sans cette lecture un import ne rend ni taille ni couleur.
  const luesParLeModele = await extractVariants(scraped.pageText)
  const annoncees = fusionnerVariantes(options.releve?.variantes, luesParLeModele)

  // L'agent de contrôle voit ce que les heuristiques ne peuvent pas voir : une
  // bannière au bon format, sur le bon serveur, passe tous les filtres.
  const verdict = user.controlAgent
    ? await reviewImages({ images: chosen, title: enhanced.title, variants: annoncees })
    : null

  const retenues = verdict?.checked ? verdict.keep : chosen
  if (verdict?.checked && verdict.keep.length < chosen.length) {
    notes.push(`${chosen.length - verdict.keep.length} photo(s) écartée(s) par l'agent de contrôle.`)
  }

  // Les fournisseurs rangent tout sous « Color » : capacités, tailles, modèles.
  // La réparation est déterministe et ne coûte aucun appel.
  const variants = reparerVariantes(verdict ? applyVerdict(annoncees, verdict) : annoncees).variantes

  const watermarked = await rapatrierImages(retenues, enhanced.title)

  const rangement = await resoudreCategorie({
    sourceCategory: scraped.sourceCategory,
    supplierId: supplierFields(url).supplierId,
    title: scraped.title,
    pageText: scraped.pageText,
  })
  if (!rangement.categoryId) {
    notes.push("Aucune catégorie sûre : l'annonce reste en brouillon.")
  }

  const produit = await prisma.product.create({
    data: {
      userId,
      sourceUrl: url,
      sourceSite: scraped.sourceSite,
      ...supplierFields(url),
      shopId: options.shopId ?? undefined,
      sourceCategory: scraped.sourceCategory,
      categoryId: rangement.categoryId,
      title: scraped.title,
      description: scraped.description,
      aiTitle: enhanced.title,
      aiDescription: enhanced.description,
      price: scraped.price,
      sellingPrice: scraped.price * 1.5,
      currency: scraped.currency,
      variants: variants ?? undefined,
      images: watermarked.length ? watermarked : retenues,
      /*
       * Les fichiers rapatriés sont les **originaux**.
       *
       * La marque se pose à l'export. Laisser la valeur par défaut — `true` —
       * ferait croire au système qu'elle est déjà dessus, et l'annonce
       * partirait sans filigrane pour toujours. C'est ce que faisait l'import
       * en lot, en silence.
       */
      imagesWatermarked: false,
      metaTitle: enhanced.metaTitle,
      metaDescription: enhanced.metaDescription,
      metaKeywords: enhanced.metaKeywords,
      titleVariants: enhanced.titleVariants,
      bulletPoints: enhanced.bulletPoints,
      attributes: enhanced.attributes,
      aiEnhanced: enhanced.enhanced,
      status: 'READY',
    },
  })

  return { produit, reecrit: enhanced.enhanced, notes }
}

/**
 * Réunit les options relevées par l'extension et celles lues par le modèle.
 *
 * Le relevé de la page l'emporte quand les deux nomment le même groupe : il
 * vient de ce que le site affiche vraiment, là où le modèle interprète. Mais
 * tout groupe que seul le modèle a vu est conservé — il lit des tailles dans une
 * phrase que le DOM ne déclare nulle part.
 */
export function fusionnerVariantes(
  releve: Record<string, string[]> | null | undefined,
  modele: Record<string, string[]> | null | undefined,
): Record<string, string[]> | null {
  const sortie: Record<string, string[]> = { ...(modele ?? {}) }
  for (const [nom, valeurs] of Object.entries(releve ?? {})) {
    if (Array.isArray(valeurs) && valeurs.length) sortie[nom] = valeurs
  }
  return Object.keys(sortie).length ? sortie : null
}
