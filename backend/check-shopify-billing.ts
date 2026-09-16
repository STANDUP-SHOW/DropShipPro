import {
  ACHATS_DE_L_INSTALLATION,
  AchatRefuse,
  CREER_ACHAT,
  creerAchatDrops,
  nomAchat,
  packDuNom,
  prixShopify,
  regulariserAchats,
} from './src/services/shopifyBilling.js'
import type { AppelGraphQL } from './src/services/shopifyApp.js'
import { PACKS_DROPS } from './src/services/tarifs.js'

/**
 * Éprouve les recharges de drops facturées par Shopify.
 *
 * **Le contrat est écrit EN DUR** (leçon Kaufland) : le faux Shopify vérifie
 * les variables de la mutation telles que la Billing API les attend — prix en
 * chaîne décimale à deux chiffres, devise, adresse de retour, drapeau test —
 * et rend les formes documentées. La régularisation est éprouvée sur ce qui
 * compte : ne créditer QUE les achats `ACTIVE` qui sont à nous et pas encore
 * crédités, et ne jamais créditer deux fois.
 */
let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const creds = { shopDomain: 'ma-boutique.myshopify.com', accessToken: 'shpat_banc' }
const appels: Array<{ query: string; variables: Record<string, unknown> }> = []

const fauxShopify: AppelGraphQL = async (c, query, variables) => {
  exige(c.shopDomain === creds.shopDomain && c.accessToken === creds.accessToken, 'le faux serveur reçoit les identifiants de la boutique')
  appels.push({ query, variables })

  if (query === CREER_ACHAT) {
    const price = variables.price as { amount?: unknown; currencyCode?: unknown }
    // Ce que MoneyInput accepte : une chaîne décimale, pas un nombre.
    if (typeof price?.amount !== 'string' || !/^\d+\.\d{2}$/.test(price.amount) || price.currencyCode !== 'EUR') {
      return { appPurchaseOneTimeCreate: { userErrors: [{ field: ['price'], message: 'Price is invalid' }] } }
    }
    if (typeof variables.returnUrl !== 'string' || !/^https:\/\//.test(variables.returnUrl)) {
      return { appPurchaseOneTimeCreate: { userErrors: [{ field: ['returnUrl'], message: 'Return url is invalid' }] } }
    }
    if (typeof variables.test !== 'boolean') {
      return { appPurchaseOneTimeCreate: { userErrors: [{ field: ['test'], message: 'Test must be a boolean' }] } }
    }
    return {
      appPurchaseOneTimeCreate: {
        confirmationUrl: 'https://ma-boutique.myshopify.com/admin/charges/1/confirm',
        appPurchaseOneTime: { id: 'gid://shopify/AppPurchaseOneTime/1', status: 'PENDING' },
        userErrors: [],
      },
    }
  }

  if (query === ACHATS_DE_L_INSTALLATION) {
    return {
      currentAppInstallation: {
        oneTimePurchases: {
          nodes: [
            { id: 'gid://shopify/AppPurchaseOneTime/A', name: nomAchat(PACKS_DROPS[1]), status: 'ACTIVE' },
            { id: 'gid://shopify/AppPurchaseOneTime/B', name: nomAchat(PACKS_DROPS[0]), status: 'PENDING' },
            { id: 'gid://shopify/AppPurchaseOneTime/C', name: 'Un autre achat sans rapport', status: 'ACTIVE' },
            { id: 'gid://shopify/AppPurchaseOneTime/D', name: nomAchat(PACKS_DROPS[2]), status: 'ACTIVE' },
            { id: 'gid://shopify/AppPurchaseOneTime/E', name: nomAchat(PACKS_DROPS[0]), status: 'DECLINED' },
            { id: 'gid://shopify/AppPurchaseOneTime/F', name: 'DropShipper IA — 9 drops [drops-9]', status: 'ACTIVE' },
          ],
        },
      },
    }
  }
  throw new Error(`requête inattendue : ${query.slice(0, 60)}`)
}

// ── 1. Le nom porte le pack, et se relit ─────────────────────────────────────

for (const pack of PACKS_DROPS) {
  exige(packDuNom(nomAchat(pack))?.id === pack.id, `le nom d'achat du pack ${pack.id} se relit`)
}
exige(packDuNom('Recharge [drops-1000] et suite') === null, 'la marque du pack doit être en FIN de nom')
exige(packDuNom('DropShipper IA — 9 drops [drops-9]') === null, 'un pack inconnu dans le nom rend null')

// ── 2. Le prix, en chaîne décimale ──────────────────────────────────────────

exige(prixShopify({ id: 'x', amount: 500, drops: 500 }) === '5.00', `5,00 € → "5.00", vu ${prixShopify({ id: 'x', amount: 500, drops: 500 })}`)
exige(prixShopify({ id: 'x', amount: 4500, drops: 5000 }) === '45.00', '45,00 € → "45.00"')
exige(prixShopify({ id: 'x', amount: 1005, drops: 1 }) === '10.05', 'les centimes gardent leur zéro')

// ── 3. Ouvrir un achat ──────────────────────────────────────────────────────

const achat = await creerAchatDrops(fauxShopify, creds, 'drops-1000', 'https://api.exemple.test/api/shopify/billing/retour?shop=ma-boutique.myshopify.com', true)
exige(achat.confirmationUrl.startsWith('https://ma-boutique.myshopify.com/admin/charges/'), "l'adresse d'approbation de Shopify est rendue")
exige(achat.achatId === 'gid://shopify/AppPurchaseOneTime/1', "l'identifiant de l'achat est rendu")
exige(achat.pack.id === 'drops-1000', 'le pack ouvert est celui demandé')
const v = appels[appels.length - 1].variables
exige(v.test === true, 'le drapeau test passe tel quel')
exige((v.price as { amount: string }).amount === '10.00', 'le prix du pack de 1 000 drops est 10.00')
exige(String(v.name).endsWith('[drops-1000]'), "le nom de l'achat porte le pack")

let refus: unknown = null
await creerAchatDrops(fauxShopify, creds, 'drops-999', 'https://api.exemple.test/r', false).catch((e: unknown) => {
  refus = e
})
exige(refus instanceof AchatRefuse, 'un pack inconnu est refusé avant tout appel')

// ── 4. Régulariser : seulement ACTIVE, seulement à nous, seulement une fois ──

const credites: string[] = []
const dejaCredites = async (ids: string[]) => new Set(ids.filter((id) => id.endsWith('/D')))
const crediter = async (achatId: string) => {
  credites.push(achatId)
  return true
}

const resultat = await regulariserAchats(fauxShopify, creds, dejaCredites, crediter)
exige(credites.length === 1 && credites[0] === 'gid://shopify/AppPurchaseOneTime/A', `seul A est crédité, vus : ${credites.join(', ')}`)
exige(resultat.length === 1 && resultat[0].pack.drops === PACKS_DROPS[1].drops, 'le pack crédité est rendu avec ses drops')

// Le crédit refusé par la base (course) ne compte pas comme crédité.
const rien = await regulariserAchats(fauxShopify, creds, async () => new Set(), async () => false)
exige(rien.length === 0, 'un crédit refusé par la clé unique ne remonte pas comme crédité')

// Deux appels de suite : le second ne trouve plus rien à créditer.
const deuxieme = await regulariserAchats(fauxShopify, creds, async (ids) => new Set(ids), crediter)
exige(deuxieme.length === 0 && credites.length === 1, 'une seconde régularisation ne crédite rien')

console.log(echecs === 0 ? 'Facturation Shopify : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
