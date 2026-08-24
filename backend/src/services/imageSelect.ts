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
export async function selectProductImages(candidates: string[], limit = 5): Promise<string[]> {
  const clean = [...new Set(candidates.filter((u) => u.startsWith('http') && !NOT_A_PHOTO.test(u)))]
  if (!clean.length) return []

  // L'hôte qui sert le plus d'images est le CDN produit.
  const counts = new Map<string, number>()
  for (const url of clean) {
    const host = hostOf(url)
    if (host) counts.set(host, (counts.get(host) ?? 0) + 1)
  }
  const galleryHost = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const score = (url: string) => {
    let value = 0
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

  return [...best.values()]
    .sort((a, b) => score(b.url) - score(a.url) || b.width * b.height - a.width * a.height)
    .slice(0, limit)
    .map((m) => m.url)
}
