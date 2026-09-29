/**
 * Capter les ventes des places de marché, et leur renvoyer le suivi du colis.
 *
 * C'est le maillon qui manquait à l'auto-fulfillment (docs/v2/DECISIONS.md) :
 * la commande fournisseur savait partir d'une vente ENREGISTRÉE, mais une vente
 * Shopify, eBay ou WooCommerce n'arrivait jamais toute seule dans l'application.
 * Le vendeur la recopiait. Premier canal branché le 29/09/2026 : Shopify, le
 * seul où Max vend réellement aujourd'hui (oguss-france). Les autres suivront
 * la même forme : un relevé qui rend des `VenteCapturee`, un envoi du suivi.
 *
 * Quatre règles :
 *
 * - **Une vente se retrouve par sa référence (UGS)**, celle que la plateforme a
 *   reçue à la publication (`ugsDe`, productFacts.ts, ou `DSP-…` des boutiques
 *   tierces). Une ligne dont la référence ne mène à aucun produit du compte est
 *   comptée et dite, jamais rattachée « au plus proche » : commander le mauvais
 *   article chez le fournisseur coûte le colis.
 * - **Idempotent** : relire la même fenêtre ne crée rien de plus. La clé est
 *   (compte, plateforme, commande externe, produit).
 * - **Rien d'impayé n'entre** : commande annulée, en attente de paiement ou
 *   expirée est ignorée — commander chez le fournisseur une vente non payée,
 *   c'est avancer l'argent d'un colis que personne n'achète.
 * - **Le suivi repart une fois** : `Order.suiviTransmisAt` le marque, et une
 *   erreur est écrite en clair (`suiviTransmisErreur`) au lieu d'être rejouée
 *   en boucle toutes les quinze minutes.
 */
import type { Platform } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { graphql, resoudreCredentialsShopify } from './shopify.js'
import { jetonOfflineValide } from './shopifyApp.js'

export interface LigneCapturee {
  /** L'identifiant de la ligne chez la plateforme. */
  externalLineId: string
  sku: string | null
  titre: string
  quantite: number
  /** Montant de la ligne, remises déduites, en devise de la commande. */
  montant: number
}

export interface VenteCapturee {
  platform: Platform
  /** L'identifiant de la commande chez la plateforme (GID Shopify…). */
  externalOrderId: string
  /** Le numéro que le vendeur voit (#1001). */
  numero: string
  creeLe: Date
  devise: string
  acheteur: {
    nom: string
    email: string | null
    adresse: Record<string, string | undefined>
  }
  lignes: LigneCapturee[]
}

export interface BilanCapture {
  lues: number
  creees: number
  deja: number
  sansProduit: Array<{ numero: string; sku: string | null; titre: string }>
}

// ------------------------------------------------------ La référence → produit

/**
 * Le produit du compte que désigne une référence de vente.
 *
 * Les trois formes que la plateforme a reçues : `<FOURNISSEUR>-<réf>[-variante]`
 * (ugsDe avec référence fournisseur), `DSP-<10 derniers caractères de l'id>`
 * (ugsDe sans référence), `DSP-<réf fournisseur>` ou `DSP-<id>` (boutiques
 * tierces). La plus longue correspondance l'emporte : « CJ-123 » ne doit pas
 * capter la vente de « CJ-1234 ».
 */
export async function produitDeLUgs(userId: string, sku: string | null): Promise<string | null> {
  if (!sku) return null
  const s = sku.trim()
  if (!s) return null

  if (/^DSP-/i.test(s)) {
    const reste = s.slice(4)
    const bas = reste.toLowerCase()
    const direct = await prisma.product.findFirst({
      where: { userId, OR: [{ id: bas }, { supplierRef: reste }, { id: { endsWith: bas.slice(0, 10) } }] },
      select: { id: true },
    })
    if (direct) return direct.id
  }

  const tiret = s.indexOf('-')
  if (tiret > 0) {
    const fournisseur = s.slice(0, tiret).toLowerCase()
    const candidats = await prisma.product.findMany({
      where: { userId, supplierId: fournisseur, supplierRef: { not: null } },
      select: { id: true, supplierRef: true },
    })
    const reste = s.slice(tiret + 1)
    const trouves = candidats
      .filter((c) => c.supplierRef && (reste === c.supplierRef || reste.startsWith(`${c.supplierRef}-`)))
      .sort((a, b) => (b.supplierRef?.length ?? 0) - (a.supplierRef?.length ?? 0))
    if (trouves[0]) return trouves[0].id
  }
  return null
}

// ------------------------------------------------------------ L'enregistrement

export async function enregistrerVentes(userId: string, ventes: VenteCapturee[]): Promise<BilanCapture> {
  const bilan: BilanCapture = { lues: ventes.length, creees: 0, deja: 0, sansProduit: [] }
  for (const v of ventes) {
    for (const l of v.lignes) {
      const productId = await produitDeLUgs(userId, l.sku)
      if (!productId) {
        bilan.sansProduit.push({ numero: v.numero, sku: l.sku, titre: l.titre })
        continue
      }
      const existe = await prisma.order.findFirst({
        where: { userId, platform: v.platform, externalOrderId: v.externalOrderId, productId },
        select: { id: true },
      })
      if (existe) {
        bilan.deja++
        continue
      }
      await prisma.order.create({
        data: {
          userId,
          productId,
          platform: v.platform,
          externalOrderId: v.externalOrderId,
          buyerName: v.acheteur.nom,
          buyerEmail: v.acheteur.email,
          buyerAddress: v.acheteur.adresse,
          amount: l.montant,
          currency: v.devise,
          quantity: l.quantite,
          paidAt: v.creeLe,
          createdAt: v.creeLe,
        },
      })
      bilan.creees++
    }
  }
  return bilan
}

// ---------------------------------------------------------------- Shopify

/** Un appel GraphQL déjà authentifié : injectable, pour que le banc parle à un faux Shopify. */
export type AppelGraphql = <T>(query: string, variables: Record<string, unknown>) => Promise<T>

const REQUETE_COMMANDES = `query Ventes($q: String!, $apres: String) {
  orders(first: 50, after: $apres, query: $q, sortKey: CREATED_AT) {
    edges { node {
      id name createdAt cancelledAt displayFinancialStatus email
      currencyCode
      shippingAddress { name firstName lastName address1 address2 city zip province countryCodeV2 country phone }
      lineItems(first: 50) { edges { node {
        id sku title quantity
        discountedTotalSet { shopMoney { amount } }
      } } }
    } }
    pageInfo { hasNextPage endCursor }
  }
}`

type NoeudCommande = {
  id: string
  name: string
  createdAt: string
  cancelledAt: string | null
  displayFinancialStatus: string | null
  email: string | null
  currencyCode: string
  shippingAddress: Record<string, string | null> | null
  lineItems: { edges: Array<{ node: { id: string; sku: string | null; title: string; quantity: number; discountedTotalSet: { shopMoney: { amount: string } } } }> }
}

/** Les statuts financiers qui disent « l'acheteur a payé ». */
const PAYEES = new Set(['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'])

export async function releverVentesShopify(appel: AppelGraphql, depuis: Date): Promise<VenteCapturee[]> {
  const ventes: VenteCapturee[] = []
  let apres: string | null = null
  // Cinq pages au plus par passage (250 commandes) : la suivante reprendra.
  for (let page = 0; page < 5; page++) {
    const r: { orders: { edges: Array<{ node: NoeudCommande }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await appel(
      REQUETE_COMMANDES,
      { q: `created_at:>='${depuis.toISOString()}'`, apres },
    )
    for (const { node: c } of r.orders.edges) {
      if (c.cancelledAt || !PAYEES.has(c.displayFinancialStatus ?? '')) continue
      const a = c.shippingAddress ?? {}
      const nom = a.name || [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Acheteur'
      ventes.push({
        platform: 'SHOPIFY',
        externalOrderId: c.id,
        numero: c.name,
        creeLe: new Date(c.createdAt),
        devise: c.currencyCode || 'EUR',
        acheteur: {
          nom,
          email: c.email,
          // Les clés que lireAdresse (supplierOrders.ts) sait lire.
          adresse: {
            name: nom,
            address1: a.address1 ?? undefined,
            address2: a.address2 ?? undefined,
            city: a.city ?? undefined,
            zip: a.zip ?? undefined,
            province: a.province ?? undefined,
            countryCode: a.countryCodeV2 ?? undefined,
            country: a.country ?? undefined,
            phone: a.phone ?? undefined,
          },
        },
        lignes: c.lineItems.edges.map(({ node: l }) => ({
          externalLineId: l.id,
          sku: l.sku,
          titre: l.title,
          quantite: l.quantity,
          montant: Number(l.discountedTotalSet.shopMoney.amount) || 0,
        })),
      })
    }
    if (!r.orders.pageInfo.hasNextPage) break
    apres = r.orders.pageInfo.endCursor
  }
  return ventes
}

const REQUETE_EXPEDITIONS = `query Expeditions($id: ID!) {
  order(id: $id) { fulfillmentOrders(first: 20) { edges { node { id status } } } }
}`

const MUTATION_EXPEDITION = `mutation Expedier($f: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $f) { fulfillment { id status } userErrors { field message } }
}`

/**
 * Renvoie le numéro de suivi à Shopify : l'acheteur reçoit l'e-mail
 * d'expédition, la commande passe « traitée ». Toutes les lignes encore
 * ouvertes de la commande sont déclarées expédiées avec ce colis — c'est le cas
 * du dropshipping à un fournisseur par commande ; plusieurs colis par commande
 * seront traités quand un vendeur en aura.
 */
export async function transmettreSuiviShopify(appel: AppelGraphql, orderGid: string, numero: string, transporteur: string | null): Promise<void> {
  const r: { order: { fulfillmentOrders: { edges: Array<{ node: { id: string; status: string } }> } } | null } = await appel(REQUETE_EXPEDITIONS, { id: orderGid })
  const ouverts = (r.order?.fulfillmentOrders.edges ?? []).map((e) => e.node).filter((n) => n.status === 'OPEN' || n.status === 'IN_PROGRESS')
  if (!ouverts.length) throw new Error('Shopify ne présente plus aucune ligne à expédier sur cette commande (déjà traitée ou annulée).')
  const m: { fulfillmentCreate: { userErrors: Array<{ message: string }> } } = await appel(MUTATION_EXPEDITION, {
    f: {
      lineItemsByFulfillmentOrder: ouverts.map((o) => ({ fulfillmentOrderId: o.id })),
      trackingInfo: { number: numero, ...(transporteur ? { company: transporteur } : {}) },
      notifyCustomer: true,
    },
  })
  if (m.fulfillmentCreate.userErrors.length) throw new Error(`Shopify refuse l'expédition : ${m.fulfillmentCreate.userErrors.map((e) => e.message).join(' ; ')}`)
}

/** Traduit un refus de permission en geste pour le vendeur. */
function motifShopify(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  if (/access denied|not approved|scope|403|Jeton refusé/i.test(m)) {
    return `Shopify refuse l'accès aux commandes : l'application doit avoir les permissions read_orders et write_merchant_managed_fulfillment_orders (Paramètres › Applications › votre app › Configuration de l'API Admin), puis réinstallez-la. Détail : ${m.slice(0, 200)}`
  }
  return m.slice(0, 300)
}

/** Une passe pour un compte : capter, puis renvoyer les suivis en attente. */
export async function passageShopify(userId: string, appel: AppelGraphql): Promise<{ bilan: BilanCapture | null; suivis: number; erreur: string | null }> {
  let bilan: BilanCapture | null = null
  let erreur: string | null = null
  try {
    // Fenêtre : depuis la dernière vente connue moins deux jours (une commande
    // payée tard garde sa date de création), bornée à quatorze jours.
    const derniere = await prisma.order.findFirst({ where: { userId, platform: 'SHOPIFY' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    const plancher = Date.now() - 14 * 86_400_000
    const depuis = new Date(Math.max(plancher, (derniere?.createdAt.getTime() ?? plancher) - 2 * 86_400_000))
    bilan = await enregistrerVentes(userId, await releverVentesShopify(appel, depuis))
  } catch (err) {
    erreur = motifShopify(err)
  }

  let suivis = 0
  const aTransmettre = await prisma.order.findMany({
    where: { userId, platform: 'SHOPIFY', trackingNumber: { not: null }, suiviTransmisAt: null, suiviTransmisErreur: null, externalOrderId: { startsWith: 'gid://shopify/Order/' } },
    select: { id: true, externalOrderId: true, trackingNumber: true, carrier: true },
    take: 50,
  })
  // Plusieurs lignes d'une même commande : un seul envoi par commande.
  const faites = new Set<string>()
  for (const o of aTransmettre) {
    const gid = o.externalOrderId!
    try {
      if (!faites.has(gid)) await transmettreSuiviShopify(appel, gid, o.trackingNumber!, o.carrier)
      faites.add(gid)
      await prisma.order.update({ where: { id: o.id }, data: { suiviTransmisAt: new Date() } })
      suivis++
    } catch (err) {
      await prisma.order.update({ where: { id: o.id }, data: { suiviTransmisErreur: motifShopify(err) } })
    }
  }
  return { bilan, suivis, erreur }
}

/**
 * La tournée : tous les comptes dont Shopify est relié. `perimetre` borne la
 * tournée à des comptes précis — la production ne le passe JAMAIS, un banc
 * TOUJOURS (leçon AUTO-MODE du 05/09/2026).
 */
export async function tourneeVentes(perimetre?: string[]): Promise<void> {
  const liens = await prisma.platformCredential.findMany({
    where: { platform: 'SHOPIFY', connected: true, ...(perimetre ? { userId: { in: perimetre } } : {}) },
  })
  for (const lien of liens) {
    try {
      const creds =
        (await jetonOfflineValide(lien.data, async (data) => {
          await prisma.platformCredential.update({ where: { id: lien.id }, data: { data } })
        })) ?? (await resoudreCredentialsShopify(lien.data))
      if (!creds) continue
      const appel: AppelGraphql = (q, v) => graphql(creds, q, v)
      const r = await passageShopify(lien.userId, appel)
      if (r.erreur) console.warn(`ventes Shopify ${lien.userId} : ${r.erreur}`)
      else if (r.bilan && (r.bilan.creees || r.suivis)) console.log(`ventes Shopify ${lien.userId} : ${r.bilan.creees} vente(s), ${r.suivis} suivi(s) transmis`)
    } catch (err) {
      console.error('tournée ventes Shopify', lien.userId, err)
    }
  }
}
