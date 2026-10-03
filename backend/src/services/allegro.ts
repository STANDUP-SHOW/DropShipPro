import type { Product } from '@prisma/client'
import { enregistrerConnecteur, retourMarche, type ConnecteurMarche, type DepotMarche } from './marchesApi.js'
import { tauxEnEuros } from './devises.js'
import { identifiantCatalogue } from './mirakl.js'
import { cleControleValide } from './kaufland.js'

/**
 * Le connecteur Allegro — OAuth 2.0 « authorization code » + REST API.
 *
 * ÉCRIT D'APRÈS LA DOCUMENTATION PUBLIQUE (developer.allegro.pl), JAMAIS
 * EXÉCUTÉ CONTRE LE VRAI ALLEGRO. Le banc (check-allegro.ts) l'éprouve contre
 * un faux serveur dont le contrat est écrit en dur : il prouve la mécanique,
 * pas la réalité. Premier vrai test à faire : le bac à sable (ALLEGRO_SANDBOX=1).
 *
 * Ce que le vendeur doit avoir : un compte Allegro vendeur d'une société de
 * l'UE (Allegro.pl s'adresse aux entreprises hors Pologne via leur
 * « Allegro Business »), des offres et un service client en POLONAIS, et —
 * avant le premier dépôt — au moins un tarif de livraison, une politique de
 * retour et une garantie créés dans son espace Allegro. L'API les exige sur
 * chaque offre ; nous ne les inventons pas, nous prenons la première de chaque.
 *
 * Variables : ALLEGRO_CLIENT_ID, ALLEGRO_CLIENT_SECRET (application déclarée sur
 * apps.developer.allegro.pl). ALLEGRO_SANDBOX=1 bascule TOUS les hôtes vers le
 * bac à sable ; ALLEGRO_AUTH_URL / ALLEGRO_API_URL / ALLEGRO_UPLOAD_URL les
 * remplacent un par un (banc). ALLEGRO_PAYS (défaut FR) : pays d'expédition.
 *
 * Prix : la boutique vend en euros, Allegro.pl en zlotys. Conversion à
 * ALLEGRO_TAUX_EUR_PLN s'il est posé (nombre de PLN pour 1 EUR) ; sinon le taux
 * BCE du jour via devises.ts (tauxEnEuros('PLN'), inversé) ; sinon, réseau muet,
 * le repli documenté ci-dessous (TAUX_EUR_PLN_REPLI). Une devise de produit
 * déjà PLN n'est pas convertie.
 *
 * Jetons : le jeton de rafraîchissement TOURNE à chaque usage (l'ancien meurt).
 * Chaque appel qui en fait tourner un le rend dans `majCreds` ; ne pas le
 * garder, c'est perdre la liaison au dépôt suivant.
 */

export interface AllegroCreds {
  accessToken: string
  /** Échéance du jeton d'accès, en millisecondes depuis 1970. */
  accessExpires: number
  refreshToken: string
}

/** Repli si ni ALLEGRO_TAUX_EUR_PLN ni la BCE ne répondent (ordre de grandeur 2026). */
export const TAUX_EUR_PLN_REPLI = 4.25

const MEDIA = 'application/vnd.allegro.public.v1+json'

export class AllegroRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand c'est la liaison (jeton, droits), pas cette annonce-là. */
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'AllegroRefus'
  }
}

function bac(): boolean {
  return process.env.ALLEGRO_SANDBOX === '1'
}
const sansBarre = (u: string) => u.replace(/\/+$/, '')
export function hoteAuth(): string {
  return sansBarre(process.env.ALLEGRO_AUTH_URL?.trim() || (bac() ? 'https://allegro.pl.allegrosandbox.pl' : 'https://allegro.pl'))
}
export function hoteApi(): string {
  return sansBarre(process.env.ALLEGRO_API_URL?.trim() || (bac() ? 'https://api.allegro.pl.allegrosandbox.pl' : 'https://api.allegro.pl'))
}
export function hoteUpload(): string {
  return sansBarre(process.env.ALLEGRO_UPLOAD_URL?.trim() || (bac() ? 'https://upload.allegro.pl.allegrosandbox.pl' : 'https://upload.allegro.pl'))
}
export function urlOffre(id: string): string {
  return `https://${bac() ? 'allegro.pl.allegrosandbox.pl' : 'allegro.pl'}/oferta/${id}`
}

/** Le vocabulaire des erreurs Allegro, en clair. Le message d'origine reste en queue. */
const TRADUCTIONS: Array<[RegExp, string]> = [
  [/required|wymagan|missing|brak/i, 'information obligatoire manquante'],
  [/category|kategori/i, 'catégorie non acceptée'],
  [/ean|gtin/i, 'code-barres (EAN/GTIN) refusé'],
  [/image|zdj/i, 'image refusée (taille, format ou accès)'],
  [/price|cen[aay]/i, 'prix refusé'],
  [/name|title|nazw|tytu/i, 'titre refusé'],
  [/parameter|parametr/i, 'caractéristique de la catégorie à renseigner'],
  [/description|opis/i, 'description refusée'],
  [/shipping|dostaw/i, 'livraison refusée'],
  [/stock|quantity|ilo/i, 'stock refusé'],
]

interface ErreurAllegro {
  code?: string
  message?: string
  userMessage?: string
  path?: string
}

export function traduireErreurs422(corps: unknown): string[] {
  const liste = (corps as { errors?: ErreurAllegro[] } | null)?.errors
  if (!Array.isArray(liste) || !liste.length) return []
  return liste.map((e) => {
    const brut = e.userMessage || e.message || e.code || 'erreur sans détail'
    const sens = TRADUCTIONS.find(([motif]) => motif.test(`${e.code ?? ''} ${brut} ${e.path ?? ''}`))?.[1]
    const ou = e.path ? ` (champ « ${e.path} »)` : ''
    return sens ? `${sens}${ou} — Allegro dit : « ${brut} »` : `« ${brut} »${ou}`
  })
}

export function readAllegroCreds(data: unknown): AllegroCreds | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const accessToken = typeof r.accessToken === 'string' ? r.accessToken.trim() : ''
  const refreshToken = typeof r.refreshToken === 'string' ? r.refreshToken.trim() : ''
  const accessExpires = Number(r.accessExpires)
  if (!accessToken || !refreshToken || !Number.isFinite(accessExpires)) return null
  return { accessToken, refreshToken, accessExpires }
}

function basic(): string {
  const id = process.env.ALLEGRO_CLIENT_ID?.trim() ?? ''
  const secret = process.env.ALLEGRO_CLIENT_SECRET?.trim() ?? ''
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}

interface Jetons {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

async function echangerJetons(corps: URLSearchParams): Promise<AllegroCreds> {
  const res = await fetch(`${hoteAuth()}/auth/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: corps,
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new AllegroRefus(
      res.status === 400 || res.status === 401
        ? `Allegro a refusé l'autorisation (${res.status}). Si le compte était déjà lié, le jeton de rafraîchissement a expiré ou a été remplacé : reconnectez Allegro dans les réglages.${detail ? ` Détail : ${detail}` : ''}`
        : `Allegro ne répond pas comme prévu au jeton (${res.status}).${detail ? ` ${detail}` : ''}`,
      true,
    )
  }
  const j = (await res.json()) as Jetons
  if (!j.access_token || !j.refresh_token) {
    throw new AllegroRefus("Allegro a répondu sans jeton d'accès : reconnectez le compte.", true)
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    accessExpires: Date.now() + (Number(j.expires_in) || 43200) * 1000,
  }
}

/** Un état de session : les jetons courants, et s'ils ont tourné. */
interface Session {
  creds: AllegroCreds
  tourne: boolean
}

async function rafraichir(s: Session, redirectUri: string) {
  s.creds = await echangerJetons(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.creds.refreshToken, redirect_uri: redirectUri }),
  )
  s.tourne = true
}

function redirectPourRafraichir(): string {
  // Allegro demande le redirect_uri d'origine ; il est fixe par plateforme.
  return retourMarche('ALLEGRO')
}

async function appel(
  s: Session,
  hote: string,
  methode: 'GET' | 'POST',
  chemin: string,
  corps?: unknown,
  deuxiemeChance = true,
): Promise<{ status: number; json: any; entetes: Headers }> {
  if (s.creds.accessExpires - Date.now() < 60_000) await rafraichir(s, redirectPourRafraichir())
  const res = await fetch(`${hote}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${s.creds.accessToken}`,
      Accept: MEDIA,
      'Accept-Language': 'pl-PL',
      ...(corps === undefined ? {} : { 'Content-Type': MEDIA }),
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
      await rafraichir(s, redirectPourRafraichir())
      return appel(s, hote, methode, chemin, corps, false)
    }
    throw new AllegroRefus('Allegro refuse la liaison (401) : reconnectez votre compte Allegro dans les réglages.', true)
  }
  if (res.status === 403) {
    throw new AllegroRefus(
      "Allegro refuse l'accès (403) : le compte vendeur n'est pas vérifié, ou n'a pas autorisé DropShipper à gérer les offres. Terminez la vérification dans Allegro, puis reconnectez le compte.",
      true,
    )
  }
  if (res.status === 429) {
    const attente = res.headers.get('retry-after')
    throw new AllegroRefus(`Allegro limite le débit (429) : patientez${attente ? ` ${attente} s` : ' une minute'} puis réessayez.`, false)
  }
  if (res.status === 422) {
    const msgs = traduireErreurs422(json)
    throw new AllegroRefus(
      `Allegro refuse cette offre (422) : ${msgs.length ? msgs.join(' ; ') : texte.slice(0, 300) || 'sans détail'}. Complétez la fiche puis recommencez.`,
      false,
    )
  }
  if (res.status >= 400) {
    const msgs = traduireErreurs422(json)
    throw new AllegroRefus(
      `Refus Allegro (${res.status})${msgs.length ? ` — ${msgs.join(' ; ')}` : texte ? ` — ${texte.slice(0, 300)}` : ''}`,
      res.status >= 500,
    )
  }
  return { status: res.status, json, entetes: res.headers }
}

async function tauxEurPln(): Promise<number> {
  const env = Number(process.env.ALLEGRO_TAUX_EUR_PLN)
  if (Number.isFinite(env) && env > 0) return env
  const pln = await tauxEnEuros('PLN').catch(() => null)
  if (pln && pln.taux > 0) return 1 / pln.taux
  return TAUX_EUR_PLN_REPLI
}

/** Le prix en zlotys, deux décimales, en chaîne comme l'attend Allegro. */
export async function prixEnPln(produit: Product): Promise<string> {
  const base = Number(produit.sellingPrice ?? 0)
  const devise = String(produit.currency ?? 'EUR').toUpperCase()
  const pln = devise === 'PLN' ? base : base * (await tauxEurPln())
  return (Math.round(pln * 100) / 100).toFixed(2)
}

function coupeTitre(t: string): string {
  const s = t.replace(/\s+/g, ' ').trim()
  if (s.length <= 75) return s
  const coupe = s.slice(0, 75)
  const espace = coupe.lastIndexOf(' ')
  return (espace > 40 ? coupe.slice(0, espace) : coupe).trim()
}

function listeImages(produit: Product): string[] {
  const lire = (j: unknown): string[] =>
    Array.isArray(j)
      ? j
          .map((x) => (typeof x === 'string' ? x : (x as { url?: string } | null)?.url ?? ''))
          .filter((u) => /^https?:\/\//.test(u))
      : []
  const marquees = lire((produit as { exportImages?: unknown }).exportImages)
  return (marquees.length ? marquees : lire(produit.images)).slice(0, 16)
}

function descriptionHtml(produit: Product): string[] {
  const brut = String(produit.aiDescription || produit.description || '')
  const propre = brut.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
  const echap = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return propre
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => `<p>${echap(l)}</p>`)
}

const MANQUE_POLITIQUES = (quoi: string) =>
  `Allegro exige ${quoi} sur chaque offre et votre compte n'en a aucun(e). Créez-le dans Allegro (Mon compte vendeur › Paramètres de vente : tarifs de livraison, retours, garanties), puis relancez la publication.`

async function premierId(s: Session, chemin: string, cle: string, quoi: string): Promise<string> {
  const { json } = await appel(s, hoteApi(), 'GET', chemin)
  const id = (json?.[cle] as Array<{ id?: string }> | undefined)?.find((x) => x?.id)?.id
  if (!id) throw new AllegroRefus(MANQUE_POLITIQUES(quoi), false)
  return id
}

async function deposerAllegro(creds: AllegroCreds, produit: Product, categorie: string): Promise<DepotMarche> {
  const s: Session = { creds: { ...creds }, tourne: false }
  const titre = coupeTitre(String(produit.aiTitle || produit.title || ''))
  if (!titre) throw new AllegroRefus("L'annonce n'a pas de titre : Allegro en exige un.", false)
  const images = listeImages(produit)
  if (!images.length) throw new AllegroRefus("Allegro exige au moins une photo : l'annonce n'en a pas.", false)

  const ean = identifiantCatalogue(produit)
  if (ean && !cleControleValide(ean.id)) {
    throw new AllegroRefus(
      `L'EAN « ${ean.id} » a une clé de contrôle fausse : Allegro grefferait l'offre sur un autre produit. Corrigez-le dans les caractéristiques.`,
      false,
    )
  }

  // 1. Les prérequis du vendeur, avant tout envoi coûteux.
  const tarif = await premierId(s, '/sale/shipping-rates', 'shippingRates', 'un tarif de livraison')
  const retour = await premierId(s, '/after-sales-service-conditions/return-policies', 'returnPolicies', 'une politique de retour')
  const garantie = await premierId(s, '/after-sales-service-conditions/implied-warranties', 'impliedWarranties', 'une garantie')

  // 2. La fiche catalogue (par EAN) ou la catégorie (par le titre).
  let produitId: string | null = null
  let categorieId: string | null = null
  if (ean) {
    const { json } = await appel(s, hoteApi(), 'GET', `/sale/products?ean=${encodeURIComponent(ean.id)}&mode=GTIN`)
    const trouve = (json?.products as Array<{ id?: string; category?: { id?: string } }> | undefined)?.find((p) => p?.id)
    if (trouve) {
      produitId = trouve.id!
      categorieId = trouve.category?.id ?? null
    }
  }
  if (!produitId) {
    const nom = titre || categorie
    const { json } = await appel(s, hoteApi(), 'GET', `/sale/matching-categories?name=${encodeURIComponent(nom)}`)
    const cats = (json?.matchingCategories as Array<{ id?: string; leaf?: boolean }> | undefined) ?? []
    categorieId = (cats.find((c) => c?.id && c.leaf !== false) ?? cats.find((c) => c?.id))?.id ?? null
    if (!categorieId) {
      throw new AllegroRefus(
        `Allegro ne trouve aucune catégorie pour « ${nom} ». Précisez le titre (le type de produit en tête) ou publiez-le d'abord à la main dans Allegro.`,
        false,
      )
    }
  }

  // 3. Les photos : Allegro les héberge, on lui donne l'adresse.
  const hebergees: string[] = []
  for (const url of images) {
    const { json } = await appel(s, hoteUpload(), 'POST', '/sale/images', { url })
    if (json?.location) hebergees.push(String(json.location))
  }
  if (!hebergees.length) throw new AllegroRefus("Allegro n'a accepté aucune photo : vérifiez qu'elles sont publiques (JPEG/PNG, 400 px minimum).", false)

  // 4. L'offre.
  const prix = await prixEnPln(produit)
  const offre: Record<string, unknown> = {
    name: titre,
    productSet: [
      produitId
        ? { product: { id: produitId } }
        : { product: { name: titre, category: { id: categorieId }, parameters: [], images: hebergees } },
    ],
    category: categorieId ? { id: categorieId } : undefined,
    images: hebergees,
    description: { sections: [{ items: [{ type: 'TEXT', content: descriptionHtml(produit).join('') || `<p>${titre}</p>` }] }] },
    sellingMode: { format: 'BUY_NOW', price: { amount: prix, currency: 'PLN' } },
    stock: { unit: 'UNIT', available: Math.max(1, Number(produit.supplierStock ?? 10) || 10) },
    delivery: { shippingRates: { id: tarif } },
    afterSalesServices: { impliedWarranty: { id: garantie }, returnPolicy: { id: retour } },
    location: { countryCode: process.env.ALLEGRO_PAYS?.trim() || 'FR' },
    external: { id: produit.id },
    publication: { status: 'ACTIVE' },
  }
  const { json, entetes } = await appel(s, hoteApi(), 'POST', '/sale/product-offers', offre)
  const id = json?.id ?? entetes.get('location')?.match(/([0-9a-f-]{6,})\/?$/i)?.[1] ?? null

  const notes = [
    produitId ? `Offre greffée sur la fiche catalogue Allegro de l'EAN ${ean?.id}.` : `Nouvelle fiche produit créée en catégorie ${categorieId} (choisie d'après le titre).`,
    `Prix converti en zlotys : ${prix} PLN.`,
    "Les annonces Allegro s'affichent en polonais : le service client l'est aussi.",
  ]
  const en = json?.validation?.warnings
  if (Array.isArray(en) && en.length) notes.push(`Avertissements Allegro : ${traduireErreurs422({ errors: en }).join(' ; ')}.`)

  return {
    note: notes.join(' '),
    url: id ? urlOffre(String(id)) : null,
    majCreds: s.tourne ? (s.creds as unknown as Record<string, unknown>) : undefined,
  }
}

export const allegro: ConnecteurMarche<AllegroCreds> = {
  platform: 'ALLEGRO',
  label: 'Allegro',
  appConfiguree: () => !!(process.env.ALLEGRO_CLIENT_ID?.trim() && process.env.ALLEGRO_CLIENT_SECRET?.trim()),
  manque() {
    const absents = [!process.env.ALLEGRO_CLIENT_ID?.trim() && 'ALLEGRO_CLIENT_ID', !process.env.ALLEGRO_CLIENT_SECRET?.trim() && 'ALLEGRO_CLIENT_SECRET'].filter(Boolean)
    return absents.length ? `Il manque ${absents.join(' et ')} dans Railway : déclarez l'application sur apps.developer.allegro.pl.` : ''
  },

  lienAutorisation(etat, redirectUri) {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.ALLEGRO_CLIENT_ID?.trim() ?? '',
      redirect_uri: redirectUri,
      state: etat,
      prompt: 'confirm',
    })
    return `${hoteAuth()}/auth/oauth/authorize?${q.toString()}`
  },

  async finaliser(params, redirectUri) {
    if (params.error) {
      throw new AllegroRefus(`Allegro a refusé l'autorisation (${params.error_description || params.error}).`, true)
    }
    if (!params.code) throw new AllegroRefus("Allegro n'a renvoyé aucun code d'autorisation.", true)
    const creds = await echangerJetons(
      new URLSearchParams({ grant_type: 'authorization_code', code: params.code, redirect_uri: redirectUri }),
    )
    const s: Session = { creds, tourne: false }
    const { json } = await appel(s, hoteApi(), 'GET', '/me')
    return { data: s.creds as unknown as Record<string, unknown>, label: json?.login ? String(json.login) : undefined }
  },

  lire: readAllegroCreds,

  async verifier(creds) {
    const s: Session = { creds: { ...creds }, tourne: false }
    await appel(s, hoteApi(), 'GET', '/me')
    return s.tourne ? { majCreds: s.creds as unknown as Record<string, unknown> } : undefined
  },

  deposer: deposerAllegro,
}

enregistrerConnecteur(allegro)
