import http from 'http'

/**
 * Éprouve l'échange Client ID / Client Secret contre un jeton d'accès.
 *
 * Ce que ce banc prouve : la requête a la forme que Shopify décrit
 * (`POST /admin/oauth/access_token`, corps urlencodé, `grant_type`,
 * `client_id`, `client_secret`), le jeton est réutilisé pendant sa durée de vie
 * plutôt que redemandé à chaque appel, et un secret refusé produit un message
 * qui dit quoi vérifier — y compris la contrainte d'organisation, que le refus
 * de Shopify, lui, ne mentionne pas.
 *
 * Ce qu'il ne prouve pas : que Shopify accepte. Il faudrait une vraie app dans
 * une vraie organisation. Le premier marchand qui relie la sienne sera le
 * premier vrai essai.
 */

const PORT = 8796

let appels = 0
let dernier: Record<string, string> = {}

const serveur = http.createServer((req, res) => {
  let brut = ''
  req.on('data', (c) => (brut += c))
  req.on('end', () => {
    appels++
    dernier = Object.fromEntries(new URLSearchParams(brut)) as Record<string, string>

    const repondre = (code: number, corps: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(corps))
    }

    if (!(req.url ?? '').includes('/admin/oauth/access_token')) return repondre(404, {})
    if (dernier.client_secret !== 'bon-secret') return repondre(401, { error: 'invalid_client' })

    repondre(200, {
      access_token: 'shpat_echange',
      scope: dernier.client_id === 'sans-droits' ? 'read_products' : 'write_products',
      expires_in: 86399,
    })
  })
})

await new Promise<void>((r) => serveur.listen(PORT, '127.0.0.1', r))

/*
 * Le connecteur construit son adresse à partir du domaine de la boutique. Pour
 * l'essai, on détourne `fetch` vers le faux serveur : c'est le seul moyen de
 * vérifier l'adresse réellement appelée, au lieu de la supposer.
 */
const vraiFetch = globalThis.fetch
const adressesAppelees: string[] = []
globalThis.fetch = ((entree: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entree)
  adressesAppelees.push(url)
  return vraiFetch(url.replace(/^https:\/\/[^/]+/, `http://127.0.0.1:${PORT}`), init)
}) as typeof fetch

const { jetonParClientCredentials } = await import('./src/services/shopify.js')

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

try {
  const creds = {
    shopDomain: 'ma-boutique.myshopify.com',
    clientId: 'client-123',
    clientSecret: 'bon-secret',
  }

  const premier = await jetonParClientCredentials(creds)
  exige(premier.accessToken === 'shpat_echange', `jeton lu : ${premier.accessToken}`)
  exige(premier.shopDomain === 'ma-boutique.myshopify.com', 'le domaine doit être conservé tel quel')

  exige(
    adressesAppelees[0] === 'https://ma-boutique.myshopify.com/admin/oauth/access_token',
    `adresse appelée : ${adressesAppelees[0]}`,
  )
  exige(dernier.grant_type === 'client_credentials', `grant_type : ${dernier.grant_type}`)
  exige(dernier.client_id === 'client-123', 'le client_id doit être envoyé')

  // Le jeton vit 24 h : le redemander à chaque publication ferait trente
  // échanges pour trente annonces, et chacun compte dans les limites de débit.
  const avant = appels
  await jetonParClientCredentials(creds)
  await jetonParClientCredentials(creds)
  exige(appels === avant, `le jeton doit être réutilisé, ${appels - avant} échange(s) en trop`)

  // Un secret refusé : message actionnable, et qui parle de l'organisation.
  let refus: unknown = null
  try {
    await jetonParClientCredentials({ ...creds, clientId: 'autre', clientSecret: 'mauvais' })
  } catch (e) {
    refus = e
  }
  exige(refus !== null, 'un secret refusé doit lever')
  exige(
    /organisation/i.test((refus as Error)?.message ?? ''),
    `le message ne parle pas de l'organisation : « ${(refus as Error)?.message} »`,
  )

  // L'autorisation manquante doit se voir a la liaison, pas a la premiere
  // publication : un jeton valide sans write_products publie zero annonce.
  const { autorisationManquante } = await import('./src/services/shopify.js')
  exige(autorisationManquante('write_products,read_orders') === null, 'write_products accorde doit passer')
  const plainte = autorisationManquante('read_products')
  exige(plainte !== null, 'une app sans write_products doit etre refusee a la liaison')
  exige(/read_products/.test(plainte ?? ''), "le message doit dire ce que l app a reellement")
  exige(/write_products/.test(autorisationManquante('') ?? ''), 'une app sans aucun droit doit nommer write_products')

  console.log(echecs === 0 ? 'Échange Shopify : tout passe.' : `${echecs} échec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  globalThis.fetch = vraiFetch
  serveur.close()
}
