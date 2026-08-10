import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const MAX_IMAGES = 10
const STORAGE_DIR = path.resolve('storage', 'products')

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

function watermarkSvg(text: string, width: number, height: number) {
  const fontSize = Math.max(16, Math.round(width * 0.045))
  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .wm { fill: rgba(255,255,255,0.75); font-size: ${fontSize}px; font-family: sans-serif; font-weight: 700; }
        .wm-shadow { fill: rgba(0,0,0,0.45); font-size: ${fontSize}px; font-family: sans-serif; font-weight: 700; }
      </style>
      <text x="52%" y="${height - 22}" class="wm-shadow" text-anchor="middle">${text}</text>
      <text x="50%" y="${height - 24}" class="wm" text-anchor="middle">${text}</text>
    </svg>
  `)
}

/**
 * Downloads up to MAX_IMAGES source images and stamps the shop's watermark text
 * across the bottom of each one, saving the result to local disk storage.
 * Returns the public paths to serve via /storage.
 */
export async function watermarkImages(
  imageUrls: string[],
  watermarkText: string,
  productTitle = 'produit',
): Promise<string[]> {
  await mkdir(STORAGE_DIR, { recursive: true })
  const selected = imageUrls.slice(0, MAX_IMAGES)
  const results: string[] = []

  for (const [index, url] of selected.entries()) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buffer = Buffer.from(await res.arrayBuffer())
      const image = sharp(buffer).rotate()
      const meta = await image.metadata()
      const width = meta.width ?? 800
      const height = meta.height ?? 800

      const filename = seoFileName(productTitle, index)
      const filepath = path.join(STORAGE_DIR, filename)

      await image
        .composite([{ input: watermarkSvg(watermarkText, width, height), gravity: 'south' }])
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
