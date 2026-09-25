/**
 * Squarespace Commerce — la boutique du vendeur, par l'API Commerce 1.0.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - l'API est hébergée chez Squarespace (`https://api.squarespace.com/1.0/
 *   commerce/…`) ; la clé se crée dans Paramètres › Avancé › Outils de
 *   développement › Clés d'API (Products : lecture et écriture) — sur les
 *   forfaits Commerce seulement ;
 * - `Authorization: Bearer <clé>` et un `User-Agent` obligatoire, sans lequel
 *   Squarespace répond 400 ;
 * - un produit vit dans une page boutique (`storePageId`) : on prend la
 *   première (`GET /commerce/store_pages`) ;
 * - `POST /commerce/products` avec `type: PHYSICAL`, des `variants[]` portant
 *   `sku`, `pricing.basePrice` (chaîne à deux décimales + devise) et
 *   `stock.quantity` ; la réponse rend le produit avec son `id` ;
 * - les images se déposent en octets, une par appel :
 *   `POST /commerce/products/{id}/images`, multipart, champ `file` ;
 * - `sku` unique : redéposer répond 400 (`sku already in use`) ; l'API n'offre
 *   pas de recherche par référence, le refus est rendu tel quel, avec le geste.
 */
import { BoutiqueRefus, motifDe, telechargerImage, type FicheBoutique } from './boutiqueTiers.js'

export interface SquarespaceCredentials {
  apiKey: string
  apiBase: string
}

export function readSquarespaceCredentials(data: unknown): SquarespaceCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  if (!apiKey) return null
  const apiBase = typeof raw.apiBase === 'string' && /^https?:\/\//.test(raw.apiBase) ? raw.apiBase.replace(/\/+$/, '') : 'https://api.squarespace.com'
  return { apiKey, apiBase }
}

async function appeler(creds: SquarespaceCredentials, methode: string, chemin: string, corps?: unknown | FormData, fetcher: typeof fetch = fetch): Promise<Response> {
  const form = typeof FormData !== 'undefined' && corps instanceof FormData
  const r = await fetcher(`${creds.apiBase}/1.0/commerce${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined || form ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : form ? (corps as FormData) : JSON.stringify(corps),
  })
  if (r.status === 401 || r.status === 403) {
    throw new BoutiqueRefus("Squarespace refuse la clé : vérifiez la clé d'API (Paramètres › Avancé › Outils de développement › Clés d'API) avec les droits Products en écriture, sur un forfait Commerce.", true)
  }
  return r
}

async function premierePage(creds: SquarespaceCredentials, fetcher: typeof fetch): Promise<string> {
  const r = await appeler(creds, 'GET', '/store_pages', undefined, fetcher)
  const doc = r.ok ? ((await r.json()) as { storePages: Array<{ id: string; isEnabled?: boolean }> }) : null
  const page = doc?.storePages.find((p) => p.isEnabled !== false) ?? doc?.storePages[0]
  if (!page) throw new BoutiqueRefus("Le site Squarespace n'a aucune page Boutique : ajoutez-en une (Pages › Boutique) avant de publier.", true)
  return page.id
}

export interface DepotSquarespace {
  id: string
  note: string
}

export async function publierSquarespace(creds: SquarespaceCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotSquarespace> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  const storePageId = await premierePage(creds, fetcher)
  const corps = {
    type: 'PHYSICAL',
    storePageId,
    name: fiche.titre.slice(0, 200),
    description: fiche.descriptionHtml,
    urlSlug: fiche.handle,
    isVisible: true,
    variants: [
      {
        sku: fiche.sku,
        pricing: { basePrice: { currency: 'EUR', value: fiche.prix.toFixed(2) } },
        stock: { quantity: fiche.stock, unlimited: false },
        attributes: {},
      },
    ],
    ...(fiche.attributs.length ? { variantAttributes: [] } : {}),
  }
  const r = await appeler(creds, 'POST', '/products', corps, fetcher)
  if (r.status === 400) {
    const motif = await motifDe(r)
    if (/sku/i.test(motif)) {
      throw new BoutiqueRefus(`Squarespace a déjà un produit à la référence ${fiche.sku} et son API ne permet pas de le retrouver par référence : modifiez-le dans votre boutique, ou supprimez-le puis republiez.`, false)
    }
    throw new BoutiqueRefus(`Squarespace a refusé la fiche (400) — ${motif}`, false)
  }
  if (!r.ok) throw new BoutiqueRefus(`Squarespace a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)
  const { id } = (await r.json()) as { id: string }

  let photos = 0
  for (const url of fiche.images.slice(0, 10)) {
    const image = await telechargerImage(url, fetcher)
    if (!image) continue
    const form = new FormData()
    form.append('file', new Blob([Buffer.from(image.base64, 'base64')], { type: image.type }), image.nom)
    const envoi = await appeler(creds, 'POST', `/products/${id}/images`, form, fetcher)
    if (envoi.ok || envoi.status === 202) photos++
  }

  return {
    id,
    note: `Fiche publiée sur votre boutique Squarespace (produit ${id}, référence ${fiche.sku}) : ${photos} photo${photos > 1 ? 's' : ''} sur ${fiche.images.length}, dans votre première page Boutique.`,
  }
}

export async function verifierCompteSquarespace(creds: SquarespaceCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/store_pages', undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Squarespace répond ${r.status} — ${await motifDe(r)}`, true)
}
