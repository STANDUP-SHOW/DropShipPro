/**
 * BigCommerce — la boutique du vendeur, par l'API REST Catalog V3.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - l'API est hébergée chez BigCommerce : `https://api.bigcommerce.com/stores/
 *   {store_hash}/v3/…`, jamais sur le domaine de la boutique ; le vendeur crée
 *   un compte API (Paramètres › Comptes API › Créer un jeton d'API v2/v3) avec
 *   les droits Produits en modification, et obtient un Access Token et le
 *   store hash ;
 * - `X-Auth-Token` en en-tête, JSON en entrée et en sortie, données sous `data` ;
 * - `POST /catalog/products` exige `name`, `type`, `weight` et `price` ; les
 *   images sont données par ADRESSE (`images[].image_url`) ;
 * - les catégories sont des identifiants (`GET /catalog/categories?name=`, puis
 *   `POST` pour créer) ;
 * - `sku` unique : redéposer répond 409 ; on retrouve la fiche par
 *   `GET /catalog/products?sku=` et on la met à jour (PUT).
 *
 * Le poids est obligatoire chez BigCommerce et nos annonces ne le portent pas :
 * 1 (dans l'unité de poids de la boutique), à corriger dans la boutique.
 */
import { BoutiqueRefus, motifDe, type FicheBoutique } from './boutiqueTiers.js'

export interface BigCommerceCredentials {
  storeHash: string
  accessToken: string
  /** L'adresse de l'API ; celle de BigCommerce sauf au banc. */
  apiBase: string
}

export function readBigCommerceCredentials(data: unknown): BigCommerceCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const storeHash = typeof raw.storeHash === 'string' ? raw.storeHash.trim().replace(/^stores\//, '') : ''
  const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : ''
  if (!/^[a-z0-9]{6,20}$/i.test(storeHash) || !accessToken) return null
  const apiBase = typeof raw.apiBase === 'string' && /^https?:\/\//.test(raw.apiBase) ? raw.apiBase.replace(/\/+$/, '') : 'https://api.bigcommerce.com'
  return { storeHash, accessToken, apiBase }
}

async function appeler(creds: BigCommerceCredentials, methode: string, chemin: string, corps?: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.apiBase}/stores/${creds.storeHash}/v3${chemin}`, {
    method: methode,
    headers: {
      'X-Auth-Token': creds.accessToken,
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  if (r.status === 401 || r.status === 403) {
    throw new BoutiqueRefus("BigCommerce refuse le jeton : vérifiez l'Access Token et le store hash (Paramètres › Comptes API), et que le compte API a le droit « Produits : modifier ».", true)
  }
  if (r.status === 404 && chemin === '/catalog/summary') {
    throw new BoutiqueRefus(`BigCommerce ne connaît pas la boutique « ${creds.storeHash} » : le store hash est celui de l'adresse de votre back-office (store-XXXX.mybigcommerce.com).`, true)
  }
  return r
}

async function categorieId(creds: BigCommerceCredentials, nom: string, fetcher: typeof fetch): Promise<number | null> {
  const feuille = nom.split('>').pop()!.trim().slice(0, 50)
  if (!feuille) return null
  const r = await appeler(creds, 'GET', `/catalog/categories?name=${encodeURIComponent(feuille)}&limit=20`, undefined, fetcher)
  if (r.ok) {
    const { data } = (await r.json()) as { data: Array<{ id: number; name: string }> }
    const exacte = data.find((c) => c.name.toLowerCase() === feuille.toLowerCase())
    if (exacte) return exacte.id
  }
  const creation = await appeler(creds, 'POST', '/catalog/categories', { name: feuille, parent_id: 0, is_visible: true }, fetcher)
  if (creation.ok) return ((await creation.json()) as { data: { id: number } }).data.id
  return null
}

export interface DepotBigCommerce {
  id: number
  note: string
}

export async function publierBigCommerce(creds: BigCommerceCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotBigCommerce> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  const categorie = fiche.categorie ? await categorieId(creds, fiche.categorie, fetcher) : null
  const corps = {
    name: fiche.titre.slice(0, 250),
    type: 'physical',
    sku: fiche.sku,
    price: Number(fiche.prix.toFixed(2)),
    weight: 1,
    description: fiche.descriptionHtml,
    is_visible: true,
    inventory_tracking: 'product',
    inventory_level: fiche.stock,
    availability: 'available',
    images: fiche.images.slice(0, 10).map((image_url, i) => ({ image_url, is_thumbnail: i === 0, sort_order: i })),
    ...(categorie ? { categories: [categorie] } : {}),
    ...(fiche.ean ? { gtin: fiche.ean } : {}),
    custom_url: { url: `/${fiche.handle}/`, is_customized: true },
  }

  let r = await appeler(creds, 'POST', '/catalog/products', corps, fetcher)
  let misAJour = false
  if (r.status === 409) {
    const cherche = await appeler(creds, 'GET', `/catalog/products?sku=${encodeURIComponent(fiche.sku)}`, undefined, fetcher)
    const existant = cherche.ok ? ((await cherche.json()) as { data: Array<{ id: number }> }).data[0] : undefined
    if (existant) {
      const { custom_url: _url, ...sansUrl } = corps
      r = await appeler(creds, 'PUT', `/catalog/products/${existant.id}`, sansUrl, fetcher)
      misAJour = true
    }
  }
  if (!r.ok) throw new BoutiqueRefus(`BigCommerce a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)
  const { data } = (await r.json()) as { data: { id: number } }
  return {
    id: data.id,
    note: `Fiche ${misAJour ? 'mise à jour' : 'publiée'} sur votre boutique BigCommerce (produit ${data.id}, référence ${fiche.sku}), avec ${fiche.images.length} photo${
      fiche.images.length > 1 ? 's' : ''
    }${categorie ? ' et sa catégorie' : ''}. Poids posé à 1 : à corriger dans la boutique si vous vendez au poids.`,
  }
}

export async function verifierCompteBigCommerce(creds: BigCommerceCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/catalog/summary', undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`BigCommerce répond ${r.status} — ${await motifDe(r)}`, true)
}
