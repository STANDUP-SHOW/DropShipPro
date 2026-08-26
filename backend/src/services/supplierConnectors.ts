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

import {
  SupplierError,
  type SupplierConnector,
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
const bigbuy: SupplierConnector = {
  id: 'bigbuy',
  label: 'BigBuy',
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
}

/**
 * CJ Dropshipping — pensé pour le dropshipping, clé sans validation.
 *
 * Son API demande un jeton d'accès obtenu depuis l'e-mail et la clé ; il vit
 * quinze jours. On le redemande à chaque relevé plutôt que de le stocker : la
 * veille tourne au plus une fois par jour, et un jeton périmé en base coûterait
 * un relevé entier.
 */
async function jetonCj(credentials: Record<string, string>): Promise<string> {
  const email = credentials.email?.trim()
  const key = credentials.apiKey?.trim()
  if (!email || !key) throw new SupplierError('Identifiants CJ Dropshipping incomplets.', true)

  const auth = (await appel(`${BASES.cjdropshipping}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: key }),
  })) as { data?: { accessToken?: string }; message?: string }

  const jeton = auth.data?.accessToken
  if (!jeton) {
    throw new SupplierError(auth.message || 'CJ Dropshipping a refusé les identifiants.', true)
  }
  return jeton
}

/** Les en-têtes d'un appel CJ authentifié. */
const enTetesCj = (jeton: string) => ({ 'CJ-Access-Token': jeton, Accept: 'application/json' })

const cj: SupplierConnector = {
  id: 'cjdropshipping',
  label: 'CJ Dropshipping',
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

export const CONNECTEURS: SupplierConnector[] = [aliexpress, bigbuy, cj]

export function findConnector(id: string): SupplierConnector | null {
  return CONNECTEURS.find((c) => c.id === id) ?? null
}
