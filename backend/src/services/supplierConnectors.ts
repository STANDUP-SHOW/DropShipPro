/**
 * Les connecteurs fournisseurs : lire le prix et le stock à la source.
 *
 * C'est le manque numéro un du comparatif, cité comme *la* fonction sans
 * laquelle une application de dropshipping n'est pas complète. Sans elle, le
 * vendeur découvre une rupture quand un acheteur réclame son colis, et il paie
 * de la publicité sur un produit que personne ne peut plus livrer.
 *
 * Un connecteur par fournisseur, derrière une seule interface : ajouter une
 * source revient à écrire un adaptateur, pas à toucher au reste. C'est la leçon
 * du rapport Shoppingfeed appliquée au sourcing — la valeur vient de la qualité
 * du mapping, pas du nombre de connecteurs.
 *
 * Commander est possible depuis, mais **jamais payer** : la commande est déposée
 * chez le fournisseur et attend le règlement du vendeur. C'est la même règle que
 * pour la publication — l'application remplit, l'humain valide — appliquée là où
 * elle compte le plus, puisqu'ici c'est de l'argent.
 */

export * from './supplierTypes.js'

import { traduireEnAnglais, gardeLesPertinents } from './traduction.js'
import {
  SupplierError,
  type SupplierConnector,
  type SupplierListing,
  type SupplierPrice,
  type SupplierTracking,
} from './supplierTypes.js'

/** Base d'appel, surchargeable pour les essais. */
const BASES: Record<string, string> = {
  bigbuy: process.env.BIGBUY_API_BASE?.trim() || 'https://api.bigbuy.eu',
  cjdropshipping: process.env.CJ_API_BASE?.trim() || 'https://developers.cjdropshipping.com/api2.0/v1',
}

/** Un appel réseau borné : un fournisseur muet ne doit pas bloquer la veille. */
async function appel(url: string, options: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 20000, ...rest } = options
  const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) })

  if (res.status === 401 || res.status === 403) {
    throw new SupplierError("Le fournisseur refuse votre clé d'API. Vérifiez-la dans API Sourcing Connect.", true)
  }
  if (res.status === 429) {
    throw new SupplierError('Le fournisseur limite le nombre de requêtes. Réessayez dans quelques minutes.')
  }
  if (!res.ok) {
    throw new SupplierError(`Le fournisseur a répondu ${res.status}.`)
  }

  return res.json()
}

/**
 * BigBuy — grossiste européen, clé d'API simple.
 *
 * Son API expose le stock et le prix séparément ; on demande les deux et on les
 * réunit par référence. Choisi comme premier connecteur parce que la clé
 * s'obtient sans validation préalable : un vendeur abonné peut l'essayer le
 * jour même.
 */
/** Les en-têtes de tout appel BigBuy : un jeton Bearer, rien d'autre. */
const enTetesBigbuy = (cle: string) => ({ Authorization: `Bearer ${cle}`, Accept: 'application/json' })

const bigbuy: SupplierConnector = {
  id: 'bigbuy',
  label: 'BigBuy',

  /**
   * BigBuy publie un point d'entrée fait exactement pour ça.
   *
   * `/rest/user/auth/status` ne lit aucun catalogue, ne coûte aucun quota, et
   * répond « je sais qui vous êtes » ou « Invalid Token ». Trouvé dans leur
   * spec OpenAPI le 16/09/2026 — le porte-monnaie faisait le même travail, mais
   * en prétendant demander autre chose.
   */
  async verifier(credentials) {
    const key = credentials.apiKey?.trim()
    if (!key) throw new SupplierError("Aucune clé d'API BigBuy saisie.", true)
    await appel(`${BASES.bigbuy}/rest/user/auth/status.json`, { headers: enTetesBigbuy(key) })
  },

  /**
   * Les rayons de BigBuy : son arbre de taxonomie.
   *
   * **BigBuy ne sait pas chercher, et ce n'est pas un manque de notre côté.**
   * Sa spec OpenAPI compte 61 points d'entrée, lus un par un : pas UN ne prend
   * de mots-clés. Son catalogue se parcourt, il ne s'interroge pas. Lui envoyer
   * « écouteurs sans fil » ne pouvait rien donner — la question n'existe pas
   * chez lui.
   */
  async listerRayons(credentials) {
    const key = credentials.apiKey?.trim()
    if (!key) throw new SupplierError("Aucune clé d'API BigBuy saisie.", true)

    const rayons = (await appel(`${BASES.bigbuy}/rest/catalog/taxonomies.json?isoCode=fr`, {
      headers: enTetesBigbuy(key),
    })) as Array<{ id?: number; name?: string; parentTaxonomy?: number | null }>

    // Seulement le premier niveau : l'arbre entier fait des milliers de nœuds,
    // et un menu de mille entrées ne se parcourt pas davantage qu'une liste vide.
    return rayons
      .filter((r) => r.id && r.name && !r.parentTaxonomy)
      .map((r) => ({ id: String(r.id), label: r.name! }))
  },

  /**
   * Les produits d'un rayon, titres et prix réunis.
   *
   * **Deux appels, parce que BigBuy sépare le prix du nom.** `products` rend
   * l'identifiant et les prix sans le libellé ; `productsinformation` rend le
   * libellé traduit sans les prix. Afficher l'un sans l'autre donnerait une
   * liste de numéros ou une liste sans prix — inutilisable pour décider. On les
   * demande sur le même rayon et la même page, puis on joint par identifiant.
   */
  async produitsDuRayon(rayon, credentials) {
    const key = credentials.apiKey?.trim()
    if (!key) throw new SupplierError("Aucune clé d'API BigBuy saisie.", true)

    const entetes = enTetesBigbuy(key)
    const parametres = `parentTaxonomy=${encodeURIComponent(rayon)}&pageSize=24&page=0`

    const [produits, libelles] = await Promise.all([
      appel(`${BASES.bigbuy}/rest/catalog/products.json?${parametres}`, { headers: entetes }) as Promise<
        Array<{ id?: number; sku?: string; wholesalePrice?: string | null; retailPrice?: string | null }>
      >,
      appel(`${BASES.bigbuy}/rest/catalog/productsinformation.json?${parametres}&isoCode=fr`, {
        headers: entetes,
      }) as Promise<Array<{ id?: number; name?: string }>>,
    ])

    const noms = new Map(libelles.filter((l) => l.id).map((l) => [String(l.id), l.name ?? '']))

    return produits
      .filter((p) => p.id)
      .map((p): SupplierListing => ({
        ref: String(p.id),
        // Sans libellé traduit, la référence vaut mieux qu'une ligne vide : le
        // vendeur voit qu'il y a un produit, et la fiche importée le nommera.
        titre: noms.get(String(p.id)) || p.sku || String(p.id),
        // Le prix de gros est celui qui décide de la marge ; le prix conseillé
        // ne sert qu'à se comparer.
        prix: Number(p.wholesalePrice ?? p.retailPrice) || null,
        devise: 'EUR',
        image: null,
        url: null,
        // BigBuy expédie d'Espagne : c'est le seul fournisseur du lot dont
        // l'entrepôt européen est certain, et ça change le délai du tout au tout.
        entrepot: 'europe' as const,
      }))
  },

  async fetchPrices(refs, credentials) {
    const key = credentials.apiKey?.trim()
    if (!key) throw new SupplierError("Aucune clé d'API BigBuy enregistrée.", true)

    const entetes = { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    const sortie: SupplierPrice[] = []

    for (const ref of refs) {
      try {
        const stock = (await appel(`${BASES.bigbuy}/rest/catalog/productstock/${ref}.json`, {
          headers: entetes,
        })) as { stocks?: Array<{ quantity?: number }> }

        const produit = (await appel(`${BASES.bigbuy}/rest/catalog/productinformation/${ref}.json`, {
          headers: entetes,
        })) as { wholesalePrice?: number; retailPrice?: number }

        const quantite = stock.stocks?.reduce((s, l) => s + (l.quantity ?? 0), 0) ?? null

        sortie.push({
          ref,
          price: produit.wholesalePrice ?? produit.retailPrice ?? null,
          currency: 'EUR',
          stock: quantite,
          available: (quantite ?? 0) > 0,
        })
      } catch (err) {
        // Une référence retirée du catalogue répond 404 : ce n'est pas une
        // panne, c'est une rupture définitive, et elle doit remonter comme
        // telle plutôt que d'arrêter tout le relevé.
        if (err instanceof SupplierError && !err.actionnable) {
          sortie.push({ ref, price: null, currency: 'EUR', stock: 0, available: false })
          continue
        }
        throw err
      }
    }

    return sortie
  },

  /**
   * La fiche complète d'un produit BigBuy, pour l'importer par l'API.
   *
   * BigBuy range une fiche en quatre morceaux : les prix (`product`), le nom et
   * la description en français (`productinformation`), la galerie
   * (`productimages`) et le stock (`productstock`). On demande les quatre
   * ensemble ; seuls le nom et le prix sont indispensables.
   */
  async fetchProduct(ref, credentials) {
    const key = credentials.apiKey?.trim()
    if (!key) throw new SupplierError("Aucune clé d'API BigBuy enregistrée.", true)
    const entetes = enTetesBigbuy(key)
    const id = encodeURIComponent(ref)

    // Each piece may be missing (a product without photos answers 404 on its
    // gallery); only the name and the price are required.
    const facultatif = <T,>(p: Promise<unknown>) =>
      p.then(
        (r) => r as T,
        (err) => {
          if (err instanceof SupplierError && err.actionnable) throw err
          return null
        },
      )
    const [produit, informations, galerie, stock] = await Promise.all([
      facultatif<{ sku?: string; wholesalePrice?: number | string; retailPrice?: number | string; category?: number | string; weight?: number | string }>(
        appel(`${BASES.bigbuy}/rest/catalog/product/${id}.json`, { headers: entetes }),
      ),
      facultatif<InfoBigbuy | InfoBigbuy[]>(
        appel(`${BASES.bigbuy}/rest/catalog/productinformation/${id}.json?isoCode=fr`, { headers: entetes }),
      ),
      facultatif<{ images?: Array<{ url?: string; isCover?: boolean }> }>(
        appel(`${BASES.bigbuy}/rest/catalog/productimages/${id}.json`, { headers: entetes }),
      ),
      facultatif<{ stocks?: Array<{ quantity?: number }> }>(
        appel(`${BASES.bigbuy}/rest/catalog/productstock/${id}.json`, { headers: entetes }),
      ),
    ])

    const info = Array.isArray(informations) ? informations[0] : informations
    const titre = info?.name?.trim()
    const prix = Number(produit?.wholesalePrice ?? info?.wholesalePrice ?? produit?.retailPrice)
    if (!titre || !Number.isFinite(prix) || prix <= 0) {
      throw new SupplierError(`BigBuy ne rend aucune fiche complète pour la référence ${ref}.`)
    }

    // The cover photo first, then the rest of the gallery.
    const images = [...(galerie?.images ?? [])]
      .sort((a, b) => Number(Boolean(b.isCover)) - Number(Boolean(a.isCover)))
      .map((i) => i.url ?? '')
      .filter((u, i, t) => /^https?:\/\//i.test(u) && t.indexOf(u) === i)

    const description = texteHtml(info?.description ?? '')
    const quantite = stock?.stocks ? stock.stocks.reduce((s, l) => s + (l.quantity ?? 0), 0) : null

    return {
      ref,
      title: titre,
      description: description.slice(0, 4000),
      price: prix,
      currency: 'EUR',
      images,
      variants: null,
      pageText: [titre, produit?.weight ? `Poids : ${produit.weight} kg` : '', description]
        .filter(Boolean)
        .join('\n')
        .slice(0, 15000),
      category: produit?.category !== undefined && produit?.category !== null ? String(produit.category) : null,
      // An unknown stock is not an empty one.
      available: quantite === null || quantite > 0,
    }
  },
}

/** What `productinformation` returns, limited to the fields the import reads. */
type InfoBigbuy = { name?: string; description?: string; wholesalePrice?: number | string }

/**
 * CJ Dropshipping — pensé pour le dropshipping, clé sans validation.
 *
 * Son API demande un jeton d'accès obtenu depuis l'e-mail et la clé ; il vit
 * quinze jours. On le redemande à chaque relevé plutôt que de le stocker : la
 * veille tourne au plus une fois par jour, et un jeton périmé en base coûterait
 * un relevé entier.
 */
/*
 * Le jeton CJ est gardé en mémoire quelques heures. Une page de catalogue
 * demande désormais les rayons ET les produits d'un même geste : deux échanges
 * de jeton en parallèle, alors que CJ bride `getAccessToken` bien plus
 * sévèrement que le reste de son API.
 */
const JETONS_CJ = new Map<string, { jeton: string; expire: number }>()
const DUREE_JETON_CJ = 6 * 60 * 60 * 1000

async function jetonCj(credentials: Record<string, string>): Promise<string> {
  const email = credentials.email?.trim()
  const key = credentials.apiKey?.trim()
  if (!email || !key) throw new SupplierError('Identifiants CJ Dropshipping incomplets.', true)

  const cle = `${email}\u0000${key}`
  const garde = JETONS_CJ.get(cle)
  if (garde && garde.expire > Date.now()) return garde.jeton

  const auth = (await appel(`${BASES.cjdropshipping}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: key }),
  })) as { data?: { accessToken?: string }; message?: string }

  const jeton = auth.data?.accessToken
  if (!jeton) {
    throw new SupplierError(auth.message || 'CJ Dropshipping a refusé les identifiants.', true)
  }
  JETONS_CJ.set(cle, { jeton, expire: Date.now() + DUREE_JETON_CJ })
  return jeton
}

/** Une ligne de `product/list`, telle que CJ la rend. */
type LigneCj = { pid?: string; productNameEn?: string; sellPrice?: number | string; productImage?: string; createTime?: string | number }

const ligneCj = (p: LigneCj): SupplierListing => ({
  ref: p.pid!,
  titre: p.productNameEn || p.pid!,
  prix: Number(p.sellPrice) || null,
  devise: 'USD',
  image: p.productImage || null,
  url: `https://www.cjdropshipping.com/product/-p-${p.pid}.html`,
  entrepot: null,
})

/** `product/list` avec ces paramètres, réduit aux lignes qui ont un identifiant. */
async function listeCj(jeton: string, parametres: Record<string, string>): Promise<LigneCj[]> {
  const reponse = (await appel(`${BASES.cjdropshipping}/product/list?${new URLSearchParams(parametres)}`, {
    headers: enTetesCj(jeton),
  })) as { data?: { list?: LigneCj[] } }
  return (reponse.data?.list ?? []).filter((p) => p.pid)
}

/**
 * L'arbre de CJ, à plat : un rayon par catégorie de deuxième niveau, avec les
 * identifiants de troisième niveau qu'il contient — ce sont ceux-là que
 * `product/list` accepte. Le premier niveau (« Computer & Office ») est trop
 * large pour un rayon, le troisième fait des centaines d'entrées.
 */
async function arbreCj(jeton: string) {
  const reponse = (await appel(`${BASES.cjdropshipping}/product/getCategory`, { headers: enTetesCj(jeton) })) as {
    data?: Array<{
      categoryFirstName?: string
      categoryFirstList?: Array<{
        categorySecondName?: string
        categorySecondList?: Array<{ categoryId?: string; categoryName?: string }>
      }>
    }>
  }
  return (reponse.data ?? []).flatMap((premier) =>
    (premier.categoryFirstList ?? []).flatMap((second) => {
      const feuilles = (second.categorySecondList ?? []).map((t) => t.categoryId).filter((id): id is string => Boolean(id))
      if (!second.categorySecondName || !feuilles.length) return []
      return [
        {
          // L'identifiant d'un rayon CJ est son libellé : l'arbre n'en donne
          // pas d'autre au deuxième niveau, et il est stable chez eux.
          id: `${premier.categoryFirstName ?? ''} › ${second.categorySecondName}`,
          label: `${premier.categoryFirstName ?? ''} › ${second.categorySecondName}`,
          feuilles,
        },
      ]
    }),
  )
}

/** What `product/query` returns, limited to the fields the import reads. */
interface FicheCj {
  pid?: string
  productNameEn?: string
  productImage?: string | string[]
  productImageSet?: string[] | string
  productKeyEn?: string
  productWeight?: number | string
  materialNameEn?: string
  categoryName?: string
  sellPrice?: number | string
  description?: string
  variants?: Array<{
    vid?: string
    variantKey?: string
    variantNameEn?: string
    variantImage?: string
    variantSellPrice?: number | string
  }>
}

/** A list of URLs, whether CJ sent an array, a JSON-encoded array or a single string. */
function listeAdresses(brut: unknown): string[] {
  if (Array.isArray(brut)) return brut.map(String)
  if (typeof brut !== 'string' || !brut.trim()) return []
  const t = brut.trim()
  if (t.startsWith('[')) {
    try {
      const l = JSON.parse(t)
      return Array.isArray(l) ? l.map(String) : []
    } catch {
      return []
    }
  }
  return t.split(/[,;]\s*(?=https?:)/)
}

/** Plain text out of CJ's HTML description. */
function texteHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** Les en-têtes d'un appel CJ authentifié. */
const enTetesCj = (jeton: string) => ({ 'CJ-Access-Token': jeton, Accept: 'application/json' })

const cj: SupplierConnector = {
  id: 'cjdropshipping',
  label: 'CJ Dropshipping',

  /**
   * Obtenir le jeton suffit à prouver le couple e-mail + clé.
   *
   * C'est déjà ce que fait chaque appel CJ avant de travailler : si l'échange
   * passe, les identifiants sont bons, et aucun appel de catalogue n'est
   * nécessaire pour le savoir.
   */
  async verifier(credentials) {
    await jetonCj(credentials)
  },

  async fetchPrices(refs, credentials) {
    const jeton = await jetonCj(credentials)

    const sortie: SupplierPrice[] = []
    for (const ref of refs) {
      const reponse = (await appel(
        `${BASES.cjdropshipping}/product/variant/query?pid=${encodeURIComponent(ref)}`,
        { headers: { 'CJ-Access-Token': jeton, Accept: 'application/json' } },
      )) as { data?: Array<{ variantSellPrice?: number; variantStandard?: string }> }

      const variantes = reponse.data ?? []
      // Le prix retenu est le plus bas des variantes : c'est celui qui décide
      // de la marge minimale, et c'est celui qu'on veut voir monter.
      const prix = variantes
        .map((v) => v.variantSellPrice)
        .filter((p): p is number => typeof p === 'number')
        .sort((a, b) => a - b)[0]

      sortie.push({
        ref,
        price: prix ?? null,
        currency: 'USD',
        // CJ ne renvoie pas la quantité sur cet appel : dire « non dit » plutôt
        // que d'inventer un zéro, qui ferait passer le produit pour épuisé.
        stock: null,
        available: variantes.length > 0,
      })
    }

    return sortie
  },

  /**
   * La recherche par mots-clés du catalogue CJ.
   *
   * C'est elle qui répond à « trouve-moi cinq produits » : `product/list`
   * accepte le nom en anglais et rend prix, image et identifiant. CJ vend
   * surtout depuis la Chine mais tient des entrepôts européens ; cet appel ne
   * dit pas lequel sert un produit donné — on répond « inconnu » plutôt que
   * d'inventer, et le chef renvoie vers la fiche pour le vérifier.
   */
  async searchProducts(motsCles, credentials) {
    const jeton = await jetonCj(credentials)

    /*
     * **En anglais, et filtré.** Deux défauts constatés le 16/09/2026, et ils
     * se cumulaient. `productNameEn` est un index ANGLAIS : « écouteurs sans
     * fil » y rendait une balayette de jardin et un fer à boucler, accrochés au
     * seul mot « fil ». Et même en anglais parfait, CJ s'accroche à UN mot —
     * « wireless earbuds » rendait un nettoyeur haute pression, une tasse pour
     * bébé et un soutien-gorge, tous « wireless », aucun écouteur, sans le
     * moindre classement par pertinence.
     */
    const requete = await traduireEnAnglais(motsCles)
    const reponse = (await appel(
      `${BASES.cjdropshipping}/product/list?productNameEn=${encodeURIComponent(requete)}&pageNum=1&pageSize=40`,
      { headers: enTetesCj(jeton) },
    )) as {
      data?: { list?: Array<{ pid?: string; productNameEn?: string; sellPrice?: number | string; productImage?: string }> }
    }

    const lignes = (reponse.data?.list ?? [])
      .filter((p) => p.pid)
      .map((p): SupplierListing => ({
        ref: p.pid!,
        titre: p.productNameEn || p.pid!,
        prix: Number(p.sellPrice) || null,
        devise: 'USD',
        image: p.productImage || null,
        url: `https://www.cjdropshipping.com/product/-p-${p.pid}.html`,
        entrepot: null,
      }))

    // On demande large (40) puis on resserre : CJ ne classe pas, donc élaguer
    // sur dix lignes ne laisserait presque rien de juste.
    return gardeLesPertinents(lignes, requete).slice(0, 20)
  },

  async listerRayons(credentials) {
    const jeton = await jetonCj(credentials)
    return (await arbreCj(jeton)).map(({ id, label }) => ({ id, label }))
  },

  /**
   * Les produits d'un rayon : ses premières sous-catégories, interrogées
   * ensemble puis mélangées, pour que le rayon ne se résume pas à la première.
   */
  async produitsDuRayon(rayon, credentials) {
    const jeton = await jetonCj(credentials)
    const trouve = (await arbreCj(jeton)).find((r) => r.id === rayon)
    if (!trouve) throw new SupplierError("Ce rayon n'existe plus chez CJ Dropshipping.")

    const listes = await Promise.all(
      trouve.feuilles.slice(0, 4).map((categoryId) => listeCj(jeton, { categoryId, pageNum: '1', pageSize: '6' })),
    )
    const vus = new Set<string>()
    const sortie: SupplierListing[] = []
    for (let i = 0; i < 6; i++)
      for (const l of listes)
        if (l[i] && !vus.has(l[i].pid!)) {
          vus.add(l[i].pid!)
          sortie.push(ligneCj(l[i]))
        }
    return sortie
  },

  /**
   * Les nouveautés : les produits mis en ligne chez CJ ces trente derniers
   * jours (`createTimeFrom`). Quand la ligne porte sa date, elle est revérifiée
   * ici : un paramètre ignoré par l'API ne doit pas faire passer le catalogue
   * entier pour du neuf.
   */
  async nouveautes(credentials) {
    const jeton = await jetonCj(credentials)
    const depuis = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const lignes = await listeCj(jeton, {
      createTimeFrom: depuis.toISOString().slice(0, 19).replace('T', ' '),
      pageNum: '1',
      pageSize: '20',
    })
    return lignes
      .filter((p) => {
        if (p.createTime === undefined || p.createTime === null || p.createTime === '') return true
        const t = typeof p.createTime === 'number' ? p.createTime : Date.parse(String(p.createTime).replace(' ', 'T'))
        return Number.isNaN(t) || t >= depuis.getTime()
      })
      .map(ligneCj)
  },

  /**
   * La fiche complète d'un produit CJ, pour l'importer par l'API.
   *
   * `product/query` rend le nom, la description, la galerie, la catégorie et
   * les variantes avec leur prix : tout ce que la chaîne d'import attend, sans
   * passer par l'extension. Les prix sont en dollars, comme partout chez CJ.
   */
  async fetchProduct(ref, credentials) {
    const jeton = await jetonCj(credentials)
    const reponse = (await appel(`${BASES.cjdropshipping}/product/query?pid=${encodeURIComponent(ref)}`, {
      headers: enTetesCj(jeton),
    })) as { result?: boolean; message?: string; data?: FicheCj | null }

    const fiche = reponse.data
    const titre = fiche?.productNameEn?.trim()
    if (!fiche || !titre) {
      throw new SupplierError(
        reponse.result === false && reponse.message
          ? `CJ Dropshipping refuse la fiche ${ref} : ${reponse.message}`
          : `CJ Dropshipping ne rend aucune fiche pour la référence ${ref}.`,
      )
    }

    const variantes = fiche.variants ?? []

    // The gallery comes as an array or as a JSON-encoded string; variant
    // photos complete it.
    const images = [
      ...listeAdresses(fiche.productImageSet),
      ...listeAdresses(fiche.productImage),
      ...variantes.map((v) => v.variantImage ?? ''),
    ].filter((u, i, t) => /^https?:\/\//i.test(u) && t.indexOf(u) === i)

    const prixVariantes = variantes.map((v) => Number(v.variantSellPrice)).filter((p) => Number.isFinite(p) && p > 0)
    // sellPrice can be a range such as "1.79 -- 2.45": its first number is the floor.
    const prixFiche = Number(String(fiche.sellPrice ?? '').match(/\d+(?:\.\d+)?/)?.[0])
    const prix = prixVariantes.length ? Math.min(...prixVariantes) : Number.isFinite(prixFiche) ? prixFiche : 0

    // productKeyEn names the options ("Color-Size") and each variantKey gives
    // the values in the same order ("Black-XL"). A key that does not split
    // into as many parts is kept whole rather than guessed.
    const noms = (fiche.productKeyEn ?? '').split('-').map((n) => n.trim()).filter(Boolean)
    const options: Record<string, Set<string>> = {}
    for (const v of variantes) {
      const cle = (v.variantKey || v.variantNameEn || '').trim()
      if (!cle) continue
      const parts = cle.split('-').map((x) => x.trim())
      if (noms.length > 1 && parts.length === noms.length) {
        noms.forEach((n, i) => {
          if (parts[i]) (options[n] ??= new Set()).add(parts[i])
        })
      } else {
        ;(options[noms.length === 1 ? noms[0] : 'Modèle'] ??= new Set()).add(cle)
      }
    }

    const description = texteHtml(fiche.description ?? '')
    const caracteristiques = [
      fiche.categoryName ? `Catégorie : ${fiche.categoryName}` : '',
      fiche.materialNameEn ? `Matière : ${fiche.materialNameEn}` : '',
      fiche.productWeight ? `Poids : ${fiche.productWeight} g` : '',
    ].filter(Boolean)

    return {
      ref,
      title: titre,
      description: description.slice(0, 4000),
      price: prix,
      currency: 'USD',
      images,
      variants: Object.keys(options).length
        ? Object.fromEntries(Object.entries(options).map(([k, v]) => [k, [...v]]))
        : null,
      pageText: [titre, ...caracteristiques, description].join('\n').slice(0, 15000),
      category: fiche.categoryName?.trim() || null,
      // A product listed with an empty variant list can no longer be ordered.
      available: !Array.isArray(fiche.variants) || fiche.variants.length > 0,
    }
  },

  async fetchVariants(ref, credentials) {
    const jeton = await jetonCj(credentials)
    const reponse = (await appel(
      `${BASES.cjdropshipping}/product/variant/query?pid=${encodeURIComponent(ref)}`,
      { headers: enTetesCj(jeton) },
    )) as {
      data?: Array<{
        vid?: string
        variantSellPrice?: number
        variantKey?: string
        variantNameEn?: string
      }>
    }

    return (reponse.data ?? [])
      .filter((v) => v.vid)
      .map((v) => ({
        ref: v.vid!,
        // `variantKey` est ce que CJ affiche au vendeur — « Noir-XL ». Le nom
        // complet ne sert que si la clé manque.
        label: v.variantKey || v.variantNameEn || v.vid!,
        price: typeof v.variantSellPrice === 'number' ? v.variantSellPrice : null,
        stock: null,
      }))
  },

  /**
   * Dépose la commande chez CJ **sans la payer**.
   *
   * `payType: 3` veut dire « créer la commande seulement » : elle apparaît dans
   * l'espace CJ du vendeur, en attente de règlement. C'est exactement la règle
   * qu'on s'est donnée pour la publication — l'application remplit, l'humain
   * valide — appliquée là où elle compte le plus, puisqu'ici c'est de l'argent.
   */
  async placeOrder(commande, credentials) {
    const jeton = await jetonCj(credentials)

    const reponse = (await appel(`${BASES.cjdropshipping}/shopping/order/createOrderV2`, {
      method: 'POST',
      headers: { ...enTetesCj(jeton), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: commande.reference,
        shippingCustomerName: commande.destinataire.nom,
        shippingCountryCode: commande.destinataire.paysCode,
        shippingCountry: commande.destinataire.pays,
        shippingProvince: commande.destinataire.region,
        shippingCity: commande.destinataire.ville,
        shippingAddress: commande.destinataire.adresse,
        shippingAddress2: commande.destinataire.complement,
        shippingZip: commande.destinataire.codePostal,
        shippingPhone: commande.destinataire.telephone,
        email: commande.destinataire.email,
        // 3 = créer la commande sans la payer. Ne jamais mettre 2 (paiement sur
        // le solde) : ce serait débiter le vendeur sans son accord.
        payType: 3,
        products: [{ vid: commande.variantRef, quantity: commande.quantity }],
      }),
    })) as {
      data?: { orderId?: string; orderStatus?: string; orderAmount?: number; cjPayUrl?: string }
      message?: string
    }

    const id = reponse.data?.orderId
    if (!id) {
      throw new SupplierError(
        reponse.message || "CJ Dropshipping n'a pas créé la commande.",
        true,
      )
    }

    return {
      supplierOrderId: id,
      status: reponse.data?.orderStatus ?? null,
      cost: typeof reponse.data?.orderAmount === 'number' ? reponse.data.orderAmount : null,
      currency: 'USD',
      url: reponse.data?.cjPayUrl ?? null,
    }
  },

  async fetchTracking(ids, credentials) {
    const jeton = await jetonCj(credentials)
    const sortie: SupplierTracking[] = []

    for (const id of ids) {
      try {
        const reponse = (await appel(
          `${BASES.cjdropshipping}/shopping/order/getOrderDetail?orderId=${encodeURIComponent(id)}`,
          { headers: enTetesCj(jeton) },
        )) as { data?: { orderStatus?: string; trackNumber?: string; logisticName?: string } }

        const statut = reponse.data?.orderStatus ?? null
        sortie.push({
          supplierOrderId: id,
          status: statut,
          trackingNumber: reponse.data?.trackNumber || null,
          carrier: reponse.data?.logisticName || null,
          expedie: statut === 'SHIPPED' || statut === 'DELIVERED',
        })
      } catch (err) {
        // Une commande introuvable ne doit pas masquer le suivi des autres :
        // c'est souvent une commande annulée côté CJ, pas une panne.
        if (err instanceof SupplierError && err.actionnable) throw err
      }
    }

    return sortie
  },
}

import { aliexpress } from './supplierAliexpress.js'
import { printful, printify } from './supplierImpression.js'

export const CONNECTEURS: SupplierConnector[] = [aliexpress, bigbuy, cj, printful, printify]

export function findConnector(id: string): SupplierConnector | null {
  return CONNECTEURS.find((c) => c.id === id) ?? null
}

/**
 * Les fournisseurs qu'un vendeur a reliés ET dont le connecteur existe.
 *
 * Les deux conditions sont distinctes, et les confondre est une erreur qu'on a
 * déjà faite : un vendeur peut avoir enregistré ses identifiants chez un
 * fournisseur pour lequel aucun connecteur n'est écrit — la liaison est vraie,
 * la capacité n'existe pas. Filtrer ici évite de le découvrir au milieu d'une
 * boucle, là où il ne reste plus qu'à lever.
 *
 * Extrait ici parce que **deux écrans en ont besoin** — les catalogues
 * connectés et le studio d'analyses — et que recopier la jointure en ferait
 * deux versions qui divergeraient : celle qui filtre les liaisons éteintes et
 * celle qui oublie de le faire.
 */
export interface FournisseurRelie {
  id: string
  label: string
  connecteur: SupplierConnector
  /** Les identifiants du vendeur. Ne sortent jamais vers le navigateur. */
  creds: Record<string, string>
}

export async function fournisseursRelies(
  prisma: { supplierConnection: { findMany(args: unknown): Promise<Array<{ supplier: string; data: unknown }>> } },
  userId: string,
): Promise<FournisseurRelie[]> {
  const liens = await prisma.supplierConnection.findMany({
    where: { userId, connected: true },
  })

  return liens.flatMap((lien) => {
    const connecteur = findConnector(lien.supplier)
    if (!connecteur) return []
    return [
      {
        id: lien.supplier,
        label: connecteur.label,
        connecteur,
        creds: (lien.data ?? {}) as Record<string, string>,
      },
    ]
  })
}
