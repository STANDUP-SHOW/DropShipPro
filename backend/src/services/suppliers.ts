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
  /** Les champs à saisir pour se relier, dans l'ordre. Un champ `optionnel` peut rester vide. */
  champs: Array<{ cle: string; label: string; secret?: boolean; optionnel?: boolean }>
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
      nom: 'AliExpress Open Platform — Dropshipping API',
      console: 'https://openservice.aliexpress.com',
      exige:
        "Un compte AliExpress Affiliate ou Dropshipping validé, puis une application créée sur l'Open Platform. La demande passe en revue : comptez deux à cinq jours ouvrés avant d'obtenir l'App Key et l'App Secret. Le jeton d'accès s'obtient ensuite en autorisant l'application depuis votre compte.",
      lectureCatalogue: true,
      stockTempsReel: true,
      commande: true,
      suivi: true,
      champs: [
        { cle: 'appKey', label: 'App Key' },
        { cle: 'appSecret', label: 'App Secret', secret: true },
        { cle: 'accessToken', label: "Jeton d'accès", secret: true },
        // Facultatif, et pourtant c'est lui qui évite la panne : sans jeton de
        // rafraîchissement, la veille s'arrête le jour où l'accès expire et il
        // faut réautoriser l'application à la main.
        { cle: 'refreshToken', label: 'Jeton de rafraîchissement', secret: true, optionnel: true },
      ],
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
  /*
   * ---------------------------------------------------------------------------
   * Ajoutés le 31/08/2026, sur une liste relevée dans les forums.
   * ---------------------------------------------------------------------------
   *
   * Huit noms sur vingt-deux sont de vrais fournisseurs. Les autres ont été
   * écartés, et la raison est écrite dans le message qui accompagne cet ajout :
   * un réseau social, un agrégateur de prospectus, quatre places de marché de
   * revente entre particuliers, des détaillants grand public — et un agent
   * chinois dont le métier est la contrefaçon.
   *
   * Une fiche fournisseur est une recommandation. Y faire figurer une plateforme
   * qui n'en est pas envoie le vendeur acheter au prix de détail ; y faire
   * figurer un vendeur de répliques lui fait fermer ses comptes.
   */
  {
    id: 'sunsky',
    label: 'SUNSKY',
    domain: 'sunsky-online.com',
    origine: 'Shenzhen, Chine',
    importPath: 'les-deux',
    quoi: "Grossiste d'électronique et d'accessoires : coques, câbles, éclairage LED, accessoires auto, périphériques. Des millions de références, à l'unité comme au carton.",
    attention:
      "Les photos du site portent son propre filigrane. Le programme grossiste donne accès aux versions sans marque — sans lui, vos annonces afficheraient le logo d'un autre.",
    color: '#0d6efd',
    api: {
      nom: 'SUNSKY Open API',
      console: 'https://www.sunsky-online.com/base/doc!view.do?code=wholesale',
      exige:
        "Un compte grossiste validé sur sunsky-online.com, puis la demande d'accès API depuis l'espace Wholesale. La clé est délivrée après vérification du compte.",
      lectureCatalogue: true,
      stockTempsReel: true,
      commande: true,
      suivi: true,
      champs: [
        { cle: 'appKey', label: 'App Key' },
        { cle: 'appSecret', label: 'App Secret', secret: true },
      ],
    },
  },
  {
    id: 'supdropshipping',
    label: 'SUP Dropshipping',
    domain: 'supdropshipping.com',
    origine: 'Chine, sourcing sur 1688, Taobao et Tmall',
    importPath: 'les-deux',
    quoi: "Un agent plutôt qu'un catalogue : vous envoyez une photo ou un lien, il retrouve l'usine, achète, contrôle et expédie sous votre marque.",
    attention:
      "Le prix se négocie produit par produit : aucune grille publique, donc aucune marge calculable avant d'avoir demandé un devis.",
    color: '#ff6b35',
  },
  {
    id: 'lightinthebox',
    label: 'LightInTheBox',
    domain: 'lightinthebox.com',
    origine: 'Chine, entrepôts multiples',
    importPath: 'les-deux',
    quoi: "Mode, mariage, maison et gadgets. Le rayon robes de cérémonie est le plus solide, et le plus rentable.",
    attention:
      "C'est un détaillant avant d'être un grossiste : le prix affiché est un prix client. Le programme revendeur donne la remise, sans lui la marge est nulle.",
    color: '#e64c3c',
  },
  {
    id: 'joom',
    label: 'Joom',
    domain: 'joom.com',
    origine: 'Chine et Europe',
    importPath: 'les-deux',
    quoi: "Place de marché grand public, doublée d'un service de sourcing B2B (Joom Pro) qui achète en Chine et livre en Europe.",
    attention:
      "Deux services sous un même nom : acheter sur la boutique revient à payer le prix de détail. C'est Joom Pro qu'il faut, et il demande un compte professionnel.",
    color: '#5c39d1',
  },
  {
    id: 'faire',
    label: 'Faire',
    domain: 'faire.com',
    origine: 'Marques indépendantes, Europe et Amérique du Nord',
    importPath: 'les-deux',
    quoi: "Vente en gros entre marques indépendantes et détaillants : de quoi vendre autre chose que ce que tout le monde vend, avec des marques identifiables.",
    attention:
      "Ce n'est pas du dropshipping : vous achetez le stock, avec un minimum par marque. Le premier achat est souvent payable à soixante jours, ce qui aide, mais l'invendu reste le vôtre.",
    color: '#111111',
  },
  {
    id: 'fashiongo',
    label: 'FashionGo',
    domain: 'fashiongo.net',
    origine: 'Los Angeles, grossistes du quartier de la mode',
    importPath: 'les-deux',
    quoi: "Gros de la mode américaine : des centaines de grossistes indépendants sur une même plateforme, avec des collections renouvelées chaque semaine.",
    attention:
      "Réservé aux professionnels avec un numéro de revendeur américain, et l'expédition part des États-Unis : ajoutez le port et les droits de douane avant de calculer une marge.",
    color: '#e6007e',
  },
  {
    id: 'amazon-business',
    label: 'Amazon Business',
    domain: 'business.amazon.fr',
    origine: 'Europe',
    importPath: 'les-deux',
    quoi: "L'achat professionnel chez Amazon : prix dégressifs, factures avec TVA, livraison rapide depuis l'Europe.",
    attention:
      "**Pas d'expédition en marque blanche.** Le colis arrive dans un carton Amazon avec son bordereau, et faire livrer directement chez un acheteur d'une autre place de marché est interdit par la plupart d'entre elles. Utile pour constituer du stock, pas pour du dropshipping.",
    color: '#ff9900',
  },
  {
    id: 'meesho',
    label: 'Meesho',
    domain: 'meesho.com',
    origine: 'Inde',
    importPath: 'les-deux',
    quoi: "Plateforme de revente indienne, très large sur le textile et les accessoires, à des prix qu'aucun grossiste européen n'approche.",
    attention:
      "**Livre en Inde seulement.** Aucune expédition internationale : sans transitaire à vous, elle ne sert à rien depuis la France.",
    color: '#f43397',
  },

  /*
   * ---------------------------------------------------------------------------
   * La distribution informatique européenne.
   * ---------------------------------------------------------------------------
   *
   * Ajoutés le 01/09/2026, et c'est un agent qui les a nommés : interrogé sur le
   * rayon électronique, le chef de rayon a conseillé Ingram Micro, Tech Data,
   * ALSO et Esprinet — quatre distributeurs absents de notre liste. Il avait
   * raison : ce sont les grossistes qui alimentent la quasi-totalité des
   * revendeurs informatiques européens.
   *
   * **Ce n'est pas le même métier que le dropshipping chinois**, et les
   * confondre ferait perdre du temps à tout le monde. Marges de 2 à 8 % au lieu
   * de 40, compte revendeur à obtenir avec un numéro de TVA et parfois des
   * références commerciales, volumes minimaux fréquents. En échange :
   * marchandise authentique, garantie constructeur, livraison européenne en deux
   * à trois jours, et aucune douane.
   *
   * C'est la voie d'un vendeur qui veut sortir du gadget à dix euros, pas celle
   * d'un débutant.
   */
  {
    id: 'ingram-micro',
    label: 'Ingram Micro',
    domain: 'ingrammicro.com',
    origine: 'Europe, entrepôts nationaux',
    importPath: 'les-deux',
    quoi: "Le premier distributeur informatique mondial : ordinateurs, périphériques, réseau, logiciels, téléphonie. Des centaines de milliers de références de marques authentiques.",
    attention:
      "Compte revendeur obligatoire : société enregistrée, numéro de TVA, et souvent un dossier de solvabilité. Les marges sont celles de la distribution — 2 à 8 % — pas celles du dropshipping. En échange, garantie constructeur et livraison européenne en deux à trois jours.",
    color: '#0072ce',
  },
  {
    id: 'td-synnex',
    label: 'TD SYNNEX',
    domain: 'tdsynnex.com',
    origine: 'Europe, entrepôts nationaux',
    importPath: 'les-deux',
    quoi: "L'autre géant de la distribution informatique, né de la fusion de Tech Data et SYNNEX. Même catalogue de marques, même modèle : matériel professionnel et grand public.",
    attention:
      "**Tech Data n'existe plus sous ce nom** depuis sa fusion en 2021 : c'est ici qu'il faut ouvrir un compte. Mêmes exigences qu'Ingram Micro — société, TVA, dossier revendeur — et mêmes marges de distribution.",
    color: '#00539b',
  },
  {
    id: 'also',
    label: 'ALSO',
    domain: 'also.com',
    origine: 'Suisse, fort en Europe du Nord et germanophone',
    importPath: 'les-deux',
    quoi: "Distributeur informatique européen, particulièrement implanté en Allemagne, en Suisse et dans les pays nordiques. Matériel, logiciels et services cloud.",
    attention:
      "Compte revendeur professionnel exigé. La couverture française est plus mince que celle d'Ingram ou de TD SYNNEX : à regarder surtout si vous vendez vers l'Allemagne ou la Scandinavie.",
    color: '#e2001a',
  },
  {
    id: 'esprinet',
    label: 'Esprinet',
    domain: 'esprinet.com',
    origine: 'Italie et Espagne',
    importPath: 'les-deux',
    quoi: "Le grand distributeur informatique du sud de l'Europe : informatique, téléphonie, électroménager et électronique grand public.",
    attention:
      "Compte revendeur professionnel exigé, et l'essentiel de sa logistique est en Italie et en Espagne. Intéressant pour ces marchés, moins pour une expédition depuis la France.",
    color: '#c8102e',
  },
  {
    /*
     * Syncee n'est pas un fournisseur : c'est un annuaire de fournisseurs.
     *
     * Douze mille marques des États-Unis, du Canada, du Royaume-Uni, d'Australie
     * et surtout d'Europe, réunies derrière une seule inscription. Pour un
     * vendeur français, c'est la façon la plus rapide de trouver du stock
     * européen sans ouvrir dix comptes chez dix grossistes.
     */
    id: 'syncee',
    label: 'Syncee',
    domain: 'syncee.com',
    origine: 'Europe, Royaume-Uni, Amérique du Nord, Australie',
    importPath: 'les-deux',
    quoi: "Un annuaire de plus de douze mille marques en gros et en dropshipping, filtrables par pays d'expédition. Une seule inscription donne accès à tous ses fournisseurs.",
    attention:
      "Son intérêt est l'expédition depuis l'Europe : filtrez sur ce critère, sinon vous retombez sur des délais chinois avec une commission en plus. L'abonnement est mensuel et compte le nombre de références synchronisées — au-delà de quelques centaines de produits, il pèse sur la marge.",
    color: '#0f9d58',
  },
  {
    /*
     * Busyx Pro : entrepôt français, catalogue adulte.
     *
     * L'atout est réel et rare — Avignon, expédition le jour même en Colissimo,
     * aucune commande minimum. Sur un marché où « livré en trois semaines » est
     * la norme, c'est un argument de vente à lui seul.
     *
     * Mais la contrainte l'est tout autant, et elle ne se voit pas avant d'être
     * sanctionné : **presque aucune place de marché n'accepte ces produits**, et
     * aucune régie n'accepte de les mettre en publicité. Un vendeur qui importe
     * ce catalogue sans le savoir fait suspendre ses comptes.
     */
    id: 'busyx-pro',
    label: 'Busyx Pro',
    domain: 'busyx-pro.com',
    origine: 'France, entrepôt à Avignon',
    importPath: 'les-deux',
    quoi: "Grossiste français pour boutiques adultes : lingerie, jouets intimes, cosmétiques érotiques, massage. Distributeur exclusif de plusieurs marques françaises.",
    attention:
      "**Ces produits sont interdits ou restreints sur presque toutes les destinations** : Amazon, Vinted, Leboncoin, Facebook, Instagram, Google Shopping et TikTok Shop les refusent, et aucune régie publicitaire ne les accepte. Ils ne se vendent que sur votre propre site — et la publicité passe par le référencement, jamais par une annonce payante. L'entrepôt d'Avignon, lui, expédie le jour même en Colissimo, sans commande minimum : c'est ce qui le rend intéressant.",
    color: '#d81b60',
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

/**
 * L'identifiant du produit chez son fournisseur, lu dans l'adresse.
 *
 * C'est ce qui manque pour surveiller un prix : l'adresse source suffit à
 * rouvrir la fiche dans un navigateur, pas à interroger une API. Chaque
 * fournisseur range cet identifiant à sa façon, d'où une règle par site.
 *
 * Rien n'est deviné : un site dont on ne connaît pas la forme rend `null`, et le
 * produit n'est simplement pas surveillé. Inventer une référence ferait
 * interroger le fournisseur sur un produit qui n'est pas le bon — et un prix
 * relevé sur le mauvais article est pire qu'un prix périmé.
 */
const REFERENCES: Record<string, RegExp[]> = {
  aliexpress: [/\/item\/(\d{6,})/],
  bigbuy: [/\/(?:product|producto)\/([A-Za-z0-9_-]{3,})/, /[?&]sku=([A-Za-z0-9_-]{3,})/],
  cjdropshipping: [/\/product\/[^/]*-p-([A-Za-z0-9-]{6,})\.html/, /[?&]pid=([A-Za-z0-9-]{6,})/],
  dhgate: [/\/product\/[^/]+\/(\d{6,})\.html/],
  banggood: [/-p-(\d{4,})\.html/],
  vidaxl: [/\/e\/(\d{8,})\//],
  printful: [/\/products\/(\d{3,})/],
  printify: [/\/products\/(\d{3,})/],
}

export function supplierRefFromUrl(url: string): { supplier: string; ref: string } | null {
  const fournisseur = supplierOfUrl(url)
  if (!fournisseur) return null

  const regles = REFERENCES[fournisseur.id]
  if (!regles) return null

  for (const regle of regles) {
    const trouve = url.match(regle)
    if (trouve?.[1]) return { supplier: fournisseur.id, ref: trouve[1] }
  }

  return null
}

/**
 * Les champs fournisseur à écrire à la création d'un produit.
 *
 * Séparé de `supplierRefFromUrl` parce que les deux ne vont pas toujours
 * ensemble : on reconnaît le fournisseur bien plus souvent qu'on ne sait lire sa
 * référence. Enregistrer le fournisseur seul reste utile — l'écran de veille
 * peut alors dire « AliExpress reconnu, référence introuvable » plutôt que de
 * laisser le produit invisible.
 */
export function supplierFields(url: string | null | undefined): {
  supplierId?: string
  supplierRef?: string
} {
  if (!url) return {}

  const fournisseur = supplierOfUrl(url)
  if (!fournisseur) return {}

  const reference = supplierRefFromUrl(url)
  return reference
    ? { supplierId: fournisseur.id, supplierRef: reference.ref }
    : { supplierId: fournisseur.id }
}
