import type { Product, User } from '@prisma/client'
import { prixDeVenteDe, type Combinaison } from './variantMatrix.js'
import { absoluteUrl } from '../lib/urls.js'
import { titleForChannel } from './channelCopy.js'
import { rangerDansShopify, type CategorieSource } from './shopifyCatalog.js'
import { codeBarresDe, codeDouanierDe, handleDe, paysOrigineDe, poidsDe, ugsDe } from './productFacts.js'

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
const jetonsEchanges = new Map<string, { token: string; expire: number; scope: string }>()
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
): Promise<ShopifyCredentials & { scope: string }> {
  const cle = `${creds.shopDomain}:${creds.clientId}`
  const garde = jetonsEchanges.get(cle)
  if (garde && garde.expire > Date.now() + MARGE_MS) {
    return { shopDomain: creds.shopDomain, accessToken: garde.token, scope: garde.scope }
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

  const corps = (await res.json()) as {
    access_token?: string
    expires_in?: number
    scope?: string
  }
  if (!corps.access_token) {
    throw new ShopifyError("Shopify n'a pas délivré de jeton pour ces identifiants.")
  }

  const scope = corps.scope ?? ''
  jetonsEchanges.set(cle, {
    token: corps.access_token,
    expire: Date.now() + (corps.expires_in ?? 86399) * 1000,
    scope,
  })

  return { shopDomain: creds.shopDomain, accessToken: corps.access_token, scope }
}

/**
 * L'autorisation sans laquelle rien ne se publiera, vérifiée dès la liaison.
 *
 * Cet échange ne demande aucune autorisation : il rend celles que l'app déclare
 * déjà. Une app montée sans `write_products` donne donc un jeton parfaitement
 * valide, avec lequel toute publication échoue en 403. L'écran dirait
 * « Connecté », et le vendeur chercherait du côté de sa clé pendant que le
 * problème est dans la configuration de son app.
 */
export function autorisationManquante(scope: string): string | null {
  const accordees = new Set(
    scope
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  if (accordees.has('write_products')) return null

  const suite =
    "Ajoutez write_products dans le Dev Dashboard, publiez une nouvelle version de l'app, puis acceptez la mise à jour sur la boutique."

  return accordees.size
    ? `Ces identifiants fonctionnent, mais l'app n'a pas l'autorisation write_products — elle a : ${[...accordees].join(', ')}. ${suite}`
    : `Ces identifiants fonctionnent, mais l'app n'a aucune autorisation sur le catalogue. ${suite}`
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
function urlTelechargeable(brut: unknown, apiBaseUrl: string | undefined): string | null {
  if (typeof brut !== 'string' || !brut) return null
  const url = brut.startsWith('/') ? (apiBaseUrl ? `${apiBaseUrl}${brut}` : '') : brut
  if (!/^https?:\/\//.test(url)) return null
  // A localhost URL is reachable from this machine only: Shopify would fail to
  // fetch it and reject the media, so it is simply left out.
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url)) return null
  return url
}

function imageUrls(product: Product, apiBaseUrl: string | undefined, marquees?: string[]): string[] {
  // Les images marquees pour l export quand elles existent : Shopify recoit
  // la photo signee, pas l original de travail.
  const images: unknown[] = marquees ?? (Array.isArray(product.images) ? (product.images as unknown[]) : [])
  return images
    .map((img) => urlTelechargeable(img, apiBaseUrl))
    .filter((url): url is string => url !== null)
}

/**
 * La cle d une combinaison : ses valeurs, triees et normalisees.
 *
 * Triees parce que l ordre des options du produit cartesien et celui du releve
 * n ont aucune raison de coincider. Normalisees parce que « Bleu » et « bleu  »
 * designent la meme couleur -- et qu une jointure ratee rend le prix du produit,
 * c est-a-dire le defaut qu on corrige, en silence.
 */
function cleValeurs(valeurs: string[]): string {
  return valeurs
    .map((v) => String(v).trim().toLowerCase())
    .sort()
    .join('|')
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

const CREATE_VARIANTS = /* GraphQL */ `
  mutation dropshipperAddVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: REMOVE_STANDALONE_VARIANT
    ) {
      productVariants {
        id
      }
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

/**
 * Ajoute un média à un produit déjà créé.
 *
 * Séparé de `productCreate` à dessein : un média refusé dans la création fait
 * refuser le produit entier, pas le média. Ici, un refus coûte une remarque.
 */
const CREATE_MEDIA = /* GraphQL */ `
  mutation dropshipperCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      userErrors {
        field
        message
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

/** Tout ce dont la publication a besoin, autour du produit lui-même. */
export interface ContextePublicationShopify {
  user: Pick<User, 'shopName'>
  /** Le libellé de catégorie, tel qu'il est enregistré sur la publication. */
  targetCategory: string | null
  /** La catégorie du référentiel maison : taxonomie officielle et collections. */
  categorie: CategorieSource | null
  creds: ShopifyCredentials
  apiBaseUrl?: string
  /** Les photos marquées pour l'export, quand la marque se pose au départ. */
  marquees?: string[]
  /** Mémorise la correspondance de taxonomie, pour ne pas la rechercher demain. */
  memoriser?: (correspondance: { id: string; fullName: string }) => Promise<void>
}

/**
 * Creates the product in the merchant's Shopify store and returns its storefront URL.
 *
 * Three calls rather than one: since API 2024-04 `productCreate` no longer takes
 * variants, so the price goes in a second mutation on the default variant, and
 * putting the product on the Online Store channel is a third, optional one.
 *
 * **La fiche part remplie, pas ébauchée.** Le reproche du 31/08/2026 était
 * qu'il fallait tout reprendre à la main dans Shopify. Ce qui manquait n'était
 * pas dans le modèle mais dans l'envoi : la catégorie officielle, les
 * collections, l'UGS, le coût d'achat, le poids, le pays d'origine, le code
 * douanier, le code-barres et l'adresse de la fiche existaient déjà en base et
 * ne partaient nulle part.
 *
 * Deux champs restent volontairement vides, et c'est une décision :
 *
 * - **Le prix barré** ne s'invente pas. En France, un prix de référence doit
 *   avoir été pratiqué ; en afficher un qui ne l'a jamais été est une pratique
 *   commerciale trompeuse. C'est au vendeur de le poser s'il a de quoi.
 * - **Le pays d'origine et le code douanier** ne sont envoyés que quand la fiche
 *   source les nomme. Les deviner écrirait une mention légale fausse.
 */
export async function publishToShopify(
  product: Product,
  ctx: ContextePublicationShopify,
): Promise<ShopifyPublishResult> {
  const { user, targetCategory, creds, apiBaseUrl, marquees } = ctx
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

  const options = optionsShopify(product.variants)
  const metachamps = metachampsShopify(product.attributes)
  const urls = imageUrls(product, apiBaseUrl, marquees)

  /*
   * Les faits de stock et d'expédition, lus dans les caractéristiques.
   *
   * Ils y étaient depuis le début, en toutes lettres — « Poids : 450 g »,
   * « Fabriqué en Chine » — et ne remplissaient aucun champ. Écrits dans la
   * description ils se lisent ; rangés ici, ils calculent le port et remplissent
   * la déclaration douanière.
   */
  const poids = poidsDe(product)
  const paysOrigine = paysOrigineDe(product)
  const codeDouanier = codeDouanierDe(product)
  const codeBarres = codeBarresDe(product)
  const ugs = ugsDe(product)
  const cout = Number(product.price)

  /*
   * Le rangement : catégorie officielle de Shopify et collections de la
   * boutique. C'est le reproche principal — « catégories et collections ne
   * montent pas ». `productType` seul est du texte libre : il s'affiche et ne
   * range rien, aucun canal ne le lit.
   */
  const rangement = await rangerDansShopify(
    (query, variables) => graphql(creds, query, variables),
    ctx.categorie,
  )
  notes.push(...rangement.notes)
  if (rangement.aRetenir && ctx.memoriser) {
    // Mémoriser ne doit jamais faire échouer une publication réussie.
    await ctx.memoriser(rangement.aRetenir).catch(() => {})
  }

  /**
   * Ce qui vaut pour chaque variante : d'où elle vient, ce qu'elle coûte, ce
   * qu'elle pèse. Le stock n'est pas suivi — le fournisseur expédie à la
   * demande, et un produit suivi à zéro se refuse tout seul à la commande.
   */
  const inventaire = (sku: string) => ({
    sku,
    cost: cout > 0 ? cout.toFixed(2) : undefined,
    tracked: false,
    requiresShipping: true,
    countryCodeOfOrigin: paysOrigine,
    harmonizedSystemCode: codeDouanier,
    measurement: poids ? { weight: { value: poids.value, unit: poids.unit } } : undefined,
  })
  const totalImages = Array.isArray(product.images) ? (product.images as unknown[]).length : 0
  if (totalImages && !urls.length) {
    notes.push("Photos non transmises : elles ne sont pas accessibles depuis Internet (PUBLIC_API_URL absent ?).")
  }

  const entree: Record<string, unknown> = {
      title,
      // Sans lui, Shopify fabrique l'adresse à partir d'un titre de deux cents
      // caractères : illisible dans un partage, et impossible à changer une fois
      // qu'elle a des liens entrants.
      handle: handleDe(product.metaTitle || title),
      descriptionHtml: toHtml(
        product.aiDescription || product.description || '',
        bulletPoints.filter((b): b is string => typeof b === 'string'),
      ),
      vendor: user.shopName || undefined,
      productType: targetCategory || undefined,
      /*
       * La vraie catégorie, celle qui a un identifiant.
       *
       * `productType` est du texte libre : il s'affiche dans l'administration et
       * ne range rien. C'est `category` qui décide des attributs proposés, de la
       * TVA suggérée et de ce que Shopify transmet à Google, Meta et TikTok.
       */
      category: rangement.categoryId,
      // Les rayons de la boutique : sans eux, trois cents produits tiennent sur
      // une seule page et le vendeur crée ses collections une par une.
      collectionsToJoin: rangement.collections.length ? rangement.collections : undefined,
      /*
       * Les options d'achat, enfin transmises.
       *
       * Sans elles, Shopify crée un produit à variante unique : l'acheteur voit
       * une fiche sans choix, et le vendeur croit que ses couleurs sont montées
       * parce que Shopify affiche son option par défaut. Constaté le 27/08/2026
       * sur la première publication réelle.
       */
      productOptions: options.length ? options : undefined,
      // Les attributs structures : exploitables par un filtre et par un flux,
      // ce que la description ne sera jamais.
      metafields: metachamps.length ? metachamps : undefined,
      tags,
      status: 'ACTIVE',
      seo: {
        title: product.metaTitle || undefined,
        description: product.metaDescription || undefined,
      },
  }

  const media = urls.map((src) => ({ originalSource: src, mediaContentType: 'IMAGE', alt: title }))

  type ReponseCreation = {
    productCreate: {
      product: { id: string; handle: string; variants: { nodes: Array<{ id: string }> } } | null
      userErrors: Array<{ field?: string[] | null; message: string }>
    }
  }

  let created = await graphql<ReponseCreation>(creds, CREATE_PRODUCT, { product: entree, media })

  /*
   * L'adresse choisie peut être déjà prise, et ce refus-là ne doit rien perdre.
   *
   * Shopify n'ajoute de suffixe que sur les adresses qu'il fabrique lui-même :
   * celle qu'on lui impose, il la refuse quand elle existe. Deux montres du même
   * modèle, ou une simple republication, feraient donc échouer toute la fiche
   * pour un morceau d'URL. On repart sans handle : Shopify reprend la main et
   * numérote.
   */
  const refusHandle = created.productCreate.userErrors.some(
    // Le champ est parfois nul selon le refus : le message sert de second signe.
    (e) => e.field?.includes('handle') || /handle/i.test(e.message),
  )
  if (refusHandle) {
    delete entree.handle
    created = await graphql<ReponseCreation>(creds, CREATE_PRODUCT, { product: entree, media })
  }

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
      variants: [
        {
          id: variantId,
          price: price.toFixed(2),
          inventoryPolicy: 'CONTINUE',
          taxable: true,
          // Le code-barres n'est posé que sur une fiche à variante unique : un
          // EAN identifie un article précis, le recopier sur douze combinaisons
          // en ferait douze fois une donnée fausse.
          barcode: combinaisons(options).length > 1 ? undefined : codeBarres,
          inventoryItem: inventaire(ugs),
        },
      ],
    })
    assertNoUserErrors(updated.productVariantsBulkUpdate.userErrors, 'Prix refusé')
  } else if (!(price > 0)) {
    notes.push('Prix de vente à 0 € : le produit est créé sans prix dans Shopify.')
  }

  /*
   * Les combinaisons, créées explicitement.
   *
   * `productCreate` avec des options ne crée qu'une seule variante : celle de la
   * première valeur de chaque option. Les onze autres d'un « trois couleurs ×
   * quatre capacités » n'existent pas tant qu'on ne les demande pas.
   *
   * `REMOVE_STANDALONE_VARIANT` retire la variante par défaut que Shopify a
   * posée : sans elle, la fiche garde un choix fantôme sans nom.
   *
   * Un refus ici ne perd pas le produit — il est déjà créé, avec ses photos et
   * sa description. La note le dit, et le vendeur complète à la main plutôt que
   * de tout réimporter.
   */
  /*
   * La matrice relevee, indexee par sa combinaison de valeurs.
   *
   * Le produit cartesien des options et la matrice decrivent les memes choix
   * mais pas dans le meme ordre : la jointure se fait donc sur les valeurs
   * elles-memes, jamais sur une position.
   */
  const matrice = new Map<string, Combinaison>()
  for (const c of (Array.isArray(product.combinations)
    ? product.combinations
    : []) as unknown as Combinaison[]) {
    if (c?.combo) matrice.set(cleValeurs(Object.values(c.combo)), c)
  }
  const prixAchat = Number(product.price) || 0

  const combos = combinaisons(options)
  if (combos.length > 1) {
    try {
      const ajout = await graphql<{
        productVariantsBulkCreate: { userErrors: Array<{ field?: string[] | null; message: string }> }
      }>(creds, CREATE_VARIANTS, {
        productId: shopifyProduct.id,
        variants: combos.map((valeurs) => {
          /*
           * Le prix et la photo de **cette** combinaison.
           *
           * Ils partaient identiques pour toutes : le prix du produit, et
           * aucune image. Non pas parce que l'appel était mal écrit — Shopify
           * accepte `price` et `mediaSrc` par variante depuis toujours — mais
           * parce que nous n'avions rien à transmettre : `variants` ne portait
           * que des libellés. C'est la matrice de combinaisons qui a comblé ça.
           *
           * `mediaSrc` plutôt que `mediaId` : Shopify télécharge l'adresse
           * lui-même, ce qui évite de créer les médias, d'attendre leur
           * traitement, puis de faire correspondre douze identifiants à douze
           * combinaisons — une correspondance qui se décale à la première photo
           * refusée.
           */
          const ligne = matrice.get(cleValeurs(valeurs))
          const prixVariante = ligne ? prixDeVenteDe(ligne, prixAchat, price) : price

          return {
            price: prixVariante > 0 ? prixVariante.toFixed(2) : undefined,
            // L'adresse est la nôtre : la photo a été rapatriée et marquée à
            // l'import, comme les autres.
            mediaSrc: ligne?.image ? [absoluteUrl(ligne.image)] : undefined,
            // Le fournisseur expédie à la demande : sans CONTINUE, Shopify
            // refuse la commande pour rupture de stock.
            inventoryPolicy: 'CONTINUE',
            taxable: true,
            /*
             * Une UGS par combinaison.
             *
             * Celle du fournisseur quand la matrice la porte — c'est elle que le
             * vendeur recopie sur son bon de commande, et le seul moyen de savoir
             * quelle couleur commander. À défaut, une UGS dérivée des valeurs :
             * douze variantes partageant la même rendent la préparation
             * impossible.
             */
            inventoryItem: inventaire(
              (ligne?.sku ? `${ugs}-${ligne.sku}` : `${ugs}-${valeurs.map(codeValeur).join('-')}`).slice(0, 60),
            ),
            optionValues: valeurs.map((v, i) => ({ name: v, optionName: options[i].name })),
          }
        }),
      })
      assertNoUserErrors(ajout.productVariantsBulkCreate.userErrors, 'Variantes refusées')
      notes.push(`${combos.length} variantes créées.`)
    } catch (e) {
      notes.push(
        `Variantes non transmises (${e instanceof Error ? e.message : 'refus Shopify'}) : le produit est en ligne, ses options sont à compléter dans Shopify.`,
      )
    }
  }


  /*
   * La vidéo, envoyée après coup et jamais dans `productCreate`.
   *
   * La glisser dans le `media` de la création ferait porter au produit entier
   * le risque d'un média refusé : Shopify rejette l'appel, pas seulement le
   * fichier, et une annonce parfaitement valide ne partirait plus parce qu'une
   * vidéo de trop est arrivée. Ici, un refus coûte une remarque.
   *
   * Shopify va chercher le fichier lui-même à l'adresse donnée — d'où
   * `PUBLIC_API_URL` et `lib/urls.ts`, comme pour les photos. Le traitement est
   * asynchrone de leur côté : la vidéo apparaît dans l'admin quelques minutes
   * après la publication.
   *
   * **Jamais confronté à une vraie boutique**, comme le reste de l'intégration
   * Shopify. Le meilleur effort n'est pas une précaution de style ici.
   */
  const videoUrl = urlTelechargeable(product.videoUrl, apiBaseUrl)
  if (videoUrl) {
    try {
      const result = await graphql<{
        productCreateMedia: { userErrors: Array<{ field?: string[] | null; message: string }> }
      }>(creds, CREATE_MEDIA, {
        productId: shopifyProduct.id,
        media: [
          {
            originalSource: videoUrl,
            mediaContentType: 'VIDEO',
            alt: (product.aiTitle || product.title).slice(0, 120),
          },
        ],
      })
      assertNoUserErrors(result.productCreateMedia.userErrors, 'Vidéo refusée')
      notes.push('Vidéo transmise — Shopify la traite en quelques minutes.')
    } catch (e) {
      notes.push(
        `Vidéo non transmise (${e instanceof Error ? e.message : 'refus Shopify'}) : le produit est en ligne, la vidéo est à ajouter à la main.`,
      )
    }
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

/**
 * Les options d'achat, telles que Shopify les attend.
 *
 * Shopify accepte **trois options au plus**, et cent valeurs par option. Au-delà
 * il refuse le produit entier — pas l'option en trop, le produit. Un disque dur
 * qui arrive avec Couleur, Capacité, Modèle et Prise perdrait donc tout s'il
 * n'était pas borné ici.
 *
 * L'ordre compte pour l'acheteur : la couleur d'abord, parce que c'est ce qu'il
 * regarde ; la taille ensuite, parce que c'est ce qu'il vérifie.
 */
const ORDRE_OPTIONS = ['Couleur', 'Taille', 'Pointure', 'Capacité', 'Modèle', 'Longueur', 'Puissance', 'Prise']

export interface OptionShopify {
  name: string
  values: Array<{ name: string }>
}

export function optionsShopify(variants: unknown): OptionShopify[] {
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) return []

  const entrees = Object.entries(variants as Record<string, unknown>)
    .map(([nom, valeurs]) => ({
      nom,
      valeurs: Array.isArray(valeurs)
        ? [...new Set(valeurs.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))]
        : [],
    }))
    // Une option à une seule valeur affiche un sélecteur qui ne sélectionne
    // rien : Shopify l'accepte, l'acheteur ne comprend pas.
    .filter((e) => e.valeurs.length > 1)
    .sort((a, b) => {
      const ra = ORDRE_OPTIONS.indexOf(a.nom)
      const rb = ORDRE_OPTIONS.indexOf(b.nom)
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
    })
    .slice(0, 3)

  return entrees.map((e) => ({
    name: e.nom.slice(0, 255),
    values: e.valeurs.slice(0, 100).map((v) => ({ name: v.slice(0, 255) })),
  }))
}

/**
 * Toutes les combinaisons d'options, à plat.
 *
 * Shopify ne les déduit pas : `productCreate` avec des options crée **une seule**
 * variante, celle de la première valeur de chaque option. Les autres doivent
 * être créées explicitement.
 *
 * Le produit est borné à cent variantes — trois couleurs × quatre capacités font
 * douze, mais dix couleurs × dix tailles × dix capacités en feraient mille, et
 * Shopify refuserait tout le lot.
 */
export function combinaisons(options: OptionShopify[], max = 100): string[][] {
  if (!options.length) return []

  let sortie: string[][] = [[]]
  for (const option of options) {
    const suivant: string[][] = []
    for (const debut of sortie) {
      for (const valeur of option.values) {
        if (suivant.length >= max) break
        suivant.push([...debut, valeur.name])
      }
    }
    sortie = suivant
  }
  return sortie
}

/**
 * Les attributs structurés, en métachamps Shopify.
 *
 * L'IA produit neuf attributs par annonce — matière, dimensions, compatibilité,
 * garantie. Ils partaient dans la description, noyés dans le texte : illisibles
 * pour un filtre, pour un flux Google, pour un thème qui sait afficher un
 * tableau de caractéristiques.
 *
 * Un métachamp les rend exploitables. Le namespace est le nôtre : `custom` est
 * partagé avec toutes les autres applications de la boutique, et deux
 * applications qui écrivent la même clé se marchent dessus.
 *
 * Shopify accepte au plus **deux cent cinquante métachamps par produit** ; on
 * s'arrête bien avant, parce qu'au-delà d'une vingtaine plus personne ne les
 * lit.
 */
export function metachampsShopify(attributs: unknown): Array<{
  namespace: string
  key: string
  type: string
  value: string
}> {
  if (!attributs || typeof attributs !== 'object' || Array.isArray(attributs)) return []

  const sortie: Array<{ namespace: string; key: string; type: string; value: string }> = []

  for (const [nom, valeur] of Object.entries(attributs as Record<string, unknown>)) {
    const texte =
      typeof valeur === 'string'
        ? valeur
        : Array.isArray(valeur)
          ? valeur.filter((v) => typeof v === 'string').join(', ')
          : typeof valeur === 'number' || typeof valeur === 'boolean'
            ? String(valeur)
            : ''
    if (!texte.trim()) continue

    /*
     * La clé Shopify n'accepte que des minuscules, des chiffres et des tirets
     * bas, et trente caractères au plus. « Matière du bracelet » devient
     * `matiere_du_bracelet` — et le libellé lisible reste dans la valeur, pas
     * dans la clé.
     */
    const cle = nom
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30)
    if (!cle) continue

    sortie.push({
      namespace: 'dropshipper',
      key: cle,
      type: 'single_line_text_field',
      value: texte.trim().slice(0, 255),
    })
    if (sortie.length >= 20) break
  }

  // Une clé en double fait refuser le produit entier.
  const vues = new Set<string>()
  return sortie.filter((m) => (vues.has(m.key) ? false : (vues.add(m.key), true)))
}

/**
 * Le morceau d'UGS qui désigne une valeur d'option.
 *
 * « Bleu ciel » devient `BLEUCIEL`, « 128 To » devient `128TO`. Court et sans
 * espace, parce qu'une UGS se lit sur un bon de commande et se tape à la main.
 */
export function codeValeur(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}
