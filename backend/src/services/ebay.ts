import type { Product } from '@prisma/client'
import { titleForChannel } from './channelCopy.js'

/**
 * Le connecteur eBay — l'API Sell, en trois actes.
 *
 * eBay est la seule grande destination française **sans mur EAN** : une fiche
 * libre suffit. C'est ce qui la rend précieuse pour un catalogue importé, et
 * c'est pourquoi elle passe avant Amazon dans la file.
 *
 * La publication est un triptyque imposé par l'API Inventory :
 *
 *   1. `PUT  /sell/inventory/v1/inventory_item/{sku}` — la fiche produit ;
 *   2. `POST /sell/inventory/v1/offer`                — l'offre (prix, politiques) ;
 *   3. `POST /sell/inventory/v1/offer/{id}/publish`   — la mise en ligne.
 *
 * Et trois prérequis vivent côté compte vendeur, pas côté annonce : une
 * politique de livraison, une de paiement, une de retour (« business
 * policies »), plus un emplacement marchand. Sans eux, eBay refuse l'offre —
 * le refus est traduit en geste précis plutôt qu'en code d'erreur.
 *
 * La catégorie est obligatoire et vient de **leur** taxonomie : on la demande
 * à leur API de suggestions plutôt que d'entretenir une table de
 * correspondances qui vieillirait mal. La réponse est mémorisée sur la
 * catégorie du référentiel, comme pour Shopify : mille produits d'un même
 * rayon coûtent une recherche, pas mille.
 *
 * **Jamais confronté à un vrai compte eBay.** Le banc l'éprouve contre un faux
 * serveur qui vérifie chaque appel ; il faudra un vrai jeton vendeur pour le
 * constater — et chaque fiche l'écrit.
 */

export interface EbayCredentials {
  /** Le jeton utilisateur OAuth, portées sell.inventory et sell.account. */
  accessToken: string
  /**
   * Le trio de renouvellement, facultatif : un jeton utilisateur eBay vit deux
   * heures. Sans lui, la publication marche tant que le jeton est frais et
   * demande un nouveau collage ensuite — le message le dit.
   */
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  /** Surchargée pour le bac à sable et le banc ; l'API réelle par défaut. */
  baseUrl?: string
}

const API_EBAY = 'https://api.ebay.com'

export function readEbayCredentials(data: unknown): EbayCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const accessToken = texte(raw.accessToken) ?? texte(raw.token)
  if (!accessToken) return null
  return {
    accessToken,
    refreshToken: texte(raw.refreshToken),
    clientId: texte(raw.clientId),
    clientSecret: texte(raw.clientSecret),
    baseUrl: texte(raw.baseUrl),
  }
}

export class EbayRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand c'est la liaison ou le compte, pas cette annonce-là. */
    readonly liaison: boolean,
    /** Vrai seulement pour un jeton expiré : le seul refus qu'un jeton frais répare. */
    readonly renouvelable = false,
  ) {
    super(message)
    this.name = 'EbayRefus'
  }
}

/** Le premier message lisible d'une réponse d'erreur eBay, sinon le brut. */
function messageDe(corps: string): string {
  try {
    const json = JSON.parse(corps) as { errors?: Array<{ message?: string; longMessage?: string }> }
    const premier = json.errors?.[0]
    return (premier?.longMessage || premier?.message || corps).slice(0, 300)
  } catch {
    return corps.slice(0, 300)
  }
}

async function appeler(
  creds: EbayCredentials,
  methode: string,
  chemin: string,
  corps?: unknown,
): Promise<Response> {
  const reponse = await fetch(`${creds.baseUrl ?? API_EBAY}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
      // Exigé par l'API Inventory pour une fiche destinée à eBay France :
      // sans lui, l'appel est refusé avec un message qui ne le dit pas.
      'Content-Language': 'fr-FR',
      Accept: 'application/json',
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })

  if (reponse.status === 401) {
    throw new EbayRefus(
      "Jeton eBay expiré ou révoqué. Un jeton utilisateur vit deux heures : régénérez-le sur developer.ebay.com, ou enregistrez aussi le refresh token avec le Client ID et le Client Secret pour que le renouvellement se fasse tout seul.",
      true,
      true,
    )
  }
  if (reponse.status === 403) {
    throw new EbayRefus(
      "Jeton eBay valide mais sans les autorisations Sell : régénérez-le avec les portées sell.inventory et sell.account.",
      true,
    )
  }
  if (!reponse.ok) {
    const detail = messageDe(await reponse.text().catch(() => ''))
    throw new EbayRefus(`Refus eBay (${reponse.status}) — ${detail}`, reponse.status >= 500)
  }
  return reponse
}

/**
 * Renouvelle le jeton quand le trio est là, et rejoue l'appel une fois.
 *
 * Un jeton eBay vit deux heures : sans ce détour, toute diffusion lancée plus
 * de deux heures après le collage échouerait en bloc, avec un message qui
 * ferait recoller le même jeton pour deux heures de plus.
 */
async function avecRenouvellement<T>(creds: EbayCredentials, action: (c: EbayCredentials) => Promise<T>): Promise<T> {
  try {
    return await action(creds)
  } catch (err) {
    const renouvelable =
      err instanceof EbayRefus && err.renouvelable && creds.refreshToken && creds.clientId && creds.clientSecret
    if (!renouvelable) throw err

    const reponse = await fetch(`${creds.baseUrl ?? API_EBAY}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: creds.refreshToken! }).toString(),
    })
    if (!reponse.ok) throw err

    const json = (await reponse.json().catch(() => ({}))) as { access_token?: string }
    if (!json.access_token) throw err
    return action({ ...creds, accessToken: json.access_token })
  }
}

/**
 * La catégorie eBay, demandée à leur taxonomie.
 *
 * Deux appels au plus : l'identifiant de l'arbre français (mis en cache — il
 * ne change jamais), puis les suggestions pour le libellé de la catégorie du
 * référentiel. eBay classe mieux ses propres rayons que n'importe quelle table
 * qu'on écrirait.
 */
const arbresParDefaut = new Map<string, string>()

export async function categorieEbay(creds: EbayCredentials, libelle: string): Promise<string | null> {
  let arbre = arbresParDefaut.get(creds.baseUrl ?? API_EBAY)
  if (!arbre) {
    const reponse = await appeler(
      creds,
      'GET',
      '/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_FR',
    )
    const json = (await reponse.json()) as { categoryTreeId?: string }
    if (!json.categoryTreeId) return null
    arbre = json.categoryTreeId
    arbresParDefaut.set(creds.baseUrl ?? API_EBAY, arbre)
  }

  const reponse = await appeler(
    creds,
    'GET',
    `/commerce/taxonomy/v1/category_tree/${arbre}/get_category_suggestions?q=${encodeURIComponent(libelle.slice(0, 80))}`,
  )
  const json = (await reponse.json().catch(() => ({}))) as {
    categorySuggestions?: Array<{ category?: { categoryId?: string } }>
  }
  return json.categorySuggestions?.[0]?.category?.categoryId ?? null
}

interface Politiques {
  fulfillmentPolicyId: string
  paymentPolicyId: string
  returnPolicyId: string
  merchantLocationKey: string
}

/**
 * Les politiques du compte, prises telles quelles.
 *
 * La première de chaque famille : un vendeur qui en a plusieurs a un réglage
 * volontaire qu'on ne devine pas — le choix fin viendra dans Réglages. Un
 * compte qui n'en a **aucune** reçoit le geste exact à faire, pas un code.
 */
async function politiquesDe(creds: EbayCredentials): Promise<Politiques> {
  const lire = async (chemin: string, champ: string): Promise<string | null> => {
    const reponse = await appeler(creds, 'GET', chemin)
    const json = (await reponse.json().catch(() => ({}))) as Record<string, Array<Record<string, string>>>
    const listes = Object.values(json).find(Array.isArray)
    return listes?.[0]?.[champ] ?? null
  }

  const [livraison, paiement, retour, emplacement] = await Promise.all([
    lire('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_FR', 'fulfillmentPolicyId'),
    lire('/sell/account/v1/payment_policy?marketplace_id=EBAY_FR', 'paymentPolicyId'),
    lire('/sell/account/v1/return_policy?marketplace_id=EBAY_FR', 'returnPolicyId'),
    lire('/sell/inventory/v1/location?limit=1', 'merchantLocationKey'),
  ])

  if (!livraison || !paiement || !retour) {
    throw new EbayRefus(
      "Votre compte eBay n'a pas ses politiques de vente (livraison, paiement, retours). Créez-les une fois dans eBay › Mon eBay professionnel › Paramètres de compte › Politiques de vente, puis relancez.",
      true,
    )
  }
  if (!emplacement) {
    throw new EbayRefus(
      "Votre compte eBay n'a aucun emplacement marchand. Créez-en un dans Seller Hub › Paramètres › Emplacements d'expédition, puis relancez.",
      true,
    )
  }

  return {
    fulfillmentPolicyId: livraison,
    paymentPolicyId: paiement,
    returnPolicyId: retour,
    merchantLocationKey: emplacement,
  }
}

export interface PublicationEbay {
  listingId: string
  externalUrl: string
  notes: string[]
}

export interface ContexteEbay {
  /** Les photos marquées, en adresses absolues — eBay les télécharge lui-même. */
  images: string[]
  /** Le libellé de catégorie du référentiel, pour la suggestion de taxonomie. */
  categorie: string | null
  /** L'identifiant eBay déjà mémorisé sur la catégorie, quand il existe. */
  categorieMemorisee?: string | null
  /** Écrit la correspondance trouvée, pour ne pas la rechercher demain. */
  memoriser?: (categoryId: string) => Promise<void>
}

/** Les caractéristiques, au format « aspects » d'eBay. */
function aspectsDe(produit: Product): Record<string, string[]> {
  const attributs =
    produit.attributes && typeof produit.attributes === 'object' && !Array.isArray(produit.attributes)
      ? (produit.attributes as Record<string, unknown>)
      : {}
  const aspects: Record<string, string[]> = {}
  for (const [cle, valeur] of Object.entries(attributs)) {
    const texte = String(valeur ?? '').trim()
    if (texte && texte.length <= 65) aspects[cle.slice(0, 40)] = [texte]
  }
  return aspects
}

export async function publierSurEbay(
  produit: Product,
  credsInitiaux: EbayCredentials,
  contexte: ContexteEbay,
): Promise<PublicationEbay> {
  return avecRenouvellement(credsInitiaux, async (creds) => {
    const notes: string[] = []

    // 0. La catégorie : mémoire d'abord, suggestion ensuite — jamais de table.
    let categoryId = contexte.categorieMemorisee ?? null
    if (!categoryId && contexte.categorie) {
      categoryId = await categorieEbay(creds, contexte.categorie)
      if (categoryId && contexte.memoriser) await contexte.memoriser(categoryId)
    }
    if (!categoryId) {
      throw new EbayRefus(
        "Aucune catégorie eBay n'a pu être trouvée pour cette annonce : choisissez une catégorie sur la fiche produit, puis relancez.",
        false,
      )
    }

    const politiques = await politiquesDe(creds)

    // 1. La fiche d'inventaire, adressée par référence produit.
    const sku = produit.id
    await appeler(creds, 'PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      product: {
        title: titleForChannel(produit, 'EBAY'),
        description: (produit.aiDescription || produit.description || '').slice(0, 4000),
        imageUrls: contexte.images.slice(0, 12),
        aspects: aspectsDe(produit),
      },
      condition: 'NEW',
      availability: {
        shipToLocationAvailability: {
          /*
           * Un stock prudent, pas la centaine du connecteur Mirakl : eBay
           * sanctionne les annulations de commande au niveau du compte, et un
           * dropshippeur ne tient pas son stock. Dix promet peu et se relève.
           */
          quantity: produit.supplierStock ?? 10,
        },
      },
    })

    // 2. L'offre : le prix, les politiques, la catégorie.
    const creation = await appeler(creds, 'POST', '/sell/inventory/v1/offer', {
      sku,
      marketplaceId: 'EBAY_FR',
      format: 'FIXED_PRICE',
      availableQuantity: produit.supplierStock ?? 10,
      categoryId,
      listingDescription: (produit.aiDescription || produit.description || '').slice(0, 4000),
      pricingSummary: { price: { value: Number(produit.sellingPrice ?? 0).toFixed(2), currency: 'EUR' } },
      listingPolicies: {
        fulfillmentPolicyId: politiques.fulfillmentPolicyId,
        paymentPolicyId: politiques.paymentPolicyId,
        returnPolicyId: politiques.returnPolicyId,
      },
      merchantLocationKey: politiques.merchantLocationKey,
    })
    const { offerId } = (await creation.json().catch(() => ({}))) as { offerId?: string }
    if (!offerId) throw new EbayRefus("eBay a accepté l'offre sans rendre d'identifiant.", false)

    // 3. La mise en ligne.
    const publication = await appeler(creds, 'POST', `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, {})
    const { listingId } = (await publication.json().catch(() => ({}))) as { listingId?: string }
    if (!listingId) {
      throw new EbayRefus('Offre créée mais mise en ligne sans identifiant : vérifiez-la dans votre Seller Hub.', false)
    }

    return { listingId, externalUrl: `https://www.ebay.fr/itm/${listingId}`, notes }
  })
}
