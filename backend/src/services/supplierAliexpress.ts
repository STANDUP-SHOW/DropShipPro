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

/*
 * ---------------------------------------------------------------------------
 * Le PREMIER jeton : l'autorisation OAuth.
 * ---------------------------------------------------------------------------
 *
 * **Pourquoi ce n'est pas un champ à coller.** Relevé le 15/09/2026 dans la
 * console AliExpress Open Platform (app « DropShipper IA ») : le protocole est
 * OAuth 2.0 côté serveur, le **jeton d'accès vit un jour** et le jeton de
 * rafraîchissement deux. Aucun jeton n'est affiché nulle part dans la console —
 * l'App Key et l'App Secret le sont, le jeton non, par construction. Demander
 * au vendeur de le coller à la main revenait donc à lui demander de recommencer
 * tous les matins, et c'est exactement ce qui se passait : le raccordement
 * marchait le jour de la saisie et mourait pendant la nuit.
 *
 * Le renouvellement automatique existait déjà (`renouveler` ci-dessus, rejoué
 * sur un refus de jeton). Il ne servait à rien sans jeton de rafraîchissement,
 * que seul ce parcours-ci sait produire. C'est la même leçon qu'eBay, dont le
 * jeton vit deux heures : **un jeton qui expire ne se saisit pas, il
 * s'autorise.**
 *
 * L'App Key et l'App Secret restent saisis — ils appartiennent au vendeur, pas
 * à nous, et ils ne changent jamais.
 */

/** L'adresse d'autorisation d'AliExpress, où le vendeur approuve l'accès. */
const AUTORISER = () =>
  process.env.ALIEXPRESS_AUTH_URL?.trim() || 'https://api-sg.aliexpress.com/oauth/authorize'

/**
 * Le retour d'autorisation : l'adresse qu'AliExpress rappellera.
 *
 * **Elle doit être identique, au caractère près, à la « Callback URL »
 * déclarée dans la console AliExpress** — sinon l'autorisation est refusée
 * sans explication utile. D'où la variable : la changer ne demande pas de
 * redéployer le code.
 */
export function retourAliexpress(): string {
  const impose = process.env.ALIEXPRESS_REDIRECT_URI?.trim()
  if (impose) return impose

  /*
   * Sur le domaine du SITE, pas sur celui de l'API.
   *
   * Cette adresse est la seule que le vendeur voit de notre infrastructure : il
   * la recopie dans la console d'AliExpress et elle reste sous ses yeux. Y
   * mettre `dropshippro-production.up.railway.app` — un nom d'hébergeur qui
   * porte en plus l'ancien nom du produit — était le meilleur moyen d'avoir
   * l'air d'un bricolage. Vercel réécrit `/api/aliexpress/*` vers l'API, donc
   * `www.drop-shipper.fr/api/aliexpress/callback` arrive exactement au même
   * endroit, sous notre marque et sans attendre le moindre réglage DNS.
   *
   * **Seulement pour ce qui passe par le navigateur du vendeur.** Un webhook
   * signé sur ses octets bruts — Shopify — ne doit PAS traverser un proxy :
   * ce qui ressort n'est plus octet pour octet ce qui est entré, et la
   * signature tombe. Celui-là garde l'adresse de l'API.
   */
  const racine = adresseCanoniqueDuSite() || (process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '')
  return `${racine}/api/aliexpress/callback`
}

/**
 * L'adresse canonique du site, celle qui ne redirige pas.
 *
 * `FRONTEND_URL` porte une LISTE — apex, www, vercel.app — parce que le CORS
 * doit accepter les trois. Prendre la première venue a failli coûter une
 * seconde tentative ratée : l'apex y est en tête, et l'apex **redirige vers
 * www**. Or une adresse de rappel ne doit pas rediriger — le fournisseur la
 * compare au caractère près à celle déclarée dans sa console, et il n'a aucune
 * raison de suivre un détour.
 *
 * On prend donc `www` quand il est là, et la première entrée sinon.
 */
function adresseCanoniqueDuSite(): string {
  const entrees = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((v) => v.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return entrees.find((v) => /^https?:\/\/www\./i.test(v)) ?? entrees[0] ?? ''
}

/** L'adresse où envoyer le vendeur pour qu'il autorise notre application. */
export function urlAutorisationAliexpress(appKey: string, etat: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: retourAliexpress(),
    // `sp=ae` désigne la place de marché AliExpress : sans lui, l'autorisation
    // part sur une autre plateforme du groupe et le jeton obtenu ne lit rien.
    sp: 'ae',
    state: etat,
  })
  return `${AUTORISER()}?${params.toString()}`
}

/**
 * Échange le code d'autorisation contre le couple de jetons.
 *
 * Passe par `appelSigne` — le même chemin signé que tout le reste du
 * connecteur. Recopier la signature ici ferait deux versions qui
 * divergeraient, et celle du banc ne prouverait plus rien.
 */
export async function echangerCodeAliexpress(
  appKey: string,
  appSecret: string,
  code: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  /*
   * Ni `uuid`, ni `redirect_uri`.
   *
   * Le premier essai envoyait l'adresse de rappel en `uuid` — et l'échange a
   * été refusé. Elle n'a rien à faire ici : elle a servi à obtenir le code,
   * son rôle s'arrête là, et un paramètre qu'AliExpress n'attend pas entre
   * quand même dans la signature. Cet appel ne prend que la clé et le code.
   */
  const reponse = (await appelSigne(
    { app_key: appKey, code },
    appSecret,
    '/auth/token/create',
  )) as Record<string, unknown>

  const jetons = lireJetons(reponse)
  if (jetons) return jetons

  /*
   * **Dire ce qu'AliExpress a répondu, pas ce qu'il n'a pas fait.**
   *
   * « AliExpress n'a pas délivré de jeton » est vrai et parfaitement inutile :
   * ça ne dit ni pourquoi, ni quoi corriger, et ça laisse chercher la panne
   * partout ailleurs. Or un refus n'arrive pas toujours sous `error_response` —
   * il peut venir en `code` non nul au premier niveau, avec son message à côté,
   * et `appelSigne` le laisse alors passer pour une réponse valide. On le lit
   * donc ici, et à défaut on nomme les champs reçus : la prochaine tentative
   * sera diagnosticable au lieu d'être à refaire à l'aveugle.
   */
  const message = typeof reponse.message === 'string' ? reponse.message : ''
  const codeErreur = reponse.code !== undefined && String(reponse.code) !== '0' ? String(reponse.code) : ''
  if (message || codeErreur) {
    throw new SupplierError(
      `AliExpress a refusé l'échange${codeErreur ? ` (code ${codeErreur})` : ''}${message ? ` : ${message}` : ''}.`,
    )
  }
  throw new SupplierError(
    `AliExpress n'a pas délivré de jeton. Champs reçus : ${Object.keys(reponse).join(', ') || '(aucun)'}.`,
  )
}

/**
 * Les jetons, où qu'AliExpress les ait mis.
 *
 * Il les rend tantôt au premier niveau, tantôt enveloppés sous une clé en
 * `_response` — les deux formes circulent selon l'endpoint et la version. Ne
 * lire qu'une seule, c'est traiter l'autre comme une absence de jeton, donc
 * rendre le message opaque qu'on vient de recevoir alors que le jeton était là.
 */
function lireJetons(brut: Record<string, unknown>): { accessToken: string; refreshToken?: string } | null {
  const candidats: Record<string, unknown>[] = [brut]
  for (const valeur of Object.values(brut)) {
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
      candidats.push(valeur as Record<string, unknown>)
    }
  }

  for (const c of candidats) {
    const acces = c.access_token ?? c.accessToken
    if (typeof acces === 'string' && acces) {
      const refresh = c.refresh_token ?? c.refreshToken
      return { accessToken: acces, refreshToken: typeof refresh === 'string' ? refresh : undefined }
    }
  }
  return null
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

/** Les champs de la fiche complète, au-delà du prix et du stock. */
interface FicheComplete {
  aliexpress_ds_product_get_response?: {
    result?: {
      ae_item_base_info_dto?: {
        subject?: string
        detail?: string
        category_id?: number | string
        product_status_type?: string
        currency_code?: string
      }
      ae_multimedia_info_dto?: { image_urls?: string }
      ae_item_properties?: {
        ae_item_property?: Array<{ attr_name?: string; attr_value?: string }>
      }
      ae_item_sku_info_dtos?: {
        ae_item_sku_info_d_t_o?: Array<{
          offer_sale_price?: string
          sku_price?: string
          currency_code?: string
          ae_sku_property_dtos?: {
            ae_sku_property_d_t_o?: Array<{ sku_property_name?: string; sku_property_value?: string }>
          }
        }>
      }
    }
  }
}

/**
 * Retire le balisage d'une description AliExpress.
 *
 * Leur `detail` est du HTML de boutique : des tableaux, des images en dur, des
 * styles en ligne. L'IA n'en fait rien de bon et il pollue la fiche. Le texte
 * seul est gardé, les images de la description restent hors du lot — celles qui
 * comptent sont dans la galerie.
 */
function texteSeul(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export const aliexpress: SupplierConnector = {
  id: 'aliexpress',
  label: 'AliExpress',

  /**
   * Les produits mis en avant par AliExpress lui-même.
   *
   * `aliexpress.ds.recommend.feed.get` est le flux « meilleures ventes » de
   * l'API dropshipping — c'est la réponse honnête à « cinq produits phares
   * sur AliExpress » : ce que la plateforme met en avant, pas une invention.
   * Si l'application du vendeur n'a pas ce droit, AliExpress refuse dans
   * `error_response` et le refus remonte lisible, comme partout ailleurs.
   */
  async winningProducts(credentials) {
    const appKey = credentials.appKey?.trim()
    const appSecret = credentials.appSecret?.trim()
    const accessToken = credentials.accessToken?.trim()
    if (!appKey || !appSecret || !accessToken) {
      throw new SupplierError(
        "Liaison AliExpress incomplète : il faut l'App Key, l'App Secret et le jeton d'accès.",
        true,
      )
    }

    const reponse = (await appelSigne(
      {
        method: 'aliexpress.ds.recommend.feed.get',
        app_key: appKey,
        access_token: accessToken,
        feed_name: 'DS bestseller',
        target_currency: credentials.currency?.trim() || 'EUR',
        target_language: 'FR',
        country: credentials.shipTo?.trim() || 'FR',
        page_no: '1',
        page_size: '10',
      },
      appSecret,
      undefined,
    )) as {
      aliexpress_ds_recommend_feed_get_response?: {
        result?: { products?: { traffic_product_d_t_o?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> }
      }
    }

    const resultat = reponse.aliexpress_ds_recommend_feed_get_response?.result?.products
    const lignes = Array.isArray(resultat) ? resultat : resultat?.traffic_product_d_t_o ?? []
    return lignes
      .map((p) => ({
        ref: String(p.product_id ?? ''),
        titre: String(p.product_title ?? p.subject ?? ''),
        prix: Number(p.target_sale_price ?? p.sale_price ?? '') || null,
        devise: String(p.target_sale_price_currency ?? 'EUR'),
        image: typeof p.product_main_image_url === 'string' ? p.product_main_image_url : null,
        url: typeof p.product_detail_url === 'string' ? p.product_detail_url : `https://www.aliexpress.com/item/${p.product_id}.html`,
        // Le flux ne dit pas l'entrepôt : la plupart partent de Chine, mais
        // « inconnu » reste la seule réponse honnête ligne par ligne.
        entrepot: null as null,
      }))
      .filter((p) => p.ref && p.titre)
  },

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

  /**
   * Ramène la fiche complète d'un identifiant.
   *
   * C'est ce qui rend exploitable un export d'AliExpress Business : ce fichier
   * ne contient que des identifiants et des titres, aucune image, aucun prix.
   * L'API rend tout le reste — et les photos sont des adresses chez eux, que la
   * chaîne d'import télécharge et réhéberge ensuite comme celles d'un import
   * ordinaire.
   */
  async fetchProduct(ref, credentials) {
    const appKey = credentials.appKey?.trim()
    const appSecret = credentials.appSecret?.trim()
    const accessToken = credentials.accessToken?.trim()

    if (!appKey || !appSecret || !accessToken) {
      throw new SupplierError(
        "Liaison AliExpress incomplète : il faut l'App Key, l'App Secret et le jeton d'accès.",
        true,
      )
    }

    const json = (await appelSigne(
      {
        method: 'aliexpress.ds.product.get',
        app_key: appKey,
        access_token: accessToken,
        product_id: ref,
        ship_to_country: credentials.shipTo?.trim() || 'FR',
        target_currency: credentials.currency?.trim() || 'EUR',
        target_language: 'fr',
      },
      appSecret,
      undefined,
    )) as FicheComplete

    const resultat = json.aliexpress_ds_product_get_response?.result
    const base = resultat?.ae_item_base_info_dto
    if (!base?.subject) {
      throw new SupplierError(`AliExpress ne rend aucune fiche pour la référence ${ref}.`)
    }

    // Les images arrivent en une seule chaîne séparée par des points-virgules.
    const images = (resultat?.ae_multimedia_info_dto?.image_urls ?? '')
      .split(';')
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))

    const variantes = resultat?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o ?? []

    const prix = variantes
      .map((v) => Number(v.offer_sale_price ?? v.sku_price))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b)[0]

    // Les options, regroupées par nom : « Couleur » -> Noir, Argent…
    const options: Record<string, Set<string>> = {}
    for (const v of variantes) {
      for (const prop of v.ae_sku_property_dtos?.ae_sku_property_d_t_o ?? []) {
        const nom = prop.sku_property_name?.trim()
        const valeur = prop.sku_property_value?.trim()
        if (!nom || !valeur) continue
        ;(options[nom] ??= new Set()).add(valeur)
      }
    }

    // Les caractéristiques déclarées : c'est de là que viennent « bracelet acier
    // inoxydable » et « 22 rubis », que la lecture d'une page perd si souvent.
    const proprietes = (resultat?.ae_item_properties?.ae_item_property ?? [])
      .map((p) => (p.attr_name && p.attr_value ? `${p.attr_name} : ${p.attr_value}` : ''))
      .filter(Boolean)

    const description = texteSeul(base.detail ?? '')

    return {
      ref,
      title: base.subject.trim(),
      description: description.slice(0, 4000),
      price: prix ?? 0,
      currency: variantes[0]?.currency_code ?? base.currency_code ?? 'EUR',
      images,
      variants: Object.keys(options).length
        ? Object.fromEntries(Object.entries(options).map(([k, v]) => [k, [...v]]))
        : null,
      pageText: [base.subject, ...proprietes, description].join('\n').slice(0, 15000),
      category: base.category_id ? String(base.category_id) : null,
      available: base.product_status_type === undefined || base.product_status_type === 'onSelling',
    }
  },
}
