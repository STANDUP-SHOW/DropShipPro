import { createHash } from 'node:crypto'
import type { Product, Shop } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { absoluteUrl } from '../lib/urls.js'
import { validerMatrice, prixDeVenteDe, cleCombo, type Combinaison } from './variantMatrix.js'
import { etatPour } from './productCondition.js'
import { codeBarresDe } from './productFacts.js'
import { titleForChannel } from './channelCopy.js'
import graine from './categorySeed.json' with { type: 'json' }

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
  /** La catégorie de l'annonce, avec son rayon (l'une des 24 catégories racines). */
  categorie: { id: string; label: string; path: string; google: string; rayon: { id: string; label: string } } | null
  offres: Offre[]
  publishedAt: Date | null
  /** Article Prime : livré en 24 h (voir Product.marketPrime). */
  prime: boolean
  /**
   * Les avis d'acheteurs publiés (BuyerReview). La note et le compte portent sur
   * tous ; le détail n'est chargé que pour une fiche. `origine` est le site où
   * l'avis a été recueilli : on l'affiche, sans quoi ce serait trompeur.
   */
  avis?: AvisAnnonce
}

export interface AvisAnnonce {
  nombre: number
  moyenne: number | null
  items: { etoiles: number; auteur: string; texte: string; photos: string[]; date: Date | null; origine: string | null }[]
}

/** Note et compte pour toutes les annonces, détail (20 au plus) pour une fiche. */
async function avisDe(ids: string[], detail: boolean): Promise<Map<string, AvisAnnonce>> {
  const par = new Map<string, AvisAnnonce>()
  if (!ids.length) return par
  const groupes = await prisma.buyerReview.groupBy({
    by: ['productId'],
    where: { productId: { in: ids }, published: true },
    _avg: { stars: true },
    _count: { _all: true },
  })
  for (const g of groupes) {
    const moy = g._avg.stars
    par.set(g.productId, { nombre: g._count._all, moyenne: moy == null ? null : Math.round(moy * 10) / 10, items: [] })
  }
  if (detail) {
    const lignes = await prisma.buyerReview.findMany({
      where: { productId: { in: ids }, published: true },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    })
    for (const l of lignes) {
      par.get(l.productId)?.items.push({
        etoiles: l.stars,
        auteur: l.author,
        texte: l.text,
        photos: (Array.isArray(l.photos) ? l.photos : []).filter((p): p is string => typeof p === 'string').map((p) => absoluteUrl(p)).filter((p) => p.startsWith('http')).slice(0, 4),
        date: l.reviewedAt,
        origine: l.sourceSite,
      })
    }
  }
  return par
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
  /** Seulement les articles Prime (livraison 24 h). */
  prime?: boolean
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
        ...(filtre.prime ? { marketPrime: true } : {}),
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

  const { parId } = await arbreMarket()
  const avis = await avisDe(publications.map((p) => p.productId), Boolean(filtre.productId))

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
      categorie: categorieDe(parId, product.categoryId),
      offres: offresDe(brut as Product),
      publishedAt,
      prime: product.marketPrime,
      avis: avis.get(product.id) ?? { nombre: 0, moyenne: null, items: [] },
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

/** Une catégorie du référentiel (24 rayons racines, ~224 sous-catégories). */
interface Cat {
  id: string
  parentId: string | null
  label: string
  path: string
  google: string
  icone: string | null
  origin: string
}

export interface Rayon {
  id: string
  label: string
  icone: string | null
  /** Les sous-catégories livrées avec l application (les apprises filtrent, sans encombrer le menu). */
  sousCategories: Array<{ id: string; label: string }>
  /** Le rayon et toutes ses sous-catégories, apprises comprises : ce qu une annonce doit porter pour y entrer. */
  ids: string[]
}

let cache: { quand: number; rayons: Rayon[]; parId: Map<string, Cat> } | null = null

function depuisGraine(): Cat[] {
  const brut = (graine as unknown as { categories: Array<Partial<Cat> & { id: string; label: string; path: string }> }).categories
  return brut.map((c) => ({
    id: c.id,
    parentId: c.parentId ?? null,
    label: c.label,
    path: c.path,
    google: c.google ?? '',
    icone: c.icone ?? null,
    origin: 'core',
  }))
}

/**
 * L arbre des catégories du Market : les 24 rayons du référentiel et leurs
 * sous-catégories, toujours affichés, même vides — le Market se présente avec
 * toute son offre dès le premier jour, comme le veut Max.
 *
 * Lu en base (les catégories apprises à l import s y ajoutent) et gardé dix
 * minutes ; la graine livrée avec le code sert si la base ne répond pas.
 */
export async function arbreMarket(): Promise<{ rayons: Rayon[]; parId: Map<string, Cat> }> {
  if (cache && Date.now() - cache.quand < 600_000) return { rayons: cache.rayons, parId: cache.parId }

  let cats: Cat[] = []
  try {
    const lignes = await prisma.category.findMany({ select: { id: true, parentId: true, label: true, path: true, google: true, targets: true, origin: true } })
    cats = lignes.map((c) => {
      const t = (c.targets ?? {}) as Record<string, unknown>
      return { id: c.id, parentId: c.parentId, label: c.label, path: c.path, google: c.google, icone: typeof t.icone === 'string' ? t.icone : null, origin: c.origin }
    })
  } catch (e) {
    console.error('[market] catégories illisibles, graine utilisée', e instanceof Error ? e.message : e)
  }
  if (!cats.some((c) => !c.parentId)) cats = depuisGraine()

  const parId = new Map(cats.map((c) => [c.id, c]))
  const rayons: Rayon[] = cats
    .filter((c) => !c.parentId)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    .map((r) => {
      const enfants = cats.filter((c) => c.parentId === r.id)
      return {
        id: r.id,
        label: r.label,
        icone: r.icone,
        sousCategories: enfants
          .filter((c) => c.origin === 'core')
          .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
          .map((c) => ({ id: c.id, label: c.label })),
        ids: [r.id, ...enfants.map((c) => c.id)],
      }
    })
  cache = { quand: Date.now(), rayons, parId }
  return { rayons, parId }
}

/** La catégorie d une annonce et son rayon, depuis l arbre. */
export function categorieDe(parId: Map<string, Cat>, categoryId: string | null): Annonce['categorie'] {
  if (!categoryId) return null
  const c = parId.get(categoryId)
  if (!c) return null
  let racine = c
  for (let i = 0; i < 5 && racine.parentId && parId.get(racine.parentId); i++) racine = parId.get(racine.parentId)!
  return { id: c.id, label: c.label, path: c.path, google: c.google, rayon: { id: racine.id, label: racine.label } }
}

/** Le rayon racine du chemin : « Mode > Femme » → « Mode ». */
export function racineChemin(path: string | null | undefined): string | null {
  return path?.split('>')[0]?.trim() || null
}
