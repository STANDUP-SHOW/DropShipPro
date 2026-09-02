import { MODELE_REDACTION } from './aiModels.js'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { fetchSourceImage } from './watermark.js'
import { PHOTOS_PAR_ANNONCE } from './photoLimits.js'

/**
 * L'agent de contrôle.
 *
 * Les heuristiques de sélection (voir imageSelect.ts) savent reconnaître d'où
 * vient une image et quelle taille elle fait. Elles ne savent pas ce qu'elle
 * montre. Une bannière hébergée sur le CDN produit, au bon format et à la bonne
 * taille, passe tous les filtres — et se retrouve en photo principale d'une
 * annonce que personne ne relira, puisque le pilote publie seul.
 *
 * Cet agent regarde. Il répond à quatre questions que seule la vue tranche :
 *
 * — cette image montre-t-elle le produit, ou autre chose ?
 * — combien y a-t-il de vraies photos ? Neuf s'il y en a neuf, six s'il y en a
 *   six : un nombre fixe coupe des photos utiles ou en invente.
 * — quelles couleurs sont réellement photographiées ? Une fiche qui annonce
 *   trois coloris et n'en montre qu'un le dit.
 * — les tailles annoncées sont-elles cohérentes avec le produit ? Des pointures
 *   sur un parfum trahissent une extraction ratée.
 *
 * Il propose ; il ne publie rien. Et il s'active ou se désactive : un vendeur
 * qui importe à la main n'en a pas besoin, et chaque appel coûte.
 */

const MODEL = MODELE_REDACTION

/**
 * L'agent regarde toutes les photos de l'annonce, pas les douze premières.
 *
 * **C'était `12`, et son verdict devient la galerie.** `productImport.ts` lui
 * passe les quinze photos choisies ; il n'en miniaturisait que douze, et
 * `keep` ne pouvait donc contenir que des adresses prises dans ces douze-là.
 * Les photos 13, 14 et 15 disparaissaient de l'annonce **sans avoir jamais été
 * regardées**.
 *
 * Pire que la perte : le message. L'import écrivait alors « 3 photo(s)
 * écartée(s) par l'agent de contrôle » — le vendeur croyait que l'IA avait jugé
 * ses photos mauvaises, alors qu'elle ne les avait pas vues. Un défaut qui
 * accuse quelqu'un d'autre est le plus coûteux de tous : on cherche la panne là
 * où elle n'est pas.
 *
 * Le coût suit le nombre de photos, et c'est le bon compromis : un vendeur qui
 * en met quinze veut qu'on les regarde toutes.
 */
const MAX_IMAGES = PHOTOS_PAR_ANNONCE

/** Assez pour juger d'un coup d'œil, sans transporter des méga-octets. */
const THUMB_SIDE = 512

export interface ControlVerdict {
  /** Les images retenues, dans l'ordre où elles doivent apparaître. */
  keep: string[]
  /** Les images écartées, avec la raison — le vendeur doit pouvoir contester. */
  rejected: Array<{ url: string; reason: string }>
  /** Couleurs réellement visibles sur les photos. */
  colours: string[]
  /** Tailles retenues, débarrassées de ce qui ne va pas avec le produit. */
  sizes: string[]
  /** Ce que l'agent signale au vendeur, en une phrase. */
  note: string | null
  /** Faux quand le contrôle n'a pas pu avoir lieu : rien n'a été modifié. */
  checked: boolean
}

/** Réduit une image pour l'envoyer au modèle sans transporter l'original. */
async function thumbnail(url: string): Promise<{ url: string; base64: string } | null> {
  const buffer = await fetchSourceImage(url)
  if (!buffer) return null

  try {
    const resized = await sharp(buffer)
      .resize(THUMB_SIDE, THUMB_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer()
    return { url, base64: resized.toString('base64') }
  } catch {
    return null
  }
}

function systemPrompt() {
  return [
    "Tu contrôles les photos d'une fiche produit avant sa mise en ligne automatique.",
    'Personne ne relira après toi : une erreur part telle quelle en annonce.',
    '',
    'Pour chaque image numérotée, décide si elle montre le produit vendu.',
    'Écarte : les bannières et visuels promotionnels, les tableaux de tailles, les',
    "logos, les photos d'un autre produit, les collages de drapeaux ou d'icônes,",
    'les captures de commentaires clients.',
    'Garde : toutes les vues du produit, y compris les gros plans, les mises en',
    'situation et les déclinaisons de couleur. Ne te limite pas à un nombre fixe —',
    "s'il y a neuf bonnes photos, garde les neuf.",
    '',
    "Relève ensuite les couleurs du produit réellement visibles sur les photos.",
    'Et vérifie les tailles annoncées : écarte celles qui ne vont pas avec ce type',
    'de produit (des pointures sur un parfum, des millilitres sur un t-shirt).',
    '',
    "N'invente aucune couleur ni aucune taille que tu ne vois pas.",
  ].join('\n')
}

export async function reviewImages(params: {
  images: string[]
  title: string
  variants: Record<string, string[]> | null
}): Promise<ControlVerdict> {
  const untouched: ControlVerdict = {
    keep: params.images,
    rejected: [],
    colours: [],
    sizes: [],
    note: null,
    checked: false,
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !params.images.length) return untouched

  const thumbs = (await Promise.all(params.images.slice(0, MAX_IMAGES).map(thumbnail))).filter(
    (t): t is { url: string; base64: string } => t !== null,
  )
  if (!thumbs.length) return untouched

  const announced = Object.entries(params.variants ?? {})
    .map(([name, values]) => `${name} : ${values.join(', ')}`)
    .join(' — ')

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: systemPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: [
                `Produit : ${params.title}`,
                announced ? `Options annoncées sur la fiche : ${announced}` : 'Aucune option annoncée.',
                '',
                `${thumbs.length} image(s) à contrôler, numérotées de 1 à ${thumbs.length} dans l'ordre.`,
              ].join('\n'),
            },
            ...thumbs.map((t) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: t.base64 },
            })),
            {
              type: 'text' as const,
              text:
                'Réponds UNIQUEMENT en JSON valide, sans texte autour :\n' +
                '{"keep": [1, 2, 5], "rejected": [{"n": 3, "reason": "tableau de tailles"}], ' +
                '"colours": ["Noir", "Bleu"], "sizes": ["S", "M", "L"], "note": "une phrase ou null"}',
            },
          ],
        },
      ],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return untouched

    const parsed = JSON.parse(match[0]) as {
      keep?: unknown
      rejected?: unknown
      colours?: unknown
      sizes?: unknown
      note?: unknown
    }

    const indexes = Array.isArray(parsed.keep)
      ? parsed.keep.filter((n): n is number => typeof n === 'number' && n >= 1 && n <= thumbs.length)
      : []

    // Aucun gardé : le contrôle a échoué plutôt que la fiche n'a aucune photo.
    // Mieux vaut publier des photos imparfaites qu'une annonce sans image.
    if (!indexes.length) {
      return { ...untouched, note: "Contrôle sans résultat exploitable : photos conservées telles quelles." }
    }

    /*
     * Une photo non miniaturisée est gardée, pas jugée.
     *
     * `thumbs` ne contient que les photos que l'on a réussi à télécharger et à
     * réduire. Une adresse refusée par le CDN — hotlink, lenteur, 403 — n'y
     * figure pas, donc `keep` ne pouvait pas la contenir, et
     * `productImport.ts` la supprimait de l'annonce : **une photo parfaitement
     * bonne effacée parce que notre serveur n'a pas su la lire.**
     *
     * Un contrôle ne peut écarter que ce qu'il a vu. Ce qu'il n'a pas vu reste.
     */
    const vues = new Set(thumbs.map((t) => t.url))
    const nonVues = params.images.filter((u) => !vues.has(u))
    const keep = [...indexes.map((n) => thumbs[n - 1].url), ...nonVues]

    const rejected = Array.isArray(parsed.rejected)
      ? parsed.rejected
          .filter((r): r is { n: number; reason: string } =>
            Boolean(r && typeof (r as { n?: unknown }).n === 'number'),
          )
          .filter((r) => r.n >= 1 && r.n <= thumbs.length)
          .map((r) => ({ url: thumbs[r.n - 1].url, reason: String(r.reason ?? 'écartée') }))
      : []

    const strings = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, 30)
        : []

    return {
      keep,
      rejected,
      colours: strings(parsed.colours),
      sizes: strings(parsed.sizes),
      note: typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim() : null,
      checked: true,
    }
  } catch (err) {
    console.error('agent de contrôle indisponible', err)
    return untouched
  }
}

/**
 * Applique le verdict aux options du produit.
 *
 * Les couleurs vues l'emportent sur les couleurs annoncées : une fiche qui
 * promet six coloris et n'en photographie que deux vendra deux coloris, et
 * l'acheteur qui commande le troisième ouvrira un litige.
 */
export function applyVerdict(
  variants: Record<string, string[]> | null,
  verdict: ControlVerdict,
): Record<string, string[]> | null {
  if (!verdict.checked) return variants

  const merged: Record<string, string[]> = { ...(variants ?? {}) }

  if (verdict.colours.length) {
    const key = Object.keys(merged).find((k) => /couleur|color|coloris/i.test(k)) ?? 'Couleur'
    merged[key] = verdict.colours
  }

  if (verdict.sizes.length) {
    const key = Object.keys(merged).find((k) => /taille|size|pointure|contenance/i.test(k)) ?? 'Taille'
    merged[key] = verdict.sizes
  }

  return Object.keys(merged).length ? merged : null
}
