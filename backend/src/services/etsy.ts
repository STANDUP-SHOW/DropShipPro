import { createHmac, createHash } from 'crypto'
import type { Product } from '@prisma/client'
import { enregistrerConnecteur, type ConnecteurMarche, type DepotMarche } from './marchesApi.js'
import { tauxEnEuros } from './devises.js'

/**
 * Le connecteur Etsy — Open API v3, OAuth 2.0 « authorization code » + PKCE.
 *
 * ÉCRIT D'APRÈS LA DOCUMENTATION PUBLIQUE (developers.etsy.com), JAMAIS
 * EXÉCUTÉ CONTRE LE VRAI ETSY. Le banc (check-etsy.ts) l'éprouve contre un
 * faux serveur dont le contrat est écrit en dur : il prouve la mécanique, pas
 * la réalité.
 *
 * Ce que dit la doc et que ce code suit : PKCE obligatoire ; en-tête
 * `x-api-key` sous la forme « keystring:secret partagé » ; jeton d'accès d'une
 * heure, jeton de rafraîchissement de 90 jours ; createDraftListing exige
 * quantity, title, description, price, who_made, when_made, taxonomy_id, et
 * pour un objet physique un shipping_profile_id et un readiness_state_id (le
 * « profil de préparation » apparu en 2025). Nous ne créons ni profil
 * d'expédition ni profil de préparation à la place du vendeur : nous prenons
 * le premier de chaque, et sans eux la publication dit quoi créer.
 *
 * L'annonce part en BROUILLON. L'activer coûte 0,20 $ de frais de mise en
 * vente au vendeur et l'expose au règlement d'Etsy sur la revente (voir
 * l'avertissement de platforms.ts) : c'est à lui de cliquer « Publier ».
 *
 * PKCE sans stockage : le code_verifier est dérivé du `state` signé par
 * JWT_SECRET. Le retour d'autorisation le recalcule à l'identique, et personne
 * qui ne connaît pas le secret ne peut le reproduire.
 *
 * Variables : ETSY_API_KEY (keystring) et ETSY_SHARED_SECRET, lus sur
 * etsy.com/developers/your-apps. ETSY_API_URL / ETSY_AUTH_URL pour le banc.
 * ETSY_WHEN_MADE (défaut 2020_2025) : la tranche « fabriqué en » demandée par
 * Etsy, dont la liste de valeurs change avec les années.
 */

export interface EtsyCreds {
  accessToken: string
  accessExpires: number
  refreshToken: string
  shopId: string
}

export class EtsyRefus extends Error {
  constructor(
    message: string,
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'EtsyRefus'
  }
}

const sansBarre = (u: string) => u.replace(/\/+$/, '')
export const hoteApi = () => sansBarre(process.env.ETSY_API_URL?.trim() || 'https://api.etsy.com')
export const hoteAuth = () => sansBarre(process.env.ETSY_AUTH_URL?.trim() || 'https://www.etsy.com')
const cle = () => process.env.ETSY_API_KEY?.trim() ?? ''
const secretPartage = () => process.env.ETSY_SHARED_SECRET?.trim() ?? ''
const enteteCle = () => `${cle()}:${secretPartage()}`

export const PORTEES = 'listings_r listings_w shops_r'

/** Le code_verifier PKCE d'une autorisation, recalculable depuis son `state`. */
export function verificateurPkce(etat: string): string {
  const s = process.env.JWT_SECRET?.trim()
  if (!s) throw new Error('JWT_SECRET manque : impossible de signer une autorisation.')
  return createHmac('sha256', s).update(`etsy-pkce:${etat}`).digest('base64url')
}

export function defiPkce(verificateur: string): string {
  return createHash('sha256').update(verificateur).digest('base64url')
}

export function readEtsyCreds(data: unknown): EtsyCreds | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const accessToken = typeof r.accessToken === 'string' ? r.accessToken.trim() : ''
  const refreshToken = typeof r.refreshToken === 'string' ? r.refreshToken.trim() : ''
  const shopId = r.shopId == null ? '' : String(r.shopId).trim()
  const accessExpires = Number(r.accessExpires)
  if (!accessToken || !refreshToken || !shopId || !Number.isFinite(accessExpires)) return null
  return { accessToken, refreshToken, shopId, accessExpires }
}

interface Session {
  creds: Omit<EtsyCreds, 'shopId'> & { shopId?: string }
  tourne: boolean
}

async function jetons(corps: URLSearchParams): Promise<Session['creds']> {
  const res = await fetch(`${hoteApi()}/v3/public/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: corps,
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new EtsyRefus(
      res.status === 400 || res.status === 401
        ? `Etsy a refusé l'autorisation (${res.status}). Si le compte était déjà relié, le jeton a expiré (90 jours sans usage) : reliez à nouveau Etsy.${detail ? ` Détail : ${detail}` : ''}`
        : `Etsy ne répond pas comme prévu au jeton (${res.status}).`,
      true,
    )
  }
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!j.access_token || !j.refresh_token) throw new EtsyRefus("Etsy a répondu sans jeton d'accès : reliez à nouveau le compte.", true)
  return { accessToken: j.access_token, refreshToken: j.refresh_token, accessExpires: Date.now() + (Number(j.expires_in) || 3600) * 1000 }
}

async function rafraichir(s: Session) {
  const neuf = await jetons(new URLSearchParams({ grant_type: 'refresh_token', client_id: cle(), refresh_token: s.creds.refreshToken }))
  s.creds = { ...s.creds, ...neuf }
  s.tourne = true
}

async function appel(s: Session, methode: 'GET' | 'POST', chemin: string, corps?: URLSearchParams | FormData, deuxiemeChance = true): Promise<any> {
  if (s.creds.accessExpires - Date.now() < 60_000) await rafraichir(s)
  const res = await fetch(`${hoteApi()}/v3/application${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${s.creds.accessToken}`, 'x-api-key': enteteCle(), Accept: 'application/json' },
    body: corps,
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
    throw new EtsyRefus('Etsy refuse la liaison (401) : reliez à nouveau votre compte Etsy.', true)
  }
  if (res.status === 403) {
    throw new EtsyRefus(
      `Etsy refuse l'accès (403)${json?.error ? ` — ${json.error}` : ''}. L'application DropShipper n'a peut-être pas encore l'accès commercial d'Etsy, ou l'autorisation ne couvre pas la gestion des annonces : reliez à nouveau le compte.`,
      true,
    )
  }
  if (res.status === 429) throw new EtsyRefus('Etsy limite le débit (429) : patientez une minute puis réessayez.', false)
  if (res.status >= 400) {
    throw new EtsyRefus(`Refus Etsy (${res.status})${json?.error ? ` — ${json.error}` : texte ? ` — ${texte.slice(0, 300)}` : ''}`, res.status >= 500)
  }
  return json
}

/** Le prix dans la devise de la boutique Etsy (EUR pour une boutique française). */
export async function prixEtsy(produit: Product, deviseBoutique: string): Promise<number> {
  const base = Number(produit.sellingPrice ?? 0)
  const de = String(produit.currency ?? 'EUR').toUpperCase()
  const vers = deviseBoutique.toUpperCase()
  if (de === vers) return Math.round(base * 100) / 100
  const tDe = await tauxEnEuros(de)
  const tVers = await tauxEnEuros(vers)
  if (!tDe || !tVers) throw new EtsyRefus(`Conversion impossible de ${de} vers ${vers}, la devise de votre boutique Etsy.`, false)
  return Math.round(((base * tDe.taux) / tVers.taux) * 100) / 100
}

function coupeTitre(t: string): string {
  const s = t.replace(/\s+/g, ' ').trim()
  if (s.length <= 140) return s
  const coupe = s.slice(0, 140)
  const espace = coupe.lastIndexOf(' ')
  return (espace > 80 ? coupe.slice(0, espace) : coupe).trim()
}

function texteBrut(produit: Product): string {
  return String(produit.aiDescription || produit.description || '')
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function listeImages(produit: Product): string[] {
  const lire = (j: unknown): string[] =>
    Array.isArray(j)
      ? j.map((x) => (typeof x === 'string' ? x : (x as { url?: string } | null)?.url ?? '')).filter((u) => /^https?:\/\//.test(u))
      : []
  const marquees = lire((produit as { exportImages?: unknown }).exportImages)
  return (marquees.length ? marquees : lire(produit.images)).slice(0, 10)
}

interface Noeud {
  id: number
  name: string
  children?: Noeud[]
}

const mots = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2)

/**
 * La catégorie Etsy : un identifiant posé à la main sur la catégorie (nombre),
 * sinon la feuille de la taxonomie Etsy dont le nom partage le plus de mots
 * avec le chemin Google du référentiel (Etsy et Google ont des taxonomies
 * anglaises voisines). Aucun mot commun : on le dit, on n'invente pas.
 */
export function choisirTaxonomie(arbre: Noeud[], categorie: string, titre: string): number | null {
  if (/^\d+$/.test(categorie.trim())) return Number(categorie.trim())
  const feuilles: Array<{ id: number; chemin: string[] }> = []
  const parcourir = (n: Noeud, chemin: string[]) => {
    const ici = [...chemin, n.name]
    if (n.children?.length) n.children.forEach((c) => parcourir(c, ici))
    else feuilles.push({ id: n.id, chemin: ici })
  }
  arbre.forEach((n) => parcourir(n, []))
  const segments = categorie.split('>').map((x) => x.trim()).filter(Boolean)
  const dernier = new Set(mots(segments[segments.length - 1] ?? ''))
  const tous = new Set([...mots(categorie), ...mots(titre)])
  let meilleur: { id: number; score: number } | null = null
  for (const f of feuilles) {
    const nom = mots(f.chemin[f.chemin.length - 1])
    const chemin = mots(f.chemin.join(' '))
    const score = nom.filter((m) => dernier.has(m)).length * 3 + nom.filter((m) => tous.has(m)).length * 2 + chemin.filter((m) => tous.has(m)).length
    if (score > 0 && (!meilleur || score > meilleur.score)) meilleur = { id: f.id, score }
  }
  return meilleur?.id ?? null
}

async function premier(s: Session, chemin: string, cleId: string, quoi: string, ou: string): Promise<number> {
  const json = await appel(s, 'GET', chemin)
  const id = (json?.results as Array<Record<string, unknown>> | undefined)?.find((x) => x?.[cleId] != null)?.[cleId]
  if (id == null) throw new EtsyRefus(`Etsy exige ${quoi} sur chaque annonce et votre boutique n'en a aucun. Créez-le dans Etsy (${ou}), puis relancez la publication.`, false)
  return Number(id)
}

async function deposerEtsy(creds: EtsyCreds, produit: Product, categorie: string): Promise<DepotMarche> {
  const s: Session = { creds: { ...creds }, tourne: false }
  const boutique = `/shops/${encodeURIComponent(creds.shopId)}`
  const titre = coupeTitre(String(produit.aiTitle || produit.title || ''))
  if (!titre) throw new EtsyRefus("L'annonce n'a pas de titre : Etsy en exige un.", false)
  const description = texteBrut(produit) || titre
  const images = listeImages(produit)
  if (!images.length) throw new EtsyRefus("Etsy exige au moins une photo : l'annonce n'en a pas.", false)

  // 1. Les prérequis de la boutique.
  const infos = await appel(s, 'GET', boutique)
  const devise = String(infos?.currency_code || 'EUR')
  const livraison = await premier(s, `${boutique}/shipping-profiles`, 'shipping_profile_id', "un profil d'expédition", "Gestionnaire de boutique › Paramètres › Expédition")
  const preparation = await premier(s, `${boutique}/readiness-state-definitions`, 'readiness_state_id', 'un profil de préparation', 'Gestionnaire de boutique › Paramètres › Expédition › Profils de préparation')

  // 2. La catégorie.
  const taxo = await appel(s, 'GET', '/seller-taxonomy/nodes')
  const taxonomie = choisirTaxonomie((taxo?.results as Noeud[]) ?? [], categorie, titre)
  if (!taxonomie) {
    throw new EtsyRefus(
      `Etsy ne propose aucune catégorie proche de « ${categorie} ». Posez l'identifiant de catégorie Etsy (un nombre) sur la catégorie du produit, dans Catégories › Correspondances.`,
      false,
    )
  }

  // 3. Le brouillon.
  const prix = await prixEtsy(produit, devise)
  if (prix < 0.2) throw new EtsyRefus("Le prix de vente est trop bas pour Etsy (0,20 minimum) : fixez-le d'abord.", false)
  const corps = new URLSearchParams({
    quantity: String(Math.min(999, Math.max(1, Number(produit.supplierStock ?? 10) || 10))),
    title: titre,
    description,
    price: prix.toFixed(2),
    who_made: 'someone_else',
    when_made: process.env.ETSY_WHEN_MADE?.trim() || '2020_2025',
    taxonomy_id: String(taxonomie),
    shipping_profile_id: String(livraison),
    readiness_state_id: String(preparation),
    type: 'physical',
    is_supply: 'false',
  })
  const annonce = await appel(s, 'POST', `${boutique}/listings`, corps)
  const id = annonce?.listing_id
  if (!id) throw new EtsyRefus("Etsy n'a pas rendu d'identifiant d'annonce.", false)

  // 4. Les photos : Etsy n'accepte que le fichier, pas une adresse.
  let envoyees = 0
  for (const [rang, url] of images.entries()) {
    const fichier = await fetch(url).catch(() => null)
    if (!fichier?.ok) continue
    const form = new FormData()
    form.append('image', new Blob([await fichier.arrayBuffer()], { type: fichier.headers.get('content-type') || 'image/jpeg' }), `photo-${rang + 1}.jpg`)
    form.append('rank', String(rang + 1))
    await appel(s, 'POST', `${boutique}/listings/${id}/images`, form)
    envoyees++
  }

  return {
    note: `Brouillon créé dans votre boutique Etsy (${prix.toFixed(2)} ${devise}, catégorie ${taxonomie}, ${envoyees} photo${envoyees > 1 ? 's' : ''}). Relisez-le et cliquez « Publier » dans Etsy : la mise en vente coûte 0,20 $, et Etsy n'autorise que le fait main, le vintage et les fournitures créatives.`,
    url: `https://www.etsy.com/your/shops/me/listing-editor/edit/${id}`,
    majCreds: s.tourne ? (s.creds as unknown as Record<string, unknown>) : undefined,
  }
}

export const etsy: ConnecteurMarche<EtsyCreds> = {
  platform: 'ETSY',
  label: 'Etsy',
  appConfiguree: () => !!(cle() && secretPartage()),
  manque() {
    const absents = [!cle() && 'ETSY_API_KEY', !secretPartage() && 'ETSY_SHARED_SECRET'].filter(Boolean)
    return absents.length ? `Il manque ${absents.join(' et ')} dans Railway : déclarez l'application sur etsy.com/developers.` : ''
  },

  lienAutorisation(etat, redirectUri) {
    const q = new URLSearchParams({
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: PORTEES,
      client_id: cle(),
      state: etat,
      code_challenge: defiPkce(verificateurPkce(etat)),
      code_challenge_method: 'S256',
    })
    return `${hoteAuth()}/oauth/connect?${q.toString()}`
  },

  async finaliser(params, redirectUri) {
    if (params.error) throw new EtsyRefus(`Etsy a refusé l'autorisation (${params.error_description || params.error}).`, true)
    if (!params.code || !params.state) throw new EtsyRefus("Etsy n'a renvoyé aucun code d'autorisation.", true)
    const creds = await jetons(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cle(),
        redirect_uri: redirectUri,
        code: params.code,
        code_verifier: verificateurPkce(params.state),
      }),
    )
    const s: Session = { creds, tourne: false }
    const moi = await appel(s, 'GET', '/users/me')
    if (!moi?.shop_id) throw new EtsyRefus("Ce compte Etsy n'a pas de boutique : ouvrez-la d'abord sur etsy.com/sell.", true)
    const boutique = await appel(s, 'GET', `/shops/${moi.shop_id}`).catch(() => null)
    return { data: { ...s.creds, shopId: String(moi.shop_id) }, label: boutique?.shop_name ? String(boutique.shop_name) : undefined }
  },

  lire: readEtsyCreds,

  async verifier(creds) {
    const s: Session = { creds: { ...creds }, tourne: false }
    await appel(s, 'GET', `/shops/${encodeURIComponent(creds.shopId)}`)
    return s.tourne ? { majCreds: s.creds as unknown as Record<string, unknown> } : undefined
  },

  deposer: deposerEtsy,
}

enregistrerConnecteur(etsy)
