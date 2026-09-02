import sharp from 'sharp'
import { fetchSourceImage } from './watermark.js'

/**
 * Choisit les photos d'un produit, sans personne pour rattraper.
 *
 * En mode manuel, le vendeur coche les bonnes images dans l'extension et une
 * erreur de tri lui coûte trois secondes. En mode automatique, il n'y a pas de
 * troisième seconde : les cinq premières images retenues partent en annonce
 * telles quelles. Une bannière promotionnelle en photo principale, et l'annonce
 * est refusée par la marketplace ou ne se vend pas.
 *
 * Le tri ne se fait donc pas sur l'ordre d'apparition — qui donne l'en-tête du
 * site — mais sur trois signaux qui, ensemble, désignent la galerie :
 *
 * — l'hôte qui sert le plus d'images est le CDN produit, sur tous les sites
 *   marchands, sans avoir à coder un domaine par fournisseur ;
 * — le chemin d'une photo produit contient presque toujours /product/, /goods/
 *   ou /item/ ;
 * — une photo de galerie est grande et à peu près carrée, une bannière est large
 *   et plate, une icône est minuscule.
 *
 * Les dimensions sont mesurées pour de vrai, en lisant l'en-tête du fichier. Une
 * URL ne dit pas ce qu'elle contient.
 */

/** Ce qui n'est jamais une photo de produit. */
const NOT_A_PHOTO = /\.svg(?:[?#]|$)|sprite|icon|logo|avatar|pixel|badge|placeholder|blank\.|1x1/i

/** Zones d'une page produit qui ne parlent pas du produit. */
const OFF_TOPIC = /recommend|related|similar|also-?(?:like|bought|viewed)|banner|promo|coupon/i

const PRODUCT_PATH = /\/(?:product|products|goods|item|items|sku|detail|kf)\//i

/** Côté minimum : en dessous, c'est une vignette ou un pictogramme. */
const MIN_SIDE = 400

/**
 * Deux adresses de la même photo à des tailles différentes ne diffèrent que par
 * le marqueur de taille que les CDN ajoutent.
 */
function identity(url: string) {
  return url
    .split('?')[0]
    .replace(/[_-]\d{2,4}x\d{2,4}(?=\.\w+$)/i, '')
    .replace(/\/\d{2,4}x\d{2,4}\//, '/')
}

/** L'original, quand l'adresse trouvée pointe une vignette. */
function fullSize(url: string) {
  const bare = url.split('?')[0]
  const stripped = bare
    .replace(/[_-]\d{2,4}x\d{2,4}(?=\.\w+$)/i, '')
    .replace(/\/\d{2,4}x\d{2,4}\//, '/')
  return stripped !== bare ? stripped : null
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export interface SelectedImage {
  url: string
  width: number
  height: number
}

/**
 * Mesure une image en lisant son en-tête.
 *
 * `sharp` n'a besoin que des premiers octets pour donner les dimensions, mais le
 * téléchargement complet est déjà fait par ailleurs pour le filigrane : mesurer
 * ici ne coûte donc rien de plus au moment de l'import.
 */
async function measure(url: string): Promise<SelectedImage | null> {
  const buffer = await fetchSourceImage(url)
  if (!buffer) return null

  try {
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return null
    return { url, width: meta.width, height: meta.height }
  } catch {
    // Un fichier illisible n'est pas une photo utilisable.
    return null
  }
}

/**
 * Trie et mesure les candidats, et rend les meilleurs.
 *
 * @param candidates adresses trouvées sur la page, dans n'importe quel ordre
 * @param limit combien en garder — cinq pour une annonce
 */
/**
 * Combien de photos une annonce garde, à l'import comme à la main.
 *
 * **Une seule valeur, et c'est le vrai changement.** Il y en avait quatre, et
 * elles se contredisaient : cinq par défaut dans le tri, huit à l'import, douze
 * avec l'agent de contrôle, dix à l'ajout manuel. Un vendeur pouvait donc
 * importer douze photos puis s'entendre dire que son annonce en avait « déjà
 * dix » en essayant d'en ajouter une treizième.
 *
 * Quinze, à la demande du vendeur le 02/09/2026.
 *
 * **Ce n'est pas une cible.** Le tri rend ce qu'il a de bon : trois vraies
 * photos valent mieux que quinze dont douze sont des bannières de soldes ou des
 * vignettes de recommandation.
 *
 * À savoir pour la publication : les places de marché ont leurs propres bornes,
 * plus basses — une annonce qui en porte quinze n'en enverra que ce que la
 * destination accepte.
 */
export { PHOTOS_PAR_ANNONCE } from './photoLimits.js'
import { PHOTOS_PAR_ANNONCE } from './photoLimits.js'

export async function selectProductImages(
  candidates: string[],
  limit = PHOTOS_PAR_ANNONCE,
  /**
   * Ce que le site déclare lui-même comme photo du produit : JSON-LD et
   * og:image, écrits par le marchand pour Google et pour les réseaux.
   *
   * C'est le seul signal certain de la liste, et il était jeté : le tri
   * mélangeait ces adresses aux soixante images de la page, où elles ne pesaient
   * pas plus qu'une icône. D'où des annonces automatiques illustrées par
   * l'en-tête du site — une déclaration explicite du marchand perdait contre une
   * heuristique de chemin.
   */
  declared: string[] = [],
  /**
   * Celles qui sont vraiment affichées dans une balise `<img>` de la page.
   *
   * Le reste du lot vient d'un ratissage du source, qui attrape aussi les
   * produits conseillés et les bannières cachés dans le JSON embarqué. Servis
   * par le même CDN, avec le même chemin `/product/`, ils obtenaient exactement
   * le même score que la galerie — et sortaient devant quand ils étaient plus
   * grands. Une image affichée dans le document a été choisie par le marchand
   * pour cette page ; une adresse trouvée dans un blob ne l'a pas forcément été.
   */
  inDom: string[] = [],
  /**
   * Le mobilier de page : en-tete, menu, pied, colonne laterale.
   *
   * Une banniere de soldes est servie par le meme CDN que la galerie, sous le
   * meme chemin, dans une vraie balise <img>, et souvent plus grande que les
   * photos du produit : elle gagnait a tous les criteres. Ce qui la distingue
   * n est pas son adresse mais l endroit ou elle est posee — et une image du
   * mobilier n est jamais le produit, sur aucun site.
   */
  chrome: string[] = [],
): Promise<string[]> {
  const clean = [...new Set(candidates.filter((u) => u.startsWith('http') && !NOT_A_PHOTO.test(u)))]
  if (!clean.length) return []

  // Comparé sur l'identité, pas sur l'adresse : la page lie souvent la vignette
  // là où og:image donne l'original, et ce sont bien les deux mêmes photos.
  const declaredIds = new Set(declared.filter((u) => u.startsWith('http')).map(identity))
  const domIds = new Set(inDom.filter((u) => u.startsWith('http')).map(identity))
  const chromeIds = new Set(chrome.filter((u) => u.startsWith('http')).map(identity))

  // L'hôte qui sert le plus d'images est le CDN produit.
  const counts = new Map<string, number>()
  for (const url of clean) {
    const host = hostOf(url)
    if (host) counts.set(host, (counts.get(host) ?? 0) + 1)
  }
  const galleryHost = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const score = (url: string) => {
    let value = 0
    // La déclaration du marchand passe avant toute heuristique : elle sait, les
    // autres critères devinent.
    if (declaredIds.has(identity(url))) value += 5000
    if (domIds.has(identity(url))) value += 600
    // Ecartee, sauf si le marchand la declare lui-meme comme photo du produit :
    // certains sites posent leur galerie dans un <aside>.
    if (chromeIds.has(identity(url))) value -= 4000
    if (galleryHost && hostOf(url) === galleryHost) value += 1000
    if (PRODUCT_PATH.test(url)) value += 200
    if (OFF_TOPIC.test(url)) value -= 500
    return value
  }

  const ranked = clean.sort((a, b) => score(b) - score(a))

  // Mesurer coûte un téléchargement : on plafonne, mais après le tri, pour que
  // le plafond tombe sur les candidats les moins prometteurs.
  const probes: string[] = []
  const seen = new Set<string>()
  for (const url of ranked.slice(0, 24)) {
    const id = identity(url)
    if (seen.has(id)) continue
    seen.add(id)
    // L'original d'abord : la page ne lie souvent que la vignette.
    const original = fullSize(url)
    probes.push(original ?? url)
    if (original) probes.push(url)
  }

  const measured = (await Promise.all(probes.slice(0, 30).map(measure))).filter(
    (m): m is SelectedImage => m !== null,
  )

  /**
   * Le format compte autant que la taille.
   *
   * Une bannière fait 1200×300 : elle est grande, et ce n'est pas une photo de
   * produit. Une photo de galerie est proche du carré.
   */
  const isPhotoShaped = (m: SelectedImage) => {
    const ratio = Math.max(m.width, m.height) / Math.min(m.width, m.height)
    return ratio <= 2
  }

  const usable = measured.filter((m) => Math.min(m.width, m.height) >= MIN_SIDE && isPhotoShaped(m))

  // Rien d'assez grand : plutôt que de rendre une annonce sans photo, on garde
  // les plus grandes disponibles, en le sachant.
  const pool = usable.length ? usable : measured.filter(isPhotoShaped)

  const best = new Map<string, SelectedImage>()
  for (const m of pool.sort((a, b) => score(b.url) - score(a.url) || b.width * b.height - a.width * a.height)) {
    const id = identity(m.url)
    const kept = best.get(id)
    if (!kept || m.width * m.height > kept.width * kept.height) best.set(id, m)
  }

  /**
   * Mieux vaut trois photos que cinq dont une bannière.
   *
   * Le plafond était une cible : quand la galerie ne comptait que trois photos,
   * les deux places restantes étaient comblées par ce qui traînait, mobilier
   * compris — un score négatif ne suffisait pas à écarter tant qu'il restait un
   * trou à remplir. Une annonce à trois vraies photos se vend ; une annonce à
   * cinq dont une bannière de soldes se fait refuser.
   */
  const retenues = [...best.values()]
    .filter((m) => score(m.url) >= 0)
    .sort((a, b) => score(b.url) - score(a.url) || b.width * b.height - a.width * a.height)

  return retenues.slice(0, limit).map((m) => m.url)
}
