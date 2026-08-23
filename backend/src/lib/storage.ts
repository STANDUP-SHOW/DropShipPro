import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Where watermarked photos live.
 *
 * Two backends behind one function. On a Railway volume the maths stops working
 * at scale: 0,155 $/GB/month plus 0,05 $/GB of egress, against 0,015 $ and free
 * egress on Cloudflare R2 — and this app serves images to Shopify, to
 * marketplaces and to every storefront visitor. Switching is a matter of setting
 * four variables, not of migrating code.
 *
 * Paths already stored in the database keep working either way: a `/storage/…`
 * path is still served by the local static route, and only new files land in R2.
 */
const LOCAL_ROOT = path.resolve('storage')

interface R2Config {
  client: S3Client
  bucket: string
  publicUrl: string
}

let r2: R2Config | null | undefined

/** Null when R2 isn't configured — the local disk then takes over. */
function getR2(): R2Config | null {
  if (r2 !== undefined) return r2

  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, '')

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    r2 = null
    return r2
  }

  r2 = {
    bucket,
    publicUrl,
    client: new S3Client({
      // R2 speaks the S3 protocol but has a single endpoint and no real region.
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
  return r2
}

/** True when new files go to object storage rather than to the container disk. */
export function usesObjectStorage(): boolean {
  return getR2() !== null
}

/**
 * Stores one file and returns the address to record in the database.
 *
 * `key` is the path inside the bucket, and the path under storage/ locally, so
 * the same value identifies the file in both backends.
 */
export async function putFile(key: string, body: Buffer, contentType: string): Promise<string> {
  const config = getR2()

  if (!config) {
    const target = path.join(LOCAL_ROOT, key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
    // Relative on purpose: lib/urls.ts turns it absolute when a third party has
    // to fetch it, and the app keeps working whatever the host is called.
    return `/storage/${key}`
  }

  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // A product photo never changes once written: it is named after its own
      // content, so it can be cached forever.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return `${config.publicUrl}/${key}`
}
