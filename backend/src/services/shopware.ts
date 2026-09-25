/**
 * Shopware 6 — la boutique du vendeur, par l'API d'administration.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - une intégration (Paramètres › Système › Intégrations) donne un identifiant
 *   et un secret d'accès, échangés contre un jeton porteur :
 *   `POST /api/oauth/token` avec `grant_type: client_credentials` ; le jeton
 *   vit dix minutes et se redemande ;
 * - un produit exige `name`, `productNumber`, `stock`, `taxId`, un prix par
 *   devise (`price[].currencyId`, brut et net) ; ces identifiants se lisent sur
 *   la boutique (`/api/tax`, `/api/currency`, `/api/sales-channel`) ;
 * - `POST /api/product` répond 204 sans corps : on donne nous-mêmes l'UUID
 *   (32 hexadécimaux) pour le retrouver ;
 * - une image : `POST /api/media` (avec un id à nous) puis
 *   `POST /api/_action/media/{id}/upload?extension=…&fileName=…` avec `{ url }`,
 *   Shopware la télécharge ; le produit la référence via `media` et `coverId` ;
 * - `productNumber` unique : redéposer répond 400 avec le code
 *   `CONTENT__DUPLICATE_PRODUCT_NUMBER` ; on retrouve la fiche par
 *   `POST /api/search/product` et on la met à jour (PATCH).
 */
import { createHash, randomBytes } from 'node:crypto'
import { BoutiqueRefus, motifDe, normaliserSiteUrl, type FicheBoutique } from './boutiqueTiers.js'

export interface ShopwareCredentials {
  siteUrl: string
  clientId: string
  clientSecret: string
}

export function readShopwareCredentials(data: unknown): ShopwareCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const siteUrl = normaliserSiteUrl(raw.siteUrl)
  const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : ''
  const clientSecret = typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : ''
  if (!siteUrl || !clientId || !clientSecret) return null
  return { siteUrl, clientId, clientSecret }
}

const uuid = () => randomBytes(16).toString('hex')

/** Les jetons vivent dix minutes : gardés le temps de leur vie, par boutique. */
const jetons = new Map<string, { jeton: string; expire: number }>()

/**
 * La clé du cache porte aussi le secret (haché) : un secret changé ou faux ne
 * doit jamais retrouver le jeton obtenu avec le bon — le banc l'a attrapé.
 */
const cleCache = (creds: ShopwareCredentials) => `${creds.siteUrl}|${creds.clientId}|${createHash('sha256').update(creds.clientSecret).digest('hex').slice(0, 16)}`

async function jeton(creds: ShopwareCredentials, fetcher: typeof fetch): Promise<string> {
  const cle = cleCache(creds)
  const connu = jetons.get(cle)
  if (connu && connu.expire > Date.now() + 30_000) return connu.jeton
  const r = await fetcher(`${creds.siteUrl}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'DropShipperIA' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: creds.clientId, client_secret: creds.clientSecret }),
  })
  if (r.status === 401 || r.status === 400) {
    throw new BoutiqueRefus("Shopware refuse l'intégration : vérifiez l'identifiant et le secret d'accès (Paramètres › Système › Intégrations), et que l'intégration a les droits sur les produits, médias et catégories.", true)
  }
  if (r.status === 404) throw new BoutiqueRefus(`L'API d'administration ne répond pas à ${creds.siteUrl}/api : vérifiez l'adresse de la boutique.`, true)
  if (!r.ok) throw new BoutiqueRefus(`Shopware répond ${r.status} à la demande de jeton — ${await motifDe(r)}`, true)
  const { access_token, expires_in } = (await r.json()) as { access_token: string; expires_in?: number }
  jetons.set(cle, { jeton: access_token, expire: Date.now() + (expires_in ?? 600) * 1000 })
  return access_token
}

async function appeler(creds: ShopwareCredentials, methode: string, chemin: string, corps?: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.siteUrl}/api${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${await jeton(creds, fetcher)}`,
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  if (r.status === 401) {
    jetons.delete(`${creds.siteUrl}|${creds.clientId}`)
    throw new BoutiqueRefus('Shopware a révoqué le jeton : réenregistrez l’intégration.', true)
  }
  if (r.status === 403) throw new BoutiqueRefus("L'intégration Shopware n'a pas le droit demandé : donnez-lui les droits sur les produits, médias et catégories.", true)
  return r
}

async function premier(creds: ShopwareCredentials, entite: string, fetcher: typeof fetch, filtre?: unknown): Promise<{ id: string; [k: string]: unknown } | null> {
  const r = await appeler(creds, 'POST', `/search/${entite}`, { limit: 1, ...(filtre ? { filter: [filtre] } : {}) }, fetcher)
  if (!r.ok) return null
  const { data } = (await r.json()) as { data: Array<{ id: string; [k: string]: unknown }> }
  return data[0] ?? null
}

export interface DepotShopware {
  id: string
  note: string
}

export async function publierShopware(creds: ShopwareCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotShopware> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  // Ce que la boutique impose : une taxe, une devise, un canal de vente.
  const [taxe, devise, canal] = await Promise.all([
    premier(creds, 'tax', fetcher),
    premier(creds, 'currency', fetcher, { type: 'equals', field: 'isoCode', value: 'EUR' }),
    premier(creds, 'sales-channel', fetcher),
  ])
  if (!taxe || !devise) throw new BoutiqueRefus("La boutique Shopware n'a pas de taux de TVA ou pas de devise EUR : créez-les dans Paramètres › Boutique.", true)
  const tauxTva = Number(taxe.taxRate ?? 20)

  // Un dépôt précédent ? On le retrouve par la référence.
  const existant = await premier(creds, 'product', fetcher, { type: 'equals', field: 'productNumber', value: fiche.sku })
  const id = existant?.id ?? uuid()

  // Les photos : un média par image, téléchargée par Shopware depuis l'adresse.
  const medias: string[] = []
  if (!existant) {
    for (const url of fiche.images.slice(0, 10)) {
      const mediaId = uuid()
      const creation = await appeler(creds, 'POST', '/media', { id: mediaId }, fetcher)
      if (!creation.ok && creation.status !== 204) continue
      const extension = (/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url)?.[1] ?? 'jpg').toLowerCase()
      const envoi = await appeler(creds, 'POST', `/_action/media/${mediaId}/upload?extension=${extension}&fileName=${encodeURIComponent(`${fiche.handle}-${medias.length + 1}`)}`, { url }, fetcher)
      if (envoi.ok || envoi.status === 204) medias.push(mediaId)
    }
  }

  const corps = {
    id,
    name: fiche.titre.slice(0, 255),
    productNumber: fiche.sku,
    stock: fiche.stock,
    active: true,
    taxId: taxe.id,
    description: fiche.descriptionHtml,
    ...(fiche.ean ? { ean: fiche.ean } : {}),
    price: [{ currencyId: devise.id, gross: Number(fiche.prix.toFixed(2)), net: Number((fiche.prix / (1 + tauxTva / 100)).toFixed(2)), linked: true }],
    ...(canal && !existant ? { visibilities: [{ id: uuid(), salesChannelId: canal.id, visibility: 30 }] } : {}),
    ...(medias.length ? { media: medias.map((mediaId, position) => ({ id: uuid(), mediaId, position })), coverId: undefined } : {}),
    ...(fiche.attributs.length ? { customFields: Object.fromEntries(fiche.attributs.slice(0, 20).map((a) => [a.nom, a.valeur])) } : {}),
  }
  const r = existant ? await appeler(creds, 'PATCH', `/product/${id}`, corps, fetcher) : await appeler(creds, 'POST', '/product', corps, fetcher)
  if (!r.ok && r.status !== 204) throw new BoutiqueRefus(`Shopware a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)

  return {
    id,
    note: `Fiche ${existant ? 'mise à jour' : 'publiée'} sur votre boutique Shopware (produit ${id}, référence ${fiche.sku})${
      existant ? '' : ` : ${medias.length} photo${medias.length > 1 ? 's' : ''} sur ${fiche.images.length}`
    }, TVA ${tauxTva} %${canal && !existant ? ', visible sur le premier canal de vente' : ''}.`,
  }
}

export async function verifierCompteShopware(creds: ShopwareCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/_info/version', undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Shopware répond ${r.status} — ${await motifDe(r)}`, true)
}
