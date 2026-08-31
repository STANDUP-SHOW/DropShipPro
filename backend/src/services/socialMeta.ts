import { prisma } from '../lib/prisma.js'
import { callbackMeta } from '../lib/urls.js'
import {
  SocialError,
  type CompteRaccorde,
  type Publication,
  type ResultatPublication,
  type SocialProvider,
} from './socialTypes.js'

/**
 * Publier sur la page Facebook et le compte Instagram du vendeur, en direct.
 *
 * Ce que ça remplace : un moteur tiers qui facturait 6 $ par mois et par compte
 * raccordé — un coût fixe qui courait sur les vendeurs dormants — plus 0,20 $
 * la publication. Trois comptes et trente annonces par mois revenaient à 38 $
 * par vendeur, dont la moitié due qu'il publie ou non.
 *
 * L'API Graph de Meta, elle, ne facture rien à l'appel. Notre coût par
 * publicité redevient ce que nous achetons vraiment : l'accroche rédigée et
 * l'image, environ 0,055 €. La publication elle-même ne coûte rien, et c'est ce
 * qui rend une tarification au crédit tenable.
 *
 * **Le vendeur paie ses campagnes chez Meta, pas chez nous.** Cet adaptateur ne
 * touche donc à aucun budget : il publie en organique sur la page et le compte
 * du vendeur, et rien d'autre. C'est aussi ce qui simplifie l'examen de Meta —
 * `pages_manage_posts` se justifie en une phrase, `ads_management` demande un
 * dossier.
 *
 * ---
 *
 * **Jamais d'identifiants.** Le vendeur s'authentifie chez Meta, nous recevons
 * un jeton qu'il révoque quand il veut. Lui demander son mot de passe Business
 * Manager violerait les conditions de Meta, ferait fermer son compte
 * publicitaire, et nous rendrait dépositaires d'un accès à son budget média.
 *
 * **Ce que Meta exige avant d'ouvrir ça aux clients** : vérification
 * d'entreprise, puis App Review de `pages_manage_posts` et
 * `instagram_content_publish`. En attendant, l'app fonctionne déjà sur les
 * comptes ayant un rôle dessus — de quoi tout éprouver pendant l'examen.
 *
 * **Instagram n'accepte que les comptes Business ou Créateur reliés à une
 * page.** Un compte personnel est impossible par API, quoi qu'on fasse : le
 * raccordement le dit plutôt que d'échouer à la première publication.
 */

const VERSION = process.env.META_API_VERSION?.trim() || 'v21.0'
const GRAPH = process.env.META_GRAPH_URL?.trim() || 'https://graph.facebook.com'

/*
 * Les autorisations demandées, et rien de plus.
 *
 * Chaque permission en trop allonge l'examen et effraie le vendeur sur l'écran
 * d'autorisation. Celles-ci sont le strict nécessaire pour lister ses pages et
 * y publier :
 *
 * - `pages_show_list` : savoir quelles pages il administre.
 * - `pages_read_engagement` : lire le nom de la page, exigée avec la suivante.
 * - `pages_manage_posts` : publier.
 * - `instagram_basic` + `instagram_content_publish` : le compte Instagram lié.
 * - `business_management` : rattacher une page détenue par un Business Manager,
 *   ce qui est le cas de tout vendeur un peu structuré.
 */
const PORTEE = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
].join(',')

function configuration() {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    throw new SocialError(
      "L'application Meta n'est pas configurée : META_APP_ID et META_APP_SECRET manquent.",
    )
  }
  return { appId, appSecret }
}

/** Vrai quand l'adaptateur est réellement utilisable. */
export function metaConfigure(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim())
}

interface RefusGraph {
  error?: { message?: string; type?: string; code?: number; error_user_msg?: string }
}

/**
 * Un appel à l'API Graph, avec ses refus traduits.
 *
 * Meta répond en 400 avec un message technique en anglais — « (#200) Requires
 * pages_manage_posts permission » — que le vendeur ne peut pas interpréter. Les
 * refus les plus fréquents sont donc reconnus et réécrits : ce sont eux qui
 * décident si le vendeur doit reconnecter, attendre, ou changer de compte.
 */
async function graph<T>(
  chemin: string,
  options: { token: string; methode?: 'GET' | 'POST'; params?: Record<string, string> } ,
): Promise<T> {
  const url = new URL(`${GRAPH}/${VERSION}/${chemin.replace(/^\//, '')}`)
  const corps = new URLSearchParams({ access_token: options.token, ...(options.params ?? {}) })

  let res: Response
  try {
    res = await fetch(options.methode === 'POST' ? url : `${url}?${corps}`, {
      method: options.methode ?? 'GET',
      ...(options.methode === 'POST'
        ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corps }
        : {}),
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new SocialError('Meta est injoignable. Réessayez dans un moment.')
  }

  const donnees = (await res.json().catch(() => ({}))) as T & RefusGraph
  if (!res.ok || donnees.error) {
    const e = donnees.error ?? {}
    const message = e.error_user_msg || e.message || `Meta a répondu ${res.status}.`

    // 190 : jeton expiré ou révoqué. Le vendeur doit reconnecter, et lui seul
    // peut le faire — inutile de réessayer.
    if (e.code === 190) {
      throw new SocialError('Votre connexion Meta a expiré : reliez le compte à nouveau.', true)
    }
    // 200 et 10 : autorisation manquante. C'est notre app qui est en cause, pas
    // le vendeur : le dire évite qu'il cherche de son côté.
    if (e.code === 200 || e.code === 10) {
      throw new SocialError(
        `Meta refuse cette action faute d'autorisation (${message}). L'application n'a pas encore reçu cette permission.`,
      )
    }
    // 4, 17, 32, 613 : quotas. Réessayer plus tard marche ; insister empire.
    if ([4, 17, 32, 613].includes(e.code ?? 0)) {
      throw new SocialError('Meta a limité le débit des appels. Réessayez dans une heure.')
    }
    throw new SocialError(`Meta : ${message}`, true)
  }

  return donnees
}

/**
 * Échange le code d'autorisation contre un jeton de longue durée.
 *
 * Deux échanges et non un : le jeton rendu par la redirection vit une heure. Le
 * second le porte à soixante jours — et c'est de lui que dérivent les jetons de
 * page, qui eux n'expirent pas tant que le vendeur ne révoque rien.
 */
async function jetonLongueDuree(code: string, redirectUri: string): Promise<string> {
  const { appId, appSecret } = configuration()

  const court = await graph<{ access_token: string }>('oauth/access_token', {
    token: '',
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
  })

  const long = await graph<{ access_token: string }>('oauth/access_token', {
    token: '',
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: court.access_token,
    },
  })

  return long.access_token
}

interface PageGraph {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string; username?: string }
}

/**
 * Enregistre les pages du vendeur, et leurs comptes Instagram liés.
 *
 * Appelé au retour de l'autorisation. Chaque page devient un compte
 * raccordable ; le compte Instagram, quand il existe, en devient un second —
 * il partage le jeton de la page, parce que c'est ainsi que Meta l'a conçu.
 */
export async function enregistrerComptesMeta(
  userId: string,
  code: string,
  redirectUri: string,
): Promise<number> {
  const jeton = await jetonLongueDuree(code, redirectUri)

  const { data } = await graph<{ data: PageGraph[] }>('me/accounts', {
    token: jeton,
    params: { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '100' },
  })

  if (!data?.length) {
    throw new SocialError(
      "Aucune page Facebook trouvée sur ce compte. Vous devez administrer au moins une page pour publier — un profil personnel ne suffit pas.",
      true,
    )
  }

  let enregistres = 0
  for (const page of data) {
    await prisma.socialAccount.upsert({
      where: { userId_provider_externalId: { userId, provider: 'meta', externalId: page.id } },
      create: {
        userId,
        provider: 'meta',
        externalId: page.id,
        platform: 'facebook',
        label: page.name,
        connected: true,
        token: page.access_token,
        meta: { instagram: page.instagram_business_account?.id ?? null },
      },
      update: {
        label: page.name,
        connected: true,
        token: page.access_token,
        meta: { instagram: page.instagram_business_account?.id ?? null },
      },
    })
    enregistres++

    const ig = page.instagram_business_account
    if (ig) {
      await prisma.socialAccount.upsert({
        where: { userId_provider_externalId: { userId, provider: 'meta', externalId: ig.id } },
        create: {
          userId,
          provider: 'meta',
          externalId: ig.id,
          platform: 'instagram',
          label: ig.username ? `@${ig.username}` : `Instagram de ${page.name}`,
          connected: true,
          // Le jeton de la page : Instagram n'en délivre pas de séparé.
          token: page.access_token,
          meta: { page: page.id },
        },
        update: {
          label: ig.username ? `@${ig.username}` : `Instagram de ${page.name}`,
          connected: true,
          token: page.access_token,
          meta: { page: page.id },
        },
      })
      enregistres++
    }
  }

  return enregistres
}

/** Le compte, avec son jeton — lecture réservée au serveur. */
async function compteAvecJeton(userId: string, externalId: string) {
  const compte = await prisma.socialAccount.findFirst({
    where: { userId, provider: 'meta', externalId },
  })
  if (!compte) throw new SocialError("Ce compte ne vous appartient pas.", true)
  if (!compte.token) {
    throw new SocialError(`${compte.label ?? 'Ce compte'} n'a plus de jeton : reliez-le à nouveau.`, true)
  }
  return compte
}

/** Publie sur une page Facebook : une photo, ou du texte seul. */
async function publierSurPage(
  token: string,
  pageId: string,
  texte: string,
  medias: string[],
): Promise<string> {
  if (medias.length === 1) {
    const r = await graph<{ post_id?: string; id: string }>(`${pageId}/photos`, {
      token,
      methode: 'POST',
      params: { url: medias[0], caption: texte },
    })
    return r.post_id ?? r.id
  }

  if (medias.length > 1) {
    /*
     * Plusieurs photos : chacune est d'abord téléversée sans être publiée,
     * puis rattachée au message. Publier une par une donnerait cinq messages
     * séparés sur le fil de la page au lieu d'un album.
     */
    const ids: string[] = []
    for (const media of medias.slice(0, 10)) {
      const r = await graph<{ id: string }>(`${pageId}/photos`, {
        token,
        methode: 'POST',
        params: { url: media, published: 'false' },
      })
      ids.push(r.id)
    }
    const params: Record<string, string> = { message: texte }
    ids.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })
    })
    const r = await graph<{ id: string }>(`${pageId}/feed`, { token, methode: 'POST', params })
    return r.id
  }

  const r = await graph<{ id: string }>(`${pageId}/feed`, {
    token,
    methode: 'POST',
    params: { message: texte },
  })
  return r.id
}

/**
 * Publie sur un compte Instagram professionnel.
 *
 * En deux temps, imposés par Meta : on crée un « conteneur » qui décrit le
 * média, puis on le publie. Instagram exige au moins une image — un texte seul
 * n'existe pas là-bas, et le refus arriverait sinon au deuxième appel, après
 * avoir laissé croire que ça partait.
 */
async function publierSurInstagram(
  token: string,
  igId: string,
  texte: string,
  medias: string[],
): Promise<string> {
  if (!medias.length) {
    throw new SocialError('Instagram exige au moins une image : ajoutez un visuel.', true)
  }

  const conteneur = await graph<{ id: string }>(`${igId}/media`, {
    token,
    methode: 'POST',
    params: { image_url: medias[0], caption: texte.slice(0, 2200) },
  })

  const publie = await graph<{ id: string }>(`${igId}/media_publish`, {
    token,
    methode: 'POST',
    params: { creation_id: conteneur.id },
  })

  return publie.id
}

export const meta: SocialProvider = {
  id: 'meta',
  label: 'Facebook et Instagram',

  /*
   * Aucun profil à créer chez un tiers : c'est tout l'intérêt du natif. Le
   * vendeur est son propre profil, et son identifiant fait l'affaire.
   */
  async creerProfil(userId) {
    return userId
  },

  async listerComptes(profilId): Promise<CompteRaccorde[]> {
    const comptes = await prisma.socialAccount.findMany({
      where: { userId: profilId, provider: 'meta' },
      // Le jeton n'est pas lu ici : cette liste remonte jusqu'au navigateur.
      select: { externalId: true, platform: true, label: true, connected: true, isAdAccount: true },
      orderBy: [{ platform: 'asc' }],
    })
    return comptes
  },

  async lienDeConnexion(profilId, _platform, _retour) {
    const { appId } = configuration()
    const url = new URL(`https://www.facebook.com/${VERSION}/dialog/oauth`)
    url.searchParams.set('client_id', appId)
    /*
     * L'adresse de retour est la nôtre, pas celle que l'appelant demande.
     *
     * Meta exige qu'elle soit déclarée à l'identique dans les réglages de l'app,
     * au caractère près. Une adresse variable ferait échouer l'échange du code
     * avec un message qui ne l'explique pas.
     */
    url.searchParams.set('redirect_uri', callbackMeta())
    url.searchParams.set('scope', PORTEE)
    url.searchParams.set('response_type', 'code')
    /*
     * `state` porte l'identifiant du vendeur, et le retour le vérifie.
     *
     * Sans lui, n'importe qui pourrait faire aboutir une autorisation sur le
     * compte d'un autre en rejouant l'adresse de retour — c'est la faille CSRF
     * classique d'OAuth, et elle rattacherait la page d'un vendeur au compte
     * d'un autre.
     */
    url.searchParams.set('state', profilId)
    return url.toString()
  },

  async publier(profilId, p: Publication): Promise<ResultatPublication> {
    if (p.quand && p.quand.getTime() > Date.now()) {
      throw new SocialError(
        "La publication programmée n'est pas encore disponible sur Facebook et Instagram : publiez maintenant.",
      )
    }

    const parCompte: ResultatPublication['parCompte'] = []

    /*
     * Compte par compte, et les échecs n'arrêtent rien.
     *
     * Une publication vers trois comptes peut réussir sur deux : s'arrêter au
     * premier refus laisserait le vendeur sans savoir ce qui est parti et ce
     * qui reste à refaire. Chaque ligne porte donc son propre sort.
     */
    for (const externalId of p.comptes) {
      try {
        const compte = await compteAvecJeton(profilId, externalId)
        const medias = (p.medias ?? []).filter((m) => /^https:\/\//.test(m))

        const id =
          compte.platform === 'instagram'
            ? await publierSurInstagram(compte.token!, externalId, p.texte, medias)
            : await publierSurPage(compte.token!, externalId, p.texte, medias)

        parCompte.push({
          compte: externalId,
          etat: 'publiee',
          url:
            compte.platform === 'instagram'
              ? `https://www.instagram.com/p/${id}`
              : `https://www.facebook.com/${id}`,
          erreur: null,
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

    const reussies = parCompte.filter((c) => c.etat === 'publiee').length
    return {
      externalId: parCompte.find((c) => c.etat === 'publiee')?.compte ?? '',
      etat: reussies === 0 ? 'echouee' : reussies === parCompte.length ? 'publiee' : 'partielle',
      parCompte,
    }
  },
}

/**
 * Coupe le lien avec Meta, à la demande du vendeur ou de Meta lui-même.
 *
 * Meta exige un point d'entrée de suppression de données pour valider l'app, et
 * l'appelle quand un utilisateur retire l'application depuis ses réglages
 * Facebook. Sans lui, l'examen est refusé — et surtout, nous garderions des
 * jetons pour un accès qui n'existe plus.
 */
export async function oublierMeta(userId: string): Promise<number> {
  const { count } = await prisma.socialAccount.updateMany({
    where: { userId, provider: 'meta' },
    data: { connected: false, token: null, meta: undefined },
  })
  return count
}
