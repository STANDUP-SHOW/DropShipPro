import sharp from 'sharp'
import { mkdir, readFile } from 'fs/promises'
import path from 'path'
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
 * Prepares the logo overlay: resized to the requested share of the photo width and
 * faded to the requested opacity.
 *
 * sharp rasterises SVG on read, so PNG (transparency preserved) and SVG both work.
 * The alpha channel is multiplied rather than replaced, otherwise a transparent
 * background would turn opaque and box the logo in.
 */
async function logoOverlay(imagePath: string, photoWidth: number, scale: number, opacity: number) {
  const filename = path.basename(imagePath)
  const buffer = await readFile(path.join(LOGO_DIR, filename))
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
  const gravity = options.position ?? 'south'
  const selected = imageUrls.slice(0, MAX_IMAGES)
  const results: string[] = []

  // Built once: the logo is identical on every photo of the batch.
  let logo: Buffer | null = null

  for (const [index, url] of selected.entries()) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buffer = Buffer.from(await res.arrayBuffer())
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
      const filepath = path.join(STORAGE_DIR, filename)

      await image
        .composite([{ input: overlay, gravity }])
        .jpeg({ quality: 88 })
        .toFile(filepath)

      results.push(`/storage/products/${filename}`)
    } catch {
      // If a given source image can't be fetched/processed, skip it rather than
      // fail the whole import — the user can still review/replace it in the back office.
    }
  }

  return results
}

/**
 * Stores an uploaded logo and returns its public path. Re-encoded through sharp so
 * a malformed or hostile upload can't reach the compositing step later.
 */
export async function saveWatermarkLogo(buffer: Buffer, mimetype: string): Promise<string> {
  await mkdir(LOGO_DIR, { recursive: true })
  const filename = `${randomUUID()}.png`

  // SVG needs a density hint, otherwise it rasterises at its nominal size and
  // looks soft once scaled up onto a large photo.
  await sharp(buffer, { density: mimetype.includes('svg') ? 300 : undefined })
    .resize({ width: 1000, withoutEnlargement: true })
    .png()
    .toFile(path.join(LOGO_DIR, filename))

  return `/storage/watermarks/${filename}`
}
