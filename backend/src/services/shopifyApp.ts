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

export function signerEtat(config: ConfigApp, userId: string, shop: string, expireA: number): string {
  const charge = Buffer.from(JSON.stringify({ u: userId, s: shop, e: expireA })).toString('base64url')
  const signature = crypto.createHmac('sha256', config.secret).update(charge).digest('base64url')
  return `${charge}.${signature}`
}

export function lireEtat(
  config: ConfigApp,
  etat: string,
  maintenant = Date.now(),
): { userId: string; shop: string } | null {
  const [charge, signature] = etat.split('.')
  if (!charge || !signature) return null

  const attendue = crypto.createHmac('sha256', config.secret).update(charge).digest('base64url')
  if (!memeSignature(attendue, signature)) return null

  try {
    const { u, s, e } = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'))
    if (typeof u !== 'string' || typeof s !== 'string' || typeof e !== 'number') return null
    if (maintenant > e) return null
    return { userId: u, shop: s }
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
  maintenant = Date.now(),
): string | null {
  const shop = normalizeShopDomain(boutique)
  if (!shop) return null

  const params = new URLSearchParams({
    client_id: config.cle,
    scope: config.portee,
    redirect_uri: `${config.racine}/api/shopify/callback`,
    state: signerEtat(config, userId, shop, maintenant + VIE_ETAT_MS),
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
