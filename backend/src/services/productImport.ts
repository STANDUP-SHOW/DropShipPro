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
import { lireSkuAliExpress, type ModulesAliExpress } from './aliexpressSku.js'
import { optionsDepuisCombinaisons, validerMatrice, type Combinaison } from './variantMatrix.js'

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

/**
 * Une fiche deja relevee par l extension, qui remplace le scraping.
 *
 * Sur les sites batis en JavaScript -- Temu, AliExpress, Shein -- le serveur ne
 * recoit qu une coquille vide. L extension, elle, lit la page affichee. Le reste
 * de la chaine est identique, et c est tout l interet : la capture etait une
 * **troisieme** copie du meme travail, et elle avait ses propres oublis.
 */
export interface FicheRelevee {
  title: string
  description: string
  price: number
  currency: string
  images: string[]
  sourceCategory: string | null
  pageText?: string
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
    /**
     * Les combinaisons, avec leur prix, leur photo et leur stock.
     *
     * C est ce qui manquait : `variantes` ne porte que des libelles, et une
     * publication ne peut pas transmettre un prix par variante qu elle n a pas.
     */
    combinaisons?: unknown
    /** Les modules bruts d une fiche AliExpress, a joindre nous-memes. */
    skuAliExpress?: ModulesAliExpress | null
  } | null
  /** La fiche relevee par l extension. Presente : on ne va pas lire la page. */
  capture?: FicheRelevee | null
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

  /*
   * La page est lue seulement si personne ne l a deja lue.
   *
   * L extension envoie ce qu elle a vu a l ecran ; aller le rechercher cote
   * serveur donnerait une coquille vide sur les sites qui construisent leur
   * fiche en JavaScript, et ecraserait un bon releve par un mauvais.
   */
  const scraped = options.capture
    ? {
        ...options.capture,
        sourceSite: new URL(url).hostname.replace('www.', ''),
        declaredImages: [] as string[],
        domImages: [] as string[],
        chromeImages: [] as string[],
      }
    : await scrapeProduct(url)
  const user: User = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  /*
   * Trois travaux qui ne s'attendent pas — et qui s'attendaient.
   *
   * La réécriture, la lecture des options et le tri des photos ne dépendent que
   * de la page : aucun des trois n'a besoin du résultat des deux autres. Ils
   * étaient pourtant lancés l'un après l'autre, donc **leurs durées
   * s'additionnaient** — deux appels au modèle et une série de mesures d'images
   * en file indienne, pour rien.
   *
   * Signalé le 02/09/2026 : « pourquoi c'est aussi long, entre 60 et 120
   * secondes ». La cause n'était pas la lenteur d'une étape, c'était leur mise
   * bout à bout. Ensemble, l'import ne coûte plus que la plus lente des trois.
   *
   * `Promise.all` et non `allSettled` : chacun de ces trois-là gère déjà son
   * propre échec et rend une valeur de repli — un modèle injoignable rend le
   * texte source, pas une exception.
   */
  const releveesParExtension = (options.releve?.images ?? options.capture?.images ?? []).filter(Boolean)

  const [enhanced, luesParLeModele, chosen] = await Promise.all([
    enhanceListing({
      title: scraped.title,
      description: scraped.description,
      category: scraped.sourceCategory,
      pageText: scraped.pageText,
    }),
    // Les options d'achat se lisent dans le texte de la page : aucune balise ne
    // les déclare, et sans cette lecture un import ne rend ni taille ni couleur.
    extractVariants(scraped.pageText ?? ''),
    /*
     * Les photos sont choisies, jamais prises dans l'ordre d'apparition.
     *
     * Cet ordre donne l'en-tête du site, pas la galerie. C'est la première
     * chose que l'import en lot avait perdue.
     */
    releveesParExtension.length
      ? Promise.resolve(releveesParExtension.slice(0, PHOTOS_PAR_ANNONCE))
      : selectProductImages(
          scraped.images,
          PHOTOS_PAR_ANNONCE,
          scraped.declaredImages,
          scraped.domImages,
          scraped.chromeImages,
        ),
  ])

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
  const reparees = reparerVariantes(verdict ? applyVerdict(annoncees, verdict) : annoncees).variantes

  /*
   * La matrice des combinaisons, quand la page l'a donnée.
   *
   * C'est elle qui porte le prix, la photo, le stock et la référence de chaque
   * choix — tout ce que `variants` ne sait pas dire. Sans elle, publier une
   * fiche à douze couleurs envoie douze fois le même prix et aucune image, non
   * par défaut d'appel mais faute d'avoir quoi que ce soit à transmettre.
   *
   * Et quand elle existe, **les options d'affichage en sont dérivées**. Garder
   * les deux listes en parallèle finirait par les voir se contredire : une
   * valeur proposée à l'acheteur qui ne mène à aucun prix.
   */
  const combinaisons = lireCombinaisons(options.releve, notes)
  const variants = combinaisons ? optionsDepuisCombinaisons(combinaisons) : reparees

  const watermarked = await rapatrierImages(retenues, enhanced.title)

  /*
   * Les photos de variante sont rapatriées elles aussi.
   *
   * Elles arrivent avec l'adresse du fournisseur. Les publier telles quelles
   * marcherait — et **contournerait le filigrane** : tout le reste de
   * l'application pose la marque au départ, ces photos-là partiraient nues sur
   * Shopify et sur la vitrine. Elles finiraient aussi par disparaître le jour où
   * AliExpress retire la fiche, laissant douze variantes sans image.
   *
   * Elles sont donc stockées chez nous comme les autres, et la matrice pointe
   * vers notre copie.
   */
  /*
   * Le rangement part en même temps que les photos de variante.
   *
   * Il ne dépend que du titre et de la page — jamais des photos — et il peut
   * appeler le modèle. L'attendre après le rapatriement ajoutait sa durée à
   * celle des téléchargements alors que les deux peuvent courir ensemble.
   */
  const [combinaisonsStockees, rangement] = await Promise.all([
    rapatrierPhotosDeVariante(combinaisons, enhanced.title, notes),
    resoudreCategorie({
      sourceCategory: scraped.sourceCategory,
      supplierId: supplierFields(url).supplierId,
      title: scraped.title,
      pageText: scraped.pageText,
    }),
  ])
  if (!rangement.categoryId) {
    notes.push("Aucune catégorie sûre : l'annonce reste en brouillon.")
  }

  /*
   * Un prix absent se dit, il ne se devine pas.
   *
   * `sellingPrice` vaut `price * 1.5` : sans prix d'achat, l'annonce arrive à
   * zéro euro, avec une marge de zéro et une note amputée — et rien à l'écran
   * n'explique pourquoi. Le vendeur croit avoir importé un produit vendable.
   *
   * Cela arrive sur les pages qui chargent leur prix après l'affichage. Le
   * refus est déjà posé pour les fournisseurs connus pour ça (voir
   * `scraper.ts`) ; ailleurs, mieux vaut garder l'annonce — les photos et le
   * texte valent d'être pris — et dire ce qu'il manque.
   */
  if (!(scraped.price > 0)) {
    notes.push("Aucun prix trouvé sur la page : renseignez le prix d'achat pour calculer votre marge.")
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
      combinations: (combinaisonsStockees ?? undefined) as object | undefined,
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
 * Rapatrie les photos de variante et reecrit la matrice vers nos copies.
 *
 * Une seule passe pour toutes les adresses distinctes : douze combinaisons de
 * trois couleurs ne font que trois photos, et les telecharger douze fois
 * couterait neuf allers-retours pour rien.
 *
 * Un echec ne perd pas la combinaison : elle garde l adresse du fournisseur,
 * qui vaut mieux que pas d image du tout. C est dit dans les notes.
 */
async function rapatrierPhotosDeVariante(
  combos: Combinaison[] | null,
  titre: string,
  notes: string[],
): Promise<Combinaison[] | null> {
  if (!combos?.length) return combos

  const adresses = [...new Set(combos.map((c) => c.image).filter((u): u is string => Boolean(u)))]
  if (!adresses.length) return combos

  const stockees = await rapatrierImages(adresses, titre)
  // `rapatrierImages` saute silencieusement ce qu il n a pas pu lire : sans
  // cette garde, la correspondance se decalerait et une couleur porterait la
  // photo d une autre.
  if (stockees.length !== adresses.length) {
    notes.push(
      `${adresses.length - stockees.length} photo(s) de variante non rapatriée(s) : adresses du fournisseur conservées.`,
    )
    return combos
  }

  const parAdresse = new Map(adresses.map((u, i) => [u, stockees[i]]))
  return combos.map((c) => (c.image ? { ...c, image: parAdresse.get(c.image) ?? c.image } : c))
}

/**
 * Lit la matrice de combinaisons du releve, quelle que soit sa forme.
 *
 * Deux sources possibles : une matrice deja construite par l extension, ou les
 * modules bruts d une fiche AliExpress qu on joint nous-memes. La seconde est
 * preferee quand les deux sont la -- elle vient de la page, la premiere d une
 * interpretation.
 *
 * Ne leve jamais : une matrice illisible fait une annonce sans combinaisons,
 * pas un import perdu. Le vendeur a quand meme ses photos, son texte et son
 * prix, et la raison est ecrite dans les notes.
 */
function lireCombinaisons(
  releve: OptionsImport['releve'],
  notes: string[],
): Combinaison[] | null {
  if (!releve) return null

  if (releve.skuAliExpress) {
    try {
      const lues = lireSkuAliExpress(releve.skuAliExpress)
      if (lues.length) {
        notes.push(`${lues.length} combinaison(s) relevée(s) avec leur prix et leur photo.`)
        return lues
      }
    } catch (e) {
      notes.push('Les options de la page n ont pas pu être lues : annonce sans variantes.')
    }
  }

  if (releve.combinaisons) {
    try {
      return validerMatrice(releve.combinaisons)
    } catch (e) {
      notes.push(e instanceof Error ? e.message : 'Matrice de variantes illisible.')
    }
  }

  return null
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
