/**
 * Lire la catégorie dans le titre, comme le fait chaque place de marché.
 *
 * C'est le signal qui manquait, et son absence explique l'essentiel du désordre
 * constaté le 31/08/2026 : seize produits — souris, mini-PC, perceuses Makita,
 * bagues connectées, un aspirateur — rangés dans « Jouets et jeux > Figurines et
 * jouets d'action ». Pas parce que le référentiel est pauvre, mais parce que
 * toute la décision reposait sur la catégorie annoncée par la source, et
 * qu'AliExpress annonçait `« la catégorie Maison »` pour les seize.
 *
 * Le titre, lui, ne mentait pas. « Souris Verticale Sans Fil Ergonomique » est
 * sans ambiguïté ; « Perceuse visseuse à percussion Makita » aussi. Vinted,
 * Leboncoin et eBay proposent une catégorie dès qu'on tape le titre, et c'est
 * exactement ce qu'ils lisent.
 *
 * **Déterministe et gratuit.** Aucun appel au modèle : il tourne donc sur les
 * annonces déjà importées sans rien repayer, et il répond en microsecondes là où
 * le modèle prend une seconde et coûte.
 *
 * Les cibles sont écrites en **chemin lisible**, pas en identifiant. Un chemin
 * se relit et se corrige ; un slug de quatre-vingts caractères ne se vérifie
 * pas. La résolution se fait à l'exécution contre le référentiel réel, et un
 * chemin qui n'existe plus est simplement ignoré — jamais rangé de travers.
 */

/** Retire accents, casse et ponctuation : « Écouteurs » et « ecouteurs ». */
export function nu(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Regle {
  /** Les mots qui déclenchent, cherchés comme mots entiers. */
  mots: string[]
  /** Le chemin visé dans le référentiel. */
  vers: string
  /**
   * Un mot qui annule la règle.
   *
   * « Housse » seul est une coque de téléphone ; « housse de siège » est une
   * pièce automobile. Sans garde, un accessoire auto partirait en téléphonie.
   */
  sauf?: string[]
  /**
   * Poids de la règle. Un mot très spécifique (« tronconneuse ») doit battre un
   * mot générique (« sans fil ») quand les deux apparaissent dans le titre.
   */
  poids?: number
}

/*
 * L'ordre n'a pas d'importance : c'est le poids qui tranche. Il compte en
 * revanche que les mots soient écrits sans accent et au singulier — la
 * recherche se fait sur le titre normalisé, et le pluriel est traité.
 */
const REGLES: Regle[] = [
  // --- Informatique -------------------------------------------------------
  { mots: ['souris', 'clavier', 'tapis de souris', 'webcam', 'cle usb', 'disque dur', 'ssd', 'mini pc', 'ordinateur', 'pc portable', 'laptop', 'moniteur', 'ecran pc', 'ecran portable', 'ecran tactile', 'imprimante', 'scanner', 'routeur', 'switch reseau', 'carte graphique', 'processeur', 'barrette ram', 'ventirad', 'boitier pc', 'hub usb', 'station accueil'], vers: 'Électronique > Informatique et accessoires PC', poids: 3 },
  { mots: ['casque audio', 'enceinte', 'barre de son', 'haut parleur', 'ampli', 'amplificateur', 'platine vinyle', 'chaine hifi', 'subwoofer', 'caisson de basse'], vers: 'Électronique > Audio (enceintes, casques)', poids: 3 },
  { mots: ['televiseur', 'tele', 'tv', 'videoprojecteur', 'projecteur video', 'ecran tv'], vers: 'Électronique > Télévisions et vidéoprojecteurs', poids: 3 },
  { mots: ['appareil photo', 'camera', 'camescope', 'objectif photo', 'trepied photo', 'gopro', 'action cam'], vers: 'Électronique > Appareils photo et caméras', poids: 3, sauf: ['dashcam', 'camera de recul', 'camera de surveillance'] },
  { mots: ['drone', 'quadricoptere'], vers: 'Électronique > Drones et modélisme électronique', poids: 4 },
  { mots: ['tablette tactile', 'tablette android', 'tablette', 'ipad', 'liseuse'], vers: 'Électronique > Informatique et accessoires PC', poids: 4, sauf: ['tablette de chocolat', 'tablette murale'] },
  { mots: ['camera de surveillance', 'camera ip', 'videosurveillance', 'sonnette video', 'interphone video'], vers: 'Électronique > Objets connectés et domotique', poids: 5 },
  { mots: ['console', 'manette', 'jeu video', 'playstation', 'xbox', 'nintendo', 'switch oled'], vers: 'Électronique > Jeux vidéo et consoles', poids: 3 },
  { mots: ['ruban led', 'bandeau led', 'ampoule led', 'projecteur led', 'neon led', 'lampe led'], vers: 'Électronique > Éclairage et LED', poids: 3 },
  { mots: ['micro', 'microphone', 'table de mixage', 'carte son', 'controleur midi', 'pad rgb'], vers: 'Électronique > Sonorisation et micros', poids: 3 },
  { mots: ['pile', 'chargeur de pile', 'accumulateur'], vers: 'Électronique > Piles et chargeurs', poids: 2 },
  { mots: ['domotique', 'ampoule connectee', 'prise connectee', 'interrupteur connecte', 'interrupteur tactile', 'assistant vocal', 'thermostat connecte', 'serrure connectee', 'detecteur connecte'], vers: 'Électronique > Objets connectés et domotique', poids: 4 },

  // --- Téléphonie ---------------------------------------------------------
  { mots: ['smartphone', 'telephone portable', 'iphone', 'galaxy', 'xiaomi', 'telephone mobile'], vers: 'Téléphones portables et accessoires > Smartphones', poids: 3 },
  { mots: ['coque', 'housse telephone', 'etui telephone', 'coque silicone'], vers: 'Téléphones portables et accessoires > Coques et housses', poids: 3, sauf: ['housse de siege', 'housse de volant', 'housse de protection voiture'] },
  { mots: ['ecouteur', 'oreillette', 'airpods', 'ecouteurs sans fil'], vers: 'Téléphones portables et accessoires > Écouteurs et oreillettes', poids: 3 },
  { mots: ['powerbank', 'batterie externe', 'power bank'], vers: 'Téléphones portables et accessoires > Batteries externes (powerbanks)', poids: 4 },
  { mots: ['chargeur', 'cable de charge', 'chargeur induction', 'chargeur sans fil'], vers: 'Téléphones portables et accessoires > Chargeurs et câbles', poids: 2 },
  { mots: ['montre connectee', 'smartwatch', 'bracelet connecte', 'bague connectee', 'smart ring', 'montre intelligente', 'anneau intelligent', 'bague intelligente', 'anneau connecte'], vers: 'Téléphones portables et accessoires > Montres et bracelets connectés', poids: 5 },
  { mots: ['verre trempe', 'protection ecran', 'film protecteur'], vers: 'Téléphones portables et accessoires > Protections d\'écran', poids: 3 },
  { mots: ['perche a selfie', 'support telephone', 'stabilisateur', 'gimbal'], vers: 'Téléphones portables et accessoires > Supports et accessoires photo mobile', poids: 3 },

  // --- Outils et bricolage ------------------------------------------------
  { mots: ['perceuse', 'visseuse', 'meuleuse', 'scie sauteuse', 'scie circulaire', 'ponceuse', 'defonceuse', 'rabot', 'cloueuse', 'decapeur thermique', 'outil multifonction'], vers: 'Outils et bricolage > Outillage électroportatif', poids: 4 },
  { mots: ['tournevis', 'cle a molette', 'marteau', 'pince', 'jeu de cles', 'cliquet', 'douille', 'scie a main', 'burin', 'lime'], vers: 'Outils et bricolage > Outillage à main', poids: 3 },
  { mots: ['telemetre', 'niveau laser', 'multimetre', 'pied a coulisse', 'testeur electrique', 'thermometre infrarouge', 'humidimetre'], vers: 'Outils et bricolage > Mesure et instruments de précision', poids: 4 },
  { mots: ['fer a souder', 'poste a souder', 'station de soudage', 'etain de soudure'], vers: 'Outils et bricolage > Soudure', poids: 4 },
  { mots: ['cadenas', 'serrure', 'coffre fort', 'cylindre de serrure'], vers: 'Outils et bricolage > Serrurerie', poids: 3 },
  { mots: ['vis', 'boulon', 'cheville', 'rivet', 'collier de serrage', 'ecrou'], vers: 'Outils et bricolage > Quincaillerie et fixations', poids: 2 },
  { mots: ['robinet', 'mitigeur', 'pommeau de douche', 'flexible douche', 'siphon', 'joint plomberie'], vers: 'Outils et bricolage > Plomberie', poids: 3 },

  // --- Jardin -------------------------------------------------------------
  { mots: ['tronconneuse', 'debroussailleuse', 'taille haie', 'tondeuse a gazon', 'souffleur de feuilles', 'motobineuse', 'elagueuse'], vers: 'Terrasse, pelouse et jardin > Outillage de jardin', poids: 5 },
  { mots: ['arrosoir', 'tuyau d arrosage', 'goutte a goutte', 'programmateur arrosage', 'asperseur'], vers: 'Terrasse, pelouse et jardin > Arrosage et irrigation', poids: 3 },
  { mots: ['barbecue', 'plancha', 'fumoir', 'brasero'], vers: 'Terrasse, pelouse et jardin > Barbecue et cuisine extérieure', poids: 4 },
  { mots: ['lampe solaire', 'borne solaire', 'guirlande exterieure', 'projecteur solaire'], vers: 'Terrasse, pelouse et jardin > Éclairage extérieur solaire', poids: 3 },
  { mots: ['piscine', 'spa gonflable', 'jacuzzi', 'robot de piscine'], vers: 'Terrasse, pelouse et jardin > Piscines et spas', poids: 4 },
  { mots: ['serre de jardin', 'pot de fleurs', 'jardiniere', 'terreau', 'graines'], vers: 'Terrasse, pelouse et jardin > Serres et jardinage', poids: 3 },

  // --- Électroménager -----------------------------------------------------
  { mots: ['aspirateur', 'nettoyeur vapeur', 'balai vapeur', 'robot aspirateur', 'karcher', 'nettoyeur haute pression'], vers: 'Appareils électroménagers > Aspirateurs et nettoyage', poids: 5 },
  { mots: ['cafetiere', 'machine a cafe', 'expresso', 'moka', 'bouilloire', 'theiere electrique', 'percolateur'], vers: 'Appareils électroménagers > Cafetières et théières électriques', poids: 4 },
  { mots: ['friteuse', 'air fryer', 'four', 'micro ondes', 'plaque de cuisson', 'cuiseur', 'autocuiseur', 'multicuiseur', 'gaufrier', 'crepiere'], vers: 'Appareils électroménagers > Cuiseurs et appareils de cuisson', poids: 4 },
  { mots: ['blender', 'mixeur', 'robot culinaire', 'hachoir', 'centrifugeuse', 'extracteur de jus', 'batteur'], vers: 'Appareils électroménagers > Préparation culinaire (robots, mixeurs)', poids: 4 },
  { mots: ['refrigerateur', 'congelateur', 'lave linge', 'seche linge', 'lave vaisselle', 'machine a laver'], vers: 'Appareils électroménagers > Gros électroménager (réfrigérateurs, machines à laver)', poids: 4 },
  { mots: ['fer a repasser', 'centrale vapeur', 'defroisseur', 'machine a coudre'], vers: 'Appareils électroménagers > Entretien du linge (repassage, couture)', poids: 3 },
  { mots: ['climatiseur', 'ventilateur', 'radiateur', 'chauffage d appoint', 'purificateur d air', 'deshumidificateur', 'humidificateur'], vers: 'Appareils électroménagers > Climatisation, chauffage et qualité de l\'air', poids: 4 },
  { mots: ['grille pain', 'balance de cuisine', 'trancheuse', 'yaourtiere', 'machine a pain'], vers: 'Appareils électroménagers > Petit électroménager de cuisine', poids: 3 },

  // --- Beauté et santé ----------------------------------------------------
  { mots: ['parfum', 'eau de parfum', 'eau de toilette', 'cologne', 'brume parfumee'], vers: 'Beauté et santé > Parfums', poids: 4 },
  { mots: ['rouge a levres', 'fond de teint', 'mascara', 'palette de maquillage', 'fard', 'eyeliner', 'vernis a ongles', 'gloss'], vers: 'Beauté et santé > Maquillage', poids: 4 },
  { mots: ['creme visage', 'serum visage', 'masque visage', 'nettoyant visage', 'contour des yeux'], vers: 'Beauté et santé > Soins du visage', poids: 4 },
  { mots: ['creme corps', 'gel douche', 'lait corporel', 'huile de massage', 'gommage'], vers: 'Beauté et santé > Soins de la peau et du corps', poids: 3 },
  { mots: ['shampoing', 'apres shampoing', 'seche cheveux', 'lisseur', 'boucleur', 'fer a friser', 'tondeuse cheveux'], vers: 'Beauté et santé > Soins capillaires', poids: 4 },
  { mots: ['epilateur', 'rasoir', 'cire epilation', 'epilation laser', 'tondeuse barbe'], vers: 'Beauté et santé > Épilation', poids: 4 },
  { mots: ['brosse a dents', 'jet dentaire', 'hydropulseur', 'deodorant', 'coupe ongles'], vers: 'Beauté et santé > Hygiène personnelle', poids: 3 },
  { mots: ['pistolet de massage', 'appareil de massage', 'coussin massant', 'fauteuil massant'], vers: 'Beauté et santé > Santé et bien-être (appareils de massage)', poids: 4 },
  { mots: ['tensiometre', 'oxymetre', 'glucometre', 'thermometre medical', 'nebuliseur'], vers: 'Beauté et santé > Matériel médical et diagnostic', poids: 4 },
  { mots: ['manucure', 'ponceuse a ongles', 'lampe uv ongles', 'faux ongles', 'capsule ongle'], vers: 'Beauté et santé > Manucure et pédicure', poids: 4 },

  // --- Bijoux et accessoires ---------------------------------------------
  { mots: ['bague', 'alliance', 'chevaliere', 'anneau bijou'], vers: 'Bijoux et accessoires > Bagues', poids: 3, sauf: ['bague connectee', 'smart ring'] },
  { mots: ['collier', 'pendentif', 'chaine bijou', 'ras de cou'], vers: 'Bijoux et accessoires > Colliers et pendentifs', poids: 3 },
  { mots: ['bracelet', 'gourmette', 'jonc'], vers: 'Bijoux et accessoires > Bracelets', poids: 3, sauf: ['bracelet connecte', 'bracelet de montre connectee'] },
  { mots: ['boucle d oreille', 'boucles d oreilles', 'creole', 'puce d oreille'], vers: 'Bijoux et accessoires > Boucles d\'oreilles', poids: 4 },
  { mots: ['montre', 'chronographe', 'montre automatique', 'montre quartz'], vers: 'Bijoux et accessoires > Montres', poids: 3, sauf: ['montre connectee', 'smartwatch', 'montre intelligente'] },
  { mots: ['lunettes de soleil', 'lunettes de vue', 'monture', 'lunettes anti lumiere bleue'], vers: 'Bijoux et accessoires > Lunettes de soleil et montures', poids: 4 },
  { mots: ['ceinture'], vers: 'Bijoux et accessoires > Ceintures', poids: 3, sauf: ['ceinture de securite', 'ceinture abdominale', 'ceinture lombaire'] },
  { mots: ['echarpe', 'gants', 'bonnet', 'casquette', 'chapeau', 'foulard'], vers: 'Bijoux et accessoires > Écharpes, gants et chapeaux', poids: 3, sauf: ['gants de moto', 'gants de travail', 'gants de boxe'] },
  { mots: ['barrette', 'bandeau cheveux', 'chouchou', 'pince a cheveux', 'serre tete'], vers: 'Bijoux et accessoires > Accessoires cheveux (barrettes, bandeaux)', poids: 3 },

  // --- Chaussures ---------------------------------------------------------
  { mots: ['basket', 'baskets', 'sneaker', 'sneakers'], vers: 'Chaussures > Baskets et sneakers', poids: 4 },
  { mots: ['botte', 'bottine', 'boots', 'chelsea boots'], vers: 'Chaussures > Bottes et bottines', poids: 4 },
  { mots: ['sandale', 'tong', 'claquette', 'mule'], vers: 'Chaussures > Sandales et tongs', poids: 4 },
  { mots: ['chaussure de running', 'chaussure de sport', 'chaussure de foot', 'crampons'], vers: 'Chaussures > Chaussures de sport', poids: 4 },
  { mots: ['mocassin', 'derbies', 'richelieu', 'chausson', 'pantoufle', 'chaussure de ville'], vers: 'Chaussures > Chaussures homme (ville, mocassins)', poids: 3 },
  { mots: ['escarpin', 'ballerine', 'talon aiguille'], vers: 'Chaussures > Chaussures femme (talons, ballerines)', poids: 4 },
  { mots: ['semelle', 'lacet', 'cirage', 'embauchoir'], vers: 'Chaussures > Accessoires chaussures (semelles, lacets)', poids: 3 },

  // --- Vêtements ----------------------------------------------------------
  // Le genre est décidé plus bas, par `genreDe` : ces règles disent le type.
  { mots: ['t shirt', 'tshirt', 'debardeur', 'polo', 'marcel'], vers: 'Vêtements pour hommes > T-shirts et débardeurs', poids: 3 },
  { mots: ['chemise'], vers: 'Vêtements pour hommes > Chemises', poids: 3 },
  // « Gilet » se dispute entre trois familles : le vêtement, l equipement de
  // securite routiere, et la musculation. Les deux dernieres sont ecartees.
  { mots: ['pull', 'sweat', 'hoodie', 'sweat a capuche', 'cardigan', 'gilet'], vers: 'Vêtements pour hommes > Pulls et sweats à capuche', poids: 3, sauf: ['gilet de securite', 'gilet jaune', 'gilet haute visibilite', 'gilet de sauvetage', 'gilet leste', 'gilet tactique'] },
  { mots: ['manteau', 'blouson', 'doudoune', 'parka', 'veste', 'trench'], vers: 'Vêtements pour hommes > Manteaux et blousons', poids: 3, sauf: ['veste de moto', 'blouson moto'] },
  { mots: ['jean', 'denim'], vers: 'Vêtements pour hommes > Jeans', poids: 3 },
  { mots: ['pantalon', 'chino', 'jogging', 'survetement'], vers: 'Vêtements pour hommes > Pantalons', poids: 3 },
  { mots: ['short', 'bermuda'], vers: 'Vêtements pour hommes > Shorts', poids: 3 },
  { mots: ['boxer', 'calecon', 'slip', 'sous vetement'], vers: 'Vêtements pour hommes > Sous-vêtements', poids: 3 },
  { mots: ['costume', 'blazer', 'smoking'], vers: 'Vêtements pour hommes > Costumes et blazers', poids: 3, sauf: ['costume de bain', 'deguisement'] },
  { mots: ['robe'], vers: 'Vêtements pour femmes > Robes', poids: 4 },
  { mots: ['jupe'], vers: 'Vêtements pour femmes > Jupes', poids: 4 },
  { mots: ['legging'], vers: 'Vêtements pour femmes > Pantalons et leggings', poids: 4 },
  { mots: ['soutien gorge', 'lingerie', 'nuisette', 'culotte', 'body dentelle'], vers: 'Vêtements pour femmes > Sous-vêtements et lingerie', poids: 4 },
  { mots: ['maillot de bain', 'bikini', 'monokini'], vers: 'Vêtements pour femmes > Maillots de bain', poids: 4 },

  // --- Sacs ---------------------------------------------------------------
  { mots: ['sac a dos'], vers: 'Sacs et bagages > Sacs à dos', poids: 4 },
  { mots: ['sac a main', 'pochette', 'sac bandouliere', 'cabas'], vers: 'Sacs et bagages > Sacs à main', poids: 4 },
  { mots: ['valise', 'bagage cabine', 'trolley'], vers: 'Sacs et bagages > Valises et bagages rigides', poids: 4 },
  { mots: ['portefeuille', 'porte cartes', 'porte monnaie', 'porte cles'], vers: 'Sacs et bagages > Portefeuilles et petite maroquinerie', poids: 4 },
  { mots: ['trousse de toilette', 'organiseur de voyage', 'etiquette bagage', 'coussin de voyage'], vers: 'Sacs et bagages > Accessoires de voyage (organiseurs, étiquettes)', poids: 4 },
  { mots: ['sac de sport'], vers: 'Sacs et bagages > Sacs de sport', poids: 4 },

  // --- Automobile ---------------------------------------------------------
  { mots: ['dashcam', 'camera de recul', 'radar de recul', 'autoradio', 'carplay', 'android auto'], vers: 'Automobile > Systèmes de conduite intelligents', poids: 5 },
  { mots: ['housse de siege', 'housse de volant', 'couvre volant'], vers: 'Automobile > Housses de siège et de volant', poids: 5 },
  { mots: ['tapis de voiture', 'tapis de sol auto'], vers: 'Automobile > Tapis et moquettes de voiture', poids: 5 },
  { mots: ['booster de batterie', 'demarreur de secours', 'chargeur de batterie voiture'], vers: 'Automobile > Démarreurs de secours et alimentation par batterie', poids: 5 },
  { mots: ['cric', 'chandelle auto', 'rampe de levage'], vers: 'Automobile > Crics et levage', poids: 4 },
  { mots: ['pneu', 'jante', 'enjoliveur'], vers: 'Automobile > Roues et pneus', poids: 4 },
  { mots: ['desodorisant voiture', 'parfum voiture', 'diffuseur voiture'], vers: 'Automobile > Désodorisants', poids: 5 },
  { mots: ['support telephone voiture', 'support smartphone auto'], vers: 'Automobile > Supports et fixations', poids: 5 },
  { mots: ['filtre a huile', 'filtre a air', 'filtre habitacle'], vers: 'Automobile > Filtres', poids: 4 },
  /*
   * « Volant » plutôt qu'une expression entière : le titre réel est « Bouton de
   * Commande sans Fil pour Volant Universel », et aucune formule figée ne
   * l'attrape — les mots utiles y sont séparés par quatre autres.
   *
   * Les deux gardes traitent les deux autres volants du catalogue : celui qu'on
   * habille, et celui du badminton.
   */
  { mots: ['volant', 'organiseur voiture', 'accoudoir voiture', 'chargeur voiture', 'aspirateur voiture'], vers: 'Automobile > Accessoires et appareils pour voiture', poids: 4, sauf: ['housse de volant', 'couvre volant', 'volant de badminton', 'volant badminton'] },
  { mots: ['plaquette de frein', 'disque de frein', 'etrier de frein'], vers: 'Automobile > Systèmes de freinage', poids: 4 },

  // --- Moto ---------------------------------------------------------------
  { mots: ['casque moto', 'gants moto', 'blouson moto', 'bottes moto'], vers: 'Motos et sports motorisés > Équipement pilote (casques, gants, blousons)', poids: 5 },
  { mots: ['trottinette electrique', 'velo electrique', 'gyroroue', 'hoverboard'], vers: 'Motos et sports motorisés > Trottinettes et vélos électriques', poids: 5 },
  { mots: ['retroviseur moto', 'protection moto', 'sabot moteur'], vers: 'Motos et sports motorisés > Accessoires moto (rétroviseurs, protections)', poids: 4 },

  // --- Sport --------------------------------------------------------------
  { mots: ['haltere', 'kettlebell', 'banc de musculation', 'tapis de course', 'velo d appartement', 'rameur', 'elastique de musculation', 'barre de traction'], vers: 'Sports et loisirs de plein air > Fitness et musculation', poids: 4 },
  { mots: ['tapis de yoga', 'brique de yoga', 'pilates'], vers: 'Sports et loisirs de plein air > Yoga et fitness doux', poids: 4 },
  { mots: ['tente', 'sac de couchage', 'rechaud camping', 'lampe frontale', 'gourde randonnee', 'matelas gonflable'], vers: 'Sports et loisirs de plein air > Camping et randonnée', poids: 4 },
  { mots: ['canne a peche', 'moulinet', 'leurre', 'epuisette'], vers: 'Sports et loisirs de plein air > Pêche', poids: 5 },
  { mots: ['velo', 'vtt', 'casque velo', 'compteur velo', 'porte bidon'], vers: 'Sports et loisirs de plein air > Cyclisme', poids: 3, sauf: ['velo electrique', 'velo d appartement'] },
  { mots: ['jumelle', 'longue vue', 'monoculaire', 'telescope'], vers: 'Sports et loisirs de plein air > Optique de plein air (jumelles, lunettes)', poids: 4 },
  { mots: ['raquette de tennis', 'raquette de padel', 'volant badminton'], vers: 'Sports et loisirs de plein air > Sports de raquette', poids: 5 },
  { mots: ['ballon de foot', 'ballon de basket', 'but de foot'], vers: 'Sports et loisirs de plein air > Sports collectifs', poids: 4 },

  // --- Maison et meubles --------------------------------------------------
  { mots: ['canape', 'fauteuil', 'pouf'], vers: 'Meubles > Canapés et fauteuils', poids: 4 },
  { mots: ['chaise', 'tabouret', 'chaise de bureau'], vers: 'Meubles > Chaises et tabourets', poids: 3 },
  /*
   * « Bureau » seul est retiré, et c'est une correction du 31/08/2026.
   *
   * Le mot apparaît dans « souris de bureau », « fournitures de bureau »,
   * « chaise de bureau » — et il pesait autant que « souris ». Deux familles à
   * égalité font refuser la décision : deux vraies souris du catalogue ne se
   * rangeaient nulle part à cause de ce seul mot.
   */
  { mots: ['table basse', 'table a manger', 'table de bureau', 'bureau d angle'], vers: 'Meubles > Tables (salle à manger, basse, bureau)', poids: 3 },
  { mots: ['lit', 'sommier', 'armoire', 'commode', 'table de chevet', 'matelas'], vers: 'Meubles > Meubles de chambre (lits, armoires)', poids: 3 },
  { mots: ['etagere', 'meuble de rangement', 'bibliotheque meuble', 'dressing'], vers: 'Meubles > Meubles de rangement', poids: 3 },

  // --- Animaux ------------------------------------------------------------
  { mots: ['croquette', 'pature', 'friandise chien', 'friandise chat'], vers: 'Fournitures pour animaux de compagnie > Alimentation pour chiens et chats', poids: 4 },
  { mots: ['laisse', 'collier chien', 'harnais chien', 'muselier'], vers: 'Fournitures pour animaux de compagnie > Habillage et accessoires (laisses, colliers)', poids: 4 },
  { mots: ['aquarium', 'pompe aquarium', 'filtre aquarium'], vers: 'Fournitures pour animaux de compagnie > Aquariophilie', poids: 5 },
  { mots: ['litiere', 'bac a litiere'], vers: 'Fournitures pour animaux de compagnie > Litières et hygiène', poids: 5 },
  { mots: ['panier chien', 'panier chat', 'niche', 'caisse de transport'], vers: 'Fournitures pour animaux de compagnie > Couchages et transport', poids: 4 },

  // --- Jouets -------------------------------------------------------------
  { mots: ['figurine', 'funko', 'presentoir figurine'], vers: 'Jouets et jeux > Figurines et jouets d\'action', poids: 4 },
  { mots: ['peluche', 'doudou'], vers: 'Jouets et jeux > Peluches', poids: 4 },
  { mots: ['lego', 'briques de construction', 'jeu de construction'], vers: 'Jouets et jeux > Jeux de construction', poids: 4 },
  { mots: ['puzzle', 'jeu de societe', 'jeu de cartes'], vers: 'Jouets et jeux > Puzzles et jeux de société', poids: 4 },
  { mots: ['voiture telecommandee', 'drone jouet', 'helicoptere telecommande'], vers: 'Jouets et jeux > Jouets télécommandés et véhicules RC', poids: 4 },

  // --- Bureau et papeterie ------------------------------------------------
  { mots: ['stylo', 'cahier', 'agenda', 'carnet', 'classeur', 'surligneur'], vers: 'Fournitures de bureau et scolaires > Papeterie (cahiers, stylos)', poids: 3 },
  { mots: ['cartable', 'sac scolaire', 'trousse scolaire'], vers: 'Fournitures de bureau et scolaires > Cartables et sacs scolaires', poids: 4 },
  { mots: ['calculatrice', 'calculette'], vers: 'Fournitures de bureau et scolaires > Calculatrices et petite électronique de bureau', poids: 4 },
]

/*
 * Les catégories annoncées par la source qu'il ne faut jamais croire.
 *
 * « la catégorie Maison » n'est pas une catégorie : c'est du texte de gabarit
 * ramassé par le relevé sur AliExpress. Gravée comme alias, elle a rangé seize
 * produits sans rapport dans « Figurines et jouets d'action » — trente-et-un
 * usages avant qu'on la voie.
 *
 * Le motif ne cherche pas à être exhaustif : il attrape les tournures qui
 * décrivent l'endroit d'un site plutôt qu'une famille de produits.
 */
const SOURCES_SANS_VALEUR = [
  /^la categorie\b/,
  /^categorie$/,
  /^(accueil|home|boutique|shop|store|magasin|catalogue)$/,
  /^(tous les produits|all products|nouveautes|new arrivals|promotions|soldes|meilleures ventes|best sellers)$/,
  /^(divers|autre|autres|general|misc|non classe|non specifie|sans categorie)$/,
  /^(produit|produits|article|articles|item|items)$/,
]

/** Vrai quand la catégorie annoncée par la source ne veut rien dire. */
export function sourceSansValeur(source: string | null | undefined): boolean {
  if (!source) return true
  const t = nu(source)
  if (t.length < 3) return true
  return SOURCES_SANS_VALEUR.some((motif) => motif.test(t))
}

/**
 * Cherche une expression entière, en tolérant le pluriel de **chaque** mot.
 *
 * Le pluriel se met où il veut : « caméras de recul », « housses de siège ». Ne
 * le tolérer qu'en fin d'expression laissait passer « cameras de recul » à
 * travers la garde qui devait justement l'écarter des appareils photo — et le
 * défaut ne se voyait que sur les titres au pluriel, c'est-à-dire rarement.
 */
function contient(titre: string, expression: string): boolean {
  const motif = expression
    .split(' ')
    .filter(Boolean)
    .map((mot) => `${mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|x|es)?`)
    .join(' ')
  return new RegExp(`(^| )${motif}( |$)`).test(titre)
}

export interface LectureTitre {
  /** Le chemin visé dans le référentiel. */
  chemin: string
  /** Ce qui a déclenché, pour pouvoir relire la décision. */
  motif: string
  poids: number
}

/**
 * Lit le titre et rend le chemin de catégorie, ou `null`.
 *
 * En cas d'égalité de poids, aucune décision : deux familles qui revendiquent
 * le produit avec la même force veut dire que le titre est ambigu, et un
 * arbitrage au hasard serait pire qu'un passage au modèle.
 */
export function lireTitre(titre: string): LectureTitre | null {
  const t = ` ${nu(titre)} `
  const trouvees: LectureTitre[] = []

  for (const regle of REGLES) {
    if (regle.sauf?.some((s) => t.includes(` ${nu(s)} `) || contient(t, nu(s)))) continue
    const mot = regle.mots.find((m) => contient(t, nu(m)))
    if (mot) trouvees.push({ chemin: regle.vers, motif: mot, poids: regle.poids ?? 1 })
  }

  if (!trouvees.length) return null

  trouvees.sort((a, b) => b.poids - a.poids || b.motif.length - a.motif.length)
  const [premier, second] = trouvees
  // Ambiguïté franche : même poids, même longueur de motif, cibles différentes.
  if (second && second.poids === premier.poids && second.motif.length === premier.motif.length && second.chemin !== premier.chemin) {
    return null
  }
  return premier
}

// --- Le genre ---------------------------------------------------------------

/*
 * Le genre est un attribut, pas une catégorie — et c'est délibéré.
 *
 * Le référentiel sépare déjà « Vêtements pour hommes » de « Vêtements pour
 * femmes », et « Chaussures homme » de « Chaussures femme », parce que la
 * taxonomie produit de Google — notre pivot vers Shopify, Google et Meta — les
 * sépare. Elle ne sépare **pas** les bijoux, les montres ni les parfums : y
 * ajouter un genre casserait le pivot, et la catégorie ne correspondrait plus à
 * rien chez la destination.
 *
 * Mais Vinted et Leboncoin, eux, demandent le genre. D'où sa lecture ici, et son
 * rangement dans les caractéristiques du produit, où chaque destination va le
 * chercher si elle en a besoin.
 */
export type Genre = 'Homme' | 'Femme' | 'Enfant' | 'Mixte'

const MARQUEURS: Array<[Genre, string[]]> = [
  ['Enfant', ['enfant', 'garcon', 'fille', 'junior', 'kids', 'bebe', 'enfants']],
  ['Homme', ['homme', 'hommes', 'masculin', 'men', 'mens', 'pour lui', 'monsieur']],
  ['Femme', ['femme', 'femmes', 'feminin', 'women', 'womens', 'pour elle', 'dame', 'madame']],
  ['Mixte', ['mixte', 'unisexe', 'unisex']],
]

/**
 * Le genre annoncé par le titre, ou `null`.
 *
 * « Bague Anti-Stress Rotative Homme Femme » nomme les deux : c'est mixte, et
 * non le premier trouvé. Retenir « Homme » là ferait rater la moitié des
 * acheteurs sur une place de marché qui filtre par genre.
 */
export function genreDe(titre: string): Genre | null {
  const t = ` ${nu(titre)} `
  const vus = MARQUEURS.filter(([, mots]) => mots.some((m) => contient(t, m))).map(([g]) => g)
  if (!vus.length) return null
  if (vus.includes('Mixte')) return 'Mixte'
  if (vus.includes('Homme') && vus.includes('Femme')) return 'Mixte'
  // L'enfant prime : « chaussures enfant garçon » se range en enfant.
  if (vus.includes('Enfant')) return 'Enfant'
  return vus[0]
}

/**
 * Corrige le rayon d'un vêtement ou d'une chaussure d'après le genre lu.
 *
 * Les règles de vêtements visent le rayon homme par défaut : c'est arbitraire et
 * assumé, parce que « chemise » ne dit rien du genre. Le titre, lui, le dit
 * presque toujours — et le bascule ici.
 */
export function accorderAuGenre(chemin: string, genre: Genre | null): string {
  if (!genre) return chemin

  if (chemin.startsWith('Vêtements pour ')) {
    const feuille = chemin.split('>')[1]?.trim()
    if (!feuille) return chemin
    // Les feuilles ne se correspondent pas une à une entre les deux rayons :
    // seules celles qui portent le même nom se transposent sans risque.
    const communes = ['Jeans', 'Grande taille', 'Vêtements traditionnels et culturels']
    const versFemme = genre === 'Femme'
    const cible = versFemme ? 'Vêtements pour femmes' : 'Vêtements pour hommes'
    if (chemin.startsWith(cible)) return chemin

    const transposable: Record<string, string> = {
      'T-shirts et débardeurs': 'Hauts et T-shirts',
      'Pulls et sweats à capuche': 'Pulls et sweats',
      'Manteaux et blousons': 'Manteaux et vestes',
      'Pantalons': 'Pantalons et leggings',
      'Sous-vêtements': 'Sous-vêtements et lingerie',
      'Chemises': 'Hauts et T-shirts',
      'Shorts': 'Pantalons et leggings',
    }
    if (versFemme) {
      if (communes.includes(feuille)) return `Vêtements pour femmes > ${feuille}`
      const equivalent = transposable[feuille]
      return equivalent ? `Vêtements pour femmes > ${equivalent}` : chemin
    }
    // Femme → homme : la transposition inverse, quand elle existe.
    if (communes.includes(feuille)) return `Vêtements pour hommes > ${feuille}`
    const inverse = Object.entries(transposable).find(([, f]) => f === feuille)?.[0]
    return inverse ? `Vêtements pour hommes > ${inverse}` : chemin
  }

  if (chemin.startsWith('Chaussures >')) {
    const ville = chemin.includes('Chaussures homme') || chemin.includes('Chaussures femme')
    if (genre === 'Enfant') return 'Chaussures > Chaussures enfant'
    // Seules les chaussures « de ville » ont un rayon par genre : une basket
    // reste une basket, et Google ne la sépare pas non plus.
    if (ville) {
      if (genre === 'Femme') return 'Chaussures > Chaussures femme (talons, ballerines)'
      if (genre === 'Homme') return 'Chaussures > Chaussures homme (ville, mocassins)'
    }
  }

  return chemin
}
