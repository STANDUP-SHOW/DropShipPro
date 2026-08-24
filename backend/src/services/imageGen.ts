import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { putFile } from '../lib/storage.js'
import { fetchSourceImage } from './watermark.js'

/**
 * La génération d'images à partir des photos du produit.
 *
 * Deux usages, et deux seulement : remettre le produit en situation — une
 * tronçonneuse en forêt plutôt que sur fond blanc — et en tirer un visuel
 * publicitaire au format d'un réseau. Le modèle part toujours des photos
 * existantes ; il ne dessine jamais un produit qui n'existe pas.
 *
 * C'est une limite volontaire. Un vendeur qui publie l'image d'un objet que son
 * fournisseur ne livre pas se prend un litige, puis une suspension de compte. Le
 * produit sur la photo doit être celui qui arrivera dans le colis.
 */

/**
 * Le modèle par défaut, et pourquoi celui-là.
 *
 * Trois modèles d'image existent chez Google, au même usage mais pas au même
 * prix : 0,0336 $ l'image en Flash Lite, 0,0672 $ en Flash, 0,134 $ en Pro. Sur
 * une mise en situation de produit, l'écart de rendu ne justifie pas de payer
 * quatre fois plus — et à quatre fois le prix, les gros paquets d'images se
 * vendraient à perte.
 *
 * Le nom reste configurable : les modèles d'image de Google changent d'appellation
 * plus vite que le code ne se redéploie, et un vendeur qui veut le rendu Pro sur
 * un catalogue haut de gamme doit pouvoir le demander sans mise en production.
 */
const MODEL = process.env.GOOGLE_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-lite-image'

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

export class ImageGenUnavailable extends Error {
  constructor(message = "La génération d'images n'est pas configurée.") {
    super(message)
    this.name = 'ImageGenUnavailable'
  }
}

export function imageGenConfigured() {
  return Boolean(process.env.GOOGLE_AI_API_KEY?.trim())
}

/** Formats attendus par chaque réseau, pour un visuel publicitaire. */
export const AD_FORMATS: Record<string, { label: string; width: number; height: number; note: string }> = {
  facebook: { label: 'Facebook — fil', width: 1200, height: 628, note: 'Format paysage du fil et des publicités.' },
  instagram: { label: 'Instagram — carré', width: 1080, height: 1080, note: 'Le format le plus sûr : lisible partout.' },
  'instagram-story': { label: 'Instagram — story', width: 1080, height: 1920, note: 'Plein écran vertical, stories et reels.' },
  tiktok: { label: 'TikTok', width: 1080, height: 1920, note: 'Vertical plein écran.' },
  snapchat: { label: 'Snapchat', width: 1080, height: 1920, note: 'Vertical plein écran.' },
  google: { label: 'Google — display', width: 1200, height: 628, note: 'Bannière du réseau display.' },
}

export interface GeneratedResult {
  path: string
  width: number
  height: number
  prompt: string
}

/**
 * Appelle le modèle avec les photos du produit et une consigne.
 *
 * Les photos sont envoyées telles quelles : c'est ce qui distingue « remets ce
 * produit-là en situation » de « dessine-moi une tronçonneuse ».
 */
async function generate(params: {
  sourceImages: string[]
  prompt: string
  width: number
  height: number
}): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) throw new ImageGenUnavailable()

  // Trois photos suffisent à cadrer le produit ; au-delà, on paie du contexte
  // sans rien gagner en ressemblance.
  const references: Array<{ inline_data: { mime_type: string; data: string } }> = []
  for (const url of params.sourceImages.slice(0, 3)) {
    const buffer = await fetchSourceImage(url)
    if (!buffer) continue
    const jpeg = await sharp(buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
    references.push({ inline_data: { mime_type: 'image/jpeg', data: jpeg.toString('base64') } })
  }

  if (!references.length) {
    throw new ImageGenUnavailable("Aucune photo du produit n'a pu être lue.")
  }

  const response = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...references, { text: params.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('génération d’image refusée', response.status, detail.slice(0, 400))
    throw new ImageGenUnavailable(
      response.status === 400 || response.status === 403
        ? "La clé Google refuse la génération d'images. Vérifiez qu'elle est active et autorisée."
        : "Le service de génération d'images ne répond pas.",
    )
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string }; inline_data?: { data?: string } }> } }>
  }

  const part = payload.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data || p.inline_data?.data,
  )
  const base64 = part?.inlineData?.data ?? part?.inline_data?.data
  if (!base64) throw new ImageGenUnavailable("Le modèle n'a renvoyé aucune image.")

  // Recadré au format demandé : le modèle rend rarement les dimensions exactes,
  // et une publicité au mauvais format est recadrée par la plateforme, souvent
  // en coupant le produit.
  return sharp(Buffer.from(base64, 'base64'))
    .resize(params.width, params.height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 88 })
    .toBuffer()
}

async function store(buffer: Buffer, prefix: string): Promise<string> {
  const key = `generated/${prefix}-${randomUUID()}.jpg`
  return putFile(key, buffer, 'image/jpeg')
}

/**
 * Remet le produit en situation.
 *
 * La consigne décrit une scène plausible pour ce produit, pas un décor
 * arbitraire : une tronçonneuse en forêt, une cafetière sur un plan de travail.
 */
export async function regenerateProductPhoto(params: {
  sourceImages: string[]
  title: string
  category: string | null
  hint?: string
}): Promise<GeneratedResult> {
  const prompt = [
    "Reprends exactement le produit montré sur les photos de référence et place-le dans une mise en situation réaliste,",
    "photographiée comme une publicité professionnelle : lumière naturelle, profondeur de champ, décor plausible pour ce produit.",
    '',
    `Produit : ${params.title}.`,
    params.category ? `Catégorie : ${params.category}.` : '',
    params.hint ? `Consigne du vendeur : ${params.hint}` : '',
    '',
    "Le produit doit rester rigoureusement identique : même forme, mêmes couleurs, mêmes proportions, mêmes marquages.",
    "N'ajoute aucun texte, aucun logo, aucune mention de prix ou de promotion.",
    "N'invente aucun accessoire qui ne serait pas visible sur les photos de référence.",
  ]
    .filter(Boolean)
    .join('\n')

  const buffer = await generate({ sourceImages: params.sourceImages, prompt, width: 1080, height: 1080 })
  const path = await store(buffer, 'photo')
  return { path, width: 1080, height: 1080, prompt }
}

/**
 * Un visuel publicitaire, au format du réseau visé.
 *
 * Ce n'est pas une campagne : c'est une image. Elle se télécharge, ou se publie
 * sur une page que le vendeur a reliée. Le reste — budget, ciblage, enchères —
 * se fait chez la plateforme, où le vendeur voit ce qu'il dépense.
 */
export async function generateAdVisual(params: {
  sourceImages: string[]
  title: string
  platform: string
  hint?: string
}): Promise<GeneratedResult> {
  const format = AD_FORMATS[params.platform]
  if (!format) throw new ImageGenUnavailable('Format inconnu.')

  const prompt = [
    `Crée un visuel publicitaire ${format.width}×${format.height} pour le produit montré sur les photos de référence.`,
    `Destination : ${format.label}.`,
    '',
    `Produit : ${params.title}.`,
    params.hint ? `Angle demandé par le vendeur : ${params.hint}` : '',
    '',
    'Le produit doit occuper le centre de la composition et rester rigoureusement identique aux photos de référence :',
    'même forme, mêmes couleurs, mêmes proportions, mêmes marquages.',
    "Compose une scène nette et lisible en petit format, avec un arrière-plan qui met le produit en valeur sans le masquer.",
    "N'écris aucun texte, aucun prix, aucune mention de réduction : ils seront ajoutés séparément.",
  ]
    .filter(Boolean)
    .join('\n')

  const buffer = await generate({
    sourceImages: params.sourceImages,
    prompt,
    width: format.width,
    height: format.height,
  })
  const path = await store(buffer, `ad-${params.platform}`)
  return { path, width: format.width, height: format.height, prompt }
}
