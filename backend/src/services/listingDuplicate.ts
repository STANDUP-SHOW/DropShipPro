import { Prisma, type Product } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

/**
 * Une copie d'annonce, à soi.
 *
 * Ce que ça évite : refaire un import — donc repayer un crédit et rouvrir la
 * fiche du fournisseur — pour vendre le même produit dans un second coloris,
 * sur une seconde boutique, ou pour garder l'original avant de tailler dedans.
 *
 * **Aucun appel au modèle, donc aucun crédit.** Tout est déjà écrit : on
 * recopie, on n'invente rien.
 *
 * Les photos ne sont pas dupliquées sur le stockage, seulement leurs adresses.
 * Deux annonces partagent donc les mêmes fichiers — sans risque, puisque
 * supprimer une annonce n'efface pas ses photos, ce que la fenêtre de
 * suppression dit déjà au vendeur.
 *
 * Ici plutôt que dans la route : une route ne s'éprouve qu'avec un serveur
 * debout, et c'est exactement ce qu'un banc ne doit pas exiger. Même moule que
 * `listingRewrite.ts`.
 */

/**
 * Les colonnes JSON demandent une conversion explicite, et c'est heureux.
 *
 * Prisma rend un JSON nullable comme `null` à la lecture et exige
 * `Prisma.DbNull` à l'écriture : les deux types ne coïncident pas, donc la
 * compilation refuse le raccourci. Le jour où une colonne JSON est ajoutée au
 * modèle, `tsc` échouera ici — bruyamment, ce qui vaut infiniment mieux qu'une
 * copie silencieusement incomplète.
 */
const json = (valeur: Prisma.JsonValue) =>
  valeur === null ? Prisma.DbNull : (valeur as Prisma.InputJsonValue)

export async function dupliquerAnnonce(userId: string, id: string): Promise<Product | null> {
  const original = await prisma.product.findFirst({ where: { id, userId } })
  if (!original) return null

  /*
   * On retire ce qui appartient à la ligne, et on recopie tout le reste.
   *
   * L'inverse — énumérer les champs à copier — oublie le prochain : le modèle
   * en compte plus de quarante, et une colonne ajoutée plus tard serait perdue
   * en silence à chaque duplication. Ici, elle suit toute seule.
   * `findFirst` sans `include` ne rend que des colonnes : rien de relationnel
   * ne peut se glisser dans la copie.
   */
  const { id: _id, userId: _userId, createdAt: _cree, updatedAt: _maj, ...champs } = original

  return prisma.product.create({
    data: {
      ...champs,
      userId,
      images: json(champs.images) as Prisma.InputJsonValue,
      exportImages: json(champs.exportImages),
      variants: json(champs.variants),
      combinations: json(champs.combinations),
      titleVariants: json(champs.titleVariants),
      bulletPoints: json(champs.bulletPoints),
      attributes: json(champs.attributes),
      marketAnalysis: json(champs.marketAnalysis),

      /*
       * Le titre affiché est marqué, le texte source ne l'est jamais.
       *
       * `title` et `description` portent ce que le fournisseur a écrit : c'est
       * de là que `reecrireAnnonce()` repart. Y coller « (copie) » polluerait
       * la matière première de toutes les réécritures futures, et le suffixe
       * s'empilerait à chaque duplication d'une duplication. `aiTitle` est ce
       * que la liste montre — c'est donc lui qui distingue les deux lignes, et
       * quand il est vide on l'écrit à partir du titre source sans y toucher.
       */
      aiTitle: `${original.aiTitle ?? original.title} (copie)`,

      /*
       * Une copie n'est publiée nulle part.
       *
       * Les `Publication` ne sont pas recopiées — la relation n'est pas dans
       * `champs`. Reprendre l'état « Publié » ferait croire à une annonce en
       * ligne qu'aucune place de marché ne connaît, et le vendeur ne le
       * découvrirait qu'en cherchant sa vente.
       */
      status: 'DRAFT',
    },
  })
}
