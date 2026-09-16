import crypto from 'node:crypto'

/**
 * Éprouve le portique de l'application Shopify INTÉGRÉE : le jeton de session.
 *
 * **Pourquoi ce banc existe séparément de `check-shopify-app.ts`.** Celui-là
 * couvre l'installation — OAuth, HMAC de retour, webhooks. Celui-ci couvre le
 * second portique, qui n'a rien à voir : dans l'iframe de l'admin Shopify, nos
 * cookies n'arrivent pas, et l'authentification repose entièrement sur un JWT
 * court délivré par App Bridge. Si ce portique s'ouvre trop, la page d'un
 * marchand affiche les chiffres d'un autre.
 *
 * **Le contrat est écrit À LA MAIN ici**, jamais en rappelant nos fonctions.
 * C'est la leçon du banc Kaufland, consignée dans le mémo : un faux qui
 * recalcule la signature avec le code qu'il éprouve valide une faute des deux
 * côtés et ne tombe jamais. Les jetons ci-dessous sont donc fabriqués octet
 * par octet selon la spécification de Shopify, pas selon notre lecture d'elle.
 *
 * Le cas qui justifie à lui seul le fichier est `alg: none` : un vérificateur
 * naïf lit l'algorithme dans l'en-tête du jeton, donc accepte celui qui déclare
 * n'en avoir aucun — et le jeton se fabrique alors sans connaître le secret.
 */

const CLE = 'cle-publique-de-test'
const SECRET = 'secret-de-test-pour-le-banc'
process.env.SHOPIFY_APP_KEY = CLE
process.env.SHOPIFY_APP_SECRET = SECRET
process.env.SHOPIFY_APP_SCOPES = 'read_products'
process.env.PUBLIC_API_URL = 'https://api.exemple.test'

const { configApp, lireJetonDeSession, urlApplicationIntegree } = await import(
  './src/services/shopifyApp.js'
)
const { pageIntegree } = await import('./src/services/shopifyEmbed.js')

const config = configApp()
if (!config) throw new Error("configApp() rend null alors que les trois variables sont posées.")

/** Base64url à la main : la spec JWT, pas ce que notre code en fait. */
function b64(valeur: object | string): string {
  const texte = typeof valeur === 'string' ? valeur : JSON.stringify(valeur)
  return Buffer.from(texte, 'utf8').toString('base64url')
}

/** Assemble un JWT selon la recette de Shopify, avec le secret qu'on lui donne. */
function jeton(
  charge: Record<string, unknown>,
  options: { secret?: string; entete?: Record<string, unknown>; signature?: string } = {},
): string {
  const entete = b64(options.entete ?? { alg: 'HS256', typ: 'JWT' })
  const corps = b64(charge)
  if (options.signature !== undefined) return `${entete}.${corps}.${options.signature}`
  const signature = crypto
    .createHmac('sha256', options.secret ?? SECRET)
    .update(`${entete}.${corps}`)
    .digest('base64url')
  return `${entete}.${corps}.${signature}`
}

const MAINTENANT = 1_800_000_000_000 // une date fixe : un banc ne lit pas l'horloge
const S = Math.floor(MAINTENANT / 1000)
const BOUTIQUE = 'oguss-france.myshopify.com'

/** La charge que Shopify envoie réellement, telle que documentée. */
function chargeNormale(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: `https://${BOUTIQUE}/admin`,
    dest: `https://${BOUTIQUE}`,
    aud: CLE,
    sub: '42',
    exp: S + 60,
    nbf: S - 5,
    iat: S - 5,
    jti: 'abc',
    sid: 'def',
    ...extra,
  }
}

let echecs = 0
function verifier(nom: string, condition: boolean, detail = ''): void {
  if (!condition) {
    echecs++
    console.log(`ECHEC ${nom}${detail ? `\n  ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------------------ *
 * Ce qui doit passer.
 * ------------------------------------------------------------------ */

const bon = lireJetonDeSession(config, jeton(chargeNormale()), MAINTENANT)
verifier('un jeton conforme est accepté', bon !== null)
verifier('la boutique est lue dans `dest`', bon?.shop === BOUTIQUE, `lu : ${bon?.shop}`)
verifier("l'utilisateur Shopify est rendu", bon?.utilisateur === '42', `lu : ${bon?.utilisateur}`)

// Deux serveurs ne sont jamais à la seconde près : un jeton expiré depuis
// cinq secondes doit encore passer, sinon la page échoue au hasard.
verifier(
  'une dérive de 5 s est tolérée',
  lireJetonDeSession(config, jeton(chargeNormale({ exp: S - 5 })), MAINTENANT) !== null,
)

/* ------------------------------------------------------------------ *
 * Ce qui doit être refusé. Chaque ligne ferme une porte réelle.
 * ------------------------------------------------------------------ */

verifier(
  '`alg: none` est refusé, même avec une signature vide',
  lireJetonDeSession(
    config,
    jeton(chargeNormale(), { entete: { alg: 'none', typ: 'JWT' }, signature: '' }),
    MAINTENANT,
  ) === null,
  "un vérificateur qui fait confiance à l'en-tête du jeton accepte un jeton fabriqué sans secret",
)

verifier(
  "`alg: none` est refusé même quand la signature est bonne par ailleurs",
  lireJetonDeSession(
    config,
    jeton(chargeNormale(), { entete: { alg: 'none', typ: 'JWT' } }),
    MAINTENANT,
  ) === null,
)

verifier(
  'un jeton signé avec un autre secret est refusé',
  lireJetonDeSession(config, jeton(chargeNormale(), { secret: 'pas-le-bon' }), MAINTENANT) === null,
)

verifier(
  'un jeton expiré est refusé',
  lireJetonDeSession(config, jeton(chargeNormale({ exp: S - 120 })), MAINTENANT) === null,
  'un jeton rejoué une heure plus tard ouvrirait une fenêtre de vol sans fin',
)

verifier(
  "un jeton pas encore valable (`nbf` à venir) est refusé",
  lireJetonDeSession(config, jeton(chargeNormale({ nbf: S + 120 })), MAINTENANT) === null,
)

verifier(
  "un jeton délivré à une autre application (`aud`) est refusé",
  lireJetonDeSession(config, jeton(chargeNormale({ aud: 'une-autre-app' })), MAINTENANT) === null,
)

verifier(
  '`iss` et `dest` qui désignent deux boutiques différentes sont refusés',
  lireJetonDeSession(
    config,
    jeton(chargeNormale({ iss: 'https://voisin.myshopify.com/admin' })),
    MAINTENANT,
  ) === null,
  "c'est le contrôle qui empêche de lire la boutique d'un autre",
)

verifier(
  'un `dest` qui n’est pas une boutique Shopify est refusé',
  lireJetonDeSession(
    config,
    jeton(chargeNormale({ iss: 'https://pirate.test/admin', dest: 'https://pirate.test' })),
    MAINTENANT,
  ) === null,
)

for (const malforme of ['', 'abc', 'a.b', 'a.b.c.d', '..', 'a..c']) {
  verifier(
    `un jeton malformé est refusé sans lever : ${JSON.stringify(malforme)}`,
    lireJetonDeSession(config, malforme, MAINTENANT) === null,
  )
}

verifier(
  'une charge qui n’est pas du JSON est refusée sans lever',
  lireJetonDeSession(
    config,
    jeton('pas du json' as unknown as Record<string, unknown>),
    MAINTENANT,
  ) === null,
)

/* ------------------------------------------------------------------ *
 * La page elle-même.
 * ------------------------------------------------------------------ */

const page = pageIntegree({ shop: BOUTIQUE, cleApp: CLE, site: 'https://www.drop-shipper.fr/' })

verifier('App Bridge est chargé', page.includes('cdn.shopify.com/shopifycloud/app-bridge.js'))
verifier(
  'la clé de l’app est passée à App Bridge',
  page.includes(`data-api-key="${CLE}"`),
  "sans elle App Bridge ne délivre aucun jeton, et l'app n'est pas intégrée",
)
verifier('la marque est écrite en toutes lettres', page.includes('DropShipper IA'))
verifier('la boutique est affichée', page.includes(BOUTIQUE))
verifier(
  'la page demande son état au serveur au lieu de le contenir',
  page.includes('/api/shopify/embed/etat') && page.includes('Authorization'),
)
verifier(
  'aucune barre finale en double dans les liens du site',
  !page.includes('drop-shipper.fr//'),
  "`site` peut arriver avec une barre finale ; deux barres cassent les liens",
)

// Le HTML est composé par concaténation : ce qui vient de la requête doit être
// échappé. La boutique est normalisée en amont, mais la protection se vérifie
// à l'endroit où elle est écrite, pas à l'endroit où on espère qu'elle l'est.
const piegee = pageIntegree({
  shop: '"><script>alert(1)</script>',
  cleApp: '"><img src=x onerror=alert(1)>',
  site: 'https://www.drop-shipper.fr',
})
verifier(
  'une boutique piégée ne peut pas injecter de balise',
  !piegee.includes('<script>alert(1)</script>'),
)
verifier('une clé piégée ne peut pas injecter de balise', !piegee.includes('<img src=x'))

verifier(
  "l'adresse de l'app intégrée est celle déclarée au Dev Dashboard",
  urlApplicationIntegree(config) === 'https://api.exemple.test/api/shopify/app',
  `lu : ${urlApplicationIntegree(config)}`,
)

console.log(
  echecs === 0 ? 'Application Shopify intégrée : tout passe.' : `${echecs} échec(s).`,
)
process.exitCode = echecs === 0 ? 0 : 1
