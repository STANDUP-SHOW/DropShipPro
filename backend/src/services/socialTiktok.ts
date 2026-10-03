import { prisma } from '../lib/prisma.js'
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
 * TikTok en direct : publier sur le compte du vendeur, et acheter de la
 * publicité sur son compte annonceur.
 *
 * **Écrit d'après la documentation publique, jamais exécuté contre le vrai
 * TikTok.** Le banc (`check-tiktok.ts`) rejoue un faux serveur dont le contrat
 * est écrit en dur d'après cette documentation : il prouve que notre code fait
 * ce que nous croyons que TikTok attend, pas que TikTok l'attend vraiment. Les
 * hypothèses incertaines sont marquées « HYPOTHÈSE » ci-dessous — c'est là qu'il
 * faudra regarder en premier au premier essai réel.
 *
 * Deux produits TikTok distincts, donc deux adaptateurs et deux applications
 * développeur :
 *
 * - `tiktok` : Login Kit v2 + Content Posting API (publication organique).
 * - `tiktokAds` : TikTok API for Business, Marketing API v1.3 (campagnes).
 *
 * **Publier avec `PULL_FROM_URL`.** TikTok va chercher lui-même le média à
 * l'adresse donnée. Il exige pour cela que le **domaine** qui l'héberge (ou le
 * préfixe d'adresse) soit vérifié dans le portail développeur TikTok, rubrique
 * Content Posting API > Verify domains. Sans cette vérification, l'initialisation
 * échoue en `url_ownership_unverified` : le message le dit au vendeur... et à
 * Max, qui est le seul à pouvoir le corriger.
 *
 * **Application non auditée = publications privées.** Tant que TikTok n'a pas
 * audité l'app (Direct Post), toute publication est forcée en `SELF_ONLY`
 * (visible du seul vendeur). Le code le détecte avec `creator_info/query` et le
 * dit en clair plutôt que d'annoncer une publication que personne ne verra.
 *
 * **Jamais d'identifiants.** Le vendeur s'authentifie chez TikTok, nous ne
 * recevons qu'un jeton qu'il révoque quand il veut. Il vit en base
 * (`prisma.socialAccount`) et ne sort jamais vers le navigateur : la liste des
 * comptes choisit ses colonnes explicitement.
 *
 * **Structure.** Toute la logique HTTP est dans des fonctions exportées qui
 * prennent un jeton et ne touchent pas à la base : le banc les éprouve sans
 * base de données. Seuls les deux objets `SocialProvider` lisent et écrivent
 * `socialAccount`.
 */

// ---------------------------------------------------------------------------
// Adresses et configuration (lues à l'appel : le banc les change après coup)
// ---------------------------------------------------------------------------

function apiTiktok(): string {
  return (process.env.TIKTOK_API_URL?.trim() || 'https://open.tiktokapis.com').replace(/\/$/, '')
}

function apiAds(): string {
  return (process.env.TIKTOK_ADS_API_URL?.trim() || 'https://business-api.tiktok.com/open_api').replace(/\/$/, '')
}

/** Vrai quand la publication organique est réellement utilisable. */
export function tiktokConfigure(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim())
}

/** Vrai quand la publicité TikTok est réellement utilisable. */
export function tiktokAdsConfigure(): boolean {
  return Boolean(process.env.TIKTOK_ADS_APP_ID?.trim() && process.env.TIKTOK_ADS_SECRET?.trim())
}

function configurationTiktok() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim()
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim()
  if (!clientKey || !clientSecret) {
    throw new SocialError(
      "L'application TikTok n'est pas configurée : TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET manquent.",
    )
  }
  return { clientKey, clientSecret }
}

function configurationAds() {
  const appId = process.env.TIKTOK_ADS_APP_ID?.trim()
  const secret = process.env.TIKTOK_ADS_SECRET?.trim()
  if (!appId || !secret) {
    throw new SocialError(
      "L'application TikTok Ads n'est pas configurée : TIKTOK_ADS_APP_ID et TIKTOK_ADS_SECRET manquent.",
    )
  }
  return { appId, secret }
}

/*
 * Les autorisations demandées, et rien de plus.
 *
 * - `user.info.basic` : lire le nom et l'identifiant du compte raccordé.
 * - `video.publish` : Direct Post, publier sans passer par l'application mobile.
 * - `video.upload` : envoyer en brouillon, repli quand le Direct Post est refusé.
 */
const PORTEE_TIKTOK = 'user.info.basic,video.publish,video.upload'

// ---------------------------------------------------------------------------
// Organique : l'appel HTTP et la traduction des refus
// ---------------------------------------------------------------------------

interface ReponseOpen {
  data?: Record<string, unknown>
  error?: { code?: string; message?: string; log_id?: string }
  // Point d'accès des jetons : réponse à plat, pas d'enveloppe `data`.
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_expires_in?: number
  open_id?: string
  scope?: string
  error_description?: string
}

/**
 * Traduit un code d'erreur TikTok (Open API v2) en un message qui dit quoi faire.
 *
 * TikTok répond en 4xx avec `error.code` en snake_case et un message anglais.
 * Les refus qui décident du geste du vendeur sont réécrits ; le reste est
 * rendu tel quel, préfixé, pour ne pas le perdre.
 */
export function traduireErreurTiktok(code: string, message: string): SocialError {
  switch (code) {
    case 'access_token_invalid':
    case 'invalid_grant':
    case 'access_token_expired':
      return new SocialError('Votre connexion TikTok a expiré : reliez le compte à nouveau.', true)
    case 'scope_not_authorized':
    case 'scope_permission_missed':
      return new SocialError(
        "TikTok refuse cette action faute d'autorisation : le vendeur n'a pas accepté toutes les permissions. Reliez le compte et acceptez-les toutes.",
        true,
      )
    case 'rate_limit_exceeded':
      return new SocialError('TikTok a limité le débit des appels. Réessayez dans quelques minutes.')
    case 'spam_risk_too_many_posts':
    case 'spam_risk_user_banned_from_posting':
    case 'spam_risk':
      return new SocialError(
        "TikTok bloque les publications de ce compte (limite quotidienne atteinte ou suspicion de spam). Réessayez plus tard.",
        true,
      )
    case 'reached_active_user_cap':
      return new SocialError(
        "L'application a atteint son plafond quotidien de comptes actifs chez TikTok. Réessayez demain.",
      )
    case 'unaudited_client_can_only_post_to_private_accounts':
      return new SocialError(
        "Notre application n'a pas encore été auditée par TikTok : elle ne peut publier que sur un compte réglé en privé. Passez le compte en privé le temps de l'examen.",
        true,
      )
    case 'url_ownership_unverified':
      return new SocialError(
        "TikTok n'a pas pu récupérer le média : le domaine qui l'héberge n'est pas vérifié dans le portail développeur TikTok (Content Posting API > Verify domains). Ce réglage est à faire côté DropShipper, pas côté vendeur.",
      )
    case 'privacy_level_option_mismatch':
      return new SocialError("Le niveau de confidentialité demandé n'est pas offert par ce compte TikTok.", true)
    case 'picture_size_check_failed':
    case 'file_format_check_failed':
    case 'video_pull_failed':
    case 'photo_pull_failed':
      return new SocialError(
        `TikTok n'a pas pu lire le média (${message || code}). Formats acceptés : vidéo MP4/MOV/WEBM, images JPEG ou WEBP.`,
        true,
      )
    case 'invalid_param':
    case 'invalid_publish_id':
      return new SocialError(`TikTok : paramètre refusé (${message || code}).`)
    case 'internal_error':
      return new SocialError('TikTok a un problème de son côté. Réessayez dans un moment.')
    default:
      return new SocialError(`TikTok : ${message || code}`, true)
  }
}

/**
 * Un appel à l'API ouverte de TikTok (Login Kit, Content Posting).
 *
 * Le succès porte `error.code === 'ok'` ; le refus arrive en 4xx avec un autre
 * code. Les points d'accès des jetons répondent à plat (pas de `data`) et
 * en `application/x-www-form-urlencoded`.
 */
export async function appelTiktok<T = ReponseOpen>(
  chemin: string,
  options: {
    token?: string
    methode?: 'GET' | 'POST'
    json?: unknown
    formulaire?: Record<string, string>
    query?: Record<string, string>
  } = {},
): Promise<T> {
  const url = new URL(`${apiTiktok()}/${chemin.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v)

  const entetes: Record<string, string> = {}
  if (options.token) entetes.Authorization = `Bearer ${options.token}`
  let corps: string | undefined
  if (options.formulaire) {
    entetes['Content-Type'] = 'application/x-www-form-urlencoded'
    corps = new URLSearchParams(options.formulaire).toString()
  } else if (options.json !== undefined) {
    entetes['Content-Type'] = 'application/json; charset=UTF-8'
    corps = JSON.stringify(options.json)
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: options.methode ?? (corps ? 'POST' : 'GET'),
      headers: entetes,
      body: corps,
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new SocialError('TikTok est injoignable. Réessayez dans un moment.')
  }

  const donnees = (await res.json().catch(() => ({}))) as ReponseOpen & Record<string, unknown>

  // Point d'accès des jetons : { error: 'invalid_grant', error_description } en chaîne.
  if (typeof donnees.error === 'string') {
    throw traduireErreurTiktok(donnees.error, donnees.error_description ?? '')
  }
  const code = donnees.error?.code
  if (!res.ok || (code && code !== 'ok')) {
    throw traduireErreurTiktok(code ?? `http_${res.status}`, donnees.error?.message ?? `TikTok a répondu ${res.status}.`)
  }
  return donnees as T
}

// ---------------------------------------------------------------------------
// Organique : OAuth, jetons, profil — fonctions pures (jeton en paramètre)
// ---------------------------------------------------------------------------

export interface JetonsTiktok {
  accessToken: string
  refreshToken: string
  /** Date d'expiration du jeton d'accès. */
  expire: Date
  /** Date d'expiration du jeton de renouvellement. */
  refreshExpire: Date
  openId: string
}

function lireJetons(r: ReponseOpen): JetonsTiktok {
  if (!r.access_token || !r.refresh_token || !r.open_id) {
    throw new SocialError("TikTok n'a pas rendu de jeton exploitable. Recommencez la connexion.", true)
  }
  const maintenant = Date.now()
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expire: new Date(maintenant + (r.expires_in ?? 86400) * 1000),
    refreshExpire: new Date(maintenant + (r.refresh_expires_in ?? 365 * 86400) * 1000),
    openId: r.open_id,
  }
}

/** Échange le code d'autorisation contre un jeton d'accès (24 h) et un jeton de renouvellement. */
export async function echangerCodeTiktok(code: string, redirectUri: string): Promise<JetonsTiktok> {
  const { clientKey, clientSecret } = configurationTiktok()
  const r = await appelTiktok('/v2/oauth/token/', {
    formulaire: {
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
  })
  return lireJetons(r)
}

/**
 * Renouvelle le jeton d'accès avec le jeton de renouvellement.
 *
 * TikTok peut rendre un NOUVEAU jeton de renouvellement : c'est celui-là qu'il
 * faut garder, l'ancien peut ne plus servir.
 */
export async function rafraichirJetonTiktok(refreshToken: string): Promise<JetonsTiktok> {
  const { clientKey, clientSecret } = configurationTiktok()
  const r = await appelTiktok('/v2/oauth/token/', {
    formulaire: {
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  })
  return lireJetons(r)
}

/** Vrai quand le jeton expire dans la minute, ou a déjà expiré. */
export function jetonExpire(expire: Date | null | undefined, marge = 60_000): boolean {
  return Boolean(expire && expire.getTime() - marge <= Date.now())
}

/** Le nom affiché et l'identifiant du compte TikTok raccordé. */
export async function lireProfilTiktok(token: string): Promise<{ openId: string; nom: string }> {
  const r = await appelTiktok<{ data?: { user?: { open_id?: string; display_name?: string } } }>('/v2/user/info/', {
    token,
    query: { fields: 'open_id,display_name' },
  })
  const u = r.data?.user
  return { openId: u?.open_id ?? '', nom: u?.display_name ?? '' }
}

// ---------------------------------------------------------------------------
// Organique : publication — fonctions pures
// ---------------------------------------------------------------------------

export interface InfosCreateur {
  options: string[]
  pseudo: string
}

/** Ce que ce compte a le droit de faire — à interroger avant chaque publication. */
export async function infosCreateurTiktok(token: string): Promise<InfosCreateur> {
  const r = await appelTiktok<{ data?: { privacy_level_options?: string[]; creator_username?: string } }>(
    '/v2/post/publish/creator_info/query/',
    { token, methode: 'POST', json: {} },
  )
  return { options: r.data?.privacy_level_options ?? [], pseudo: r.data?.creator_username ?? '' }
}

/**
 * Le niveau de confidentialité à demander.
 *
 * Public quand le compte l'offre ; sinon le premier offert. Une app non
 * auditée ne reçoit que `SELF_ONLY` : c'est dit à part, voir `publierSurTiktok`.
 */
export function choisirConfidentialite(options: string[]): string {
  if (!options.length) {
    throw new SocialError(
      "TikTok n'offre aucun niveau de confidentialité pour ce compte : il ne peut pas publier par l'application pour le moment.",
      true,
    )
  }
  return options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0]
}

const EXTENSION_VIDEO = /\.(mp4|mov|webm)(\?|#|$)/i

/** Sépare les médias en une vidéo (la première) ou des images, https seulement. */
export function classerMedias(medias: string[]): { video: string | null; images: string[] } {
  const https = medias.filter((m) => /^https:\/\//i.test(m))
  const video = https.find((m) => EXTENSION_VIDEO.test(m)) ?? null
  return { video, images: video ? [] : https.slice(0, 35) }
}

export interface ResultatTiktok {
  /** publiee : terminée côté TikTok. planifiee : TikTok traite encore. */
  etat: 'publiee' | 'planifiee'
  publishId: string
  /** Adresse de la publication, seulement quand TikTok la donne. */
  url: string | null
  /** Ce que le vendeur doit savoir : publication privée, traitement en cours. */
  note: string | null
}

interface OptionsPublication {
  /** Nombre d'interrogations du statut. */
  tentatives?: number
  /** Délai entre deux interrogations, en ms. */
  delaiMs?: number
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Publie une vidéo ou des images sur TikTok, et rend l'état honnêtement.
 *
 * Ordre : (1) refus d'un texte seul AVANT tout appel — TikTok exige une vidéo
 * ou des images ; (2) `creator_info/query`, obligatoire avant chaque publication
 * et seule source des niveaux de confidentialité permis ; (3) initialisation ;
 * (4) quelques interrogations brèves du statut. La suite du traitement chez
 * TikTok peut durer plus longtemps : on rend alors `planifiee`, pas `publiee`.
 */
export async function publierSurTiktok(
  token: string,
  texte: string,
  medias: string[],
  options: OptionsPublication = {},
): Promise<ResultatTiktok> {
  const { video, images } = classerMedias(medias)
  if (!video && !images.length) {
    throw new SocialError(
      'TikTok exige une vidéo (MP4, MOV, WEBM) ou des images : un texte seul ne peut pas être publié. Ajoutez un visuel, en adresse https.',
      true,
    )
  }

  const createur = await infosCreateurTiktok(token)
  const confidentialite = choisirConfidentialite(createur.options)

  let publishId: string
  if (video) {
    const r = await appelTiktok<{ data?: { publish_id?: string } }>('/v2/post/publish/video/init/', {
      token,
      json: {
        post_info: { title: texte.slice(0, 2200), privacy_level: confidentialite },
        source_info: { source: 'PULL_FROM_URL', video_url: video },
      },
    })
    publishId = r.data?.publish_id ?? ''
  } else {
    // Titre : 90 caractères au plus ; le reste du texte part en description.
    const titre = texte.slice(0, 90)
    const r = await appelTiktok<{ data?: { publish_id?: string } }>('/v2/post/publish/content/init/', {
      token,
      json: {
        post_info: {
          title: titre,
          description: texte.slice(0, 4000),
          privacy_level: confidentialite,
          disable_comment: false,
          auto_add_music: true,
        },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: images },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      },
    })
    publishId = r.data?.publish_id ?? ''
  }
  if (!publishId) throw new SocialError("TikTok n'a pas confirmé la publication (aucun identifiant rendu).")

  const privee =
    confidentialite === 'SELF_ONLY'
      ? "Publication privée : l'application DropShipper n'a pas encore été auditée par TikTok, qui ne lui permet que le mode « moi uniquement ». Seul le vendeur la voit."
      : null

  // Interrogations brèves du statut.
  const tentatives = options.tentatives ?? 4
  const delai = options.delaiMs ?? 1500
  for (let i = 0; i < tentatives; i++) {
    const s = await appelTiktok<{
      data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }
    }>('/v2/post/publish/status/fetch/', { token, json: { publish_id: publishId } })
    const statut = s.data?.status ?? ''

    if (statut === 'FAILED') {
      throw traduireErreurTiktok(s.data?.fail_reason ?? 'internal_error', `échec du traitement (${s.data?.fail_reason ?? 'inconnu'})`)
    }
    if (statut === 'PUBLISH_COMPLETE') {
      const idPost = s.data?.publicaly_available_post_id?.[0]
      return {
        etat: 'publiee',
        publishId,
        url: idPost && createur.pseudo ? `https://www.tiktok.com/@${createur.pseudo}/video/${idPost}` : null,
        note: privee,
      }
    }
    // Le brouillon envoyé dans la boîte du vendeur n'est PAS une publication.
    if (statut === 'SEND_TO_USER_INBOX') {
      return {
        etat: 'planifiee',
        publishId,
        url: null,
        note: "Le contenu attend dans la boîte de réception TikTok du vendeur : il doit le valider dans l'application TikTok.",
      }
    }
    if (i < tentatives - 1) await attendre(delai)
  }

  return {
    etat: 'planifiee',
    publishId,
    url: null,
    note: [privee, 'TikTok traite encore la publication : elle apparaîtra dans quelques minutes.'].filter(Boolean).join(' '),
  }
}

// ---------------------------------------------------------------------------
// Organique : le moteur (seul à toucher la base)
// ---------------------------------------------------------------------------

interface MetaTiktok {
  refreshToken?: string
  refreshExpires?: string
  openId?: string
}

/**
 * Le jeton valide d'un compte, renouvelé et enregistré s'il a expiré.
 *
 * TikTok donne un jeton d'accès de 24 h seulement : sans renouvellement
 * automatique, le vendeur devrait reconnecter son compte chaque jour.
 */
async function jetonTiktokValide(userId: string, externalId: string): Promise<string> {
  const compte = await prisma.socialAccount.findFirst({ where: { userId, provider: 'tiktok', externalId } })
  if (!compte) throw new SocialError('Ce compte ne vous appartient pas.', true)
  if (!compte.token) {
    throw new SocialError(`${compte.label ?? 'Ce compte'} n'a plus de jeton : reliez-le à nouveau.`, true)
  }
  if (!jetonExpire(compte.tokenExpires)) return compte.token

  const meta = (compte.meta ?? {}) as MetaTiktok
  if (!meta.refreshToken || (meta.refreshExpires && new Date(meta.refreshExpires).getTime() < Date.now())) {
    await prisma.socialAccount.update({ where: { id: compte.id }, data: { connected: false } })
    throw new SocialError('Votre connexion TikTok a expiré : reliez le compte à nouveau.', true)
  }

  try {
    const j = await rafraichirJetonTiktok(meta.refreshToken)
    await prisma.socialAccount.update({
      where: { id: compte.id },
      data: {
        token: j.accessToken,
        tokenExpires: j.expire,
        connected: true,
        meta: { refreshToken: j.refreshToken, refreshExpires: j.refreshExpire.toISOString(), openId: j.openId },
      },
    })
    return j.accessToken
  } catch (err) {
    // Un renouvellement refusé par TikTok (révoqué) : le compte est déconnecté.
    if (err instanceof SocialError && err.actionnable) {
      await prisma.socialAccount.update({ where: { id: compte.id }, data: { connected: false } })
    }
    throw err
  }
}

export const tiktok: SocialProvider = {
  id: 'tiktok',
  label: 'TikTok',
  plateformes: ['tiktok'],

  // Pas de profil chez un tiers : le vendeur est son propre profil.
  async creerProfil(userId) {
    return userId
  },

  async listerComptes(profilId): Promise<CompteRaccorde[]> {
    return prisma.socialAccount.findMany({
      where: { userId: profilId, provider: 'tiktok' },
      // Le jeton n'est pas lu ici : cette liste remonte jusqu'au navigateur.
      select: { externalId: true, platform: true, label: true, connected: true, isAdAccount: true },
      orderBy: [{ platform: 'asc' }],
    })
  },

  async lienDeConnexion(profilId, _platform, _retour) {
    const { clientKey } = configurationTiktok()
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
    url.searchParams.set('client_key', clientKey)
    url.searchParams.set('scope', PORTEE_TIKTOK)
    url.searchParams.set('response_type', 'code')
    // L'adresse de retour est la nôtre : TikTok exige qu'elle soit déclarée à l'identique.
    url.searchParams.set('redirect_uri', callbackSocial('tiktok'))
    // `state` signé et daté : voir oauthEtat.ts (faille CSRF classique d'OAuth).
    url.searchParams.set('state', signerEtat(profilId, 'tiktok'))
    return url.toString()
  },

  async finaliserConnexion(userId, params, redirectUri) {
    if (params.error) {
      throw new SocialError(
        params.error === 'access_denied'
          ? "Vous avez refusé l'accès à TikTok : la connexion n'a pas été faite."
          : `TikTok a refusé la connexion (${params.error_description ?? params.error}).`,
        true,
      )
    }
    if (!params.code) throw new SocialError("TikTok n'a pas renvoyé de code d'autorisation.", true)

    const j = await echangerCodeTiktok(params.code, redirectUri)
    const profil = await lireProfilTiktok(j.accessToken).catch(() => ({ openId: j.openId, nom: '' }))
    const openId = profil.openId || j.openId
    const meta = { refreshToken: j.refreshToken, refreshExpires: j.refreshExpire.toISOString(), openId }
    const label = profil.nom ? `@${profil.nom}` : 'Compte TikTok'

    await prisma.socialAccount.upsert({
      where: { userId_provider_externalId: { userId, provider: 'tiktok', externalId: openId } },
      create: {
        userId,
        provider: 'tiktok',
        externalId: openId,
        platform: 'tiktok',
        label,
        connected: true,
        token: j.accessToken,
        tokenExpires: j.expire,
        meta,
      },
      update: { label, connected: true, token: j.accessToken, tokenExpires: j.expire, meta },
    })
    return 1
  },

  async publier(profilId, p: Publication): Promise<ResultatPublication> {
    if (p.quand && p.quand.getTime() > Date.now()) {
      throw new SocialError("La publication programmée n'est pas disponible sur TikTok : publiez maintenant.")
    }

    const parCompte: ResultatPublication['parCompte'] = []
    // Compte par compte : un échec n'arrête pas les autres (même règle que Meta).
    for (const externalId of p.comptes) {
      try {
        // Refus du texte seul avant même de lire le jeton ou d'appeler TikTok.
        const { video, images } = classerMedias(p.medias ?? [])
        if (!video && !images.length) {
          throw new SocialError(
            'TikTok exige une vidéo (MP4, MOV, WEBM) ou des images : un texte seul ne peut pas être publié. Ajoutez un visuel.',
            true,
          )
        }
        const token = await jetonTiktokValide(profilId, externalId)
        const r = await publierSurTiktok(token, p.texte, p.medias ?? [])
        parCompte.push({
          compte: externalId,
          etat: r.etat,
          url: r.url,
          // Pas de champ « note » dans le contrat : la remarque (publication
          // privée, traitement en cours) voyage dans `erreur`, même pour un succès.
          erreur: r.note,
        })
      } catch (err) {
        parCompte.push({
          compte: externalId,
          etat: 'echouee',
          url: null,
          erreur: err instanceof Error ? err.message : 'Publication refusée.',
        })
      }
    }

    const reussies = parCompte.filter((c) => c.etat !== 'echouee')
    const toutes = reussies.length === parCompte.length
    return {
      externalId: reussies[0]?.compte ?? '',
      etat:
        reussies.length === 0
          ? 'echouee'
          : !toutes
            ? 'partielle'
            : reussies.every((c) => c.etat === 'publiee')
              ? 'publiee'
              : 'planifiee',
      parCompte,
    }
  },
}

// ---------------------------------------------------------------------------
// Publicité : l'appel HTTP et la traduction des refus (Marketing API v1.3)
// ---------------------------------------------------------------------------

const AUTH_ADS = new Set([40101, 40102, 40103, 40104, 40105, 40106])

/**
 * Traduit un `code` non nul de la Marketing API.
 *
 * Elle répond en HTTP 200 même en cas d'échec : seul `code` dit la vérité.
 * HYPOTHÈSE : les codes exacts ne sont pas tous documentés avec certitude.
 * 40001/40002 sont traités comme un refus d'authentification quand le message
 * parle de jeton ou de droits, sinon comme un paramètre refusé ; 40100 est la
 * limite de débit ; 40101 à 40106 des problèmes de jeton ou de permission.
 */
export function traduireErreurAds(code: number, message: string): SocialError {
  const parleAuth = /token|auth|permission|access/i.test(message)
  if (AUTH_ADS.has(code) || ((code === 40001 || code === 40002) && parleAuth)) {
    return new SocialError(
      'Votre connexion TikTok Ads a expiré ou ne couvre pas ce compte annonceur : reliez le compte à nouveau.',
      true,
    )
  }
  if (code === 40100) {
    return new SocialError('TikTok Ads a limité le débit des appels. Réessayez dans quelques minutes.')
  }
  if (code >= 50000) {
    return new SocialError('TikTok Ads a un problème de son côté. Réessayez dans un moment.')
  }
  return new SocialError(`TikTok Ads : ${message || `erreur ${code}`}`, true)
}

interface ReponseAds<T> {
  code?: number
  message?: string
  request_id?: string
  data?: T
}

/** Un appel à la Marketing API v1.3 : en-tête `Access-Token`, erreurs dans `code`. */
export async function appelAds<T>(
  chemin: string,
  options: {
    token?: string
    methode?: 'GET' | 'POST'
    json?: unknown
    /** Les valeurs non textuelles sont sérialisées en JSON, comme l'API l'exige. */
    query?: Record<string, unknown>
  } = {},
): Promise<T> {
  const url = new URL(`${apiAds()}/${chemin.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(options.query ?? {})) {
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  const entetes: Record<string, string> = {}
  if (options.token) entetes['Access-Token'] = options.token
  if (options.json !== undefined) entetes['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, {
      method: options.methode ?? (options.json !== undefined ? 'POST' : 'GET'),
      headers: entetes,
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new SocialError('TikTok Ads est injoignable. Réessayez dans un moment.')
  }

  const donnees = (await res.json().catch(() => ({}))) as ReponseAds<T>
  if (typeof donnees.code === 'number' && donnees.code !== 0) {
    throw traduireErreurAds(donnees.code, donnees.message ?? '')
  }
  if (!res.ok) throw new SocialError(`TikTok Ads a répondu ${res.status}.`)
  return (donnees.data ?? ({} as T)) as T
}

// ---------------------------------------------------------------------------
// Publicité : OAuth et comptes annonceurs — fonctions pures
// ---------------------------------------------------------------------------

export interface AnnonceurTiktok {
  id: string
  nom: string
  devise: string
  fuseau: string
}

/** Échange l'`auth_code` contre un jeton (sans expiration chez TikTok) et les annonceurs autorisés. */
export async function echangerCodeAds(authCode: string): Promise<{ token: string; annonceurs: string[] }> {
  const { appId, secret } = configurationAds()
  const r = await appelAds<{ access_token?: string; advertiser_ids?: Array<string | number> }>(
    '/v1.3/oauth2/access_token/',
    { json: { app_id: appId, secret, auth_code: authCode } },
  )
  if (!r.access_token) throw new SocialError("TikTok Ads n'a pas rendu de jeton exploitable. Recommencez.", true)
  return { token: r.access_token, annonceurs: (r.advertiser_ids ?? []).map(String) }
}

/** Les annonceurs autorisés pour ce jeton, au cas où l'échange n'en rend pas. */
export async function annonceursAutorises(token: string): Promise<string[]> {
  const { appId, secret } = configurationAds()
  const r = await appelAds<{ list?: Array<{ advertiser_id: string | number }> }>('/v1.3/oauth2/advertiser/get/', {
    token,
    query: { app_id: appId, secret },
  })
  return (r.list ?? []).map((a) => String(a.advertiser_id))
}

/** Nom, devise et fuseau des annonceurs : la devise sert à convertir budgets et dépenses. */
export async function detailsAnnonceurs(token: string, ids: string[]): Promise<AnnonceurTiktok[]> {
  if (!ids.length) return []
  const r = await appelAds<{ list?: Array<{ advertiser_id: string | number; name?: string; currency?: string; timezone?: string }> }>(
    '/v1.3/advertiser/info/',
    { token, query: { advertiser_ids: ids, fields: ['name', 'currency', 'timezone'] } },
  )
  const parId = new Map((r.list ?? []).map((a) => [String(a.advertiser_id), a]))
  return ids.map((id) => {
    const a = parId.get(id)
    return { id, nom: a?.name ?? `Compte TikTok Ads ${id}`, devise: a?.currency ?? 'EUR', fuseau: a?.timezone ?? 'UTC' }
  })
}

// ---------------------------------------------------------------------------
// Publicité : création de campagne — fonctions pures
// ---------------------------------------------------------------------------

/**
 * Notre objectif vers celui de TikTok.
 *
 * `conversions` et `engagement` retombent sur TRAFFIC avec une note : WEB_CONVERSIONS
 * exige un pixel TikTok et un évènement d'optimisation que nous ne connaissons
 * pas, ENGAGEMENT un type d'engagement propre à TikTok. Mieux vaut une campagne
 * de trafic qui part qu'un refus que le vendeur ne saura pas lire.
 */
export function objectifTiktok(objectif: string): { type: string; note: string | null } {
  switch (objectif) {
    case 'notoriete':
      return { type: 'REACH', note: null }
    case 'conversions':
      return {
        type: 'TRAFFIC',
        note: "Objectif « conversions » remplacé par « trafic » : il faut un pixel TikTok sur la boutique pour optimiser les ventes.",
      }
    case 'engagement':
      return {
        type: 'TRAFFIC',
        note: "Objectif « engagement » remplacé par « trafic » : l'engagement TikTok demande des réglages propres à la plateforme.",
      }
    default:
      return { type: 'TRAFFIC', note: null }
  }
}

/** Budget quotidien : centimes du compte vers unités de devise, au centime près. */
export function budgetEnUnites(centimes: number): number {
  return Math.round(centimes) / 100
}

const TRANCHES_AGE: Array<{ id: string; min: number; max: number }> = [
  { id: 'AGE_18_24', min: 18, max: 24 },
  { id: 'AGE_25_34', min: 25, max: 34 },
  { id: 'AGE_35_44', min: 35, max: 44 },
  { id: 'AGE_45_54', min: 45, max: 54 },
  { id: 'AGE_55_100', min: 55, max: 100 },
]

/**
 * Les tranches d'âge TikTok qui recoupent [ageMin, ageMax].
 *
 * Jamais de tranche mineure (13-17) : la publicité d'un vendeur de e-commerce
 * ne vise pas les mineurs, et TikTok la restreint de toute façon.
 * `undefined` quand rien n'est précisé : TikTok prend alors tous les âges.
 */
export function tranchesAge(ageMin?: number, ageMax?: number): string[] | undefined {
  if (ageMin === undefined && ageMax === undefined) return undefined
  const bas = ageMin ?? 18
  const haut = ageMax ?? 100
  const t = TRANCHES_AGE.filter((x) => x.max >= bas && x.min <= haut).map((x) => x.id)
  return t.length ? t : undefined
}

/** L'heure de début au format attendu : UTC, « AAAA-MM-JJ HH:MM:SS ». */
export function heureDebut(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

const BOUTONS: Record<string, string> = {
  acheter: 'SHOP_NOW',
  'acheter maintenant': 'BUY_NOW',
  commander: 'ORDER_NOW',
  'en savoir plus': 'LEARN_MORE',
  decouvrir: 'LEARN_MORE',
  découvrir: 'LEARN_MORE',
  'voir plus': 'VIEW_NOW',
}
const BOUTONS_TIKTOK = new Set(['SHOP_NOW', 'BUY_NOW', 'ORDER_NOW', 'LEARN_MORE', 'VIEW_NOW'])

/** Le libellé du bouton vers l'énumération TikTok ; « En savoir plus » à défaut. */
export function boutonTiktok(label?: string): string {
  if (!label) return 'LEARN_MORE'
  const brut = label.trim()
  const enum_ = brut.toUpperCase().replace(/\s+/g, '_')
  if (BOUTONS_TIKTOK.has(enum_)) return enum_
  return BOUTONS[brut.toLowerCase()] ?? 'LEARN_MORE'
}

/**
 * Les identifiants de lieu TikTok pour des codes pays ISO.
 *
 * HYPOTHÈSE : `targeting` attend des `location_ids` numériques de TikTok, pas
 * des codes ISO ; ils se lisent dans `/v1.3/tools/region/` (`region_code`).
 */
export async function lieuxTiktok(token: string, advertiserId: string, pays: string[], objectif: string): Promise<string[]> {
  const r = await appelAds<{ region_info?: Array<{ location_id: string | number; region_code?: string; level?: string }> }>(
    '/v1.3/tools/region/',
    {
      token,
      query: { advertiser_id: advertiserId, placements: ['PLACEMENT_TIKTOK'], objective_type: objectif, level_range: 'COUNTRY' },
    },
  )
  const voulus = new Set(pays.map((p) => p.toUpperCase()))
  const ids = (r.region_info ?? []).filter((x) => x.region_code && voulus.has(x.region_code.toUpperCase())).map((x) => String(x.location_id))
  if (!ids.length) {
    throw new SocialError(`TikTok Ads ne reconnaît aucun des pays demandés (${pays.join(', ')}). Vérifiez les codes pays.`, true)
  }
  return ids
}

/**
 * L'identité qui signe l'annonce (nom et photo affichés).
 *
 * Une annonce image TikTok doit être portée par une identité. On réutilise une
 * identité personnalisée existante, sinon on en crée une au nom de l'annonceur.
 * HYPOTHÈSE : `identity/create` n'exige que `display_name` ; si TikTok réclame
 * aussi une photo de profil, l'erreur le dira et il faudra créer l'identité
 * une fois dans le Gestionnaire de publicités.
 */
export async function identiteTiktok(token: string, advertiserId: string, nom: string): Promise<string> {
  const existantes = await appelAds<{ identity_list?: Array<{ identity_id: string; identity_type?: string }> }>(
    '/v1.3/identity/get/',
    { token, query: { advertiser_id: advertiserId } },
  ).catch(() => ({ identity_list: [] as Array<{ identity_id: string; identity_type?: string }> }))
  const trouvee = existantes.identity_list?.find((i) => !i.identity_type || i.identity_type === 'CUSTOMIZED_USER')
  if (trouvee) return String(trouvee.identity_id)

  try {
    const r = await appelAds<{ identity_id?: string }>('/v1.3/identity/create/', {
      token,
      json: { advertiser_id: advertiserId, display_name: nom.slice(0, 40) || 'Boutique' },
    })
    if (!r.identity_id) throw new Error('vide')
    return String(r.identity_id)
  } catch (err) {
    throw new SocialError(
      `Impossible de créer l'identité de l'annonce chez TikTok (${err instanceof Error ? err.message : 'refus'}). Créez une identité personnalisée dans le Gestionnaire de publicités TikTok, puis recommencez.`,
      true,
    )
  }
}

export interface CampagneCreee {
  campagneId: string
  groupeId: string
  imageId: string
  annonceId: string
  etat: 'brouillon' | 'active'
  notes: string[]
}

/**
 * Crée la chaîne campagne, groupe d'annonces, image, annonce.
 *
 * **Tout est créé en pause (`DISABLE`)** sauf si `activer` : la campagne dépense
 * l'argent du vendeur, et c'est lui qui appuie sur le bouton. Une étape qui
 * échoue en route laisse des objets en pause chez TikTok, sans dépense.
 */
export async function creerCampagneTiktok(
  token: string,
  advertiserId: string,
  c: Campagne,
  contexte: { nomAnnonceur: string; fuseau?: string },
): Promise<CampagneCreee> {
  const statut = c.activer ? 'ENABLE' : 'DISABLE'
  const objectif = objectifTiktok(c.objectif)
  const notes: string[] = objectif.note ? [objectif.note] : []

  if (!/^https?:\/\//i.test(c.creative.image)) {
    throw new SocialError("L'image de l'annonce doit être une adresse https accessible depuis Internet.", true)
  }
  if (!/^https?:\/\//i.test(c.creative.url)) {
    throw new SocialError("L'adresse de destination de l'annonce est invalide.", true)
  }

  const pays = c.ciblage?.paysCodes?.length ? c.ciblage.paysCodes : ['FR']
  if (!c.ciblage?.paysCodes?.length) notes.push('Aucun pays précisé : annonce ciblée sur la France.')
  const lieux = await lieuxTiktok(token, advertiserId, pays, objectif.type)

  const campagne = await appelAds<{ campaign_id?: string }>('/v1.3/campaign/create/', {
    token,
    json: {
      advertiser_id: advertiserId,
      campaign_name: c.nom,
      objective_type: objectif.type,
      budget_mode: 'BUDGET_MODE_INFINITE',
      operation_status: statut,
    },
  })
  if (!campagne.campaign_id) throw new SocialError("TikTok Ads n'a pas rendu d'identifiant de campagne.")

  const ages = tranchesAge(c.ciblage?.ageMin, c.ciblage?.ageMax)
  const groupe = await appelAds<{ adgroup_id?: string }>('/v1.3/adgroup/create/', {
    token,
    json: {
      advertiser_id: advertiserId,
      campaign_id: campagne.campaign_id,
      adgroup_name: c.nom,
      placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
      promotion_type: 'WEBSITE',
      external_url: c.creative.url,
      optimization_goal: objectif.type === 'REACH' ? 'REACH' : 'CLICK',
      billing_event: objectif.type === 'REACH' ? 'CPM' : 'CPC',
      bid_type: 'BID_TYPE_NO_BID',
      budget_mode: 'BUDGET_MODE_DAY',
      budget: budgetEnUnites(c.budgetJour),
      pacing: 'PACING_MODE_SMOOTH',
      schedule_type: 'SCHEDULE_FROM_NOW',
      schedule_start_time: heureDebut(),
      location_ids: lieux,
      ...(ages ? { age_groups: ages } : {}),
      operation_status: statut,
    },
  })
  if (!groupe.adgroup_id) throw new SocialError("TikTok Ads n'a pas rendu d'identifiant de groupe d'annonces.")

  const image = await appelAds<{ image_id?: string }>('/v1.3/file/image/ad/upload/', {
    token,
    json: {
      advertiser_id: advertiserId,
      upload_type: 'UPLOAD_BY_URL',
      image_url: c.creative.image,
      file_name: `dropshipper-${Date.now()}`,
    },
  })
  if (!image.image_id) throw new SocialError("TikTok Ads n'a pas accepté l'image de l'annonce.", true)

  const identite = await identiteTiktok(token, advertiserId, contexte.nomAnnonceur)

  const annonce = await appelAds<{ ad_ids?: Array<string | number> }>('/v1.3/ad/create/', {
    token,
    json: {
      advertiser_id: advertiserId,
      adgroup_id: groupe.adgroup_id,
      creatives: [
        {
          ad_name: c.creative.titre.slice(0, 100),
          identity_type: 'CUSTOMIZED_USER',
          identity_id: identite,
          ad_format: 'SINGLE_IMAGE',
          image_ids: [image.image_id],
          ad_text: c.creative.texte.slice(0, 100),
          call_to_action: boutonTiktok(c.creative.boutonLabel),
          landing_page_url: c.creative.url,
          // HYPOTHÈSE : `operation_status` se pose au niveau de la création.
          operation_status: statut,
        },
      ],
    },
  })
  const annonceId = String(annonce.ad_ids?.[0] ?? '')
  if (!annonceId) throw new SocialError("TikTok Ads n'a pas rendu d'identifiant d'annonce.")

  return {
    campagneId: String(campagne.campaign_id),
    groupeId: String(groupe.adgroup_id),
    imageId: String(image.image_id),
    annonceId,
    etat: c.activer ? 'active' : 'brouillon',
    notes,
  }
}

// ---------------------------------------------------------------------------
// Publicité : lecture des campagnes et des performances — fonctions pures
// ---------------------------------------------------------------------------

/** L'état TikTok vers le nôtre : brouillon, en_revue, active, refusee, terminee. */
export function etatCampagneTiktok(operation?: string, secondaire?: string): string {
  const s = secondaire ?? ''
  if (/DELETE/.test(s) || /DELETE/.test(operation ?? '')) return 'terminee'
  if (/DENY|REJECT/.test(s)) return 'refusee'
  if (/AUDIT/.test(s)) return 'en_revue'
  if (/BUDGET_EXCEED|NOT_DELIVERY|TIME_DONE|FINISH/.test(s)) return 'terminee'
  if (operation === 'DISABLE') return 'brouillon'
  return 'active'
}

export async function listerCampagnesTiktok(token: string, advertiserId: string): Promise<ResultatCampagne[]> {
  const r = await appelAds<{
    list?: Array<{ campaign_id: string | number; operation_status?: string; secondary_status?: string }>
  }>('/v1.3/campaign/get/', { token, query: { advertiser_id: advertiserId, page_size: 100 } })
  return (r.list ?? []).map((x) => ({
    externalId: String(x.campaign_id),
    etat: etatCampagneTiktok(x.operation_status, x.secondary_status),
    url: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${advertiserId}`,
  }))
}

/**
 * Impressions, clics, dépense et conversions des campagnes données.
 *
 * Le rapport rend la dépense en unités de devise, en texte (« 12.34 ») : elle est
 * convertie en centimes pour respecter le contrat. TikTok ne rend pas de
 * `conversion` pour un objectif trafic : `null`, pas zéro, pour ne pas affirmer
 * qu'aucune vente n'a eu lieu.
 */
export async function performancesTiktok(
  token: string,
  advertiserId: string,
  campagnes: string[],
  devise: string,
): Promise<Performances[]> {
  if (!campagnes.length) return []
  const r = await appelAds<{ list?: Array<{ dimensions?: { campaign_id?: string | number }; metrics?: Record<string, string | number | null> }> }>(
    '/v1.3/report/integrated/get/',
    {
      token,
      query: {
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: ['campaign_id'],
        metrics: ['spend', 'impressions', 'clicks', 'conversion'],
        query_lifetime: true,
        filtering: [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify(campagnes) }],
        page_size: 200,
      },
    },
  )
  const nombre = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return (r.list ?? []).map((ligne) => {
    const m = ligne.metrics ?? {}
    return {
      externalId: String(ligne.dimensions?.campaign_id ?? ''),
      impressions: nombre(m.impressions),
      clics: nombre(m.clicks),
      depense: Math.round(nombre(m.spend) * 100),
      conversions: m.conversion === null || m.conversion === undefined ? null : nombre(m.conversion),
      devise,
    }
  })
}

// ---------------------------------------------------------------------------
// Publicité : le moteur (seul à toucher la base)
// ---------------------------------------------------------------------------

interface MetaAds {
  currency?: string
  timezone?: string
}

async function compteAds(userId: string, externalId: string) {
  const compte = await prisma.socialAccount.findFirst({
    where: { userId, provider: 'tiktok-ads', externalId },
  })
  if (!compte) throw new SocialError("Ce compte ne vous appartient pas.", true)
  if (!compte.token || !compte.connected) {
    throw new SocialError(`${compte.label ?? 'Ce compte'} n'a plus de jeton : reliez-le à nouveau.`, true)
  }
  return compte
}

export const tiktokAds: SocialProvider = {
  id: 'tiktok-ads',
  label: 'TikTok Ads',
  plateformes: ['tiktok-ads'],

  async creerProfil(userId) {
    return userId
  },

  async listerComptes(profilId): Promise<CompteRaccorde[]> {
    return prisma.socialAccount.findMany({
      where: { userId: profilId, provider: 'tiktok-ads' },
      select: { externalId: true, platform: true, label: true, connected: true, isAdAccount: true },
      orderBy: [{ platform: 'asc' }],
    })
  },

  async lienDeConnexion(profilId, _platform, _retour) {
    const { appId } = configurationAds()
    const url = new URL('https://business-api.tiktok.com/portal/auth')
    url.searchParams.set('app_id', appId)
    url.searchParams.set('state', signerEtat(profilId, 'tiktok-ads'))
    url.searchParams.set('redirect_uri', callbackSocial('tiktok-ads'))
    return url.toString()
  },

  async finaliserConnexion(userId, params) {
    // TikTok renvoie `auth_code` (et non `code`) ; l'un et l'autre sont admis.
    const code = params.auth_code ?? params.code
    if (!code) throw new SocialError("TikTok Ads n'a pas renvoyé de code d'autorisation.", true)

    const { token, annonceurs } = await echangerCodeAds(code)
    const ids = annonceurs.length ? annonceurs : await annonceursAutorises(token)
    if (!ids.length) {
      throw new SocialError("Aucun compte annonceur TikTok n'a été autorisé : cochez au moins un compte à l'écran d'autorisation.", true)
    }
    const details = await detailsAnnonceurs(token, ids)

    for (const a of details) {
      const meta = { currency: a.devise, timezone: a.fuseau }
      await prisma.socialAccount.upsert({
        where: { userId_provider_externalId: { userId, provider: 'tiktok-ads', externalId: a.id } },
        create: {
          userId,
          provider: 'tiktok-ads',
          externalId: a.id,
          platform: 'tiktok-ads',
          label: a.nom,
          connected: true,
          isAdAccount: true,
          token,
          meta,
        },
        update: { label: a.nom, connected: true, isAdAccount: true, token, meta },
      })
    }
    return details.length
  },

  async creerCampagne(profilId, c): Promise<ResultatCampagne> {
    const compte = await compteAds(profilId, c.compte)
    const r = await creerCampagneTiktok(compte.token!, c.compte, c, { nomAnnonceur: compte.label ?? 'Boutique' })
    return {
      externalId: r.campagneId,
      etat: r.etat,
      url: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${c.compte}`,
    }
  },

  async listerCampagnes(profilId): Promise<ResultatCampagne[]> {
    const comptes = await prisma.socialAccount.findMany({
      where: { userId: profilId, provider: 'tiktok-ads', connected: true, token: { not: null } },
    })
    const toutes: ResultatCampagne[] = []
    for (const compte of comptes) toutes.push(...(await listerCampagnesTiktok(compte.token!, compte.externalId)))
    return toutes
  },

  async performances(profilId, externalIds): Promise<Performances[]> {
    const comptes = await prisma.socialAccount.findMany({
      where: { userId: profilId, provider: 'tiktok-ads', connected: true, token: { not: null } },
    })
    const toutes: Performances[] = []
    for (const compte of comptes) {
      const devise = ((compte.meta ?? {}) as MetaAds).currency ?? 'EUR'
      toutes.push(...(await performancesTiktok(compte.token!, compte.externalId, externalIds, devise)))
    }
    return toutes
  },
}
