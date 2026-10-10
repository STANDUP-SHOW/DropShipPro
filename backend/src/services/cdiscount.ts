import type { Product } from '@prisma/client'
import { enregistrerConnecteur, type ChampSaisi, type ConnecteurMarche, type DepotMarche } from './marchesApi.js'
import { identifiantCatalogue } from './mirakl.js'
import { cleControleValide } from './kaufland.js'

/**
 * Le connecteur Cdiscount — API vendeur Octopia (REST, OAuth 2.0
 * « client credentials »).
 *
 * ÉCRIT D'APRÈS DES EXTRAITS DE LA DOCUMENTATION PUBLIQUE OCTOPIA
 * (developer.octopia-io.net, lue par recherche le 08/10/2026 : le site n'était
 * pas joignable directement), JAMAIS EXÉCUTÉ CONTRE LE VRAI CDISCOUNT. Ce qui
 * est sourcé : le jeton (Keycloak, royaume `maas`, client credentials), l'hôte
 * `api.octopia-io.net/seller/v2`, les en-têtes `SellerId` et `SalesChannelId`,
 * le dépôt par « paquets » d'offres (type Upsert, 100 offres par envoi au plus,
 * état WaitingForCompletion puis Ready, traitement en différé jusqu'à
 * Integrated ou Rejected), `sellerExternalReference` comme ancre de l'offre.
 * Ce qui est DÉDUIT et à confirmer au premier essai : la forme exacte du corps
 * d'une offre (`price.salePrice`, `quantity`) et le passage du paquet à Ready
 * (PATCH de son `status`). Le banc (check-cdiscount.ts) écrit ce contrat en
 * dur : il prouve la mécanique, pas la réalité.
 *
 * Pourquoi pas de redirection : Octopia n'a pas d'écran « Autoriser
 * DropShipper ». Le vendeur crée ses identifiants API dans son portail
 * (Paramètres › Identifiants API), ou délègue l'accès à un intégrateur dont il
 * connaît le Client ID. Deux voies, donc :
 *   - CDISCOUNT_CLIENT_ID / CDISCOUNT_CLIENT_SECRET posés dans Railway : nous
 *     sommes l'intégrateur, le vendeur nous délègue l'accès puis colle son
 *     seul Seller ID ;
 *   - sinon le vendeur colle son Seller ID, son Client ID et son Client Secret.
 * Dans les deux cas, rien n'est dit relié avant un appel réel réussi.
 *
 * Ce qu'on dépose : une OFFRE sur une fiche Cdiscount existante, retrouvée par
 * EAN — comme Amazon, Kaufland et les opérateurs Mirakl. Créer une fiche
 * produit chez Cdiscount passe par une intégration de catalogue à part, avec
 * la catégorie et les caractéristiques de leur référentiel : pas écrit ici, et
 * sans EAN la publication le dit au lieu d'échouer en silence.
 *
 * Variables d'essai : CDISCOUNT_AUTH_URL, CDISCOUNT_API_URL (banc, bac à
 * sable), CDISCOUNT_CANAL (défaut CDISFR, le canal Cdiscount France).
 */

export interface CdiscountCreds {
  sellerId: string
  /** Absents quand nous sommes l'intégrateur délégué (clés Railway). */
  clientId?: string
  clientSecret?: string
}

export class CdiscountRefus extends Error {
  constructor(
    message: string,
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'CdiscountRefus'
  }
}

const sansBarre = (u: string) => u.replace(/\/+$/, '')
export function hoteAuth(): string {
  return sansBarre(process.env.CDISCOUNT_AUTH_URL?.trim() || 'https://auth.octopia-io.net')
}
export function hoteApi(): string {
  return sansBarre(process.env.CDISCOUNT_API_URL?.trim() || 'https://api.octopia-io.net/seller/v2')
}
const canal = () => process.env.CDISCOUNT_CANAL?.trim() || 'CDISFR'

/** Vrai quand DropShipper est déclaré comme intégrateur chez Octopia. */
function integrateur(): { id: string; secret: string } | null {
  const id = process.env.CDISCOUNT_CLIENT_ID?.trim()
  const secret = process.env.CDISCOUNT_CLIENT_SECRET?.trim()
  return id && secret ? { id, secret } : null
}

export function readCdiscountCreds(data: unknown): CdiscountCreds | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const lire = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '')
  const sellerId = lire('sellerId')
  if (!sellerId) return null
  const clientId = lire('clientId')
  const clientSecret = lire('clientSecret')
  // Sans identifiants propres, la liaison repose sur nos clés d'intégrateur.
  if (!(clientId && clientSecret) && !integrateur()) return null
  return clientId && clientSecret ? { sellerId, clientId, clientSecret } : { sellerId }
}

/* Un jeton par client, gardé jusqu'à son échéance : Octopia en donne pour quelques minutes à deux heures. */
const jetons = new Map<string, { jeton: string; fin: number }>()

async function jeton(creds: CdiscountCreds): Promise<string> {
  const client = creds.clientId && creds.clientSecret ? { id: creds.clientId, secret: creds.clientSecret } : integrateur()
  if (!client) throw new CdiscountRefus('Identifiants Cdiscount incomplets : reliez à nouveau le compte.', true)
  const connu = jetons.get(client.id)
  if (connu && connu.fin - Date.now() > 30_000) return connu.jeton

  const res = await fetch(`${hoteAuth()}/auth/realms/maas/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: client.id, client_secret: client.secret }),
  })
  if (!res.ok) {
    throw new CdiscountRefus(
      res.status === 400 || res.status === 401
        ? `Cdiscount refuse ces identifiants API (${res.status}) : vérifiez le Client ID et le Client Secret créés dans votre portail vendeur (Paramètres › Identifiants API).`
        : `Le service d'authentification Cdiscount ne répond pas comme prévu (${res.status}).`,
      true,
    )
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) throw new CdiscountRefus("Cdiscount a répondu sans jeton d'accès.", true)
  jetons.set(client.id, { jeton: j.access_token, fin: Date.now() + (Number(j.expires_in) || 300) * 1000 })
  return j.access_token
}

async function appel(creds: CdiscountCreds, methode: 'GET' | 'POST' | 'PATCH', chemin: string, corps?: unknown) {
  const res = await fetch(`${hoteApi()}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${await jeton(creds)}`,
      SellerId: creds.sellerId,
      SalesChannelId: canal(),
      Accept: 'application/json',
      'Accept-Language': 'fr-FR',
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await res.text().catch(() => '')
  let json: any = null
  try {
    json = texte ? JSON.parse(texte) : null
  } catch {
    json = null
  }
  if (res.status === 401) throw new CdiscountRefus('Cdiscount refuse le jeton (401) : reliez à nouveau votre compte Cdiscount.', true)
  if (res.status === 403) {
    throw new CdiscountRefus(
      `Cdiscount refuse l'accès au vendeur ${creds.sellerId} (403) : ce Seller ID n'est pas rattaché à ces identifiants API. ${integrateur() && !creds.clientId ? "Déléguez l'accès à DropShipper dans votre portail vendeur, puis réessayez." : 'Vérifiez le Seller ID affiché dans Paramètres de votre portail.'}`,
      true,
    )
  }
  if (res.status === 429) throw new CdiscountRefus('Cdiscount limite le débit (429) : patientez une minute puis réessayez.', false)
  if (res.status >= 400) {
    const detail = json?.detail || json?.title || json?.message || texte.slice(0, 300)
    throw new CdiscountRefus(`Refus Cdiscount (${res.status})${detail ? ` — ${detail}` : ''}`, res.status >= 500)
  }
  return json
}

/** Le prix de vente, deux décimales, en euros : Cdiscount France vend en euros. */
export function prixCdiscount(produit: Product): number {
  return Math.round(Number(produit.sellingPrice ?? 0) * 100) / 100
}

/** Le corps d'une offre Upsert — déduit de la doc, voir l'en-tête du fichier. */
export function offreCdiscount(produit: Product, ean: string) {
  return {
    sellerExternalReference: produit.id,
    gtin: ean,
    condition: 'New',
    price: { salePrice: prixCdiscount(produit) },
    quantity: Math.max(1, Number(produit.supplierStock ?? 10) || 10),
  }
}

async function deposerCdiscount(creds: CdiscountCreds, produit: Product): Promise<DepotMarche> {
  const ean = identifiantCatalogue(produit)
  if (!ean) {
    throw new CdiscountRefus(
      "Cdiscount n'accepte ici qu'une offre sur une fiche existante, retrouvée par son EAN : renseignez le code-barres du produit dans ses caractéristiques. La création d'une fiche neuve se fait depuis votre portail vendeur.",
      false,
    )
  }
  if (!cleControleValide(ean.id)) {
    throw new CdiscountRefus(`L'EAN « ${ean.id} » a une clé de contrôle fausse : Cdiscount grefferait l'offre sur un autre produit. Corrigez-le.`, false)
  }
  if (prixCdiscount(produit) <= 0) throw new CdiscountRefus("L'annonce n'a pas de prix de vente : Cdiscount en exige un.", false)

  // 1. Un paquet d'offres, pour le canal Cdiscount France.
  const paquet = await appel(creds, 'POST', '/offer-packages', { packageType: 'Upsert' })
  const id = paquet?.packageId ?? paquet?.id
  if (!id) throw new CdiscountRefus("Cdiscount n'a pas ouvert de paquet d'offres (réponse sans identifiant).", false)

  // 2. L'offre, puis le paquet déclaré complet : Cdiscount le traite en différé.
  await appel(creds, 'POST', `/offer-packages/${encodeURIComponent(id)}/offer-requests`, [offreCdiscount(produit, ean.id)])
  await appel(creds, 'PATCH', `/offer-packages/${encodeURIComponent(id)}`, { status: 'Ready' })

  return {
    note: `Offre déposée sur la fiche Cdiscount de l'EAN ${ean.id}, au prix de ${prixCdiscount(produit).toFixed(2)} € (paquet ${id}). Cdiscount la traite en différé : elle apparaît dans votre portail sous quelques heures, ou y est refusée avec son motif. Les frais de port sont ceux de votre compte vendeur.`,
    url: null,
  }
}

export const cdiscount: ConnecteurMarche<CdiscountCreds> = {
  platform: 'CDISCOUNT',
  label: 'Cdiscount',
  // Rien d'obligatoire côté Railway : le vendeur peut coller ses propres identifiants API.
  appConfiguree: () => true,
  manque: () => '',

  saisie(): ChampSaisi[] {
    const champs: ChampSaisi[] = [{ cle: 'sellerId', libelle: 'Seller ID', indice: 'Paramètres de votre portail vendeur, ex. 98979' }]
    if (!integrateur()) {
      champs.push(
        { cle: 'clientId', libelle: 'Client ID', indice: 'Paramètres › Identifiants API' },
        { cle: 'clientSecret', libelle: 'Client Secret', indice: 'Affiché une seule fois à la création', secret: true },
      )
    }
    return champs
  },

  async finaliser(params) {
    const creds = readCdiscountCreds(params)
    if (!creds) throw new CdiscountRefus('Renseignez le Seller ID, le Client ID et le Client Secret de votre portail vendeur Cdiscount.', true)
    return { data: { ...creds }, label: `Vendeur ${creds.sellerId}` }
  },

  lire: readCdiscountCreds,

  async verifier(creds) {
    // Lire ses paquets d'offres : sans effet, et refusé si le Seller ID n'est pas rattaché au client.
    await appel(creds, 'GET', '/offer-packages?pageSize=1')
  },

  deposer: (creds, produit) => deposerCdiscount(creds, produit),
}

enregistrerConnecteur(cdiscount)
