import sharp from 'sharp'
import { composeAd, type AdCopy } from './adComposer.js'
import { CHARTE_DEFAUT, type CharteAd, type MiseEnPage } from './adCharte.js'
import { briefEnConsigne, type Brief } from './photoBriefer.js'
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
 * Les modèles d'image, du meilleur au plus sobre — et pourquoi une liste.
 *
 * Trois modèles existent chez Google, au même usage mais pas au même prix :
 * 0,134 $ l'image en Pro, 0,0672 $ en Flash, 0,0336 $ en Flash Lite. Le code
 * appelait Flash Lite, parce que l'écart de rendu ne semblait pas valoir quatre
 * fois le prix.
 *
 * **Max a tranché l'inverse le 19/09/2026** : « on améliore le modèle », « même
 * si plus cher ». Il a raison sur ce poste-là et pas ailleurs : une image se
 * paie 18 drops, elle sort une fois, et c'est elle que l'acheteur regarde. Le
 * quadruple d'un centime et demi est le meilleur argent du produit.
 *
 * **Pourquoi une cascade plutôt qu'un nom.** Un modèle retiré rend un 404, et
 * un 404 avait déjà tout arrêté le 02/09/2026 — le nom était écrit en dur, la
 * clé était bonne, et le diagnostic disait « injoignable ». Ici le nom vient de
 * chez Google, pas de chez nous : nous ne pouvons pas l'éprouver avant de
 * déployer. On essaie donc du plus beau au plus sûr, on retient celui qui
 * répond, et un nom qui disparaît coûte un appel perdu au lieu de la
 * fonctionnalité entière.
 *
 * `GOOGLE_IMAGE_MODEL` passe devant : un vendeur qui veut un autre rendu, ou un
 * nom nouveau publié par Google, n'attend pas une mise en production.
 */
export const MODELES_IMAGE = [
  'gemini-3.1-pro-image',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
] as const

function modelesAEssayer(): string[] {
  const impose = process.env.GOOGLE_IMAGE_MODEL?.trim()
  const liste = [...MODELES_IMAGE]
  if (impose) return [impose, ...liste.filter((m) => m !== impose)]
  return liste
}

/**
 * Celui qui a répondu la dernière fois.
 *
 * Sans cette mémoire, chaque image repaierait les 404 des modèles absents —
 * deux allers-retours inutiles avant chaque génération.
 */
let modeleRetenu: string | null = null

/** Le modèle réellement appelé, pour le diagnostic. */
export function modeleImageActuel(): string {
  return modeleRetenu ?? modelesAEssayer()[0]
}

/** Vrai quand le refus dit « ce modèle n'existe pas », et non « je refuse ». */
function modeleInconnu(status: number, detail: string): boolean {
  return status === 404 || /NOT_FOUND|is not found|not supported|unknown name/i.test(detail)
}

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

  /*
   * La cascade : le plus beau modèle d'abord, et celui d'après si le nom n'est
   * plus servi. Un nom refusé ne coûte qu'un aller-retour, et une seule fois —
   * celui qui répond est retenu pour les images suivantes.
   */
  const candidats = modeleRetenu ? [modeleRetenu, ...modelesAEssayer().filter((m) => m !== modeleRetenu)] : modelesAEssayer()
  let response: Response | null = null
  let dernierRefus = ''
  let dernierStatut = 0

  for (const candidat of candidats) {
    const essai = await fetch(`${ENDPOINT(candidat)}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...references, { text: params.prompt }] }],
        // Les deux modalités, et non IMAGE seule : les modèles d'image de Google
        // refusent une requête qui n'autorise pas aussi le texte, même quand on
        // n'attend qu'une image en retour.
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (essai.ok) {
      if (modeleRetenu !== candidat) console.log(`[images] modèle retenu : ${candidat}`)
      modeleRetenu = candidat
      response = essai
      break
    }

    dernierStatut = essai.status
    dernierRefus = await essai.text().catch(() => '')
    if (!modeleInconnu(essai.status, dernierRefus)) break

    // Un nom que Google ne sert plus : on descend d'un cran sans rien dire au
    // vendeur, ce n'est pas son problème.
    console.error(`[images] ${candidat} n'est pas servi, on essaie le suivant`)
    if (modeleRetenu === candidat) modeleRetenu = null
  }

  if (!response) {
    console.error('génération d’image refusée', dernierStatut, dernierRefus.slice(0, 600))

    // Le message de Google est repris tel quel : « quota dépassé », « modèle
    // introuvable » et « clé restreinte » demandent trois gestes différents, et
    // un message unique obligerait à fouiller les journaux pour les distinguer.
    let raison = ''
    try {
      raison = JSON.parse(dernierRefus)?.error?.message ?? ''
    } catch {
      raison = dernierRefus.slice(0, 200)
    }

    throw new ImageGenUnavailable(
      raison ? `Google a refusé la génération : ${raison}` : "Le service de génération d'images ne répond pas.",
    )
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string
      content?: { parts?: Array<{ inlineData?: { data?: string }; inline_data?: { data?: string } }> }
    }>
  }

  const part = payload.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data || p.inline_data?.data,
  )
  const base64 = part?.inlineData?.data ?? part?.inline_data?.data
  if (!base64) {
    // Un refus de contenu se manifeste ainsi : réponse valide, mais sans image.
    const raison = payload.candidates?.[0]?.finishReason
    throw new ImageGenUnavailable(
      raison && raison !== 'STOP'
        ? `Le modèle n'a pas produit d'image (${raison}).`
        : "Le modèle n'a renvoyé aucune image.",
    )
  }

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
  /**
   * Le brief de cette photo-ci.
   *
   * Sans lui, six photos demandees recevaient six fois le meme prompt et
   * rendaient six fois la meme image -- il n y avait aucune raison qu il en
   * soit autrement. C est lui qui porte la mise en scene, et elle change a
   * chaque fois.
   */
  brief?: Brief
}): Promise<GeneratedResult & { partiPris?: string }> {
  const prompt = [
    "Reprends exactement le produit montré sur les photos de référence et place-le dans la scène décrite ci-dessous,",
    'photographiée comme une image de catalogue professionnelle.',
    '',
    `Produit : ${params.title}.`,
    params.category ? `Catégorie : ${params.category}.` : '',
    '',
    // Le brief est ce qui distingue cette photo de la précédente. Sans lui, le
    // reste du prompt est identique d'une image à l'autre — et le rendu aussi.
    params.brief ? briefEnConsigne(params.brief) : '',
    params.hint ? `\nConsigne du vendeur, prioritaire : ${params.hint}` : '',
    '',
    "Le produit doit rester rigoureusement identique : même forme, mêmes couleurs, mêmes proportions, mêmes marquages.",
    "N'ajoute aucun texte, aucun logo, aucune mention de prix ou de promotion.",
    "N'invente aucun accessoire qui ne serait pas visible sur les photos de référence.",
  ]
    .filter(Boolean)
    .join('\n')

  const buffer = await generate({ sourceImages: params.sourceImages, prompt, width: 1080, height: 1080 })
  const path = await store(buffer, 'photo')
  return { path, width: 1080, height: 1080, prompt, partiPris: params.brief?.partiPris }
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
  /**
   * L'offre à poser sur la scène : logo, titre, prix, bouton.
   *
   * Absente, on ne rend que la scène — c'est ce que faisait la version
   * précédente, et c'est précisément ce qui manquait : une belle photo n'est pas
   * une publicité. Tout ce qui porte du sens est dessiné par adComposer, jamais
   * demandé au modèle, qui écrit des prix faux avec un aplomb parfait.
   */
  copy?: AdCopy
  /** Le brief de cette publicité-ci : c'est lui qui la distingue de la précédente. */
  brief?: Brief
  /**
   * La charte du visuel : ses couleurs, sa mise en page, sa typographie.
   *
   * Elle sert **deux fois**, et c'est le point. Le composeur s'en sert pour
   * dessiner, et le modèle d'image pour savoir OÙ laisser la place — une
   * consigne « garde le tiers inférieur dégagé » écrite pour une seule mise en
   * page fait poser le produit au mauvais endroit dès qu'on en change.
   */
  charte?: CharteAd
}): Promise<GeneratedResult & { partiPris?: string }> {
  const format = AD_FORMATS[params.platform]
  if (!format) throw new ImageGenUnavailable('Format inconnu.')

  const charte = params.charte ?? CHARTE_DEFAUT
  const paysage = format.width / format.height >= 1.4

  const prompt = [
    `Crée un visuel publicitaire ${format.width}×${format.height} pour le produit montré sur les photos de référence.`,
    `Destination : ${format.label}.`,
    '',
    `Produit : ${params.title}.`,
    params.brief ? briefEnConsigne(params.brief) : '',
    params.hint ? `Angle demandé par le vendeur, prioritaire : ${params.hint}` : '',
    '',
    'Le produit doit rester rigoureusement identique aux photos de référence :',
    'même forme, mêmes couleurs, mêmes proportions, mêmes marquages.',
    "Compose une scène nette et lisible en petit format, avec un arrière-plan qui met le produit en valeur sans le masquer.",
    zoneReservee(charte.miseEnPage, paysage),
    "N'écris aucun texte, aucun prix, aucun logo, aucune mention de réduction : ils sont ajoutés ensuite, exactement,",
    'à partir des vraies données de la boutique.',
  ]
    .filter(Boolean)
    .join('\n')

  const scene = await generate({
    sourceImages: params.sourceImages,
    prompt,
    width: format.width,
    height: format.height,
  })

  const buffer = params.copy
    ? await composeAd(scene, format.width, format.height, params.copy, charte)
    : scene

  const path = await store(buffer, `ad-${params.platform}`)
  return { path, width: format.width, height: format.height, prompt, partiPris: params.brief?.partiPris }
}

/**
 * Où le modèle doit laisser la place, selon la mise en page qui viendra.
 *
 * Le texte de l'offre est dessiné APRÈS, par-dessus l'image. Tant qu'il n'y
 * avait qu'une mise en page, une phrase suffisait ; avec quatre, une consigne
 * écrite pour l'une fait poser le produit exactement là où l'autre écrira son
 * titre — et le produit sort coupé en deux, ce qui ne se rattrape pas.
 */
function zoneReservee(mise: MiseEnPage, paysage: boolean): string {
  if (mise === 'coin') {
    return [
      "Place le produit au CENTRE de l'image, à bonne distance des bords hauts et bas.",
      "Garde le quart supérieur et le quart inférieur simples et sans détail important : ils recevront le texte de l'offre.",
    ].join('\n')
  }
  if (mise === 'carte' && paysage) {
    return [
      "Place le produit dans la MOITIÉ DROITE de l'image, bien dégagé.",
      "Garde la moitié gauche simple et sans détail important : elle recevra un bloc de texte.",
    ].join('\n')
  }
  return [
    "Place le produit dans la moitié haute de l'image et garde le tiers inférieur dégagé — une zone simple,",
    "sans détail important, qui recevra ensuite le texte de l'offre.",
  ].join('\n')
}

export type ImageGenStatus = 'ok' | 'non-configure' | 'refuse'

/**
 * Teste réellement la génération d'images.
 *
 * « Une clé est configurée » ne dit rien : elle peut être présente et refusée —
 * projet sans facturation, clé restreinte à un autre service, modèle indisponible
 * dans la région. On interroge donc l'API pour de vrai, sur la liste des modèles,
 * qui ne coûte rien et répond la même chose qu'une génération sur les erreurs
 * d'authentification.
 */
export async function checkImageGen(): Promise<ImageGenStatus> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) return 'non-configure'

  try {
    // La cascade se sonde en entier : un premier nom absent n'est pas une panne
    // tant qu'un des suivants répond. C'est exactement ce que fera la
    // génération, et un diagnostic qui teste autre chose que le vrai chemin ne
    // diagnostique rien.
    let dernier = 0
    let detail = ''
    for (const candidat of modelesAEssayer()) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${candidat}?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (res.ok) {
        modeleRetenu = candidat
        return 'ok'
      }
      dernier = res.status
      detail = await res.text().catch(() => '')
      if (!modeleInconnu(res.status, detail)) break
    }

    console.error('génération d’images indisponible', dernier, detail.slice(0, 300))
    return 'refuse'
  } catch (err) {
    console.error('génération d’images injoignable', err)
    return 'refuse'
  }
}
