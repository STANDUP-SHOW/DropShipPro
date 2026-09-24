/**
 * Ce que les connecteurs de BOUTIQUE du vendeur partagent — WooCommerce,
 * PrestaShop, Magento (24/09/2026, demandé par Max : « créer les connecteurs
 * e-commerce »).
 *
 * Une boutique n'est pas une place de marché : il n'y a ni catalogue à
 * rejoindre par EAN, ni catégorie imposée, ni candidature. Le vendeur possède
 * le site ; ce qu'il attend, c'est que l'annonce y arrive entière — titre,
 * texte, prix, photos, référence — comme s'il l'avait saisie lui-même. La
 * fiche à publier se prépare donc une fois ici, et chaque connecteur ne fait
 * que la traduire dans le dialecte de sa plateforme.
 *
 * Trois règles communes :
 * - l'adresse du site est normalisée (https, sans barre finale) et refusée si
 *   elle n'est pas une adresse ; une faute de frappe ferait cent appels vers
 *   nulle part ;
 * - un refus dit s'il porte sur la LIAISON (clé, adresse, API désactivée : tout
 *   échouera, on arrête) ou sur le PRODUIT (un champ, une image) ;
 * - les photos partent en adresses absolues (WooCommerce va les chercher) ou en
 *   contenu (PrestaShop, Magento les veulent en corps de requête) — jamais en
 *   chemin `/storage/…`, qui ne veut rien dire hors de notre serveur.
 */
import type { Product } from '@prisma/client'
import { absoluteUrl } from '../lib/urls.js'
import { imagesPourExport } from './exportImages.js'
import { codeBarresDe, handleDe } from './productFacts.js'

export class BoutiqueRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand tout dépôt échouera pareil (adresse, clé, API) : on arrête là. */
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'BoutiqueRefus'
  }
}

/** `https://ma-boutique.fr` — jamais `ma-boutique.fr/`, jamais `http://` par défaut. */
export function normaliserSiteUrl(brut: unknown): string | null {
  if (typeof brut !== 'string') return null
  let s = brut.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/** L'annonce, prête à traduire. */
export interface FicheBoutique {
  titre: string
  /** La description longue, en HTML simple (paragraphes, liste des points forts). */
  descriptionHtml: string
  /** La description courte, texte nu. */
  courte: string
  prix: number
  sku: string
  ean: string | null
  stock: number
  /** Adresses absolues, marquées du filigrane. */
  images: string[]
  categorie: string | null
  attributs: Array<{ nom: string; valeur: string }>
  /** Le bout d'adresse sous lequel la fiche vivra (url_key, link_rewrite, slug). */
  handle: string
}

function texteHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Une description en HTML propre : les paragraphes du texte, puis les points forts en liste. */
export function descriptionEnHtml(texte: string, points: string[]): string {
  const paragraphes = texte
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${texteHtml(p)}</p>`)
  const liste = points.length ? `<ul>${points.map((p) => `<li>${texteHtml(p)}</li>`).join('')}</ul>` : ''
  return `${paragraphes.join('')}${liste}`
}

export async function ficheDe(produit: Product, categorie: string | null): Promise<FicheBoutique> {
  const titre = (produit.aiTitle || produit.title).trim()
  const texte = (produit.aiDescription || produit.description || '').trim()
  const points = Array.isArray(produit.bulletPoints) ? produit.bulletPoints.filter((p): p is string => typeof p === 'string') : []
  const attributs = Object.entries((produit.attributes as Record<string, unknown> | null) ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([nom, valeur]) => ({ nom, valeur: String(valeur).trim() }))
  const images = (await imagesPourExport(produit)).map(absoluteUrl).filter((u) => /^https?:\/\//.test(u))

  return {
    titre,
    descriptionHtml: descriptionEnHtml(texte, points),
    courte: texte.replace(/\s+/g, ' ').slice(0, 300),
    prix: Number(produit.sellingPrice) || Number(produit.price) || 0,
    sku: (produit.supplierRef ? `DSP-${produit.supplierRef}` : `DSP-${produit.id}`).slice(0, 60),
    ean: codeBarresDe(produit) ?? null,
    stock: produit.supplierStock ?? 10,
    images,
    categorie,
    attributs,
    handle: handleDe(titre),
  }
}

export interface ImageTelechargee {
  base64: string
  type: string
  nom: string
}

/**
 * Une photo en contenu, pour les plateformes qui la veulent dans le corps de
 * la requête. Huit mégaoctets au plus : au-delà, c'est un original qu'il fallait
 * réduire, pas envoyer.
 */
export async function telechargerImage(url: string, fetcher: typeof fetch = fetch): Promise<ImageTelechargee | null> {
  try {
    const r = await fetcher(url)
    if (!r.ok) return null
    const type = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
    if (!type.startsWith('image/')) return null
    const octets = Buffer.from(await r.arrayBuffer())
    if (!octets.length || octets.length > 8 * 1024 * 1024) return null
    const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
    const nom = (url.split('/').pop() ?? 'photo').split('?')[0].replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60) || `photo.${extension}`
    return { base64: octets.toString('base64'), type, nom: /\.\w{3,4}$/.test(nom) ? nom : `${nom}.${extension}` }
  } catch {
    return null
  }
}

/** Le motif court d'une réponse HTTP refusée, pour l'écrire au vendeur. */
export async function motifDe(reponse: Response): Promise<string> {
  const texte = await reponse.text().catch(() => '')
  try {
    const j = JSON.parse(texte) as { message?: string; error?: string; errors?: Array<{ message?: string }> }
    return (j.message || j.error || j.errors?.[0]?.message || texte).toString().slice(0, 300)
  } catch {
    return texte.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
  }
}
