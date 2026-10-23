import { JWT } from 'google-auth-library'

/**
 * Le Planificateur de mots-clés de Google (Google Ads API, KeywordPlanIdeaService).
 *
 * Voulu par Max le 23/10/2026 : appuyer les produits gagnants des rayons sur une
 * demande RÉELLE en France — volume de recherche mensuel, courbe sur 12 mois,
 * concurrence publicitaire — au lieu de la seule recherche web. L'API est gratuite.
 *
 * Accès (état de Google au 23/10/2026) : plus de « jeton développeur » depuis le
 * 09/09/2026 ; l'accès est accordé au PROJET Google Cloud. Le Planificateur est
 * refusé au niveau « Explorer » : il faut le niveau « Basic » (vérification de la
 * marque du projet). On s'authentifie par un compte de service, ajouté comme
 * utilisateur du compte Google Ads. Variables Railway, posées par Max seul :
 *
 *   GOOGLE_ADS_SERVICE_ACCOUNT_JSON  le fichier de clé JSON du compte de service, collé tel quel
 *   GOOGLE_ADS_CUSTOMER_ID           numéro du compte Google Ads (123-456-7890 ou 1234567890)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID     facultatif : compte administrateur (MCC) par lequel on passe
 *   GOOGLE_ADS_DEVELOPER_TOKEN       facultatif : ancien jeton, envoyé seulement s'il est posé
 *   GOOGLE_ADS_API_VERSION           facultatif, v26 par défaut
 *
 * Sans ces variables rien n'est appelé : `MotsClesErreur('non-configure')`, que la
 * route rend en 503 avec la liste de ce qui manque. Un chiffre absent reste `null` :
 * jamais de volume deviné.
 */

const VERSION_DEFAUT = 'v26'
/** France, en français : constantes de ciblage de Google Ads. */
const GEO_FRANCE = 'geoTargetConstants/2250'
const LANGUE_FR = 'languageConstants/1002'
const PORTEE = 'https://www.googleapis.com/auth/adwords'
/** Bornes de Google sur un mot-clé : 80 caractères, 10 mots. */
const LONGUEUR_MAX = 80
const MOTS_MAX = 10
/** Plafond par requête de notre côté (Google en accepte 10 000) : un rayon en demande quelques dizaines. */
export const MOTS_CLES_MAX = 500
export const IDEES_MAX = 200

export type MotifMotsCles = 'non-configure' | 'configuration' | 'acces-refuse' | 'quota' | 'reseau' | 'reponse'

/** Une erreur déjà lisible par Max, avec son motif (la route en fait le statut HTTP). */
export class MotsClesErreur extends Error {
  constructor(public motif: MotifMotsCles, message: string) {
    super(message)
  }
}

interface Configuration {
  email: string
  cle: string
  client: string
  login: string | null
  jetonDeveloppeur: string | null
  version: string
}

const chiffres = (v: string | undefined) => (v || '').replace(/[\s-]/g, '')

/** Ce qui manque pour appeler Google, en noms de variables Railway. Vide = tout est posé. */
export function motsClesManquants(env: NodeJS.ProcessEnv = process.env): string[] {
  const manque: string[] = []
  if (!(env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON || '').trim()) manque.push('GOOGLE_ADS_SERVICE_ACCOUNT_JSON')
  if (!chiffres(env.GOOGLE_ADS_CUSTOMER_ID)) manque.push('GOOGLE_ADS_CUSTOMER_ID')
  return manque
}

export function motsClesConfigure(env: NodeJS.ProcessEnv = process.env): boolean {
  return motsClesManquants(env).length === 0
}

function configuration(env: NodeJS.ProcessEnv): Configuration {
  const manque = motsClesManquants(env)
  if (manque.length) {
    throw new MotsClesErreur('non-configure', `Le Planificateur de mots-clés Google n'est pas branché : variable(s) Railway manquante(s) ${manque.join(', ')}.`)
  }
  let compte: { client_email?: unknown; private_key?: unknown }
  try {
    compte = JSON.parse(env.GOOGLE_ADS_SERVICE_ACCOUNT_JSON!.trim())
  } catch {
    throw new MotsClesErreur('configuration', "GOOGLE_ADS_SERVICE_ACCOUNT_JSON n'est pas un JSON valide : collez le fichier de clé du compte de service en entier, accolades comprises.")
  }
  if (typeof compte.client_email !== 'string' || typeof compte.private_key !== 'string') {
    throw new MotsClesErreur('configuration', 'GOOGLE_ADS_SERVICE_ACCOUNT_JSON ne contient pas client_email et private_key : ce doit être une clé de COMPTE DE SERVICE (type JSON).')
  }
  const client = chiffres(env.GOOGLE_ADS_CUSTOMER_ID)
  if (!/^\d{10}$/.test(client)) throw new MotsClesErreur('configuration', 'GOOGLE_ADS_CUSTOMER_ID doit être le numéro à 10 chiffres du compte Google Ads (en haut à droite de Google Ads).')
  const login = chiffres(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || null
  if (login && !/^\d{10}$/.test(login)) throw new MotsClesErreur('configuration', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID doit faire 10 chiffres (ou être retiré).')
  const version = (env.GOOGLE_ADS_API_VERSION || '').trim()
  return {
    email: compte.client_email,
    cle: compte.private_key,
    client,
    login,
    jetonDeveloppeur: (env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim() || null,
    version: /^v\d+$/.test(version) ? version : VERSION_DEFAUT,
  }
}

/** Dépendances remplaçables par le banc : aucun appel réel sans clé. */
export interface Options {
  env?: NodeJS.ProcessEnv
  fetch?: typeof fetch
  jeton?: (c: { email: string; cle: string }) => Promise<string>
}

// One JWT client per service account: it caches the access token until it expires.
let jwt: JWT | null = null
let jwtEmail = ''
async function jetonCompteDeService(c: { email: string; cle: string }): Promise<string> {
  if (!jwt || jwtEmail !== c.email) {
    jwt = new JWT({ email: c.email, key: c.cle, scopes: [PORTEE] })
    jwtEmail = c.email
  }
  try {
    const { token } = await jwt.getAccessToken()
    if (!token) throw new Error('jeton vide')
    return token
  } catch (err) {
    jwt = null
    throw new MotsClesErreur('acces-refuse', `Google refuse le compte de service : ${err instanceof Error ? err.message : String(err)}. Clé révoquée ou mal collée ?`)
  }
}

/** Les erreurs de Google rendues en français, avec ce qui débloque. */
function erreurGoogle(statut: number, corps: string): MotsClesErreur {
  const extrait = corps.slice(0, 600)
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|ACTION_NOT_PERMITTED|DEVELOPER_TOKEN_NOT_APPROVED/.test(corps)) {
    return new MotsClesErreur('acces-refuse', "Le projet Google Cloud n'a pas encore le niveau d'accès « Basic » à Google Ads API (le Planificateur est refusé en « Test » et en « Explorer »). Page « Google Ads API » de la console Google Cloud, rubrique du niveau d'accès.")
  }
  if (/USER_PERMISSION_DENIED|CUSTOMER_NOT_FOUND|NOT_ADS_USER/.test(corps)) {
    return new MotsClesErreur('acces-refuse', "Le compte de service n'est pas utilisateur de ce compte Google Ads (Google Ads > Administration > Accès et sécurité), ou GOOGLE_ADS_CUSTOMER_ID n'est pas le bon numéro.")
  }
  if (/SERVICE_DISABLED|has not been used in project|is disabled/.test(corps)) {
    return new MotsClesErreur('acces-refuse', "Google Ads API n'est pas activée dans le projet Google Cloud du compte de service (Bibliothèque d'API > Google Ads API > Activer).")
  }
  if (statut === 429 || /RESOURCE_EXHAUSTED|RESOURCE_TEMPORARILY_EXHAUSTED/.test(corps)) {
    return new MotsClesErreur('quota', 'Google limite le Planificateur pour le moment (quota atteint) : réessayer dans une minute, ou demain si le plafond du jour est atteint.')
  }
  if (statut === 401 || statut === 403) return new MotsClesErreur('acces-refuse', `Google refuse l'accès (${statut}) : ${extrait}`)
  return new MotsClesErreur('reponse', `Google Ads API a répondu ${statut} : ${extrait}`)
}

async function appeler(methode: string, corps: unknown, options: Options): Promise<any> {
  const env = options.env ?? process.env
  const c = configuration(env)
  const jeton = await (options.jeton ?? jetonCompteDeService)({ email: c.email, cle: c.cle })
  const entetes: Record<string, string> = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }
  if (c.login) entetes['login-customer-id'] = c.login
  if (c.jetonDeveloppeur) entetes['developer-token'] = c.jetonDeveloppeur
  let reponse: Response
  try {
    reponse = await (options.fetch ?? fetch)(`https://googleads.googleapis.com/${c.version}/customers/${c.client}:${methode}`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    throw new MotsClesErreur('reseau', `Google Ads API injoignable : ${err instanceof Error ? err.message : String(err)}`)
  }
  const texte = await reponse.text()
  if (!reponse.ok) throw erreurGoogle(reponse.status, texte)
  try {
    return texte ? JSON.parse(texte) : {}
  } catch {
    throw new MotsClesErreur('reponse', 'Google Ads API a rendu une réponse illisible (pas du JSON).')
  }
}

export interface MoisRecherches {
  /** AAAA-MM */
  mois: string
  recherches: number | null
}

export interface MotCle {
  texte: string
  /** Recherches mensuelles moyennes en France, sur 12 mois. */
  volumeMensuel: number | null
  concurrence: 'faible' | 'moyenne' | 'forte' | null
  /** 0 à 100 : part des emplacements publicitaires achetés sur ce mot-clé. */
  indiceConcurrence: number | null
  /** Moyenne des 3 derniers mois comparée aux 3 précédents, en %. */
  evolution3Mois: number | null
  /** Enchères du haut de page, dans la devise du compte Google Ads. */
  enchereBasse: number | null
  enchereHaute: number | null
  tendance: MoisRecherches[]
}

export interface Refus {
  texte: string
  raison: string
}

const MOIS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

/** Les int64 arrivent en chaînes dans le JSON de Google. */
function entier(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function micros(v: unknown): number | null {
  const n = entier(v)
  return n === null ? null : Math.round(n / 10_000) / 100
}

function concurrence(v: unknown): MotCle['concurrence'] {
  return v === 'LOW' ? 'faible' : v === 'MEDIUM' ? 'moyenne' : v === 'HIGH' ? 'forte' : null
}

function moyenne(valeurs: (number | null)[]): number | null {
  const v = valeurs.filter((x): x is number => x !== null)
  return v.length === valeurs.length && v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export function evolution(tendance: MoisRecherches[]): number | null {
  if (tendance.length < 6) return null
  const recents = moyenne(tendance.slice(-3).map((t) => t.recherches))
  const avant = moyenne(tendance.slice(-6, -3).map((t) => t.recherches))
  if (recents === null || avant === null || avant === 0) return null
  return Math.round(((recents - avant) / avant) * 100)
}

/** Une ligne de Google (KeywordPlanHistoricalMetrics) mise à notre forme. */
export function versMotCle(texte: string, m: any): MotCle {
  const tendance: MoisRecherches[] = (Array.isArray(m?.monthlySearchVolumes) ? m.monthlySearchVolumes : [])
    .map((x: any) => {
      const annee = entier(x?.year)
      const mois = MOIS.indexOf(String(x?.month)) + 1
      return annee && mois ? { mois: `${annee}-${String(mois).padStart(2, '0')}`, recherches: entier(x?.monthlySearches) } : null
    })
    .filter((x: MoisRecherches | null): x is MoisRecherches => x !== null)
    .sort((a: MoisRecherches, b: MoisRecherches) => a.mois.localeCompare(b.mois))
  const indice = entier(m?.competitionIndex)
  return {
    texte,
    volumeMensuel: entier(m?.avgMonthlySearches),
    concurrence: concurrence(m?.competition),
    indiceConcurrence: indice !== null && indice <= 100 ? indice : null,
    evolution3Mois: evolution(tendance),
    enchereBasse: micros(m?.lowTopOfPageBidMicros),
    enchereHaute: micros(m?.highTopOfPageBidMicros),
    tendance,
  }
}

/** Nettoie la liste : sans doublon, dans les bornes de Google ; ce qui est écarté est dit. */
export function trier(entree: unknown[], max: number): { gardes: string[]; refus: Refus[] } {
  const gardes: string[] = []
  const refus: Refus[] = []
  const vus = new Set<string>()
  for (const brut of entree) {
    if (typeof brut !== 'string') continue
    const texte = brut.replace(/\s+/g, ' ').trim()
    if (!texte) continue
    const cle = texte.toLowerCase()
    if (vus.has(cle)) continue
    vus.add(cle)
    if (texte.length > LONGUEUR_MAX) refus.push({ texte, raison: `plus de ${LONGUEUR_MAX} caractères` })
    else if (texte.split(' ').length > MOTS_MAX) refus.push({ texte, raison: `plus de ${MOTS_MAX} mots` })
    else if (gardes.length >= max) refus.push({ texte, raison: `au-delà de ${max} mots-clés par demande` })
    else gardes.push(texte)
  }
  return { gardes, refus }
}

const CIBLE = { language: LANGUE_FR, geoTargetConstants: [GEO_FRANCE], keywordPlanNetwork: 'GOOGLE_SEARCH' }

export interface ResultatMotsCles {
  source: 'google-ads'
  pays: 'FR'
  langue: 'fr'
  motsCles: MotCle[]
  refus: Refus[]
}

/**
 * Volumes, tendance et concurrence des mots-clés DONNÉS (generateKeywordHistoricalMetrics).
 * Google regroupe les variantes proches : la ligne rendue porte le texte demandé.
 */
export async function volumesMotsCles(entree: unknown[], options: Options = {}): Promise<ResultatMotsCles> {
  const { gardes, refus } = trier(entree, MOTS_CLES_MAX)
  if (!gardes.length) return { source: 'google-ads', pays: 'FR', langue: 'fr', motsCles: [], refus }
  const data = await appeler('generateKeywordHistoricalMetrics', { ...CIBLE, keywords: gardes, historicalMetricsOptions: { includeAverageCpc: false } }, options)
  const resultats: any[] = Array.isArray(data?.results) ? data.results : []
  const parTexte = new Map<string, any>()
  for (const r of resultats) {
    const metriques = r?.keywordMetrics
    for (const t of [r?.text, ...(Array.isArray(r?.closeVariants) ? r.closeVariants : [])]) {
      if (typeof t === 'string' && !parTexte.has(t.toLowerCase())) parTexte.set(t.toLowerCase(), metriques)
    }
  }
  // A keyword Google returned nothing for stays in the list with null figures: absent ≠ zero.
  const motsCles = gardes.map((t) => versMotCle(t, parTexte.get(t.toLowerCase()) ?? null))
  return { source: 'google-ads', pays: 'FR', langue: 'fr', motsCles, refus }
}

/**
 * Idées de mots-clés à partir de graines (generateKeywordIdeas), triées par volume.
 * Sert à trouver comment les Français cherchent vraiment un produit.
 */
export async function ideesMotsCles(graines: unknown[], limite = 50, options: Options = {}): Promise<ResultatMotsCles> {
  const { gardes, refus } = trier(graines, 20)
  const plafond = Math.max(1, Math.min(IDEES_MAX, Math.floor(Number(limite) || 50)))
  if (!gardes.length) return { source: 'google-ads', pays: 'FR', langue: 'fr', motsCles: [], refus }
  const data = await appeler('generateKeywordIdeas', { ...CIBLE, keywordSeed: { keywords: gardes }, pageSize: plafond }, options)
  const resultats: any[] = Array.isArray(data?.results) ? data.results : []
  const motsCles = resultats
    .filter((r) => typeof r?.text === 'string')
    .map((r) => versMotCle(r.text, r.keywordIdeaMetrics ?? null))
    .sort((a, b) => (b.volumeMensuel ?? -1) - (a.volumeMensuel ?? -1))
    .slice(0, plafond)
  return { source: 'google-ads', pays: 'FR', langue: 'fr', motsCles, refus }
}

/** Statut HTTP d'une erreur du Planificateur. */
export function statutDe(e: MotsClesErreur): number {
  return e.motif === 'quota' ? 429 : e.motif === 'non-configure' || e.motif === 'configuration' ? 503 : 502
}
