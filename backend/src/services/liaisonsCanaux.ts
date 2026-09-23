/**
 * La voie de liaison de CHAQUE canal de l'annuaire — les 314, pas les 45.
 *
 * Demandé par Max le 23/09/2026 : « quand nous allons démarrer, nous devrons
 * avoir branché ou donné la solution pour que l'utilisateur puisse se brancher
 * à son canal ». Jusque-là l'annuaire ne portait qu'un nom, un logo et une
 * famille ; « 45 branchés » était le seul chiffre vrai, et il l'est resté des
 * semaines parce que personne n'avait défini ce que « branché » voulait dire
 * pour un comparateur, une régie ou une place de marché sans API.
 *
 * Il n'existe que cinq voies, et chaque canal en a une :
 *
 *   api        DropShipper publie directement (connecteur écrit). Branché, ou
 *              « compte requis » quand le connecteur attend les identifiants
 *              d'un compte vendeur validé.
 *   flux       Le canal vient lire une adresse de catalogue, que le vendeur
 *              colle une fois dans son espace. C'est la voie des comparateurs,
 *              de l'affiliation, des régies — et de la majorité des places de
 *              marché : les 314 logos de cet annuaire viennent d'un gestionnaire
 *              de flux, qui les sert TOUS ainsi. Nous servons déjà le format
 *              Google Shopping (`feed/google.xml`), lingua franca du secteur,
 *              et le CSV Meta.
 *   export     Un fichier CSV à déposer dans le back-office vendeur, pour les
 *              canaux qui n'acceptent pas d'adresse (Faire) ou en plus du flux.
 *   extension  Pas d'API, pas de flux : l'extension remplit le formulaire, le
 *              vendeur valide. Vinted, Leboncoin, Facebook Marketplace, Temu…
 *   aucune     Ce n'est pas un canal de vente (outil d'avis, d'analyse, de
 *              données) ou il n'existe plus. Dit tel quel, jamais « bientôt ».
 *
 * `etat` dit ce qu'on sait : `branche` (ça marche, vérifié en production),
 * `compte-requis` (connecteur écrit, il manque le compte vendeur), `verifie`
 * (la voie a été lue dans la documentation du canal), `famille` (la voie de
 * sa famille, non lue canal par canal — et l'écran le dit). Rien n'est promis
 * qu'on n'ait lu : un canal `famille` qui exigerait son propre gabarit de
 * fichier se demande d'un clic, et rejoint la table des vérifiés.
 *
 * Banc : `check-liaisons-canaux.ts` — toute clé pointe un canal réel, tout
 * canal a une voie, toute voie `aucune` a sa raison.
 */
import { CANAUX, type CanalAnnuaire, type TypeCanal } from './channelDirectory.js'
import { fluxPour, type FluxCanal } from './channelFeeds.js'
import type { Platform } from '@prisma/client'
import { PLATFORMS } from './platforms.js'

export type Voie = 'api' | 'flux' | 'export' | 'extension' | 'aucune'
export type EtatLiaison = 'branche' | 'compte-requis' | 'verifie' | 'famille'

export interface Liaison {
  voie: Voie
  etat: EtatLiaison
  /** Ce que le vendeur fait, en deux phrases. */
  comment: string
  /** La destination de `platforms.ts` qui la porte, quand il y en a une. */
  plateforme?: Platform
  /** Le flux à coller, pour la voie `flux`. */
  flux?: { format: FluxCanal['format']; ou: string } | null
  /** La documentation ou l'espace vendeur du canal, quand on l'a lue. */
  doc?: string
}

/**
 * Les destinations de `platforms.ts` et leur canal dans l'annuaire, quand les
 * libellés ne coïncident pas (« Fnac Marketplace » / « Fnac », « Galeria
 * Inno » / deux logos). Le rapprochement par libellé fait le reste.
 */
const PLATEFORME_VERS_CANAL: Partial<Record<Platform, string[]>> = {
  BRICOMARCHE: ['bricomarche'],
  GALERIA_INNO: ['galeria_logo', 'inno'],
  IBS: ['ibs'],
  LAPOSTE: ['laposte'],
  LEROY_MERLIN: ['leroymerlin'],
  MAISONS_DU_MONDE: ['maisonsdumonde'],
  PHONEHOUSE: ['phonehouse'],
  SECRETSALES: ['secretsales'],
  FNAC: ['fnac', 'darty'],
  TEMU: ['temu_logo-svg'],
}

/** Le canal → sa destination, par la table puis par le libellé. */
function plateformeDe(canal: CanalAnnuaire): (typeof PLATFORMS)[number] | undefined {
  for (const p of PLATFORMS) {
    if (PLATEFORME_VERS_CANAL[p.id]?.includes(canal.id)) return p
  }
  return PLATFORMS.find((p) => p.label.toLowerCase() === canal.label.toLowerCase())
}

const OU_MARCHE = "Ouvrez votre compte vendeur sur la place de marché, puis collez l'adresse de votre flux Google Shopping dans son import de catalogue (« flux », « feed » ou « import produits »). Elle relit l'adresse à son rythme."
const OU_OUTIL = "Collez l'adresse de votre flux dans le paramétrage de l'outil : c'est votre catalogue qu'il lit."

/**
 * Les canaux lus un par un. Clés = identifiants réels de l'annuaire (le banc
 * le vérifie). On n'y écrit que ce qu'on a lu.
 */
const VERIFIES: Record<string, Omit<Liaison, 'flux'> & { flux?: 'google' | 'meta' | null }> = {
  // --- Places de marché à API propre, connecteur écrit, compte vendeur à saisir
  // (voir platforms.ts : api-ready). Le rapprochement par libellé les pose en
  // `api` / `compte-requis` ; rien à écrire ici.

  // --- Places de marché qui exigent leur propre programme, sans API ni flux ouverts
  'temu_logo-svg': {
    voie: 'extension',
    etat: 'verifie',
    comment: "Temu ouvre un Seller Center sur candidature et n'expose ni API publique ni import de flux : l'extension remplit la fiche dans votre Seller Center, vous validez.",
    doc: 'https://seller.temu.com',
  },
  'shein-logo': {
    voie: 'extension',
    etat: 'verifie',
    comment: "Shein recrute ses vendeurs sur candidature (Shein Marketplace) et ne publie pas d'API ouverte : l'extension remplit la fiche dans votre espace vendeur, vous validez.",
    doc: 'https://www.sheinmarketplace.com',
  },

  // --- Places de marché à flux ou fichier, lus dans leur documentation
  fruugo: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Fruugo ingère un flux produit par adresse (CSV ou XML) et accepte le format Google Shopping tel quel : collez l'adresse dans votre compte vendeur Fruugo.",
    doc: 'https://sell.fruugo.com',
  },
  'refurbed-new': {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Refurbed (reconditionné) relit un flux produit par adresse depuis votre espace vendeur ; réservé aux produits reconditionnés avec grade et garantie.",
    doc: 'https://www.refurbed.fr/vendre',
  },
  backmarket_logo: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Back Market (reconditionné) importe un catalogue par fichier ou par adresse depuis le Back Office vendeur, après validation du compte.",
    doc: 'https://backmarket.fr/fr-fr/seller',
  },
  rakuten: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Rakuten France importe le catalogue d'un vendeur professionnel par fichier ou par adresse de flux, depuis l'espace marchand ; son API sert ensuite aux commandes.",
    doc: 'https://fr.shopping.rakuten.com/pro',
  },
  manomano: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "ManoMano intègre les catalogues par flux (adresse relue) ou par fichier depuis l'espace vendeur Toolbox, avec sa propre grille d'attributs bricolage — le flux Google Shopping couvre les champs communs.",
    doc: 'https://toolbox.manomano.com',
  },
  manomanopro: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: 'Même espace vendeur et même import de flux que ManoMano, pour les professionnels du bâtiment.',
    doc: 'https://toolbox.manomano.com',
  },
  zalando: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Zalando (programme Partner / zDirect) accepte un catalogue par flux depuis son Partner Portal, sur candidature de marque ; mode et chaussures seulement.",
    doc: 'https://partnerprogram.zalando.com',
  },
  otto_logo: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "OTTO Market (Allemagne) prend son catalogue par fichier ou par flux depuis le portail partenaire, en allemand, avec numéro de TVA allemand ou représentant fiscal.",
    doc: 'https://www.otto.market',
  },
  'bol-logo': {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Bol.com (Pays-Bas, Belgique) importe le catalogue par fichier depuis son espace vendeur ; l'EAN est obligatoire sur chaque produit.",
    doc: 'https://partnerplatform.bol.com',
  },
  wayfair: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Wayfair (Partner Home) intègre les catalogues fournisseurs par fichier ou par flux, sur candidature ; maison et mobilier, avec dimensions et poids obligatoires.",
    doc: 'https://partners.wayfair.com',
  },
  'wmt-marketplace-wordmark-stacked-rgb': {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Walmart Marketplace (États-Unis) importe le catalogue par fichier depuis le Seller Center, sur candidature d'entreprise ; expédition vers les États-Unis exigée.",
    doc: 'https://marketplace.walmart.com',
  },
  'joom-logo-new': {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Joom importe le catalogue par fichier ou par adresse depuis son espace marchand, après validation du compte.",
    doc: 'https://www.joom.com/merchants',
  },
  shopee: {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Shopee (Asie du Sud-Est, Brésil) ouvre un Seller Centre par pays avec import de produits par fichier ; entreprise locale ou programme vendeur international requis.",
    doc: 'https://seller.shopee.com',
  },
  'lazada-1': {
    voie: 'flux',
    etat: 'verifie',
    flux: 'google',
    comment: "Lazada (Asie du Sud-Est) importe le catalogue par fichier depuis le Seller Center ; programme LazGlobal pour les vendeurs étrangers.",
    doc: 'https://sellercenter.lazada.com',
  },
  zentrada: {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Zentrada est une place de marché de GROS entre professionnels : on y achète, on n'y dépose pas d'annonces au détail. Elle figure chez nous comme fournisseur.",
  },
  'veepeegroup': {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Veepee organise des ventes événementielles : ses acheteurs sélectionnent des marques et négocient des lots. Il n'y a pas d'espace vendeur ouvert ni de catalogue à déposer.",
  },
  'private_sport_shop': {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Private Sport Shop est un site de ventes privées : les marques sont sélectionnées par ses acheteurs, sans espace vendeur ouvert.",
  },
  limango: {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Limango (ventes privées, Allemagne) sélectionne ses marques : pas d'espace vendeur ouvert.",
  },
  bulevip: {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Bulevip (ventes privées, Espagne) sélectionne ses marques : pas d'espace vendeur ouvert.",
  },
  polyvore: {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Polyvore a fermé en 2018. Le logo reste dans l'annuaire pour qui le cherche ; il n'y a rien à relier.",
  },
  reebonz: {
    voie: 'aucune',
    etat: 'verifie',
    comment: "Reebonz (luxe d'occasion, Singapour) a cessé son activité. Rien à relier.",
  },

  // --- Outils : ce qui lit un catalogue, et ce qui n'en lit pas
  doofinder: { voie: 'flux', etat: 'verifie', flux: 'google', comment: "Doofinder (moteur de recherche interne) indexe votre catalogue depuis une adresse de flux, format Google Shopping accepté.", doc: 'https://www.doofinder.com' },
  'attraqt-navy-logo': { voie: 'flux', etat: 'verifie', flux: 'google', comment: 'Attraqt (recherche et merchandising) se nourrit de votre catalogue par flux.', doc: 'https://www.attraqt.com' },
  click2buy: { voie: 'flux', etat: 'verifie', flux: 'google', comment: "Click2buy (« où acheter » pour les marques) lit un flux produit et renvoie l'acheteur vers les revendeurs.", doc: 'https://click2buy.com' },
  commerceconnector: { voie: 'flux', etat: 'verifie', flux: 'google', comment: "Commerce Connector (« où acheter ») lit un flux produit et affiche vos revendeurs.", doc: 'https://www.commerce-connector.com' },
  nowinstore: { voie: 'flux', etat: 'verifie', flux: 'google', comment: 'Now in Store (« où acheter ») lit votre catalogue par flux.', doc: 'https://www.nowinstore.com' },
  solostocks: { voie: 'flux', etat: 'verifie', flux: 'google', comment: 'SoloStocks (place de marché B2B, Espagne) importe un catalogue par fichier ou par flux depuis son espace vendeur.', doc: 'https://www.solostocks.com' },
  catalogate: { voie: 'flux', etat: 'verifie', flux: 'google', comment: 'Catalogate publie des catalogues produit alimentés par flux.' },
  bazaarvoice: { voie: 'aucune', etat: 'verifie', comment: "Bazaarvoice recueille et diffuse des avis clients sur VOTRE site : ce n'est pas un canal de vente. Un flux produit lui sert seulement à rattacher les avis aux fiches." },
  netreviews: { voie: 'aucune', etat: 'verifie', comment: "Avis Vérifiés (Netreviews) collecte des avis après achat sur votre site : pas un canal de diffusion." },
  contentsquare: { voie: 'aucune', etat: 'verifie', comment: "Contentsquare analyse le comportement des visiteurs de votre site : aucun produit ne s'y dépose." },
  happytal_logo: { voie: 'aucune', etat: 'verifie', comment: "Happytal (services hospitaliers) n'est pas un canal de vente de produits." },
  icecat: { voie: 'aucune', etat: 'verifie', comment: "Icecat FOURNIT des fiches produit normalisées (données, photos) aux marchands : on y lit, on n'y dépose pas d'annonces." },
  perfectcorp: { voie: 'aucune', etat: 'verifie', comment: "Perfect Corp (essayage virtuel beauté) s'intègre à votre site : pas un canal de diffusion." },
  fitizzy: { voie: 'aucune', etat: 'verifie', comment: "Fitizzy (recommandation de taille) s'intègre à votre site : pas un canal de diffusion." },
  getflowbox: { voie: 'aucune', etat: 'verifie', comment: "Flowbox (contenu généré par les clients) s'intègre à votre site : pas un canal de diffusion." },
  socloz: { voie: 'aucune', etat: 'verifie', comment: "SoCloz (web-to-store, stocks magasin) équipe des enseignes physiques : pas un canal de diffusion pour un vendeur en ligne." },
  stockly: { voie: 'aucune', etat: 'verifie', comment: "Stockly connecte des marchands pour vendre le stock des autres, sur partenariat : pas de dépôt d'annonces." },
  spareka_logo: { voie: 'aucune', etat: 'verifie', comment: 'Spareka vend des pièces détachées et des diagnostics : un fournisseur possible, pas un canal de diffusion.' },
  neokasa: { voie: 'aucune', etat: 'verifie', comment: "Neokasa (Le Bon Coin de la friperie) est un marchand, pas une place de marché ouverte." },
  spycommerce: { voie: 'aucune', etat: 'verifie', comment: "SpyCommerce est un outil de veille concurrentielle : il lit les catalogues des autres, on ne lui en dépose pas." },
  thunderstone: { voie: 'aucune', etat: 'verifie', comment: 'Thunderstone est un moteur de recherche de site : pas un canal de diffusion.' },
  gearscore: { voie: 'aucune', etat: 'verifie', comment: 'Gearscore compare des produits high-tech à partir de données éditoriales : pas de dépôt marchand.' },
  cartageous: { voie: 'aucune', etat: 'verifie', comment: "Cartageous (récupération de paniers abandonnés) s'intègre à votre site : pas un canal de diffusion." },
  catchys: { voie: 'aucune', etat: 'verifie', comment: "Catchys (recommandation produit sur site) s'intègre à votre site : pas un canal de diffusion." },
  reetags: { voie: 'aucune', etat: 'verifie', comment: "Reetags (étiquettes et QR codes) équipe le point de vente : pas un canal de diffusion." },
  sabdoo: { voie: 'aucune', etat: 'verifie', comment: "Sabdoo (jeux-concours) anime votre audience : pas un canal de diffusion." },
  clicktofournisseur: { voie: 'aucune', etat: 'verifie', comment: 'Un annuaire de fournisseurs : on y cherche, on n’y dépose pas de produits.' },
}

const FAMILLE: Record<TypeCanal, { voie: Voie; comment: string }> = {
  marketplace: {
    voie: 'flux',
    comment: `${OU_MARCHE} Si cette place de marché exige son propre gabarit de fichier, demandez-la d'un clic : nous l'ajoutons à nos formats.`,
  },
  comparateur: {
    voie: 'flux',
    comment: "Un comparateur ne vend pas : il relit votre catalogue et renvoie l'acheteur chez vous, contre un coût au clic. Collez l'adresse de votre flux Google Shopping dans votre espace marchand, à la ligne « flux produit ».",
  },
  affiliation: {
    voie: 'flux',
    comment: "La plateforme distribue votre catalogue à ses éditeurs, rémunérés à la vente. Collez l'adresse de votre flux Google Shopping dans votre espace annonceur, à « catalogue produit ».",
  },
  regie: {
    voie: 'flux',
    comment: "Les publicités dynamiques piochent dans un catalogue : collez l'adresse de votre flux dans le gestionnaire de catalogue de la régie (Merchant Center, Commerce Manager, Ads Manager…).",
  },
  outil: {
    voie: 'flux',
    comment: OU_OUTIL,
  },
}

/** La voie de liaison d'un canal. Jamais nulle : chaque canal en a une. */
export function liaisonPour(canal: CanalAnnuaire): Liaison {
  const plateforme = plateformeDe(canal)
  const specifique = VERIFIES[canal.id]

  // Une destination écrite dans platforms.ts fait foi sur l'état réel.
  if (plateforme && !specifique) {
    if (plateforme.integration === 'live') {
      return {
        voie: 'api',
        etat: 'branche',
        plateforme: plateforme.id,
        comment: `Reliée : DropShipper IA publie directement sur ${plateforme.label} depuis « Diffuser », avec photos, prix, attributs et catégorie. ${plateforme.note ?? ''}`.trim(),
        doc: plateforme.sellUrl ?? undefined,
      }
    }
    if (plateforme.integration === 'api-ready') {
      return {
        voie: 'api',
        etat: 'compte-requis',
        plateforme: plateforme.id,
        comment: `Connecteur écrit : il publie dès que vous collez les identifiants de votre compte vendeur ${plateforme.label} dans Réglages. ${plateforme.note ?? ''}`.trim(),
        doc: plateforme.sellUrl ?? undefined,
      }
    }
    if (plateforme.integration === 'feed') {
      const flux = fluxPour(canal)
      return { voie: 'flux', etat: 'branche', plateforme: plateforme.id, comment: flux?.ou ?? FAMILLE[canal.type].comment, flux: flux ? { format: flux.format, ou: flux.ou } : { format: 'google', ou: OU_MARCHE }, doc: plateforme.sellUrl ?? undefined }
    }
    if (plateforme.integration === 'export') {
      return { voie: 'export', etat: 'branche', plateforme: plateforme.id, comment: `Téléchargez le fichier ${plateforme.label} depuis « Diffuser » et déposez-le dans votre espace vendeur.`, doc: plateforme.sellUrl ?? undefined }
    }
    if (plateforme.integration === 'extension') {
      return { voie: 'extension', etat: 'branche', plateforme: plateforme.id, comment: `Sans API : l'extension Chrome ouvre le formulaire de ${plateforme.label} et le remplit avec votre annonce ; vous relisez et cliquez sur « Publier ».`, doc: plateforme.sellUrl ?? undefined }
    }
  }

  if (specifique) {
    const { flux: format, ...reste } = specifique
    const lu = fluxPour(canal)
    return {
      ...reste,
      plateforme: plateforme?.id,
      flux: reste.voie === 'flux' ? { format: format ?? lu?.format ?? 'google', ou: lu?.ou ?? reste.comment } : null,
    }
  }

  // La voie de la famille : un flux, dont le format est celui que channelFeeds
  // connaît pour ce canal (exceptions vérifiées), sinon Google Shopping.
  const lu = fluxPour(canal)
  const famille = FAMILLE[canal.type]
  return {
    voie: famille.voie,
    etat: lu && canal.type !== 'marketplace' && canal.type !== 'outil' ? 'verifie' : 'famille',
    comment: lu?.ou ?? famille.comment,
    flux: { format: lu?.format ?? 'google', ou: lu?.ou ?? famille.comment },
  }
}

export interface ResumeLiaisons {
  total: number
  parVoie: Record<Voie, number>
  parEtat: Record<EtatLiaison, number>
}

export function resumeLiaisons(): ResumeLiaisons {
  const parVoie: Record<Voie, number> = { api: 0, flux: 0, export: 0, extension: 0, aucune: 0 }
  const parEtat: Record<EtatLiaison, number> = { branche: 0, 'compte-requis': 0, verifie: 0, famille: 0 }
  for (const c of CANAUX) {
    const l = liaisonPour(c)
    parVoie[l.voie]++
    parEtat[l.etat]++
  }
  return { total: CANAUX.length, parVoie, parEtat }
}

export const IDS_VERIFIES = Object.keys(VERIFIES)

export const LIBELLE_VOIE: Record<Voie, string> = {
  api: 'Publication directe',
  flux: 'Par votre flux',
  export: 'Fichier à déposer',
  extension: "Par l'extension",
  aucune: 'Pas un canal de vente',
}
