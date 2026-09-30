/**
 * Capter les ventes des places de marché, et leur renvoyer le suivi du colis.
 *
 * C'est le maillon qui manquait à l'auto-fulfillment (docs/v2/DECISIONS.md) :
 * la commande fournisseur savait partir d'une vente ENREGISTRÉE, mais une vente
 * Shopify, eBay ou La Redoute n'arrivait jamais toute seule dans l'application.
 * Le vendeur la recopiait.
 *
 * **Un moteur, des canaux.** Nos vendeurs vendent sur des dizaines de places de
 * marché : ce fichier ne connaît pas « Shopify », il connaît un `Canal` — un
 * relevé qui rend des `VenteCapturee`, un envoi du suivi facultatif, une
 * traduction des refus. Brancher une plateforme, c'est écrire ces trois
 * fonctions et l'ajouter à `canalPour`. Une famille d'API vaut pour toutes ses
 * enseignes : Mirakl, c'est quarante et une places de marché d'un coup.
 * Ce qui n'a pas d'API passe par l'import de commandes (importCommandes.ts).
 *
 * Quatre règles, communes à tous les canaux :
 *
 * - **Une vente se retrouve par sa référence (UGS)**, celle que la plateforme a
 *   reçue à la publication (`ugsDe`, productFacts.ts ; `DSP-…` des boutiques
 *   tierces ; l'identifiant du produit pour eBay et Mirakl). Une ligne dont la
 *   référence ne mène à aucun produit du compte est comptée et dite, jamais
 *   rattachée « au plus proche » : commander le mauvais article chez le
 *   fournisseur coûte le colis.
 * - **Idempotent** : relire la même fenêtre ne crée rien de plus. La clé est
 *   (compte, plateforme, commande externe, produit).
 * - **Rien d'impayé n'entre** : commande annulée, en attente de paiement ou
 *   d'acceptation est ignorée — commander chez le fournisseur une vente non
 *   payée, c'est avancer l'argent d'un colis que personne n'achète.
 * - **Le suivi repart une fois** : `Order.suiviTransmisAt` le marque, et une
 *   erreur est écrite en clair (`suiviTransmisErreur`) au lieu d'être rejouée
 *   en boucle toutes les quinze minutes.
 *
 * L'état de chaque relève (heure, erreur, bilan) est écrit sur la liaison
 * (`PlatformCredential.ventes*`) : le vendeur voit à l'écran qu'un canal ne
 * remonte rien, et pourquoi, au lieu que ce soit dit dans un journal serveur.
 */
import type { Platform, PlatformCredential, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { graphql, resoudreCredentialsShopify } from './shopify.js'
import { jetonOfflineValide } from './shopifyApp.js'
import { appeler as appelerEbay, avecRenouvellement, readEbayCredentials, type EbayCredentials } from './ebay.js'
import { appeler as appelerWoo, readWooCredentials, type WooCredentials } from './woocommerce.js'
import { BoutiqueRefus } from './boutiqueTiers.js'
import { appeler as appelerMagento, readMagentoCredentials, type MagentoCredentials } from './magento.js'
import { appeler as appelerKaufland, readKauflandCredentials, type KauflandCredentials } from './kaufland.js'
import { appeler as appelerMirakl, OPERATEURS_MIRAKL, estMirakl, readMiraklCredentials, type MiraklCredentials } from './mirakl.js'

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

/** Les canaux dont les ventes remontent seules aujourd'hui. */
export const VENTES_CAPTEES: Platform[] = ['SHOPIFY', 'EBAY', 'KAUFLAND', 'WOOCOMMERCE', 'MAGENTO', ...OPERATEURS_MIRAKL]

// ------------------------------------------------------ La référence → produit

/**
 * Le produit du compte que désigne une référence de vente.
 *
 * Les formes que la plateforme a reçues : l'identifiant du produit lui-même
 * (eBay, Mirakl), `<FOURNISSEUR>-<réf>[-variante]` (ugsDe avec référence
 * fournisseur), `DSP-<10 derniers caractères de l'id>` (ugsDe sans référence),
 * `DSP-<réf fournisseur>` ou `DSP-<id>` (boutiques tierces). La plus longue
 * correspondance l'emporte : « CJ-123 » ne doit pas capter la vente de
 * « CJ-1234 ».
 */
export async function produitDeLUgs(userId: string, sku: string | null): Promise<string | null> {
  if (!sku) return null
  const s = sku.trim()
  if (!s) return null

  // L'identifiant brut : un cuid, sans tiret, ne se confond avec aucune autre forme.
  if (/^c[a-z0-9]{20,30}$/.test(s)) {
    const brut = await prisma.product.findFirst({ where: { userId, id: s }, select: { id: true } })
    if (brut) return brut.id
  }

  // Kaufland : une unité déposée avant l'`id_offer` ne porte que son EAN.
  const ean = /^EAN:(\d{8}|\d{12,14})$/.exec(s)
  if (ean) {
    const trouves = await prisma.product.findMany({ where: { userId, ean: ean[1] }, select: { id: true }, take: 2 })
    return trouves.length === 1 ? trouves[0].id : null // deux produits, un EAN : on ne devine pas
  }

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

// ------------------------------------------------------------------ Le moteur

/** Ce qu'une plateforme doit savoir faire pour que ses ventes remontent. */
export interface Canal {
  platform: Platform
  /** Les ventes PAYÉES depuis cette date (le canal peut élargir s'il lit par état). */
  relever(depuis: Date): Promise<VenteCapturee[]>
  /** Renvoie le suivi. Absent : la plateforme n'a pas de chemin connu, le vendeur le reporte. */
  transmettreSuivi?(externalOrderId: string, numero: string, transporteur: string | null): Promise<void>
  /** Les identifiants de commande que ce canal sait traiter (Shopify : un GID). */
  idTransmissible?(id: string): boolean
  /** Un refus traduit en geste pour le vendeur. */
  motif(err: unknown): string
  /** Un fait à dire au vendeur à côté du bilan (des commandes à accepter…). */
  aSignaler?(): Promise<string | null>
}

export interface ResultatPassage {
  bilan: BilanCapture | null
  suivis: number
  erreur: string | null
  signal: string | null
}

const texteErreur = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300)

/** Une passe pour un compte et un canal : capter, puis renvoyer les suivis en attente. */
export async function passage(userId: string, canal: Canal): Promise<ResultatPassage> {
  let bilan: BilanCapture | null = null
  let erreur: string | null = null
  let signal: string | null = null
  try {
    // Fenêtre : depuis la dernière vente connue moins deux jours (une commande
    // payée tard garde sa date de création), bornée à quatorze jours.
    const derniere = await prisma.order.findFirst({ where: { userId, platform: canal.platform }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    const plancher = Date.now() - 14 * 86_400_000
    const depuis = new Date(Math.max(plancher, (derniere?.createdAt.getTime() ?? plancher) - 2 * 86_400_000))
    bilan = await enregistrerVentes(userId, await canal.relever(depuis))
    if (canal.aSignaler) signal = await canal.aSignaler().catch(() => null)
  } catch (err) {
    erreur = canal.motif(err)
  }

  let suivis = 0
  if (canal.transmettreSuivi) {
    const aTransmettre = await prisma.order.findMany({
      where: { userId, platform: canal.platform, trackingNumber: { not: null }, suiviTransmisAt: null, suiviTransmisErreur: null, externalOrderId: { not: null } },
      select: { id: true, externalOrderId: true, trackingNumber: true, carrier: true },
      take: 50,
    })
    // Plusieurs lignes d'une même commande : un seul envoi par commande.
    const faites = new Set<string>()
    for (const o of aTransmettre) {
      const id = o.externalOrderId!
      if (canal.idTransmissible && !canal.idTransmissible(id)) continue
      try {
        if (!faites.has(id)) await canal.transmettreSuivi(id, o.trackingNumber!, o.carrier)
        faites.add(id)
        await prisma.order.update({ where: { id: o.id }, data: { suiviTransmisAt: new Date() } })
        suivis++
      } catch (err) {
        await prisma.order.update({ where: { id: o.id }, data: { suiviTransmisErreur: canal.motif(err) } })
      }
    }
  }
  return { bilan, suivis, erreur, signal }
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

export function canalShopify(appel: AppelGraphql): Canal {
  return {
    platform: 'SHOPIFY',
    relever: (depuis) => releverVentesShopify(appel, depuis),
    transmettreSuivi: (id, numero, transporteur) => transmettreSuiviShopify(appel, id, numero, transporteur),
    idTransmissible: (id) => id.startsWith('gid://shopify/Order/'),
    motif: motifShopify,
  }
}

/** Gardée pour le banc et les appels existants : une passe Shopify. */
export async function passageShopify(userId: string, appel: AppelGraphql): Promise<ResultatPassage> {
  return passage(userId, canalShopify(appel))
}

// ------------------------------------------------------------------- eBay

/**
 * eBay — l'API Fulfillment (portée `sell.fulfillment`).
 *
 * `GET /sell/fulfillment/v1/order` filtré par date de création ; une commande
 * entre si elle est payée et ni annulée ni en cours d'annulation. Le suivi
 * part par `POST …/order/{id}/shipping_fulfillment`, sur toutes les lignes.
 * La référence de ligne est l'identifiant du produit (publierSurEbay).
 */
type CommandeEbay = {
  orderId: string
  legacyOrderId?: string
  creationDate: string
  orderPaymentStatus?: string
  cancelStatus?: { cancelState?: string }
  buyer?: { username?: string; buyerRegistrationAddress?: { email?: string } }
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shipTo?: {
        fullName?: string
        email?: string
        primaryPhone?: { phoneNumber?: string }
        contactAddress?: { addressLine1?: string; addressLine2?: string; city?: string; stateOrProvince?: string; postalCode?: string; countryCode?: string }
      }
    }
  }>
  lineItems?: Array<{ lineItemId: string; sku?: string; title?: string; quantity?: number; total?: { value?: string; currency?: string }; lineItemCost?: { value?: string; currency?: string } }>
}

const PAYEES_EBAY = new Set(['PAID', 'PARTIALLY_REFUNDED'])

export function canalEbay(creds: EbayCredentials): Canal {
  const lire = async <T,>(chemin: string): Promise<T> =>
    avecRenouvellement(creds, async (c) => (await (await appelerEbay(c, 'GET', chemin)).json()) as T)

  return {
    platform: 'EBAY',
    async relever(depuis) {
      const ventes: VenteCapturee[] = []
      const filtre = encodeURIComponent(`creationdate:[${depuis.toISOString()}..]`)
      for (let page = 0; page < 5; page++) {
        const r = await lire<{ orders?: CommandeEbay[]; total?: number }>(`/sell/fulfillment/v1/order?filter=${filtre}&limit=50&offset=${page * 50}`)
        const commandes = r.orders ?? []
        for (const c of commandes) {
          const annulation = c.cancelStatus?.cancelState
          if (!PAYEES_EBAY.has(c.orderPaymentStatus ?? '') || annulation === 'CANCELED' || annulation === 'IN_PROGRESS') continue
          const vers = c.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo ?? {}
          const a = vers.contactAddress ?? {}
          const nom = vers.fullName || c.buyer?.username || 'Acheteur'
          const devise = c.lineItems?.[0]?.total?.currency || 'EUR'
          ventes.push({
            platform: 'EBAY',
            externalOrderId: c.orderId,
            numero: c.legacyOrderId || c.orderId,
            creeLe: new Date(c.creationDate),
            devise,
            acheteur: {
              nom,
              email: vers.email || c.buyer?.buyerRegistrationAddress?.email || null,
              adresse: {
                name: nom,
                address1: a.addressLine1,
                address2: a.addressLine2,
                city: a.city,
                zip: a.postalCode,
                province: a.stateOrProvince,
                countryCode: a.countryCode,
                phone: vers.primaryPhone?.phoneNumber,
              },
            },
            lignes: (c.lineItems ?? []).map((l) => ({
              externalLineId: l.lineItemId,
              sku: l.sku ?? null,
              titre: l.title ?? '',
              quantite: l.quantity ?? 1,
              // Ce que l'acheteur a payé pour la ligne, port compris : c'est ce
              // que le garde-fou de perte doit comparer au coût fournisseur.
              montant: Number(l.total?.value ?? l.lineItemCost?.value) || 0,
            })),
          })
        }
        if (commandes.length < 50) break
      }
      return ventes
    },
    async transmettreSuivi(orderId, numero, transporteur) {
      const commande = await lire<CommandeEbay>(`/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`)
      const lignes = (commande.lineItems ?? []).map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity ?? 1 }))
      if (!lignes.length) throw new Error("eBay ne présente aucune ligne à expédier sur cette commande.")
      await avecRenouvellement(creds, (c) =>
        appelerEbay(c, 'POST', `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, {
          lineItems: lignes,
          shippedDate: new Date().toISOString(),
          // eBay reconnaît les transporteurs courants par leur nom ; « Other » sinon.
          shippingCarrierCode: transporteur || 'Other',
          trackingNumber: numero,
        }),
      )
    },
    motif: texteErreur,
  }
}

// ------------------------------------------------------------------ Mirakl

/**
 * Mirakl — un canal pour les quarante et une enseignes (OR11, OR23, OR24).
 *
 * On lit les commandes à l'état `SHIPPING` : acceptées ET débitées, donc
 * payées — exactement ce qu'il faut commander chez le fournisseur. Les états
 * antérieurs (`WAITING_ACCEPTANCE`, `WAITING_DEBIT…`) n'entrent pas ; ceux qui
 * attendent l'acceptation du vendeur sont comptés et dits, car une commande
 * Mirakl non acceptée à temps est annulée et pèse sur la note du vendeur.
 * La référence de ligne (`offer_sku`) est l'identifiant du produit (csvOffre).
 */
type CommandeMirakl = {
  order_id: string
  commercial_id?: string
  created_date: string
  currency_iso_code?: string
  order_state?: string
  customer_notification_email?: string
  customer?: {
    firstname?: string
    lastname?: string
    shipping_address?: { firstname?: string; lastname?: string; street_1?: string; street_2?: string; zip_code?: string; city?: string; state?: string; country?: string; country_iso_code?: string; phone?: string }
  }
  order_lines?: Array<{ order_line_id: string; offer_sku?: string; product_title?: string; quantity?: number; price?: number; total_price?: number; order_line_state?: string }>
}

const LIGNES_ECARTEES = new Set(['REFUSED', 'CANCELED', 'CLOSED'])

export function canalMirakl(platform: Platform, creds: MiraklCredentials): Canal {
  const boutique = creds.shopId ? `&shop_id=${encodeURIComponent(creds.shopId)}` : ''
  const lire = async <T,>(chemin: string): Promise<T> => (await (await appelerMirakl(creds, chemin)).json()) as T

  return {
    platform,
    async relever(depuis) {
      // Lu par état, pas par date : une commande passe « SHIPPING » quand elle
      // est débitée, parfois des jours après sa création. Trente jours de recul.
      const recul = new Date(Math.min(depuis.getTime(), Date.now() - 30 * 86_400_000))
      const ventes: VenteCapturee[] = []
      for (let page = 0; page < 5; page++) {
        const r = await lire<{ orders?: CommandeMirakl[]; total_count?: number }>(
          `/orders?order_state_codes=SHIPPING&start_date=${encodeURIComponent(recul.toISOString())}&max=100&offset=${page * 100}${boutique}`,
        )
        const commandes = r.orders ?? []
        for (const c of commandes) {
          const a = c.customer?.shipping_address ?? {}
          const nom = [a.firstname ?? c.customer?.firstname, a.lastname ?? c.customer?.lastname].filter(Boolean).join(' ') || 'Acheteur'
          ventes.push({
            platform,
            externalOrderId: c.order_id,
            numero: c.commercial_id || c.order_id,
            creeLe: new Date(c.created_date),
            devise: c.currency_iso_code || 'EUR',
            acheteur: {
              nom,
              email: c.customer_notification_email ?? null,
              adresse: {
                name: nom,
                address1: a.street_1,
                address2: a.street_2,
                city: a.city,
                zip: a.zip_code,
                province: a.state,
                countryCode: a.country_iso_code && a.country_iso_code.length === 2 ? a.country_iso_code : undefined,
                country: a.country,
                phone: a.phone,
              },
            },
            lignes: (c.order_lines ?? [])
              .filter((l) => !LIGNES_ECARTEES.has(l.order_line_state ?? ''))
              .map((l) => ({
                externalLineId: l.order_line_id,
                sku: l.offer_sku ?? null,
                titre: l.product_title ?? '',
                quantite: l.quantity ?? 1,
                montant: Number(l.total_price ?? l.price) || 0,
              })),
          })
        }
        if (commandes.length < 100) break
      }
      return ventes
    },
    async transmettreSuivi(orderId, numero, transporteur) {
      const id = encodeURIComponent(orderId)
      await appelerMirakl(creds, `/orders/${id}/tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier_name: transporteur || 'Transporteur', tracking_number: numero }),
      })
      // Puis « expédiée » : sans ce second appel la commande reste à expédier
      // chez l'opérateur, et le délai d'expédition court toujours.
      await appelerMirakl(creds, `/orders/${id}/ship`, { method: 'PUT' })
    },
    motif: texteErreur,
    async aSignaler() {
      const r = await lire<{ total_count?: number }>(`/orders?order_state_codes=WAITING_ACCEPTANCE&max=1${boutique}`)
      const n = r.total_count ?? 0
      return n ? `${n} commande${n > 1 ? 's attendent' : ' attend'} votre acceptation dans le back-office de l'opérateur (sans acceptation, elle sera annulée).` : null
    },
  }
}

// ------------------------------------------------------------------ Kaufland

interface UniteKaufland {
  id_order_unit: number | string
  id_order?: string
  id_offer?: string | null
  ean?: string | null
  status?: string
  price?: number
  revenue_gross?: number
  currency?: string
  order?: {
    id_order?: string
    ts_created_iso?: string
    currency?: string
    buyer?: { email?: string }
    shipping_address?: { first_name?: string; last_name?: string; street?: string; house_number?: string; additional_field?: string; postcode?: string; city?: string; country?: string; phone?: string }
  }
  product?: { title?: string; eans?: string[] }
}

/**
 * Kaufland vend par « unité de commande » : une pièce, une unité. Les unités
 * d'une même commande sont regroupées ici par référence : deux pièces du même
 * produit font une ligne de quantité deux (le moteur enregistre une vente par
 * commande et par produit).
 */
export function canalKaufland(creds: KauflandCredentials): Canal {
  const pays = encodeURIComponent(creds.storefront)
  return {
    platform: 'KAUFLAND',
    async relever() {
      const parCommande = new Map<string, VenteCapturee>()
      for (let page = 0; page < 5; page++) {
        const r = (await (await appelerKaufland(creds, 'GET', `/order-units/?storefront=${pays}&status=need_to_be_sent&embedded=order,product&limit=100&offset=${page * 100}`)).json()) as { data?: UniteKaufland[] }
        const unites = r.data ?? []
        for (const u of unites) {
          const idCommande = String(u.id_order ?? u.order?.id_order ?? '')
          if (!idCommande) continue
          const a = u.order?.shipping_address ?? {}
          const nom = [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Acheteur'
          let vente = parCommande.get(idCommande)
          if (!vente) {
            vente = {
              platform: 'KAUFLAND',
              externalOrderId: idCommande,
              numero: idCommande,
              creeLe: new Date(u.order?.ts_created_iso ?? Date.now()),
              devise: u.order?.currency || u.currency || 'EUR',
              acheteur: {
                nom,
                email: u.order?.buyer?.email ?? null,
                adresse: {
                  name: nom,
                  address1: [a.street, a.house_number].filter(Boolean).join(' ') || undefined,
                  address2: a.additional_field,
                  city: a.city,
                  zip: a.postcode,
                  countryCode: a.country && a.country.length === 2 ? a.country.toUpperCase() : undefined,
                  phone: a.phone,
                },
              },
              lignes: [],
            }
            parCommande.set(idCommande, vente)
          }
          const ean = (u.ean ?? u.product?.eans?.[0] ?? '').replace(/\D/g, '')
          const sku = u.id_offer ? String(u.id_offer) : ean ? `EAN:${ean}` : null
          // Les montants Kaufland sont en centimes.
          const montant = (Number(u.revenue_gross ?? u.price) || 0) / 100
          const meme = sku ? vente.lignes.find((l) => l.sku === sku) : undefined
          if (meme) {
            meme.quantite += 1
            meme.montant += montant
          } else {
            vente.lignes.push({ externalLineId: String(u.id_order_unit), sku, titre: u.product?.title ?? '', quantite: 1, montant })
          }
        }
        if (unites.length < 100) break
      }
      return [...parCommande.values()]
    },
    async transmettreSuivi(orderId, numero, transporteur) {
      // Le suivi part par unité : on relit celles de la commande.
      const r = (await (await appelerKaufland(creds, 'GET', `/order-units/?storefront=${pays}&id_order=${encodeURIComponent(orderId)}&limit=100`)).json()) as { data?: UniteKaufland[] }
      for (const u of r.data ?? []) {
        if (u.status && u.status !== 'need_to_be_sent') continue
        await appelerKaufland(creds, 'PATCH', `/order-units/${u.id_order_unit}/send`, { carrier_code: transporteur || 'OTHER', tracking_numbers: numero })
      }
    },
    motif: texteErreur,
  }
}

// ------------------------------------------------------------------ WooCommerce

interface CommandeWoo {
  id: number
  number?: string
  status?: string
  currency?: string
  date_created_gmt?: string
  billing?: { first_name?: string; last_name?: string; email?: string; phone?: string }
  shipping?: { first_name?: string; last_name?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; country?: string; phone?: string }
  line_items?: Array<{ id: number; name?: string; sku?: string; quantity?: number; total?: string }>
}

/**
 * WooCommerce : « processing » est l'état d'une commande PAYÉE et pas encore
 * expédiée ; « completed » clôt la commande. WooCommerce n'a pas de champ de
 * suivi natif : le numéro part en note client (l'acheteur la reçoit par e-mail)
 * puis la commande passe « completed ».
 */
export function canalWoo(creds: WooCredentials): Canal {
  return {
    platform: 'WOOCOMMERCE',
    async relever(depuis) {
      const ventes: VenteCapturee[] = []
      for (let page = 1; page <= 5; page++) {
        const r = await appelerWoo(creds, 'GET', `/orders?status=processing&after=${encodeURIComponent(depuis.toISOString())}&per_page=100&page=${page}`)
        if (!r.ok) throw new Error(`WooCommerce a répondu ${r.status} à la lecture des commandes.`)
        const commandes = (await r.json()) as CommandeWoo[]
        for (const c of commandes) {
          const a = c.shipping?.address_1 ? c.shipping : { ...c.shipping, ...c.billing }
          const nom = [c.shipping?.first_name || c.billing?.first_name, c.shipping?.last_name || c.billing?.last_name].filter(Boolean).join(' ') || 'Acheteur'
          ventes.push({
            platform: 'WOOCOMMERCE',
            externalOrderId: String(c.id),
            numero: c.number || String(c.id),
            creeLe: new Date(c.date_created_gmt ? `${c.date_created_gmt}Z` : Date.now()),
            devise: c.currency || 'EUR',
            acheteur: {
              nom,
              email: c.billing?.email ?? null,
              adresse: {
                name: nom,
                address1: c.shipping?.address_1 || undefined,
                address2: c.shipping?.address_2 || undefined,
                city: c.shipping?.city || undefined,
                zip: c.shipping?.postcode || undefined,
                province: c.shipping?.state || undefined,
                countryCode: c.shipping?.country && c.shipping.country.length === 2 ? c.shipping.country : undefined,
                phone: (a as { phone?: string }).phone || c.billing?.phone || undefined,
              },
            },
            lignes: (c.line_items ?? []).map((l) => ({ externalLineId: String(l.id), sku: l.sku || null, titre: l.name ?? '', quantite: l.quantity ?? 1, montant: Number(l.total) || 0 })),
          })
        }
        if (commandes.length < 100) break
      }
      return ventes
    },
    async transmettreSuivi(orderId, numero, transporteur) {
      const id = encodeURIComponent(orderId)
      const note = await appelerWoo(creds, 'POST', `/orders/${id}/notes`, { note: `Colis expédié${transporteur ? ` par ${transporteur}` : ''} — numéro de suivi : ${numero}`, customer_note: true })
      if (!note.ok) throw new Error(`WooCommerce a refusé la note de suivi (${note.status}).`)
      const fin = await appelerWoo(creds, 'PUT', `/orders/${id}`, { status: 'completed' })
      if (!fin.ok) throw new Error(`WooCommerce a refusé de clore la commande (${fin.status}).`)
    },
    motif: (err) => (err instanceof BoutiqueRefus ? err.message : texteErreur(err)),
  }
}

// ------------------------------------------------------------------ Magento

interface CommandeMagento {
  entity_id: number
  increment_id?: string
  created_at?: string
  order_currency_code?: string
  customer_email?: string
  customer_firstname?: string
  customer_lastname?: string
  items?: Array<{ item_id: number; sku?: string; name?: string; qty_ordered?: number; row_total?: number; parent_item_id?: number | null }>
  extension_attributes?: { shipping_assignments?: Array<{ shipping?: { address?: { firstname?: string; lastname?: string; street?: string[]; city?: string; region?: string; postcode?: string; country_id?: string; telephone?: string } } }> }
}

/**
 * Magento : « processing » est une commande payée (facturée) et pas expédiée.
 * Les lignes filles d'un produit configurable (`parent_item_id`) sont écartées :
 * le prix et la quantité vivent sur la ligne mère. Le suivi part avec la
 * livraison (`/order/{id}/ship`), qui clôt la commande.
 */
export function canalMagento(creds: MagentoCredentials): Canal {
  return {
    platform: 'MAGENTO',
    async relever(depuis) {
      const ventes: VenteCapturee[] = []
      for (let page = 1; page <= 5; page++) {
        const filtre = (i: number, champ: string, valeur: string, cond: string) =>
          `searchCriteria[filter_groups][${i}][filters][0][field]=${champ}&searchCriteria[filter_groups][${i}][filters][0][value]=${encodeURIComponent(valeur)}&searchCriteria[filter_groups][${i}][filters][0][condition_type]=${cond}`
        const r = await appelerMagento(
          creds,
          'GET',
          `/orders?${filtre(0, 'status', 'processing', 'eq')}&${filtre(1, 'created_at', depuis.toISOString().replace('T', ' ').slice(0, 19), 'gteq')}&searchCriteria[pageSize]=100&searchCriteria[currentPage]=${page}`,
        )
        if (!r.ok) throw new Error(`Magento a répondu ${r.status} à la lecture des commandes.`)
        const commandes = ((await r.json()) as { items?: CommandeMagento[] }).items ?? []
        for (const c of commandes) {
          const a = c.extension_attributes?.shipping_assignments?.[0]?.shipping?.address ?? {}
          const nom = [a.firstname ?? c.customer_firstname, a.lastname ?? c.customer_lastname].filter(Boolean).join(' ') || 'Acheteur'
          ventes.push({
            platform: 'MAGENTO',
            externalOrderId: String(c.entity_id),
            numero: c.increment_id || String(c.entity_id),
            creeLe: new Date(c.created_at ? `${c.created_at.replace(' ', 'T')}Z` : Date.now()),
            devise: c.order_currency_code || 'EUR',
            acheteur: {
              nom,
              email: c.customer_email ?? null,
              adresse: {
                name: nom,
                address1: a.street?.[0],
                address2: a.street?.[1],
                city: a.city,
                zip: a.postcode,
                province: a.region,
                countryCode: a.country_id && a.country_id.length === 2 ? a.country_id : undefined,
                phone: a.telephone,
              },
            },
            lignes: (c.items ?? [])
              .filter((l) => !l.parent_item_id)
              .map((l) => ({ externalLineId: String(l.item_id), sku: l.sku ?? null, titre: l.name ?? '', quantite: l.qty_ordered ?? 1, montant: Number(l.row_total) || 0 })),
          })
        }
        if (commandes.length < 100) break
      }
      return ventes
    },
    async transmettreSuivi(orderId, numero, transporteur) {
      const r = await appelerMagento(creds, 'POST', `/order/${encodeURIComponent(orderId)}/ship`, {
        notify: true,
        tracks: [{ track_number: numero, title: transporteur || 'Transporteur', carrier_code: 'custom' }],
      })
      if (!r.ok) throw new Error(`Magento a refusé la livraison (${r.status}) : ${(await r.text().catch(() => '')).slice(0, 200)}`)
    },
    motif: (err) => (err instanceof BoutiqueRefus ? err.message : texteErreur(err)),
  }
}

// ------------------------------------------------------------------ Tournée

/** Le canal d'une liaison, ou null si la plateforme ne remonte pas (encore) ses ventes. */
export async function canalPour(lien: PlatformCredential): Promise<Canal | null> {
  if (lien.platform === 'SHOPIFY') {
    const creds =
      (await jetonOfflineValide(lien.data, async (data) => {
        await prisma.platformCredential.update({ where: { id: lien.id }, data: { data } })
      })) ?? (await resoudreCredentialsShopify(lien.data))
    return creds ? canalShopify((q, v) => graphql(creds, q, v)) : null
  }
  if (lien.platform === 'EBAY') {
    const creds = readEbayCredentials(lien.data)
    return creds ? canalEbay(creds) : null
  }
  if (lien.platform === 'MAGENTO') {
    const creds = readMagentoCredentials(lien.data)
    return creds ? canalMagento(creds) : null
  }
  if (lien.platform === 'WOOCOMMERCE') {
    const creds = readWooCredentials(lien.data)
    return creds ? canalWoo(creds) : null
  }
  if (lien.platform === 'KAUFLAND') {
    const creds = readKauflandCredentials(lien.data)
    return creds ? canalKaufland(creds) : null
  }
  if (estMirakl(lien.platform)) {
    const creds = readMiraklCredentials(lien.data)
    return creds ? canalMirakl(lien.platform, creds) : null
  }
  return null
}

/**
 * La tournée : toutes les liaisons actives d'un canal qui remonte ses ventes.
 * `perimetre` borne la tournée à des comptes précis — la production ne le
 * passe JAMAIS, un banc TOUJOURS (leçon AUTO-MODE du 05/09/2026).
 */
export async function tourneeVentes(perimetre?: string[]): Promise<void> {
  const liens = await prisma.platformCredential.findMany({
    where: { platform: { in: VENTES_CAPTEES }, connected: true, ...(perimetre ? { userId: { in: perimetre } } : {}) },
  })
  for (const lien of liens) {
    try {
      const canal = await canalPour(lien)
      if (!canal) continue
      const r = await passage(lien.userId, canal)
      await noterReleve(lien.id, r)
      if (r.erreur) console.warn(`ventes ${lien.platform} ${lien.userId} : ${r.erreur}`)
      else if (r.bilan && (r.bilan.creees || r.suivis)) console.log(`ventes ${lien.platform} ${lien.userId} : ${r.bilan.creees} vente(s), ${r.suivis} suivi(s) transmis`)
    } catch (err) {
      console.error('tournée des ventes', lien.platform, lien.userId, err)
    }
  }
}

/** Écrit l'état de la relève sur la liaison, pour l'écran du vendeur. */
export async function noterReleve(credentialId: string, r: ResultatPassage): Promise<void> {
  const bilan: Prisma.InputJsonValue | undefined = r.bilan
    ? { lues: r.bilan.lues, creees: r.bilan.creees, deja: r.bilan.deja, suivis: r.suivis, signal: r.signal, sansProduit: r.bilan.sansProduit.slice(0, 20) }
    : undefined
  await prisma.platformCredential.update({
    where: { id: credentialId },
    data: { ventesReleveesAt: new Date(), ventesErreur: r.erreur, ...(bilan ? { ventesBilan: bilan } : {}) },
  })
}
