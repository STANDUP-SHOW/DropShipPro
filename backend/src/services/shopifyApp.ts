import crypto from 'node:crypto'
import { normalizeShopDomain } from './shopify.js'

/**
 * L'application Shopify publique : installation OAuth et webhooks signés.
 *
 * **Ce que ça remplace.** Jusqu'ici, relier une boutique demandait au marchand
 * d'aller dans son administration, d'activer « Autoriser le développement
 * d'applications personnalisées » (réservé au propriétaire de la boutique),
 * de créer une app, de cocher les autorisations, puis de recopier un jeton
 * `shpat_` affiché une seule fois. Beaucoup abandonnent avant la fin, et rien
 * dans ce parcours ne nous appartient : quand il échoue, nous ne savons même
 * pas où.
 *
 * Avec OAuth, le marchand saisit l'adresse de sa boutique et approuve un écran
 * — celui de Shopify, pas le nôtre. Le jeton arrive chez nous sans jamais
 * passer par son presse-papiers.
 *
 * **Et c'est la première pierre de la publication sur l'App Store.** Une app
 * publique DOIT s'installer par OAuth et DOIT répondre aux trois webhooks
 * RGPD ; ce fichier fait les deux. Ce qui reste pour la fiche officielle est
 * écrit dans `docs/shopify-app.md`, avec la question de la facturation, qui
 * n'est pas une question technique.
 *
 * **Rien ici ne casse l'existant.** L'échange rend exactement la forme que
 * `readShopifyCredentials` attend déjà — `{ shopDomain, accessToken }` — donc
 * la publication, le catalogue et les bancs ne changent pas d'une ligne.
 */

/** Les autorisations demandées. Le strict nécessaire : Shopify examine la liste. */
const PORTEE_PAR_DEFAUT = 'write_products,read_products,write_publications,read_publications'

export interface ConfigApp {
  cle: string
  secret: string
  portee: string
  /** L'adresse publique de l'API, celle que Shopify rappellera. */
  racine: string
}

/**
 * La configuration, ou `null` quand l'app n'est pas déclarée.
 *
 * Dégradation propre, comme pour la connexion Google : sans ces variables, le
 * bouton « Relier ma boutique » ne s'affiche pas et les routes répondent 503.
 * Une variable oubliée sur l'hébergeur ne doit jamais rendre une route à moitié
 * fonctionnelle — c'est ce qui produit les pannes qu'on ne voit pas.
 */
export function configApp(): ConfigApp | null {
  const cle = process.env.SHOPIFY_APP_KEY?.trim()
  const secret = process.env.SHOPIFY_APP_SECRET?.trim()
  const racine = (process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '')
  if (!cle || !secret || !racine) return null
  return { cle, secret, portee: process.env.SHOPIFY_APP_SCOPES?.trim() || PORTEE_PAR_DEFAUT, racine }
}

/** Comparaison à temps constant : deux signatures se comparent octet à octet. */
function memeSignature(attendue: string, recue: string): boolean {
  const a = Buffer.from(attendue, 'utf8')
  const b = Buffer.from(recue, 'utf8')
  // timingSafeEqual lève si les longueurs diffèrent : on le vérifie d'abord,
  // et cette fuite-là ne dit rien qu'un attaquant ne sache déjà.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/*
 * ---------------------------------------------------------------------------
 * L'état : qui installe, pour quelle boutique, et jusqu'à quand.
 * ---------------------------------------------------------------------------
 *
 * Shopify renvoie le marchand sur une adresse publique. Cette adresse doit
 * savoir À QUEL COMPTE rattacher le jeton — sans quoi n'importe qui pourrait
 * terminer l'installation et brancher une boutique sur le compte d'un autre.
 *
 * L'état porte donc le compte, la boutique et une date limite, **signés**. Pas
 * de table, pas de session : une signature suffit, et elle ne peut pas être
 * fabriquée sans le secret de l'app. C'est aussi ce qui protège du CSRF, rôle
 * que Shopify assigne précisément à ce paramètre.
 */
const VIE_ETAT_MS = 15 * 60 * 1000

/**
 * Où renvoyer le marchand une fois l'installation faite.
 *
 * **Un chemin interne, jamais une adresse.** Cette valeur vient du navigateur
 * et finit dans un `Location:` : accepter `https://…` ou `//evil.test` en
 * ferait une redirection ouverte signée de notre nom. On n'accepte donc qu'un
 * chemin absolu d'une seule barre, et on retombe sur l'écran des plateformes
 * quand il ne l'est pas.
 */
const RETOUR_PAR_DEFAUT = '/plateformes-vente'

export function cheminDeRetour(brut: unknown): string {
  const v = typeof brut === 'string' ? brut.trim() : ''
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return RETOUR_PAR_DEFAUT
  return v
}

export function signerEtat(
  config: ConfigApp,
  userId: string,
  shop: string,
  expireA: number,
  retour = RETOUR_PAR_DEFAUT,
): string {
  const charge = Buffer.from(
    JSON.stringify({ u: userId, s: shop, e: expireA, r: cheminDeRetour(retour) }),
  ).toString('base64url')
  const signature = crypto.createHmac('sha256', config.secret).update(charge).digest('base64url')
  return `${charge}.${signature}`
}

export function lireEtat(
  config: ConfigApp,
  etat: string,
  maintenant = Date.now(),
): { userId: string; shop: string; retour: string } | null {
  const [charge, signature] = etat.split('.')
  if (!charge || !signature) return null

  const attendue = crypto.createHmac('sha256', config.secret).update(charge).digest('base64url')
  if (!memeSignature(attendue, signature)) return null

  try {
    const { u, s, e, r } = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'))
    if (typeof u !== 'string' || typeof s !== 'string' || typeof e !== 'number') return null
    if (maintenant > e) return null
    // Re-contrôlé à la lecture : une signature valide ne rend pas un chemin sûr
    // si la règle a changé depuis qu'il a été signé.
    return { userId: u, shop: s, retour: cheminDeRetour(r) }
  } catch {
    return null
  }
}

/**
 * L'adresse où envoyer le marchand pour qu'il approuve l'installation.
 *
 * **Le domaine est normalisé puis vérifié**, et ce n'est pas une politesse :
 * cette valeur vient du marchand et finit dans une redirection. Sans le
 * contrôle `*.myshopify.com`, elle ouvrirait une redirection vers n'importe
 * quel site, signée de notre nom.
 */
export function urlInstallation(
  config: ConfigApp,
  userId: string,
  boutique: string,
  retour?: string,
  maintenant = Date.now(),
): string | null {
  const shop = normalizeShopDomain(boutique)
  if (!shop) return null

  const params = new URLSearchParams({
    client_id: config.cle,
    scope: config.portee,
    redirect_uri: `${config.racine}/api/shopify/callback`,
    state: signerEtat(config, userId, shop, maintenant + VIE_ETAT_MS, retour),
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

/**
 * La signature que Shopify pose sur les paramètres de son retour.
 *
 * Recette imposée : on retire `hmac` et `signature`, on trie les clés restantes,
 * on assemble `clé=valeur` séparés par `&`, et on compare en hexadécimal. Sans
 * cette vérification, n'importe qui pourrait appeler notre callback avec un
 * `code` de son choix.
 */
export function hmacRequeteValide(config: ConfigApp, params: Record<string, unknown>): boolean {
  const recu = typeof params.hmac === 'string' ? params.hmac : ''
  if (!recu) return false

  const message = Object.keys(params)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? (params[k] as string[]).join(',') : String(params[k])}`)
    .join('&')

  const attendu = crypto.createHmac('sha256', config.secret).update(message).digest('hex')
  return memeSignature(attendu, recu)
}

/** La signature d'un webhook : HMAC-SHA256 en base64 sur les octets BRUTS. */
export function hmacWebhookValide(config: ConfigApp, corpsBrut: Buffer | string, signature: string): boolean {
  if (!signature) return false
  const attendu = crypto.createHmac('sha256', config.secret).update(corpsBrut).digest('base64')
  return memeSignature(attendu, signature)
}

/*
 * ---------------------------------------------------------------------------
 * Le jeton de session : le portique de l'application INTÉGRÉE.
 * ---------------------------------------------------------------------------
 *
 * L'administration Shopify affiche l'app dans une iframe. **Nos cookies n'y
 * arrivent pas** — troisième partie, bloqués par tous les navigateurs modernes
 * — donc `requireAuth` ne peut rien y faire : il n'y a pas de session à lire.
 *
 * Shopify résout ça autrement : App Bridge délivre au front un **jeton de
 * session**, un JWT court signé du secret de l'app, que le front met en
 * `Authorization: Bearer`. C'est un SECOND portique à côté de `requireAuth`,
 * pas un remplacement : il n'authentifie pas un compte DropShipper, il prouve
 * « cette page est bien servie dans l'admin de cette boutique-là ».
 *
 * Les contrôles ne sont pas décoratifs, chacun ferme une porte réelle :
 *
 * - **`alg` imposé à HS256.** Un JWT dont on lit l'algorithme dans son propre
 *   en-tête accepte `alg: none` — le jeton se fabrique alors sans secret. La
 *   faille est vieille et elle se reproduit à chaque implémentation naïve.
 * - **`aud` égal à notre clé d'app.** Sans ça, un jeton délivré à une AUTRE
 *   application Shopify, parfaitement signé de son propre secret, serait
 *   rejeté de toute façon par la signature — mais l'inverse compte : notre
 *   secret ne doit servir qu'à nous.
 * - **`exp` et `nbf`.** Ces jetons vivent une minute. Un jeton rejoué une heure
 *   plus tard doit être refusé, sinon la fenêtre d'un vol dure indéfiniment.
 * - **`iss` et `dest` sur la même boutique.** C'est le contrôle qui compte :
 *   `dest` désigne la boutique, et c'est sur lui qu'on ira chercher la liaison.
 *   Les laisser diverger permettrait de lire la boutique d'un autre.
 */
export interface SessionIntegree {
  /** La boutique, normalisée : `exemple.myshopify.com`. */
  shop: string
  /** L'utilisateur Shopify qui regarde la page, quand il est communiqué. */
  utilisateur: string | null
}

/** La tolérance d'horloge. Deux serveurs ne sont jamais à la seconde près. */
const DERIVE_HORLOGE_S = 10

function hoteDe(valeur: unknown): string | null {
  if (typeof valeur !== 'string' || !valeur) return null
  try {
    return normalizeShopDomain(new URL(valeur).host)
  } catch {
    return null
  }
}

export function lireJetonDeSession(
  config: ConfigApp,
  jeton: string,
  maintenant = Date.now(),
): SessionIntegree | null {
  const morceaux = (jeton ?? '').trim().split('.')
  if (morceaux.length !== 3) return null
  const [enTete, charge, signature] = morceaux

  const attendue = crypto
    .createHmac('sha256', config.secret)
    .update(`${enTete}.${charge}`)
    .digest('base64url')
  if (!memeSignature(attendue, signature)) return null

  try {
    const tete = JSON.parse(Buffer.from(enTete, 'base64url').toString('utf8'))
    // Lu APRÈS la signature, et imposé : jamais « ce que le jeton déclare ».
    if (tete?.alg !== 'HS256') return null

    const corps = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'))
    if (corps?.aud !== config.cle) return null

    const secondes = Math.floor(maintenant / 1000)
    if (typeof corps.exp !== 'number' || secondes > corps.exp + DERIVE_HORLOGE_S) return null
    if (typeof corps.nbf === 'number' && secondes + DERIVE_HORLOGE_S < corps.nbf) return null

    const destination = hoteDe(corps.dest)
    const emetteur = hoteDe(corps.iss)
    if (!destination || !emetteur || destination !== emetteur) return null

    return { shop: destination, utilisateur: typeof corps.sub === 'string' ? corps.sub : null }
  } catch {
    return null
  }
}

/**
 * L'adresse où l'admin Shopify doit ouvrir l'application.
 *
 * Shopify l'appelle « App URL ». Elle est déclarée dans le Dev Dashboard et
 * rappelée ici pour qu'un seul endroit du code en fasse foi.
 */
export function urlApplicationIntegree(config: ConfigApp): string {
  return `${config.racine}/api/shopify/app`
}

/*
 * ---------------------------------------------------------------------------
 * L'abonnement à `app/uninstalled`, posé juste après l'installation.
 * ---------------------------------------------------------------------------
 *
 * **Shopify ne prévient personne tout seul.** Un marchand qui désinstalle
 * l'application garde une liaison marquée « reliée » chez nous, avec un jeton
 * qui ne vaut plus rien : chaque publication échoue ensuite sans que le vendeur
 * comprenne pourquoi — exactement le défaut qu'on a corrigé côté fournisseurs
 * en vérifiant les clés à l'enregistrement plutôt qu'au premier import.
 *
 * **Ce sujet-là s'abonne par l'API ; les trois sujets RGPD, non.** Ces
 * derniers sont des *compliance webhooks* : leur adresse se déclare dans la
 * configuration de l'application, pas boutique par boutique, et le Dev
 * Dashboard n'expose pas ce champ (constaté le 16/09/2026). Notre endpoint les
 * traite déjà et son banc passe ; il leur manque seulement d'être déclarés.
 * Rien dans ce fichier ne peut y suppléer, et prétendre le contraire serait
 * pire que l'absence.
 */
export type AppelGraphQL = (
  creds: { shopDomain: string; accessToken: string },
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>

const ABONNER = /* GraphQL */ `
  mutation dropshipperAbonnerDesinstallation($url: URL!) {
    webhookSubscriptionCreate(
      topic: APP_UNINSTALLED
      webhookSubscription: { callbackUrl: $url, format: JSON }
    ) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`

export async function souscrireDesinstallation(
  config: ConfigApp,
  shop: string,
  accessToken: string,
  appeler: AppelGraphQL,
): Promise<{ pose: boolean; raison?: string }> {
  const reponse = (await appeler({ shopDomain: shop, accessToken }, ABONNER, {
    url: `${config.racine}/api/shopify/webhooks`,
  })) as {
    webhookSubscriptionCreate?: {
      webhookSubscription?: { id?: string } | null
      userErrors?: Array<{ message?: string }>
    }
  }

  const bloc = reponse?.webhookSubscriptionCreate
  if (bloc?.webhookSubscription?.id) return { pose: true }

  const raison = bloc?.userErrors?.map((e) => e.message).filter(Boolean).join(' ; ') || 'refus sans motif'

  /*
   * **Un abonnement déjà présent n'est pas un échec.** Un marchand qui
   * réinstalle repasse ici, et Shopify refuse alors le doublon — « address for
   * this topic has already been taken ». Traiter ce refus comme une erreur
   * ferait échouer une installation parfaitement valide, et c'est le genre de
   * faute qui ne se voit qu'en production, à la deuxième installation.
   */
  if (/already been taken|already exists/i.test(raison)) return { pose: true }
  return { pose: false, raison }
}

/** Échange le code d'autorisation contre un jeton d'accès permanent. */
export async function echangerCode(
  config: ConfigApp,
  shop: string,
  code: string,
): Promise<{ shopDomain: string; accessToken: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: config.cle, client_secret: config.secret, code }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Shopify a refusé l'installation (${res.status}). ${detail.slice(0, 200)}`.trim(),
    )
  }

  const corps = (await res.json()) as { access_token?: string; scope?: string }
  if (!corps.access_token) throw new Error("Shopify n'a pas délivré de jeton d'accès.")
  return { shopDomain: shop, accessToken: corps.access_token, scope: corps.scope ?? '' }
}
