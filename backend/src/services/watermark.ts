import sharp from 'sharp'
import { mkdir, readFile } from 'fs/promises'
import path from 'path'
import { putFile } from '../lib/storage.js'
import { randomUUID } from 'crypto'
import { absoluteUrl } from '../lib/urls.js'
import { PHOTOS_PAR_ANNONCE } from './photoLimits.js'

/**
 * Le plafond de photos, pris à sa source unique.
 *
 * **C'était `10` en dur ici**, alors que le reste de l'application accepte 15
 * depuis le 02/09/2026. Le vendeur cochait quinze photos et n'en retrouvait
 * dix : rien n'échouait, cinq disparaissaient en silence au rapatriement. Le
 * même nombre était écrit en dur à quatre endroits du sélecteur de l'extension
 * et ici — cinq copies d'une décision unique.
 */
const MAX_IMAGES = PHOTOS_PAR_ANNONCE
const STORAGE_DIR = path.resolve('storage', 'products')
const LOGO_DIR = path.resolve('storage', 'watermarks')

/** Where the watermark sits on the photo. */
export type WatermarkPosition =
  | 'north'
  | 'northeast'
  | 'east'
  | 'southeast'
  | 'south'
  | 'southwest'
  | 'west'
  | 'northwest'
  | 'center'

export interface WatermarkOptions {
  /** Fallback when no logo is set. */
  text: string
  /** Public path (/storage/watermarks/…) of a PNG or SVG logo; wins over text. */
  imagePath?: string | null
  /** Width of the mark as a percentage of the photo width. */
  scale?: number
  /** 10 to 100. */
  opacity?: number
  position?: WatermarkPosition
  /**
   * Faux quand le vendeur ne veut aucun filigrane.
   *
   * Les photos passent quand meme par ici : elles sont telechargees, remises a
   * l endroit et rangees chez nous sous un nom lisible pour le referencement.
   * Seule la marque n est pas posee. Court-circuiter tout le traitement
   * laisserait les annonces pointer vers les adresses du fournisseur, qui
   * expirent ou bloquent le lien depuis un autre site.
   */
  enabled?: boolean
}

/**
 * Builds an SEO-friendly file name from the listing title. Marketplaces and image
 * search index the file name, so "chemise-homme-col-mao-1.jpg" is worth more than a
 * random uuid. A short uuid suffix keeps names unique across products.
 */
function seoFileName(title: string, index: number) {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'produit'}-${index + 1}-${randomUUID().slice(0, 8)}.jpg`
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** Text mark, drawn with a dark copy behind it so it stays readable on pale photos. */
function textOverlay(text: string, width: number, opacity: number) {
  const fontSize = Math.max(16, Math.round(width * 0.045))
  const safe = escapeXml(text)
  const alpha = opacity / 100
  return Buffer.from(
    `<svg width="${width}" height="${Math.round(fontSize * 1.6)}">
      <style>
        .wm { fill: rgba(255,255,255,${alpha}); font-size: ${fontSize}px; font-family: sans-serif; font-weight: 700; }
        .sh { fill: rgba(0,0,0,${alpha * 0.6}); font-size: ${fontSize}px; font-family: sans-serif; font-weight: 700; }
      </style>
      <text x="51%" y="${fontSize + 3}" class="sh" text-anchor="middle">${safe}</text>
      <text x="50%" y="${fontSize}" class="wm" text-anchor="middle">${safe}</text>
    </svg>`,
  )
}

/**
 * Reads the shop's logo, wherever it was stored.
 *
 * Once object storage is on, saveWatermarkLogo returns an absolute URL, and the
 * old disk read would fail with ENOENT — silently, because the caller falls back
 * to the text watermark. A seller would lose their logo without a word.
 */
async function readLogo(imagePath: string): Promise<Buffer> {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    const res = await fetch(imagePath)
    if (!res.ok) throw new Error(`logo injoignable (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }
  return readFile(path.join(LOGO_DIR, path.basename(imagePath)))
}

/**
 * Prepares the logo overlay: resized to the requested share of the photo width and
 * faded to the requested opacity.
 *
 * sharp rasterises SVG on read, so PNG (transparency preserved) and SVG both work.
 * The alpha channel is multiplied rather than replaced, otherwise a transparent
 * background would turn opaque and box the logo in.
 */
async function logoOverlay(imagePath: string, photoWidth: number, scale: number, opacity: number) {
  const buffer = await readLogo(imagePath)
  const targetWidth = Math.max(40, Math.round((photoWidth * scale) / 100))

  return sharp(buffer, { density: 300 })
    .resize({ width: targetWidth, withoutEnlargement: false })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.round((opacity / 100) * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer()
}

/**
 * Downloads a source photo the way a browser would.
 *
 * A bare fetch is refused by most supplier CDNs — Temu and Banggood answer 403
 * without a browser user agent and a referer from their own domain. The old code
 * skipped the image silently, produced nothing, and the import fell back to the
 * unwatermarked source URLs: the seller saw photos with no watermark and no
 * explanation.
 */
export async function fetchSourceImage(source: string): Promise<Buffer | null> {
  // Une photo déjà traitée est rangée chez nous et référencée par un chemin
  // relatif — `/storage/…`. Les agents visuels repartent de ces photos-là, et
  // `fetch` ne sait pas quoi faire d'un chemin sans hôte : la génération
  // échouait avec « aucune photo n'a pu être lue » alors que le fichier
  // existait.
  const url = absoluteUrl(source)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        // Hotlink protection accepts a referer from the image's own site.
        Referer: new URL(url).origin + '/',
      },
    })
    if (!res.ok) {
      console.error(`filigrane : photo refusee (${res.status}) ${url.slice(0, 120)}`)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    console.error('filigrane : photo injoignable', url.slice(0, 120), (err as Error).message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Downloads up to MAX_IMAGES source images and stamps the shop's watermark on each,
 * saving the result to disk. Returns the public paths served via /storage.
 */
export async function watermarkImages(
  imageUrls: string[],
  options: WatermarkOptions,
  productTitle = 'produit',
): Promise<string[]> {
  await mkdir(STORAGE_DIR, { recursive: true })

  const scale = options.scale ?? 22
  const opacity = options.opacity ?? 75
  const gravity = options.position ?? 'southeast'
  const selected = imageUrls.slice(0, MAX_IMAGES)

  /*
   * Le logo, construit une fois par largeur rencontrée.
   *
   * Il dépend de la largeur de la photo — un logo de 22 % n'a pas la même
   * taille sur une photo de 800 et sur une de 1600. Une seule variable
   * partagée suffisait tant que les photos étaient traitées l'une après
   * l'autre ; en parallèle, deux photos de largeurs différentes se
   * disputeraient la même. Une promesse par largeur les sert toutes sans
   * refaire le travail.
   */
  const logos = new Map<number, Promise<Buffer | null>>()
  function logoPour(width: number): Promise<Buffer | null> {
    if (!options.imagePath) return Promise.resolve(null)
    let attendu = logos.get(width)
    if (!attendu) {
      attendu = logoOverlay(options.imagePath, width, scale, opacity).catch((err) => {
        // A missing or corrupt logo must not lose the whole import: fall back to text.
        console.error('logo de filigrane illisible, repli sur le texte', err)
        return null
      })
      logos.set(width, attendu)
    }
    return attendu
  }

  async function traiter(url: string, index: number): Promise<{ index: number; chemin: string } | null> {
    try {
      const buffer = await fetchSourceImage(url)
      if (!buffer) return null
      const image = sharp(buffer).rotate()
      const meta = await image.metadata()
      const width = meta.width ?? 800

      const filename = seoFileName(productTitle, index)

      // Through a buffer rather than straight to disk: the same bytes go either
      // to the container's volume or to object storage, decided by putFile.
      const marque =
        options.enabled === false
          ? null
          : (await logoPour(width)) ?? textOverlay(options.text, width, opacity)
      const output = await (marque ? image.composite([{ input: marque, gravity }]) : image)
        .jpeg({ quality: 88 })
        .toBuffer()

      return { index, chemin: await putFile(`products/${filename}`, output, 'image/jpeg') }
    } catch {
      // If a given source image can't be fetched/processed, skip it rather than
      // fail the whole import — the user can still review/replace it in the back office.
      return null
    }
  }

  /*
   * Quatre photos de front, et pas quinze.
   *
   * **Ceci est le chemin de l'export, pas celui de l'import** — la marque se
   * pose au moment de publier, sur l'original conservé (voir `rapatrierImages`).
   * Le gain se voit donc à la publication et à l'export, pas sur le compteur
   * d'un import.
   *
   * Quatre et pas quinze parce que `sharp` décode en mémoire : quinze images
   * de trois mille pixels ouvertes ensemble tiennent plusieurs centaines de
   * mégaoctets, et le conteneur n'en a pas tant. Quatre couvre l'attente réseau
   * sans mettre la mémoire en danger.
   */
  const CONCURRENCE = 4
  const sorties: Array<{ index: number; chemin: string } | null> = []
  for (let i = 0; i < selected.length; i += CONCURRENCE) {
    sorties.push(...(await Promise.all(selected.slice(i, i + CONCURRENCE).map((u, k) => traiter(u, i + k)))))
  }

  /*
   * Remises dans l'ordre d'origine.
   *
   * Il porte le choix du vendeur : la première photo est celle qui s'affiche
   * partout. Un traitement en parallèle rend les résultats dans l'ordre où ils
   * finissent, c'est-à-dire dans celui des vitesses de CDN — la photo
   * principale se retrouverait en quatrième position pour avoir mis une seconde
   * de plus à arriver.
   */
  return sorties
    .filter((s): s is { index: number; chemin: string } => s !== null)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.chemin)
}

/**
 * Same treatment as a scraped photo, for files uploaded from the back office.
 * `startIndex` continues the numbering so added photos don't overwrite the
 * existing ones' SEO file names.
 */
export async function watermarkUploads(
  buffers: Buffer[],
  options: WatermarkOptions,
  productTitle: string,
  startIndex = 0,
): Promise<string[]> {
  await mkdir(STORAGE_DIR, { recursive: true })

  const scale = options.scale ?? 22
  const opacity = options.opacity ?? 75
  const gravity = options.position ?? 'southeast'
  const results: string[] = []
  let logo: Buffer | null = null

  for (const [offset, buffer] of buffers.entries()) {
    try {
      const image = sharp(buffer).rotate()
      const meta = await image.metadata()
      const width = meta.width ?? 800

      if (options.imagePath && !logo) {
        logo = await logoOverlay(options.imagePath, width, scale, opacity).catch(() => null as unknown as Buffer)
      }

      const filename = seoFileName(productTitle, startIndex + offset)
      const marque = options.enabled === false ? null : logo ?? textOverlay(options.text, width, opacity)
      const output = await (marque ? image.composite([{ input: marque, gravity }]) : image)
        .jpeg({ quality: 88 })
        .toBuffer()

      results.push(await putFile(`products/${filename}`, output, 'image/jpeg'))
    } catch {
      // Skip an unreadable file rather than rejecting the whole batch.
    }
  }

  return results
}

/**
 * Stores an uploaded logo and returns its public path. Re-encoded through sharp so
 * a malformed or hostile upload can't reach the compositing step later.
 */
export async function saveWatermarkLogo(buffer: Buffer, mimetype: string): Promise<string> {
  const filename = `${randomUUID()}.png`

  // SVG needs a density hint, otherwise it rasterises at its nominal size and
  // looks soft once scaled up onto a large photo.
  const resized = await sharp(buffer, { density: mimetype.includes('svg') ? 300 : undefined })
    .resize({ width: 1000, withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer()

  const output = await dropOpaqueBackground(resized)
  return putFile(`watermarks/${filename}`, output, 'image/png')
}

/**
 * Enregistre un logo de VITRINE — l'en-tête ou l'accueil — sans le traitement
 * du filigrane.
 *
 * Un logo de vitrine n'est pas un logo de filigrane, et les traiter pareil
 * abîme les deux : `saveWatermarkLogo` rasterise le SVG en PNG (une vitrine
 * veut du SVG net à toutes les tailles) et détoure le fond blanc (un logo posé
 * volontairement sur cartouche blanc y perdrait son fond). Ici, le SVG est
 * gardé tel quel après contrôle, le raster est seulement plafonné à `cote` px
 * sans jamais manger de pixels.
 *
 * `cote` : le plus grand côté toléré — ~400 pour l'en-tête, 500 pour l'accueil.
 */
export async function saveVitrineLogo(
  buffer: Buffer,
  mimetype: string,
  cote: number,
): Promise<string> {
  if (mimetype.includes('svg')) {
    /*
     * Un SVG est du texte, et un SVG téléversé peut porter du script. Servi via
     * `<img>` sur la vitrine il ne s'exécuterait pas, mais l'adresse
     * `/storage/...` est ouvrable en direct : on refuse donc tout SVG qui
     * embarque du script, un gestionnaire d'événement ou un objet étranger,
     * plutôt que de parier sur la façon dont il sera un jour affiché.
     */
    const texte = buffer.toString('utf8')
    const dangereux = /<script[\s>]|<foreignObject[\s>]|javascript:|\son\w+\s*=/i
    if (dangereux.test(texte)) {
      throw new Error('Ce SVG contient du script et ne peut pas être utilisé comme logo.')
    }
    return putFile(`logos/${randomUUID()}.svg`, buffer, 'image/svg+xml')
  }

  // PNG/JPEG/WebP : on garde la transparence si elle existe et on plafonne, sans
  // toucher aux pixels — pas de détourage, pas de fond forcé.
  const png = await sharp(buffer)
    .resize({ width: cote, height: cote, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  return putFile(`logos/${randomUUID()}.png`, png, 'image/png')
}

/**
 * Makes a flat light background transparent.
 *
 * Sellers upload the logo they have — usually a JPEG or a PNG exported on white.
 * Composited as is, it stamps an opaque rectangle across the photo. Near-white
 * pixels are therefore cleared.
 *
 * Only when the image has no transparency at all: a logo that already carries an
 * alpha channel was prepared on purpose, and eating its white areas would damage
 * it. That check is what keeps this safe to run on every upload.
 */
async function dropOpaqueBackground(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels

  for (let i = 3; i < data.length; i += channels) {
    // Anything already transparent means the logo was prepared: leave it alone.
    if (data[i] < 250) return png
  }

  // 242 rather than 255: JPEG compression never leaves a background perfectly
  // white, and antialiased edges sit just under it.
  const SEUIL = 242
  const out = Buffer.from(data)
  let effaces = 0

  for (let i = 0; i < out.length; i += channels) {
    if (out[i] >= SEUIL && out[i + 1] >= SEUIL && out[i + 2] >= SEUIL) {
      out[i + 3] = 0
      effaces++
    }
  }

  // Nothing light enough to be a background: the logo is dark on dark, and
  // clearing nothing is the right answer.
  if (effaces === 0) return png

  return sharp(out, { raw: { width: info.width, height: info.height, channels } })
    .png()
    .toBuffer()
}

/**
 * Rapatrie les photos sans les marquer.
 *
 * C'est la moitié de `watermarkImages` qu'il faut faire à l'import : les
 * adresses d'un fournisseur meurent, celles d'AliExpress plus vite que les
 * autres. Rapatrier est donc obligatoire et définitif.
 *
 * Poser la marque, non. Une photo marquée à l'import est marquée pour toujours :
 * le vendeur qui change de logo doit tout réimporter, l'agent photo travaille
 * sur une image déjà signée, et la publicité se retrouve avec deux marques
 * superposées. La marque se pose donc à l'export, sur l'original conservé.
 */
export async function rapatrierImages(
  imageUrls: string[],
  productTitle = 'produit',
): Promise<string[]> {
  await mkdir(STORAGE_DIR, { recursive: true })

  const selection = imageUrls.slice(0, MAX_IMAGES)

  async function rapatrier(url: string, index: number) {
    try {
      const buffer = await fetchSourceImage(url)
      if (!buffer) return null

      // Réorienté et recompressé, mais rien d'autre : c'est l'original de
      // travail. `rotate()` applique l'orientation EXIF, sans quoi une photo de
      // téléphone arrive couchée.
      const sortie = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer()
      return {
        index,
        chemin: await putFile(`products/${seoFileName(productTitle, index)}`, sortie, 'image/jpeg'),
      }
    } catch {
      // Une photo illisible ne fait pas perdre les autres.
      return null
    }
  }

  /*
   * Quatre de front. **C'est ici que se joue la durée d'un import.**
   *
   * Signalé le 02/09/2026 : « pourquoi c'est aussi long, entre 60 et 120
   * secondes ». Quinze photos téléchargées depuis un CDN lointain puis
   * décodées et réencodées l'une après l'autre, deux à quatre secondes
   * chacune, pour un travail qui attend le réseau presque tout du long.
   *
   * Quatre et pas quinze parce que `sharp` décode en mémoire : quinze images
   * de trois mille pixels ouvertes ensemble tiennent plusieurs centaines de
   * mégaoctets, et le conteneur n'en a pas tant.
   */
  const CONCURRENCE = 4
  const sorties: Array<{ index: number; chemin: string } | null> = []
  for (let i = 0; i < selection.length; i += CONCURRENCE) {
    sorties.push(
      ...(await Promise.all(selection.slice(i, i + CONCURRENCE).map((u, k) => rapatrier(u, i + k)))),
    )
  }

  /*
   * Remises dans l'ordre d'origine.
   *
   * Il porte le choix du vendeur : la première photo est celle qui s'affiche
   * partout. En parallèle, les résultats reviennent dans l'ordre des vitesses
   * de CDN — la photo principale se retrouverait quatrième pour avoir mis une
   * seconde de plus à arriver.
   */
  return sorties
    .filter((s): s is { index: number; chemin: string } => s !== null)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.chemin)
}

/**
 * La signature des réglages de marque.
 *
 * Deux exports produits avec les mêmes réglages donnent la même signature, donc
 * le second réutilise le premier. Un logo changé, une position déplacée, et la
 * signature change : les images sont refaites au prochain export, sans que
 * personne ait à vider quoi que ce soit à la main.
 */
export function signatureFiligrane(options: WatermarkOptions): string {
  return [
    options.enabled === false ? 'off' : 'on',
    options.imagePath ?? '',
    options.text ?? '',
    options.scale ?? 22,
    options.opacity ?? 75,
    options.position ?? 'southeast',
  ].join('|')
}

/**
 * Pose la marque sur des images déjà rapatriées.
 *
 * Rend les chemins des fichiers marqués. Les originaux restent intacts : c'est
 * ce qui permet de changer de logo, de refaire une publicité ou de laisser
 * l'agent photo travailler sur une image propre.
 */
export async function marquerPourExport(
  images: string[],
  options: WatermarkOptions,
  productTitle = 'produit',
): Promise<string[]> {
  if (options.enabled === false) return images
  await mkdir(STORAGE_DIR, { recursive: true })

  const scale = options.scale ?? 22
  const opacity = options.opacity ?? 75
  const gravity = options.position ?? 'southeast'

  let logo: Buffer | null = null
  const resultats: string[] = []

  for (const [index, url] of images.entries()) {
    try {
      const buffer = await fetchSourceImage(url)
      if (!buffer) continue

      const image = sharp(buffer).rotate()
      const largeur = (await image.metadata()).width ?? 800

      if (options.imagePath && !logo) {
        logo = await logoOverlay(options.imagePath, largeur, scale, opacity).catch((err) => {
          console.error('logo de filigrane illisible, repli sur le texte', err)
          return null as unknown as Buffer
        })
      }

      const marque = logo ?? textOverlay(options.text, largeur, opacity)
      const sortie = await image.composite([{ input: marque, gravity }]).jpeg({ quality: 88 }).toBuffer()

      resultats.push(
        await putFile(`export/${seoFileName(productTitle, index)}`, sortie, 'image/jpeg'),
      )
    } catch {
      // Une photo qui résiste part sans marque plutôt que de ne pas partir :
      // une annonce publiée sans filigrane vaut mieux qu'une annonce absente.
      resultats.push(url)
    }
  }

  return resultats
}
