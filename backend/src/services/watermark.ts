import sharp from 'sharp'
import { mkdir, readFile } from 'fs/promises'
import path from 'path'
import { putFile } from '../lib/storage.js'
import { randomUUID } from 'crypto'

const MAX_IMAGES = 10
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
async function fetchSourceImage(url: string): Promise<Buffer | null> {
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
  const results: string[] = []

  // Built once: the logo is identical on every photo of the batch.
  let logo: Buffer | null = null

  for (const [index, url] of selected.entries()) {
    try {
      const buffer = await fetchSourceImage(url)
      if (!buffer) continue
      const image = sharp(buffer).rotate()
      const meta = await image.metadata()
      const width = meta.width ?? 800

      if (options.imagePath && !logo) {
        logo = await logoOverlay(options.imagePath, width, scale, opacity).catch((err) => {
          // A missing or corrupt logo must not lose the whole import: fall back to text.
          console.error('logo de filigrane illisible, repli sur le texte', err)
          return null as unknown as Buffer
        })
      }

      const overlay = logo ?? textOverlay(options.text, width, opacity)
      const filename = seoFileName(productTitle, index)

      // Through a buffer rather than straight to disk: the same bytes go either
      // to the container's volume or to object storage, decided by putFile.
      const output = await image
        .composite([{ input: overlay, gravity }])
        .jpeg({ quality: 88 })
        .toBuffer()

      results.push(await putFile(`products/${filename}`, output, 'image/jpeg'))
    } catch {
      // If a given source image can't be fetched/processed, skip it rather than
      // fail the whole import — the user can still review/replace it in the back office.
    }
  }

  return results
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
      const output = await image
        .composite([{ input: logo ?? textOverlay(options.text, width, opacity), gravity }])
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
