import 'dotenv/config'
import { createServer } from 'http'

/**
 * Éprouve les adaptateurs TikTok (publication et publicité) contre un faux serveur.
 *
 * Le faux serveur écrit le contrat **en dur**, d'après la documentation publique :
 * il prouve que notre code fait ce que nous croyons que TikTok attend, pas que
 * TikTok l'attend vraiment — il n'a jamais été joué contre le vrai TikTok.
 *
 * Aucune base de données ici : le banc n'appelle que les fonctions pures qui
 * prennent un jeton. Les gestes qui lisent ou écrivent `socialAccount`
 * (finaliserConnexion, publier du moteur, creerCampagne du moteur) ne sont pas
 * exercés.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Le faux TikTok ----------------------------------------------------------

interface Appel {
  chemin: string
  methode: string
  entetes: Record<string, string | string[] | undefined>
  corps: any
  query: Record<string, string>
}

const appels: Appel[] = []
let confidentialites = ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']
let statutPublication: string[] = ['PROCESSING_DOWNLOAD', 'PUBLISH_COMPLETE']
let refus: { code: string } | null = null
let refusAds: { code: number; message: string } | null = null
let compteurStatut = 0
let rapport: unknown[] = []

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  let brut = ''
  for await (const m of req) brut += m

  const type = String(req.headers['content-type'] ?? '')
  let corps: any = {}
  if (brut) {
    corps = type.includes('json') ? JSON.parse(brut) : Object.fromEntries(new URLSearchParams(brut))
  }
  const chemin = url.pathname.replace(/^\/open_api/, '')
  appels.push({
    chemin,
    methode: req.method ?? 'GET',
    entetes: req.headers,
    corps,
    query: Object.fromEntries(url.searchParams),
  })

  const json = (statut: number, donnees: unknown) => {
    res.writeHead(statut, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(donnees))
  }
  const ok = (data: unknown) => json(200, { data, error: { code: 'ok', message: '', log_id: 'L' } })
  const okAds = (data: unknown) => json(200, { code: 0, message: 'OK', request_id: 'R', data })

  // ----- Open API (organique) -----
  if (chemin.startsWith('/v2/')) {
    if (refus) return json(401, { error: { code: refus.code, message: 'refus du banc', log_id: 'L' } })

    if (chemin === '/v2/oauth/token/') {
      if (corps.grant_type === 'refresh_token') {
        if (corps.refresh_token !== 'REFRESH_1') {
          return json(400, { error: 'invalid_grant', error_description: 'Refresh token is invalid' })
        }
        return json(200, {
          access_token: 'ACCES_2',
          refresh_token: 'REFRESH_2',
          expires_in: 86400,
          refresh_expires_in: 31536000,
          open_id: 'OPEN_1',
          scope: 'user.info.basic',
          token_type: 'Bearer',
        })
      }
      if (corps.code !== 'CODE_OK') return json(400, { error: 'invalid_grant', error_description: 'Authorization code is expired' })
      return json(200, {
        access_token: 'ACCES_1',
        refresh_token: 'REFRESH_1',
        expires_in: 86400,
        refresh_expires_in: 31536000,
        open_id: 'OPEN_1',
        scope: 'user.info.basic,video.publish,video.upload',
        token_type: 'Bearer',
      })
    }
    if (chemin === '/v2/user/info/') {
      return ok({ user: { open_id: 'OPEN_1', display_name: 'oggus.fr' } })
    }
    if (chemin === '/v2/post/publish/creator_info/query/') {
      return ok({ creator_username: 'oggus', privacy_level_options: confidentialites, max_video_post_duration_sec: 600 })
    }
    if (chemin === '/v2/post/publish/video/init/' || chemin === '/v2/post/publish/content/init/') {
      return ok({ publish_id: chemin.includes('video') ? 'PUB_VIDEO' : 'PUB_PHOTO' })
    }
    if (chemin === '/v2/post/publish/status/fetch/') {
      const statut = statutPublication[Math.min(compteurStatut++, statutPublication.length - 1)]
      return ok({ status: statut, publicaly_available_post_id: statut === 'PUBLISH_COMPLETE' ? [7123456] : [] })
    }
    return json(404, {})
  }

  // ----- Marketing API (publicité) : toujours HTTP 200 -----
  if (chemin.startsWith('/v1.3/')) {
    if (refusAds) return json(200, { code: refusAds.code, message: refusAds.message, request_id: 'R' })
    // L'échange du code est le seul appel sans jeton : il porte app_id et secret.
    if (chemin !== '/v1.3/oauth2/access_token/' && req.headers['access-token'] !== 'JETON_ADS') {
      return json(200, { code: 40105, message: 'Access token is invalid', request_id: 'R' })
    }
    switch (chemin) {
      case '/v1.3/oauth2/access_token/':
        if (corps.auth_code !== 'AUTH_OK') return json(200, { code: 40002, message: 'Invalid auth_code', request_id: 'R' })
        return okAds({ access_token: 'JETON_ADS', advertiser_ids: ['111', '222'], scope: [4] })
      case '/v1.3/oauth2/advertiser/get/':
        return okAds({ list: [{ advertiser_id: '111', advertiser_name: 'Boutique A' }] })
      case '/v1.3/advertiser/info/':
        return okAds({
          list: [
            { advertiser_id: '111', name: 'Boutique A', currency: 'EUR', timezone: 'Europe/Paris' },
            { advertiser_id: '222', name: 'Boutique B', currency: 'USD', timezone: 'America/New_York' },
          ],
        })
      case '/v1.3/tools/region/':
        return okAds({
          region_info: [
            { location_id: '3017382', region_code: 'FR', level: 'COUNTRY' },
            { location_id: '2802361', region_code: 'BE', level: 'COUNTRY' },
          ],
        })
      case '/v1.3/campaign/create/':
        return okAds({ campaign_id: 'CAMP_1' })
      case '/v1.3/adgroup/create/':
        return okAds({ adgroup_id: 'GRP_1' })
      case '/v1.3/file/image/ad/upload/':
        return okAds({ image_id: 'IMG_1' })
      case '/v1.3/identity/get/':
        return okAds({ identity_list: [] })
      case '/v1.3/identity/create/':
        return okAds({ identity_id: 'ID_1' })
      case '/v1.3/ad/create/':
        return okAds({ ad_ids: ['AD_1'] })
      case '/v1.3/campaign/get/':
        return okAds({
          list: [
            { campaign_id: 'CAMP_1', operation_status: 'DISABLE', secondary_status: 'CAMPAIGN_STATUS_DISABLE' },
            { campaign_id: 'CAMP_2', operation_status: 'ENABLE', secondary_status: 'CAMPAIGN_STATUS_ENABLE' },
            { campaign_id: 'CAMP_3', operation_status: 'ENABLE', secondary_status: 'CAMPAIGN_STATUS_ADVERTISER_AUDIT_DENY' },
          ],
        })
      case '/v1.3/report/integrated/get/':
        return okAds({ list: rapport })
    }
    return json(404, {})
  }

  json(404, {})
})

await new Promise<void>((resolve) => serveur.listen(0, resolve))
const port = (serveur.address() as { port: number }).port

process.env.TIKTOK_API_URL = `http://127.0.0.1:${port}`
process.env.TIKTOK_ADS_API_URL = `http://127.0.0.1:${port}/open_api`
process.env.TIKTOK_CLIENT_KEY = 'CLE_TEST'
process.env.TIKTOK_CLIENT_SECRET = 'SECRET_TEST'
process.env.TIKTOK_ADS_APP_ID = 'APP_ADS_TEST'
process.env.TIKTOK_ADS_SECRET = 'SECRET_ADS_TEST'
process.env.PUBLIC_API_URL = 'https://api.test'
process.env.JWT_SECRET = 'secret-du-banc'

// Importé après les variables, par prudence (les adresses sont lues à l'appel).
const t = await import('./src/services/socialTiktok.js')
const { lireEtat } = await import('./src/services/oauthEtat.js')
const { SocialError } = await import('./src/services/socialTypes.js')

const entiers = { tentatives: 3, delaiMs: 1 }
const reinit = () => {
  appels.length = 0
  compteurStatut = 0
  refus = null
  refusAds = null
  confidentialites = ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']
  statutPublication = ['PROCESSING_DOWNLOAD', 'PUBLISH_COMPLETE']
}

try {
  exige(t.tiktokConfigure(), 'tiktokConfigure doit être vrai avec clé et secret')
  exige(t.tiktokAdsConfigure(), 'tiktokAdsConfigure doit être vrai avec app id et secret')
  exige(t.tiktok.id === 'tiktok' && t.tiktok.plateformes?.[0] === 'tiktok', 'id et plateformes de tiktok')
  exige(t.tiktokAds.id === 'tiktok-ads' && t.tiktokAds.plateformes?.[0] === 'tiktok-ads', 'id et plateformes de tiktokAds')

  // --- Le lien d'autorisation (organique) -----------------------------------
  const lien = new URL(await t.tiktok.lienDeConnexion!('VENDEUR_1', 'tiktok', 'https://ignore.moi'))
  exige(lien.hostname === 'www.tiktok.com' && lien.pathname === '/v2/auth/authorize/', `adresse : ${lien.origin}${lien.pathname}`)
  exige(lien.searchParams.get('client_key') === 'CLE_TEST', 'client_key')
  exige(lien.searchParams.get('scope') === 'user.info.basic,video.publish,video.upload', `scopes : ${lien.searchParams.get('scope')}`)
  exige(lien.searchParams.get('response_type') === 'code', 'response_type=code')
  exige(
    lien.searchParams.get('redirect_uri') === 'https://api.test/api/public/social/tiktok/callback',
    `redirect_uri : ${lien.searchParams.get('redirect_uri')}`,
  )
  const etat = lireEtat(lien.searchParams.get('state') ?? '')
  exige(etat?.userId === 'VENDEUR_1' && etat?.plateforme === 'tiktok', 'le state doit être signé et porter vendeur et plateforme')
  exige(lireEtat((lien.searchParams.get('state') ?? '') + 'x') === null, 'un state altéré doit être refusé')

  // --- Échange du code et renouvellement ------------------------------------
  reinit()
  const j = await t.echangerCodeTiktok('CODE_OK', 'https://api.test/api/public/social/tiktok/callback')
  exige(j.accessToken === 'ACCES_1' && j.refreshToken === 'REFRESH_1' && j.openId === 'OPEN_1', 'jetons rendus par l\'échange')
  exige(j.expire.getTime() > Date.now() + 80_000_000, "le jeton d'accès doit expirer dans environ 24 h")
  const echange = appels[0]
  exige(
    echange.corps.grant_type === 'authorization_code' && echange.corps.client_secret === 'SECRET_TEST' && echange.corps.code === 'CODE_OK',
    `corps de l'échange : ${JSON.stringify(echange.corps)}`,
  )
  exige(String(echange.entetes['content-type']).includes('x-www-form-urlencoded'), "l'échange part en formulaire")

  const profil = await t.lireProfilTiktok(j.accessToken)
  exige(profil.openId === 'OPEN_1' && profil.nom === 'oggus.fr', 'profil lu')
  exige(appels[appels.length - 1].entetes.authorization === 'Bearer ACCES_1', 'le profil se lit avec le jeton en Bearer')

  const r2 = await t.rafraichirJetonTiktok('REFRESH_1')
  exige(r2.accessToken === 'ACCES_2' && r2.refreshToken === 'REFRESH_2', 'le renouvellement rend un nouveau couple de jetons')
  exige(appels[appels.length - 1].corps.grant_type === 'refresh_token', 'grant_type=refresh_token')
  let invalide = ''
  try {
    await t.rafraichirJetonTiktok('PERIME')
  } catch (e) {
    invalide = e instanceof SocialError && e.actionnable ? e.message : ''
  }
  exige(invalide.includes('reliez le compte'), `renouvellement refusé : ${invalide}`)
  let codeFaux = ''
  try {
    await t.echangerCodeTiktok('FAUX', 'x')
  } catch (e) {
    codeFaux = e instanceof Error ? e.message : ''
  }
  exige(codeFaux.includes('expiré'), `code périmé : ${codeFaux}`)

  exige(t.jetonExpire(new Date(Date.now() - 1000)), 'un jeton passé est expiré')
  exige(t.jetonExpire(new Date(Date.now() + 30_000)), 'un jeton qui expire dans 30 s est à renouveler')
  exige(!t.jetonExpire(new Date(Date.now() + 3_600_000)), 'un jeton valide une heure ne se renouvelle pas')

  // --- Publication : photos --------------------------------------------------
  reinit()
  const photos = await t.publierSurTiktok('ACCES_1', 'Notre montre automatique', ['https://m.test/1.jpg', 'https://m.test/2.jpg', 'http://non-https/3.jpg'], entiers)
  exige(photos.etat === 'publiee', `photos : état ${photos.etat}`)
  exige(photos.publishId === 'PUB_PHOTO', 'photos : publish_id')
  exige(photos.url === 'https://www.tiktok.com/@oggus/video/7123456', `url : ${photos.url}`)
  const ordre = appels.map((a) => a.chemin)
  exige(ordre[0] === '/v2/post/publish/creator_info/query/', "creator_info doit être interrogé en premier")
  const initPhoto = appels.find((a) => a.chemin === '/v2/post/publish/content/init/')
  exige(Boolean(initPhoto), 'photos : /content/init/ appelé')
  exige(initPhoto?.corps.media_type === 'PHOTO' && initPhoto?.corps.post_mode === 'DIRECT_POST', 'photos : media_type et post_mode')
  exige(initPhoto?.corps.source_info.source === 'PULL_FROM_URL', 'photos : PULL_FROM_URL')
  exige(initPhoto?.corps.source_info.photo_images.length === 2, 'photos : les adresses non https sont écartées')
  exige(initPhoto?.corps.post_info.privacy_level === 'PUBLIC_TO_EVERYONE', 'photos : public quand offert')
  exige(photos.note === null, 'photos publiques : pas de remarque')
  exige(appels.filter((a) => a.chemin.endsWith('/status/fetch/')).length === 2, 'le statut est interrogé jusqu’à la fin')

  // Plafond de 35 images.
  reinit()
  const quarante = Array.from({ length: 40 }, (_, i) => `https://m.test/${i}.jpg`)
  await t.publierSurTiktok('ACCES_1', 'x', quarante, entiers)
  exige(
    appels.find((a) => a.chemin.endsWith('/content/init/'))?.corps.source_info.photo_images.length === 35,
    'au plus 35 images',
  )

  // --- Publication : vidéo ---------------------------------------------------
  reinit()
  const video = await t.publierSurTiktok('ACCES_1', 'Démo produit', ['https://m.test/clip.mp4?v=2', 'https://m.test/1.jpg'], entiers)
  exige(video.etat === 'publiee' && video.publishId === 'PUB_VIDEO', `vidéo : ${video.etat} ${video.publishId}`)
  const initVideo = appels.find((a) => a.chemin === '/v2/post/publish/video/init/')
  exige(initVideo?.corps.source_info.source === 'PULL_FROM_URL', 'vidéo : PULL_FROM_URL')
  exige(initVideo?.corps.source_info.video_url === 'https://m.test/clip.mp4?v=2', 'vidéo : video_url')
  exige(!appels.some((a) => a.chemin.endsWith('/content/init/')), 'une vidéo ne part pas par /content/init/')

  // --- Texte seul : refusé AVANT tout appel ----------------------------------
  reinit()
  let sansMedia = ''
  try {
    await t.publierSurTiktok('ACCES_1', 'Juste du texte', [], entiers)
  } catch (e) {
    sansMedia = e instanceof SocialError ? e.message : ''
  }
  exige(sansMedia.includes('vidéo') && sansMedia.includes('images'), `texte seul : ${sansMedia}`)
  exige(appels.length === 0, 'texte seul : aucun appel à TikTok')
  let httpSeul = ''
  try {
    await t.publierSurTiktok('ACCES_1', 'x', ['http://m.test/1.jpg'], entiers)
  } catch (e) {
    httpSeul = e instanceof Error ? e.message : ''
  }
  exige(httpSeul !== '' && appels.length === 0, 'un média non https est refusé sans appel')

  // --- Application non auditée : SELF_ONLY, dit honnêtement -------------------
  reinit()
  confidentialites = ['SELF_ONLY']
  const prive = await t.publierSurTiktok('ACCES_1', 'Test', ['https://m.test/1.jpg'], entiers)
  exige(
    appels.find((a) => a.chemin.endsWith('/content/init/'))?.corps.post_info.privacy_level === 'SELF_ONLY',
    'seul SELF_ONLY offert : c’est celui-là qui est demandé',
  )
  exige(prive.note?.includes('privée') === true && prive.note.includes('audité') === true, `remarque : ${prive.note}`)

  // Aucun niveau offert : refus clair.
  reinit()
  confidentialites = []
  let aucun = ''
  try {
    await t.publierSurTiktok('ACCES_1', 'x', ['https://m.test/1.jpg'], entiers)
  } catch (e) {
    aucun = e instanceof Error ? e.message : ''
  }
  exige(aucun.includes('aucun niveau'), `aucun niveau : ${aucun}`)
  exige(t.choisirConfidentialite(['FOLLOWER_OF_CREATOR', 'SELF_ONLY']) === 'FOLLOWER_OF_CREATOR', 'à défaut de public, le premier offert')

  // --- Traitement encore en cours : planifiee, pas publiee --------------------
  reinit()
  statutPublication = ['PROCESSING_DOWNLOAD']
  const lent = await t.publierSurTiktok('ACCES_1', 'x', ['https://m.test/1.jpg'], entiers)
  exige(lent.etat === 'planifiee', `traitement en cours : état ${lent.etat}`)
  exige(lent.note?.includes('traite encore') === true, `remarque : ${lent.note}`)

  reinit()
  statutPublication = ['SEND_TO_USER_INBOX']
  const boite = await t.publierSurTiktok('ACCES_1', 'x', ['https://m.test/1.jpg'], entiers)
  exige(boite.etat === 'planifiee' && boite.note?.includes('boîte de réception') === true, 'brouillon en boîte : pas une publication')

  // --- Erreurs d'authentification et autres refus ----------------------------
  reinit()
  refus = { code: 'access_token_invalid' }
  let expire: unknown = null
  try {
    await t.publierSurTiktok('VIEUX', 'x', ['https://m.test/1.jpg'], entiers)
  } catch (e) {
    expire = e
  }
  exige(expire instanceof SocialError && expire.actionnable && expire.message.includes('reliez le compte'), 'jeton invalide : message actionnable')

  reinit()
  refus = { code: 'url_ownership_unverified' }
  let domaine = ''
  try {
    await t.publierSurTiktok('ACCES_1', 'x', ['https://m.test/1.jpg'], entiers)
  } catch (e) {
    domaine = e instanceof Error ? e.message : ''
  }
  exige(domaine.includes('domaine') && domaine.includes('vérifié'), `domaine non vérifié : ${domaine}`)
  exige(t.traduireErreurTiktok('rate_limit_exceeded', '').message.includes('limité le débit'), 'quota organique')
  exige(t.traduireErreurTiktok('spam_risk_too_many_posts', '').message.includes('limite quotidienne'), 'limite de publications')

  // --- Publicité : le lien ---------------------------------------------------
  const lienAds = new URL(await t.tiktokAds.lienDeConnexion!('VENDEUR_2', 'tiktok-ads', 'https://ignore.moi'))
  exige(lienAds.hostname === 'business-api.tiktok.com' && lienAds.pathname === '/portal/auth', 'adresse du portail Ads')
  exige(lienAds.searchParams.get('app_id') === 'APP_ADS_TEST', 'app_id')
  exige(lienAds.searchParams.get('redirect_uri') === 'https://api.test/api/public/social/tiktok-ads/callback', 'redirect_uri Ads')
  const etatAds = lireEtat(lienAds.searchParams.get('state') ?? '')
  exige(etatAds?.userId === 'VENDEUR_2' && etatAds?.plateforme === 'tiktok-ads', 'state Ads signé')

  // --- Publicité : jeton et annonceurs ---------------------------------------
  reinit()
  const ech = await t.echangerCodeAds('AUTH_OK')
  exige(ech.token === 'JETON_ADS' && ech.annonceurs.join() === '111,222', 'jeton et annonceurs')
  exige(appels[0].corps.app_id === 'APP_ADS_TEST' && appels[0].corps.secret === 'SECRET_ADS_TEST' && appels[0].corps.auth_code === 'AUTH_OK', "corps de l'échange Ads")
  const autorises = await t.annonceursAutorises('JETON_ADS')
  exige(autorises.join() === '111', 'repli advertiser/get')
  const details = await t.detailsAnnonceurs('JETON_ADS', ['111', '222'])
  exige(details[1].devise === 'USD' && details[0].nom === 'Boutique A', 'devise et nom des annonceurs')

  let mauvais = ''
  try {
    await t.echangerCodeAds('FAUX')
  } catch (e) {
    mauvais = e instanceof SocialError && e.actionnable ? e.message : ''
  }
  exige(mauvais.includes('reliez le compte'), `code Ads faux (40002) : ${mauvais}`)

  // --- Publicité : erreurs ---------------------------------------------------
  refusAds = { code: 40100, message: 'Too many requests' }
  let debit = ''
  try {
    await t.listerCampagnesTiktok('JETON_ADS', '111')
  } catch (e) {
    debit = e instanceof Error ? e.message : ''
  }
  exige(debit.includes('limité le débit'), `40100 : ${debit}`)
  exige(t.traduireErreurAds(40001, 'Access token is invalid').message.includes('reliez'), '40001 (jeton) : reconnecter')
  exige(t.traduireErreurAds(40105, 'x').actionnable, '40105 : actionnable')
  exige(t.traduireErreurAds(40002, 'Invalid budget').message.includes('Invalid budget'), '40002 (paramètre) : message conservé')
  refusAds = null
  let sansJeton = ''
  try {
    await t.listerCampagnesTiktok('MAUVAIS', '111')
  } catch (e) {
    sansJeton = e instanceof SocialError && e.actionnable ? e.message : ''
  }
  exige(sansJeton.includes('reliez le compte'), `HTTP 200 + code 40105 traité comme une erreur : ${sansJeton}`)

  // --- Publicité : la chaîne, en pause par défaut ----------------------------
  const campagne = {
    compte: '111',
    nom: 'Montre automatique',
    objectif: 'trafic',
    budgetJour: 2550,
    creative: {
      image: 'https://m.test/visuel.jpg',
      titre: 'Montre automatique',
      texte: 'Livraison offerte cette semaine',
      url: 'https://boutique.test/montre',
      boutonLabel: 'Acheter',
    },
    ciblage: { paysCodes: ['fr'], ageMin: 25, ageMax: 44 },
  }

  reinit()
  const enPause = await t.creerCampagneTiktok('JETON_ADS', '111', campagne, { nomAnnonceur: 'Boutique A' })
  exige(enPause.etat === 'brouillon', `état par défaut : ${enPause.etat}`)
  exige(enPause.campagneId === 'CAMP_1' && enPause.groupeId === 'GRP_1' && enPause.imageId === 'IMG_1' && enPause.annonceId === 'AD_1', 'identifiants de la chaîne')
  const suite = appels.map((a) => a.chemin.replace('/v1.3', ''))
  const pos = (p: string) => suite.indexOf(p)
  exige(
    pos('/campaign/create/') < pos('/adgroup/create/') &&
      pos('/adgroup/create/') < pos('/file/image/ad/upload/') &&
      pos('/file/image/ad/upload/') < pos('/ad/create/') &&
      pos('/campaign/create/') >= 0,
    `ordre des appels : ${suite.join(' > ')}`,
  )
  const creation = (p: string) => appels.find((a) => a.chemin.endsWith(p))!.corps
  exige(creation('/campaign/create/').operation_status === 'DISABLE', 'campagne créée DISABLE')
  exige(creation('/adgroup/create/').operation_status === 'DISABLE', 'groupe créé DISABLE')
  exige(creation('/ad/create/').creatives[0].operation_status === 'DISABLE', 'annonce créée DISABLE')
  exige(creation('/campaign/create/').objective_type === 'TRAFFIC', 'objectif trafic')
  const g = creation('/adgroup/create/')
  exige(g.budget === 25.5 && g.budget_mode === 'BUDGET_MODE_DAY', `budget : ${g.budget}`)
  exige(g.placement_type === 'PLACEMENT_TYPE_AUTOMATIC', 'placement automatique')
  exige(g.location_ids.join() === '3017382', `lieux : ${g.location_ids}`)
  exige(g.age_groups.join() === 'AGE_25_34,AGE_35_44', `âges : ${g.age_groups}`)
  exige(g.schedule_type === 'SCHEDULE_FROM_NOW' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(g.schedule_start_time), `début : ${g.schedule_start_time}`)
  exige(creation('/file/image/ad/upload/').upload_type === 'UPLOAD_BY_URL' && creation('/file/image/ad/upload/').image_url === campagne.creative.image, "téléversement de l'image par adresse")
  const cr = creation('/ad/create/').creatives[0]
  exige(cr.identity_type === 'CUSTOMIZED_USER' && cr.identity_id === 'ID_1', 'identité créée au nom de l’annonceur')
  exige(cr.image_ids[0] === 'IMG_1' && cr.call_to_action === 'SHOP_NOW' && cr.landing_page_url === campagne.creative.url, 'contenu de l’annonce')
  exige(appels.every((a) => a.methode === 'GET' || a.entetes['access-token'] === 'JETON_ADS'), 'jeton dans l’en-tête Access-Token')

  reinit()
  const active = await t.creerCampagneTiktok('JETON_ADS', '111', { ...campagne, activer: true }, { nomAnnonceur: 'Boutique A' })
  exige(active.etat === 'active', `avec activer : ${active.etat}`)
  exige(creation('/campaign/create/').operation_status === 'ENABLE', 'campagne ENABLE avec activer')
  exige(creation('/adgroup/create/').operation_status === 'ENABLE', 'groupe ENABLE avec activer')
  exige(creation('/ad/create/').creatives[0].operation_status === 'ENABLE', 'annonce ENABLE avec activer')

  // Objectifs de repli, dits dans les notes.
  reinit()
  const conv = await t.creerCampagneTiktok('JETON_ADS', '111', { ...campagne, objectif: 'conversions' }, { nomAnnonceur: 'Boutique A' })
  exige(creation('/campaign/create/').objective_type === 'TRAFFIC', 'conversions : repli sur TRAFFIC')
  exige(conv.notes.some((n) => n.includes('pixel')), 'conversions : la note explique le repli')
  exige(t.objectifTiktok('notoriete').type === 'REACH', 'notoriété → REACH')
  exige(t.objectifTiktok('engagement').note !== null, 'engagement : repli noté')

  // Un pays inconnu n'envoie rien de plus loin.
  reinit()
  let paysInconnu = ''
  try {
    await t.creerCampagneTiktok('JETON_ADS', '111', { ...campagne, ciblage: { paysCodes: ['ZZ'] } }, { nomAnnonceur: 'Boutique A' })
  } catch (e) {
    paysInconnu = e instanceof Error ? e.message : ''
  }
  exige(paysInconnu.includes('aucun des pays') && !appels.some((a) => a.chemin.endsWith('/campaign/create/')), 'pays inconnu : refus avant toute création')

  // Une image en http est refusée avant tout appel.
  reinit()
  let sansImage = ''
  try {
    await t.creerCampagneTiktok('JETON_ADS', '111', { ...campagne, creative: { ...campagne.creative, image: 'ftp://x/y.jpg' } }, { nomAnnonceur: 'Boutique A' })
  } catch (e) {
    sansImage = e instanceof Error ? e.message : ''
  }
  exige(sansImage.includes('image') && appels.length === 0, 'image invalide : refus sans appel')

  // Conversions de budget et d'âges.
  exige(t.budgetEnUnites(1999) === 19.99, 'budget : 1999 centimes = 19,99')
  exige(t.tranchesAge() === undefined, 'sans âge : pas de filtre')
  exige(t.tranchesAge(13, 17) === undefined, 'jamais de tranche mineure')
  exige(t.tranchesAge(18, 60)?.join() === 'AGE_18_24,AGE_25_34,AGE_35_44,AGE_45_54,AGE_55_100', 'âges 18-60')
  exige(t.boutonTiktok() === 'LEARN_MORE' && t.boutonTiktok('Commander') === 'ORDER_NOW' && t.boutonTiktok('shop now') === 'SHOP_NOW', 'boutons')

  // --- Lecture des campagnes et rapport --------------------------------------
  reinit()
  const liste = await t.listerCampagnesTiktok('JETON_ADS', '111')
  exige(liste.length === 3, `${liste.length} campagnes`)
  exige(liste[0].etat === 'brouillon' && liste[1].etat === 'active' && liste[2].etat === 'refusee', `états : ${liste.map((c) => c.etat)}`)

  reinit()
  rapport = [
    { dimensions: { campaign_id: 'CAMP_2' }, metrics: { spend: '12.34', impressions: '1500', clicks: '42', conversion: '3' } },
    { dimensions: { campaign_id: 'CAMP_1' }, metrics: { spend: '0.00', impressions: '0', clicks: '0', conversion: null } },
  ]
  const perf = await t.performancesTiktok('JETON_ADS', '111', ['CAMP_1', 'CAMP_2'], 'EUR')
  exige(perf.length === 2, `${perf.length} lignes de rapport`)
  exige(
    perf[0].externalId === 'CAMP_2' && perf[0].depense === 1234 && perf[0].impressions === 1500 && perf[0].clics === 42 && perf[0].conversions === 3 && perf[0].devise === 'EUR',
    `rapport : ${JSON.stringify(perf[0])}`,
  )
  exige(perf[1].conversions === null, 'conversion absente : null, pas zéro')
  const rq = appels[0].query
  exige(rq.report_type === 'BASIC' && rq.data_level === 'AUCTION_CAMPAIGN', 'rapport BASIC / AUCTION_CAMPAIGN')
  exige(rq.metrics === '["spend","impressions","clicks","conversion"]', `métriques : ${rq.metrics}`)
  exige(rq.filtering.includes('CAMP_1') && rq.filtering.includes('campaign_ids'), 'filtre sur les campagnes')
  exige((await t.performancesTiktok('JETON_ADS', '111', [], 'EUR')).length === 0, 'aucune campagne : aucun appel')
} finally {
  serveur.close()
}

console.log(echecs === 0 ? 'TikTok : tout passe.' : `TikTok : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
