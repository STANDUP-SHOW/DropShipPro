import type { Platform, Product } from '@prisma/client'

/**
 * Le connecteur Mirakl — un pour cinq destinations.
 *
 * La Redoute, E.Leclerc, BHV Marais, Kiabi et BrandAlley font tourner leur
 * place de marché sur Mirakl. Même API, mêmes chemins, mêmes en-têtes : seules
 * l'adresse de l'opérateur et la clé changent. Cinq destinations pour un seul
 * travail — le meilleur rapport de toute la liste.
 *
 * **Ce qui est vérifié, et ce qui ne l'est pas.** Les chemins et l'en-tête
 * viennent de la spécification publique de Mirakl, lue le 03/09/2026 :
 *
 * — `GET  /api/account`               : l'identité de la boutique
 * — `POST /api/offers/imports`        : le dépôt d'offres, en multipart
 * — `GET  /api/offers/imports/{id}`   : le suivi de ce dépôt
 * — `Authorization: <clé>`            : **la clé brute, sans « Bearer »**
 *
 * Les colonnes obligatoires d'une offre sont également documentées : `sku`,
 * `product-id`, `product-id-type`, `price`, `quantity`, `state` et le délai
 * d'expédition. Mais **chaque opérateur publie son propre gabarit** et peut
 * exiger des colonnes de plus. Elles vivent donc à un seul endroit,
 * `colonnesOffre()`, corrigeable sans toucher au reste.
 *
 * **Jamais confronté à un vrai Mirakl** : il faut pour cela un compte vendeur
 * validé chez l'un des cinq. Le banc l'éprouve contre un faux serveur, ce qui
 * couvre les erreurs de notre côté et rien de ce que l'opérateur pourrait
 * refuser. C'est dit dans l'interface plutôt que passé sous silence.
 */

export interface MiraklCredentials {
  /** L'adresse de l'opérateur, telle que son back-office vendeur l'affiche. */
  baseUrl: string
  apiKey: string
  /** L'identifiant de boutique, quand l'opérateur en impose un. */
  shopId?: string
}

/**
 * L'adresse n'est pas devinée, elle est demandée.
 *
 * Les opérateurs n'ont pas tous un `<nom>.mirakl.net` : certains servent leur
 * API depuis leur propre domaine. Coder cinq adresses de mémoire produirait
 * cinq connecteurs qui échouent en 404 sans qu'on sache pourquoi. Le vendeur la
 * lit dans son back-office, où elle est écrite.
 */
export function normaliserBaseUrl(brut: string): string | null {
  const texte = brut.trim().replace(/\/+$/, '')
  if (!texte) return null
  const avecSchema = /^https?:\/\//i.test(texte) ? texte : `https://${texte}`
  try {
    const url = new URL(avecSchema)
    if (!/^https?:$/.test(url.protocol)) return null
    // Le chemin `/api` est ajouté par les appels : le laisser ici le doublerait.
    return `${url.origin}${url.pathname.replace(/\/api\/?$/, '')}`.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function readMiraklCredentials(data: unknown): MiraklCredentials | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const baseUrl = typeof raw.baseUrl === 'string' ? normaliserBaseUrl(raw.baseUrl) : null
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  if (!baseUrl || !apiKey) return null
  const shopId = typeof raw.shopId === 'string' && raw.shopId.trim() ? raw.shopId.trim() : undefined
  return { baseUrl, apiKey, shopId }
}

/** Les cinq opérateurs qui tournent sur Mirakl, et rien d'autre. */
export const OPERATEURS_MIRAKL: Platform[] = [
  'LA_REDOUTE', 'LECLERC', 'BHV', 'KIABI', 'BRANDALLEY',
  // Les trente-six du recensement du 03/09/2026 — même API, même connecteur.
  'ALLTRICKS', 'AUCHAN', 'BOULANGER', 'BRICOMARCHE', 'BUT', 'CARREFOUR', 'CONRAD', 'CREAVEA', 'CULTURA', 'EL_CORTE_INGLES', 'EPRICE', 'GALERIA_INNO', 'GALERIES_LAFAYETTE', 'GREENWEEZ', 'HOME24', 'HUDSONS_BAY', 'IBS', 'LAPOSTE', 'LDLC', 'LEROY_MERLIN', 'MAISONS_DU_MONDE', 'MANOR', 'MEDIAMARKT', 'METRO', 'NATURE_DECOUVERTES', 'PCCOMPONENTES', 'PHONEHOUSE', 'PLACE_DES_TENDANCES', 'RETIF', 'SECRETSALES', 'SHOWROOMPRIVE', 'TRUFFAUT', 'TWIL', 'UBALDI', 'WORTEN', 'FNAC',
]

export function estMirakl(platform: Platform): boolean {
  return OPERATEURS_MIRAKL.includes(platform)
}

export class MiraklRefus extends Error {
  constructor(
    message: string,
    /** Vrai quand c'est la liaison qui est en cause, pas ce produit-là. */
    readonly liaison: boolean,
  ) {
    super(message)
    this.name = 'MiraklRefus'
  }
}

/**
 * Ce que dit un refus, traduit une fois pour toutes.
 *
 * La distinction qui compte n'est pas le code, c'est **qui doit agir** : une
 * clé refusée demande au vendeur d'aller la régénérer, un produit refusé lui
 * demande de corriger l'annonce. Les mélanger fait chercher au mauvais endroit.
 * Même leçon que le connecteur AliExpress, où un refus de liaison arrête tout
 * et un refus de produit n'arrête que celui-là.
 */
function refusDe(statut: number, corps: string): MiraklRefus {
  const extrait = corps.slice(0, 200).replace(/\s+/g, ' ').trim()
  if (statut === 401) {
    return new MiraklRefus(
      "Clé refusée par l'opérateur. Régénérez-la dans votre back-office Mirakl (Mon compte › Paramètres › API).",
      true,
    )
  }
  if (statut === 403) {
    return new MiraklRefus(
      "Clé valide mais sans les droits nécessaires : votre compte vendeur n'est peut-être pas encore activé par l'opérateur.",
      true,
    )
  }
  if (statut === 404) {
    return new MiraklRefus(
      "Adresse introuvable : vérifiez l'adresse de l'opérateur, elle se lit dans votre back-office vendeur.",
      true,
    )
  }
  if (statut === 429) {
    return new MiraklRefus('Trop de demandes : Mirakl accepte un dépôt par minute au maximum.', true)
  }
  return new MiraklRefus(`Refus de l'opérateur (${statut})${extrait ? ` — ${extrait}` : ''}`, statut >= 500)
}

async function appeler(creds: MiraklCredentials, chemin: string, init: RequestInit = {}) {
  const reponse = await fetch(`${creds.baseUrl}/api${chemin}`, {
    ...init,
    headers: {
      // La clé brute, sans « Bearer » : c'est ce que la spécification demande,
      // et le préfixe ajouté par habitude donne un 401 qu'on cherche longtemps.
      Authorization: creds.apiKey,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!reponse.ok) throw refusDe(reponse.status, await reponse.text().catch(() => ''))
  return reponse
}

/** L'identité de la boutique — le seul contrôle de liaison qui ne coûte rien. */
export async function verifierCompteMirakl(creds: MiraklCredentials): Promise<{ nom: string }> {
  const reponse = await appeler(creds, '/account')
  const corps = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  const nom =
    (typeof corps.shop_name === 'string' && corps.shop_name) ||
    (typeof corps.name === 'string' && corps.name) ||
    'Boutique reliée'
  return { nom }
}

/**
 * L'identifiant catalogue de l'annonce, et son type.
 *
 * **Le mur, et il vaut pour les cinq.** Mirakl n'accepte pas une fiche libre :
 * une offre se greffe sur un produit du catalogue de l'opérateur, retrouvé par
 * `product-id` et `product-id-type`. Sans identifiant reconnu, l'offre est
 * rejetée — exactement comme chez Kaufland, découvert le même jour.
 *
 * Cherché dans les attributs, que le vendeur édite déjà sur la fiche.
 */
export function identifiantCatalogue(produit: Product): { id: string; type: string } | null {
  const attributs =
    produit.attributes && typeof produit.attributes === 'object' && !Array.isArray(produit.attributes)
      ? (produit.attributes as Record<string, unknown>)
      : {}

  for (const [cle, valeur] of Object.entries(attributs)) {
    const propre = String(valeur ?? '').replace(/\s/g, '')
    if (/ean|gtin|barcode|code.?barres?/i.test(cle) && /^\d{8}$|^\d{12,14}$/.test(propre)) {
      return { id: propre, type: propre.length === 12 ? 'UPC' : 'EAN' }
    }
  }
  return null
}

/**
 * Les colonnes d'une offre, à un seul endroit.
 *
 * Les sept premières sont celles que Mirakl documente comme obligatoires. Un
 * opérateur peut en exiger d'autres — chacun publie son gabarit dans
 * « Prix et stock › Imports d'offres › Modèles de fichier ». Le jour où l'un
 * d'eux refuse pour une colonne manquante, elle s'ajoute ici, et les cinq en
 * profitent.
 */
export function colonnesOffre(): string[] {
  return [
    'sku',
    'product-id',
    'product-id-type',
    'price',
    'quantity',
    'state',
    'leadtime-to-ship',
    'description',
    'update-delete',
  ]
}

/** Un champ CSV, échappé selon la règle du format : guillemets doublés. */
function champ(valeur: unknown): string {
  const texte = String(valeur ?? '')
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

/**
 * L'offre au format que Mirakl relit.
 *
 * Point-virgule et non virgule : c'est le séparateur des gabarits Mirakl, et
 * une virgule couperait chaque prix français en deux colonnes.
 */
export function csvOffre(produit: Product, identifiant: { id: string; type: string }): string {
  const colonnes = colonnesOffre()
  const ligne = [
    produit.id,
    identifiant.id,
    identifiant.type,
    Number(produit.sellingPrice ?? 0).toFixed(2),
    // Le stock n'est pas suivi par l'application : un dropshipper ne stocke
    // rien. Une quantité franche vaut mieux qu'un zéro, qui masquerait l'offre.
    produit.supplierStock ?? 100,
    // `11` est l'état « neuf » du référentiel Mirakl.
    produit.condition === 'neuf' ? 11 : 6,
    // Jours avant expédition : la valeur prudente d'un envoi depuis l'étranger.
    5,
    produit.aiDescription || produit.description || '',
    'update',
  ]
  return `${colonnes.join(';')}\n${ligne.map(champ).join(';')}\n`
}

export interface DepotMirakl {
  importId: string
}

/**
 * Dépose l'offre chez l'opérateur.
 *
 * Multipart, parce que l'API attend un fichier — c'est un import, pas un appel
 * produit par produit. Le dépôt est asynchrone : la réponse rend un
 * identifiant, et l'opérateur relit le fichier de son côté.
 */
export async function deposerOffreMirakl(
  creds: MiraklCredentials,
  produit: Product,
): Promise<DepotMirakl> {
  const identifiant = identifiantCatalogue(produit)
  if (!identifiant) {
    /*
     * Refusé avant l'appel, et c'est volontaire.
     *
     * Envoyer une offre sans identifiant catalogue produit un import qui
     * s'enregistre, se met en file, et échoue une heure plus tard dans un
     * rapport que personne ne relit. Le vendeur croirait avoir publié.
     */
    throw new MiraklRefus(
      "Aucun EAN sur cette annonce. Mirakl rattache chaque offre à une fiche du catalogue de l'opérateur : ajoutez un attribut « EAN » à l'annonce.",
      false,
    )
  }

  const corps = new FormData()
  corps.append('file', new Blob([csvOffre(produit, identifiant)], { type: 'text/csv' }), 'offres.csv')
  if (creds.shopId) corps.append('shop_id', creds.shopId)

  const reponse = await appeler(creds, '/offers/imports', { method: 'POST', body: corps })
  const json = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  const importId = json.import_id ?? json.importId
  if (importId === undefined || importId === null) {
    throw new MiraklRefus("L'opérateur a accepté le fichier sans rendre d'identifiant de suivi.", false)
  }
  return { importId: String(importId) }
}

export interface EtatDepot {
  statut: string
  /** Vrai tant que l'opérateur n'a pas fini de relire le fichier. */
  enCours: boolean
  lignesEnErreur: number
}

/** Où en est le dépôt, quand on veut le savoir. */
export async function suivreDepotMirakl(creds: MiraklCredentials, importId: string): Promise<EtatDepot> {
  const reponse = await appeler(creds, `/offers/imports/${encodeURIComponent(importId)}`)
  const json = (await reponse.json().catch(() => ({}))) as Record<string, unknown>
  const statut = typeof json.import_status === 'string' ? json.import_status : 'INCONNU'
  const erreurs = Number(json.lines_in_error ?? json.offers_in_error ?? 0)
  return {
    statut,
    enCours: !/COMPLETE|FAILED|CANCELLED/i.test(statut),
    lignesEnErreur: Number.isFinite(erreurs) ? erreurs : 0,
  }
}
