import { createHmac } from 'node:crypto'
import type { Product } from '@prisma/client'
import { identifiantCatalogue } from './mirakl.js'

/**
 * Le connecteur Kaufland — la Seller API, signée requête par requête.
 *
 * Kaufland Global Marketplace ouvre sept pays d'une seule inscription, et sa
 * Seller API est du vrai self-service : le vendeur génère une Client Key
 * (32 caractères) et une Secret Key (64) dans les réglages API de son
 * portail, rien d'autre. Doc : sellerapi.kaufland.com.
 *
 * Le contrat, lu dans la doc officielle le 04/09/2026 :
 * — chaque requête est signée HMAC-SHA256 **en hexadécimal** sur
 *   `MÉTHODE\nURI complète\ncorps\ntimestamp`, portée par les en-têtes
 *   Shop-Client-Key / Shop-Timestamp / Shop-Signature (tolérance ±5 min) ;
 * — l'offre se crée par `POST /units/` : **prix en centimes** (entier),
 *   fiche retrouvée par EAN ;
 * — un POST répond **201 avec un corps vide**, l'identifiant est dans
 *   l'en-tête `Location` (/units/<id>/).
 *
 * Même modèle de catalogue que Mirakl : l'offre se greffe sur une fiche
 * existante retrouvée par le code-barres. **Sans EAN, rien à greffer** — le
 * refus est posé avant l'appel, avec le geste à faire. Et un EAN à la clé de
 * contrôle fausse est refusé aussi : greffer une offre sur la mauvaise fiche
 * fait suspendre des comptes, mieux vaut un refus lisible chez nous.
 *
 * **Jamais confronté au vrai Kaufland.** Le banc l'éprouve contre un faux
 * serveur qui recalcule la signature de son côté — la leçon d'AliExpress.
 */

export interface KauflandCredentials {
  clientKey: string
  secretKey: string
  /** Le pays de vente : de, fr, it, pl, at, cz, sk. La France par défaut. */
  storefront: string
  /** Surchargée pour le banc ; l'API réelle par défaut. */
  baseUrl?: string
}

const API_KAUFLAND = 'https://sellerapi.kaufland.com/v2'

export function readKauflandCredentials(data: unknown): KauflandCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const clientKey = texte(raw.clientKey)
  const secretKey = texte(raw.secretKey)
  if (!clientKey || !secretKey) return null
  return {
    clientKey,
    secretKey,
    storefront: texte(raw.storefront) || 'fr',
    baseUrl: texte(raw.baseUrl) || undefined,
  }
}

export class KauflandRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand c'est la liaison (clés, signature), pas cette annonce-là. */
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'KauflandRefus'
  }
}

/** La signature du contrat : HMAC-SHA256 hex sur méthode, URI, corps, instant. */
export function signatureKaufland(
  methode: string,
  uri: string,
  corps: string,
  timestamp: number,
  secretKey: string,
): string {
  return createHmac('sha256', secretKey)
    .update([methode.toUpperCase(), uri, corps, String(timestamp)].join('\n'))
    .digest('hex')
}

async function appeler(
  creds: KauflandCredentials,
  methode: string,
  chemin: string,
  corps?: unknown,
): Promise<Response> {
  const uri = `${creds.baseUrl ?? API_KAUFLAND}${chemin}`
  const texte = corps === undefined ? '' : JSON.stringify(corps)
  const timestamp = Math.floor(Date.now() / 1000)

  const reponse = await fetch(uri, {
    method: methode,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DropShipperIA',
      'Shop-Client-Key': creds.clientKey,
      'Shop-Timestamp': String(timestamp),
      'Shop-Signature': signatureKaufland(methode, uri, texte, timestamp, creds.secretKey),
      ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corps === undefined ? undefined : texte,
  })

  if (reponse.status === 401 || reponse.status === 403) {
    throw new KauflandRefus(
      'Clés Kaufland refusées : vérifiez la Client Key (32 caractères) et la Secret Key (64) dans votre portail vendeur, réglages API. Une clé régénérée là-bas invalide l’ancienne.',
      true,
    )
  }
  if (!reponse.ok && reponse.status !== 201) {
    const detail = (await reponse.text().catch(() => '')).slice(0, 300)
    throw new KauflandRefus(`Refus Kaufland (${reponse.status})${detail ? ` — ${detail}` : ''}`, reponse.status >= 500)
  }
  return reponse
}

/** La clé de contrôle GS1 : un EAN qui la rate greffe l'offre sur la mauvaise fiche. */
export function cleControleValide(chiffres: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(chiffres)) return false
  const tab = chiffres.split('').map(Number)
  const controle = tab.pop()!
  const somme = tab.reverse().reduce((s, c, i) => s + c * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (somme % 10)) % 10 === controle
}

export interface DepotKaufland {
  uniteId: string | null
  note: string
}

/**
 * Dépose l'offre : la fiche est retrouvée par EAN, le prix part en centimes.
 */
export async function deposerOffreKaufland(creds: KauflandCredentials, produit: Product): Promise<DepotKaufland> {
  const identifiant = identifiantCatalogue(produit)
  if (!identifiant) {
    throw new KauflandRefus(
      "Kaufland apparie chaque offre à sa fiche catalogue par le code-barres : ajoutez l'EAN du produit dans ses caractéristiques (champ « EAN »), ou choisissez une destination sans ce prérequis — eBay, votre site, Shopify.",
      false,
    )
  }
  if (!cleControleValide(identifiant.id)) {
    throw new KauflandRefus(
      `L'EAN « ${identifiant.id} » a une clé de contrôle fausse : ce n'est pas un code GS1 valide. Un EAN erroné grefferait votre offre sur la fiche d'un autre produit — corrigez-le dans les caractéristiques.`,
      false,
    )
  }

  const reponse = await appeler(creds, 'POST', `/units/?storefront=${encodeURIComponent(creds.storefront)}`, {
    ean: identifiant.id,
    condition: 'new',
    listing_price: Math.round(Number(produit.sellingPrice ?? 0) * 100),
    amount: produit.supplierStock ?? 10,
    delivery_time_min: 3,
    delivery_time_max: 8,
    location: 'FR',
  })

  // 201, corps vide : l'identifiant de l'unité est dans l'en-tête Location.
  const location = reponse.headers.get('location') ?? ''
  const uniteId = location.match(/\/units\/(\d+)/)?.[1] ?? null
  return {
    uniteId,
    note: uniteId
      ? `Offre déposée (unité ${uniteId}). Elle se greffe sur la fiche catalogue de l'EAN ${identifiant.id} : si aucune fiche n'existe pour ce code, Kaufland la met en attente côté vendeur.`
      : "Offre acceptée par Kaufland (201). L'unité paraît dans votre portail vendeur.",
  }
}

/** Vérifie les clés d'un coup : une lecture d'une unité suffit. */
export async function verifierCompteKaufland(creds: KauflandCredentials): Promise<void> {
  await appeler(creds, 'GET', `/units/?limit=1&storefront=${encodeURIComponent(creds.storefront)}`)
}
