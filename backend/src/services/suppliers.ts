/**
 * Les plateformes d'acquisition : là où le vendeur va chercher ses produits.
 *
 * Elles n'ont rien à voir avec les destinations de `platforms.ts`, où l'on
 * publie. Les mélanger dans une seule page était trompeur : on ne fait pas les
 * mêmes gestes, on n'y a pas les mêmes comptes, et une même marque peut être
 * les deux — on achète sur AliExpress, on vend sur eBay, et Etsy est les deux à
 * la fois. D'où deux annuaires distincts.
 *
 * Ce qui compte pour le vendeur, et qui est donc dit pour chacune : par où
 * l'import passe (l'extension ou l'adresse), qui expédie, et ce qui va le
 * surprendre — délais, douane, marges déjà écrasées.
 */

export type ImportPath =
  /** L'extension est obligatoire : la fiche est construite en JavaScript. */
  | 'extension'
  /** Coller l'adresse suffit : le serveur lit la page. */
  | 'url'
  /** Les deux marchent, l'extension reste plus complète. */
  | 'les-deux'

export interface SupplierInfo {
  id: string
  label: string
  /** Le domaine, qui sert aussi à retrouver le logo et à reconnaître une adresse. */
  domain: string
  /** Là d'où part la marchandise, dit franchement. */
  origine: string
  importPath: ImportPath
  /** Ce qu'on y trouve, en une phrase de vendeur.  */
  quoi: string
  /** Ce qui surprend, quand il y a de quoi surprendre. */
  attention?: string
  /** Vrai quand un adaptateur d'images lui est dédié dans l'extension. */
  adapte?: boolean
  color: string
  /** L'API officielle du fournisseur, quand il en publie une. */
  api?: SupplierApi
}

/**
 * Ce que l'API officielle d'un fournisseur permet, et ce qu'elle exige.
 *
 * C'est la voie que prennent les quatre plateformes étudiées — DSers passe par
 * l'API AliExpress, jamais par du scraping — et pour de bonnes raisons : les
 * données arrivent en temps réel, la fiche est complète du premier coup, et
 * personne ne se fait bannir. L'extension reste indispensable là où aucune API
 * n'existe ; elle ne doit plus être le seul chemin.
 *
 * Chaque capacité est déclarée séparément parce qu'elles ne viennent pas
 * ensemble : lire un catalogue est presque toujours accordé, passer une
 * commande demande un contrat de revendeur, et rares sont ceux qui remontent le
 * suivi du colis.
 */
export interface SupplierApi {
  /** Le nom que le fournisseur lui donne, tel qu'on le cherchera dans sa doc. */
  nom: string
  /** L'adresse de sa documentation ou de sa console développeur. */
  console: string
  /** Ce qu'il faut obtenir, et ce que ça implique comme démarche. */
  exige: string
  /** Lire le catalogue et les fiches produit. */
  lectureCatalogue: boolean
  /** Voir le stock et le prix en temps réel. */
  stockTempsReel: boolean
  /** Passer la commande chez le fournisseur depuis DropShipper. */
  commande: boolean
  /** Récupérer le numéro de suivi du colis. */
  suivi: boolean
  /** Les champs à saisir pour se relier, dans l'ordre. */
  champs: Array<{ cle: string; label: string; secret?: boolean }>
}

export const SUPPLIERS: SupplierInfo[] = [
  {
    id: 'aliexpress',
    label: 'AliExpress',
    domain: 'aliexpress.com',
    origine: 'Chine, quelques entrepôts européens',
    importPath: 'extension',
    quoi: "Le catalogue le plus large, et le point de départ de la plupart des vendeurs. Tout s'y trouve, le meilleur comme le pire.",
    attention:
      "Les délais annoncés comptent rarement le dédouanement. Vérifiez qu'un entrepôt européen existe pour le produit : c'est ce qui fait passer la livraison de trente jours à cinq.",
    adapte: true,
    color: '#ff4747',
    api: {
          "nom": "AliExpress Open Platform — Dropshipping API",
          "console": "https://openservice.aliexpress.com",
          "exige": "Un compte AliExpress Affiliate ou Dropshipping validé, puis une application créée sur l'Open Platform : App Key et App Secret, et une autorisation OAuth du compte.",
          "lectureCatalogue": true,
          "stockTempsReel": true,
          "commande": true,
          "suivi": true,
          "champs": [
                {
                      "cle": "appKey",
                      "label": "App Key"
                },
                {
                      "cle": "appSecret",
                      "label": "App Secret",
                      "secret": true
                },
                {
                      "cle": "trackingId",
                      "label": "Tracking ID d'affilié"
                }
          ]
    },
  },
  {
    id: 'temu',
    label: 'Temu',
    domain: 'temu.com',
    origine: 'Chine',
    importPath: 'extension',
    quoi: 'Les prix les plus bas du marché, sur des volumes énormes.',
    attention:
      "Les prix y sont si bas que le même produit se revend partout : la marge est souvent déjà morte quand vous arrivez. Regardez ce qu'en dit votre chef de rayon avant d'importer.",
    adapte: true,
    color: '#fb7701',
  },
  {
    id: 'dhgate',
    label: 'DHgate',
    domain: 'dhgate.com',
    origine: 'Chine',
    importPath: 'extension',
    quoi: "Vente en gros, avec des paliers de prix à la quantité. Intéressant dès qu'un produit part bien.",
    adapte: true,
    color: '#ff4400',
  },
  {
    id: 'banggood',
    label: 'Banggood',
    domain: 'banggood.com',
    origine: 'Chine, entrepôts en Europe',
    importPath: 'extension',
    quoi: 'High-tech, outillage, maison. Des entrepôts européens sur une partie du catalogue.',
    adapte: true,
    color: '#ff6600',
  },
  {
    id: 'cjdropshipping',
    label: 'CJ Dropshipping',
    domain: 'cjdropshipping.com',
    origine: 'Chine, entrepôts Europe et États-Unis',
    importPath: 'extension',
    quoi: "Fournisseur pensé pour le dropshipping : fiches propres, photos exploitables, expédition à votre nom.",
    adapte: true,
    color: '#1f8ceb',
    api: {
          "nom": "CJ Dropshipping Open API",
          "console": "https://developers.cjdropshipping.com",
          "exige": "Un compte CJ, puis une clé d'API générée depuis votre espace : elle donne accès au catalogue, au stock et aux commandes sans validation préalable.",
          "lectureCatalogue": true,
          "stockTempsReel": true,
          "commande": true,
          "suivi": true,
          "champs": [
                {
                      "cle": "email",
                      "label": "E-mail du compte CJ"
                },
                {
                      "cle": "apiKey",
                      "label": "Clé d'API",
                      "secret": true
                }
          ]
    },
  },
  {
    id: 'bigbuy',
    label: 'BigBuy',
    domain: 'bigbuy.eu',
    origine: 'Espagne',
    importPath: 'les-deux',
    quoi: "Grossiste européen : livraison en quelques jours, pas de douane, et des marques connues.",
    attention:
      "L'accès au catalogue et aux tarifs demande un abonnement. En contrepartie, les délais sont européens.",
    adapte: true,
    color: '#00a3e0',
    api: {
          "nom": "BigBuy REST API",
          "console": "https://api.bigbuy.eu/doc",
          "exige": "Un abonnement BigBuy actif. La clé se trouve dans votre espace client, section API.",
          "lectureCatalogue": true,
          "stockTempsReel": true,
          "commande": true,
          "suivi": true,
          "champs": [
                {
                      "cle": "apiKey",
                      "label": "Clé d'API",
                      "secret": true
                }
          ]
    },
  },
  {
    id: 'zentrada',
    label: 'Zentrada',
    domain: 'zentrada.com',
    origine: 'Europe',
    importPath: 'les-deux',
    quoi: 'Place de marché de grossistes européens, surtout maison, jouet et déco.',
    adapte: true,
    color: '#e30613',
  },
  {
    id: 'webdrop',
    label: 'Webdrop Market',
    domain: 'webdrop-market.com',
    origine: 'France',
    importPath: 'les-deux',
    quoi: "Grossiste français : expédition depuis la France, factures françaises, et le service après-vente dans votre langue.",
    adapte: true,
    color: '#0d6efd',
  },
  {
    id: 'etsy',
    label: 'Etsy',
    domain: 'etsy.com',
    origine: 'Créateurs indépendants, monde entier',
    importPath: 'les-deux',
    quoi: "Fait main, vintage, personnalisé. Une source d'idées plus qu'un grossiste.",
    attention:
      "Revendre un article Etsy est rarement viable : ce sont des pièces d'artisans, produites en petite série, au prix de détail.",
    adapte: true,
    color: '#f56400',
  },
  {
    id: 'alibaba',
    label: 'Alibaba',
    domain: 'alibaba.com',
    origine: 'Chine, usines',
    importPath: 'url',
    quoi: "L'échelon au-dessus : on y parle directement aux usines, en gros, avec des quantités minimales.",
    attention:
      "Ce n'est pas du dropshipping : il faut commander, stocker et importer vous-même, donc avancer la trésorerie et gérer la douane.",
    color: '#ff6a00',
  },
  {
    id: 'made-in-china',
    label: 'Made-in-China',
    domain: 'made-in-china.com',
    origine: 'Chine, usines',
    importPath: 'url',
    quoi: 'Annuaire d’usines, pour sourcer un produit précis ou le faire fabriquer à votre marque.',
    attention: "Mêmes contraintes qu'Alibaba : quantités minimales, stock et douane à votre charge.",
    color: '#d0021b',
  },
  {
    id: 'spocket',
    label: 'Spocket',
    domain: 'spocket.co',
    origine: 'Europe et États-Unis',
    importPath: 'les-deux',
    quoi: 'Fournisseurs sélectionnés, majoritairement européens et américains : délais courts, qualité plus régulière.',
    attention: "Abonnement mensuel, et des prix d'achat plus élevés qu'en Chine — c'est le prix du délai.",
    color: '#7f56d9',
    api: {
          "nom": "Spocket Partner API",
          "console": "https://www.spocket.co/developers",
          "exige": "Un abonnement Spocket, puis une demande d'accès partenaire examinée par leurs équipes.",
          "lectureCatalogue": true,
          "stockTempsReel": true,
          "commande": true,
          "suivi": false,
          "champs": [
                {
                      "cle": "apiKey",
                      "label": "Clé d'API",
                      "secret": true
                }
          ]
    },
  },
  {
    id: 'printful',
    label: 'Printful',
    domain: 'printful.com',
    origine: 'Impression à la demande, ateliers en Europe',
    importPath: 'les-deux',
    quoi: "Impression à la demande : textile, mugs, affiches, imprimés à la commande et expédiés à votre nom. Aucun stock.",
    attention:
      "La marge est mince par pièce, et le rendu dépend de votre visuel. Commandez un exemplaire avant de mettre en vente.",
    color: '#000000',
    api: {
          "nom": "Printful API v2",
          "console": "https://developers.printful.com",
          "exige": "Un compte Printful et un jeton d'accès personnel créé depuis le tableau de bord. Aucune validation à attendre.",
          "lectureCatalogue": true,
          "stockTempsReel": false,
          "commande": true,
          "suivi": true,
          "champs": [
                {
                      "cle": "accessToken",
                      "label": "Jeton d'accès",
                      "secret": true
                }
          ]
    },
  },
  {
    id: 'printify',
    label: 'Printify',
    domain: 'printify.com',
    origine: 'Impression à la demande, réseau mondial',
    importPath: 'les-deux',
    quoi: "Même principe que Printful, avec un réseau d'imprimeurs concurrents : à vous de choisir le vôtre.",
    attention: "La qualité varie d'un imprimeur à l'autre : le même produit n'est pas le même selon l'atelier.",
    color: '#29ab51',
    api: {
          "nom": "Printify API",
          "console": "https://developers.printify.com",
          "exige": "Un compte Printify et un jeton personnel créé dans Paramètres. Il faut aussi l'identifiant de votre boutique Printify.",
          "lectureCatalogue": true,
          "stockTempsReel": false,
          "commande": true,
          "suivi": true,
          "champs": [
                {
                      "cle": "accessToken",
                      "label": "Jeton d'accès",
                      "secret": true
                },
                {
                      "cle": "shopId",
                      "label": "Shop ID Printify"
                }
          ]
    },
  },
  {
    id: 'vidaxl',
    label: 'vidaXL',
    domain: 'vidaxl.fr',
    origine: 'Pays-Bas',
    importPath: 'les-deux',
    quoi: 'Meuble, jardin, animalerie, en volume, depuis des entrepôts européens.',
    attention: "Produits volumineux : le transport pèse lourd dans la marge, calculez-le avant de fixer un prix.",
    color: '#e2001a',
    api: {
          "nom": "vidaXL Dropshipping API",
          "console": "https://www.vidaxl.fr/dropshipping",
          "exige": "Un compte dropshipping vidaXL validé. La clé est délivrée avec le contrat.",
          "lectureCatalogue": true,
          "stockTempsReel": true,
          "commande": true,
          "suivi": true,
          "champs": [
                {
                      "cle": "apiKey",
                      "label": "Clé d'API",
                      "secret": true
                }
          ]
    },
  },
  {
    id: 'ankorstore',
    label: 'Ankorstore',
    domain: 'ankorstore.com',
    origine: 'Marques européennes',
    importPath: 'les-deux',
    quoi: "Marques indépendantes européennes en gros : de quoi vendre autre chose que ce que tout le monde vend.",
    attention: "Réservé aux professionnels, avec un minimum de commande par marque et un compte à faire valider.",
    color: '#1a1a1a',
  },
]

export function findSupplier(id: string) {
  return SUPPLIERS.find((s) => s.id === id) ?? null
}

/** Retrouve le fournisseur d'une adresse, pour reconnaître d'où vient un import. */
export function supplierOfUrl(url: string): SupplierInfo | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return (
      SUPPLIERS.find((s) => host === s.domain || host.endsWith(`.${s.domain}`)) ??
      // Les domaines nationaux : fr.aliexpress.com, aliexpress.fr…
      SUPPLIERS.find((s) => host.includes(s.domain.split('.')[0])) ??
      null
    )
  } catch {
    return null
  }
}
