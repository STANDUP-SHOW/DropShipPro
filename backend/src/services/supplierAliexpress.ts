import { createHmac } from 'crypto'
import { SupplierError, type SupplierConnector, type SupplierPrice } from './supplierTypes.js'

/**
 * AliExpress — le plus gros fournisseur du catalogue, et le plus exigeant.
 *
 * Les deux autres connecteurs se contentent d'une clé dans un en-tête. Celui-ci
 * signe chaque appel : tous les paramètres triés, collés bout à bout, et un HMAC
 * SHA-256 avec le secret de l'application. Une signature fausse ne dit pas
 * qu'elle est fausse — elle rend « Invalid signature » sur tous les appels, y
 * compris ceux dont les paramètres sont parfaits. D'où le banc d'essai, qui
 * recalcule la signature à la main sur un exemple connu.
 *
 * L'autre différence tient au jeton : il expire. Un vendeur relié en janvier
 * verrait sa veille tomber en panne en mars sans un mot d'explication. Le jeton
 * est donc renouvelé tout seul quand AliExpress le refuse, et le nouveau est
 * réenregistré — sinon on le redemanderait à chaque relevé jusqu'à épuiser le
 * quota.
 */

/** La passerelle historique, celle des méthodes `aliexpress.xxx`. */
const TOP = () => process.env.ALIEXPRESS_TOP_URL?.trim() || 'https://api-sg.aliexpress.com/sync'
/** La passerelle REST, celle des chemins `/auth/token/...`. */
const REST = () => process.env.ALIEXPRESS_REST_URL?.trim() || 'https://api-sg.aliexpress.com/rest'

/**
 * La signature attendue par AliExpress.
 *
 * Paramètres triés par nom, collés en `clé+valeur` sans séparateur, HMAC-SHA256
 * avec le secret de l'application, en hexadécimal majuscule. Les appels REST
 * font précéder le tout du chemin, et n'incluent pas `method` dans les
 * paramètres — c'est la seule différence entre les deux passerelles.
 */
export function signer(
  params: Record<string, string>,
  appSecret: string,
  chemin?: string,
): string {
  const base = Object.keys(params)
    .sort()
    .reduce((acc, cle) => acc + cle + params[cle], chemin ?? '')

  return createHmac('sha256', appSecret).update(base, 'utf8').digest('hex').toUpperCase()
}

/** Le corps d'erreur qu'AliExpress renvoie, avec un code HTTP 200. */
interface ErreurAli {
  error_response?: { code?: number | string; msg?: string; sub_code?: string; sub_msg?: string }
}

/**
 * Un appel signé, sur l'une ou l'autre passerelle.
 *
 * AliExpress répond 200 même quand il refuse : l'échec est dans le corps, sous
 * `error_response`. Ne regarder que le code HTTP ferait passer « jeton expiré »
 * pour une réponse valide et vide — donc pour un produit sans prix, donc pour
 * une rupture. C'est exactement le genre de silence qui coûte une vente.
 */
async function appelSigne(
  params: Record<string, string>,
  appSecret: string,
  chemin?: string,
): Promise<unknown> {
  const complets = { ...params, timestamp: String(Date.now()), sign_method: 'sha256' }
  const signature = signer(complets, appSecret, chemin)
  const corps = new URLSearchParams({ ...complets, sign: signature })

  let res: Response
  try {
    res = await fetch(chemin ? `${REST()}${chemin}` : TOP(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps,
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new SupplierError('AliExpress est injoignable. Réessayez dans quelques minutes.')
  }

  if (!res.ok) throw new SupplierError(`AliExpress a répondu ${res.status}.`)

  const json = (await res.json()) as ErreurAli & Record<string, unknown>
  const erreur = json.error_response
  if (erreur) {
    const message = erreur.sub_msg || erreur.msg || 'refus sans explication'
    const code = String(erreur.sub_code ?? erreur.code ?? '')

    // Le jeton expiré est le seul refus qu'on sait réparer tout seul : il est
    // signalé à part pour que l'appelant tente le renouvellement.
    if (/token|session/i.test(code) || /token|session/i.test(message)) {
      throw new JetonExpire(message)
    }
    throw new SupplierError(`AliExpress : ${message}`, estCorrigeable(`${code} ${message}`))
  }

  return json
}

/**
 * Ce refus vient-il de la liaison, ou du produit ?
 *
 * La distinction décide de tout : un refus de liaison doit arrêter le relevé —
 * continuer ferait cent appels voués au même échec — tandis qu'un refus portant
 * sur un produit doit être noté et dépassé, sinon une seule fiche supprimée
 * masquerait le prix de tous les autres produits du vendeur.
 *
 * Le tri se fait sur le texte plutôt que sur le code numérique : AliExpress
 * réutilise les mêmes codes pour des causes différentes, et son message, lui,
 * dit toujours de quoi il parle.
 */
function estCorrigeable(texte: string): boolean {
  return /signature|app.?key|permission|authoriz|autoris|licence|license|quota|rate.?limit|forbidden/i.test(
    texte,
  )
}

/** Le refus qu'un renouvellement de jeton peut corriger. */
class JetonExpire extends SupplierError {
  constructor(message: string) {
    super(`AliExpress : ${message}`, true)
    this.name = 'JetonExpire'
  }
}

/**
 * Renouvelle le jeton d'accès à partir du jeton de rafraîchissement.
 *
 * Rend `null` plutôt que de lever quand il n'y a pas de jeton de
 * rafraîchissement : l'absence de renouvellement possible n'est pas une panne,
 * c'est un vendeur à qui il faut redemander l'autorisation.
 */
async function renouveler(
  appKey: string,
  appSecret: string,
  refreshToken: string | undefined,
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  if (!refreshToken) return null

  const reponse = (await appelSigne(
    { app_key: appKey, refresh_token: refreshToken },
    appSecret,
    '/auth/token/refresh',
  )) as { access_token?: string; refresh_token?: string }

  if (!reponse.access_token) return null
  return { accessToken: reponse.access_token, refreshToken: reponse.refresh_token }
}

/** Ce qu'AliExpress renvoie pour une fiche produit, réduit à ce qu'on en lit. */
interface FicheAli {
  aliexpress_ds_product_get_response?: {
    result?: {
      ae_item_base_info_dto?: { product_status_type?: string; currency_code?: string }
      ae_item_sku_info_dtos?: {
        ae_item_sku_info_d_t_o?: Array<{
          offer_sale_price?: string
          sku_price?: string
          currency_code?: string
          sku_available_stock?: number
          s_k_u_available_stock?: number
        }>
      }
    }
  }
}

/**
 * Lit prix et stock d'une fiche.
 *
 * Le prix retenu est le plus bas des variantes, comme chez CJ : c'est lui qui
 * décide de la marge minimale, et c'est celui qu'on veut voir monter. Le stock
 * est la somme des variantes — une taille épuisée ne veut pas dire que le
 * produit l'est.
 */
function lireFiche(json: unknown, ref: string): SupplierPrice {
  const resultat = (json as FicheAli).aliexpress_ds_product_get_response?.result
  const variantes = resultat?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o ?? []

  const prix = variantes
    .map((v) => Number(v.offer_sale_price ?? v.sku_price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b)[0]

  const quantites = variantes
    .map((v) => v.sku_available_stock ?? v.s_k_u_available_stock)
    .filter((q): q is number => typeof q === 'number')

  const stock = quantites.length ? quantites.reduce((s, q) => s + q, 0) : null

  /*
   * Le statut du produit prime sur le stock : AliExpress laisse des variantes
   * avec du stock sur des fiches retirées de la vente. Publier là-dessus, c'est
   * encaisser une commande qu'on ne pourra pas passer.
   */
  const statut = resultat?.ae_item_base_info_dto?.product_status_type
  const enVente = statut === undefined || statut === 'onSelling'

  return {
    ref,
    price: prix ?? null,
    currency: variantes[0]?.currency_code ?? resultat?.ae_item_base_info_dto?.currency_code ?? 'USD',
    stock,
    available: enVente && variantes.length > 0 && (stock === null || stock > 0),
  }
}

export const aliexpress: SupplierConnector = {
  id: 'aliexpress',
  label: 'AliExpress',

  async fetchPrices(refs, credentials, ctx) {
    const appKey = credentials.appKey?.trim()
    const appSecret = credentials.appSecret?.trim()
    let accessToken = credentials.accessToken?.trim()

    if (!appKey || !appSecret || !accessToken) {
      throw new SupplierError(
        "Liaison AliExpress incomplète : il faut l'App Key, l'App Secret et le jeton d'accès.",
        true,
      )
    }

    /*
     * Le renouvellement est tenté une seule fois, au premier refus, puis le
     * nouveau jeton sert pour tout le reste du lot. Renouveler à chaque produit
     * épuiserait le quota d'appels ; ne jamais renouveler ferait tomber la
     * veille en panne le jour de l'expiration.
     */
    let renouvele = false

    const interroger = async (ref: string): Promise<unknown> => {
      const params = {
        method: 'aliexpress.ds.product.get',
        app_key: appKey,
        access_token: accessToken!,
        product_id: ref,
        ship_to_country: credentials.shipTo?.trim() || 'FR',
        target_currency: credentials.currency?.trim() || 'EUR',
        target_language: 'fr',
      }

      try {
        return await appelSigne(params, appSecret, undefined)
      } catch (err) {
        if (!(err instanceof JetonExpire) || renouvele) throw err

        renouvele = true
        const frais = await renouveler(appKey, appSecret, credentials.refreshToken?.trim())
        if (!frais) {
          throw new SupplierError(
            "Le jeton d'accès AliExpress a expiré et n'a pas pu être renouvelé. Réautorisez l'application dans API Sourcing Connect.",
            true,
          )
        }

        accessToken = frais.accessToken
        // Réenregistré tout de suite : sans ça, le prochain relevé repartirait
        // du jeton périmé et refarait le tour pour rien.
        await ctx?.saveCredentials({
          accessToken: frais.accessToken,
          ...(frais.refreshToken ? { refreshToken: frais.refreshToken } : {}),
        })

        return appelSigne({ ...params, access_token: accessToken }, appSecret, undefined)
      }
    }

    const sortie: SupplierPrice[] = []
    for (const ref of refs) {
      try {
        sortie.push(lireFiche(await interroger(ref), ref))
      } catch (err) {
        // Une fiche supprimée du catalogue ne doit pas arrêter le relevé des
        // autres : c'est une rupture définitive, pas une panne. Un refus que le
        // vendeur doit corriger, lui, arrête tout — continuer ferait cent
        // appels voués au même échec.
        if (err instanceof SupplierError && err.actionnable) throw err
        sortie.push({ ref, price: null, currency: 'EUR', stock: 0, available: false })
      }
    }

    return sortie
  },
}
