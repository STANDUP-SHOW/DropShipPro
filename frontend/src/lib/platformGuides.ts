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
      'Dans votre admin Shopify, ouvrez Réglages › Apps et canaux de vente › Développer des apps.',
      'Cliquez « Créer une app », donnez-lui un nom (par exemple « DropShipper IA »).',
      "Onglet « Configuration » › Admin API : cochez l'autorisation write_products. Ajoutez write_publications pour que le produit soit mis en ligne tout seul.",
      'Cliquez « Installer l\'app », puis copiez le jeton d\'accès Admin API (il commence par shpat_).',
      "Dans DropShipper IA › Réglages › Plateformes de vente › Shopify : collez l'adresse ma-boutique.myshopify.com et le jeton, puis « Connecter ma boutique ».",
      'Sélectionnez vos annonces et publiez : elles apparaissent dans Shopify avec leurs photos.',
    ],
    caution:
      "Le jeton n'est affiché qu'une seule fois par Shopify : copiez-le tout de suite. Sans write_publications, le produit est créé mais reste à activer à la main dans le canal « Boutique en ligne ».",
    docUrl: 'https://admin.shopify.com',
    docLabel: 'Ouvrir mon admin Shopify',
  },

  EBAY: {
    summary: "eBay ouvre ses API de vente en self-service : un compte développeur suffit, sans validation commerciale.",
    steps: [
      'Créez un compte vendeur eBay si vous n\'en avez pas.',
      'Inscrivez-vous sur developer.ebay.com et créez une application (keyset de production).',
      'Générez un jeton utilisateur OAuth avec les autorisations Sell (inventory, account).',
      'Collez ce jeton dans Réglages › Plateformes de vente › eBay.',
    ],
    caution:
      "Le champ de connexion existe déjà, mais l'envoi automatique vers l'API Sell n'est pas encore branché : la publication reste « en attente ». En attendant, l'extension remplit le formulaire de vente eBay pour vous.",
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
const MIRAKL_IDS = ['LA_REDOUTE', 'LECLERC', 'BHV', 'KIABI', 'BRANDALLEY']

for (const id of MIRAKL_IDS) {
  PLATFORM_GUIDES[id] = {
    summary:
      "Marketplace opérée par Mirakl : il faut être accepté comme vendeur avant d'obtenir la moindre clé.",
    steps: [
      "Déposez une candidature vendeur sur le site de l'enseigne (SIRET, assurance, catalogue, délais d'expédition).",
      "Attendez la validation : l'enseigne sélectionne ses vendeurs, le délai va de quelques jours à plusieurs semaines.",
      'Une fois accepté, ouvrez votre back-office Mirakl › Mon compte › Paramètres API et copiez la clé.',
      "Collez-la dans Réglages › Plateformes de vente, en face de l'enseigne.",
    ],
    caution:
      "L'envoi automatique n'est pas encore branché : la publication est enregistrée « en attente » avec la bonne catégorie, prête à partir dès le branchement.",
  }
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
