/**
 * WooCommerce — la boutique WordPress du vendeur, par son API REST (wc/v3).
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - authentification par clé et secret de consommateur (WooCommerce ›
 *   Réglages › Avancé › API REST), en Basic Auth sur HTTPS ;
 * - `POST /wp-json/wc/v3/products` crée la fiche ; les images sont données par
 *   ADRESSE (`images[].src`), WordPress va les chercher lui-même — d'où les
 *   adresses absolues ;
 * - les catégories sont des identifiants : on cherche par nom, on crée si
 *   absente, on référence ;
 * - `sku` est unique par boutique : redéposer la même annonce répond 400
 *   `product_invalid_sku` avec l'identifiant existant — on met à jour au lieu
 *   d'échouer.
 */
import { BoutiqueRefus, motifDe, normaliserSiteUrl, type FicheBoutique } from './boutiqueTiers.js'

export interface WooCredentials {
  siteUrl: string
  consumerKey: string
  consumerSecret: string
}

export function readWooCredentials(data: unknown): WooCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const siteUrl = normaliserSiteUrl(raw.siteUrl)
  const consumerKey = typeof raw.consumerKey === 'string' ? raw.consumerKey.trim() : ''
  const consumerSecret = typeof raw.consumerSecret === 'string' ? raw.consumerSecret.trim() : ''
  if (!siteUrl || !consumerKey || !consumerSecret) return null
  return { siteUrl, consumerKey, consumerSecret }
}

async function appeler(creds: WooCredentials, methode: string, chemin: string, corps?: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.siteUrl}/wp-json/wc/v3${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64')}`,
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  if (r.status === 401 || r.status === 403) {
    throw new BoutiqueRefus(
      "WooCommerce refuse la clé : vérifiez la clé et le secret de consommateur (WooCommerce › Réglages › Avancé › API REST), avec les droits en lecture/écriture, et que le site est en HTTPS.",
      true,
    )
  }
  if (r.status === 404) {
    throw new BoutiqueRefus(
      `L'API REST de WooCommerce ne répond pas à ${creds.siteUrl}/wp-json/wc/v3 : vérifiez l'adresse du site, que WooCommerce est actif et que les permaliens ne sont pas en « Simple ».`,
      true,
    )
  }
  return r
}

async function categorieId(creds: WooCredentials, nom: string, fetcher: typeof fetch): Promise<number | null> {
  const feuille = nom.split('>').pop()!.trim().slice(0, 100)
  if (!feuille) return null
  const r = await appeler(creds, 'GET', `/products/categories?search=${encodeURIComponent(feuille)}&per_page=20`, undefined, fetcher)
  if (r.ok) {
    const liste = (await r.json()) as Array<{ id: number; name: string }>
    const exacte = liste.find((c) => c.name.toLowerCase() === feuille.toLowerCase())
    if (exacte) return exacte.id
  }
  const creation = await appeler(creds, 'POST', '/products/categories', { name: feuille }, fetcher)
  if (creation.ok || creation.status === 201) return ((await creation.json()) as { id: number }).id
  // « term_exists » : la catégorie existe sous une autre casse ; l'identifiant est dans la réponse.
  const erreur = (await creation.json().catch(() => ({}))) as { code?: string; data?: { resource_id?: number } }
  return erreur.code === 'term_exists' && erreur.data?.resource_id ? erreur.data.resource_id : null
}

export interface DepotWoo {
  id: number
  lien: string | null
  note: string
}

export async function publierWoo(creds: WooCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotWoo> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  const categorie = fiche.categorie ? await categorieId(creds, fiche.categorie, fetcher) : null
  const corps = {
    name: fiche.titre,
    type: 'simple',
    status: 'publish',
    regular_price: fiche.prix.toFixed(2),
    description: fiche.descriptionHtml,
    short_description: fiche.courte,
    sku: fiche.sku,
    slug: fiche.handle,
    manage_stock: true,
    stock_quantity: fiche.stock,
    images: fiche.images.slice(0, 10).map((src, i) => ({ src, position: i })),
    ...(categorie ? { categories: [{ id: categorie }] } : {}),
    attributes: fiche.attributs.slice(0, 20).map((a, i) => ({ name: a.nom, options: [a.valeur], visible: true, variation: false, position: i })),
    ...(fiche.ean ? { global_unique_id: fiche.ean } : {}),
  }

  let r = await appeler(creds, 'POST', '/products', corps, fetcher)
  if (r.status === 400) {
    const erreur = (await r.clone().json().catch(() => ({}))) as { code?: string; data?: { resource_id?: number } }
    if (erreur.code === 'product_invalid_sku' && erreur.data?.resource_id) {
      // Déjà déposée : on met à jour la fiche existante, sans doublon.
      r = await appeler(creds, 'PUT', `/products/${erreur.data.resource_id}`, corps, fetcher)
    }
  }
  if (!r.ok && r.status !== 201) {
    throw new BoutiqueRefus(`WooCommerce a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)
  }
  const cree = (await r.json()) as { id: number; permalink?: string }
  return {
    id: cree.id,
    lien: cree.permalink ?? null,
    note: `Fiche publiée sur votre boutique WooCommerce (produit ${cree.id}, référence ${fiche.sku}), avec ${fiche.images.length} photo${fiche.images.length > 1 ? 's' : ''}${
      categorie ? ' et sa catégorie' : ''
    }.`,
  }
}

/** Un appel qui ne coûte rien et qui échoue exactement comme une publication échouerait. */
export async function verifierCompteWoo(creds: WooCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/products?per_page=1', undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`WooCommerce répond ${r.status} — ${await motifDe(r)}`, true)
}
