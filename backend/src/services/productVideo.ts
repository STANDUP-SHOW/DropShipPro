import { randomUUID } from 'crypto'
import { putFile } from '../lib/storage.js'

/**
 * La vidéo d'une annonce : celle du vendeur, jamais celle du fournisseur.
 *
 * **Décision du 03/09/2026, et elle est explicite :** « je ne veux pas de
 * capture vidéo du fournisseur, juste ajouter une vidéo sur nos produits,
 * qu'elle soit utilisée quand la plateforme de destination l'accepte.
 * Fournisseurs : uniquement photos. »
 *
 * Deux raisons de ne pas la capter. Une fiche Temu ou AliExpress sert sa vidéo
 * en flux (`blob:`, HLS) et non en fichier : l'attraper demanderait un chantier
 * à part, au résultat incertain. Et la revendre sous sa propre enseigne pose
 * une question de droits que personne n'a tranchée — une photo de produit se
 * défend comme une illustration du bien vendu, une vidéo de marque beaucoup
 * moins.
 *
 * Le relevé de l'extension reste donc strictement photo, et
 * `check-video.ts` le vérifie plutôt que de s'en remettre à ce commentaire.
 */

/**
 * Les formats acceptés, et pourquoi ceux-là.
 *
 * MP4 (H.264) est le seul que toutes les destinations lisent. WebM et QuickTime
 * sont acceptés parce que c'est ce que rendent un navigateur et un iPhone —
 * refuser le fichier qui sort du téléphone du vendeur serait refuser le cas le
 * plus courant.
 */
export const FORMATS_VIDEO: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

/**
 * Cinquante mégaoctets.
 *
 * Le fichier transite entier en mémoire — `multer` en mémoire, comme pour les
 * photos — et le conteneur Railway n'est pas grand. Cinquante mégaoctets
 * laissent passer une trentaine de secondes en 1080p, ce qui est déjà plus long
 * que ce qu'une fiche produit gagne à montrer. Au-delà, le refus est explicite
 * plutôt qu'une coupure de connexion que personne ne sait lire.
 */
export const VIDEO_MAX_OCTETS = 50 * 1024 * 1024

/** Le refus, dit en clair, ou `null` quand le fichier convient. */
export function refusVideo(mimetype: string, taille: number): string | null {
  if (!FORMATS_VIDEO[mimetype]) {
    return `Format non accepté (${mimetype || 'inconnu'}) — envoyez un MP4, un WebM ou un MOV.`
  }
  if (taille > VIDEO_MAX_OCTETS) {
    const mo = Math.round(taille / (1024 * 1024))
    return `Vidéo trop lourde (${mo} Mo) — ${Math.round(VIDEO_MAX_OCTETS / (1024 * 1024))} Mo au maximum.`
  }
  return null
}

/** Le nom du fichier : lisible pour le référencement, unique par construction. */
export function nomFichierVideo(titre: string, mimetype: string): string {
  const slug = (titre || 'produit')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'produit'}-${randomUUID().slice(0, 8)}.${FORMATS_VIDEO[mimetype]}`
}

/**
 * Enregistre la vidéo et rend l'adresse à mettre en base.
 *
 * Aucun filigrane : `sharp` ne sait pas traiter une vidéo, et poser une marque
 * dessus demanderait `ffmpeg` — que l'image Nixpacks n'embarque pas. Le dire
 * vaut mieux que de laisser croire que la vidéo est protégée comme les photos.
 */
export async function enregistrerVideo(
  fichier: Buffer,
  mimetype: string,
  titre: string,
): Promise<string> {
  return putFile(`videos/${nomFichierVideo(titre, mimetype)}`, fichier, mimetype)
}
