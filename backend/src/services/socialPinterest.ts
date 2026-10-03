import { callbackSocial } from '../lib/urls.js'
import { signerEtat } from './oauthEtat.js'
import {
  SocialError,
  type Campagne,
  type CompteRaccorde,
  type Performances,
  type Publication,
  type ResultatCampagne,
  type ResultatPublication,
  type SocialProvider,
} from './socialTypes.js'

/**
 * Pinterest en direct : épingles organiques et campagnes publicitaires.
 *
 * ATTENTION : écrit d'après la documentation publique de l'API v5 de Pinterest,
 * JAMAIS exécuté contre le vrai Pinterest (le réseau y est fermé depuis le
 * bac à sable de développement). Le banc `check-pinterest.ts` éprouve la
 * logique contre un faux serveur, qui écrit le contrat en dur : il ne prouve
 * pas la réalité. Premier vrai essai = sur un compte de test, avec
 * PINTEREST_API_URL pointant le bac à sable.
 *
 * Deux moteurs, une seule application Pinterest (PINTEREST_APP_ID /
 * PINTEREST_APP_SECRET), une seule autorisation OAuth : le vendeur clique une
 * fois, nous recevons un jeton qui sert aux épingles ET aux publicités. Une
 * seule adresse de retour (`callbackSocial('pinterest')`) pour les deux.
 *
 * **Niveau d'accès.** Une app Pinterest neuve a l'accès « Trial » : elle ne
 * peut écrire (épingles, campagnes) que dans le BAC À SABLE, à l'adresse
 * https://api-sandbox.pinterest.com. En production les écritures sont refusées
 * en 403 tant que Pinterest n'a pas accordé l'accès « Standard ». Pendant la
 * période d'essai, il faut donc poser PINTEREST_API_URL=https://api-sandbox.pinterest.com ;
 * une fois l'accès Standard obtenu, retirer la variable (défaut :
 * https://api.pinterest.com).
 *
 * **Jamais d'identifiants.** Le vendeur s'authentifie chez Pinterest ; nous ne
 * recevons qu'un jeton révocable, gardé en base (`prisma.socialAccount`) et qui
 * ne sort jamais vers le navigateur : les lectures choisissent leurs colonnes.
 *
 * **Les campagnes sont créées en PAUSE** sauf `activer` : elles dépensent
 * l'argent du vendeur.
 */

/** L'adresse de l'API, relue à chaque appel (le banc la change après l'import). */
function base(): string {
  return (process.env.PINTEREST_API_URL?.trim() || 'https://api.pinterest.com').replace(/\/+$/, '')
}

/*
 * Les autorisations demandées : une seule demande pour les deux moteurs.
 * `ads:*` ne s'obtient en production qu'avec l'accès Standard.
 */
export const PORTEE_PINTEREST = [
  'boards:read',
  'boards:write',
  'pins:read',
  'pins:write',
  'user_accounts:read',
  'ads:read',
  'ads:write',
].join(',')

function configuration() {
  const appId = process.env.PINTEREST_APP_ID?.trim()
  const appSecret = process.env.PINTEREST_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    throw new SocialError(
      "L'application Pinterest n'est pas configurée : PINTEREST_APP_ID et PINTEREST_APP_SECRET manquent.",
    )
  }
  return { appId, appSecret }
}

/** Vrai quand l'adaptateur est réellement utilisable. */
export function pinterestConfigure(): boolean {
  return Boolean(process.env.PINTEREST_APP_ID?.trim() && process.env.PINTEREST_APP_SECRET?.trim())
}

// --- HTTP, pur : prend le jeton, ne touche pas à la base ----------------------

/**
 * Traduit un refus de Pinterest en une erreur qui dit quoi faire.
 * Exportée pour le banc.
 */
export function traduireErreurPinterest(status: number, corps: unknown): SocialError {
  const c = (corps ?? {}) as { message?: string; code?: number }
  const message = c.message || `Pinterest a répondu ${status}.`
  if (status === 401) {
    return new SocialError('Votre connexion Pinterest a expiré : reliez le compte à nouveau.', true)
  }
  if (status === 429) {
    return new SocialError('Pinterest a limité le débit des appels. Réessayez dans quelques minutes.')
  }
  if (status === 403) {
    // Accès Trial : écritures refusées en production. C'est notre application
    // qui est en cause, pas le vendeur.
    return new SocialError(
      `Pinterest refuse cette action (${message}). L'application Pinterest n'a pas encore l'accès « Standard » : tant qu'il n'est pas accordé, elle ne peut écrire que dans le bac à sable.`,
    )
  }
  if (status >= 500) {
    return new SocialError('Pinterest est en panne. Réessayez dans un moment.')
  }
  return new SocialError(`Pinterest : ${message}`, true)
}

interface OptionsAppel {
  methode?: 'GET' | 'POST'
  query?: Record<string, string>
  corps?: unknown
}

/** Un appel JSON à l'API v5 avec un jeton porteur. */
export async function appelPinterest<T>(token: string, chemin: string, o: OptionsAppel = {}): Promise<T> {
  const url = new URL(`${base()}${chemin}`)
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v)

  let res: Response
  try {
    res = await fetch(url, {
      method: o.methode ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(o.corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(o.corps !== undefined ? { body: JSON.stringify(o.corps) } : {}),
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new SocialError('Pinterest est injoignable. Réessayez dans un moment.')
  }
  const donnees = await res.json().catch(() => ({}))
  if (!res.ok) throw traduireErreurPinterest(res.status, donnees)
  return donnees as T
}

export interface JetonsPinterest {
  accessToken: string
  refreshToken: string | null
  /** Durée de vie en secondes. */
  expiresIn: number | null
}

/** Appel du point d'échange de jetons : authentification Basic, corps encodé en formulaire. */
async function appelJeton(params: Record<string, string>): Promise<JetonsPinterest> {
  const { appId, appSecret } = configuration()
  let res: Response
  try {
    res = await fetch(`${base()}/v5/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new SocialError('Pinterest est injoignable. Réessayez dans un moment.')
  }
  const d = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    message?: string
  }
  if (!res.ok || !d.access_token) {
    // Un refus ici est presque toujours une autorisation périmée ou rejouée.
    if (res.status === 429 || res.status >= 500) throw traduireErreurPinterest(res.status, d)
    throw new SocialError(
      'Pinterest a refusé l’autorisation (code périmé ou déjà utilisé) : relancez la connexion du compte.',
      true,
    )
  }
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token ?? null,
    expiresIn: typeof d.expires_in === 'number' ? d.expires_in : null,
  }
}

/** Échange le code d'autorisation contre les jetons. */
export function echangerCodePinterest(code: string, redirectUri: string): Promise<JetonsPinterest> {
  return appelJeton({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
}

/** Renouvelle un jeton d'accès expiré à partir du jeton de renouvellement. */
export function rafraichirJetonPinterest(refreshToken: string): Promise<JetonsPinterest> {
  return appelJeton({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

// --- Épingles -----------------------------------------------------------------

/** Les tableaux : celui fixé par le compte, sinon le premier, sinon « DropShipper ». */
export async function choisirTableau(token: string, boardIdConnu?: string | null): Promise<string> {
  if (boardIdConnu) return boardIdConnu
  const l = await appelPinterest<{ items?: Array<{ id: string }> }>(token, '/v5/boards', {
    query: { page_size: '25' },
  })
  if (l.items?.length) return l.items[0].id
  const cree = await appelPinterest<{ id: string }>(token, '/v5/boards', {
    methode: 'POST',
    corps: { name: 'DropShipper', privacy: 'PUBLIC' },
  })
  return cree.id
}

export interface ContenuEpingle {
  titre: string
  description: string
  /** Au moins une, en https. */
  images: string[]
  lien?: string | null
  boardId?: string | null
}

/** Le premier lien trouvé dans un texte. */
export function premierLien(texte: string): string | null {
  const m = texte.match(/https?:\/\/[^\s)>\]]+/)
  return m ? m[0].replace(/[.,;!?]+$/, '') : null
}

/**
 * Crée une épingle. Refuse sans image AVANT tout appel : Pinterest n'a pas de
 * publication sans visuel, et le refus ne doit pas arriver après un tableau créé.
 */
export async function creerEpingle(
  token: string,
  c: ContenuEpingle,
): Promise<{ pinId: string; url: string; boardId: string }> {
  const images = c.images.filter((m) => /^https:\/\//.test(m))
  if (!images.length) {
    throw new SocialError('Pinterest exige au moins une image : ajoutez un visuel.', true)
  }
  const boardId = await choisirTableau(token, c.boardId)

  const titre = (c.titre.split('\n')[0] ?? '').trim().slice(0, 100)
  const corps: Record<string, unknown> = {
    board_id: boardId,
    title: titre,
    description: c.description.trim().slice(0, 800),
    media_source:
      images.length > 1
        ? { source_type: 'multiple_image_urls', items: images.slice(0, 5).map((url) => ({ url })) }
        : { source_type: 'image_url', url: images[0] },
  }
  const lien = c.lien ?? premierLien(c.description)
  if (lien) corps.link = lien

  const r = await appelPinterest<{ id: string }>(token, '/v5/pins', { methode: 'POST', corps })
  return { pinId: r.id, url: `https://www.pinterest.com/pin/${r.id}/`, boardId }
}

// --- Publicité ------------------------------------------------------------------

const MICRO_PAR_CENTIME = 10000

const OBJECTIFS: Record<string, string> = {
  trafic: 'CONSIDERATION',
  notoriete: 'AWARENESS',
  conversions: 'WEB_CONVERSION',
  engagement: 'CONSIDERATION',
}

const TRANCHES_AGE: Array<[string, number, number]> = [
  ['18-24', 18, 24],
  ['25-34', 25, 34],
  ['35-44', 35, 44],
  ['45-49', 45, 49],
  ['50-54', 50, 54],
  ['55-64', 55, 64],
  ['65+', 65, 200],
]

/** Les tranches d'âge de Pinterest qui recoupent [min, max]. */
export function tranchesAge(min?: number, max?: number): string[] {
  if (min === undefined && max === undefined) return []
  const bas = min ?? 0
  const haut = max ?? 200
  return TRANCHES_AGE.filter(([, a, b]) => a <= haut && b >= bas).map(([nom]) => nom)
}

/** Les trois objets d'une campagne, tels que Pinterest les attend. Exporté pour le banc. */
export function construireCampagne(adAccountId: string, c: Campagne, pinId: string) {
  const statut = c.activer ? 'ACTIVE' : 'PAUSED'
  const micro = Math.round(c.budgetJour) * MICRO_PAR_CENTIME
  const objectif = OBJECTIFS[c.objectif] ?? 'CONSIDERATION'
  const ciblage: Record<string, unknown> = {}
  if (c.ciblage?.paysCodes?.length) ciblage.GEO = c.ciblage.paysCodes.map((p) => p.toUpperCase())
  const ages = tranchesAge(c.ciblage?.ageMin, c.ciblage?.ageMax)
  if (ages.length) ciblage.AGE_BUCKET = ages

  return {
    campagne: {
      ad_account_id: adAccountId,
      name: c.nom.slice(0, 128),
      objective_type: objectif,
      status: statut,
      daily_spend_cap: micro,
    },
    groupe: (campaignId: string) => ({
      ad_account_id: adAccountId,
      campaign_id: campaignId,
      name: `${c.nom} — groupe`.slice(0, 128),
      status: statut,
      budget_in_micro_currency: micro,
      billable_event: c.objectif === 'trafic' ? 'CLICKTHROUGH' : 'IMPRESSION',
      targeting_spec: ciblage,
      auto_targeting_enabled: true,
    }),
    annonce: (adGroupId: string) => ({
      ad_account_id: adAccountId,
      ad_group_id: adGroupId,
      creative_type: 'REGULAR',
      pin_id: pinId,
      name: `${c.nom} — annonce`.slice(0, 128),
      status: statut,
    }),
  }
}

interface LotCreation {
  items?: Array<{ data?: { id?: string }; exceptions?: Array<{ code?: number; message?: string }> }>
}

/** Pinterest crée par lots : un tableau en entrée, un tableau de résultats en sortie. */
async function creerUn(token: string, chemin: string, objet: unknown, quoi: string): Promise<string> {
  const r = await appelPinterest<LotCreation>(token, chemin, { methode: 'POST', corps: [objet] })
  const item = r.items?.[0]
  const id = item?.data?.id
  if (!id) {
    const raison = item?.exceptions?.[0]?.message
    throw new SocialError(`Pinterest a refusé ${quoi}${raison ? ` : ${raison}` : '.'}`, true)
  }
  return id
}

/**
 * La chaîne complète : épingle, campagne, groupe d'annonces, annonce.
 * Une panne en cours de route laisse ce qui est déjà créé, EN PAUSE, et le dit.
 */
export async function creerCampagnePinterest(
  token: string,
  adAccountId: string,
  c: Campagne,
  boardId?: string | null,
): Promise<{ campaignId: string; adGroupId: string; adId: string; pinId: string; boardId: string }> {
  const epingle = await creerEpingle(token, {
    titre: c.creative.titre,
    description: c.creative.texte,
    images: [c.creative.image],
    lien: c.creative.url,
    boardId,
  })
  const plan = construireCampagne(adAccountId, c, epingle.pinId)
  const chemin = `/v5/ad_accounts/${encodeURIComponent(adAccountId)}`

  const campaignId = await creerUn(token, `${chemin}/campaigns`, plan.campagne, 'la campagne')
  try {
    const adGroupId = await creerUn(token, `${chemin}/ad_groups`, plan.groupe(campaignId), "le groupe d'annonces")
    const adId = await creerUn(token, `${chemin}/ads`, plan.annonce(adGroupId), "l'annonce")
    return { campaignId, adGroupId, adId, pinId: epingle.pinId, boardId: epingle.boardId }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Pinterest a refusé la suite.'
    throw new SocialError(
      `La campagne ${campaignId} a été créée chez Pinterest mais sa mise en place est incomplète : ${detail}`,
      err instanceof SocialError ? err.actionnable : false,
    )
  }
}

function etatCampagne(statut: string | undefined): string {
  switch (statut) {
    case 'ACTIVE':
      return 'active'
    case 'PAUSED':
      return 'brouillon'
    case 'ARCHIVED':
    case 'COMPLETED':
      return 'terminee'
    default:
      return 'en_revue'
  }
}

export async function campagnesPinterest(token: string, adAccountId: string): Promise<ResultatCampagne[]> {
  const r = await appelPinterest<{ items?: Array<{ id: string; status?: string }> }>(
    token,
    `/v5/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns`,
    { query: { page_size: '100' } },
  )
  return (r.items ?? []).map((i) => ({
    externalId: i.id,
    etat: etatCampagne(i.status),
    url: `https://ads.pinterest.com/advertiser/${adAccountId}/`,
  }))
}

const COLONNES = ['SPEND_IN_MICRO_DOLLAR', 'IMPRESSION_1', 'CLICKTHROUGH_1', 'TOTAL_CONVERSIONS']

/** Les performances de campagnes d'un compte publicitaire, micro-devise convertie en centimes. */
export async function performancesPinterest(
  token: string,
  adAccountId: string,
  campaignIds: string[],
  devise = 'USD',
  jours = 90,
): Promise<Performances[]> {
  if (!campaignIds.length) return []
  const fin = new Date()
  const debut = new Date(fin.getTime() - jours * 86400000)
  const jour = (d: Date) => d.toISOString().slice(0, 10)

  const lignes = await appelPinterest<unknown>(
    token,
    `/v5/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns/analytics`,
    {
      query: {
        start_date: jour(debut),
        end_date: jour(fin),
        campaign_ids: campaignIds.join(','),
        columns: COLONNES.join(','),
        granularity: 'TOTAL',
      },
    },
  )

  // Tolérant sur la forme : tableau de lignes, métriques à plat ou sous `metrics`.
  const tableau = Array.isArray(lignes) ? lignes : []
  const totaux = new Map<string, Performances>()
  const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  for (const brut of tableau as Array<Record<string, unknown>>) {
    const m = ((brut.metrics as Record<string, unknown> | undefined) ?? brut) as Record<string, unknown>
    const id = String(brut.CAMPAIGN_ID ?? brut.campaign_id ?? m.CAMPAIGN_ID ?? '')
    if (!id) continue
    const t =
      totaux.get(id) ?? { externalId: id, impressions: 0, clics: 0, depense: 0, conversions: null, devise }
    t.impressions += nombre(m.IMPRESSION_1)
    t.clics += nombre(m.CLICKTHROUGH_1)
    t.depense += Math.round(nombre(m.SPEND_IN_MICRO_DOLLAR) / MICRO_PAR_CENTIME)
    if (typeof m.TOTAL_CONVERSIONS === 'number') t.conversions = (t.conversions ?? 0) + m.TOTAL_CONVERSIONS
    totaux.set(id, t)
  }
  return campaignIds.map(
    (id) => totaux.get(id) ?? { externalId: id, impressions: 0, clics: 0, depense: 0, conversions: null, devise },
  )
}

// --- Base de données (tout ce qui suit touche Prisma, importé à la demande) -------

/** Prisma n'est chargé qu'ici : les fonctions pures ci-dessus s'éprouvent sans base. */
async function bd() {
  return (await import('../lib/prisma.js')).prisma
}

const MARGE_EXPIRATION_MS = 60_000

/**
 * Au retour de l'autorisation : jetons, compte Pinterest, comptes publicitaires.
 * Rend le nombre de comptes raccordés.
 */
async function finaliser(userId: string, params: Record<string, string>, redirectUri: string): Promise<number> {
  if (!params.code) {
    throw new SocialError("Pinterest n'a renvoyé aucun code d'autorisation : relancez la connexion.", true)
  }
  const prisma = await bd()
  const jetons = await echangerCodePinterest(params.code, redirectUri)
  const expire = jetons.expiresIn ? new Date(Date.now() + jetons.expiresIn * 1000) : null
  const commun = { connected: true, token: jetons.accessToken, tokenExpires: expire }

  const profil = await appelPinterest<{ id?: string; username?: string }>(jetons.accessToken, '/v5/user_account')
  const externalId = profil.id ?? profil.username
  if (!externalId) throw new SocialError("Pinterest n'a pas renvoyé l'identifiant du compte.", true)

  const ancien = await prisma.socialAccount.findUnique({
    where: { userId_provider_externalId: { userId, provider: 'pinterest', externalId } },
    select: { meta: true },
  })
  const metaAncien = (ancien?.meta as Record<string, unknown> | null) ?? {}
  const meta = { ...metaAncien, refreshToken: jetons.refreshToken }
  const label = profil.username ? `Pinterest @${profil.username}` : 'Pinterest'

  await prisma.socialAccount.upsert({
    where: { userId_provider_externalId: { userId, provider: 'pinterest', externalId } },
    create: { userId, provider: 'pinterest', externalId, platform: 'pinterest', label, isAdAccount: false, ...commun, meta },
    update: { label, ...commun, meta },
  })
  let n = 1

  // Les comptes publicitaires : un refus (pas d'accès publicitaire) ne bloque pas le reste.
  try {
    const l = await appelPinterest<{ items?: Array<{ id: string; name?: string; currency?: string }> }>(
      jetons.accessToken,
      '/v5/ad_accounts',
    )
    for (const a of l.items ?? []) {
      const nom = a.name ? `Pinterest Ads : ${a.name}` : `Pinterest Ads ${a.id}`
      const metaAds = { refreshToken: jetons.refreshToken, currency: a.currency ?? null, pinterestAccount: externalId }
      await prisma.socialAccount.upsert({
        where: { userId_provider_externalId: { userId, provider: 'pinterest', externalId: a.id } },
        create: { userId, provider: 'pinterest', externalId: a.id, platform: 'pinterest-ads', label: nom, isAdAccount: true, ...commun, meta: metaAds },
        update: { label: nom, isAdAccount: true, ...commun, meta: metaAds },
      })
      n++
    }
  } catch {
    // Compte sans accès publicitaire : l'épinglage reste raccordé.
  }
  return n
}

/** Le compte avec un jeton valable : renouvelé et enregistré s'il est (presque) expiré. */
async function compteAvecJeton(userId: string, externalId: string) {
  const prisma = await bd()
  const compte = await prisma.socialAccount.findFirst({ where: { userId, provider: 'pinterest', externalId } })
  if (!compte) throw new SocialError('Ce compte ne vous appartient pas.', true)
  if (!compte.token) {
    throw new SocialError(`${compte.label ?? 'Ce compte'} n'a plus de jeton : reliez-le à nouveau.`, true)
  }
  const meta = (compte.meta as Record<string, unknown> | null) ?? {}
  let token = compte.token

  if (compte.tokenExpires && compte.tokenExpires.getTime() - Date.now() < MARGE_EXPIRATION_MS) {
    const refresh = typeof meta.refreshToken === 'string' ? meta.refreshToken : null
    if (!refresh) {
      throw new SocialError('Votre connexion Pinterest a expiré : reliez le compte à nouveau.', true)
    }
    const neuf = await rafraichirJetonPinterest(refresh)
    token = neuf.accessToken
    const expire = neuf.expiresIn ? new Date(Date.now() + neuf.expiresIn * 1000) : null
    const nouveauMeta = { ...meta, refreshToken: neuf.refreshToken ?? refresh }
    // Un jeton sert à tout le profil : les lignes (épingles, régie) sont mises à jour ensemble.
    const pinterestAccount = typeof meta.pinterestAccount === 'string' ? meta.pinterestAccount : compte.externalId
    const freres = await prisma.socialAccount.findMany({
      where: { userId, provider: 'pinterest' },
      select: { id: true, externalId: true, meta: true },
    })
    for (const f of freres) {
      const fm = (f.meta as Record<string, unknown> | null) ?? {}
      const memeProfil = f.externalId === pinterestAccount || fm.pinterestAccount === pinterestAccount
      if (!memeProfil && f.id !== compte.id) continue
      await prisma.socialAccount.update({
        where: { id: f.id },
        data: { token, tokenExpires: expire, meta: { ...fm, refreshToken: nouveauMeta.refreshToken } },
      })
    }
  }
  return { compte, token, meta }
}

/** Le premier compte Pinterest (épingles) du vendeur, quand une campagne a besoin de son tableau. */
async function compteEpingles(userId: string, pinterestAccount: string | null) {
  const prisma = await bd()
  const c = await prisma.socialAccount.findFirst({
    where: { userId, provider: 'pinterest', platform: 'pinterest', ...(pinterestAccount ? { externalId: pinterestAccount } : {}) },
    select: { id: true, meta: true },
  })
  return c
}

async function memoriserTableau(compteId: string, boardId: string) {
  try {
    const prisma = await bd()
    const c = await prisma.socialAccount.findUnique({ where: { id: compteId }, select: { meta: true } })
    const meta = (c?.meta as Record<string, unknown> | null) ?? {}
    if (meta.boardId === boardId) return
    await prisma.socialAccount.update({ where: { id: compteId }, data: { meta: { ...meta, boardId } } })
  } catch {
    // Mémoriser le tableau est un confort : l'épingle est déjà partie.
  }
}

function lienPinterest(profilId: string): string {
  const { appId } = configuration()
  const url = new URL('https://www.pinterest.com/oauth/')
  url.searchParams.set('client_id', appId)
  // La même adresse de retour pour les deux moteurs, déclarée telle quelle dans l'app.
  url.searchParams.set('redirect_uri', callbackSocial('pinterest'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', PORTEE_PINTEREST)
  // `state` signé : sans signature, rejouer l'adresse de retour rattacherait
  // le compte d'un vendeur à celui d'un autre.
  url.searchParams.set('state', signerEtat(profilId, 'pinterest'))
  return url.toString()
}

async function lister(profilId: string, platform: string): Promise<CompteRaccorde[]> {
  const prisma = await bd()
  return prisma.socialAccount.findMany({
    where: { userId: profilId, provider: 'pinterest', platform },
    // Le jeton n'est pas lu ici : cette liste remonte jusqu'au navigateur.
    select: { externalId: true, platform: true, label: true, connected: true, isAdAccount: true },
    orderBy: [{ label: 'asc' }],
  })
}

export const pinterest: SocialProvider = {
  id: 'pinterest',
  label: 'Pinterest',
  plateformes: ['pinterest'],

  finaliserConnexion: finaliser,

  async creerProfil(userId) {
    return userId
  },

  listerComptes: (profilId) => lister(profilId, 'pinterest'),

  async lienDeConnexion(profilId) {
    return lienPinterest(profilId)
  },

  async publier(profilId, p: Publication): Promise<ResultatPublication> {
    if (p.quand && p.quand.getTime() > Date.now()) {
      throw new SocialError("La publication programmée n'est pas encore disponible sur Pinterest : publiez maintenant.")
    }
    const images = (p.medias ?? []).filter((m) => /^https:\/\//.test(m))
    // Refusé avant tout appel, pour chaque compte : une épingle sans image n'existe pas.
    if (!images.length) {
      const erreur = 'Pinterest exige au moins une image : ajoutez un visuel.'
      return {
        externalId: '',
        etat: 'echouee',
        parCompte: p.comptes.map((compte) => ({ compte, etat: 'echouee', url: null, erreur })),
      }
    }

    const parCompte: ResultatPublication['parCompte'] = []
    for (const externalId of p.comptes) {
      try {
        const { compte, token, meta } = await compteAvecJeton(profilId, externalId)
        if (compte.isAdAccount) {
          throw new SocialError('Un compte publicitaire ne publie pas d’épingle : choisissez votre compte Pinterest.', true)
        }
        const boardConnu = typeof meta.boardId === 'string' ? meta.boardId : null
        const r = await creerEpingle(token, {
          titre: p.texte,
          description: p.texte,
          images,
          boardId: boardConnu,
        })
        if (r.boardId !== boardConnu) await memoriserTableau(compte.id, r.boardId)
        parCompte.push({ compte: externalId, etat: 'publiee', url: r.url, erreur: null })
      } catch (err) {
        parCompte.push({
          compte: externalId,
          etat: 'echouee',
          url: null,
          erreur: err instanceof Error ? err.message : 'Publication refusée.',
        })
      }
    }
    const reussies = parCompte.filter((c) => c.etat === 'publiee').length
    return {
      externalId: parCompte.find((c) => c.etat === 'publiee')?.url?.match(/pin\/([^/]+)/)?.[1] ?? '',
      etat: reussies === 0 ? 'echouee' : reussies === parCompte.length ? 'publiee' : 'partielle',
      parCompte,
    }
  },
}

export const pinterestAds: SocialProvider = {
  id: 'pinterest-ads',
  label: 'Pinterest Ads',
  plateformes: ['pinterest-ads'],

  finaliserConnexion: finaliser,

  async creerProfil(userId) {
    return userId
  },

  listerComptes: (profilId) => lister(profilId, 'pinterest-ads'),

  async lienDeConnexion(profilId) {
    return lienPinterest(profilId)
  },

  async creerCampagne(profilId, c: Campagne): Promise<ResultatCampagne> {
    const { token, meta } = await compteAvecJeton(profilId, c.compte)
    const profil = typeof meta.pinterestAccount === 'string' ? meta.pinterestAccount : null
    const epingles = await compteEpingles(profilId, profil)
    const boardConnu =
      epingles?.meta && typeof (epingles.meta as Record<string, unknown>).boardId === 'string'
        ? ((epingles.meta as Record<string, unknown>).boardId as string)
        : null

    const r = await creerCampagnePinterest(token, c.compte, c, boardConnu)
    if (epingles && r.boardId !== boardConnu) await memoriserTableau(epingles.id, r.boardId)
    return {
      externalId: r.campaignId,
      etat: c.activer ? 'en_revue' : 'brouillon',
      url: `https://ads.pinterest.com/advertiser/${c.compte}/`,
    }
  },

  async listerCampagnes(profilId): Promise<ResultatCampagne[]> {
    const comptes = await lister(profilId, 'pinterest-ads')
    const tout: ResultatCampagne[] = []
    for (const a of comptes) {
      if (!a.connected) continue
      const { token } = await compteAvecJeton(profilId, a.externalId)
      tout.push(...(await campagnesPinterest(token, a.externalId)))
    }
    return tout
  },

  async performances(profilId, externalIds): Promise<Performances[]> {
    const comptes = await lister(profilId, 'pinterest-ads')
    const trouvees = new Map<string, Performances>()
    for (const a of comptes) {
      if (!a.connected) continue
      const { token, meta } = await compteAvecJeton(profilId, a.externalId)
      const siennes = (await campagnesPinterest(token, a.externalId))
        .map((x) => x.externalId)
        .filter((id) => externalIds.includes(id))
      if (!siennes.length) continue
      const devise = typeof meta.currency === 'string' && meta.currency ? meta.currency : 'USD'
      for (const p of await performancesPinterest(token, a.externalId, siennes, devise)) trouvees.set(p.externalId, p)
    }
    return externalIds.flatMap((id) => {
      const p = trouvees.get(id)
      return p ? [p] : []
    })
  },
}
