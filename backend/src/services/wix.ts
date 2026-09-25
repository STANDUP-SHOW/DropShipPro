/**
 * Wix Stores — la boutique Wix du vendeur, par l'API REST de Wix.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - l'API est hébergée chez Wix (`https://www.wixapis.com/stores/v1/…`) ;
 *   le vendeur crée une clé d'API dans son compte (Paramètres du compte ›
 *   Clés API, permission « Wix Stores ») et relève l'identifiant du site
 *   (Paramètres du site, ou l'adresse du tableau de bord) ;
 * - en-têtes `Authorization: <clé>` (sans « Bearer ») et `wix-site-id` ;
 * - `POST /stores/v1/products` avec le produit sous `product` ; la réponse le
 *   rend sous `product` avec son `id` ;
 * - les photos s'ajoutent après coup par ADRESSE :
 *   `POST /stores/v1/products/{id}/media` avec `media[].url` ;
 * - les collections (catégories) se créent dans le tableau de bord, pas par
 *   l'API v1 : on cherche par nom (`POST /stores/v1/collections/query`) et on
 *   y ajoute le produit (`POST /stores/v1/collections/{id}/productIds`) ; une
 *   collection inconnue est dite, pas créée ;
 * - `sku` n'est pas unique chez Wix : on cherche d'abord
 *   (`POST /stores/v1/products/query`, filtre sku) et on met à jour (PATCH)
 *   pour ne pas doubler.
 */
import { BoutiqueRefus, motifDe, type FicheBoutique } from './boutiqueTiers.js'

export interface WixCredentials {
  apiKey: string
  siteId: string
  apiBase: string
}

export function readWixCredentials(data: unknown): WixCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  const siteId = typeof raw.siteId === 'string' ? raw.siteId.trim() : ''
  if (!apiKey || !/^[0-9a-f-]{20,}$/i.test(siteId)) return null
  const apiBase = typeof raw.apiBase === 'string' && /^https?:\/\//.test(raw.apiBase) ? raw.apiBase.replace(/\/+$/, '') : 'https://www.wixapis.com'
  return { apiKey, siteId, apiBase }
}

async function appeler(creds: WixCredentials, methode: string, chemin: string, corps?: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.apiBase}/stores/v1${chemin}`, {
    method: methode,
    headers: {
      Authorization: creds.apiKey,
      'wix-site-id': creds.siteId,
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  if (r.status === 401 || r.status === 403) {
    throw new BoutiqueRefus("Wix refuse la clé : vérifiez la clé d'API (Paramètres du compte › Clés API, permission Wix Stores) et l'identifiant du site.", true)
  }
  if (r.status === 428) {
    throw new BoutiqueRefus("Wix demande que l'application Wix Stores soit installée sur ce site : ajoutez « Boutique » depuis le tableau de bord du site.", true)
  }
  return r
}

async function produitExistant(creds: WixCredentials, sku: string, fetcher: typeof fetch): Promise<string | null> {
  const r = await appeler(creds, 'POST', '/products/query', { query: { filter: JSON.stringify({ sku }), paging: { limit: 1 } } }, fetcher)
  if (!r.ok) return null
  const { products } = (await r.json()) as { products: Array<{ id: string }> }
  return products[0]?.id ?? null
}

async function collectionId(creds: WixCredentials, nom: string, fetcher: typeof fetch): Promise<string | null> {
  const feuille = nom.split('>').pop()!.trim()
  if (!feuille) return null
  const r = await appeler(creds, 'POST', '/collections/query', { query: { filter: JSON.stringify({ name: feuille }), paging: { limit: 5 } } }, fetcher)
  if (!r.ok) return null
  const { collections } = (await r.json()) as { collections: Array<{ id: string; name: string }> }
  return collections.find((c) => c.name.toLowerCase() === feuille.toLowerCase())?.id ?? null
}

export interface DepotWix {
  id: string
  note: string
}

export async function publierWix(creds: WixCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotWix> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  const product = {
    name: fiche.titre.slice(0, 80),
    productType: 'physical',
    priceData: { price: Number(fiche.prix.toFixed(2)) },
    description: fiche.descriptionHtml,
    sku: fiche.sku,
    visible: true,
    manageVariants: false,
    stock: { trackInventory: true, quantity: fiche.stock },
    productOptions: [],
    ...(fiche.ean ? { brand: undefined } : {}),
  }

  const existant = await produitExistant(creds, fiche.sku, fetcher)
  const r = existant
    ? await appeler(creds, 'PATCH', `/products/${existant}`, { product }, fetcher)
    : await appeler(creds, 'POST', '/products', { product }, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Wix a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)
  const id = existant ?? ((await r.json()) as { product: { id: string } }).product.id

  let photos = 0
  if (!existant && fiche.images.length) {
    const media = await appeler(creds, 'POST', `/products/${id}/media`, { media: fiche.images.slice(0, 10).map((url) => ({ url })) }, fetcher)
    if (media.ok) photos = Math.min(fiche.images.length, 10)
  }

  let collection: string | null = null
  let collectionInconnue = ''
  if (fiche.categorie) {
    collection = await collectionId(creds, fiche.categorie, fetcher)
    if (collection) await appeler(creds, 'POST', `/collections/${collection}/productIds`, { productIds: [id] }, fetcher).catch(() => undefined)
    else collectionInconnue = fiche.categorie.split('>').pop()!.trim()
  }

  return {
    id,
    note: `Fiche ${existant ? 'mise à jour' : 'publiée'} sur votre boutique Wix (produit ${id}, référence ${fiche.sku})${
      existant ? '' : ` : ${photos} photo${photos > 1 ? 's' : ''} envoyée${photos > 1 ? 's' : ''}`
    }${collection ? ', rangée dans sa collection' : ''}.${
      collectionInconnue ? ` Aucune collection « ${collectionInconnue} » sur le site : Wix ne laisse pas en créer par l'API, créez-la dans le tableau de bord et republiez.` : ''
    }`,
  }
}

export async function verifierCompteWix(creds: WixCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'POST', '/products/query', { query: { paging: { limit: 1 } } }, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Wix répond ${r.status} — ${await motifDe(r)}`, true)
}
