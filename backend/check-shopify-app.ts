import crypto from 'node:crypto'
import {
  configApp,
  donneesLiaison,
  echangerCode,
  hmacRequeteValide,
  hmacWebhookValide,
  jetonOfflineValide,
  lireEtat,
  RafraichissementRefuse,
  signerEtat,
  urlInstallation,
  type ConfigApp,
} from './src/services/shopifyApp.js'

/**
 * Éprouve l'installation OAuth et la signature des webhooks Shopify.
 *
 * **Pourquoi un banc ici plutôt qu'un essai en ligne.** Ces deux portes sont
 * publiques : Shopify les appelle, aucun jeton de session ne les protège, et la
 * seule chose qui sépare un appel légitime d'un appel forgé est une signature.
 * Une erreur s'y voit rarement — tout continue de marcher, simplement n'importe
 * qui peut entrer. Ça ne se constate pas, ça se prouve.
 *
 * **Le contrat est écrit EN DUR**, c'est la leçon du banc Kaufland : le faux
 * serveur y recalculait d'abord la signature avec la fonction du connecteur, si
 * bien qu'une faute était des deux côtés et que la contre-épreuve ne tombait
 * jamais. Ici les signatures attendues sont recomposées à la main, étape par
 * étape, d'après la recette publiée par Shopify.
 */
let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const SECRET = 'hush-hush-secret-de-banc'
const config: ConfigApp = {
  cle: 'cle-publique-de-banc',
  secret: SECRET,
  portee: 'write_products,read_products',
  racine: 'https://api.exemple.test',
}

// ── 1. L'adresse d'installation ─────────────────────────────────────────────

const url = urlInstallation(config, 'usr_1', 'ma-boutique')
exige(url !== null, "l'adresse courte « ma-boutique » doit être acceptée")
const u = new URL(url!)
exige(u.host === 'ma-boutique.myshopify.com', `hôte ${u.host}`)
exige(u.pathname === '/admin/oauth/authorize', `chemin ${u.pathname}`)
exige(u.searchParams.get('client_id') === config.cle, 'la clé publique est transmise')
exige(
  u.searchParams.get('redirect_uri') === 'https://api.exemple.test/api/shopify/callback',
  `retour ${u.searchParams.get('redirect_uri')}`,
)
exige(!url!.includes(SECRET), "le secret ne doit JAMAIS partir dans l'adresse")

/*
 * La redirection ouverte, le piège de toute installation OAuth.
 *
 * Cette valeur vient du marchand et finit dans un `Location:`. Sans le contrôle
 * `*.myshopify.com`, on signerait de notre nom une redirection vers n'importe
 * quel site — hameçonnage prêt à l'emploi.
 */
for (const mauvais of ['evil.test', 'https://evil.test', 'ma-boutique.myshopify.com.evil.test', '']) {
  exige(urlInstallation(config, 'usr_1', mauvais) === null, `« ${mauvais} » ne doit pas produire d'adresse`)
}

/*
 * Le chemin collé derrière le domaine ne doit pas survivre.
 *
 * Celui-là ne se refuse pas, il se NETTOIE : `normalizeShopDomain` coupe tout
 * après la première barre, et l'hôte final reste la vraie boutique. L'attente
 * porte donc sur l'hôte obtenu, pas sur un refus — se tromper de verdict ici
 * aurait fait « corriger » un code qui était juste.
 */
const avecChemin = urlInstallation(config, 'usr_1', 'ma-boutique.myshopify.com/../evil')
exige(
  avecChemin !== null && new URL(avecChemin).host === 'ma-boutique.myshopify.com',
  `un chemin collé au domaine doit être coupé, vu : ${avecChemin}`,
)

// ── 2. L'état signé : qui installe, et jusqu'à quand ────────────────────────

const t0 = 1_800_000_000_000
const etat = signerEtat(config, 'usr_1', 'ma-boutique.myshopify.com', t0 + 60_000)

const lu = lireEtat(config, etat, t0)
exige(lu?.userId === 'usr_1' && lu.shop === 'ma-boutique.myshopify.com', 'un état valide se relit')
exige(lireEtat(config, etat, t0 + 120_000) === null, 'un état périmé est refusé')
exige(lireEtat(config, `${etat}x`, t0) === null, 'une signature retouchée est refusée')

// Le cœur : changer le compte sans le secret ne doit rien donner.
const [charge] = etat.split('.')
const chargeTruquee = Buffer.from(
  JSON.stringify({ u: 'usr_VOLEUR', s: 'ma-boutique.myshopify.com', e: t0 + 60_000 }),
).toString('base64url')
exige(
  lireEtat(config, `${chargeTruquee}.${etat.split('.')[1]}`, t0) === null,
  "changer le compte en gardant la signature d'origine doit être refusé",
)
exige(charge !== chargeTruquee, 'le banc compare bien deux charges différentes')

// Et un autre secret ne relit pas nos états.
const autre: ConfigApp = { ...config, secret: 'un-autre-secret' }
exige(lireEtat(autre, etat, t0) === null, "un état signé d'un autre secret est refusé")

/*
 * Le chemin de retour : un chemin interne, jamais une adresse.
 *
 * Il vient du navigateur, il est signé avec l'état, et il finit dans un
 * `Location:`. Accepter `https://…` ou `//evil.test` ferait une redirection
 * ouverte SIGNÉE DE NOTRE NOM — le pire des deux mondes, puisque la signature
 * la rend crédible. Et le contrôle est refait à la LECTURE : un chemin signé
 * hier ne doit pas échapper à une règle durcie aujourd'hui.
 */
for (const mauvais of ['https://evil.test', '//evil.test', 'evil.test', '\\\\evil.test', '', null]) {
  const porteur = signerEtat(config, 'usr_1', 'ma-boutique.myshopify.com', t0 + 60_000, mauvais as string)
  exige(
    lireEtatAvecRetour(porteur) === '/plateformes-vente',
    `« ${mauvais} » doit retomber sur le retour par défaut, vu : ${lireEtatAvecRetour(porteur)}`,
  )
}
const bon = signerEtat(config, 'usr_1', 'ma-boutique.myshopify.com', t0 + 60_000, '/boutique-shopify')
exige(lireEtatAvecRetour(bon) === '/boutique-shopify', 'un chemin interne est conservé')

function lireEtatAvecRetour(etat: string): string | null {
  return lireEtat(config, etat, t0)?.retour ?? null
}

// ── 3. La signature des paramètres du retour ────────────────────────────────

/** La recette de Shopify, réécrite à la main : trier, assembler, HMAC hex. */
function hmacAttendu(params: Record<string, string>): string {
  const message = Object.keys(params)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHmac('sha256', SECRET).update(message).digest('hex')
}

const retour: Record<string, string> = {
  code: 'abc123',
  shop: 'ma-boutique.myshopify.com',
  state: etat,
  timestamp: '1800000000',
}
exige(hmacRequeteValide(config, { ...retour, hmac: hmacAttendu(retour) }), 'un retour bien signé passe')
exige(!hmacRequeteValide(config, { ...retour, hmac: 'ffff' }), 'une signature fausse est refusée')
exige(!hmacRequeteValide(config, retour), 'un retour sans signature est refusé')

// Un paramètre ajouté après coup change le message : la signature ne tient plus.
exige(
  !hmacRequeteValide(config, { ...retour, hmac: hmacAttendu(retour), code: 'CODE-DE-LATTAQUANT' }),
  'changer le code après signature doit être refusé',
)

// ── 4. La signature des webhooks ────────────────────────────────────────────

const corps = Buffer.from(JSON.stringify({ shop_domain: 'ma-boutique.myshopify.com' }))
const signature = crypto.createHmac('sha256', SECRET).update(corps).digest('base64')

exige(hmacWebhookValide(config, corps, signature), 'un webhook bien signé passe')
exige(!hmacWebhookValide(config, corps, ''), 'un webhook sans signature est refusé')
exige(!hmacWebhookValide(config, corps, signature.replace(/.$/, 'A')), 'une signature retouchée est refusée')

/*
 * Les OCTETS, pas l'objet.
 *
 * C'est la raison pour laquelle la route est montée avant `express.json` dans
 * index.ts, exactement comme celle de Stripe. Un aller-retour par JSON.parse
 * puis JSON.stringify réordonne les clés et supprime les espaces : le contenu
 * est le même, les octets non, et la signature tombe. Sans cette attente, un
 * futur déplacement de la route casserait tous les webhooks en silence.
 */
const memeObjetAutresOctets = Buffer.from('{ "shop_domain" : "ma-boutique.myshopify.com" }')
exige(
  !hmacWebhookValide(config, memeObjetAutresOctets, signature),
  'le même objet ré-encodé ne doit PAS valider : la signature porte sur les octets',
)

// ── 5. La dégradation quand l'app n'est pas déclarée ────────────────────────

const cle = process.env.SHOPIFY_APP_KEY
const secret = process.env.SHOPIFY_APP_SECRET
delete process.env.SHOPIFY_APP_KEY
delete process.env.SHOPIFY_APP_SECRET
exige(configApp() === null, "sans variables, l'app doit se déclarer absente plutôt qu'à moitié configurée")
if (cle) process.env.SHOPIFY_APP_KEY = cle
if (secret) process.env.SHOPIFY_APP_SECRET = secret

// ── 6. Le jeton expirant et son renouvellement ──────────────────────────────

/*
 * Le contrat de Shopify, EN DUR, d'après sa page « Access tokens » lue le
 * 16/09/2026 : sans `expiring: 1`, l'échange rend un jeton permanent — que
 * l'Admin API refuse ensuite en 403 pour une app publique. Avec, il rend
 * `expires_in: 3600` et un `refresh_token` (90 jours). Le renouvellement est
 * un POST au même endroit avec `grant_type: refresh_token`, rend une NOUVELLE
 * paire, et répond 401 `invalid_request` quand le refresh token ne vaut plus.
 *
 * Le faux serveur fait exactement ça, et rien d'autre : c'est lui qui aurait
 * attrapé la panne du 16/09 — la première publication réelle l'a attrapée à sa
 * place.
 */
const appels: Array<Record<string, unknown>> = []
let refreshValide = 'rt-1'
let compteur = 1
const fauxShopify: typeof fetch = async (entree, init) => {
  const adresse = String(entree)
  const corps = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  appels.push({ adresse, ...corps })
  if (adresse !== 'https://ma-boutique.myshopify.com/admin/oauth/access_token') {
    return new Response('not found', { status: 404 })
  }
  if (corps.client_id !== config.cle || corps.client_secret !== SECRET) {
    return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 })
  }
  if (corps.grant_type === 'refresh_token') {
    if (corps.refresh_token !== refreshValide) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 401 })
    }
    compteur++
    refreshValide = `rt-${compteur}`
    return Response.json({
      access_token: `at-${compteur}`,
      scope: 'write_products,write_publications',
      expires_in: 3600,
      refresh_token: refreshValide,
      refresh_token_expires_in: 7776000,
    })
  }
  if (corps.code !== 'abc123') return new Response('bad code', { status: 400 })
  if (corps.expiring !== 1) {
    // Ce que Shopify rend sans `expiring` : un jeton permanent, sans échéance.
    return Response.json({ access_token: 'permanent', scope: 'write_products' })
  }
  return Response.json({
    access_token: 'at-1',
    scope: 'write_products,write_publications',
    expires_in: 3600,
    refresh_token: 'rt-1',
    refresh_token_expires_in: 7776000,
  })
}

const T = 1_800_000_000_000
const jeton = await echangerCode(config, 'ma-boutique.myshopify.com', 'abc123', fauxShopify, T)
exige(jeton.accessToken === 'at-1' && jeton.refreshToken === 'rt-1', "l'échange demande un jeton expirant et garde le refresh token")
exige(jeton.expiresAt === new Date(T + 3600_000).toISOString(), `l'échéance vient de la réponse, vue : ${jeton.expiresAt}`)
exige(
  jeton.refreshTokenExpiresAt === new Date(T + 7776000_000).toISOString(),
  "l'échéance du refresh token vient aussi de la réponse",
)
const liaison = donneesLiaison(jeton)
exige(liaison.via === 'oauth' && liaison.shopDomain === 'ma-boutique.myshopify.com', 'la liaison rangée porte la voie et la boutique')

// Le renouvellement a besoin de la clé et du secret : ceux du banc.
const envCle = process.env.SHOPIFY_APP_KEY
const envSecret = process.env.SHOPIFY_APP_SECRET
const envRacine = process.env.PUBLIC_API_URL
process.env.SHOPIFY_APP_KEY = config.cle
process.env.SHOPIFY_APP_SECRET = SECRET
process.env.PUBLIC_API_URL = config.racine

const persistes: Array<Record<string, unknown>> = []
const persister = async (data: Record<string, unknown>) => {
  persistes.push(data)
}

// a. Un jeton encore valide sert tel quel : aucun appel réseau.
appels.length = 0
const valide = await jetonOfflineValide(liaison, persister, fauxShopify, T + 1_000)
exige(valide?.accessToken === 'at-1', 'un jeton valide est rendu tel quel')
exige(appels.length === 0 && persistes.length === 0, 'un jeton valide ne déclenche ni appel ni écriture')

// b. À moins de cinq minutes de l'échéance, on renouvelle, et on RANGE la nouvelle paire.
const renouvele = await jetonOfflineValide(liaison, persister, fauxShopify, T + 3600_000 - 2 * 60_000)
exige(renouvele?.accessToken === 'at-2', `près de l'échéance, le jeton est renouvelé, vu : ${renouvele?.accessToken}`)
exige(appels.length === 1 && appels[0].grant_type === 'refresh_token' && appels[0].refresh_token === 'rt-1', 'le renouvellement présente le refresh token courant')
exige(!('code' in appels[0]) && !('expiring' in appels[0]), 'le renouvellement ne rejoue pas un échange de code')
exige(
  persistes.length === 1 && persistes[0].accessToken === 'at-2' && persistes[0].refreshToken === 'rt-2' && persistes[0].via === 'oauth',
  "la NOUVELLE paire est écrite en base — l'ancien refresh token meurt dès que le nouveau sert",
)

// c. Un refresh token mort : refus définitif, pas une erreur à réessayer.
let refus: unknown = null
await jetonOfflineValide(liaison, persister, fauxShopify, T + 7200_000).catch((e: unknown) => {
  refus = e
})
exige(refus instanceof RafraichissementRefuse, 'un refresh token remplacé donne un refus définitif qui demande de réinstaller')
exige(persistes.length === 1, 'un refus ne réécrit rien')

// d. Les autres voies ne passent pas par ici.
exige((await jetonOfflineValide({ shopDomain: 'ma-boutique', accessToken: 'shpat_colle' }, persister, fauxShopify, T)) === null, 'un jeton collé à la main rend null')
exige(
  (await jetonOfflineValide({ shopDomain: 'ma-boutique', accessToken: 'permanent', via: 'oauth' }, persister, fauxShopify, T)) === null,
  "une liaison OAuth d'avant le 16/09 (sans refresh token) rend null : elle sera réinstallée, pas renouvelée",
)

// e. Sans `expiring`, Shopify rend un jeton permanent : la lecture doit le REFUSER, pas le ranger.
let permanent: unknown = null
await echangerCode(config, 'ma-boutique.myshopify.com', 'abc123', async (entree, init) => {
  const corps = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
  delete corps.expiring
  return fauxShopify(entree, { ...init, body: JSON.stringify(corps) })
}, T).catch((e: unknown) => {
  permanent = e
})
exige(permanent instanceof Error && /expirant/.test((permanent as Error).message), "un jeton permanent rendu par Shopify est refusé à la lecture")

process.env.SHOPIFY_APP_KEY = envCle
process.env.SHOPIFY_APP_SECRET = envSecret
process.env.PUBLIC_API_URL = envRacine
if (envCle === undefined) delete process.env.SHOPIFY_APP_KEY
if (envSecret === undefined) delete process.env.SHOPIFY_APP_SECRET
if (envRacine === undefined) delete process.env.PUBLIC_API_URL

console.log(echecs === 0 ? 'Application Shopify : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
