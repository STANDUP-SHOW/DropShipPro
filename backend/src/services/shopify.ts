import type { Product, User } from '@prisma/client'
import { titleForChannel } from './channelCopy.js'

/**
 * Shopify Admin API connector.
 *
 * Unlike every marketplace in platforms.ts, Shopify needs no seller approval: the
 * merchant creates a custom app in their own admin (Réglages › Apps et canaux de
 * vente › Développer des apps), grants `write_products`, and copies the Admin API
 * access token. That's why this is the first destination that really publishes.
 *
 * The REST product endpoints are legacy, so everything goes through GraphQL. The
 * version is pinned but overridable: Shopify retires a version every year, and
 * bumping an env var is faster than shipping code.
 */
const API_VERSION = process.env.SHOPIFY_API_VERSION?.trim() || '2025-10'

export interface ShopifyCredentials {
  /** Always the myshopify.com host, never the custom domain: tokens are issued for it. */
  shopDomain: string
  accessToken: string
}

/**
 * Accepts what a merchant actually copies: `ma-boutique`,
 * `ma-boutique.myshopify.com`, or the full admin URL.
 */
export function normalizeShopDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase()
  if (!value) return null

  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  // https://admin.shopify.com/store/ma-boutique
  const adminMatch = raw.trim().toLowerCase().match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/)
  if (adminMatch) value = `${adminMatch[1]}.myshopify.com`
  if (!value.includes('.')) value = `${value}.myshopify.com`

  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value) ? value : null
}

/** Reads the JSON blob stored in PlatformCredential.data, or null when unusable. */
export function readShopifyCredentials(data: unknown): ShopifyCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const shopDomain = typeof raw.shopDomain === 'string' ? normalizeShopDomain(raw.shopDomain) : null
  const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : ''
  if (!shopDomain || !accessToken) return null
  return { shopDomain, accessToken }
}

/*
 * ---------------------------------------------------------------------------
 * La seconde voie : le Dev Dashboard.
 * ---------------------------------------------------------------------------
 *
 * Shopify a deux consoles, et elles ne délivrent pas la même chose.
 *
 * L'administration de la boutique donne un jeton `shpat_` permanent, qu'on colle
 * une fois. C'est le chemin le plus simple, et il reste le chemin conseillé.
 *
 * Le Dev Dashboard, lui, ne montre plus aucun jeton : il donne un Client ID et
 * un Client Secret, qu'on échange soi-même contre un jeton qui vit vingt-quatre
 * heures. Plus de travail pour nous, mais mieux pour le marchand — rien à
 * recopier, rien affiché « une seule fois », et un secret qui se change sans
 * revenir dans l'application.
 *
 * Le marchand qui monte son app dans le Dev Dashboard n'a aucun moyen d'obtenir
 * un `shpat_` : lui refuser cette voie reviendrait à lui dire de tout refaire
 * ailleurs. D'où les deux.
 */

export interface ShopifyOAuthCredentials {
  shopDomain: string
  clientId: string
  clientSecret: string
}

export function readShopifyOAuthCredentials(data: unknown): ShopifyOAuthCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const shopDomain = typeof raw.shopDomain === 'string' ? normalizeShopDomain(raw.shopDomain) : null
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : ''
  const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : ''
  if (!shopDomain || !clientId || !clientSecret) return null
  return { shopDomain, clientId, clientSecret }
}

/**
 * Les jetons échangés, gardés en mémoire le temps de leur vie.
 *
 * Shopify les donne pour 86 399 secondes. Les redemander à chaque publication
 * marcherait, mais publier trente annonces ferait trente échanges pour rien, et
 * chacun compte dans les limites de débit. Une marge de cinq minutes évite le
 * cas désagréable : un jeton obtenu valide qui expire pendant l'appel suivant.
 *
 * En mémoire et pas en base : ces jetons vivent moins longtemps qu'un
 * redéploiement, et les écrire ajouterait un secret de plus à protéger pour
 * gagner un seul appel réseau par jour.
 */
const jetonsEchanges = new Map<string, { token: string; expire: number }>()
const MARGE_MS = 5 * 60 * 1000

/**
 * Échange le Client ID et le Client Secret contre un jeton d'accès.
 *
 * Ne marche que si l'app et la boutique appartiennent à la même organisation
 * Shopify — ce qui est le cas d'un marchand qui monte son app pour sa propre
 * boutique, et seulement de celui-là. Le message le dit, parce que le refus de
 * Shopify, lui, ne le dit pas.
 */
export async function jetonParClientCredentials(
  creds: ShopifyOAuthCredentials,
): Promise<ShopifyCredentials> {
  const cle = `${creds.shopDomain}:${creds.clientId}`
  const garde = jetonsEchanges.get(cle)
  if (garde && garde.expire > Date.now() + MARGE_MS) {
    return { shopDomain: creds.shopDomain, accessToken: garde.token }
  }

  let res: Response
  try {
    res = await fetch(`https://${creds.shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new ShopifyError("Boutique Shopify injoignable : vérifiez l'adresse .myshopify.com")
  }

  if (res.status === 400 || res.status === 401) {
    throw new ShopifyError(
      "Shopify refuse le Client ID ou le Client Secret. Vérifiez-les dans le Dev Dashboard, et surtout que l'app et la boutique sont bien dans la même organisation : cet échange ne marche pas autrement.",
    )
  }
  if (!res.ok) throw new ShopifyError(`Shopify a répondu ${res.status} à la demande de jeton.`)

  const corps = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!corps.access_token) {
    throw new ShopifyError("Shopify n'a pas délivré de jeton pour ces identifiants.")
  }

  jetonsEchanges.set(cle, {
    token: corps.access_token,
    expire: Date.now() + (corps.expires_in ?? 86399) * 1000,
  })

  return { shopDomain: creds.shopDomain, accessToken: corps.access_token }
}

/**
 * Rend de quoi appeler l'API, quelle que soit la voie choisie par le marchand.
 *
 * Le reste du connecteur ne sait pas laquelle a servi, et n'a pas à le savoir :
 * il reçoit un domaine et un jeton, comme avant.
 */
export async function resoudreCredentialsShopify(data: unknown): Promise<ShopifyCredentials | null> {
  const direct = readShopifyCredentials(data)
  if (direct) return direct

  const oauth = readShopifyOAuthCredentials(data)
  if (oauth) return jetonParClientCredentials(oauth)

  return null
}

class ShopifyError extends Error {}

async function graphql<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`https://${creds.shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': creds.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new ShopifyError("Boutique Shopify injoignable : vérifiez l'adresse .myshopify.com")
  }

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyError(
      "Jeton refusé par Shopify. Vérifiez le jeton d'accès de l'app personnalisée et l'autorisation write_products.",
    )
  }
  if (res.status === 404) {
    throw new ShopifyError("Boutique introuvable : l'adresse .myshopify.com ne correspond à aucune boutique.")
  }
  if (res.status === 429) {
    throw new ShopifyError('Shopify a limité le débit des appels. Réessayez dans une minute.')
  }
  if (!res.ok) {
    throw new ShopifyError(`Shopify a répondu ${res.status}.`)
  }

  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (body.errors?.length) {
    // A wrong API version surfaces here as a schema error, hence the hint.
    throw new ShopifyError(`Shopify : ${body.errors.map((e) => e.message).join(' — ')}`)
  }
  if (!body.data) throw new ShopifyError('Réponse Shopify vide.')
  return body.data
}

/** userErrors are business refusals (invalid field, duplicate handle…), not HTTP failures. */
function assertNoUserErrors(errors: Array<{ field?: string[] | null; message: string }> | undefined, what: string) {
  if (errors?.length) throw new ShopifyError(`${what} : ${errors.map((e) => e.message).join(' — ')}`)
}

/** Turns the stored plain-text description into HTML, leaving real HTML alone. */
function toHtml(description: string, bulletPoints: string[]): string {
  const body = /<[a-z][\s\S]*>/i.test(description)
    ? description
    : description
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('\n')

  if (!bulletPoints.length) return body
  const list = bulletPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')
  return `${body}\n<ul>${list}</ul>`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Shopify downloads the photos itself, so it needs absolute, publicly reachable
 * URLs. Watermarked files are stored as /storage/… paths, which only mean
 * something relative to this API.
 */
function imageUrls(product: Product, apiBaseUrl: string | undefined): string[] {
  const images = Array.isArray(product.images) ? (product.images as unknown[]) : []
  return images
    .filter((img): img is string => typeof img === 'string')
    .map((img) => (img.startsWith('/') ? (apiBaseUrl ? `${apiBaseUrl}${img}` : '') : img))
    .filter((url) => /^https?:\/\//.test(url))
    // A localhost URL is reachable from this machine only: Shopify would fail to
    // fetch it and reject the whole product, so the photos are simply left out.
    .filter((url) => !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url))
}

const CREATE_PRODUCT = /* GraphQL */ `
  mutation dropshipperCreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        handle
        variants(first: 1) {
          nodes {
            id
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

const UPDATE_VARIANT = /* GraphQL */ `
  mutation dropshipperSetPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors {
        field
        message
      }
    }
  }
`

const ONLINE_STORE_PUBLICATION = /* GraphQL */ `
  query dropshipperPublications {
    publications(first: 25) {
      nodes {
        id
        name
      }
    }
  }
`

const PUBLISH = /* GraphQL */ `
  mutation dropshipperPublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors {
        field
        message
      }
    }
  }
`

export interface ShopifyPublishResult {
  externalUrl: string
  /** Non-blocking notes: photos skipped, sales channel not reachable… */
  notes: string[]
}

/**
 * Creates the product in the merchant's Shopify store and returns its storefront URL.
 *
 * Three calls rather than one: since API 2024-04 `productCreate` no longer takes
 * variants, so the price goes in a second mutation on the default variant, and
 * putting the product on the Online Store channel is a third, optional one.
 */
export async function publishToShopify(
  product: Product,
  user: Pick<User, 'shopName'>,
  targetCategory: string | null,
  creds: ShopifyCredentials,
  apiBaseUrl?: string,
): Promise<ShopifyPublishResult> {
  const notes: string[] = []

  // Shopify accepte deux cent cinquante-cinq caracteres : la variante longue
  // passe toujours, mais on demande quand meme celle du canal pour que la
  // regle vive a un seul endroit.
  const title = titleForChannel(product, 'SHOPIFY')
  const bulletPoints = Array.isArray(product.bulletPoints) ? (product.bulletPoints as unknown[]) : []
  const tags = (product.metaKeywords || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 40)

  const urls = imageUrls(product, apiBaseUrl)
  const totalImages = Array.isArray(product.images) ? (product.images as unknown[]).length : 0
  if (totalImages && !urls.length) {
    notes.push("Photos non transmises : elles ne sont pas accessibles depuis Internet (PUBLIC_API_URL absent ?).")
  }

  const created = await graphql<{
    productCreate: {
      product: { id: string; handle: string; variants: { nodes: Array<{ id: string }> } } | null
      userErrors: Array<{ field?: string[] | null; message: string }>
    }
  }>(creds, CREATE_PRODUCT, {
    product: {
      title,
      descriptionHtml: toHtml(
        product.aiDescription || product.description || '',
        bulletPoints.filter((b): b is string => typeof b === 'string'),
      ),
      vendor: user.shopName || undefined,
      productType: targetCategory || undefined,
      tags,
      status: 'ACTIVE',
      seo: {
        title: product.metaTitle || undefined,
        description: product.metaDescription || undefined,
      },
    },
    media: urls.map((src) => ({ originalSource: src, mediaContentType: 'IMAGE', alt: title })),
  })

  assertNoUserErrors(created.productCreate.userErrors, 'Création du produit refusée')
  const shopifyProduct = created.productCreate.product
  if (!shopifyProduct) throw new ShopifyError("Shopify n'a pas renvoyé le produit créé.")

  const variantId = shopifyProduct.variants.nodes[0]?.id
  const price = Number(product.sellingPrice)
  if (variantId && price > 0) {
    const updated = await graphql<{
      productVariantsBulkUpdate: { userErrors: Array<{ field?: string[] | null; message: string }> }
    }>(creds, UPDATE_VARIANT, {
      productId: shopifyProduct.id,
      // CONTINUE: no stock is tracked here, the supplier ships on demand — without
      // it Shopify would refuse the order as out of stock.
      variants: [{ id: variantId, price: price.toFixed(2), inventoryPolicy: 'CONTINUE' }],
    })
    assertNoUserErrors(updated.productVariantsBulkUpdate.userErrors, 'Prix refusé')
  } else if (!(price > 0)) {
    notes.push('Prix de vente à 0 € : le produit est créé sans prix dans Shopify.')
  }

  // Optional: needs read_publications/write_publications, which a minimal custom
  // app may not have. A failure here leaves a perfectly valid draft in the admin.
  try {
    const { publications } = await graphql<{ publications: { nodes: Array<{ id: string; name: string }> } }>(
      creds,
      ONLINE_STORE_PUBLICATION,
      {},
    )
    const onlineStore = publications.nodes.find((p) => /online store|boutique en ligne/i.test(p.name))
    if (onlineStore) {
      const result = await graphql<{
        publishablePublish: { userErrors: Array<{ field?: string[] | null; message: string }> }
      }>(creds, PUBLISH, { id: shopifyProduct.id, input: [{ publicationId: onlineStore.id }] })
      assertNoUserErrors(result.publishablePublish.userErrors, 'Mise en ligne refusée')
    } else {
      notes.push("Canal « Boutique en ligne » introuvable : activez le produit à la main dans Shopify.")
    }
  } catch {
    notes.push(
      "Produit créé mais pas mis en ligne automatiquement (autorisation write_publications absente) : activez-le dans Shopify.",
    )
  }

  return { externalUrl: `https://${creds.shopDomain}/products/${shopifyProduct.handle}`, notes }
}
