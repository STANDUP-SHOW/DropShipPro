/**
 * PrestaShop — la boutique du vendeur, par son Webservice (XML).
 *
 * Ce que la documentation dit et que le faux serveur du banc écrit en dur :
 * - une clé de 32 caractères (Paramètres avancés › Webservice, « Activer le
 *   webservice de PrestaShop » puis une clé avec droits sur products, images,
 *   stock_availables, categories), envoyée en Basic Auth avec la clé pour nom
 *   d'utilisateur et un mot de passe vide ;
 * - `POST /api/products` avec un corps XML `<prestashop><product>…` : les
 *   champs multilingues (`name`, `description`, `link_rewrite`) portent une
 *   `<language id="1">` — la langue par défaut de la boutique ;
 * - la réponse est du XML, l'identifiant dans `<id>` ;
 * - les photos vont à `POST /api/images/products/{id}` en multipart, champ
 *   `image`, une par appel ;
 * - le stock se règle après coup sur `stock_availables` (id lu dans la fiche
 *   créée, `associations/stock_availables`).
 */
import { BoutiqueRefus, motifDe, normaliserSiteUrl, telechargerImage, type FicheBoutique } from './boutiqueTiers.js'

export interface PrestaCredentials {
  siteUrl: string
  apiKey: string
  /** L'identifiant de langue de la boutique, 1 par défaut. */
  langue: number
}

export function readPrestaCredentials(data: unknown): PrestaCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const siteUrl = normaliserSiteUrl(raw.siteUrl)
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  if (!siteUrl || !apiKey) return null
  const langue = Number(raw.langue)
  return { siteUrl, apiKey, langue: Number.isInteger(langue) && langue > 0 ? langue : 1 }
}

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function appeler(creds: PrestaCredentials, methode: string, chemin: string, corps?: string | FormData, contentType?: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const r = await fetcher(`${creds.siteUrl}/api${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.apiKey}:`).toString('base64')}`,
      'User-Agent': 'DropShipperIA',
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body: corps,
  })
  if (r.status === 401) {
    throw new BoutiqueRefus(
      "PrestaShop refuse la clé : vérifiez-la dans Paramètres avancés › Webservice, et que le webservice est activé avec les droits sur products, images, categories et stock_availables.",
      true,
    )
  }
  if (r.status === 404 && !chemin.includes('/images/')) {
    throw new BoutiqueRefus(`Le webservice PrestaShop ne répond pas à ${creds.siteUrl}/api : vérifiez l'adresse du site et que le webservice est activé.`, true)
  }
  return r
}

/** Le XML d'une fiche : la forme minimale que PrestaShop accepte à la création. */
export function xmlProduit(fiche: FicheBoutique, langue: number, categorieId: number): string {
  const ml = (balise: string, valeur: string) => `<${balise}><language id="${langue}"><![CDATA[${valeur.replace(/]]>/g, ']]]]><![CDATA[>')}]]></language></${balise}>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
<product>
<id_category_default>${categorieId}</id_category_default>
<price>${fiche.prix.toFixed(6)}</price>
<active>1</active>
<state>1</state>
<available_for_order>1</available_for_order>
<show_price>1</show_price>
<reference><![CDATA[${fiche.sku}]]></reference>
${fiche.ean && /^\d{13}$/.test(fiche.ean) ? `<ean13>${fiche.ean}</ean13>` : ''}
${ml('name', fiche.titre.slice(0, 128))}
${ml('link_rewrite', fiche.handle.slice(0, 128))}
${ml('description', fiche.descriptionHtml)}
${ml('description_short', x(fiche.courte))}
<associations><categories><category><id>${categorieId}</id></category></categories></associations>
</product>
</prestashop>`
}

function lireBalise(xml: string, balise: string): string | null {
  const m = new RegExp(`<${balise}>(?:<!\\[CDATA\\[)?([^<\\]]*)`).exec(xml)
  return m?.[1]?.trim() || null
}

export interface DepotPresta {
  id: number
  note: string
}

/**
 * Dépose la fiche, puis ses photos, puis son stock. Une photo qui échoue
 * n'annule pas la fiche : elle est comptée et dite.
 */
export async function publierPresta(creds: PrestaCredentials, fiche: FicheBoutique, fetcher: typeof fetch = fetch): Promise<DepotPresta> {
  if (!fiche.titre) throw new BoutiqueRefus("L'annonce n'a pas de titre.", false)
  if (!(fiche.prix > 0)) throw new BoutiqueRefus("L'annonce n'a pas de prix de vente.", false)

  // La catégorie par défaut de toute boutique PrestaShop est « Accueil » (2) ;
  // une catégorie nommée se cherche, sans jamais être créée à la place du vendeur.
  let categorieId = 2
  if (fiche.categorie) {
    const feuille = fiche.categorie.split('>').pop()!.trim()
    const r = await appeler(creds, 'GET', `/categories?filter[name]=${encodeURIComponent(feuille)}&display=[id]`, undefined, undefined, fetcher)
    if (r.ok) {
      const trouve = lireBalise(await r.text(), 'id')
      if (trouve && /^\d+$/.test(trouve)) categorieId = Number(trouve)
    }
  }

  const creation = await appeler(creds, 'POST', '/products', xmlProduit(fiche, creds.langue, categorieId), 'text/xml', fetcher)
  if (!creation.ok && creation.status !== 201) {
    throw new BoutiqueRefus(`PrestaShop a refusé la fiche (${creation.status}) — ${await motifDe(creation)}`, creation.status >= 500)
  }
  const xml = await creation.text()
  const id = Number(lireBalise(xml, 'id'))
  if (!id) throw new BoutiqueRefus("PrestaShop a répondu sans identifiant de produit : la fiche n'a pas été créée.", false)

  let photos = 0
  for (const url of fiche.images.slice(0, 10)) {
    const image = await telechargerImage(url, fetcher)
    if (!image) continue
    const form = new FormData()
    form.append('image', new Blob([Buffer.from(image.base64, 'base64')], { type: image.type }), image.nom)
    const r = await appeler(creds, 'POST', `/images/products/${id}`, form, undefined, fetcher)
    if (r.ok || r.status === 201) photos++
  }

  // Le stock : la ligne stock_availables créée avec la fiche, mise à la quantité voulue.
  const stockId = /<stock_availables>[\s\S]*?<id>(?:<!\[CDATA\[)?(\d+)/.exec(xml)?.[1]
  if (stockId) {
    const corps = `<?xml version="1.0" encoding="UTF-8"?><prestashop><stock_available><id>${stockId}</id><id_product>${id}</id_product><id_product_attribute>0</id_product_attribute><quantity>${fiche.stock}</quantity><depends_on_stock>0</depends_on_stock><out_of_stock>2</out_of_stock></stock_available></prestashop>`
    await appeler(creds, 'PUT', `/stock_availables/${stockId}`, corps, 'text/xml', fetcher).catch(() => undefined)
  }

  return {
    id,
    note: `Fiche publiée sur votre boutique PrestaShop (produit ${id}, référence ${fiche.sku}) : ${photos} photo${photos > 1 ? 's' : ''} sur ${fiche.images.length}${
      fiche.images.length && !photos ? " — aucune n'a été acceptée, vérifiez les droits « images » de la clé" : ''
    }.`,
  }
}

export async function verifierComptePresta(creds: PrestaCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await appeler(creds, 'GET', '/products?limit=1', undefined, undefined, fetcher)
  if (!r.ok) throw new BoutiqueRefus(`PrestaShop répond ${r.status} — ${await motifDe(r)}`, true)
}
