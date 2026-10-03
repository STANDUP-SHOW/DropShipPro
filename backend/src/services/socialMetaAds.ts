import { callbackSocial } from '../lib/urls.js'
import { signerEtat } from './oauthEtat.js'
import {
  SocialError,
  type Campagne,
  type CompteRaccorde,
  type Performances,
  type ResultatCampagne,
  type SocialProvider,
} from './socialTypes.js'

/**
 * Acheter de la publicité Facebook et Instagram pour le vendeur, via l'API
 * Marketing de Meta (même application Meta que la publication organique).
 *
 * **Écrit d'après la documentation publique, jamais exécuté contre le vrai
 * Meta** : le réseau vers Meta est fermé là où il a été écrit, et le banc
 * (`check-meta-ads.ts`) ne parle qu'à un faux Graph. Les noms de champs, les
 * codes d'erreur et les règles de budget sont ceux de la documentation ; le
 * premier essai réel se fait sur un compte publicitaire de Max, campagne en
 * pause, avant tout le reste.
 *
 * **Ce que Meta exige avant d'ouvrir ça à d'autres vendeurs** : App Review de
 * `ads_management` (accès avancé) et vérification d'entreprise. En attendant,
 * en mode développement, l'application fonctionne pour les comptes qui ont un
 * rôle sur l'app — les comptes publicitaires de Max suffisent à tout éprouver.
 *
 * **Le vendeur paie chez Meta, avec son moyen de paiement.** Rien ne passe par
 * nous. Toute campagne naît en PAUSE (campagne, ensemble et annonce) et ne
 * diffuse que si l'appelant a demandé `activer` — c'est son argent qui part.
 *
 * Jamais d'identifiants : OAuth uniquement, le jeton se révoque chez Meta.
 *
 * Les fonctions HTTP sont exportées et reçoivent le jeton en argument : le banc
 * les éprouve sans base de données. Prisma n'est chargé qu'au moment d'une
 * lecture ou écriture de compte.
 */

const ID = 'meta-ads'

/** Lus à chaque appel, pas au chargement : le banc les pose après l'import. */
const version = () => process.env.META_API_VERSION?.trim() || 'v21.0'
const graphUrl = () => process.env.META_GRAPH_URL?.trim() || 'https://graph.facebook.com'

/*
 * Les autorisations demandées.
 * - `ads_management` : créer et modifier campagnes, ensembles, annonces.
 * - `ads_read` : lire les résultats (insights).
 * - `business_management` : atteindre les comptes publicitaires d'un Business Manager.
 * - `pages_show_list` + `pages_read_engagement` : une annonce Facebook/Instagram
 *   est publiée AU NOM d'une page ; il faut savoir laquelle proposer.
 */
export const PORTEE_ADS = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
].join(',')

export function metaAdsConfigure(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim())
}

function configuration() {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    throw new SocialError("L'application Meta n'est pas configurée : META_APP_ID et META_APP_SECRET manquent.")
  }
  return { appId, appSecret }
}

/** Une erreur Meta, avec son code : sert à décider d'un repli, pas à l'affichage. */
export class MetaAdsError extends SocialError {
  constructor(message: string, actionnable: boolean, readonly code: number | null) {
    super(message, actionnable)
    this.name = 'MetaAdsError'
  }
}

interface RefusGraph {
  error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string }
}

/** Traduit un refus Meta en phrase qui dit quoi faire. Exportée pour le banc. */
export function traduireRefus(status: number, e: NonNullable<RefusGraph['error']> | undefined): MetaAdsError {
  const err = e ?? {}
  const code = err.code ?? null
  const sous = err.error_subcode ?? 0
  const message = err.error_user_msg || err.message || `Meta a répondu ${status}.`

  // 190 : jeton expiré, révoqué, mot de passe changé. Seul le vendeur répare.
  if (code === 190) {
    return new MetaAdsError('Votre connexion Meta a expiré : reliez à nouveau votre compte publicitaire.', true, code)
  }
  // 200, 10, 294 : permission publicitaire absente. C'est notre app qui est en cause.
  if (code === 200 || code === 10 || code === 294) {
    return new MetaAdsError(
      `Meta refuse cette action faute d'autorisation (${message}). L'application n'a pas encore reçu la permission ads_management : ` +
        `elle doit passer l'examen de Meta (App Review) avant de gérer des publicités pour d'autres vendeurs.`,
      false,
      code,
    )
  }
  // 17, 613, 80004 : quotas.
  if (code === 17 || code === 613 || code === 80004 || code === 4 || code === 32) {
    return new MetaAdsError('Meta a limité le débit des appels publicitaires. Réessayez dans une heure.', false, code)
  }
  // 1487xxx (sous-codes publicitaires) et 100 : Meta explique lui-même, dans la langue du vendeur.
  if ((sous >= 1487000 && sous < 1488000) || code === 100) {
    return new MetaAdsError(
      err.error_user_msg ? `Meta : ${err.error_user_msg}` : `Meta : ${message}`,
      true,
      code,
    )
  }
  return new MetaAdsError(`Meta : ${message}`, true, code)
}

type Valeur = string | number | boolean | object | null | undefined

/** Un appel Graph. Les objets et tableaux partent en JSON, comme Meta l'attend. */
export async function graph<T>(
  chemin: string,
  options: { token: string; methode?: 'GET' | 'POST'; params?: Record<string, Valeur> },
): Promise<T> {
  const url = new URL(`${graphUrl()}/${version()}/${chemin.replace(/^\//, '')}`)
  const corps = new URLSearchParams()
  if (options.token) corps.set('access_token', options.token)
  for (const [k, v] of Object.entries(options.params ?? {})) {
    if (v === undefined || v === null) continue
    corps.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }

  let res: Response
  try {
    res =
      options.methode === 'POST'
        ? await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: corps,
            signal: AbortSignal.timeout(30000),
          })
        : await fetch(`${url}?${corps}`, { signal: AbortSignal.timeout(30000) })
  } catch {
    throw new MetaAdsError('Meta est injoignable. Réessayez dans un moment.', false, null)
  }

  const donnees = (await res.json().catch(() => ({}))) as T & RefusGraph
  if (!res.ok || donnees.error) throw traduireRefus(res.status, donnees.error)
  return donnees
}

// --- OAuth --------------------------------------------------------------------

/** L'adresse du dialogue d'autorisation. Le `state` est signé (anti-CSRF). */
export function urlAutorisation(appId: string, redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${version()}/dialog/oauth`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', PORTEE_ADS)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

/** Code → jeton court (1 h) → jeton long (≈ 60 jours). */
export async function echangerCode(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
): Promise<{ token: string; expire: Date }> {
  const court = await graph<{ access_token: string }>('oauth/access_token', {
    token: '',
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
  })
  const long = await graph<{ access_token: string; expires_in?: number }>('oauth/access_token', {
    token: '',
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: court.access_token,
    },
  })
  const secondes = long.expires_in && long.expires_in > 0 ? long.expires_in : 60 * 24 * 3600
  return { token: long.access_token, expire: new Date(Date.now() + secondes * 1000) }
}

export interface CompteAds {
  /** Identifiant avec préfixe : « act_123 ». */
  id: string
  nom: string
  devise: string
  pages: Array<{ id: string; name: string }>
  pixelId: string | null
}

/** `act_123` dans tous les cas, que l'appelant ait donné « 123 » ou « act_123 ». */
export const idCompte = (id: string) => (id.startsWith('act_') ? id : `act_${id}`)

/** Les comptes publicitaires actifs du vendeur, avec ses pages (et un pixel s'il y en a un). */
export async function lireComptesAds(token: string): Promise<CompteAds[]> {
  const comptes = await graph<{
    data?: Array<{ id: string; name?: string; currency?: string; account_status?: number }>
  }>('me/adaccounts', { token, params: { fields: 'id,name,currency,account_status', limit: 100 } })

  // account_status 1 = ACTIVE. Les autres (désactivé, impayé, en revue…) ne peuvent pas diffuser.
  const actifs = (comptes.data ?? []).filter((c) => c.account_status === 1)
  if (!actifs.length) {
    throw new SocialError(
      "Aucun compte publicitaire actif sur ce compte Meta. Créez-en un dans le Gestionnaire de publicités (avec un moyen de paiement), puis reliez-le à nouveau.",
      true,
    )
  }

  const pagesBrutes = await graph<{ data?: Array<{ id: string; name: string }> }>('me/accounts', {
    token,
    params: { fields: 'id,name', limit: 100 },
  })
  const pages = (pagesBrutes.data ?? []).map((p) => ({ id: p.id, name: p.name }))

  const resultat: CompteAds[] = []
  for (const c of actifs) {
    let pixelId: string | null = null
    try {
      // Facultatif : sans pixel, une campagne « conversions » retombe sur le trafic.
      const px = await graph<{ data?: Array<{ id: string }> }>(`${idCompte(c.id)}/adspixels`, {
        token,
        params: { fields: 'id,name', limit: 1 },
      })
      pixelId = px.data?.[0]?.id ?? null
    } catch {
      pixelId = null
    }
    resultat.push({ id: idCompte(c.id), nom: c.name ?? c.id, devise: c.currency ?? 'EUR', pages, pixelId })
  }
  return resultat
}

// --- Campagnes ----------------------------------------------------------------

/** Devises sans centimes chez Meta : le montant est en unités entières. */
const SANS_DECIMALES = new Set(['JPY', 'KRW', 'CLP', 'VND', 'ISK', 'HUF', 'TWD', 'UGX', 'XAF', 'XOF', 'PYG'])

/** Budget en unité mineure de la compte. Entrée : centimes (centièmes de l'unité). */
export function budgetMeta(budgetJour: number, devise: string): number {
  const centimes = Math.round(budgetJour)
  return SANS_DECIMALES.has(devise.toUpperCase()) ? Math.round(centimes / 100) : centimes
}

export interface PlanObjectif {
  objectif: string
  optimisation: string
  destination?: string
  promotedObject?: Record<string, string>
  /** Phrase à montrer au vendeur quand on a dû changer son choix. */
  remarque: string | null
}

/** Objectif de campagne et réglages d'ensemble cohérents entre eux. */
export function planObjectif(objectif: string, pixelId: string | null, pageId: string): PlanObjectif {
  switch (objectif) {
    case 'notoriete':
      return { objectif: 'OUTCOME_AWARENESS', optimisation: 'REACH', remarque: null }
    case 'engagement':
      return {
        objectif: 'OUTCOME_ENGAGEMENT',
        optimisation: 'POST_ENGAGEMENT',
        destination: 'ON_POST',
        promotedObject: { page_id: pageId },
        remarque: null,
      }
    case 'conversions':
      if (pixelId) {
        return {
          objectif: 'OUTCOME_SALES',
          optimisation: 'OFFSITE_CONVERSIONS',
          promotedObject: { pixel_id: pixelId, custom_event_type: 'PURCHASE' },
          remarque: null,
        }
      }
      return {
        objectif: 'OUTCOME_TRAFFIC',
        optimisation: 'LINK_CLICKS',
        remarque:
          "Aucun pixel Meta trouvé sur ce compte publicitaire : la campagne « conversions » a été créée en « trafic ». Installez un pixel sur votre boutique pour optimiser sur les ventes.",
      }
    case 'trafic':
    default:
      return { objectif: 'OUTCOME_TRAFFIC', optimisation: 'LINK_CLICKS', remarque: null }
  }
}

export interface ResultatCreation extends ResultatCampagne {
  remarque: string | null
  ids: { campagne: string; ensemble: string; creative: string; annonce: string }
}

const urlGestionnaire = (compte: string, campagne: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${idCompte(compte).slice(4)}&selected_campaign_ids=${campagne}`

/**
 * Campagne → ensemble → visuel → créatif → annonce, tout en PAUSE sauf `activer`.
 *
 * La page est vérifiée AVANT le premier appel : sans elle, la chaîne
 * s'arrêterait au créatif en laissant une campagne vide chez Meta. Si une
 * étape échoue malgré tout, la campagne déjà créée est supprimée (au mieux).
 */
export async function creerCampagneMeta(
  token: string,
  compte: { id: string; devise: string; pages: Array<{ id: string; name: string }>; pixelId?: string | null },
  c: Campagne,
): Promise<ResultatCreation> {
  const page = compte.pages[0]
  if (!page) {
    throw new SocialError(
      "Aucune page Facebook n'est reliée à ce compte publicitaire : une annonce est publiée au nom d'une page. Connectez une page Facebook, puis reliez à nouveau votre compte publicitaire.",
      true,
    )
  }
  if (!Number.isFinite(c.budgetJour) || c.budgetJour <= 0) {
    throw new SocialError('Le budget quotidien doit être supérieur à zéro.', true)
  }

  const act = idCompte(compte.id)
  const statut = c.activer ? 'ACTIVE' : 'PAUSED'
  const plan = planObjectif(c.objectif, compte.pixelId ?? null, page.id)

  const camp = await graph<{ id: string }>(`${act}/campaigns`, {
    token,
    methode: 'POST',
    params: { name: c.nom, objective: plan.objectif, status: statut, special_ad_categories: [] },
  })

  try {
    const cible = c.ciblage ?? {}
    const pays = cible.paysCodes?.length ? cible.paysCodes : ['FR']
    const ensemble = await graph<{ id: string }>(`${act}/adsets`, {
      token,
      methode: 'POST',
      params: {
        name: `${c.nom} — ensemble`,
        campaign_id: camp.id,
        daily_budget: budgetMeta(c.budgetJour, compte.devise),
        billing_event: 'IMPRESSIONS',
        optimization_goal: plan.optimisation,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: {
          geo_locations: { countries: pays },
          age_min: cible.ageMin ?? 18,
          age_max: cible.ageMax ?? 65,
          targeting_automation: { advantage_audience: 0 },
        },
        ...(plan.destination ? { destination_type: plan.destination } : {}),
        ...(plan.promotedObject ? { promoted_object: plan.promotedObject } : {}),
        start_time: new Date().toISOString(),
        status: statut,
        /*
         * Le règlement européen sur les services numériques (DSA) exige, pour
         * toute annonce diffusée dans l'UE, qui en bénéficie et qui la paie.
         * Sans ces deux champs, Meta refuse l'ensemble de publicités dès qu'un
         * pays européen est ciblé — c'est-à-dire toujours, pour nos vendeurs.
         */
        dsa_beneficiary: page.name,
        dsa_payor: page.name,
      },
    })

    // Le visuel par adresse. Si Meta ne l'accepte pas (ce chemin n'est pas
    // garanti par la doc), le créatif porte l'adresse directement (`picture`).
    let hash: string | null = null
    try {
      const img = await graph<{ images?: Record<string, { hash?: string }> }>(`${act}/adimages`, {
        token,
        methode: 'POST',
        params: { url: c.creative.image },
      })
      hash = Object.values(img.images ?? {})[0]?.hash ?? null
    } catch (err) {
      if (err instanceof MetaAdsError && [190, 200, 10, 294, 17, 613, 80004].includes(err.code ?? 0)) throw err
      hash = null
    }

    const creative = await graph<{ id: string }>(`${act}/adcreatives`, {
      token,
      methode: 'POST',
      params: {
        name: `${c.nom} — créatif`,
        object_story_spec: {
          page_id: page.id,
          link_data: {
            link: c.creative.url,
            message: c.creative.texte,
            name: c.creative.titre,
            ...(hash ? { image_hash: hash } : { picture: c.creative.image }),
            call_to_action: { type: 'SHOP_NOW', value: { link: c.creative.url } },
          },
        },
      },
    })

    const annonce = await graph<{ id: string }>(`${act}/ads`, {
      token,
      methode: 'POST',
      params: { name: `${c.nom} — annonce`, adset_id: ensemble.id, creative: { creative_id: creative.id }, status: statut },
    })

    return {
      externalId: camp.id,
      etat: c.activer ? 'en_revue' : 'brouillon',
      url: urlGestionnaire(act, camp.id),
      remarque: plan.remarque,
      ids: { campagne: camp.id, ensemble: ensemble.id, creative: creative.id, annonce: annonce.id },
    }
  } catch (err) {
    // Au mieux : une campagne vide en pause ne coûte rien, mais encombre le compte.
    await graph(camp.id, { token, methode: 'POST', params: { status: 'DELETED' } }).catch(() => undefined)
    throw err
  }
}

/** L'état Meta (`effective_status`) dans le vocabulaire de l'application. */
export function etatDepuisMeta(effectif: string | undefined): string {
  switch (effectif) {
    case 'ACTIVE':
      return 'active'
    case 'PENDING_REVIEW':
    case 'IN_PROCESS':
      return 'en_revue'
    case 'DISAPPROVED':
    case 'WITH_ISSUES':
      return 'refusee'
    case 'ARCHIVED':
    case 'DELETED':
      return 'terminee'
    default:
      return 'brouillon'
  }
}

export async function lireCampagnes(token: string, compte: string): Promise<ResultatCampagne[]> {
  const r = await graph<{ data?: Array<{ id: string; effective_status?: string }> }>(`${idCompte(compte)}/campaigns`, {
    token,
    params: { fields: 'id,name,effective_status', limit: 100 },
  })
  return (r.data ?? []).map((k) => ({
    externalId: k.id,
    etat: etatDepuisMeta(k.effective_status),
    url: urlGestionnaire(compte, k.id),
  }))
}

const CONVERSIONS = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']

export async function lirePerformances(token: string, externalIds: string[]): Promise<Performances[]> {
  const sorties: Performances[] = []
  for (const id of externalIds) {
    const r = await graph<{
      data?: Array<{
        spend?: string
        impressions?: string
        clicks?: string
        account_currency?: string
        actions?: Array<{ action_type: string; value: string }>
      }>
    }>(`${id}/insights`, { token, params: { fields: 'spend,impressions,clicks,actions,account_currency' } })
    const ligne = r.data?.[0]
    if (!ligne) {
      sorties.push({ externalId: id, impressions: 0, clics: 0, depense: 0, conversions: null, devise: 'EUR' })
      continue
    }
    const achats = (ligne.actions ?? []).find((a) => CONVERSIONS.includes(a.action_type))
    sorties.push({
      externalId: id,
      impressions: parseInt(ligne.impressions ?? '0', 10) || 0,
      clics: parseInt(ligne.clicks ?? '0', 10) || 0,
      // « spend » est rendu en unités (12.34), nous comptons en centimes.
      depense: Math.round((parseFloat(ligne.spend ?? '0') || 0) * 100),
      conversions: achats ? parseInt(achats.value, 10) || 0 : null,
      devise: ligne.account_currency ?? 'EUR',
    })
  }
  return sorties
}

// --- Le moteur (accès base) -----------------------------------------------------

async function db() {
  return (await import('../lib/prisma.js')).prisma
}

interface MetaCompte {
  currency?: string
  pages?: Array<{ id: string; name: string }>
  pixelId?: string | null
}

async function comptesDuVendeur(userId: string) {
  const prisma = await db()
  return prisma.socialAccount.findMany({ where: { userId, provider: ID, platform: ID, connected: true } })
}

function jetonDe(compte: { token: string | null; label: string | null }): string {
  if (!compte.token) {
    throw new SocialError(`${compte.label ?? 'Ce compte'} n'a plus de jeton : reliez-le à nouveau.`, true)
  }
  return compte.token
}

export const metaAds: SocialProvider = {
  id: ID,
  label: 'Meta Ads (Facebook et Instagram)',
  plateformes: [ID],

  async creerProfil(userId) {
    return userId
  },

  async listerComptes(profilId): Promise<CompteRaccorde[]> {
    const prisma = await db()
    return prisma.socialAccount.findMany({
      where: { userId: profilId, provider: ID },
      // Pas de jeton : cette liste remonte jusqu'au navigateur.
      select: { externalId: true, platform: true, label: true, connected: true, isAdAccount: true },
      orderBy: [{ label: 'asc' }],
    })
  },

  async lienDeConnexion(profilId) {
    const { appId } = configuration()
    return urlAutorisation(appId, callbackSocial(ID), signerEtat(profilId, ID))
  },

  async finaliserConnexion(userId, params, redirectUri) {
    if (params.error) {
      throw new SocialError(
        `Autorisation Meta refusée : ${params.error_description || params.error_reason || params.error}.`,
        true,
      )
    }
    if (!params.code) throw new SocialError("Meta n'a pas renvoyé de code d'autorisation.", true)
    const { appId, appSecret } = configuration()
    const { token, expire } = await echangerCode(params.code, redirectUri, appId, appSecret)
    const comptes = await lireComptesAds(token)

    const prisma = await db()
    for (const c of comptes) {
      const meta = { currency: c.devise, pages: c.pages, pixelId: c.pixelId }
      await prisma.socialAccount.upsert({
        where: { userId_provider_externalId: { userId, provider: ID, externalId: c.id } },
        create: {
          userId, provider: ID, externalId: c.id, platform: ID, label: c.nom,
          connected: true, isAdAccount: true, token, tokenExpires: expire, meta,
        },
        update: { label: c.nom, connected: true, isAdAccount: true, token, tokenExpires: expire, meta },
      })
    }
    return comptes.length
  },

  async creerCampagne(profilId, c): Promise<ResultatCampagne> {
    const cible = idCompte(c.compte)
    const ligne = (await comptesDuVendeur(profilId)).find((k) => idCompte(k.externalId) === cible)
    if (!ligne) throw new SocialError("Ce compte publicitaire ne vous appartient pas.", true)
    const m = (ligne.meta ?? {}) as MetaCompte
    const r = await creerCampagneMeta(
      jetonDe(ligne),
      { id: ligne.externalId, devise: m.currency ?? 'EUR', pages: m.pages ?? [], pixelId: m.pixelId ?? null },
      c,
    )
    return { externalId: r.externalId, etat: r.etat, url: r.url }
  },

  async listerCampagnes(profilId): Promise<ResultatCampagne[]> {
    const sorties: ResultatCampagne[] = []
    for (const ligne of await comptesDuVendeur(profilId)) {
      sorties.push(...(await lireCampagnes(jetonDe(ligne), ligne.externalId)))
    }
    return sorties
  },

  async performances(profilId, externalIds): Promise<Performances[]> {
    const comptes = await comptesDuVendeur(profilId)
    const ligne = comptes[0]
    if (!ligne) throw new SocialError("Aucun compte publicitaire Meta n'est relié.", true)
    return lirePerformances(jetonDe(ligne), externalIds)
  },
}
