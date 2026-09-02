/**
 * Combien de photos une annonce porte, et rien d'autre.
 *
 * **Ce fichier n'existe que pour n'avoir aucune dépendance.** Le nombre vivait
 * dans `imageSelect.ts`, qui importe `watermark.ts` ; le jour où `watermark.ts`
 * a voulu le lire à son tour, le cycle s'est refermé et le serveur ne démarrait
 * plus — « Cannot access 'PHOTOS_PAR_ANNONCE' before initialization ».
 *
 * Une décision partagée par plusieurs modules ne peut pas habiter chez l'un
 * d'eux : elle a besoin d'un endroit que tout le monde peut lire sans rien
 * entraîner derrière.
 *
 * **Le même nombre est écrit une seconde fois**, dans
 * `extension/content/capture.js` — l'extension ne peut rien importer du
 * serveur, les deux programmes ne partagent aucun code. `check-plafonds.cjs`
 * est le seul lien possible entre les deux : il lit les deux fichiers et exige
 * qu'ils s'accordent. Il a été écrit après que le vendeur a buté quatre fois
 * sur un plafond de dix qui n'existait plus nulle part ailleurs.
 */

/**
 * Quinze, depuis le 02/09/2026 — dix auparavant.
 *
 * Le nombre vient de ce que les places de marché acceptent : au-delà de quinze,
 * la plupart ignorent le reste, et une galerie plus longue ralentit l'import
 * sans rien ajouter à la vente.
 */
export const PHOTOS_PAR_ANNONCE = 15
