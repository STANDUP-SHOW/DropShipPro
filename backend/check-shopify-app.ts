import crypto from 'node:crypto'
import {
  configApp,
  hmacRequeteValide,
  hmacWebhookValide,
  lireEtat,
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

console.log(echecs === 0 ? 'Application Shopify : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
