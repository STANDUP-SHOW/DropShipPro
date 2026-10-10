import type { Product } from '@prisma/client'
import { enregistrerConnecteur, type ConnecteurMarche, type DepotMarche } from './marchesApi.js'
import { tauxEnEuros } from './devises.js'

/**
 * Le connecteur Wish — Merchant API v3, OAuth 2.0 « authorization code ».
 *
 * ÉCRIT D'APRÈS DES EXTRAITS DE LA DOCUMENTATION PUBLIQUE (merchant.wish.com,
 * centre d'aide marchand), JAMAIS EXÉCUTÉ CONTRE LE VRAI WISH. Ce qui est
 * sourcé : l'autorisation (`/v3/oauth/authorize`), l'échange du code
 * (`/api/v3/oauth/access_token`), le rafraîchissement
 * (`/api/v3/oauth/refresh_token`), le test (`/api/v3/oauth/test`), les champs
 * `main_image` / `extra_images` / `variations` et la sous-catégorie
 * facultative. Ce qui est DÉDUIT et à confirmer au premier essai (bac à
 * sable, WISH_SANDBOX=1) : le chemin de création `POST /api/v3/products`, la
 * forme exacte d'une variation (`price`, `inventories` par entrepôt) et la
 * liste des entrepôts (`GET /api/v3/warehouses`). Le banc (check-wish.ts)
 * écrit ce contrat en dur : il prouve la mécanique, pas la réalité.
 *
 * Variables : WISH_CLIENT_ID, WISH_CLIENT_SECRET (application déclarée dans
 * l'espace marchand, Compte › API). WISH_SANDBOX=1 bascule vers
 * sandbox.merchant.wish.com ; WISH_URL remplace l'hôte (banc). WISH_DEVISE
 * (défaut USD) : la devise du compte marchand, le prix y est converti au taux
 * BCE.
 *
 * Les frais de port et la catégorie restent ceux du compte : Wish catégorise
 * lui-même une annonce sans sous-catégorie, et le vendeur règle ses tarifs
 * d'expédition par entrepôt dans son espace.
 */

export interface WishCreds {
  accessToken: string
  accessExpires: number
  refreshToken: string
  merchantId: string
}

export class WishRefus extends Error {
  constructor(
    message: string,
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'WishRefus'
  }
}

export function hote(): string {
  const brut = process.env.WISH_URL?.trim() || (process.env.WISH_SANDBOX === '1' ? 'https://sandbox.merchant.wish.com' : 'https://merchant.wish.com')
  return brut.replace(/\/+$/, '')
}
const clientId = () => process.env.WISH_CLIENT_ID?.trim() ?? ''
const clientSecret = () => process.env.WISH_CLIENT_SECRET?.trim() ?? ''
const devise = () => (process.env.WISH_DEVISE?.trim() || 'USD').toUpperCase()

export function readWishCreds(data: unknown): WishCreds | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const accessToken = typeof r.accessToken === 'string' ? r.accessToken.trim() : ''
  const refreshToken = typeof r.refreshToken === 'string' ? r.refreshToken.trim() : ''
  const merchantId = r.merchantId == null ? '' : String(r.merchantId).trim()
  const accessExpires = Number(r.accessExpires)
  if (!accessToken || !refreshToken || !Number.isFinite(accessExpires)) return null
  return { accessToken, refreshToken, merchantId, accessExpires }
}

interface Session {
  creds: WishCreds
  tourne: boolean
}

interface ReponseJeton {
  access_token?: string
  refresh_token?: string
  /** Échéance en secondes depuis 1970, selon la doc v3. */
  expiry_time?: number
  expires_in?: number
  merchant_id?: string
}

function lireJetons(j: { data?: ReponseJeton } | null, ancien?: WishCreds): WishCreds {
  const d = j?.data
  if (!d?.access_token) throw new WishRefus("Wish a répondu sans jeton d'accès : reliez à nouveau le compte.", true)
  const fin = d.expiry_time ? Number(d.expiry_time) * 1000 : Date.now() + (Number(d.expires_in) || 30 * 86400) * 1000
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token || ancien?.refreshToken || '',
    merchantId: d.merchant_id || ancien?.merchantId || '',
    accessExpires: fin,
  }
}

async function requeteJeton(chemin: string, params: Record<string, string>, ancien?: WishCreds): Promise<WishCreds> {
  const q = new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params })
  const res = await fetch(`${hote()}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: q,
  })
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: ReponseJeton } | null
  if (!res.ok || (json && typeof json.code === 'number' && json.code !== 0)) {
    const detail = json?.message ? ` Détail : ${json.message}` : ''
    throw new WishRefus(`Wish a refusé l'autorisation (${res.status}). Si le compte était déjà relié, reliez-le à nouveau.${detail}`, true)
  }
  return lireJetons(json, ancien)
}

async function rafraichir(s: Session) {
  s.creds = await requeteJeton('/api/v3/oauth/refresh_token', { grant_type: 'refresh_token', refresh_token: s.creds.refreshToken }, s.creds)
  s.tourne = true
}

async function appel(s: Session, methode: 'GET' | 'POST', chemin: string, corps?: unknown, deuxiemeChance = true): Promise<any> {
  if (s.creds.accessExpires - Date.now() < 60_000) await rafraichir(s)
  const res = await fetch(`${hote()}/api/v3${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${s.creds.accessToken}`,
      Accept: 'application/json',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await res.text().catch(() => '')
  let json: any = null
  try {
    json = texte ? JSON.parse(texte) : null
  } catch {
    json = null
  }
  if (res.status === 401) {
    if (deuxiemeChance) {
      await rafraichir(s)
      return appel(s, methode, chemin, corps, false)
    }
    throw new WishRefus('Wish refuse la liaison (401) : reliez à nouveau votre compte Wish.', true)
  }
  if (res.status === 403) throw new WishRefus("Wish refuse l'accès (403) : le compte marchand n'est pas validé, ou n'a pas autorisé DropShipper à gérer les produits.", true)
  if (res.status === 429) throw new WishRefus('Wish limite le débit (429) : patientez une minute puis réessayez.', false)
  if (res.status >= 400 || (json && typeof json.code === 'number' && json.code !== 0)) {
    const detail = json?.message || texte.slice(0, 300)
    throw new WishRefus(`Refus Wish (${res.status})${detail ? ` — ${detail}` : ''}`, res.status >= 500)
  }
  return json?.data ?? json
}

/** Le prix dans la devise du compte marchand, deux décimales. */
export async function prixWish(produit: Product): Promise<number> {
  const base = Number(produit.sellingPrice ?? 0)
  const de = String(produit.currency ?? 'EUR').toUpperCase()
  const vers = devise()
  if (de === vers) return Math.round(base * 100) / 100
  const tDe = await tauxEnEuros(de)
  const tVers = await tauxEnEuros(vers)
  if (!tDe || !tVers) throw new WishRefus(`Conversion impossible de ${de} vers ${vers}, la devise de votre compte Wish.`, false)
  return Math.round(((base * tDe.taux) / tVers.taux) * 100) / 100
}

function listeImages(produit: Product): string[] {
  const lire = (j: unknown): string[] =>
    Array.isArray(j)
      ? j.map((x) => (typeof x === 'string' ? x : (x as { url?: string } | null)?.url ?? '')).filter((u) => /^https?:\/\//.test(u))
      : []
  const marquees = lire((produit as { exportImages?: unknown }).exportImages)
  return (marquees.length ? marquees : lire(produit.images)).slice(0, 21)
}

function texteBrut(produit: Product): string {
  return String(produit.aiDescription || produit.description || '')
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

async function deposerWish(creds: WishCreds, produit: Product): Promise<DepotMarche> {
  const s: Session = { creds: { ...creds }, tourne: false }
  const nom = String(produit.aiTitle || produit.title || '').replace(/\s+/g, ' ').trim()
  if (!nom) throw new WishRefus("L'annonce n'a pas de titre : Wish en exige un.", false)
  const images = listeImages(produit)
  if (!images.length) throw new WishRefus("Wish exige une image principale : l'annonce n'en a pas.", false)
  const prix = await prixWish(produit)
  if (prix <= 0) throw new WishRefus("L'annonce n'a pas de prix de vente : Wish en exige un.", false)

  const entrepots = await appel(s, 'GET', '/warehouses')
  const entrepot = (Array.isArray(entrepots) ? entrepots : [])[0]?.id
  if (!entrepot) {
    throw new WishRefus("Votre compte Wish n'a aucun entrepôt : créez-le dans l'espace marchand (Compte › Entrepôts), avec ses tarifs d'expédition, puis relancez.", false)
  }

  const corps = {
    name: nom.slice(0, 200),
    description: texteBrut(produit) || nom,
    main_image: { url: images[0] },
    extra_images: images.slice(1).map((url) => ({ url })),
    variations: [
      {
        sku: produit.id,
        price: { amount: prix, currency_code: devise() },
        inventories: [{ warehouse_id: String(entrepot), inventory: Math.max(1, Number(produit.supplierStock ?? 10) || 10) }],
      },
    ],
  }
  const cree = await appel(s, 'POST', '/products', corps)
  const id = cree?.id ?? null
  return {
    note: `Produit créé sur Wish au prix de ${prix.toFixed(2)} ${devise()}, entrepôt ${entrepot}. Wish le relit avant de l'afficher (quelques heures à quelques jours) et le catégorise lui-même ; les frais de port sont ceux de l'entrepôt.`,
    url: id ? `https://www.wish.com/product/${id}` : null,
    majCreds: s.tourne ? (s.creds as unknown as Record<string, unknown>) : undefined,
  }
}

export const wish: ConnecteurMarche<WishCreds> = {
  platform: 'WISH',
  label: 'Wish',
  appConfiguree: () => !!(clientId() && clientSecret()),
  manque() {
    const absents = [!clientId() && 'WISH_CLIENT_ID', !clientSecret() && 'WISH_CLIENT_SECRET'].filter(Boolean)
    return absents.length ? `Il manque ${absents.join(' et ')} dans Railway : déclarez l'application dans l'espace marchand Wish (Compte › API).` : ''
  },

  lienAutorisation(etat, redirectUri) {
    const q = new URLSearchParams({ client_id: clientId(), state: etat, redirect_uri: redirectUri })
    return `${hote()}/v3/oauth/authorize?${q.toString()}`
  },

  async finaliser(params, redirectUri) {
    if (params.error) throw new WishRefus(`Wish a refusé l'autorisation (${params.error_description || params.error}).`, true)
    if (!params.code) throw new WishRefus("Wish n'a renvoyé aucun code d'autorisation.", true)
    const creds = await requeteJeton('/api/v3/oauth/access_token', { grant_type: 'authorization_code', code: params.code, redirect_uri: redirectUri })
    const s: Session = { creds, tourne: false }
    const test = await appel(s, 'GET', '/oauth/test')
    const marchand = test?.merchant_id ?? s.creds.merchantId
    return {
      data: { ...s.creds, merchantId: marchand ? String(marchand) : '' },
      label: test?.merchant_username ? String(test.merchant_username) : marchand ? `Marchand ${marchand}` : undefined,
    }
  },

  lire: readWishCreds,

  async verifier(creds) {
    const s: Session = { creds: { ...creds }, tourne: false }
    await appel(s, 'GET', '/oauth/test')
    return s.tourne ? { majCreds: s.creds as unknown as Record<string, unknown> } : undefined
  },

  deposer: (creds, produit) => deposerWish(creds, produit),
}

enregistrerConnecteur(wish)
