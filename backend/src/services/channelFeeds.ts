import { CANAUX, type CanalAnnuaire, type TypeCanal } from './channelDirectory.js'

/**
 * Les canaux qu'un flux produit suffit à nourrir — et lequel leur donner.
 *
 * **Le constat du 03/09/2026, et il change l'ordre des priorités.** L'annuaire
 * compte 314 marques, dont 187 places de marché. Chacune de ces 187 demande son
 * propre connecteur : une journée et demie chacune avant même d'écrire l'appel
 * d'API. Le vendeur voyait donc « 300 plateformes », et deux qui publient.
 *
 * Mais **65 comparateurs et 16 plateformes d'affiliation ne veulent pas
 * d'API** : ils veulent une adresse à relire chaque nuit. Et nous servons déjà
 * les deux formats qu'ils attendent — `feed/google.xml` (RSS 2.0 avec l'espace
 * de noms `g:`) et `feed/meta.csv`. Quatre-vingt-une destinations pour un
 * travail déjà fait aux trois quarts.
 *
 * Ce module ne prétend pas connaître les 81 une par une : il déclare la règle
 * par famille, avec les exceptions vérifiées. Un comparateur inconnu reçoit le
 * format Google Shopping, qui est la lingua franca du secteur — et si un jour
 * l'un d'eux veut autre chose, il rejoint la table des exceptions.
 */

export type FormatFlux = 'google' | 'meta'

export interface FluxCanal {
  format: FormatFlux
  /** Le chemin, relatif à la boutique : `/api/public/shops/<clé>/feed/…`. */
  fichier: string
  /** Ce que le vendeur doit en faire, dit en une phrase. */
  ou: string
}

const GOOGLE: Omit<FluxCanal, 'ou'> = { format: 'google', fichier: 'feed/google.xml' }
const META: Omit<FluxCanal, 'ou'> = { format: 'meta', fichier: 'feed/meta.csv' }

/**
 * Les familles qui vivent d'un flux, par nature.
 *
 * Un comparateur ne vend pas : il affiche et renvoie chez le marchand, donc il
 * lui faut un catalogue à relire, jamais une API de dépôt. Une plateforme
 * d'affiliation fait la même chose pour ses éditeurs. C'est structurel, pas une
 * liste à tenir à jour.
 */
const FAMILLES_A_FLUX: TypeCanal[] = ['comparateur', 'affiliation']

/**
 * Les exceptions vérifiées, par identifiant d'annuaire.
 *
 * On n'y met que ce qu'on a lu, jamais ce qu'on suppose. Et **les clés sont
 * les identifiants réels de `channelDirectory.ts`**, pas des noms plausibles :
 * la première version portait `facebook`, `google-ads`, `meta-ads` — aucun
 * n'existe dans l'annuaire, l'écran disait « pas encore reliée » sur des
 * canaux que nos flux servaient déjà, et le banc vérifiait les mêmes noms
 * fantômes, donc rien ne tombait. Le banc confronte désormais chaque clé à
 * l'annuaire.
 *
 * Les régies publicitaires ont leur place ici, et ce n'est pas un mélange
 * avec la passerelle sociale : la passerelle **publie** (des posts, au nom du
 * vendeur), le catalogue **nourrit** (les publicités dynamiques piochent
 * dedans). Meta Ads, Snapchat Ads et TikTok Ads se branchent tous sur un flux
 * produit — c'est leur mode normal, documenté chez chacun.
 */
const EXCEPTIONS: Record<string, Omit<FluxCanal, 'ou'>> = {
  // La famille Meta lit le CSV de catalogue : Instagram Shopping, la boutique
  // Facebook et les publicités dynamiques partagent le même fichier.
  instagram: META,
  facebookads: META,
  // Snapchat : catalogue en CSV aux mêmes colonnes que Meta, taxonomie
  // Google — lu dans les docs des outils de flux (le centre d'aide Snap ne se
  // rend pas côté serveur), concordantes entre quatre éditeurs.
  snapchat: META,
  // Google Merchant Center est la destination d'origine du format `g:`.
  googleshoppingads: GOOGLE,
  // TikTok Ads Manager avale un flux planifié par URL (CSV, XML RSS/Atom) et
  // importe tel quel un flux Google Merchant — doc officielle
  // ads.tiktok.com/help/article/create-manage-catalogs. La carte combinée
  // « Google, Instagram & TikTok Ads » est donc servie par le flux Google.
  'ads-google-instagram-tiktok': GOOGLE,
  // Pinterest : son catalogue accepte le même flux que Google Shopping.
  pinterest: GOOGLE,
}

/** Exporté pour le banc : chaque clé doit exister dans l'annuaire. */
export const IDS_EXCEPTIONS_FLUX = Object.keys(EXCEPTIONS)

/**
 * Le flux qui nourrit ce canal, ou `null` quand il lui faut un vrai connecteur.
 */
export function fluxPour(canal: CanalAnnuaire): FluxCanal | null {
  const choisi = EXCEPTIONS[canal.id] ?? (FAMILLES_A_FLUX.includes(canal.type) ? GOOGLE : null)
  if (!choisi) return null

  const ou =
    canal.type === 'affiliation'
      ? "Collez l'adresse dans votre espace annonceur, à l'endroit où la plateforme demande votre catalogue produit."
      : canal.type === 'comparateur'
        ? "Collez l'adresse dans votre espace marchand, à la ligne « flux produit » ou « catalogue »."
        : canal.type === 'regie'
        ? "Collez l'adresse dans le gestionnaire de catalogue de la régie (Commerce Manager chez Meta, Snap Business Manager, TikTok Ads Manager) : ses publicités dynamiques piochent dedans."
        : "Collez l'adresse dans le gestionnaire de catalogue de la plateforme."

  return { ...choisi, ou }
}

/** Combien de canaux de l'annuaire un simple flux suffirait à servir. */
export function canauxAFlux(): CanalAnnuaire[] {
  return CANAUX.filter((c) => fluxPour(c) !== null)
}

/**
 * Les deux formats, décrits pour l'écran.
 *
 * Le libellé dit **qui** les lit, pas leur syntaxe : un vendeur ne choisit pas
 * entre « RSS 2.0 » et « CSV », il choisit entre « Google et les comparateurs »
 * et « Facebook et Instagram ».
 */
export const FORMATS_FLUX: Array<{ id: FormatFlux; fichier: string; label: string; aide: string }> = [
  {
    id: 'google',
    fichier: 'feed/google.xml',
    label: 'Google Shopping et les comparateurs',
    aide: "Le format que Google Merchant Center a imposé et que presque tous les comparateurs et plateformes d'affiliation acceptent tel quel.",
  },
  {
    id: 'meta',
    fichier: 'feed/meta.csv',
    label: 'Facebook, Instagram et Pinterest',
    aide: 'Le catalogue au format CSV, celui que lisent la boutique Facebook, Instagram Shopping et les publicités dynamiques.',
  },
]
