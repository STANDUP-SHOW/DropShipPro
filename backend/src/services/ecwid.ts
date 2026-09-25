/**
 * Ecwid by Lightspeed — la boutique du vendeur, par l'API REST v3.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - l'API est hébergée chez Ecwid : `https://app.ecwid.com/api/v3/{storeId}/…` ;
 *   le vendeur relève son identifiant de boutique (en bas du tableau de bord)
 *   et un jeton secret (Tableau de bord › Applications › Mes applications ›
 *   Jetons d'accès, ou une application personnalisée) ;
 * - `Authorization: Bearer <jeton>`, JSON en entrée et en sortie ;
 * - `POST /products` crée la fiche et rend `{ id }` ; la photo principale se
 *   dépose ensuite par ADRESSE : `POST /products/{id}/image?externalUrl=…`,
 *   les suivantes sur `/gallery?externalUrl=…` ;
 * - les catégories sont des identifiants (`GET /categories`, puis `POST` pour
 *   créer) ;
 * - `sku` n'est pas unique chez Ecwid : on cherche d'abord (`GET /products?sku=`)
 *   et on met à jour (PUT) pour ne pas doubler.
 */
import { BoutiqueRefus, motifDe, type FicheBoutique } from './boutiqueTiers.js'

export interface EcwidCredentials {
  storeId: string
  token: string
  apiBase: string
}

export function readEcwidCredentials(data: unknown): EcwidCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const storeId = typeof raw.storeId === 'string' ? raw.storeId.trim() : typeof raw.storeId === 'number' ? String(raw.storeId) : ''
  const token = typeof raw.token === 'string' ? raw.token.trim() : ''
  if (!/^\d{4,12}$/.test(storeId) || !token) return null
  const apiBase = typeof raw.apiBase === 'string' && /^https?:\/\//.test(raw.apiBase) ? raw.apiBase.replace(/\/+$/, '') : 'https://app.ecwid.com'
  return { storeId, token, apiBase }
}

async function appeler(creds: EcwidCredentials, methode: string, chemin: string, corps?: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.apiBase}/api/v3/${creds.storeId}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  if (r.status === 401 || r.status === 403) {
    throw new BoutiqueRefus("Ecwid refuse le jeton : vérifiez le jeton secret et l'identifiant de la boutique, et que le jeton a les droits « modifier le catalogue ».", true)
  }
  if (r.status === 404 && chemin === '/profile') {
    throw new BoutiqueRefus(`Ecwid ne connaît pas la boutique ${creds.storeId} : l'identifiant est en bas du tableau de bord Ecwid.`, true)
  }
  return r
}

async function categorieId(creds: EcwidCredentials, nom: string, fetcher: typeof fetch): Promise<number | null> {
  const feuille = nom.split('>').pop()!.trim().slice(0, 100)
  if (!feuille) return null
  const r = await appeler(creds, 'GET', '/categories?limit=100', undefined, fetcher)
  if (r.ok) {
    const { items } = (await r.json()) as { items: Array<{ id: number; name: string }> }
    const exacte = items.find((c) => c.name.toLowerCase() === feuille.toLowerCase())
    if (exacte) return exacte.id
  }
  const creation = await appeler(creds, 'POST', '/categories', { name: feuille, enabled: true }, fetcher)
  if (creation.ok) return ((await creation.json()) as { id: number }).id
  return null
}

export interface DepotEcwid {
  id: number
  note: string
}

export async function publierEcwid(creds: EcwidCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotEcwid> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  const categorie = fiche.categorie ? await categorieId(creds, fiche.categorie, fetcher) : null
  const corps = {
    name: fiche.titre.slice(0, 255),
    sku: fiche.sku,
    price: Number(fiche.prix.toFixed(2)),
    description: fiche.descriptionHtml,
    enabled: true,
    quantity: fiche.stock,
    unlimited: false,
    ...(categorie ? { categoryIds: [categorie], defaultCategoryId: categorie } : {}),
    attributes: [
      ...fiche.attributs.slice(0, 20).map((a) => ({ name: a.nom, value: a.valeur, show: 'DESCR' })),
      ...(fiche.ean ? [{ name: 'UPC', value: fiche.ean, type: 'UPC', show: 'DESCR' }] : []),
    ],
    seoTitle: fiche.titre.slice(0, 70),
    seoDescription: fiche.courte.slice(0, 160),
  }

  const cherche = await appeler(creds, 'GET', `/products?sku=${encodeURIComponent(fiche.sku)}&limit=1`, undefined, fetcher)
  const existant = cherche.ok ? ((await cherche.json()) as { items: Array<{ id: number }> }).items[0] : undefined
  const r = existant ? await appeler(creds, 'PUT', `/products/${existant.id}`, corps, fetcher) : await appeler(creds, 'POST', '/products', corps, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Ecwid a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)
  const id = existant?.id ?? ((await r.json()) as { id: number }).id

  let photos = 0
  if (!existant) {
    for (const [i, url] of fiche.images.slice(0, 10).entries()) {
      const chemin = i === 0 ? `/products/${id}/image` : `/products/${id}/gallery`
      const envoi = await appeler(creds, 'POST', `${chemin}?externalUrl=${encodeURIComponent(url)}`, undefined, fetcher)
      if (envoi.ok) photos++
    }
  }

  return {
    id,
    note: `Fiche ${existant ? 'mise à jour' : 'publiée'} sur votre boutique Ecwid (produit ${id}, référence ${fiche.sku})${
      existant ? '' : ` : ${photos} photo${photos > 1 ? 's' : ''} sur ${fiche.images.length}`
    }${categorie ? ', avec sa catégorie' : ''}.`,
  }
}

export async function verifierCompteEcwid(creds: EcwidCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/profile', undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Ecwid répond ${r.status} — ${await motifDe(r)}`, true)
}
