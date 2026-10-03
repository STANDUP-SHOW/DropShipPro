import { createHash } from 'node:crypto'
import type { Product, Shop } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { absoluteUrl } from '../lib/urls.js'
import { validerMatrice, prixDeVenteDe, cleCombo, type Combinaison } from './variantMatrix.js'
import { etatPour } from './productCondition.js'
import { codeBarresDe } from './productFacts.js'
import { titleForChannel } from './channelCopy.js'

/**
 * DropShop Market (drop-shop.cloud) — la place de marché des vendeurs DropShipper.
 *
 * Une annonce du Market, c'est une `Publication` de plateforme `DROPSHOP_MARKET`
 * au statut PUBLISHED : le vendeur publie depuis l'application comme vers
 * n'importe quel canal, et rien d'autre n'est à tenir en double.
 *
 * Ce fichier transforme ces publications en **offres** : une par variante
 * achetable. C'est la forme que réclament Google Shopping (un article par
 * variante, regroupés par `item_group_id`), les comparateurs de prix et les
 * campagnes Google Ads « à la Channable » — et c'est aussi celle des pages :
 * chaque variante a sa propre adresse, indexable, avec son prix et sa photo.
 */

/** La commission de la plateforme, en part du prix de vente. */
export const COMMISSION = 0.05

/** L'adresse publique canonique de la place de marché. */
export function marketUrl(): string {
  const brut = process.env.MARKET_URL?.split(',')[0]?.trim().replace(/\/$/, '')
  return brut && /^https?:\/\//.test(brut) ? brut : 'https://drop-shop.cloud'
}

/** Les noms d'hôte qui servent la place de marché à la racine. */
export function marketHosts(): string[] {
  const hotes = (process.env.MARKET_HOSTS ?? 'drop-shop.cloud,www.drop-shop.cloud')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  try {
    hotes.push(new URL(marketUrl()).hostname)
  } catch {
    /* MARKET_URL already validated above */
  }
  return [...new Set(hotes)]
}

/** « T-shirt coton bio » → « t-shirt-coton-bio ». */
export function slugify(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'produit'
  )
}

/** Identifiant court et stable d'une combinaison : il ne dépend que de ses valeurs. */
export function cleVariante(combo: Record<string, string>): string {
  return createHash('sha1').update(cleCombo(combo)).digest('hex').slice(0, 8)
}

/**
 * Les attributs Google Shopping reconnus dans les noms d'options du vendeur.
 *
 * Google exige `color` et `size` pour l'habillement dès qu'il y a des
 * variantes, et s'en sert pour regrouper les offres. Les vendeurs écrivent
 * « Couleur », « Coloris », « Taille », « Pointure » : on les reconnaît tous.
 */
const ATTRIBUTS_GOOGLE: Array<[RegExp, 'color' | 'size' | 'material' | 'pattern']> = [
  [/^(couleur|coloris|color|colour|teinte)/i, 'color'],
  [/^(taille|pointure|size|dimension|format)/i, 'size'],
  [/^(mati[eè]re|material|tissu)/i, 'material'],
  [/^(motif|pattern|imprim)/i, 'pattern'],
]

export function attributGoogle(option: string): 'color' | 'size' | 'material' | 'pattern' | null {
  const nom = option.trim()
  for (const [re, attr] of ATTRIBUTS_GOOGLE) if (re.test(nom)) return attr
  return null
}

export interface Vendeur {
  userId: string
  nom: string
  /** L'adresse de la page vendeur sur le Market, quand la boutique en a une. */
  slug: string | null
  /** Le vendeur peut-il encaisser (Stripe Connect actif) ? */
  encaisse: boolean
}

/** Une offre du Market : un produit, ou une de ses variantes. */
export interface Offre {
  productId: string
  /** Nul pour un produit sans variantes. */
  cle: string | null
  /** L'identifiant de l'article dans les flux : `<produit>` ou `<produit>-<cle>`. */
  id: string
  titreProduit: string
  /** Le titre de l'offre, valeurs de la variante comprises. */
  titre: string
  combo: Record<string, string> | null
  /** « Couleur : Noir, Taille : M ». */
  libelleVariante: string | null
  prix: number
  devise: string
  disponible: boolean
  image: string | null
  images: string[]
  /** Chemin relatif à la racine du Market (sans domaine). */
  chemin: string
  /** Chemin de la fiche produit (toutes variantes). */
  cheminProduit: string
}

export interface Annonce {
  product: Product
  shop: Pick<Shop, 'id' | 'name' | 'slug'> | null
  vendeur: Vendeur
  categorie: { path: string; google: string; sector: string } | null
  offres: Offre[]
  publishedAt: Date | null
}

function imagesDe(product: Product): string[] {
  const brut = Array.isArray(product.images) ? product.images : []
  return brut
    .filter((i): i is string => typeof i === 'string' && Boolean(i))
    .map((i) => absoluteUrl(i))
    .filter((i) => i.startsWith('http'))
}

export function titreDe(product: Product): string {
  return product.aiTitle || product.title
}

export function descriptionDe(product: Product): string {
  return (product.aiDescription || product.description || product.title).trim()
}

/** Les combinaisons enregistrées, ou `[]` si la fiche n'en a pas (ou une matrice illisible). */
export function combinaisonsDe(product: Product): Combinaison[] {
  if (!product.combinations) return []
  try {
    return validerMatrice(product.combinations)
  } catch {
    return []
  }
}

/**
 * Les offres d'un produit : une par combinaison, ou une seule s'il n'en a pas.
 *
 * Le prix de chaque variante reprend la marge du vendeur (`prixDeVenteDe`),
 * comme pour Shopify : une variante plus chère à l'achat l'est à la vente.
 */
export function offresDe(product: Product): Offre[] {
  const images = imagesDe(product)
  const titreProduit = titreDe(product)
  const slug = slugify(titreProduit)
  const cheminProduit = `/p/${product.id}/${slug}`
  const prixVente = Number(product.sellingPrice) || Number(product.price) || 0
  const prixAchat = Number(product.price) || 0
  const devise = product.currency || 'EUR'

  const combos = combinaisonsDe(product).filter((c) => Object.keys(c.combo).length > 0)
  if (!combos.length) {
    return [
      {
        productId: product.id,
        cle: null,
        id: product.id,
        titreProduit,
        titre: titreProduit,
        combo: null,
        libelleVariante: null,
        prix: Math.round(prixVente * 100) / 100,
        devise,
        disponible: true,
        image: images[0] ?? null,
        images,
        chemin: cheminProduit,
        cheminProduit,
      },
    ]
  }

  const vues = new Set<string>()
  const offres: Offre[] = []
  for (const c of combos) {
    const cle = cleVariante(c.combo)
    if (vues.has(cle)) continue
    vues.add(cle)
    const valeurs = Object.values(c.combo).filter(Boolean)
    const image = c.image ? absoluteUrl(c.image) : null
    const imageOk = image && image.startsWith('http') ? image : null
    offres.push({
      productId: product.id,
      cle,
      id: `${product.id}-${cle}`,
      titreProduit,
      titre: `${titreProduit} - ${valeurs.join(' ')}`,
      combo: c.combo,
      libelleVariante: Object.entries(c.combo)
        .map(([k, v]) => `${k} : ${v}`)
        .join(', '),
      prix: prixDeVenteDe(c, prixAchat, prixVente),
      devise,
      disponible: c.disponible !== false && c.stock !== 0,
      image: imageOk ?? images[0] ?? null,
      images: imageOk ? [imageOk, ...images.filter((i) => i !== imageOk)] : images,
      chemin: `${cheminProduit}/${slugify(valeurs.join(' '))}-${cle}`,
      cheminProduit,
    })
  }
  return offres
}

/** Le titre long adapté à Google Shopping (150 caractères, coupé par mots). */
export function titreFlux(product: Product): string {
  return titleForChannel(product, 'GOOGLE_SHOPPING')
}

export { etatPour, codeBarresDe }

interface FiltreAnnonces {
  productId?: string
  shopSlug?: string
  recherche?: string
  /** Les catégories admises (un rayon = toutes ses catégories). */
  categoryIds?: string[]
  limite?: number
  decalage?: number
}

/**
 * Les annonces en ligne sur le Market.
 *
 * Seuls les vendeurs dont le compte Stripe est actif sont vendables ; les
 * autres restent visibles (le référencement se construit dès la publication)
 * mais leur bouton dit que la vente n'est pas encore ouverte.
 */
export async function annonces(filtre: FiltreAnnonces = {}): Promise<Annonce[]> {
  const mots = (filtre.recherche ?? '').trim().split(/\s+/).filter((m) => m.length >= 2).slice(0, 6)
  const publications = await prisma.publication.findMany({
    where: {
      platform: 'DROPSHOP_MARKET',
      status: 'PUBLISHED',
      ...(filtre.productId ? { productId: filtre.productId } : {}),
      product: {
        ...(filtre.shopSlug ? { shop: { slug: filtre.shopSlug } } : {}),
        ...(filtre.categoryIds ? { categoryId: { in: filtre.categoryIds } } : {}),
        ...(mots.length
          ? {
              AND: mots.map((m) => ({
                OR: [
                  { aiTitle: { contains: m, mode: 'insensitive' as const } },
                  { title: { contains: m, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
    },
    include: {
      product: {
        include: {
          shop: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, shopName: true, stripeConnectReady: true } },
        },
      },
    },
    orderBy: { publishedAt: 'desc' },
    take: Math.min(filtre.limite ?? 48, 5000),
    skip: filtre.decalage ?? 0,
  })

  const ids = [...new Set(publications.map((p) => p.product.categoryId).filter((c): c is string => Boolean(c)))]
  const categories = ids.length
    ? await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, path: true, google: true, sector: true } })
    : []
  const parCategorie = new Map(categories.map((c) => [c.id, { path: c.path, google: c.google, sector: c.sector }]))

  return publications.map(({ product, publishedAt }) => {
    const { shop, user, ...brut } = product
    return {
      product: brut as Product,
      shop,
      vendeur: {
        userId: user.id,
        nom: shop?.name || user.shopName || 'Vendeur DropShop',
        slug: shop?.slug ?? null,
        encaisse: user.stripeConnectReady,
      },
      categorie: product.categoryId ? parCategorie.get(product.categoryId) ?? null : null,
      offres: offresDe(brut as Product),
      publishedAt,
    }
  })
}

/** Une tranche de prix, pour segmenter les enchères Google Ads (custom_label_1). */
export function tranchePrix(prix: number): string {
  if (prix < 15) return 'prix-0-15'
  if (prix < 30) return 'prix-15-30'
  if (prix < 60) return 'prix-30-60'
  if (prix < 120) return 'prix-60-120'
  return 'prix-120-plus'
}

/**
 * Une tranche de marge (custom_label_3), comme le font les outils de flux :
 * c'est ce qui permet de miser plus sur ce qui rapporte plus.
 */
export function trancheMarge(product: Product, prix: number): string {
  const cout = (Number(product.price) || 0) + (Number(product.shippingCost) || 0)
  if (!cout || !prix) return 'marge-inconnue'
  const marge = (prix - cout) / prix
  if (marge >= 0.5) return 'marge-haute'
  if (marge >= 0.25) return 'marge-moyenne'
  return 'marge-basse'
}

/** La racine d'un chemin de catégorie : « Mode > Femme > Robes » → « Mode ». */
export function racineChemin(path: string | null | undefined): string | null {
  return path?.split('>')[0]?.trim() || null
}

/**
 * Les rayons du Market qui ont au moins une annonce, avec leur nombre de produits.
 */
export async function rayons(): Promise<Array<{ sector: string; label: string; count: number }>> {
  const pubs = await prisma.publication.findMany({
    where: { platform: 'DROPSHOP_MARKET', status: 'PUBLISHED', product: { categoryId: { not: null } } },
    select: { product: { select: { categoryId: true } } },
    take: 20000,
  })
  const parCategorie = new Map<string, number>()
  for (const p of pubs) {
    const id = p.product.categoryId!
    parCategorie.set(id, (parCategorie.get(id) ?? 0) + 1)
  }
  if (!parCategorie.size) return []
  const cats = await prisma.category.findMany({
    where: { id: { in: [...parCategorie.keys()] } },
    select: { id: true, sector: true, path: true },
  })
  const parRayon = new Map<string, { sector: string; label: string; count: number }>()
  for (const c of cats) {
    const r = parRayon.get(c.sector) ?? { sector: c.sector, label: racineChemin(c.path) ?? c.sector, count: 0 }
    r.count += parCategorie.get(c.id) ?? 0
    parRayon.set(c.sector, r)
  }
  return [...parRayon.values()].sort((a, b) => b.count - a.count)
}

/** Les catégories d'un rayon, pour en filtrer les annonces. */
export async function categoriesDuRayon(sector: string): Promise<{ ids: string[]; label: string | null }> {
  const cats = await prisma.category.findMany({ where: { sector }, select: { id: true, path: true } })
  return { ids: cats.map((c) => c.id), label: racineChemin(cats[0]?.path) }
}
