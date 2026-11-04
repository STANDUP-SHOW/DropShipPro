/**
 * Printful et Printify — l'impression à la demande, importée par l'API.
 *
 * Deux logiques différentes, et c'est voulu :
 *
 * - **Printful** publie son catalogue avec le prix de chaque variante (API
 *   Catalog v1, `GET /products/{id}`). Une fiche du catalogue s'importe telle
 *   quelle, prix d'achat compris.
 * - **Printify**, lui, ne donne AUCUN prix dans son catalogue : les gabarits
 *   (`/v1/catalog/blueprints`) n'ont ni `cost` ni `price`, lu dans leur spec
 *   OpenAPI le 30/10/2026. Le prix n'existe que sur les produits de la boutique
 *   du vendeur (`/v1/shops/{shop_id}/products`), une fois son visuel posé. On
 *   importe donc ces produits-là — c'est aussi ce qu'il vend réellement — plutôt
 *   que d'inventer un prix à un gabarit vierge.
 *
 * Contrats lus dans les documentations officielles ; prouvés seulement sur le
 * faux serveur de `check-fournisseurs.ts`. Le premier vrai essai sera le compte
 * d'un vendeur.
 */

import { SupplierError, type SupplierConnector, type SupplierListing, type SupplierPrice } from './supplierTypes.js'

const BASES = {
  printful: process.env.PRINTFUL_API_BASE?.trim() || 'https://api.printful.com',
  printify: process.env.PRINTIFY_API_BASE?.trim() || 'https://api.printify.com',
}

/** A bounded call that turns refusals into messages the seller can act on. */
async function appel(fournisseur: string, url: string, jeton: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  if (res.status === 401 || res.status === 403) {
    throw new SupplierError(`${fournisseur} refuse votre jeton d'accès. Vérifiez-le dans API Sourcing Connect.`, true)
  }
  if (res.status === 404) throw new SupplierError(`${fournisseur} ne connaît pas cette référence.`)
  if (res.status === 429) {
    throw new SupplierError(`${fournisseur} limite le nombre de requêtes. Réessayez dans quelques minutes.`)
  }
  if (!res.ok) throw new SupplierError(`${fournisseur} a répondu ${res.status}.`)
  return res.json()
}

function jetonDe(fournisseur: string, credentials: Record<string, string>) {
  const jeton = credentials.accessToken?.trim()
  if (!jeton) throw new SupplierError(`Aucun jeton d'accès ${fournisseur} enregistré.`, true)
  return jeton
}

/** Plain text out of an HTML description. */
function texte(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

const unique = (urls: string[]) => urls.filter((u, i, t) => /^https?:\/\//i.test(u) && t.indexOf(u) === i)

// --- Printful ----------------------------------------------------------------

type ProduitPrintful = {
  id?: number
  title?: string
  type_name?: string
  brand?: string | null
  model?: string | null
  image?: string
  currency?: string
  description?: string
  is_discontinued?: boolean
}
type VariantePrintful = {
  id?: number
  name?: string
  size?: string | null
  color?: string | null
  image?: string
  price?: string | number
  in_stock?: boolean
}

async function fichePrintful(ref: string, jeton: string) {
  const r = (await appel('Printful', `${BASES.printful}/products/${encodeURIComponent(ref)}`, jeton)) as {
    result?: { product?: ProduitPrintful; variants?: VariantePrintful[] }
  }
  const produit = r.result?.product
  if (!produit?.title) throw new SupplierError(`Printful ne rend aucune fiche pour la référence ${ref}.`)
  return { produit, variantes: r.result?.variants ?? [] }
}

const prixMini = (variantes: Array<{ price?: string | number }>) => {
  const prix = variantes.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
  return prix.length ? Math.min(...prix) : null
}

export const printful: SupplierConnector = {
  id: 'printful',
  label: 'Printful',

  /** `GET /store` is the call Printful's own docs use as the cheap request. */
  async verifier(credentials) {
    await appel('Printful', `${BASES.printful}/store`, jetonDe('Printful', credentials))
  },

  /** Top-level catalog categories (`parent_id` 0). */
  async listerRayons(credentials) {
    const r = (await appel('Printful', `${BASES.printful}/categories`, jetonDe('Printful', credentials))) as {
      result?: { categories?: Array<{ id?: number; parent_id?: number; title?: string }> }
    }
    return (r.result?.categories ?? [])
      .filter((c) => c.id && c.title && !c.parent_id)
      .map((c) => ({ id: String(c.id), label: c.title! }))
  },

  /**
   * The list carries no price: Printful prices its variants, and the list
   * returns products. The price shows on the imported sheet, never guessed here.
   */
  async produitsDuRayon(rayon, credentials) {
    const r = (await appel(
      'Printful',
      `${BASES.printful}/products?category_id=${encodeURIComponent(rayon)}`,
      jetonDe('Printful', credentials),
    )) as { result?: ProduitPrintful[] }
    return (r.result ?? [])
      .filter((p) => p.id && p.title && !p.is_discontinued)
      .slice(0, 48)
      .map(
        (p): SupplierListing => ({
          ref: String(p.id),
          titre: p.title!,
          prix: null,
          devise: p.currency || 'EUR',
          image: p.image || null,
          url: null,
          entrepot: null,
        }),
      )
  },

  async fetchPrices(refs, credentials) {
    const jeton = jetonDe('Printful', credentials)
    const sortie: SupplierPrice[] = []
    for (const ref of refs) {
      try {
        const { produit, variantes } = await fichePrintful(ref, jeton)
        const enStock = variantes.some((v) => v.in_stock)
        sortie.push({
          ref,
          price: prixMini(variantes),
          currency: produit.currency || 'EUR',
          stock: null,
          available: !produit.is_discontinued && enStock,
        })
      } catch (err) {
        if (err instanceof SupplierError && !err.actionnable) {
          sortie.push({ ref, price: null, currency: 'EUR', stock: 0, available: false })
          continue
        }
        throw err
      }
    }
    return sortie
  },

  /** `GET /products/{id}`: the product, then its variants with their price. */
  async fetchProduct(ref, credentials) {
    const { produit, variantes } = await fichePrintful(ref, jetonDe('Printful', credentials))
    const prix = prixMini(variantes)
    if (prix === null) throw new SupplierError(`Printful ne donne aucun prix pour la référence ${ref}.`)

    const options: Record<string, Set<string>> = {}
    for (const v of variantes) {
      if (v.color) (options['Couleur'] ??= new Set()).add(v.color)
      if (v.size) (options['Taille'] ??= new Set()).add(v.size)
    }
    const description = texte(produit.description ?? '')
    const caracteristiques = [
      produit.type_name ? `Type : ${produit.type_name}` : '',
      produit.brand ? `Marque : ${produit.brand}` : '',
      produit.model ? `Modèle : ${produit.model}` : '',
      'Impression à la demande : chaque exemplaire est fabriqué à la commande.',
    ].filter(Boolean)

    return {
      ref,
      title: produit.title!,
      description: description.slice(0, 4000),
      price: prix,
      currency: produit.currency || 'EUR',
      images: unique([produit.image ?? '', ...variantes.map((v) => v.image ?? '')]),
      variants: Object.keys(options).length
        ? Object.fromEntries(Object.entries(options).map(([k, v]) => [k, [...v]]))
        : null,
      pageText: [produit.title, ...caracteristiques, description].join('\n').slice(0, 15000),
      category: produit.type_name?.trim() || null,
      available: !produit.is_discontinued && variantes.some((v) => v.in_stock),
    }
  },

  async fetchVariants(ref, credentials) {
    const { variantes } = await fichePrintful(ref, jetonDe('Printful', credentials))
    return variantes
      .filter((v) => v.id)
      .map((v) => ({
        ref: String(v.id),
        label: v.name || [v.color, v.size].filter(Boolean).join(' / ') || String(v.id),
        price: Number.isFinite(Number(v.price)) ? Number(v.price) : null,
        stock: null,
      }))
  },
}

// --- Printify ----------------------------------------------------------------

type ProduitPrintify = {
  id?: string
  title?: string
  description?: string
  tags?: string[]
  options?: Array<{ name?: string; values?: Array<{ id?: number; title?: string }> }>
  variants?: Array<{
    id?: number
    title?: string
    /** Integer in cents, as in Printify's examples (516 = 5.16). */
    cost?: number
    price?: number
    is_enabled?: boolean
    is_available?: boolean
  }>
  images?: Array<{ src?: string; is_default?: boolean }>
}

function boutiquePrintify(credentials: Record<string, string>) {
  const shop = credentials.shopId?.trim()
  if (!shop) throw new SupplierError("Aucun identifiant de boutique Printify (Shop ID) enregistré.", true)
  return shop
}

async function fichePrintify(ref: string, credentials: Record<string, string>) {
  const p = (await appel(
    'Printify',
    `${BASES.printify}/v1/shops/${encodeURIComponent(boutiquePrintify(credentials))}/products/${encodeURIComponent(ref)}.json`,
    jetonDe('Printify', credentials),
  )) as ProduitPrintify
  if (!p?.title) throw new SupplierError(`Printify ne rend aucun produit ${ref} dans votre boutique.`)
  return p
}

/** Only enabled variants are sold; their cost is what the seller pays. */
const variantesVendues = (p: ProduitPrintify) => (p.variants ?? []).filter((v) => v.is_enabled !== false)
const coutMini = (p: ProduitPrintify) => {
  const couts = variantesVendues(p)
    .map((v) => Number(v.cost))
    .filter((c) => Number.isFinite(c) && c > 0)
  return couts.length ? Math.min(...couts) / 100 : null
}

export const printify: SupplierConnector = {
  id: 'printify',
  label: 'Printify',

  /** The token must open the shop the seller named, not just any shop. */
  async verifier(credentials) {
    const shop = boutiquePrintify(credentials)
    const boutiques = (await appel('Printify', `${BASES.printify}/v1/shops.json`, jetonDe('Printify', credentials))) as Array<{
      id?: number | string
    }>
    if (!Array.isArray(boutiques) || !boutiques.some((b) => String(b.id) === shop)) {
      throw new SupplierError(`Le jeton Printify est valide, mais il n'ouvre pas la boutique ${shop}.`, true)
    }
  },

  /** One "aisle": the seller's own Printify shop, the only place prices exist. */
  async listerRayons(credentials) {
    return [{ id: boutiquePrintify(credentials), label: 'Ma boutique Printify' }]
  },

  async produitsDuRayon(_rayon, credentials) {
    const r = (await appel(
      'Printify',
      `${BASES.printify}/v1/shops/${encodeURIComponent(boutiquePrintify(credentials))}/products.json?limit=50`,
      jetonDe('Printify', credentials),
    )) as { data?: ProduitPrintify[] }
    return (r.data ?? [])
      .filter((p) => p.id && p.title)
      .map(
        (p): SupplierListing => ({
          ref: p.id!,
          titre: p.title!,
          prix: coutMini(p),
          devise: 'USD',
          image: (p.images ?? []).find((i) => i.is_default)?.src ?? p.images?.[0]?.src ?? null,
          url: null,
          entrepot: null,
        }),
      )
  },

  async fetchPrices(refs, credentials) {
    const sortie: SupplierPrice[] = []
    for (const ref of refs) {
      try {
        const p = await fichePrintify(ref, credentials)
        sortie.push({
          ref,
          price: coutMini(p),
          currency: 'USD',
          stock: null,
          available: variantesVendues(p).some((v) => v.is_available !== false),
        })
      } catch (err) {
        if (err instanceof SupplierError && !err.actionnable) {
          sortie.push({ ref, price: null, currency: 'USD', stock: 0, available: false })
          continue
        }
        throw err
      }
    }
    return sortie
  },

  async fetchProduct(ref, credentials) {
    const p = await fichePrintify(ref, credentials)
    const prix = coutMini(p)
    if (prix === null) throw new SupplierError(`Printify ne donne aucun coût pour le produit ${ref}.`)

    const options = (p.options ?? [])
      .filter((o) => o.name && o.values?.length)
      .map((o) => [o.name!, o.values!.map((v) => v.title ?? '').filter(Boolean)] as const)
      .filter(([, v]) => v.length)
    const images = [...(p.images ?? [])].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)))
    const description = texte(p.description ?? '')

    return {
      ref,
      title: p.title!,
      description: description.slice(0, 4000),
      price: prix,
      currency: 'USD',
      images: unique(images.map((i) => i.src ?? '')),
      variants: options.length ? Object.fromEntries(options) : null,
      pageText: [
        p.title,
        p.tags?.length ? `Mots-clés : ${p.tags.join(', ')}` : '',
        'Impression à la demande : chaque exemplaire est fabriqué à la commande.',
        description,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 15000),
      category: null,
      available: variantesVendues(p).some((v) => v.is_available !== false),
    }
  },

  async fetchVariants(ref, credentials) {
    const p = await fichePrintify(ref, credentials)
    return variantesVendues(p)
      .filter((v) => v.id)
      .map((v) => ({
        ref: String(v.id),
        label: v.title || String(v.id),
        price: Number.isFinite(Number(v.cost)) ? Number(v.cost) / 100 : null,
        stock: null,
      }))
  },
}
