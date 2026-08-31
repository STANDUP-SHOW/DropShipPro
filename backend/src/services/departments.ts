/**
 * Le catalogue des chefs de rayon.
 *
 * Un agent par rayon plutôt qu'un agent unique : « les bagues connectées
 * percent » et « les sécateurs de rentrée se vendent » ne se cherchent pas aux
 * mêmes endroits, ne se jugent pas sur les mêmes critères, et un seul agent
 * chargé de tout produit une bouillie où rien ne ressort.
 *
 * **Vingt-quatre, et ce nombre n'est pas choisi ici.** Il vient du référentiel
 * de catégories, qui compte vingt-quatre rayons. Les quinze d'avant étaient une
 * liste parallèle, écrite à la main, qui ne correspondait à rien : un produit
 * rangé dans « Chaussures » relevait d'un chef « Mode homme » qui n'existait
 * que dans ce fichier. Chaque clé est désormais l'identifiant d'un rayon réel,
 * ce qui rend le rattachement mécanique au lieu d'être approximatif.
 *
 * Chacun porte un prénom. Ce n'est pas de la décoration : le vendeur qui gère
 * huit rayons doit pouvoir dire « qu'est-ce qu'Albert a trouvé aujourd'hui »
 * plutôt que « rayon 4, source fournisseurs ». Le prénom est figé à l'embauche,
 * pour qu'il ne change jamais sous les yeux du vendeur.
 *
 * **Aucun prénom n'est repris d'un agent d'administration.** Léa photographie,
 * Nadia écrit les publicités, Camille tient la hotline — trois prénoms qui
 * servaient aussi de chefs de rayon, et le vendeur ne pouvait plus savoir à qui
 * il parlait. Les chefs de rayon concernés ont été renommés.
 */
export interface DepartmentProfile {
  /** L'identifiant du rayon dans le référentiel de catégories. */
  key: string
  label: string
  agentName: string
  emoji: string
  /** Ce que l'agent surveille, en une phrase que le vendeur lit avant d'embaucher. */
  focus: string
  /** Les familles de produits du rayon, telles qu'affichées sur la fiche. */
  covers: string[]
}

export const DEPARTMENTS: DepartmentProfile[] = [
  {
    key: 'electronique',
    label: 'Électronique',
    agentName: 'Malik',
    emoji: '💻',
    focus:
      "Informatique, audio, photo, télévisions, drones et éclairage. Surveille les sorties, les baisses de prix et les marques absentes du marché français.",
    covers: ['Informatique et accessoires PC', 'Audio', 'Appareils photo', 'Télévisions', 'Drones', 'Éclairage et LED'],
  },
  {
    key: 'telephones-portables-et-accessoires',
    label: 'Téléphones portables et accessoires',
    agentName: 'Théo',
    emoji: '📱',
    focus:
      "Smartphones, coques, chargeurs, écouteurs et montres connectées. Le rayon le plus disputé : c'est l'accessoire qui fait la marge, pas l'appareil.",
    covers: ['Smartphones', 'Coques et housses', 'Chargeurs et câbles', 'Écouteurs', 'Montres connectées', 'Batteries externes'],
  },
  {
    key: 'appareils-electromenagers',
    label: 'Appareils électroménagers',
    agentName: 'Sylvie',
    emoji: '🍳',
    focus:
      "Petit et gros électroménager, robots, friteuses, aspirateurs. La catégorie la plus démontrable en vidéo, donc la plus exposée aux effets de mode.",
    covers: ['Aspirateurs', 'Cafetières', 'Cuiseurs', 'Préparation culinaire', 'Gros électroménager', 'Climatisation'],
  },
  {
    key: 'vetements-pour-femmes',
    label: 'Vêtements pour femmes',
    agentName: 'Audrey',
    emoji: '👗',
    focus:
      "Prêt-à-porter, robes, jeans, lingerie et maillots. Suit les saisons de près : un article arrivé trop tard ne se vend pas du tout.",
    covers: ['Robes', 'Hauts et T-shirts', 'Jeans', 'Manteaux et vestes', 'Lingerie', 'Maillots de bain'],
  },
  {
    key: 'vetements-pour-hommes',
    label: 'Vêtements pour hommes',
    agentName: 'Julien',
    emoji: '👔',
    focus:
      "Chemises, pulls, pantalons, sous-vêtements et costumes. Moins saisonnier que la mode femme, mais la taille y fait plus de retours.",
    covers: ['Chemises', 'Pulls et sweats', 'Pantalons', 'Manteaux et blousons', 'Sous-vêtements', 'Costumes'],
  },
  {
    key: 'chaussures',
    label: 'Chaussures',
    agentName: 'Yanis',
    emoji: '👟',
    focus:
      "Baskets, bottes, sandales et chaussures de ville. Attentif aux contrefaçons de marques sportives, première cause de retrait sur ce rayon.",
    covers: ['Baskets et sneakers', 'Bottes et bottines', 'Chaussures de sport', 'Sandales', 'Chaussures homme', 'Chaussures femme'],
  },
  {
    key: 'bijoux-et-accessoires',
    label: 'Bijoux et accessoires',
    agentName: 'Chloé',
    emoji: '⌚',
    focus:
      "Montres, bagues, colliers, lunettes et ceintures. Marges élevées, mais elle écarte tout ce qui approche la contrefaçon de marque.",
    covers: ['Montres', 'Bagues', 'Colliers', 'Bracelets', 'Lunettes de soleil', 'Ceintures'],
  },
  {
    key: 'sacs-et-bagages',
    label: 'Sacs et bagages',
    agentName: 'Laurence',
    emoji: '👜',
    focus:
      "Sacs à main, sacs à dos, valises et maroquinerie. Rayon très sensible à la saison des départs, et à la contrefaçon de maroquinerie de luxe.",
    covers: ['Sacs à main', 'Sacs à dos', 'Valises', 'Portefeuilles', 'Sacs de sport', 'Accessoires de voyage'],
  },
  {
    key: 'beaute-et-sante',
    label: 'Beauté et santé',
    agentName: 'Inès',
    emoji: '💄',
    focus:
      "Maquillage, soins, parfums, épilation et appareils de massage. Vigilante sur les allégations santé, qui font retirer une annonce sans avertissement.",
    covers: ['Maquillage', 'Soins du visage', 'Parfums', 'Épilation', 'Soins capillaires', 'Massage'],
  },
  {
    key: 'extensions-de-cheveux-et-perruques',
    label: 'Extensions de cheveux et perruques',
    agentName: 'Fatou',
    emoji: '💇',
    focus:
      "Perruques, tissages, extensions et accessoires de pose. Niche à très forte marge, où la qualité de la fibre décide de tout l'avis client.",
    covers: ['Perruques naturelles', 'Perruques synthétiques', 'Extensions à clips', 'Postiches', 'Accessoires de pose'],
  },
  {
    key: 'outils-et-bricolage',
    label: 'Outils et bricolage',
    agentName: 'Albert',
    emoji: '🔧',
    focus:
      "Outillage électroportatif, outillage à main, mesure, plomberie et quincaillerie. Beaucoup de produits techniques où la garantie fait la vente.",
    covers: ['Outillage électroportatif', 'Outillage à main', 'Mesure', 'Plomberie', 'Quincaillerie', 'Soudure'],
  },
  {
    key: 'terrasse-pelouse-et-jardin',
    label: 'Terrasse, pelouse et jardin',
    agentName: 'Robert',
    emoji: '🌱',
    focus:
      "Outillage de jardin, arrosage, barbecue, piscines et éclairage solaire. Le rayon le plus saisonnier de tous : deux mois font l'année.",
    covers: ['Outillage de jardin', 'Arrosage', 'Barbecue', 'Piscines et spas', 'Éclairage solaire', 'Mobilier d\'extérieur'],
  },
  {
    key: 'meubles',
    label: 'Meubles',
    agentName: 'Sophie',
    emoji: '🛋️',
    focus:
      "Canapés, tables, chaises, rangement et mobilier de chambre. Le port pèse lourd dans la marge : elle écarte ce qui ne s'expédie pas à prix tenable.",
    covers: ['Canapés et fauteuils', 'Tables', 'Chaises', 'Meubles de rangement', 'Meubles de chambre', 'Mobilier de jardin'],
  },
  {
    key: 'arts-artisanat-et-couture',
    label: 'Arts, artisanat et couture',
    agentName: 'Margaux',
    emoji: '🧵',
    focus:
      "Couture, tricot, peinture, perles et loisirs créatifs. Clientèle fidèle et prescriptrice, qui achète en série une fois convaincue.",
    covers: ['Couture et mercerie', 'Machines à coudre', 'Tricot et laine', 'Peinture et dessin', 'Perles et bijoux DIY'],
  },
  {
    key: 'livres-et-medias',
    label: 'Livres et médias',
    agentName: 'Vincent',
    emoji: '📚',
    focus:
      "Livres, affiches, carnets et supports audio. Rayon à faible marge unitaire, mais qui apporte du trafic et des paniers complémentaires.",
    covers: ['Livres papier', 'Affiches et posters', 'Papeterie créative', 'Supports audio et vidéo'],
  },
  {
    key: 'fournitures-de-bureau-et-scolaires',
    label: 'Fournitures de bureau et scolaires',
    agentName: 'Hélène',
    emoji: '✏️',
    focus:
      "Papeterie, cartables, mobilier et matériel de bureau. Deux pics dans l'année — la rentrée et janvier — et un plat le reste du temps.",
    covers: ['Papeterie', 'Cartables', 'Mobilier de bureau', 'Matériel de classement', 'Calculatrices'],
  },
  {
    key: 'jouets-et-jeux',
    label: 'Jouets et jeux',
    agentName: 'Bastien',
    emoji: '🎮',
    focus:
      "Figurines, construction, peluches, puzzles et jouets télécommandés. Attentif aux normes CE et aux contrefaçons de licences.",
    covers: ['Figurines', 'Jeux de construction', 'Peluches', 'Puzzles et jeux de société', 'Jouets télécommandés', 'Déguisements'],
  },
  {
    key: 'bebe-et-maternite',
    label: 'Bébé et maternité',
    agentName: 'Amandine',
    emoji: '🍼',
    focus:
      "Poussettes, sièges auto, biberons, couches et éveil. Le rayon le plus réglementé : elle refuse tout ce qui n'a pas de conformité démontrable.",
    covers: ['Poussettes et sièges auto', 'Alimentation bébé', 'Mobilier et couchage', 'Sécurité bébé', 'Vêtements bébé'],
  },
  {
    key: 'fournitures-pour-animaux-de-compagnie',
    label: 'Fournitures pour animaux de compagnie',
    agentName: 'Élodie',
    emoji: '🐾',
    focus:
      "Laisses, couchages, jouets, aquariophilie et toilettage. Niche à marges élevées et peu de vendeurs installés en France.",
    covers: ['Laisses et colliers', 'Couchages et transport', 'Jouets', 'Aquariophilie', 'Toilettage', 'Litières'],
  },
  {
    key: 'sports-et-loisirs-de-plein-air',
    label: 'Sports et loisirs de plein air',
    agentName: 'Karim',
    emoji: '🏋️',
    focus:
      "Fitness, camping, cyclisme, pêche et sports de raquette. Le volume se fait en janvier et au printemps, presque rien entre les deux.",
    covers: ['Fitness et musculation', 'Camping et randonnée', 'Cyclisme', 'Pêche', 'Sports de raquette', 'Yoga'],
  },
  {
    key: 'automobile',
    label: 'Automobile',
    agentName: 'Franck',
    emoji: '🚗',
    focus:
      "Diagnostic, accessoires habitacle, éclairage, housses et démarrage. Beaucoup de produits techniques où la compatibilité véhicule fait le retour.",
    covers: ['Accessoires habitacle', 'Systèmes de conduite', 'Housses de siège', 'Démarreurs de secours', 'Éclairage', 'Filtres'],
  },
  {
    key: 'motos-et-sports-motorises',
    label: 'Motos et sports motorisés',
    agentName: 'Damien',
    emoji: '🏍️',
    focus:
      "Équipement pilote, accessoires moto, trottinettes et vélos électriques. L'équipement homologué CE est la seule chose qui se vende durablement.",
    covers: ['Équipement pilote', 'Accessoires moto', 'Trottinettes électriques', 'Vélos électriques', 'Pièces détachées'],
  },
  {
    key: 'commerce-industrie-et-science',
    label: 'Commerce, industrie et science',
    agentName: 'Bernard',
    emoji: '🏭',
    focus:
      "Machines, équipement de sécurité, emballage et matériel de laboratoire. Panier moyen élevé, cycle de vente long, clientèle professionnelle.",
    covers: ['Machines-outils', 'Équipement de sécurité', 'Emballage commercial', 'Manutention', 'Matériel de laboratoire'],
  },
  {
    key: 'nouveaute-et-usage-special',
    label: 'Nouveauté et usage spécial',
    agentName: 'Ousmane',
    emoji: '🎁',
    focus:
      "Gadgets insolites, articles de fête, cosplay et déguisements. Le rayon des coups : très fort pendant six semaines, puis plus rien.",
    covers: ['Gadgets insolites', 'Articles de fête', 'Cosplay', 'Déguisements', 'Articles religieux'],
  },
]

/*
 * Les anciennes clés, qui doivent continuer de répondre.
 *
 * Les rayons déjà confiés portent en base la clé de l'ancienne liste. La perdre
 * ferait disparaître l'agent, ses rapports et ses opportunités des yeux du
 * vendeur — alors que tout est encore là. La correspondance mène chacune vers le
 * rayon réel le plus proche.
 */
const ANCIENNES_CLES: Record<string, string> = {
  'high-tech': 'electronique',
  'objets-connectes': 'telephones-portables-et-accessoires',
  electromenager: 'appareils-electromenagers',
  'mode-femme': 'vetements-pour-femmes',
  'mode-homme': 'vetements-pour-hommes',
  bricolage: 'outils-et-bricolage',
  jardinage: 'terrasse-pelouse-et-jardin',
  'maison-deco': 'meubles',
  beaute: 'beaute-et-sante',
  sport: 'sports-et-loisirs-de-plein-air',
  bebe: 'bebe-et-maternite',
  animalerie: 'fournitures-pour-animaux-de-compagnie',
  'auto-moto': 'automobile',
  'jeux-consoles': 'jouets-et-jeux',
  'bijoux-montres': 'bijoux-et-accessoires',
}

export function findDepartment(key: string) {
  const direct = DEPARTMENTS.find((d) => d.key === key)
  if (direct) return direct
  const repris = ANCIENNES_CLES[key]
  return repris ? (DEPARTMENTS.find((d) => d.key === repris) ?? null) : null
}

export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key)

/** Toutes les clés acceptées à l'écriture, anciennes comprises. */
export const DEPARTMENT_KEYS_ACCEPTEES = [...DEPARTMENT_KEYS, ...Object.keys(ANCIENNES_CLES)]
