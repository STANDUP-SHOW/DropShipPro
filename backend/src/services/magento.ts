/**
 * Magento 2 (Adobe Commerce) — la boutique du vendeur, par son API REST.
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - un jeton d'intégration (Système › Extensions › Intégrations : créer, activer,
 *   copier l'Access Token), envoyé en `Authorization: Bearer` ;
 * - `POST /rest/V1/products` avec `{ product: {…} }` : `sku` unique, `name`,
 *   `price`, `attribute_set_id` 4 (Default), `type_id` simple, `status` 1,
 *   `visibility` 4 (catalogue et recherche) ; la description et l'`url_key`
 *   vont dans `custom_attributes` ; le stock dans
 *   `extension_attributes.stock_item` ;
 * - les photos vont dans `media_gallery_entries` en base64, la première
 *   marquée image, small_image et thumbnail ;
 * - `PUT /rest/V1/products/{sku}` met à jour une fiche existante — un dépôt
 *   rejoué ne fait pas de doublon.
 */
import { BoutiqueRefus, motifDe, normaliserSiteUrl, telechargerImage, type FicheBoutique } from './boutiqueTiers.js'

export interface MagentoCredentials {
  siteUrl: string
  token: string
}

export function readMagentoCredentials(data: unknown): MagentoCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const siteUrl = normaliserSiteUrl(raw.siteUrl)
  const token = typeof raw.token === 'string' ? raw.token.trim() : ''
  if (!siteUrl || !token) return null
  return { siteUrl, token }
}

async function appeler(creds: MagentoCredentials, methode: string, chemin: string, corps?: unknown, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.siteUrl}/rest/V1${chemin}`, {
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
    throw new BoutiqueRefus(
      "Magento refuse le jeton : vérifiez l'Access Token de l'intégration (Système › Extensions › Intégrations), activée, avec les ressources Catalogue en écriture.",
      true,
    )
  }
  if (r.status === 404 && !/\/products\/[^/]+$/.test(chemin)) {
    throw new BoutiqueRefus(`L'API REST de Magento ne répond pas à ${creds.siteUrl}/rest/V1 : vérifiez l'adresse du site.`, true)
  }
  return r
}

export interface DepotMagento {
  sku: string
  id: number | null
  note: string
}

export async function publierMagento(creds: MagentoCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotMagento> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  const galerie: unknown[] = []
  for (const [i, url] of fiche.images.slice(0, 8).entries()) {
    const image = await telechargerImage(url, fetcher)
    if (!image) continue
    galerie.push({
      media_type: 'image',
      label: fiche.titre.slice(0, 100),
      position: i + 1,
      disabled: false,
      types: i === 0 ? ['image', 'small_image', 'thumbnail'] : [],
      content: { base64_encoded_data: image.base64, type: image.type, name: image.nom },
    })
  }

  const product = {
    sku: fiche.sku,
    name: fiche.titre.slice(0, 255),
    attribute_set_id: 4,
    price: Number(fiche.prix.toFixed(2)),
    status: 1,
    visibility: 4,
    type_id: 'simple',
    weight: 1,
    extension_attributes: { stock_item: { qty: fiche.stock, is_in_stock: fiche.stock > 0, manage_stock: true } },
    custom_attributes: [
      { attribute_code: 'description', value: fiche.descriptionHtml },
      { attribute_code: 'short_description', value: fiche.courte },
      { attribute_code: 'url_key', value: fiche.handle },
      ...(fiche.ean ? [{ attribute_code: 'ean', value: fiche.ean }] : []),
    ],
    media_gallery_entries: galerie,
  }

  const existe = await appeler(creds, 'GET', `/products/${encodeURIComponent(fiche.sku)}`, undefined, fetcher)
  const r = existe.ok
    ? await appeler(creds, 'PUT', `/products/${encodeURIComponent(fiche.sku)}`, { product }, fetcher)
    : await appeler(creds, 'POST', '/products', { product }, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Magento a refusé la fiche (${r.status}) — ${await motifDe(r)}`, r.status >= 500)

  const cree = (await r.json()) as { id?: number; sku?: string }
  return {
    sku: cree.sku ?? fiche.sku,
    id: cree.id ?? null,
    note: `Fiche ${existe.ok ? 'mise à jour' : 'publiée'} sur votre boutique Magento (référence ${cree.sku ?? fiche.sku}${cree.id ? `, id ${cree.id}` : ''}), ${galerie.length} photo${galerie.length > 1 ? 's' : ''} sur ${fiche.images.length}.`,
  }
}

export async function verifierCompteMagento(creds: MagentoCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/store/storeViews', undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`Magento répond ${r.status} — ${await motifDe(r)}`, true)
}
