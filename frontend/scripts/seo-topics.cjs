/**
 * Topic pages — the national dropshipping queries, as opposed to the
 * "vendre sur <plateforme>" pages.
 *
 * Deliberately no city pages ("dropshipping Lyon", "dropshipping Marseille"…):
 * mass-produced pages differing only by a place name are doorway pages, an
 * explicit Google violation that gets the whole domain demoted. National coverage
 * is obtained by covering the questions people actually type, not by multiplying
 * place names over the same text.
 */
module.exports = [
  {
    slug: 'dropshipping',
    title: 'Dropshipping : comment ça marche, et comment vendre sans stock',
    description:
      "Le dropshipping expliqué sans promesse creuse : le principe, la marge réelle, les obligations légales en France, et les plateformes où publier.",
    hub: true,
    intro:
      "Le dropshipping consiste à vendre un produit que vous ne détenez pas : la commande arrive chez vous, le fournisseur expédie directement à l'acheteur. Aucun stock à financer, aucune logistique à monter. En contrepartie, votre valeur ajoutée n'est ni le produit ni la livraison : elle est dans la qualité de vos annonces, le choix de vos canaux et votre service client.",
    sections: [
      {
        h2: 'Ce que vous gagnez, ce que vous perdez',
        paragraphs: [
          "Vous gagnez la trésorerie : rien n'est acheté avant d'être vendu. Vous pouvez tester vingt produits en une semaine sans immobiliser un euro de marchandise, et arrêter ceux qui ne partent pas sans avoir de stock mort sur les bras.",
          "Vous perdez le contrôle sur ce qui compte pour l'acheteur : le délai, l'emballage, la conformité du produit reçu. Un fournisseur qui expédie en trois semaines dégrade votre note vendeur, sur une plateforme où c'est votre compte qui est sanctionné, pas le sien.",
          "La marge se calcule sur le prix d'achat plus les frais de port fournisseur, pas sur le seul prix d'achat. Une marge de 50 % qui oublie huit euros de livraison est une marge fictive.",
        ],
      },
      {
        h2: 'Vos obligations en France',
        paragraphs: [
          "Vendre régulièrement en ligne est une activité commerciale : elle suppose une immatriculation, une facturation et une déclaration de revenus. Le régime de la micro-entreprise suffit pour commencer, tant que les seuils de chiffre d'affaires ne sont pas dépassés.",
          "Vous êtes le vendeur aux yeux de la loi, pas un intermédiaire : la garantie légale de conformité, le droit de rétractation de quatorze jours et le service après-vente vous incombent, quel que soit le pays d'où part le colis.",
          "Les importations hors Union européenne entraînent TVA à l'importation et formalités douanières, y compris pour les petits colis. Un prix de vente qui ignore ces frais transforme la marge en perte au premier litige.",
          "Enfin, votre site doit afficher des mentions légales, des conditions générales de vente et une politique de retour. C'est une obligation, et c'est aussi ce que Google Merchant Center vérifie avant d'accepter un flux produit.",
        ],
        note: "Ces éléments sont donnés à titre d'information générale et ne constituent pas un conseil juridique : vérifiez votre situation avec un professionnel.",
      },
      {
        h2: 'Où publier vos produits',
        paragraphs: [
          "Trois familles de canaux coexistent. Votre propre boutique d'abord — Shopify ou un site à vous — où vous ne payez aucune commission et gardez le client. Les marketplaces à API ensuite, qui exigent un compte vendeur validé mais apportent un trafic considérable. Les plateformes d'annonces enfin, Vinted, Leboncoin, Facebook Marketplace, sans API mais avec une audience française énorme et gratuite.",
          "Aucune de ces familles ne suffit seule. Un catalogue diffusé sur un seul canal dépend entièrement des règles de ce canal, qui peuvent changer du jour au lendemain.",
        ],
      },
      {
        h2: 'Le vrai goulot : la mise en ligne',
        paragraphs: [
          "Importer un produit prend une minute. Le rédiger correctement, le traduire, lui trouver une catégorie par plateforme, filigraner ses photos, puis ressaisir tout cela dans quatre formulaires différents : c'est là que partent les journées.",
          "C'est le problème que DropShipper IA traite. L'annonce est rédigée une fois, puis diffusée : publication réelle par API là où c'est possible, remplissage assisté du formulaire là où aucune API n'existe.",
        ],
      },
    ],
    faq: [
      {
        q: 'Le dropshipping est-il légal en France ?',
        a: "Oui, c'est une forme de vente à distance comme une autre. Ce qui est illégal, c'est de l'exercer sans immatriculation, sans facturer la TVA due, ou en trompant l'acheteur sur les délais et l'origine du produit.",
      },
      {
        q: 'Faut-il un budget publicitaire pour démarrer ?',
        a: "Pas nécessairement. Les plateformes d'annonces gratuites et les fiches gratuites de Google Shopping permettent de tester une offre sans budget, avant d'envisager la publicité.",
      },
      {
        q: 'Combien de produits faut-il en ligne ?',
        a: "Mieux vaut vingt fiches complètes et bien catégorisées que deux cents fiches bâclées : sur toutes les plateformes, la qualité de la fiche conditionne son affichage.",
      },
    ],
  },
  {
    slug: 'logiciel-dropshipping',
    title: 'Logiciel de dropshipping français : que doit-il faire',
    description:
      "Ce qu'un logiciel de dropshipping doit réellement apporter : import produit, réécriture des fiches, filigrane, publication multi-plateformes et calcul de marge.",
    intro:
      "La plupart des outils vendus sous le nom de « logiciel de dropshipping » font une seule chose : copier une fiche d'un fournisseur vers une boutique. C'est utile, mais c'est la partie la plus facile du travail.",
    sections: [
      {
        h2: 'Les cinq fonctions qui font gagner du temps',
        paragraphs: [
          "Importer, d'abord : depuis une adresse web, ou depuis la page elle-même quand le site construit sa fiche en JavaScript et qu'une simple adresse ne donne rien.",
          "Réécrire ensuite. Recopier telle quelle la description d'un fournisseur, c'est publier du contenu dupliqué, souvent mal traduit, que les moteurs ignorent et que les acheteurs fuient.",
          "Protéger les photos, avec un filigrane à vos couleurs, sans quoi vos visuels se retrouvent chez le concurrent d'à côté.",
          "Calculer la marge sur le coût réel, frais de port fournisseur inclus.",
          "Diffuser enfin, vers plusieurs canaux, en tenant compte du fait que chacun a sa propre taxonomie de catégories.",
        ],
      },
      {
        h2: 'Ce qu’aucun logiciel honnête ne promet',
        paragraphs: [
          "La publication automatique sur Vinted, Leboncoin ou Facebook Marketplace. Ces plateformes n'ont pas d'API publique d'annonces : un outil qui prétend publier tout seul rejoue votre session, ce qui viole leurs conditions d'utilisation et fait suspendre les comptes.",
          "La seule approche tenable est le remplissage assisté : le formulaire est ouvert dans votre navigateur, pré-rempli avec votre annonce, et c'est vous qui validez.",
        ],
      },
      {
        h2: 'Pourquoi le français change tout',
        paragraphs: [
          "Une fiche rédigée en anglais puis traduite mécaniquement se repère en trois secondes, et elle se vend mal. Les attributs attendus par les marketplaces françaises — matière, coupe, taille, saison — ne se devinent pas depuis une fiche asiatique.",
          "DropShipper IA rédige directement en français : titre, description, neuf attributs structurés, six arguments de vente et vingt mots-clés, à partir de la fiche importée.",
        ],
      },
    ],
    faq: [
      {
        q: 'Faut-il savoir coder ?',
        a: "Non. La seule étape technique est la connexion d'une boutique Shopify, qui consiste à copier un jeton depuis votre propre admin.",
      },
      {
        q: 'Peut-on brancher son site existant ?',
        a: "Oui : une adresse de catalogue au format JSON est fournie, à lire depuis votre site. Aucune clé n'est nécessaire, elle est en lecture seule.",
      },
    ],
  },
  {
    slug: 'vendre-sans-stock',
    title: 'Vendre sans stock : ce que ça change concrètement',
    description:
      'Vendre sans stock : trésorerie, délais, service après-vente et calcul de marge. Les points qui décident de la rentabilité.',
    intro:
      "Vendre sans stock n'est pas une astuce, c'est un arbitrage : vous échangez le risque financier contre une perte de contrôle sur l'exécution. Savoir ce que vous perdez est la condition pour que ça marche.",
    sections: [
      {
        h2: 'La trésorerie change de camp',
        paragraphs: [
          "Sans stock, vous encaissez avant de payer. C'est le principal avantage, et il permet de tester large : vingt produits en ligne coûtent le temps de les préparer, pas le prix de vingt lots.",
          "L'inconvénient arrive au premier remboursement : vous remboursez l'acheteur immédiatement, alors que le remboursement du fournisseur, lui, prendra des semaines, quand il arrive.",
        ],
      },
      {
        h2: 'Les délais sont votre principal risque',
        paragraphs: [
          "Annoncer un délai réaliste vaut mieux qu'annoncer un délai attractif : sur une marketplace, un retard mesuré dégrade votre compte vendeur, et sur les avis clients il coûte plus cher qu'une vente perdue.",
          "Un produit dont le fournisseur expédie en trois semaines n'a pas sa place sur une plateforme où l'acheteur compare les délais avant le prix.",
        ],
      },
      {
        h2: 'Calculer une marge qui tient',
        paragraphs: [
          "Marge brute = prix de vente − prix d'achat − frais de port fournisseur. Ensuite viennent la commission de la plateforme, les frais de paiement, et une provision pour retours et litiges.",
          "Un taux de retour de 10 % sur un produit à faible marge suffit à annuler le bénéfice de tout un lot. Dans la chaussure et le vêtement, c'est la norme, pas l'exception.",
        ],
      },
    ],
    faq: [
      {
        q: 'Peut-on vendre sans stock sur toutes les plateformes ?',
        a: "Non. Certaines l'encadrent strictement, notamment Amazon qui impose que vous soyez le vendeur enregistré sur les documents d'expédition, et Etsy qui interdit la revente de produits manufacturés.",
      },
      {
        q: 'Faut-il commander un échantillon ?',
        a: "C'est la meilleure dépense possible : elle vous dit ce que l'acheteur recevra vraiment, et vous donne des photos qui n'appartiennent qu'à vous.",
      },
    ],
  },
  {
    slug: 'importer-produits-temu-joybuy',
    title: 'Importer des produits Temu, JoyBuy ou AliExpress',
    description:
      "Pourquoi l'import par simple adresse échoue sur Temu, JoyBuy, AliExpress et Shein, et comment récupérer quand même prix, photos et variantes.",
    intro:
      "Coller l'adresse d'un produit Temu dans un outil d'import ne donne rien, ou une coquille vide sans prix ni photos. Ce n'est pas un défaut de l'outil : c'est la façon dont ces sites sont construits.",
    sections: [
      {
        h2: 'Pourquoi une adresse ne suffit pas',
        paragraphs: [
          "Temu, JoyBuy, AliExpress et Shein assemblent leur fiche produit dans le navigateur, en JavaScript, après le chargement de la page. Un serveur qui demande cette adresse reçoit une page pratiquement vide : le prix, les photos et les variantes n'y sont pas encore.",
          "Ces sites détectent en outre les requêtes automatisées et renvoient une page de contrôle. Un outil qui prétend importer Temu depuis une simple adresse vous renverra, au mieux, un titre.",
        ],
      },
      {
        h2: 'La seule méthode qui fonctionne',
        paragraphs: [
          "Il faut lire la page là où elle est complète : dans votre navigateur, une fois affichée. C'est le rôle de l'extension Chrome : sur la fiche produit, un bouton envoie vers votre catalogue le titre, le prix, les photos et les variantes tels que vous les voyez.",
          "Aucune donnée n'est lue tant que vous n'avez pas autorisé le site, un par un, depuis le panneau de l'extension.",
        ],
      },
      {
        h2: 'Et après l’import',
        paragraphs: [
          "Une fiche importée est un point de départ, pas une annonce. La description d'origine est souvent traduite mécaniquement et truffée de mentions du fournisseur : republier telle quelle, c'est du contenu dupliqué qui ne se référence pas.",
          "La réécriture par IA produit un titre, une description, des attributs et des mots-clés en français, à partir de ce qui a été importé. Les photos passent au filigrane à vos couleurs dans la foulée.",
        ],
      },
    ],
    faq: [
      {
        q: "L'import par adresse fonctionne-t-il sur d'autres sites ?",
        a: "Oui, sur la majorité des boutiques classiques dont la fiche produit est présente dans la page servie. L'extension reste toutefois la méthode la plus complète, notamment pour les variantes.",
      },
      {
        q: 'Peut-on importer plusieurs produits à la fois ?',
        a: 'Jusqu’à vingt-cinq adresses en une fois pour les sites compatibles, une par ligne.',
      },
    ],
  },
  {
    slug: 'publier-annonces-plusieurs-marketplaces',
    title: 'Publier ses annonces sur plusieurs marketplaces à la fois',
    description:
      'Diffuser un catalogue sur plusieurs marketplaces : ce qui est automatisable par API, ce qui exige un remplissage assisté, et comment publier en lot.',
    intro:
      "Multiplier les canaux est le moyen le plus simple d'augmenter les ventes sans augmenter le budget publicitaire. Encore faut-il ne pas ressaisir la même annonce cinq fois.",
    sections: [
      {
        h2: 'Deux mondes, deux méthodes',
        paragraphs: [
          "D'un côté les destinations à API : votre propre boutique, Shopify, et les marketplaces qui délivrent une clé à leurs vendeurs validés. La publication y est réellement automatique, et se fait en lot, pour cent annonces d'un coup si besoin.",
          "De l'autre les plateformes sans API publique d'annonces : Vinted, Leboncoin, Facebook Marketplace. Là, le formulaire s'ouvre dans votre navigateur, pré-rempli, et vous validez. Ce n'est pas automatisable en lot, et aucun outil sérieux ne prétendra le contraire.",
        ],
      },
      {
        h2: 'Le piège des catégories',
        paragraphs: [
          "Chaque plateforme a sa taxonomie. La même paire de baskets s'appelle « Chaussures » ici, « Sneakers » là, et suit une arborescence à trois niveaux ailleurs. Une catégorie mal choisie ne se voit pas : elle rend simplement l'annonce invisible dans les filtres.",
          "La catégorie de destination est calculée pour chaque plateforme au moment de la publication, à partir de la catégorie choisie une seule fois dans votre catalogue.",
        ],
      },
      {
        h2: 'Publier en lot',
        paragraphs: [
          "Dans la liste des annonces, en vue grille ou en vue liste, chaque fiche porte une case à cocher. Une fois la sélection faite, un seul bouton publie l'ensemble vers les destinations à API choisies.",
          "L'envoi se fait annonce par annonce, pour ne pas déclencher les limitations de débit des plateformes, et le résultat détaille ce qui est publié, ce qui reste en attente et ce qui a échoué, avec le motif.",
        ],
      },
    ],
    faq: [
      {
        q: 'Peut-on publier en lot sur Vinted ?',
        a: "Non. Vinted exige une validation manuelle de chaque annonce ; la publication en lot est réservée aux destinations à API.",
      },
      {
        q: 'Que devient une publication vers une plateforme non connectée ?',
        a: "Elle est enregistrée en attente, avec sa catégorie de destination déjà calculée. Le jour où le compte vendeur est validé, rien n'est à ressaisir.",
      },
    ],
  },
  {
    slug: 'filigrane-photos-produits',
    title: 'Filigrane sur les photos produit : pourquoi et comment',
    description:
      'Protéger ses photos produit avec un filigrane : utilité réelle, réglages qui ne gâchent pas la fiche, et automatisation à l’import.',
    intro:
      "Une photo produit publiée sur une marketplace est copiée dans l'heure par un concurrent. Le filigrane ne l'empêche pas techniquement, mais il rend la copie visible et coûteuse à effacer.",
    sections: [
      {
        h2: 'Ce que le filigrane apporte vraiment',
        paragraphs: [
          "Il dissuade la reprise paresseuse, celle qui représente l'essentiel du problème. Il identifie aussi vos visuels quand ils circulent, ce qui facilite un signalement auprès de la plateforme.",
          "Il ne protège pas contre un concurrent déterminé, qui recadrera ou retouchera. C'est un dissuasif, pas un verrou.",
        ],
      },
      {
        h2: 'Les réglages qui comptent',
        paragraphs: [
          "Un filigrane trop opaque abîme la fiche et fait fuir l'acheteur ; trop discret, il ne sert à rien. Une opacité autour de 70 %, une largeur d'environ un cinquième de l'image, et un placement en bas centré constituent un compromis sûr.",
          "Sur les marketplaces haut de gamme, réduisez-le encore, voire publiez sans : une sélection éditoriale refuse les visuels chargés.",
        ],
      },
      {
        h2: 'L’appliquer sans y penser',
        paragraphs: [
          "Le filigrane est appliqué automatiquement à l'import, sur toutes les photos, à partir de votre logo ou de votre texte. Le logo doit être un PNG à fond transparent ou un SVG : un JPEG, sans couche alpha, collerait un rectangle opaque sur la photo.",
        ],
      },
    ],
    faq: [
      {
        q: 'Peut-on utiliser son logo ?',
        a: 'Oui, en PNG à fond transparent ou en SVG. Il prend le pas sur le filigrane texte lorsqu’il est défini.',
      },
      {
        q: 'Les photos filigranées partent-elles sur les marketplaces ?',
        a: "Oui, ce sont elles qui sont transmises, y compris sur Shopify qui les télécharge lui-même, et dans le lot de photos préparé pour les dépôts manuels.",
      },
    ],
  },
  {
    slug: 'creation-boutique-en-ligne-gratuite',
    title: 'Créer une boutique en ligne gratuite et instantanée',
    description:
      "Ouvrir une boutique en ligne gratuite, en quelques secondes, sans abonnement Shopify à 29 € par mois : ce qui est inclus, ce qui reste à votre charge.",
    intro:
      "Ouvrir une boutique en ligne ne devrait pas commencer par un abonnement. DropShipper IA vous crée une boutique gratuite et instantanée : une adresse en ligne, votre catalogue, votre logo et vos couleurs, sans frais mensuels ni carte bancaire pour démarrer.",
    sections: [
      {
        h2: 'Gratuite, et vraiment gratuite',
        paragraphs: [
          "Pas d'abonnement à 29 € par mois, pas de commission sur vos ventes, pas de période d'essai qui se transforme en prélèvement. Votre boutique est incluse : vous ne payez que ce que vous consommez réellement, l'import et la réécriture de vos annonces, à l'unité.",
          "La différence avec un abonnement classique est simple : une boutique Shopify coûte le même prix qu'elle vende dix produits ou zéro. Ici, une boutique qui dort ne coûte rien.",
        ],
      },
      {
        h2: 'Instantanée : en ligne en quelques secondes',
        paragraphs: [
          "La boutique naît toute seule à votre première publication : une adresse publique, une page d'accueil, vos fiches produit déjà en vente. Aucun thème à configurer pendant des heures, aucun nom de domaine obligatoire pour commencer — vous pourrez brancher le vôtre plus tard.",
          "Vos photos partent filigranées à vos couleurs, vos fiches sont rédigées en français, et le panier et la prise de commande fonctionnent dès la première minute.",
        ],
      },
      {
        h2: 'Ce que la boutique vous garde',
        paragraphs: [
          "Sur une place de marché, le client appartient à la plateforme : vous ne connaissez ni son adresse e-mail, ni son historique, et vous ne pouvez pas le fidéliser. Sur votre boutique, le client est à vous, et aucune commission ne s'intercale entre lui et vous.",
          "La bonne stratégie n'oppose pas les deux : les marketplaces apportent le trafic, la boutique garde la marge et la relation. On publie aux deux endroits à partir de la même fiche.",
        ],
      },
      {
        h2: 'Le nom de domaine, si vous le voulez',
        paragraphs: [
          "L'adresse gratuite suffit pour vendre. Le jour où vous voulez une adresse à votre marque, vous renseignez votre nom de domaine dans « Mes sites » : la boutique répond alors sur votre adresse à vous, sans rien perdre de ce qui est déjà en ligne.",
        ],
      },
    ],
    faq: [
      {
        q: 'La boutique gratuite prend-elle une commission sur mes ventes ?',
        a: "Non. Aucune commission n'est prélevée sur les ventes de votre boutique : le prix payé par le client vous revient, moins seulement les frais de votre solution de paiement.",
      },
      {
        q: 'Faut-il un abonnement Shopify en plus ?',
        a: "Non. La boutique de DropShipper IA remplace le besoin d'un abonnement Shopify pour démarrer. Si vous avez déjà une boutique Shopify, vous pouvez aussi y publier : les deux coexistent.",
      },
      {
        q: 'Peut-on utiliser son propre nom de domaine ?',
        a: "Oui. L'adresse gratuite fonctionne immédiatement, et vous pouvez brancher votre nom de domaine quand vous le souhaitez depuis « Mes sites ».",
      },
    ],
  },
  {
    slug: 'dropshipping-automatique',
    title: 'Dropshipping automatique : le mode Auto-SHIPPER IA',
    description:
      "Le dropshipping en pilote automatique : sélection des produits gagnants, réécriture, filigrane et publication sans intervention. Ce que l'Auto-SHIPPER IA fait, et ce qu'il coûte.",
    intro:
      "Faire tourner une boutique de dropshipping, c'est répéter les mêmes gestes chaque jour : chercher les produits qui marchent, rédiger, protéger les photos, publier. Le mode Auto-SHIPPER IA enchaîne tout cela sans vous — vous fixez le cadre, il exécute.",
    sections: [
      {
        h2: 'Ce que l’Auto-SHIPPER IA enchaîne tout seul',
        paragraphs: [
          "À chaque passage, il récupère une analyse de marché et les produits gagnants sélectionnés, importe ceux qui rentrent dans vos critères, laisse l'IA rédiger l'annonce en français, filigrane les photos à vos couleurs, puis publie — sur votre boutique et sur les marketplaces que vous avez reliées.",
          "Tout ce que vous faites à la main dans un import est fait à l'identique en automatique, avec les mêmes contrôles de qualité sur les photos et le même refus des fiches sans matière.",
        ],
      },
      {
        h2: 'Vous gardez la main',
        paragraphs: [
          "L'automatique n'est pas l'aveugle. Vous choisissez les rayons, le nombre de produits gagnants par rayon, et le rythme des passages. Rien ne part sans que le cadre que vous avez posé l'autorise.",
          "Chaque passage est plafonné et facturé d'avance, en drops : pas de dérive de coût, pas de surprise en fin de mois. Un passage qui échoue est remboursé.",
        ],
      },
      {
        h2: 'Automatique ne veut pas dire sur tous les canaux',
        paragraphs: [
          "La publication réellement automatique se fait là où une API le permet : votre boutique, Shopify, et les marketplaces qui délivrent une clé à leurs vendeurs validés. Sur Vinted, Leboncoin ou Facebook Marketplace, aucune API publique d'annonces n'existe — publier à votre place y violerait les conditions d'utilisation et ferait suspendre le compte.",
          "Pour ces plateformes, l'Auto-SHIPPER IA prépare tout, et le dépôt final passe par le remplissage assisté que vous validez.",
        ],
        note: "L'Auto-SHIPPER IA force le contrôle des photos par l'IA sur ses imports, parce que personne ne les relit à l'œil : c'est un coût par annonce contrôlée, annoncé d'avance.",
      },
    ],
    faq: [
      {
        q: 'Le dropshipping automatique publie-t-il vraiment sans moi ?',
        a: "Oui, sur les destinations à API : la fiche est importée, rédigée, filigranée et publiée sans intervention. Sur les plateformes sans API d'annonces, il prépare tout et vous validez le dépôt.",
      },
      {
        q: 'Combien coûte un passage de l’Auto-SHIPPER IA ?',
        a: "Chaque passage est facturé d'avance en drops, par rayon et par tranche, et chaque produit importé consomme son coût d'annonce. Le détail et un simulateur sont affichés sur la page Auto-SHIPPER IA avant activation.",
      },
      {
        q: 'Peut-on arrêter à tout moment ?',
        a: "Oui. L'Auto-SHIPPER IA s'active et se désactive quand vous voulez ; sans activation, aucun passage n'a lieu et rien n'est facturé.",
      },
    ],
  },
]
