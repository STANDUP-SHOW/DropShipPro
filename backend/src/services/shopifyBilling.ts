/**
 * La facturation par Shopify — les recharges de drops achetées DANS l'admin.
 *
 * **Pourquoi ce fichier existe.** Exigence 1.2.1 de l'App Store, texte exact :
 * « Apps that use off-platform billing cannot be distributed through the
 * Shopify App Store. Your app must use Shopify App Pricing or the Shopify
 * Billing API for any app charges. » Un marchand venu de l'App Store ne peut
 * donc pas être envoyé chez Stripe : il achète ses drops chez Shopify, qui
 * encaisse, et nous créditons. Le site garde Stripe pour tout le monde
 * ailleurs — les deux chemins finissent dans le même `Payment` et le même
 * relevé, avec la même idempotence.
 *
 * **Un achat unique par pack**, pas un abonnement : la grille est la même que
 * sur le site (`PACKS_DROPS`), et `appPurchaseOneTimeCreate` est exactement
 * « une somme, une fois, à confirmer par le marchand ». Shopify rend une
 * `confirmationUrl` ; le marchand y approuve ; Shopify le renvoie sur notre
 * `returnUrl`. **Et c'est là qu'on confirme, jamais avant** : le piège Stripe
 * du mémo (return_url sans confirmation = argent encaissé, crédits jamais
 * versés) vaut mot pour mot ici.
 *
 * **La vérité vient de Shopify, pas de l'adresse de retour.** Le retour peut
 * se perdre (onglet fermé, réseau), ou être forgé (ce n'est qu'une URL). On ne
 * crédite donc jamais « parce que le marchand est revenu » : on demande à
 * Shopify la liste des achats de l'installation, on garde ceux en `ACTIVE`
 * dont le nom porte un pack à nous, et on crédite ceux qui ne l'ont pas encore
 * été. Cette régularisation tourne au retour ET à chaque ouverture de la page
 * intégrée — un achat au retour perdu est crédité à la visite suivante.
 *
 * **Le pack est écrit dans le nom de l'achat** (« … [drops-1000] ») : c'est la
 * seule chose que Shopify nous rend d'un achat, et elle suffit à savoir quoi
 * créditer sans table de correspondance chez nous.
 *
 * Rien ici ne touche la base : l'appel GraphQL et la persistance sont
 * injectés, pour que le banc (`check-shopify-billing.ts`) écrive le contrat
 * en dur et éprouve l'idempotence sans compte jetable.
 */
import type { AppelGraphQL } from './shopifyApp.js'
import { PACKS_DROPS, type PackDrops } from './tarifs.js'

/** Ce que Shopify rend d'un achat, et rien de plus. */
export interface AchatShopify {
  id: string
  name: string
  status: string
}

const MARQUE_PACK = /\[(drops-\d+)\]\s*$/

/** Le nom affiché au marchand sur la page d'approbation et sur sa facture Shopify. */
export function nomAchat(pack: PackDrops): string {
  return `DropShipper IA — ${pack.drops.toLocaleString('fr-FR')} drops [${pack.id}]`
}

/** Retrouve le pack d'après le nom rendu par Shopify — ou null si ce n'est pas un achat à nous. */
export function packDuNom(nom: string): PackDrops | null {
  const m = MARQUE_PACK.exec(nom ?? '')
  if (!m) return null
  return PACKS_DROPS.find((p) => p.id === m[1]) ?? null
}

/** Le prix tel que MoneyInput l'attend : une chaîne décimale, deux chiffres, jamais un flottant. */
export function prixShopify(pack: PackDrops): string {
  return `${Math.floor(pack.amount / 100)}.${String(pack.amount % 100).padStart(2, '0')}`
}

export const CREER_ACHAT = /* GraphQL */ `
  mutation dropshipperAcheterDrops($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
      confirmationUrl
      appPurchaseOneTime { id status }
      userErrors { field message }
    }
  }
`

export const ACHATS_DE_L_INSTALLATION = /* GraphQL */ `
  query dropshipperAchats {
    currentAppInstallation {
      oneTimePurchases(first: 50, reverse: true) {
        nodes { id name status }
      }
    }
  }
`

export const PLAN_BOUTIQUE = /* GraphQL */ `
  query dropshipperPlan { shop { plan { partnerDevelopment } } }
`

export class AchatRefuse extends Error {}

/**
 * Ouvre un achat chez Shopify et rend l'adresse où le marchand l'approuve.
 *
 * `test` est décidé par l'appelant : vrai sur une boutique de développement
 * (Shopify refuse d'y encaisser pour de vrai) ou quand `SHOPIFY_BILLING_TEST`
 * est posé — jamais déduit ici, pour que le banc le voie passer tel quel.
 */
export async function creerAchatDrops(
  appeler: AppelGraphQL,
  creds: { shopDomain: string; accessToken: string },
  packId: string,
  returnUrl: string,
  test: boolean,
): Promise<{ confirmationUrl: string; achatId: string; pack: PackDrops }> {
  const pack = PACKS_DROPS.find((p) => p.id === packId)
  if (!pack) throw new AchatRefuse('Recharge inconnue.')

  const reponse = (await appeler(creds, CREER_ACHAT, {
    name: nomAchat(pack),
    price: { amount: prixShopify(pack), currencyCode: 'EUR' },
    returnUrl,
    test,
  })) as {
    appPurchaseOneTimeCreate?: {
      confirmationUrl?: string | null
      appPurchaseOneTime?: { id?: string; status?: string } | null
      userErrors?: Array<{ message?: string }>
    }
  }

  const bloc = reponse?.appPurchaseOneTimeCreate
  const erreurs = (bloc?.userErrors ?? []).map((e) => e.message).filter(Boolean)
  if (erreurs.length) throw new AchatRefuse(`Shopify refuse l'achat : ${erreurs.join(' ; ')}`)
  if (!bloc?.confirmationUrl || !bloc.appPurchaseOneTime?.id) {
    throw new AchatRefuse("Shopify n'a pas rendu de page d'approbation.")
  }
  return { confirmationUrl: bloc.confirmationUrl, achatId: bloc.appPurchaseOneTime.id, pack }
}

/** Vrai si la boutique est une boutique de développement — où seul un achat `test` passe. */
export async function boutiqueDeDeveloppement(
  appeler: AppelGraphQL,
  creds: { shopDomain: string; accessToken: string },
): Promise<boolean> {
  const r = (await appeler(creds, PLAN_BOUTIQUE, {})) as { shop?: { plan?: { partnerDevelopment?: boolean } } }
  return r?.shop?.plan?.partnerDevelopment === true
}

/**
 * Régularise les achats approuvés chez Shopify et pas encore crédités chez nous.
 *
 * `dejaCredites` rend, parmi des identifiants d'achat, ceux qui ont déjà un
 * paiement chez nous ; `crediter` verse un pack pour un identifiant et rend
 * faux s'il l'était déjà (course entre le retour et la page intégrée — la clé
 * unique du paiement tranche, pas nous). Rend ce qui vient d'être crédité.
 */
export async function regulariserAchats(
  appeler: AppelGraphQL,
  creds: { shopDomain: string; accessToken: string },
  dejaCredites: (ids: string[]) => Promise<Set<string>>,
  crediter: (achatId: string, pack: PackDrops) => Promise<boolean>,
): Promise<Array<{ achatId: string; pack: PackDrops }>> {
  const r = (await appeler(creds, ACHATS_DE_L_INSTALLATION, {})) as {
    currentAppInstallation?: { oneTimePurchases?: { nodes?: AchatShopify[] } }
  }
  const actifs = (r?.currentAppInstallation?.oneTimePurchases?.nodes ?? [])
    .filter((a) => a && a.status === 'ACTIVE' && typeof a.id === 'string')
    .map((a) => ({ id: a.id, pack: packDuNom(a.name) }))
    .filter((a): a is { id: string; pack: PackDrops } => a.pack !== null)

  if (!actifs.length) return []
  const connus = await dejaCredites(actifs.map((a) => a.id))

  const credites: Array<{ achatId: string; pack: PackDrops }> = []
  for (const a of actifs) {
    if (connus.has(a.id)) continue
    if (await crediter(a.id, a.pack)) credites.push({ achatId: a.id, pack: a.pack })
  }
  return credites
}
