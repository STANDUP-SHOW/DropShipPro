/**
 * How a seller connects each destination, in the order the steps are actually done.
 *
 * Only what is verifiable is written here. Where DropShipper IA is not yet plugged
 * into the platform's API, `state` says so rather than letting the guide imply a
 * connection that doesn't exist.
 */
export interface PlatformGuide {
  /** One line telling the seller what to expect before reading the steps. */
  summary: string
  steps: string[]
  /** Shown as an orange caveat under the steps. */
  caution?: string
  /** Where the credentials are issued. */
  docUrl?: string
  docLabel?: string
}

export const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
  OWN_SITE: {
    summary:
      "Votre propre boutique lit le catalogue de DropShipper IA. Rien à installer : une adresse web renvoie vos annonces publiées en JSON.",
    steps: [
      'Publiez une annonce sur « Mon site » : elle devient immédiatement disponible dans le catalogue.',
      'Copiez l\'adresse du catalogue dans Réglages › Brancher ma boutique.',
      "Sur votre site, appelez cette adresse et affichez les produits reçus (voir l'exemple de code ci-dessous).",
      "Rien d'autre : l'adresse est publique, en lecture seule, et ne demande aucune clé.",
    ],
    caution:
      "Cette adresse n'expose que les annonces publiées volontairement sur « Mon site ». Elle peut figurer dans le code de votre site sans risque.",
  },

  SHOPIFY: {
    summary:
      "Publication réelle et immédiate : DropShipper IA crée le produit, ses photos filigranées, sa description et son prix dans votre boutique Shopify.",
    steps: [
      "Partez de l'administration de votre boutique — admin.shopify.com — et non du Dev Dashboard (dev.shopify.com) : ce dernier ne délivre aucun jeton, et son app doit être déployée au CLI avant de pouvoir servir.",
      'Dans votre admin Shopify, ouvrez Réglages › Apps et canaux de vente › Développer des apps.',
      "Si un bouton « Autoriser le développement d'applications personnalisées » apparaît, cliquez-le : c'est une autorisation à donner une seule fois, et seul le propriétaire de la boutique peut le faire.",
      'Cliquez « Créer une app », donnez-lui un nom (par exemple « DropShipper IA »).',
      "Onglet « Configuration » › Admin API : cochez l'autorisation write_products. Ajoutez write_publications pour que le produit soit mis en ligne tout seul.",
      'Cliquez « Installer l\'app », puis copiez le jeton d\'accès Admin API (il commence par shpat_).',
      "Dans DropShipper IA › Réglages › Plateformes de vente › Shopify : collez l'adresse ma-boutique.myshopify.com et le jeton, puis « Connecter ma boutique ».",
      'Sélectionnez vos annonces et publiez : elles apparaissent dans Shopify avec leurs photos.',
    ],
    caution:
      "Le jeton n'est affiché qu'une seule fois par Shopify : copiez-le tout de suite. Attention à ne pas confondre avec le « jeton d'automatisation d'appli » du Dev Dashboard, qui commence par atkn_ : il ne sert qu'aux flux CI/CD et ne donne aucun accès à votre catalogue. Sans write_publications, le produit est créé mais reste à activer à la main dans le canal « Boutique en ligne ».",
    docUrl: 'https://admin.shopify.com',
    docLabel: 'Ouvrir mon admin Shopify',
  },

  EBAY: {
    summary:
      "eBay ouvre ses API de vente en self-service : un compte développeur gratuit suffit, sans validation commerciale — et la diffusion crée alors l'annonce directement sur eBay.fr.",
    steps: [
      "Créez un compte vendeur eBay si vous n'en avez pas, et vérifiez qu'il a ses politiques de vente (livraison, paiement, retours) et un emplacement d'expédition — le Seller Hub les crée en quelques minutes.",
      'Inscrivez-vous sur developer.ebay.com et créez une application (keyset de production).',
      'Générez un jeton utilisateur OAuth avec les portées sell.inventory et sell.account (User Tokens › Sign in to Production).',
      "Collez ce jeton en face d'eBay — et, pour ne pas le recoller toutes les deux heures, ajoutez le refresh token avec le Client ID et le Client Secret : le renouvellement se fait alors tout seul.",
    ],
    caution:
      "Un jeton utilisateur seul expire au bout de deux heures : sans le trio de renouvellement, il faudra en recoller un avant chaque session de diffusion. Et eBay refuse toute offre tant que les politiques de vente et l'emplacement d'expédition manquent sur le compte — le message d'échec vous dira lequel.",
    docUrl: 'https://developer.ebay.com',
    docLabel: 'developer.ebay.com',
  },

  GOOGLE_SHOPPING: {
    summary: "Google Merchant Center est gratuit : vos produits apparaissent dans l'onglet Shopping.",
    steps: [
      'Créez un compte Google Merchant Center.',
      'Ajoutez votre site et faites vérifier puis revendiquer le domaine.',
      'Activez la Content API for Shopping et créez une clé de compte de service.',
      'Collez cette clé dans Réglages › Plateformes de vente › Google Shopping.',
    ],
    caution:
      "Google exige un site marchand conforme : conditions de vente, politique de retour et prix affichés doivent correspondre au flux envoyé. L'envoi automatique n'est pas encore branché dans DropShipper IA.",
    docUrl: 'https://merchants.google.com',
    docLabel: 'Merchant Center',
  },

  AMAZON: {
    summary: "Amazon demande un compte vendeur Professionnel payant, puis un accès développeur à la Selling Partner API.",
    steps: [
      'Ouvrez un compte vendeur Professionnel sur Seller Central (abonnement mensuel).',
      'Faites valider votre identité et vos coordonnées bancaires par Amazon.',
      'Demandez un profil développeur, puis autorisez une application SP-API sur votre compte.',
      'Collez le jeton obtenu dans Réglages › Plateformes de vente › Amazon.',
    ],
    caution:
      "Beaucoup de catégories sont soumises à autorisation, et la revente de produits sans marque y est souvent refusée. L'envoi automatique n'est pas encore branché.",
    docUrl: 'https://sellercentral.amazon.fr',
    docLabel: 'Seller Central',
  },

  CDISCOUNT: {
    summary: "Marketplace française : candidature vendeur, puis une clé API délivrée dans votre espace.",
    steps: [
      'Déposez une candidature vendeur sur la Seller Zone Cdiscount.',
      'Une fois le compte validé, récupérez votre clé API dans les paramètres du compte.',
      'Collez-la dans Réglages › Plateformes de vente › Cdiscount.',
    ],
    caution: "L'envoi automatique n'est pas encore branché : la publication est enregistrée « en attente ».",
    docUrl: 'https://seller.cdiscount.com',
    docLabel: 'Seller Zone',
  },

  TIKTOK_SHOP: {
    summary: "Nécessite une boutique TikTok Shop approuvée pour la France.",
    steps: [
      'Créez une boutique sur TikTok Shop Seller Center et faites valider votre entreprise.',
      'Dans le Partner Center, créez une application et autorisez-la sur votre boutique.',
      'Collez le jeton dans Réglages › Plateformes de vente › TikTok Shop.',
    ],
    caution: "L'envoi automatique n'est pas encore branché.",
    docUrl: 'https://seller.tiktokglobalshop.com',
    docLabel: 'TikTok Shop Seller Center',
  },

  WISH: {
    summary: "Inscription vendeur en self-service, puis un jeton d'API marchand.",
    steps: [
      'Créez un compte marchand sur merchant.wish.com.',
      "Dans les paramètres, générez un jeton d'API.",
      'Collez-le dans Réglages › Plateformes de vente › Wish.',
    ],
    caution: "L'envoi automatique n'est pas encore branché.",
    docUrl: 'https://merchant.wish.com',
    docLabel: 'Wish Merchant',
  },

  ETSY: {
    summary: "API publique et self-service, mais un règlement très restrictif sur ce que vous avez le droit de vendre.",
    steps: [
      'Ouvrez une boutique Etsy.',
      'Créez une application sur le portail développeur Etsy et générez un jeton OAuth.',
      'Collez-le dans Réglages › Plateformes de vente › Etsy.',
    ],
    caution:
      "Etsy interdit la revente de produits manufacturés achetés en gros : seuls le fait main, le vintage de plus de 20 ans et les fournitures créatives sont autorisés. Publier des produits Temu ou JoyBuy expose à la fermeture de la boutique.",
    docUrl: 'https://www.etsy.com/sell',
    docLabel: 'Vendre sur Etsy',
  },
}

/**
 * La Redoute, Leclerc, BHV, Kiabi et BrandAlley tournent tous sur Mirakl : la
 * procédure est la même, seul l'opérateur change.
 */
export const MIRAKL_IDS = [
  'LA_REDOUTE', 'LECLERC', 'BHV', 'KIABI', 'BRANDALLEY',
  'ALLTRICKS', 'AUCHAN', 'BOULANGER', 'BRICOMARCHE', 'BUT', 'CARREFOUR', 'CONRAD', 'CREAVEA', 'CULTURA', 'EL_CORTE_INGLES', 'EPRICE', 'GALERIA_INNO', 'GALERIES_LAFAYETTE', 'GREENWEEZ', 'HOME24', 'HUDSONS_BAY', 'IBS', 'LAPOSTE', 'LDLC', 'LEROY_MERLIN', 'MAISONS_DU_MONDE', 'MANOR', 'MEDIAMARKT', 'METRO', 'NATURE_DECOUVERTES', 'PCCOMPONENTES', 'PHONEHOUSE', 'PLACE_DES_TENDANCES', 'RETIF', 'SECRETSALES', 'SHOWROOMPRIVE', 'TRUFFAUT', 'TWIL', 'UBALDI', 'WORTEN', 'FNAC',
]

for (const id of MIRAKL_IDS) {
  PLATFORM_GUIDES[id] = {
    summary:
      "Marketplace opérée par Mirakl : il faut être accepté comme vendeur avant d'obtenir la moindre clé.",
    steps: [
      "Déposez une candidature vendeur sur le site de l'enseigne (SIRET, assurance, catalogue, délais d'expédition).",
      "Attendez la validation : l'enseigne sélectionne ses vendeurs, le délai va de quelques jours à plusieurs semaines.",
      'Une fois accepté, ouvrez votre back-office Mirakl › Mon compte › Paramètres API et copiez la clé.',
      "Collez l'adresse de votre back-office et la clé en face de l'enseigne : la diffusion dépose alors l'offre directement par l'API Mirakl.",
    ],
    caution:
      "Le dépôt part tout de suite, mais l'opérateur relit le fichier de son côté : l'offre paraît en ligne dans l'heure. Et la plupart des enseignes apparient les offres par EAN — un produit importé de Temu ou d'AliExpress n'en a généralement pas.",
  }
}

/*
 * Kaufland — la porte d'entrée européenne la moins chère, et la plus exigeante.
 *
 * Une seule inscription ouvre sept pays, dont la France depuis 2026. Mais son
 * modèle n'est pas celui d'une place de marché à fiches libres : chaque offre
 * se greffe sur une fiche catalogue existante, retrouvée **par l'EAN**. C'est
 * la première chose à dire, avant même la clé d'API — un vendeur qui découvre
 * la contrainte après avoir payé son abonnement a perdu son argent.
 */
PLATFORM_GUIDES.KAUFLAND = {
  summary:
    "Kaufland Global Marketplace ouvre sept pays (Allemagne, France, Italie, Pologne, Autriche, Tchéquie, Slovaquie) avec une seule inscription, et documente une Seller API en self-service.",
  steps: [
    'Vérifiez d\'abord que vos produits ont un EAN officiel : sans lui, rien ne peut être publié (voir la mise en garde ci-dessous).',
    "Inscrivez-vous comme vendeur sur kauflandglobalmarketplace.com — SIRET, TVA intracommunautaire et coordonnées bancaires.",
    'Une fois le compte validé, ouvrez Seller Portal › Paramètres › API et générez votre clé et votre secret.',
    'Collez-les dans Réglages › Plateformes de vente, en face de Kaufland.',
  ],
  caution:
    "L'EAN est obligatoire et doit venir du fabricant ou de GS1 : Kaufland apparie chaque offre à sa fiche catalogue par le code-barres. Un produit importé de Temu ou d'AliExpress n'en a généralement aucun — en acheter chez GS1 ne se justifie que si vous vendez sous votre propre marque. Le dépôt automatique est branché : clés collées, chaque diffusion dépose l'offre par la Seller API, et un EAN absent ou invalide est refusé avec la raison écrite.",
}

PLATFORM_GUIDES.WOOCOMMERCE = {
  summary:
    "Votre boutique WordPress reçoit l'annonce entière — titre, description, photos, référence, catégorie, stock — par l'API REST de WooCommerce. Aucun module à installer.",
  steps: [
    "Dans WordPress, ouvrez WooCommerce › Réglages › Avancé › API REST, puis « Ajouter une clé ».",
    "Donnez-lui une description (« DropShipper IA »), l'utilisateur administrateur, et les droits Lecture/écriture.",
    "Copiez la clé (ck_…) et le secret (cs_…) : le secret ne s'affiche qu'une fois.",
    "Collez-les avec l'adresse du site dans Réglages › Plateformes de vente › WooCommerce. La connexion est vérifiée immédiatement.",
  ],
  caution:
    "Le site doit être en HTTPS (l'API REST de WooCommerce refuse les clés en clair) et les permaliens réglés autrement que « Simple », sinon /wp-json ne répond pas. Les photos sont envoyées en adresses : votre WordPress les télécharge dans sa médiathèque.",
  docUrl: 'https://woocommerce.com/document/woocommerce-rest-api/',
  docLabel: "Documentation de l'API REST WooCommerce",
}

PLATFORM_GUIDES.PRESTASHOP = {
  summary:
    "Votre boutique PrestaShop reçoit la fiche, ses photos et son stock par le webservice intégré à PrestaShop 1.7 et 8. Aucun module à installer.",
  steps: [
    'Dans PrestaShop, ouvrez Paramètres avancés › Webservice et activez « Activer le webservice de PrestaShop ».',
    "Cliquez « Ajouter une clé », générez-la, et cochez pour products, images, categories et stock_availables les droits GET, POST et PUT.",
    "Collez la clé avec l'adresse du site dans Réglages › Plateformes de vente › PrestaShop. La connexion est vérifiée immédiatement.",
  ],
  caution:
    "Si votre hébergeur est en mode CGI/FastCGI, activez aussi « Activer le mode CGI pour PHP » dans la page Webservice, sinon la clé n'arrive jamais au serveur. La fiche est créée dans la langue par défaut de la boutique.",
  docUrl: 'https://devdocs.prestashop-project.org/8/webservice/',
  docLabel: 'Documentation du webservice PrestaShop',
}

PLATFORM_GUIDES.MAGENTO = {
  summary:
    "Votre boutique Magento 2 / Adobe Commerce reçoit la fiche, ses photos (en contenu) et son stock par l'API REST, avec un jeton d'intégration.",
  steps: [
    "Dans l'administration Magento, ouvrez Système › Extensions › Intégrations › Ajouter une nouvelle intégration.",
    'Nommez-la « DropShipper IA », et dans l\'onglet API donnez les ressources Catalogue (produits, catégories) et Stocks.',
    'Enregistrez, puis « Activer » : Magento affiche quatre jetons — copiez l\'Access Token.',
    "Collez-le avec l'adresse du site dans Réglages › Plateformes de vente › Magento. La connexion est vérifiée immédiatement.",
  ],
  caution:
    "La fiche est créée dans le jeu d'attributs par défaut (Default, id 4), visible en catalogue et en recherche. Redéposer la même annonce met la fiche à jour par sa référence, sans doublon.",
  docUrl: 'https://developer.adobe.com/commerce/webapi/rest/',
  docLabel: "Documentation de l'API REST Magento",
}

PLATFORM_GUIDES.DRUPAL_COMMERCE = {
  summary:
    "Votre boutique Drupal Commerce reçoit la fiche par JSON:API, le module du cœur de Drupal : la variation (référence, prix) puis le produit, rattaché à votre première boutique Commerce, photos comprises.",
  steps: [
    'Dans Drupal, activez les modules JSON:API et HTTP Basic Authentication (Extensions).',
    "Créez un compte dédié (« DropShipper IA ») avec un rôle qui administre les produits Commerce et peut téléverser des fichiers.",
    "Collez l'adresse du site, l'identifiant et le mot de passe de ce compte dans Réglages › Plateformes de vente › Drupal Commerce. La connexion est vérifiée immédiatement.",
  ],
  caution:
    "Les types de produit et de variation utilisés sont « default » (ceux qu'installe Commerce) ; indiquez le vôtre si vous en avez créé un autre. Le stock n'est pas envoyé : Drupal Commerce ne le gère qu'avec le module Commerce Stock.",
  docUrl: 'https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module',
  docLabel: 'Documentation JSON:API de Drupal',
}

PLATFORM_GUIDES.BIGCOMMERCE = {
  summary: "Votre boutique BigCommerce reçoit la fiche entière par l'API Catalog V3 : photos par adresse, catégorie créée si absente, stock et EAN.",
  steps: [
    "Dans BigCommerce, ouvrez Paramètres › Comptes API › Créer un jeton d'API v2/v3, portée Produits : modifier.",
    "Copiez l'Access Token (il ne s'affiche qu'une fois) et le store hash, visible dans l'adresse de votre back-office (store-XXXXX.mybigcommerce.com).",
    "Collez-les dans Réglages › Plateformes de vente › BigCommerce. La connexion est vérifiée immédiatement.",
  ],
  caution: "BigCommerce exige un poids sur chaque produit ; nos annonces n'en portent pas, il est posé à 1 dans l'unité de la boutique. Corrigez-le dans la boutique si vous vendez au poids.",
  docUrl: 'https://developer.bigcommerce.com/docs/rest-catalog/products',
  docLabel: "Documentation de l'API Catalog",
}

PLATFORM_GUIDES.WIX = {
  summary: "Votre boutique Wix reçoit la fiche par l'API Wix Stores : nom, description, prix, référence, stock, photos, et le rangement dans une collection existante.",
  steps: [
    "Dans votre compte Wix, ouvrez Paramètres du compte › Clés API › Générer une clé, avec la permission Wix Stores.",
    "Relevez l'identifiant du site (Paramètres du site, ou l'adresse du tableau de bord).",
    "Collez la clé et l'identifiant dans Réglages › Plateformes de vente › Wix Stores. La connexion est vérifiée immédiatement.",
  ],
  caution: "Wix ne laisse pas créer de collection par l'API : la fiche est rangée dans la collection dont le nom correspond à sa catégorie, sinon elle reste sans collection et la publication le dit.",
  docUrl: 'https://dev.wix.com/docs/rest/business-solutions/stores/catalog/products/introduction',
  docLabel: "Documentation de l'API Wix Stores",
}

PLATFORM_GUIDES.SHOPWARE = {
  summary: "Votre boutique Shopware 6 reçoit la fiche par l'API d'administration : TVA, devise et canal de vente sont lus sur la boutique, les photos sont téléchargées par Shopware.",
  steps: [
    "Dans Shopware, ouvrez Paramètres › Système › Intégrations › Ajouter une intégration, avec les droits sur les produits, médias et catégories.",
    "Copiez l'identifiant d'accès et le secret d'accès (le secret ne s'affiche qu'une fois).",
    "Collez-les avec l'adresse de la boutique dans Réglages › Plateformes de vente › Shopware 6. La connexion est vérifiée immédiatement.",
  ],
  caution: "Le prix envoyé est TTC ; le hors-taxe est calculé avec le premier taux de TVA de la boutique. La fiche est rendue visible sur le premier canal de vente.",
  docUrl: 'https://developer.shopware.com/docs/guides/integrations-api/',
  docLabel: "Documentation de l'API d'administration",
}

PLATFORM_GUIDES.ECWID = {
  summary: "Votre boutique Ecwid reçoit la fiche par l'API REST v3 : photos par adresse, catégorie créée si absente, caractéristiques et EAN, mise à jour sans doublon.",
  steps: [
    "Dans Ecwid, relevez l'identifiant de votre boutique, affiché en bas du tableau de bord.",
    "Créez un jeton secret : Applications › Mes applications › Jetons d'accès (ou une application personnalisée avec le droit de modifier le catalogue).",
    "Collez-les dans Réglages › Plateformes de vente › Ecwid. La connexion est vérifiée immédiatement.",
  ],
  caution: "Un jeton public (public_…) ne suffit pas : il faut le jeton secret (secret_…), le seul qui écrit dans le catalogue.",
  docUrl: 'https://api-docs.ecwid.com/reference/products',
  docLabel: "Documentation de l'API Ecwid",
}

PLATFORM_GUIDES.SQUARESPACE = {
  summary: "Votre boutique Squarespace reçoit la fiche par l'API Commerce : dans votre première page Boutique, avec prix, stock, référence et photos.",
  steps: [
    "Dans Squarespace, ouvrez Paramètres › Avancé › Outils de développement › Clés d'API › Générer une clé, permission Products en lecture et écriture.",
    "Collez la clé dans Réglages › Plateformes de vente › Squarespace. La connexion est vérifiée immédiatement.",
  ],
  caution: "L'API Commerce n'est ouverte que sur les forfaits Commerce (Basique ou Avancé). Une référence déjà présente est refusée par Squarespace, qui ne permet pas de la retrouver par l'API : modifiez-la dans la boutique ou supprimez-la avant de republier.",
  docUrl: 'https://developers.squarespace.com/commerce-apis/products-overview',
  docLabel: "Documentation de l'API Commerce",
}

const SPECIALIST_IDS = ['SPARTOO', 'MIINTO']

for (const id of SPECIALIST_IDS) {
  PLATFORM_GUIDES[id] = {
    summary: 'Marketplace spécialisée mode : candidature vendeur obligatoire, catalogue restreint.',
    steps: [
      "Déposez une candidature vendeur sur le site de la plateforme.",
      'Une fois acceptée, récupérez vos identifiants API dans votre espace vendeur.',
      'Collez-les dans Réglages › Plateformes de vente.',
    ],
    caution: "L'envoi automatique n'est pas encore branché.",
  }
}

/** Extension-assisted marketplaces: nothing to connect, everything happens in Chrome. */
const EXTENSION_GUIDE = (label: string, sellPage: string): PlatformGuide => ({
  summary: `${label} n'a pas d'API publique pour les annonces. L'extension Chrome remplit le formulaire à votre place, et c'est vous qui cliquez sur « Publier ».`,
  steps: [
    "Installez l'extension Chrome et connectez-vous avec votre compte DropShipper IA.",
    `Connectez-vous à votre compte ${label} dans le même navigateur.`,
    `Ouvrez votre annonce dans DropShipper IA, cliquez « Publier cette annonce », cochez ${label}, puis « Diffuser votre annonce ».`,
    `Un onglet s'ouvre sur ${sellPage} : titre, description, prix et photos filigranées sont remplis automatiquement.`,
    'Contrôlez la page, complétez ce qui manque (état, taille, lieu…), puis cliquez vous-même sur « Publier ».',
  ],
  caution:
    "DropShipper IA ne clique jamais sur « Publier » à votre place et ne rejoue jamais votre mot de passe : rejouer une connexion viole les conditions d'utilisation de ces sites et fait suspendre les comptes vendeur.",
})

PLATFORM_GUIDES.VINTED = EXTENSION_GUIDE('Vinted', 'vinted.fr/items/new')
PLATFORM_GUIDES.LEBONCOIN = EXTENSION_GUIDE('Leboncoin', 'leboncoin.fr/deposer-une-annonce')
PLATFORM_GUIDES.FACEBOOK = EXTENSION_GUIDE('Facebook Marketplace', 'facebook.com/marketplace/create/item')
