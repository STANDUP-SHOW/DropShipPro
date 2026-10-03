import { createHmac } from 'node:crypto'
import type { Product } from '@prisma/client'
import { enregistrerConnecteur, type ConnecteurMarche, type DepotMarche } from './marchesApi.js'
import { identifiantCatalogue } from './mirakl.js'

/**
 * Le connecteur TikTok Shop — la Partner API, version 202309.
 *
 * **Écrit d'après la documentation publique (partner.tiktokshop.com), jamais
 * exécuté contre le vrai TikTok Shop.** Le banc (check-tiktok-shop.ts) l'éprouve
 * contre un faux serveur qui recalcule la signature en dur ; il ne prouve pas
 * la réalité. Les hypothèses incertaines sont marquées « INCERTAIN » ci-dessous.
 *
 * Le contrat tel que lu dans la doc :
 * — OAuth : le vendeur autorise depuis services.tiktokshop.com (ou la variante
 *   EU), TikTok renvoie `code` ; on l'échange sur auth.tiktok-shops.com
 *   (`/api/v2/token/get`), un GET. Le jeton d'accès vit quelques heures, le
 *   jeton de rafraîchissement renvoyé à chaque échange est à garder (majCreds).
 * — Chaque appel de l'API ouverte est signé : paramètres de requête triés
 *   (hors `sign` et `access_token`), clé+valeur concaténées, chemin devant,
 *   corps ajouté (sauf multipart), le tout encadré du secret, HMAC-SHA256 hex.
 *   Jeton dans l'en-tête `x-tts-access-token`, `shop_cipher` dans la requête.
 * — Dépôt : images en binaire (multipart) → catégorie recommandée → entrepôt de
 *   vente par défaut → POST /product/202309/products. La fiche part en revue
 *   chez TikTok : rien n'est « en ligne » à la réponse.
 */

export interface TiktokShopCreds {
  accessToken: string
  /** Secondes Unix. */
  accessExpires: number
  refreshToken: string
  refreshExpires: number
  shopCipher: string
  shopId: string
  region: string
}

const API_PAR_DEFAUT = 'https://open-api.tiktokglobalshop.com'
const AUTH_PAR_DEFAUT = 'https://auth.tiktok-shops.com'
const AUTORISER_PAR_DEFAUT = 'https://services.tiktokshop.com/open/authorize'

const apiUrl = () => (process.env.TIKTOKSHOP_API_URL?.trim() || API_PAR_DEFAUT).replace(/\/$/, '')
const authUrl = () => (process.env.TIKTOKSHOP_AUTH_URL?.trim() || AUTH_PAR_DEFAUT).replace(/\/$/, '')
const appKey = () => process.env.TIKTOKSHOP_APP_KEY?.trim() ?? ''
const appSecret = () => process.env.TIKTOKSHOP_APP_SECRET?.trim() ?? ''
const serviceId = () => process.env.TIKTOKSHOP_SERVICE_ID?.trim() ?? ''

export class TiktokShopRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand c'est la liaison (jeton, autorisation), pas cette annonce-là. */
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'TiktokShopRefus'
  }
}

/**
 * La signature 202309 :
 * 1. paramètres de requête sans `sign` ni `access_token`, triés par clé ;
 * 2. clé+valeur concaténées ; 3. le chemin en tête ; 4. le corps à la suite
 *    (sauf multipart/form-data) ; 5. le tout entouré du secret ;
 * 6. HMAC-SHA256 hexadécimal avec le secret.
 */
export function signatureTiktokShop(
  chemin: string,
  query: Record<string, string>,
  corps: string,
  secret: string,
  multipart = false,
): string {
  const params = Object.keys(query)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()
    .map((k) => `${k}${query[k]}`)
    .join('')
  const base = `${chemin}${params}${multipart ? '' : corps}`
  return createHmac('sha256', secret).update(`${secret}${base}${secret}`).digest('hex')
}

export function lireCredsTiktokShop(data: unknown): TiktokShopCreds | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  const accessToken = t(r.accessToken)
  const refreshToken = t(r.refreshToken)
  const shopCipher = t(r.shopCipher)
  if (!accessToken || !refreshToken || !shopCipher) return null
  return {
    accessToken,
    accessExpires: n(r.accessExpires),
    refreshToken,
    refreshExpires: n(r.refreshExpires),
    shopCipher,
    shopId: t(r.shopId),
    region: t(r.region),
  }
}

/** Traduit un `code` d'erreur TikTok en phrase pour le vendeur. */
function refus(code: number, message: string, http: number): TiktokShopRefus {
  const brut = (message || '').slice(0, 300)
  // INCERTAIN : les codes exacts ; on recoupe aussi sur le texte.
  const expire = [105001, 105002, 105003, 36004004, 36004005].includes(code) || /token.*(expired|invalid)|expired.*token/i.test(brut)
  if (expire || http === 401) {
    return new TiktokShopRefus(
      'TikTok Shop a refusé l’autorisation (jeton expiré ou révoqué). Reconnectez votre boutique TikTok Shop dans Réglages : l’ancienne liaison ne sert plus.',
      true,
    )
  }
  if (/permission|scope|not authorized|unauthorized/i.test(brut) || http === 403) {
    return new TiktokShopRefus(
      'TikTok Shop refuse cette action : votre autorisation ne couvre pas la gestion des produits. Reconnectez la boutique en acceptant toutes les permissions demandées.',
      true,
    )
  }
  if (/categor/i.test(brut)) {
    return new TiktokShopRefus(
      `TikTok Shop refuse la catégorie de ce produit : ${brut}. Précisez un titre plus descriptif ou publiez-le à la main depuis le Seller Center.`,
      false,
    )
  }
  if (/attribute|brand|qualification|certificat/i.test(brut)) {
    return new TiktokShopRefus(
      `TikTok Shop exige une information de plus pour cette catégorie : ${brut}. Complétez la fiche dans le Seller Center (marque, attributs ou certificats) ou choisissez une autre destination.`,
      false,
    )
  }
  if (/image/i.test(brut)) {
    return new TiktokShopRefus(`TikTok Shop refuse une image : ${brut}. Les photos doivent être en JPG, PNG, WEBP, de 5 Mo maximum.`, false)
  }
  if (http >= 500) {
    return new TiktokShopRefus(`TikTok Shop est indisponible pour le moment (${http}). Réessayez dans quelques minutes.`, true)
  }
  return new TiktokShopRefus(`Refus TikTok Shop (code ${code}${http ? `, HTTP ${http}` : ''})${brut ? ` — ${brut}` : ''}`, false)
}

interface Session {
  creds: TiktokShopCreds
  /** Renseigné dès qu'un jeton a tourné : à renvoyer en majCreds. */
  maj: Record<string, unknown> | null
}

function lireReponse(brut: string, http: number): { code: number; message: string; data: any } {
  let json: any
  try {
    json = JSON.parse(brut)
  } catch {
    throw refus(0, brut.slice(0, 200) || 'réponse illisible', http || 502)
  }
  return { code: Number(json.code ?? 0), message: String(json.message ?? ''), data: json.data }
}

function donneesJeton(data: any): Record<string, unknown> {
  return {
    accessToken: String(data?.access_token ?? ''),
    accessExpires: Number(data?.access_token_expire_in ?? 0),
    refreshToken: String(data?.refresh_token ?? ''),
    refreshExpires: Number(data?.refresh_token_expire_in ?? 0),
  }
}

async function appelerAuth(chemin: string, params: Record<string, string>) {
  const url = `${authUrl()}${chemin}?${new URLSearchParams(params).toString()}`
  const rep = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'DropShipperIA' } })
  const { code, message, data } = lireReponse(await rep.text(), rep.status)
  if (!rep.ok || code !== 0) {
    if (/refresh|auth_code|code/i.test(message) || code !== 0) {
      throw new TiktokShopRefus(
        `TikTok Shop a refusé l’échange d’autorisation (${message || `code ${code}`}). Relancez la connexion depuis Réglages.`,
        true,
      )
    }
    throw refus(code, message, rep.status)
  }
  return data
}

/** Rafraîchit le jeton quand il expire dans moins d'une minute. */
async function jetonValide(s: Session): Promise<void> {
  const maintenant = Math.floor(Date.now() / 1000)
  if (s.creds.accessExpires === 0 || s.creds.accessExpires - maintenant > 60) return
  if (s.creds.refreshExpires && s.creds.refreshExpires < maintenant) {
    throw new TiktokShopRefus('La liaison TikTok Shop a expiré. Reconnectez votre boutique dans Réglages.', true)
  }
  const data = await appelerAuth('/api/v2/token/refresh', {
    app_key: appKey(),
    app_secret: appSecret(),
    refresh_token: s.creds.refreshToken,
    grant_type: 'refresh_token',
  })
  const neuf = donneesJeton(data)
  if (!neuf.accessToken || !neuf.refreshToken) {
    throw new TiktokShopRefus('TikTok Shop n’a pas renvoyé de nouveau jeton. Reconnectez votre boutique dans Réglages.', true)
  }
  s.creds = { ...s.creds, ...(neuf as Partial<TiktokShopCreds>) } as TiktokShopCreds
  s.maj = { ...s.creds }
}

interface OptionsAppel {
  query?: Record<string, string>
  json?: unknown
  form?: FormData
  /** Faux pour les appels qui ne portent pas de boutique (liste des boutiques, upload d'image). */
  cipher?: boolean
}

async function appeler(s: Session, methode: string, chemin: string, o: OptionsAppel = {}): Promise<any> {
  await jetonValide(s)
  const query: Record<string, string> = {
    ...(o.query ?? {}),
    app_key: appKey(),
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  if (o.cipher !== false && s.creds.shopCipher) query.shop_cipher = s.creds.shopCipher
  const corps = o.json === undefined ? '' : JSON.stringify(o.json)
  query.sign = signatureTiktokShop(chemin, query, corps, appSecret(), !!o.form)

  const rep = await fetch(`${apiUrl()}${chemin}?${new URLSearchParams(query).toString()}`, {
    method: methode,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      'x-tts-access-token': s.creds.accessToken,
      ...(o.json === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: o.form ?? (o.json === undefined ? undefined : corps),
  })
  const { code, message, data } = lireReponse(await rep.text(), rep.status)
  if (!rep.ok || code !== 0) throw refus(code, message, rep.status)
  return data
}

/** Les boutiques autorisées : la première porte le `shop_cipher` de tous les appels suivants. */
async function boutiques(s: Session): Promise<Array<{ id: string; name: string; region: string; cipher: string }>> {
  const data = await appeler(s, 'GET', '/authorization/202309/shops', { cipher: false })
  const liste = Array.isArray(data?.shops) ? data.shops : []
  return liste.map((b: any) => ({ id: String(b.id ?? ''), name: String(b.name ?? ''), region: String(b.region ?? ''), cipher: String(b.cipher ?? '') }))
}

function imagesDe(produit: Product): string[] {
  const brut = (produit.exportImages ?? produit.images) as unknown
  if (!Array.isArray(brut)) return []
  return brut
    .map((i) => (typeof i === 'string' ? i : typeof i === 'object' && i && 'url' in i ? String((i as { url: unknown }).url) : ''))
    .filter((u) => /^https?:\/\//i.test(u))
}

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** La description en HTML simple (TikTok Shop accepte p, ul, li, b…). */
export function descriptionHtml(produit: Product): string {
  const texte = (produit.aiDescription || produit.description || produit.title || '').trim()
  if (/<(p|ul|ol|br|div)\b/i.test(texte)) return texte
  const paragraphes = texte.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)
  let html = paragraphes.map((p) => `<p>${echapper(p)}</p>`).join('')
  const puces = Array.isArray(produit.bulletPoints) ? (produit.bulletPoints as unknown[]).map(String).filter(Boolean) : []
  if (puces.length) html += `<ul>${puces.map((p) => `<li>${echapper(p)}</li>`).join('')}</ul>`
  return html || '<p>-</p>'
}

async function televerserImage(s: Session, url: string): Promise<string> {
  const source = await fetch(url).catch(() => null)
  if (!source || !source.ok) throw new TiktokShopRefus(`Une photo du produit est injoignable (${url}). Vérifiez qu’elle s’ouvre encore.`, false)
  const octets = Buffer.from(await source.arrayBuffer())
  if (octets.length > 5 * 1024 * 1024) {
    throw new TiktokShopRefus('Une photo dépasse 5 Mo, la limite de TikTok Shop. Remplacez-la par une version plus légère.', false)
  }
  const type = (source.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
  const form = new FormData()
  form.append('data', new Blob([octets], { type }), `image.${type.split('/')[1] || 'jpg'}`)
  form.append('use_case', 'MAIN_IMAGE')
  const data = await appeler(s, 'POST', '/product/202309/images/upload', { form, cipher: false })
  const uri = String(data?.uri ?? '')
  if (!uri) throw new TiktokShopRefus('TikTok Shop n’a pas renvoyé d’identifiant pour la photo téléversée.', false)
  return uri
}

async function categorieRecommandee(s: Session, titre: string): Promise<string> {
  const data = await appeler(s, 'POST', '/product/202309/categories/recommend', { json: { product_title: titre } })
  const id = String(data?.leaf_category_id ?? data?.categories?.find((c: any) => c?.is_leaf)?.id ?? '')
  if (!id) {
    throw new TiktokShopRefus(
      'TikTok Shop n’a trouvé aucune catégorie pour ce titre. Rendez le titre plus descriptif (type de produit en premier) ou publiez-le à la main depuis le Seller Center.',
      false,
    )
  }
  return id
}

async function entrepotVente(s: Session): Promise<string> {
  const data = await appeler(s, 'GET', '/logistics/202309/warehouses')
  const liste: any[] = Array.isArray(data?.warehouses) ? data.warehouses : []
  const ventes = liste.filter((w) => (!w.type || w.type === 'SALES_WAREHOUSE') && (!w.effect_status || w.effect_status === 'ENABLED'))
  const choisi = ventes.find((w) => w.is_default) ?? ventes[0]
  if (!choisi?.id) {
    throw new TiktokShopRefus(
      'Aucun entrepôt de vente actif chez TikTok Shop. Créez-en un dans le Seller Center (Expédition › Entrepôts) puis relancez la publication.',
      false,
    )
  }
  return String(choisi.id)
}

/** Le corps de POST /product/202309/products — exporté pour le banc. */
export function corpsProduit(produit: Product, categorieId: string, uris: string[], entrepotId: string) {
  const titre = (produit.aiTitle || produit.title || '').trim().slice(0, 255)
  const prix = Number(produit.sellingPrice ?? 0)
  const ean = identifiantCatalogue(produit)
  return {
    title: titre,
    description: descriptionHtml(produit),
    category_id: categorieId,
    main_images: uris.slice(0, 9).map((uri) => ({ uri })),
    skus: [
      {
        sales_attributes: [],
        seller_sku: produit.id,
        price: { amount: prix.toFixed(2), currency: 'EUR' },
        inventory: [{ warehouse_id: entrepotId, quantity: produit.supplierStock ?? 10 }],
        ...(ean ? { identifier_code: { code: ean.id, type: ean.type === 'UPC' ? 'UPC' : 'EAN' } } : {}),
      },
    ],
    // Valeurs par défaut : le produit ne porte pas encore son poids ni ses dimensions.
    package_weight: { value: '0.5', unit: 'KILOGRAM' },
    package_dimensions: { length: '20', width: '15', height: '10', unit: 'CENTIMETER' },
  }
}

export const tiktokShop: ConnecteurMarche<TiktokShopCreds> = {
  platform: 'TIKTOK_SHOP',
  label: 'TikTok Shop',

  appConfiguree: () => !!(appKey() && appSecret() && serviceId()),
  manque() {
    const m = [!appKey() && 'TIKTOKSHOP_APP_KEY', !appSecret() && 'TIKTOKSHOP_APP_SECRET', !serviceId() && 'TIKTOKSHOP_SERVICE_ID'].filter(Boolean)
    return m.length ? `L’application TikTok Shop n’est pas déclarée : il manque ${m.join(', ')} côté serveur.` : ''
  },

  lienAutorisation(etat) {
    const base = process.env.TIKTOKSHOP_AUTHORIZE_URL?.trim() || AUTORISER_PAR_DEFAUT
    return `${base}?${new URLSearchParams({ service_id: serviceId(), state: etat }).toString()}`
  },

  async finaliser(params) {
    const code = params.code || params.auth_code
    if (!code) throw new TiktokShopRefus('TikTok Shop n’a renvoyé aucun code d’autorisation : l’autorisation a été refusée ou interrompue.', true)
    const data = await appelerAuth('/api/v2/token/get', {
      app_key: appKey(),
      app_secret: appSecret(),
      auth_code: code,
      grant_type: 'authorized_code',
    })
    const jeton = donneesJeton(data)
    if (!jeton.accessToken) throw new TiktokShopRefus('TikTok Shop n’a pas délivré de jeton d’accès. Relancez la connexion.', true)

    const s: Session = { creds: { ...(jeton as unknown as TiktokShopCreds), shopCipher: '', shopId: '', region: '' }, maj: null }
    const liste = await boutiques(s)
    const boutique = liste.find((b) => b.cipher)
    if (!boutique) {
      throw new TiktokShopRefus('Aucune boutique TikTok Shop n’est rattachée à cette autorisation. Autorisez DropShipper en choisissant votre boutique.', true)
    }
    return {
      data: { ...jeton, shopCipher: boutique.cipher, shopId: boutique.id, region: boutique.region },
      label: boutique.name || undefined,
    }
  },

  lire: lireCredsTiktokShop,

  async verifier(creds) {
    const s: Session = { creds, maj: null }
    const liste = await boutiques(s)
    if (!liste.some((b) => b.cipher === creds.shopCipher)) {
      throw new TiktokShopRefus('Votre boutique TikTok Shop n’est plus rattachée à cette autorisation. Reconnectez-la dans Réglages.', true)
    }
    return s.maj ? { majCreds: s.maj } : undefined
  },

  async deposer(creds, produit): Promise<DepotMarche> {
    const s: Session = { creds, maj: null }
    const photos = imagesDe(produit)
    if (!photos.length) throw new TiktokShopRefus('TikTok Shop exige au moins une photo : ajoutez-en une au produit.', false)
    if (!(Number(produit.sellingPrice ?? 0) > 0)) throw new TiktokShopRefus('Le prix de vente est à zéro : fixez-le avant de publier sur TikTok Shop.', false)

    const uris: string[] = []
    for (const url of photos.slice(0, 9)) uris.push(await televerserImage(s, url))

    const titre = (produit.aiTitle || produit.title || '').trim()
    const categorie = await categorieRecommandee(s, titre)
    const entrepot = await entrepotVente(s)
    const data = await appeler(s, 'POST', '/product/202309/products', { json: corpsProduit(produit, categorie, uris, entrepot) })
    const id = String(data?.product_id ?? '') || null

    return {
      note: `En revue chez TikTok Shop${id ? ` (produit ${id})` : ''} : la fiche n’est visible qu’après validation. Catégorie choisie par TikTok d’après le titre ; poids et dimensions par défaut (0,5 kg, 20×15×10 cm), à corriger dans le Seller Center.`,
      url: null,
      ...(s.maj ? { majCreds: s.maj } : {}),
    }
  },
}

enregistrerConnecteur(tiktokShop)
