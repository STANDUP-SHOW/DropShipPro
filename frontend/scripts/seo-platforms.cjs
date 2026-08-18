/**
 * Landing page content, one entry per destination.
 *
 * Written by hand rather than templated: a dozen pages differing only by a
 * substituted name are near-duplicates, which Google treats as thin content and
 * which drags the whole domain down. Everything asserted here is verifiable — no
 * invented commission rates, no invented audience figures.
 */
module.exports = [
  {
    slug: 'vinted',
    name: 'Vinted',
    color: '#007782',
    integration: 'extension',
    title: 'Vendre sur Vinted : déposer ses annonces plus vite',
    description:
      "Vendre sur Vinted quand on gère un catalogue : dépôt d'annonce accéléré, photos filigranées, description prête. Sans automatisation interdite.",
    intro:
      "Vinted est devenu le premier réflexe français pour la mode d'occasion et le déstockage à petit prix. Le dépôt d'annonce y est simple, mais entièrement manuel : chaque article se saisit à la main, photo par photo, champ par champ.",
    audience:
      "L'audience y est majoritairement féminine et jeune, très sensible au prix. Les catégories qui tournent : vêtements, chaussures, accessoires, articles pour enfants. Les produits techniques ou volumineux y trouvent peu d'acheteurs.",
    constraints:
      "Vinted n'expose aucune API publique de dépôt d'annonce. Toute solution qui promet une publication « automatique » sur Vinted rejoue en réalité votre session, ce que les conditions d'utilisation interdisent et ce qui fait suspendre les comptes vendeur. La plateforme surveille par ailleurs l'activité professionnelle : au-delà d'un certain volume, un statut vendeur professionnel est attendu.",
    faq: [
      {
        q: 'Peut-on publier automatiquement sur Vinted ?',
        a: "Non, et il faut se méfier des outils qui l'affirment. Vinted n'a pas d'API publique d'annonces ; ce qui est possible, c'est de pré-remplir le formulaire de dépôt dans votre propre navigateur, en vous laissant relire et valider.",
      },
      {
        q: 'Combien de temps fait-on gagner par annonce ?',
        a: "L'essentiel du temps passe dans la rédaction et le transfert des photos. Une fiche déjà rédigée et des photos déjà filigranées ramènent le dépôt à une relecture et un clic.",
      },
    ],
  },
  {
    slug: 'leboncoin',
    name: 'Leboncoin',
    color: '#ff6e14',
    integration: 'extension',
    title: 'Vendre sur Leboncoin : déposer ses annonces en série',
    description:
      "Vendre sur Leboncoin sans ressaisir chaque annonce : formulaire de dépôt pré-rempli, photos filigranées, catégorie proposée. Ce qui est permis, ce qui ne l'est pas.",
    intro:
      "Leboncoin reste le plus généraliste des sites d'annonces français : on y vend aussi bien un canapé qu'un lot de coques de téléphone. Pour un vendeur qui gère un catalogue, la difficulté n'est pas de vendre, c'est de déposer.",
    audience:
      "Le trafic est national et couvre tous les âges. L'acheteur cherche souvent une bonne affaire près de chez lui, mais la livraison a fait sauter cette contrainte pour les petits objets. Les catégories maison, bricolage, puériculture et téléphonie sont particulièrement actives.",
    constraints:
      "L'API de Leboncoin est réservée aux partenaires professionnels sous contrat ; elle n'est pas accessible en libre-service. Le dépôt passe donc par le formulaire du site. Un vendeur qui publie régulièrement doit par ailleurs opter pour un compte professionnel, avec les obligations légales correspondantes.",
    faq: [
      {
        q: 'Faut-il un compte professionnel sur Leboncoin ?',
        a: "Dès que la vente devient une activité régulière et lucrative, oui. Le statut particulier est réservé aux ventes occasionnelles de biens personnels. C'est une question fiscale autant que contractuelle.",
      },
      {
        q: 'Le remplissage assisté respecte-t-il les règles ?',
        a: "Pré-remplir un formulaire dans votre navigateur, sous vos yeux, avec vos propres données, n'a rien à voir avec un robot publiant à votre place. La validation finale reste un clic humain, sur votre session, ouverte par vous.",
      },
    ],
  },
  {
    slug: 'ebay',
    name: 'eBay',
    color: '#e53238',
    integration: 'api-ready',
    title: "Vendre sur eBay depuis la France : mode d'emploi",
    description:
      'Vendre sur eBay quand on gère un catalogue : compte vendeur, API Sell accessible en libre-service, mise en ligne accélérée des fiches produit.',
    intro:
      "eBay a l'avantage rare d'ouvrir ses API de vente sans validation commerciale : un compte développeur suffit. C'est l'une des seules grandes marketplaces où un vendeur indépendant peut automatiser sa mise en ligne sans négocier de contrat.",
    audience:
      "Le catalogue est mondial et l'acheteur français y cherche souvent des pièces introuvables ailleurs : pièces détachées, électronique, collection, mode vintage. La comparaison de prix est immédiate, la fiche doit donc être précise.",
    constraints:
      "Les frais de mise en vente et la commission varient selon la catégorie et le statut du vendeur : vérifiez-les dans votre espace avant de fixer vos prix. Les objets contrefaits et les catégories réglementées font l'objet de contrôles automatiques stricts.",
    faq: [
      {
        q: 'Faut-il un compte développeur eBay ?',
        a: "Pour passer par l'API Sell, oui : l'inscription sur le portail développeur eBay est gratuite, puis vous générez un jeton OAuth depuis votre compte vendeur.",
      },
      {
        q: 'Et sans compte développeur ?',
        a: "L'extension remplit le formulaire de mise en vente d'eBay directement dans votre navigateur, ce qui ne demande aucune inscription supplémentaire.",
      },
    ],
  },
  {
    slug: 'amazon',
    name: 'Amazon',
    color: '#ff9900',
    integration: 'api-ready',
    title: 'Vendre sur Amazon : compte vendeur et mise en ligne',
    description:
      'Vendre sur Amazon en France : compte vendeur Professionnel, Selling Partner API, contraintes de catégories et préparation des fiches produit.',
    intro:
      "Amazon est le premier réflexe d'achat de millions de Français, et la marketplace la plus exigeante de cette liste. Tout y est normé : la fiche produit, les délais, le service client. En échange, le volume est sans équivalent.",
    audience:
      "L'acheteur arrive avec une intention d'achat déjà formée et compare surtout le prix, le délai et les avis. Une fiche incomplète ne se vend pas : les attributs structurés et les arguments en puces pèsent lourd dans le classement interne.",
    constraints:
      "Il faut un compte vendeur Professionnel, payant et validé par Amazon, puis un accès développeur pour la Selling Partner API. De nombreuses catégories sont soumises à autorisation préalable, et la revente de produits sans marque identifiable y est souvent refusée. Les performances vendeur sont surveillées de près.",
    faq: [
      {
        q: 'Le dropshipping est-il autorisé sur Amazon ?',
        a: "Sous conditions strictes : vous devez être le vendeur officiel enregistré sur les factures et les bons de livraison, et retirer toute mention d'un autre fournisseur. Faire expédier une commande par une autre marketplace est explicitement interdit.",
      },
      {
        q: 'Combien de temps pour ouvrir un compte ?',
        a: "La vérification d'identité et des coordonnées bancaires prend généralement de quelques jours à quelques semaines selon les pièces fournies.",
      },
    ],
  },
  {
    slug: 'facebook-marketplace',
    name: 'Facebook Marketplace',
    color: '#1877f2',
    integration: 'extension',
    title: 'Vendre sur Facebook Marketplace : dépôt accéléré',
    description:
      "Vendre sur Facebook Marketplace sans ressaisir : formulaire pré-rempli avec vos photos et votre description. Pourquoi aucune API n'existe pour les annonces.",
    intro:
      "Facebook Marketplace ne coûte rien, touche une audience locale immense, et n'a aucune API publique pour déposer une annonce. C'est le canal gratuit le plus rentable, à condition d'accepter que le dépôt soit manuel.",
    audience:
      "Le public est local et généraliste, avec une forte proportion d'acheteurs qui ne fréquentent aucune autre marketplace. Meubles, électroménager, vêtements, articles de puériculture et petits équipements y circulent très bien.",
    constraints:
      "Aucune API d'annonces, et une modération automatique susceptible de retirer une publication sans explication détaillée. Les comptes récents qui publient beaucoup en peu de temps attirent l'attention : espacez les dépôts.",
    faq: [
      {
        q: 'Existe-t-il une API Facebook Marketplace ?',
        a: "Pas pour les annonces de particuliers ou de petits vendeurs. Les catalogues Meta Commerce existent, mais visent la publicité et les boutiques Facebook, pas le dépôt d'annonces Marketplace.",
      },
      {
        q: 'Publier beaucoup fait-il courir un risque ?',
        a: "Un rythme anormalement élevé peut déclencher une limitation. Un remplissage assisté, où chaque annonce est relue et validée par vous, reste un usage normal du site.",
      },
    ],
  },
  {
    slug: 'shopify',
    name: 'Shopify',
    color: '#95bf47',
    integration: 'live',
    title: 'Publier ses produits sur Shopify automatiquement',
    description:
      "Envoyer automatiquement vos fiches produit vers votre boutique Shopify : app personnalisée, jeton d'accès Admin, photos et prix transmis en un clic.",
    intro:
      "Shopify n'est pas une marketplace : c'est votre boutique. Vous ne dépendez d'aucun classement, d'aucune commission de plateforme, et vous gardez la relation client. En contrepartie, le trafic est à construire.",
    audience:
      "C'est la destination naturelle quand vous voulez une marque plutôt qu'un stand. Le catalogue vous appartient, les fiches sont indexées à votre nom, et rien ne vous met en concurrence directe avec un autre vendeur sur la même page produit.",
    constraints:
      "Il faut un abonnement Shopify, et créer une app personnalisée dans votre propre boutique pour obtenir un jeton d'accès Admin. Aucune validation extérieure n'est nécessaire : vous êtes chez vous, la connexion prend cinq minutes.",
    faq: [
      {
        q: 'Comment connecter son catalogue à Shopify ?',
        a: "Dans votre admin Shopify : Réglages, Apps et canaux de vente, Développer des apps. Créez une app, autorisez write_products, installez-la, puis copiez le jeton d'accès Admin (il commence par shpat_) dans les réglages de DropShipper IA.",
      },
      {
        q: 'Les photos sont-elles transférées ?',
        a: "Oui. Shopify télécharge lui-même les images depuis leur adresse, filigrane compris. La fiche arrive complète : titre, description, arguments de vente, métadonnées et prix.",
      },
    ],
  },
  {
    slug: 'google-shopping',
    name: 'Google Shopping',
    color: '#4285f4',
    integration: 'api-ready',
    title: 'Vendre sur Google Shopping : Merchant Center gratuit',
    description:
      'Référencer vos produits dans Google Shopping via Merchant Center : compte gratuit, flux produit, taxonomie Google et contraintes de conformité.',
    intro:
      "Google Shopping n'encaisse pas la vente : il envoie l'acheteur chez vous. Les fiches gratuites du Merchant Center placent vos produits dans l'onglet Shopping sans budget publicitaire, ce qui en fait le canal le moins cher pour une boutique qui démarre.",
    audience:
      "L'internaute qui passe par Shopping compare déjà des produits précis, souvent avec une référence en tête. Le titre et les attributs comptent plus que le discours commercial.",
    constraints:
      "Google exige un site marchand conforme : conditions générales de vente, politique de retour, prix et frais de livraison identiques entre le flux et la page. Un écart entre les deux entraîne la suspension du compte. Il faut aussi revendiquer et vérifier le domaine.",
    faq: [
      {
        q: 'Faut-il payer pour apparaître dans Google Shopping ?',
        a: "Non. Les fiches produit gratuites existent depuis 2020 dans l'onglet Shopping. La publicité achète de la visibilité supplémentaire, elle n'est pas une condition d'entrée.",
      },
      {
        q: 'Quelle catégorie choisir ?',
        a: "Google impose sa propre taxonomie produit. La catégorie de destination est calculée automatiquement à partir de la fiche importée.",
      },
    ],
  },
  {
    slug: 'cdiscount',
    name: 'Cdiscount',
    color: '#e2001a',
    integration: 'api-ready',
    title: 'Vendre sur Cdiscount : candidature et mise en ligne',
    description:
      'Devenir vendeur sur la marketplace Cdiscount : candidature, validation du compte, API marketplace et préparation des fiches produit.',
    intro:
      "Cdiscount est l'une des rares grandes marketplaces généralistes françaises indépendantes des géants américains. Son audience cherche le prix, dans l'électroménager, la maison, le high-tech et le jardin.",
    audience:
      "Le client Cdiscount est un acheteur français attentif au prix et aux promotions, souvent abonné au programme de livraison. Les volumes se font sur les produits du quotidien et l'équipement de la maison.",
    constraints:
      "L'accès à la marketplace passe par une candidature vendeur validée par Cdiscount, avec vérification de l'entreprise. La clé d'API n'est délivrée qu'ensuite. Les délais d'expédition annoncés sont contrôlés et pèsent sur le maintien du compte.",
    faq: [
      {
        q: 'Combien de temps prend la validation ?',
        a: 'Comptez de quelques jours à quelques semaines selon la complétude du dossier. Un SIRET actif et une assurance responsabilité civile professionnelle sont attendus.',
      },
      {
        q: 'Que se passe-t-il avant la validation ?',
        a: "La publication est enregistrée en attente, avec la catégorie de destination déjà calculée. Le jour où le compte est ouvert, rien n'est à refaire.",
      },
    ],
  },
  {
    slug: 'etsy',
    name: 'Etsy',
    color: '#f56400',
    integration: 'api-ready',
    title: 'Vendre sur Etsy : ce qui est autorisé, ce qui ferme la boutique',
    description:
      "Vendre sur Etsy : API publique en libre-service, mais un règlement qui interdit la revente de produits manufacturés. À lire avant d'ouvrir une boutique.",
    intro:
      "Etsy ouvre son API sans condition commerciale, ce qui en fait techniquement l'une des plateformes les plus faciles à connecter. Juridiquement, c'est la plus risquée de cette liste pour un vendeur en dropshipping.",
    audience:
      "L'acheteur Etsy vient chercher du fait main, du sur-mesure, du vintage ou des fournitures créatives. Il paie plus cher pour l'authenticité, et signale volontiers ce qui n'a pas sa place.",
    constraints:
      "Etsy interdit explicitement la revente de produits manufacturés achetés en gros. Seuls le fait main, le vintage de plus de vingt ans et les fournitures créatives sont autorisés. Publier des produits importés d'un grossiste expose à la fermeture définitive de la boutique.",
    faq: [
      {
        q: 'Peut-on faire du dropshipping sur Etsy ?',
        a: "Pas au sens habituel du terme. La production par un partenaire est tolérée si vous concevez le produit et déclarez ce partenaire, mais revendre un article de catalogue trouvé chez un grossiste est un motif de fermeture.",
      },
      {
        q: 'Pourquoi proposer Etsy alors ?',
        a: "Parce qu'un créateur qui fabrique ses pièces a toute sa place sur Etsy, et gagne à préparer ses fiches au même endroit que le reste de son catalogue. L'avertissement est affiché avant chaque publication.",
      },
    ],
  },
  {
    slug: 'tiktok-shop',
    name: 'TikTok Shop',
    color: '#000000',
    integration: 'api-ready',
    title: 'Vendre sur TikTok Shop en France',
    description:
      'Vendre sur TikTok Shop : boutique validée, Partner API, et ce que la vente par vidéo change dans la préparation des fiches produit.',
    intro:
      "TikTok Shop a inversé la logique d'achat : personne n'y cherche un produit, on le découvre au fil des vidéos. La fiche produit sert surtout à confirmer un achat déjà décidé émotionnellement.",
    audience:
      'Public jeune, achat d’impulsion, panier moyen bas. Les produits qui marchent sont visuels, démonstratifs, et se comprennent en trois secondes de vidéo.',
    constraints:
      "L'ouverture d'une boutique passe par une validation d'entreprise, puis par la création d'une application dans le Partner Center. Les règles de contenu s'appliquent aussi aux produits, et la modération retire une fiche rapidement.",
    faq: [
      {
        q: 'TikTok Shop est-il ouvert en France ?',
        a: "Le déploiement européen s'est fait pays par pays. Vérifiez l'éligibilité de votre entreprise dans le Seller Center avant de bâtir une stratégie dessus.",
      },
      {
        q: 'Faut-il tourner des vidéos ?',
        a: "Sans contenu, une boutique TikTok Shop ne génère quasiment rien : le catalogue seul n'est pas un canal de découverte sur cette plateforme.",
      },
    ],
  },
  {
    slug: 'wish',
    name: 'Wish',
    color: '#2fb7ec',
    integration: 'api-ready',
    title: 'Vendre sur Wish : inscription vendeur en libre-service',
    description:
      "Vendre sur Wish : inscription marchand sans validation commerciale, jeton d'API, et le positionnement prix qui y est attendu.",
    intro:
      "Wish appartient à la génération des marketplaces à très bas prix, où la découverte se fait dans un flux d'images plutôt que par une recherche. L'inscription marchand y est ouverte sans négociation.",
    audience:
      "L'acheteur cherche le prix le plus bas et accepte des délais de livraison longs. Les paniers sont faibles, la concurrence sur le prix est frontale.",
    constraints:
      "La plateforme a durci ses exigences sur les délais d'expédition et la qualité des fiches après plusieurs années de litiges. Les pénalités marchand sont automatiques et rapides.",
    faq: [
      {
        q: "L'inscription est-elle payante ?",
        a: "L'ouverture d'un compte marchand se fait en ligne ; les frais se prennent sur les ventes. Vérifiez la grille en vigueur dans votre espace avant de fixer vos prix.",
      },
      {
        q: 'Wish convient-il à un catalogue de marque ?',
        a: "Rarement. Le positionnement de la plateforme tire les prix vers le bas, ce qui cadre mal avec une marque qui construit une valeur perçue.",
      },
    ],
  },
  {
    slug: 'la-redoute',
    name: 'La Redoute',
    color: '#e5004f',
    integration: 'api-ready',
    title: 'Vendre sur La Redoute : marketplace Mirakl',
    description:
      'Devenir vendeur sur la marketplace La Redoute : candidature, sélection, back-office Mirakl et clé API.',
    intro:
      "La Redoute a transformé son catalogue historique en marketplace, opérée par Mirakl. L'enseigne y sélectionne ses vendeurs : ce n'est pas une inscription, c'est une candidature.",
    audience:
      "Clientèle française installée, plutôt féminine, forte sur la mode, la maison et la décoration. Le panier moyen est supérieur à celui des plateformes de petits prix, et l'exigence sur la qualité des visuels aussi.",
    constraints:
      "L'enseigne arbitre les candidatures selon son assortiment : un catalogue qui double une offre déjà présente passe difficilement. Une fois accepté, la clé d'API se récupère dans le back-office Mirakl.",
    faq: [
      {
        q: "Qu'est-ce que Mirakl change ?",
        a: "Mirakl est la technologie de marketplace utilisée par plusieurs enseignes françaises. La procédure et le format de catalogue sont proches d'une enseigne à l'autre, ce qui rend le deuxième référencement plus rapide que le premier.",
      },
      {
        q: 'Quels documents prévoir ?',
        a: "Extrait SIRET, assurance responsabilité civile professionnelle, coordonnées bancaires, et une présentation du catalogue avec les délais d'expédition.",
      },
    ],
  },
  {
    slug: 'e-leclerc',
    name: 'E.Leclerc',
    color: '#0055a4',
    integration: 'api-ready',
    title: 'Vendre sur la marketplace E.Leclerc',
    description:
      'Devenir vendeur tiers sur la marketplace E.Leclerc : candidature, validation par l’enseigne, catalogue et clé API Mirakl.',
    intro:
      "E.Leclerc a ouvert sa marketplace à des vendeurs tiers en s'appuyant, comme plusieurs enseignes françaises, sur la technologie Mirakl. La marque est un repère de confiance et de prix bas pour le grand public.",
    audience:
      "Clientèle familiale, très large, habituée à l'enseigne pour ses courses. Les produits du quotidien, la maison, le loisir et la puériculture y sont naturels ; le luxe ou la niche beaucoup moins.",
    constraints:
      "La candidature est arbitrée par l'enseigne et le positionnement prix compte : arriver plus cher qu'une référence déjà vendue en magasin n'a guère de sens ici.",
    faq: [
      {
        q: 'Faut-il être fournisseur des magasins ?',
        a: 'Non : la marketplace est un canal distinct de la centrale d’achat des magasins, avec sa propre procédure de candidature.',
      },
      {
        q: 'La procédure ressemble-t-elle à celle de La Redoute ?',
        a: "Techniquement oui, puisque les deux tournent sur Mirakl. Commercialement non : chaque enseigne sélectionne selon son propre assortiment.",
      },
    ],
  },
  {
    slug: 'bhv-marais',
    name: 'BHV Marais',
    color: '#e2001a',
    integration: 'api-ready',
    title: 'Vendre sur la marketplace BHV Marais',
    description:
      'Vendre sur BHV Marais : sélection éditoriale, candidature vendeur, back-office Mirakl et attentes en matière de visuels.',
    intro:
      "Le BHV Marais applique à sa marketplace la logique de son grand magasin : une sélection, pas un entrepôt. L'enseigne cherche des marques et des objets qui racontent quelque chose.",
    audience:
      "Clientèle parisienne et urbaine, sensible au design, à la décoration, à l'art de vivre et au bricolage haut de gamme. Le panier moyen est élevé, la tolérance à une fiche produit bâclée est nulle.",
    constraints:
      "La sélection est éditoriale : un catalogue générique de produits importés n'a pratiquement aucune chance d'être retenu. Les visuels doivent être soignés et cohérents.",
    faq: [
      {
        q: 'Quel type de catalogue est retenu ?',
        a: "Des marques identifiées, des créateurs, des objets à forte valeur perçue. C'est une sélection de grand magasin transposée en ligne.",
      },
      {
        q: 'Le filigrane sur les photos gêne-t-il ?',
        a: "Sur une marketplace haut de gamme, un filigrane trop voyant dessert la fiche. Réglez son opacité et sa taille avant de publier, ou publiez sans.",
      },
    ],
  },
  {
    slug: 'kiabi',
    name: 'Kiabi',
    color: '#e5007d',
    integration: 'api-ready',
    title: 'Vendre sur la marketplace Kiabi',
    description:
      'Vendre sur Kiabi : marketplace mode opérée par Mirakl, candidature vendeur, catalogue restreint à la mode et à la famille.',
    intro:
      "Kiabi a ouvert sa marketplace en restant fidèle à son terrain : la mode accessible pour toute la famille. Le catalogue accepté y est donc plus étroit que sur une marketplace généraliste.",
    audience:
      "Familles, budget maîtrisé, forte saisonnalité. Les tailles enfant et les basiques adultes constituent le cœur du trafic.",
    constraints:
      "Hors mode et univers famille, la candidature n'a pas d'objet. Les tailles, matières et entretiens doivent être renseignés proprement : ce sont les filtres que la clientèle utilise.",
    faq: [
      {
        q: 'Les attributs produit sont-ils obligatoires ?',
        a: "Sur une marketplace mode, ils conditionnent l'affichage dans les filtres. Une fiche sans taille ni matière est invisible pour la moitié des visiteurs.",
      },
      {
        q: 'Peut-on y vendre des accessoires ?',
        a: "Oui, tant qu'ils restent dans l'univers mode et famille de l'enseigne.",
      },
    ],
  },
  {
    slug: 'brandalley',
    name: 'BrandAlley',
    color: '#1a1a1a',
    integration: 'api-ready',
    title: 'Vendre sur BrandAlley : ventes privées de marques',
    description:
      'Vendre sur BrandAlley : fonctionnement par opérations de déstockage, marques identifiées exigées, candidature vendeur.',
    intro:
      "BrandAlley fonctionne par ventes privées : des opérations limitées dans le temps, construites autour d'une marque. Ce n'est pas un catalogue permanent, c'est un calendrier commercial.",
    audience:
      "Acheteurs à la recherche de marques connues à prix réduit. La remise affichée par rapport au prix conseillé est l'argument central.",
    constraints:
      "Les produits sans marque identifiée sont rarement acceptés : tout le modèle repose sur la notoriété de la marque déstockée. Il faut aussi pouvoir tenir un volume sur une période courte.",
    faq: [
      {
        q: 'Peut-on y vendre des produits sans marque ?',
        a: "C'est le principal motif de refus. BrandAlley vend de la marque à prix réduit, pas du produit générique.",
      },
      {
        q: 'Faut-il du stock ?',
        a: "Une opération de vente privée engage sur des quantités et des délais : le modèle sans stock s'y prête mal.",
      },
    ],
  },
  {
    slug: 'spartoo',
    name: 'Spartoo',
    color: '#ff6600',
    integration: 'api-ready',
    title: 'Vendre sur Spartoo : chaussures et maroquinerie',
    description:
      'Vendre sur Spartoo : marketplace spécialisée chaussures, maroquinerie et mode, candidature vendeur et attentes catalogue.',
    intro:
      "Spartoo s'est construit sur un créneau précis : la chaussure, puis la maroquinerie et la mode. Cette spécialisation est un avantage — l'acheteur qui arrive sait ce qu'il veut.",
    audience:
      "Recherche par pointure, par marque et par usage. Le retour gratuit est une norme du secteur : anticipez-le dans votre calcul de marge.",
    constraints:
      "Hors chaussures et accessoires mode, le catalogue n'est pas éligible. Les tailles et les correspondances de pointure doivent être exactes, sous peine de retours en cascade.",
    faq: [
      {
        q: 'Les retours sont-ils fréquents ?',
        a: "Dans la chaussure, le taux de retour est structurellement élevé. Un guide des tailles précis dans la fiche produit est la meilleure protection.",
      },
      {
        q: 'Faut-il une marque connue ?',
        a: "Moins que sur une plateforme de ventes privées, mais une fiche produit précise et des visuels nets restent indispensables.",
      },
    ],
  },
  {
    slug: 'miinto',
    name: 'Miinto',
    color: '#000000',
    integration: 'api-ready',
    title: 'Vendre sur Miinto : boutiques et marques référencées',
    description:
      'Vendre sur Miinto : marketplace mode réservée aux boutiques et marques établies, candidature exigeante.',
    intro:
      "Miinto met en avant des boutiques de mode indépendantes et des marques établies. La plateforme se pense comme une vitrine de sélections, pas comme un entrepôt ouvert.",
    audience:
      "Clientèle mode urbaine, attentive aux marques et aux collections en cours. Le panier moyen y est supérieur à celui des plateformes généralistes.",
    constraints:
      "La candidature est réservée aux boutiques physiques et aux marques référencées : un vendeur en dropshipping sans marque propre n'y a pratiquement pas d'accès.",
    faq: [
      {
        q: 'Faut-il une boutique physique ?',
        a: "C'est le profil recherché par la plateforme, avec les marques en direct. Une candidature sans l'un ni l'autre aboutit rarement.",
      },
      {
        q: 'Que faire en attendant ?',
        a: 'Préparer un catalogue propre : fiches complètes, visuels cohérents, marques identifiées. C’est ce qui est examiné.',
      },
    ],
  },
  {
    slug: 'atlas-for-men',
    name: 'Atlas For Men',
    color: '#004b8d',
    integration: 'none',
    title: 'Peut-on vendre sur Atlas For Men ? La réponse est non',
    description:
      "Atlas For Men n'est pas une marketplace : l'enseigne vend sa propre marque et n'accepte pas de vendeurs tiers. Les alternatives pour un catalogue outdoor.",
    intro:
      "La question revient régulièrement, la réponse est nette : Atlas For Men n'est pas une marketplace. C'est un détaillant en marque propre, qui conçoit et vend ses propres vêtements outdoor par catalogue et sur son site.",
    audience:
      "Le public d'Atlas For Men — vêtements de plein air, public masculin, achat par catalogue — existe bel et bien, mais il s'atteint ailleurs.",
    constraints:
      "Il n'existe aucun espace vendeur tiers, aucune API de mise en ligne, et aucune procédure de candidature. Aucune publication n'est possible, par quelque outil que ce soit.",
    faq: [
      {
        q: 'Existe-t-il un espace vendeur Atlas For Men ?',
        a: "Non. L'enseigne distribue sa propre marque ; il n'y a pas de place de marché ouverte à des vendeurs extérieurs.",
      },
      {
        q: 'Où vendre un catalogue outdoor alors ?',
        a: 'Les marketplaces généralistes et les sites spécialisés sport et plein air sont les débouchés réalistes, en plus de votre propre boutique.',
      },
    ],
  },
]
