/**
 * Le lien de parrainage Shopify.
 *
 * Demandé le 15/09/2026 : « créer une boutique Shopify, qui emmène sur la page
 * Shopify en tant que partenaire — Zendrop le fait et la boutique est affiliée
 * ensuite ». C'est un revenu que nos concurrents encaissent et pas nous : un
 * vendeur qui ouvre une boutique Shopify va le faire de toute façon, autant
 * qu'il le fasse depuis chez nous.
 *
 * **L'identifiant vit dans une variable d'environnement, jamais en dur.** Vite
 * fige les `VITE_*` à la compilation : ajouter la variable sur Vercel exige donc
 * un redéploiement, et l'oublier ne casse rien — sans elle, le lien pointe vers
 * la page d'inscription ordinaire de Shopify. Le vendeur ouvre sa boutique, nous
 * ne touchons simplement pas la commission.
 *
 * Deux programmes existent chez Shopify et ils ne se règlent pas au même
 * endroit : l'**Affiliate Program** (un lien de parrainage `?ref=`) et le
 * **Partner Program** (une boutique de développement rattachée au compte
 * partenaire). Le premier suffit ici et c'est celui que la variable porte.
 */
const REFERENCE = import.meta.env.VITE_SHOPIFY_AFFILIATE_REF?.trim()

/** L'adresse d'inscription Shopify, parrainée quand la référence est posée. */
export const LIEN_SHOPIFY = REFERENCE
  ? `https://www.shopify.com/fr?ref=${encodeURIComponent(REFERENCE)}`
  : 'https://www.shopify.com/fr'

/** Vrai quand le parrainage est actif : l'écran peut alors le dire au vendeur. */
export const PARRAINAGE_ACTIF = Boolean(REFERENCE)

/**
 * Le vert de la charte Shopify.
 *
 * Celui du logo, pas une approximation : il sert à écrire le mot « Shopify » à
 * ses couleurs dans notre menu, comme le fait tout intégrateur partenaire.
 */
export const VERT_SHOPIFY = '#95BF47'
