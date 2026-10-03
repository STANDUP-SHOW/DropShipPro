import type { Product } from '@prisma/client'
import { type ConnecteurMarche, type DepotMarche, enregistrerConnecteur } from './marchesApi.js'
import { identifiantCatalogue } from './mirakl.js'
import { cleControleValide } from './kaufland.js'

/**
 * Le connecteur Amazon — la Selling Partner API (SP-API), zone Europe,
 * place de marché France (A13V1IB3VIYZZH).
 *
 * **Écrit d'après la documentation publique, jamais exécuté contre le vrai
 * Amazon.** Le banc (check-amazon.ts) l'éprouve contre un faux serveur.
 *
 * Prérequis côté Max / vendeur : un compte vendeur **Professionnel** (le plan
 * Individuel n'a pas accès à la SP-API pour déposer des offres) et une
 * inscription développeur dans Seller Central. Une application *privée*
 * (auto-autorisée) suffit pour son propre compte ; une application publique
 * exige la revue d'Amazon. Rôle de l'application : « Product Listing ».
 *
 * Authentification : Login With Amazon (LWA). Le jeton d'accès (1 h) s'obtient
 * avec le jeton de rafraîchissement du vendeur et part dans l'en-tête
 * `x-amz-access-token`. **Pas de signature SigV4** : AWS Signature V4 n'est plus
 * exigée par la SP-API depuis octobre 2023 — le jeton LWA suffit.
 *
 * Modèle de dépôt : en dropshipping, l'offre se greffe presque toujours sur une
 * fiche catalogue qui existe déjà. On retrouve donc l'ASIN par l'EAN (Catalog
 * Items 2022-04-01), puis on dépose une offre seule (Listings Items 2021-08-01,
 * `requirements: LISTING_OFFER_ONLY`). Créer une nouvelle fiche catalogue
 * demande une marque enregistrée / des GTIN : ce n'est pas fait automatiquement.
 */

export interface AmazonCreds {
  refreshToken: string
  /** Le « Merchant Token » du vendeur (selling_partner_id), clé des URL Listings. */
  sellerId: string
  marketplaceId?: string
}

export class AmazonRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand c'est la liaison (jeton, rôle), pas cette annonce-là. */
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'AmazonRefus'
  }
}

const MARCHE_FRANCE = 'A13V1IB3VIYZZH'

const env = (nom: string) => process.env[nom]?.trim() ?? ''
const spapi = () => (env('AMAZON_SPAPI_URL') || 'https://sellingpartnerapi-eu.amazon.com').replace(/\/$/, '')
const lwa = () => (env('AMAZON_LWA_URL') || 'https://api.amazon.com').replace(/\/$/, '')
const sellerCentral = () => (env('AMAZON_SELLERCENTRAL_URL') || 'https://sellercentral.amazon.fr').replace(/\/$/, '')
const marche = (c?: { marketplaceId?: string }) => c?.marketplaceId || env('AMAZON_MARKETPLACE_ID') || MARCHE_FRANCE

export function lireAmazon(data: unknown): AmazonCreds | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const refreshToken = t(raw.refreshToken)
  const sellerId = t(raw.sellerId)
  if (!refreshToken || !sellerId) return null
  return { refreshToken, sellerId, marketplaceId: t(raw.marketplaceId) || undefined }
}

// ---- Jetons LWA ---------------------------------------------------------

const CACHE_JETONS = new Map<string, { jeton: string; expire: number }>()

/** Vide la mémoire des jetons d'accès (le banc, ou un changement de clés). */
export function oublierJetonsAmazon() {
  CACHE_JETONS.clear()
}

async function echangerLwa(corps: Record<string, string>): Promise<Record<string, unknown>> {
  const reponse = await fetch(`${lwa()}/auth/o2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      ...corps,
      client_id: env('AMAZON_LWA_CLIENT_ID'),
      client_secret: env('AMAZON_LWA_CLIENT_SECRET'),
    }).toString(),
  })
  const json = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  if (!reponse.ok) {
    const code = String(json.error ?? reponse.status)
    const invalide = code === 'invalid_grant' || code === 'invalid_client' || code === 'unauthorized_client'
    throw new AmazonRefus(
      invalide
        ? "Amazon a refusé l'autorisation (jeton expiré, révoqué, ou clés LWA de l'application fausses). Reconnectez Amazon depuis les Réglages."
        : `Amazon a refusé l'échange de jeton (${code}${json.error_description ? ` — ${String(json.error_description).slice(0, 200)}` : ''}).`,
      true,
    )
  }
  return json
}

async function jetonAcces(creds: AmazonCreds): Promise<string> {
  const en = CACHE_JETONS.get(creds.refreshToken)
  if (en && en.expire > Date.now() + 60_000) return en.jeton
  const json = await echangerLwa({ grant_type: 'refresh_token', refresh_token: creds.refreshToken })
  const jeton = typeof json.access_token === 'string' ? json.access_token : ''
  if (!jeton) throw new AmazonRefus("Amazon n'a pas rendu de jeton d'accès.", true)
  const duree = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600
  CACHE_JETONS.set(creds.refreshToken, { jeton, expire: Date.now() + duree * 1000 })
  return jeton
}

// ---- Appels SP-API ------------------------------------------------------

function messageErreur(json: unknown): string {
  const erreurs = (json as { errors?: { code?: string; message?: string }[] } | null)?.errors
  return (erreurs ?? [])
    .map((e) => [e.code, e.message].filter(Boolean).join(' : '))
    .filter(Boolean)
    .join(' ; ')
    .slice(0, 300)
}

async function appelerAmazon(creds: AmazonCreds, methode: string, chemin: string, corps?: unknown): Promise<any> {
  const jeton = await jetonAcces(creds)
  const reponse = await fetch(`${spapi()}${chemin}`, {
    method: methode,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA/1.0 (Language=TypeScript)',
      'x-amz-access-token': jeton,
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const json = await reponse.json().catch(() => null)
  if (reponse.ok) return json

  const detail = messageErreur(json)
  if (reponse.status === 401) {
    CACHE_JETONS.delete(creds.refreshToken)
    throw new AmazonRefus('Amazon refuse le jeton : reconnectez Amazon depuis les Réglages.', true)
  }
  if (reponse.status === 403) {
    throw new AmazonRefus(
      "Amazon refuse l'accès (403) : reconnectez Amazon, ou vérifiez que l'application a le rôle « Product Listing » et que le vendeur l'a autorisée avec ce rôle." +
        (detail ? ` Détail : ${detail}` : ''),
      true,
    )
  }
  if (reponse.status === 429) {
    throw new AmazonRefus('Amazon limite le débit de requêtes (429) : patientez quelques minutes avant de réessayer.', false)
  }
  throw new AmazonRefus(`Refus Amazon (${reponse.status})${detail ? ` — ${detail}` : ''}`, reponse.status >= 500)
}

// ---- Autorisation -------------------------------------------------------

export function lienAutorisationAmazon(etat: string, redirectUri: string): string {
  const q = new URLSearchParams({
    application_id: env('AMAZON_SPAPI_APP_ID'),
    state: etat,
    redirect_uri: redirectUri,
  })
  // Application encore en brouillon : Amazon n'ouvre le consentement qu'en bêta.
  if (env('AMAZON_SPAPI_BETA') === '1') q.set('version', 'beta')
  return `${sellerCentral()}/apps/authorize/consent?${q.toString()}`
}

/**
 * Application privée auto-autorisée : le vendeur colle le jeton de
 * rafraîchissement affiché par Seller Central (« Autoriser l'application ») et
 * son identifiant vendeur. Le jeton est essayé tout de suite : un jeton faux
 * ne doit pas être enregistré comme « connecté ».
 */
export async function finaliserJetonManuel(
  refreshToken: string,
  sellerId: string,
): Promise<{ data: Record<string, unknown>; label: string }> {
  const rt = refreshToken.trim()
  const vendeur = sellerId.trim()
  if (!rt) throw new AmazonRefus("Collez le jeton de rafraîchissement affiché par Seller Central (« Autoriser l'application »).", true)
  if (!vendeur) throw new AmazonRefus("Indiquez votre identifiant vendeur Amazon (Seller ID, dans Seller Central › Paramètres › Informations sur le compte).", true)
  await jetonAcces({ refreshToken: rt, sellerId: vendeur })
  return { data: { refreshToken: rt, sellerId: vendeur }, label: `Amazon ${vendeur}` }
}

async function finaliserAmazon(params: Record<string, string>) {
  if (params.refreshToken) return finaliserJetonManuel(params.refreshToken, params.sellerId ?? params.selling_partner_id ?? '')
  const code = params.spapi_oauth_code
  const vendeur = params.selling_partner_id
  if (!code || !vendeur) {
    throw new AmazonRefus("Amazon n'a pas renvoyé le code d'autorisation : recommencez la connexion depuis les Réglages.", true)
  }
  const json = await echangerLwa({ grant_type: 'authorization_code', code })
  const refreshToken = typeof json.refresh_token === 'string' ? json.refresh_token : ''
  if (!refreshToken) throw new AmazonRefus("Amazon n'a pas rendu de jeton de rafraîchissement.", true)
  return { data: { refreshToken, sellerId: vendeur }, label: `Amazon ${vendeur}` }
}

// ---- Vérification et dépôt ---------------------------------------------

async function verifierAmazon(creds: AmazonCreds): Promise<void> {
  const json = await appelerAmazon(creds, 'GET', '/sellers/v1/marketplaceParticipations')
  const liste = (json?.payload ?? []) as { marketplace?: { id?: string }; participation?: { isSuspended?: boolean } }[]
  const voulu = marche(creds)
  const trouve = liste.find((p) => p.marketplace?.id === voulu)
  if (!trouve) {
    throw new AmazonRefus(
      "Ce compte vendeur Amazon ne vend pas sur Amazon.fr : activez la France dans Seller Central (Paramètres › Informations sur le compte › Places de marché) puis reconnectez.",
      true,
    )
  }
  if (trouve.participation?.isSuspended) {
    throw new AmazonRefus("Votre participation à Amazon.fr est suspendue : réglez-le dans Seller Central.", true)
  }
}

/** SKU stable : le même produit retombe sur la même offre, et les ventes reviennent avec. */
export function skuAmazon(produit: Product): string {
  return `DSP-${produit.id}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
}

async function deposerAmazon(creds: AmazonCreds, produit: Product, _categorie: string): Promise<DepotMarche> {
  const identifiant = identifiantCatalogue(produit)
  if (!identifiant || !cleControleValide(identifiant.id)) {
    throw new AmazonRefus(
      `Amazon rattache chaque offre à une fiche existante par son EAN : ${
        identifiant ? `l'EAN « ${identifiant.id} » a une clé de contrôle fausse` : "cette annonce n'a pas d'EAN"
      }. Renseignez un EAN valide dans les caractéristiques (champ « EAN »), ou choisissez une autre destination.`,
      false,
    )
  }
  const prix = Number(produit.sellingPrice ?? 0)
  if (!(prix > 0)) throw new AmazonRefus("Cette annonce n'a pas de prix de vente : Amazon ne dépose pas d'offre sans prix.", false)

  const mp = marche(creds)

  const q = new URLSearchParams({
    identifiers: identifiant.id,
    identifiersType: identifiant.id.length === 12 ? 'UPC' : 'EAN',
    marketplaceIds: mp,
    includedData: 'summaries,productTypes',
  })
  const catalogue = await appelerAmazon(creds, 'GET', `/catalog/2022-04-01/items?${q.toString()}`)
  const item = (catalogue?.items ?? [])[0] as
    | { asin?: string; productTypes?: { marketplaceId?: string; productType?: string }[] }
    | undefined
  const asin = item?.asin
  if (!asin) {
    throw new AmazonRefus(
      `Aucune fiche Amazon.fr n'existe pour l'EAN ${identifiant.id}. Créer une nouvelle fiche catalogue demande une marque enregistrée (Brand Registry) ou des GTIN dont vous êtes propriétaire : DropShipper ne le fait pas automatiquement.`,
      false,
    )
  }
  const productType = (item?.productTypes ?? []).find((p) => p.marketplaceId === mp)?.productType ?? item?.productTypes?.[0]?.productType ?? 'PRODUCT'

  const sku = skuAmazon(produit)
  const stock = produit.supplierStock ?? 10
  const corps = {
    productType,
    requirements: 'LISTING_OFFER_ONLY',
    attributes: {
      condition_type: [{ value: 'new_new', marketplace_id: mp }],
      merchant_suggested_asin: [{ value: asin, marketplace_id: mp }],
      purchasable_offer: [
        {
          marketplace_id: mp,
          currency: 'EUR',
          our_price: [{ schedule: [{ value_with_tax: Math.round(prix * 100) / 100 }] }],
        },
      ],
      fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity: stock }],
    },
  }
  const sp = new URLSearchParams({ marketplaceIds: mp, issueLocale: 'fr_FR' })
  const reponse = await appelerAmazon(
    creds,
    'PUT',
    `/listings/2021-08-01/items/${encodeURIComponent(creds.sellerId)}/${encodeURIComponent(sku)}?${sp.toString()}`,
    corps,
  )

  const problemes = (reponse?.issues ?? []) as { severity?: string; message?: string; code?: string }[]
  const erreurs = problemes.filter((i) => String(i.severity).toUpperCase() === 'ERROR')
  if (reponse?.status !== 'ACCEPTED' || erreurs.length) {
    const textes = erreurs.map((i) => i.message ?? i.code).filter(Boolean).join(' ; ')
    throw new AmazonRefus(`Amazon a refusé l'offre${textes ? ` : ${textes.slice(0, 400)}` : ` (statut ${reponse?.status ?? 'inconnu'})`}.`, false)
  }
  const avertissements = problemes.filter((i) => String(i.severity).toUpperCase() !== 'ERROR').length
  return {
    note: `Offre déposée sur la fiche ${asin} (SKU ${sku}, ${productType}). Amazon peut mettre quelques minutes à l'activer${
      avertissements ? ` — ${avertissements} avertissement(s) dans Seller Central` : ''
    }.`,
    url: `https://www.amazon.fr/dp/${asin}`,
  }
}

export const amazon: ConnecteurMarche<AmazonCreds> = {
  platform: 'AMAZON',
  label: 'Amazon',
  appConfiguree: () => !!(env('AMAZON_LWA_CLIENT_ID') && env('AMAZON_LWA_CLIENT_SECRET') && env('AMAZON_SPAPI_APP_ID')),
  manque: () => {
    const m = ['AMAZON_LWA_CLIENT_ID', 'AMAZON_LWA_CLIENT_SECRET', 'AMAZON_SPAPI_APP_ID'].filter((n) => !env(n))
    return m.length ? `Variables Railway manquantes : ${m.join(', ')}.` : ''
  },
  lienAutorisation: lienAutorisationAmazon,
  finaliser: (params) => finaliserAmazon(params),
  lire: lireAmazon,
  verifier: verifierAmazon,
  deposer: deposerAmazon,
}

enregistrerConnecteur(amazon)
