/**
 * Drupal Commerce — la boutique Drupal du vendeur, par JSON:API (module du
 * cœur de Drupal, activé en un clic) et le module Basic Auth.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - authentification HTTP Basic (module `basic_auth`) avec un compte Drupal
 *   dédié qui a le droit d'administrer les produits ; Content-Type et Accept
 *   `application/vnd.api+json`, sinon Drupal répond 415 ;
 * - un produit Commerce est DEUX entités : `commerce_product` (titre, corps,
 *   boutiques) et `commerce_product_variation` (référence, prix, stock) ; la
 *   variation se crée d'abord, le produit la référence ;
 * - la boutique (`commerce_store`) est obligatoire sur le produit : on prend la
 *   première (`GET /jsonapi/commerce_store/online`) ;
 * - les identifiants JSON:API sont des UUID, portés dans `data.id` ;
 * - une image se dépose en octets sur le champ de la variation
 *   (`POST /jsonapi/commerce_product_variation/default/{uuid}/field_image`,
 *   Content-Type application/octet-stream, Content-Disposition file) ;
 * - la référence (`sku`) est unique : redéposer répond 422 ; on cherche alors
 *   la variation par `filter[sku]` et on la met à jour (PATCH).
 *
 * Les types de produit et de variation sont `default` (ceux qu'installe
 * Commerce) ; un vendeur qui en a créé d'autres les indique.
 */
import { BoutiqueRefus, motifDe, normaliserSiteUrl, telechargerImage, type FicheBoutique } from './boutiqueTiers.js'

export interface DrupalCredentials {
  siteUrl: string
  identifiant: string
  motDePasse: string
  /** Le type de produit et de variation : `default` sauf indication. */
  type: string
}

export function readDrupalCredentials(data: unknown): DrupalCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const siteUrl = normaliserSiteUrl(raw.siteUrl)
  const identifiant = typeof raw.identifiant === 'string' ? raw.identifiant.trim() : ''
  const motDePasse = typeof raw.motDePasse === 'string' ? raw.motDePasse : ''
  if (!siteUrl || !identifiant || !motDePasse) return null
  const type = typeof raw.type === 'string' && /^[a-z0-9_]+$/.test(raw.type.trim()) ? raw.type.trim() : 'default'
  return { siteUrl, identifiant, motDePasse, type }
}

const JSONAPI = 'application/vnd.api+json'

async function appeler(
  creds: DrupalCredentials,
  methode: string,
  chemin: string,
  corps?: unknown,
  entetes: Record<string, string> = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const brut = corps instanceof Buffer
  const r = await fetcher(`${creds.siteUrl}/jsonapi${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.identifiant}:${creds.motDePasse}`).toString('base64')}`,
      Accept: JSONAPI,
      'User-Agent': 'DropShipperIA',
      ...(corps === undefined ? {} : { 'Content-Type': brut ? 'application/octet-stream' : JSONAPI }),
      ...entetes,
    },
    body: corps === undefined ? undefined : brut ? corps : JSON.stringify(corps),
  })
  if (r.status === 401 || r.status === 403) {
    throw new BoutiqueRefus(
      "Drupal refuse l'accès : vérifiez l'identifiant et le mot de passe du compte dédié, que le module Basic Auth est activé, et que ce compte a le droit d'administrer les produits Commerce.",
      true,
    )
  }
  if (r.status === 404 && !chemin.includes('field_image')) {
    throw new BoutiqueRefus(`JSON:API ne répond pas à ${creds.siteUrl}/jsonapi : vérifiez l'adresse du site et que le module JSON:API est activé.`, true)
  }
  return r
}

type Doc = { data?: { id?: string; attributes?: Record<string, unknown> } | Array<{ id: string; attributes?: Record<string, unknown> }> }

async function premiereBoutique(creds: DrupalCredentials, fetcher: typeof fetch): Promise<string> {
  const r = await appeler(creds, 'GET', '/commerce_store/online?page[limit]=1', undefined, {}, fetcher)
  const doc = r.ok ? ((await r.json()) as Doc) : null
  const id = Array.isArray(doc?.data) ? doc!.data[0]?.id : undefined
  if (!id) throw new BoutiqueRefus("Aucune boutique Commerce (commerce_store) n'existe sur ce site : créez-en une dans Commerce › Configuration › Boutiques.", true)
  return id
}

export interface DepotDrupal {
  id: string
  note: string
}

export async function publierDrupal(creds: DrupalCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotDrupal> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)
  const t = creds.type

  const boutique = await premiereBoutique(creds, fetcher)

  // La variation d'abord : c'est elle qui porte la référence, le prix et le stock.
  const variation = {
    data: {
      type: `commerce_product_variation--${t}`,
      attributes: { sku: fiche.sku, title: fiche.titre.slice(0, 255), status: true, price: { number: fiche.prix.toFixed(2), currency_code: 'EUR' } },
    },
  }
  let r = await appeler(creds, 'POST', `/commerce_product_variation/${t}`, variation, {}, fetcher)
  let variationId: string | undefined
  let misAJour = false
  if (r.status === 422) {
    // Référence déjà déposée : on retrouve la variation et on la met à jour.
    const cherche = await appeler(creds, 'GET', `/commerce_product_variation/${t}?filter[sku]=${encodeURIComponent(fiche.sku)}`, undefined, {}, fetcher)
    const doc = cherche.ok ? ((await cherche.json()) as Doc) : null
    variationId = Array.isArray(doc?.data) ? doc!.data[0]?.id : undefined
    if (variationId) {
      r = await appeler(creds, 'PATCH', `/commerce_product_variation/${t}/${variationId}`, { data: { ...variation.data, id: variationId } }, {}, fetcher)
      misAJour = true
    }
  }
  if (!r.ok && r.status !== 201) throw new BoutiqueRefus(`Drupal a refusé la variation (${r.status}) — ${await motifDe(r)}`, r.status >= 500)
  if (!variationId) variationId = ((await r.json()) as Doc & { data: { id: string } }).data.id

  let photos = 0
  for (const url of fiche.images.slice(0, 10)) {
    const image = await telechargerImage(url, fetcher)
    if (!image) continue
    const depot = await appeler(
      creds,
      'POST',
      `/commerce_product_variation/${t}/${variationId}/field_image`,
      Buffer.from(image.base64, 'base64'),
      { 'Content-Disposition': `file; filename="${image.nom.replace(/"/g, '')}"` },
      fetcher,
    )
    if (depot.ok || depot.status === 201) photos++
  }

  // Le produit, qui référence la boutique et la variation.
  const produit = {
    data: {
      type: `commerce_product--${t}`,
      attributes: { title: fiche.titre.slice(0, 255), status: true, body: { value: fiche.descriptionHtml, format: 'basic_html', summary: fiche.courte } },
      relationships: {
        stores: { data: [{ type: 'commerce_store--online', id: boutique }] },
        variations: { data: [{ type: `commerce_product_variation--${t}`, id: variationId }] },
      },
    },
  }
  let produitId: string | undefined
  if (misAJour) {
    const cherche = await appeler(creds, 'GET', `/commerce_product/${t}?filter[variations.sku]=${encodeURIComponent(fiche.sku)}`, undefined, {}, fetcher)
    const doc = cherche.ok ? ((await cherche.json()) as Doc) : null
    produitId = Array.isArray(doc?.data) ? doc!.data[0]?.id : undefined
  }
  const rp = produitId
    ? await appeler(creds, 'PATCH', `/commerce_product/${t}/${produitId}`, { data: { ...produit.data, id: produitId } }, {}, fetcher)
    : await appeler(creds, 'POST', `/commerce_product/${t}`, produit, {}, fetcher)
  if (!rp.ok && rp.status !== 201) throw new BoutiqueRefus(`Drupal a refusé le produit (${rp.status}) — ${await motifDe(rp)}`, rp.status >= 500)
  if (!produitId) produitId = ((await rp.json()) as Doc & { data: { id: string } }).data.id

  return {
    id: produitId,
    note: `Fiche ${misAJour ? 'mise à jour' : 'publiée'} sur votre boutique Drupal Commerce (produit ${produitId}, référence ${fiche.sku}) : ${photos} photo${photos > 1 ? 's' : ''} sur ${fiche.images.length}. Le stock n'est pas envoyé : Drupal Commerce ne le gère qu'avec le module Commerce Stock.`,
  }
}

export async function verifierCompteDrupal(creds: DrupalCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', `/commerce_product/${creds.type}?page[limit]=1`, undefined, {}, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Drupal répond ${r.status} — ${await motifDe(r)}`, true)
}
