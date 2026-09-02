import { prisma } from '../lib/prisma.js'
import { reparerVariantes } from './variantRepair.js'
import { SupplierError, findConnector } from './supplierConnectors.js'
import { enhanceListing } from './aiEnhancer.js'
import { rapatrierImages } from './watermark.js'
import { PHOTOS_PAR_ANNONCE } from './photoLimits.js'
import { resoudreCategorie } from './categories.js'
import { reserveCredits } from './billing.js'

/**
 * Importer des fiches par l'API du fournisseur.
 *
 * C'est la troisième voie d'acquisition, et la seule qui marche sur une liste.
 * L'adresse ne marche pas sur AliExpress, Temu ou Shein — ces sites construisent
 * leur page en JavaScript et rendent une coquille vide à un client HTTP.
 * L'extension marche, mais une page à la fois : elle ne sert à rien devant un
 * export de deux cents références.
 *
 * L'API, elle, ne demande qu'un identifiant. Et un export d'AliExpress Business
 * ne contient précisément que ça.
 *
 * **Les photos sont téléchargées et réhébergées**, comme pour tout autre import.
 * Elles arrivent en adresses chez le fournisseur ; les garder telles quelles
 * ferait dépendre chaque annonce d'un serveur qui n'est pas le nôtre, sur des
 * fichiers que le fournisseur peut retirer le jour où il retire le produit.
 */

export interface ResultatImport {
  importes: number
  echecs: Array<{ ref: string; raison: string }>
  /** Les produits déjà présents, qui n'ont pas été réimportés ni refacturés. */
  deja: number
  /** Les fournisseurs non reliés, qu'il faut brancher pour aller plus loin. */
  nonRelies: string[]
}

export async function importerDepuisFournisseurs(
  userId: string,
  parFournisseur: Map<string, Map<string, string>>,
  options: { apiBaseUrl?: string } = {},
): Promise<ResultatImport> {
  const resultat: ResultatImport = { importes: 0, echecs: [], deja: 0, nonRelies: [] }

  const liens = await prisma.supplierConnection.findMany({ where: { userId, connected: true } })

  for (const [supplierId, refs] of parFournisseur) {
    const connecteur = findConnector(supplierId)
    if (!connecteur?.fetchProduct) {
      resultat.nonRelies.push(connecteur?.label ?? supplierId)
      for (const ref of refs.keys()) {
        resultat.echecs.push({
          ref,
          raison: `${connecteur?.label ?? supplierId} ne permet pas encore l'import par API.`,
        })
      }
      continue
    }

    const lien = liens.find((l) => l.supplier === supplierId)
    if (!lien) {
      resultat.nonRelies.push(connecteur.label)
      for (const ref of refs.keys()) {
        resultat.echecs.push({
          ref,
          raison: `${connecteur.label} n'est pas relié : branchez-le dans API Sourcing Connect.`,
        })
      }
      continue
    }

    const identifiants = (lien.data ?? {}) as Record<string, string>
    const contexte = {
      async saveCredentials(patch: Record<string, string>) {
        await prisma.supplierConnection.update({
          where: { id: lien.id },
          data: { data: { ...identifiants, ...patch } },
        })
      },
    }

    for (const [ref, sourceUrl] of refs) {
      // Déjà en catalogue : on ne réimporte pas, et on ne refacture pas. Un
      // vendeur qui rejoue son export ne doit pas payer deux fois les mêmes
      // annonces.
      const existant = await prisma.product.findFirst({
        where: { userId, supplierId, supplierRef: ref },
        select: { id: true },
      })
      if (existant) {
        resultat.deja++
        continue
      }

      // Le crédit est pris avant l'appel : appeler le modèle puis annoncer qu'il
      // n'y avait pas de crédit serait payer pour rien.
      const credit = await reserveCredits(userId, 1)
      if (!credit.ok) {
        resultat.echecs.push({ ref, raison: 'Crédits épuisés.' })
        break
      }

      try {
        const fiche = await connecteur.fetchProduct(ref, identifiants, contexte)

        const enrichi = await enhanceListing({
          title: fiche.title,
          description: fiche.description,
          category: fiche.category,
          pageText: fiche.pageText,
        })

        /*
         * Le même plafond que partout ailleurs, pas huit.
         *
         * `8` était écrit ici à la main : un import par liste fournisseur
         * rendait donc des annonces à huit photos quand les deux autres voies
         * en rendent quinze, sans que rien ne distingue les deux cas pour le
         * vendeur. Quatrième valeur d'un nombre qui ne devait en avoir qu'une.
         */
        const filigranees = await rapatrierImages(
          fiche.images.slice(0, PHOTOS_PAR_ANNONCE),
          enrichi.title,
        )

        /*
         * L'identifiant de catégorie du fournisseur est la clé la plus sûre :
         * chez un fournisseur donné, il ne désigne jamais deux choses. Il vaut
         * mieux que n'importe quel rapprochement de libellé, et il évite un
         * appel au modèle dès le deuxième produit de la même famille.
         */
        const rangement = await resoudreCategorie({
          sourceCategory: fiche.category,
          supplierCategoryId: fiche.category,
          supplierId,
          title: fiche.title,
          pageText: fiche.pageText,
        })

        await prisma.product.create({
          data: {
            userId,
            sourceUrl,
            sourceSite: supplierId,
            supplierId,
            supplierRef: ref,
            supplierPrice: fiche.price || undefined,
            supplierCheckedAt: new Date(),
            sourceCategory: fiche.category,
            categoryId: rangement.categoryId,
            title: fiche.title,
            description: fiche.description,
            aiTitle: enrichi.title,
            aiDescription: enrichi.description,
            titleVariants: enrichi.titleVariants ?? undefined,
            price: fiche.price,
            sellingPrice: fiche.price * 1.5,
            currency: fiche.currency,
            images: filigranees.length ? filigranees : fiche.images,
            // La marque se pose a l export : ces fichiers sont les originaux.
            imagesWatermarked: false,
            variants: reparerVariantes(fiche.variants).variantes,
            metaTitle: enrichi.metaTitle,
            metaDescription: enrichi.metaDescription,
            metaKeywords: enrichi.metaKeywords,
            /*
             * Les arguments et les caractéristiques étaient jetés.
             *
             * `enhanceListing` les écrit dans le même appel que le titre et la
             * description — ils sont donc **déjà payés**. Ne pas les enregistrer
             * revenait à facturer un travail puis à le mettre à la poubelle, et
             * l'annonce arrivait avec une note amputée de vingt-deux points sur
             * cent (Attributs 12, Arguments 10) sans raison lisible.
             */
            bulletPoints: enrichi.bulletPoints?.length ? enrichi.bulletPoints : undefined,
            attributes: Object.keys(enrichi.attributes ?? {}).length ? enrichi.attributes : undefined,
            /*
             * En brouillon, toujours.
             *
             * Une liste importée en masse n'a été relue par personne : ni les
             * photos, ni le prix de vente calculé au coefficient par défaut. Les
             * mettre en ligne d'office reviendrait à publier deux cents annonces
             * que le vendeur découvrirait après coup.
             */
            status: 'DRAFT',
          },
        })

        resultat.importes++
      } catch (err) {
        // Le crédit est rendu : le vendeur n'a rien reçu.
        await prisma.user.update({ where: { id: userId }, data: { credits: { increment: 1 } } })

        const raison = err instanceof SupplierError ? err.message : `Import impossible pour ${ref}.`
        resultat.echecs.push({ ref, raison })

        // Un refus qui porte sur la liaison arrête tout le lot : continuer
        // ferait deux cents appels voués au même échec, et deux cents lignes
        // d'erreur identiques à lire.
        if (err instanceof SupplierError && err.actionnable) break
      }
    }
  }

  // Le nom d'un fournisseur non relié n'a pas à figurer deux fois.
  resultat.nonRelies = [...new Set(resultat.nonRelies)]
  return resultat
}
