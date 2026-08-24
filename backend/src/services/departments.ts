/**
 * Le catalogue des chefs de rayon.
 *
 * Un agent par rayon plutôt qu'un agent unique : « les bagues connectées
 * percent » et « les sécateurs de rentrée se vendent » ne se cherchent pas aux
 * mêmes endroits, ne se jugent pas sur les mêmes critères, et un seul agent
 * chargé de tout produit une bouillie où rien ne ressort.
 *
 * Chacun porte un prénom. Ce n'est pas de la décoration : le vendeur qui gère
 * huit rayons doit pouvoir dire « qu'est-ce qu'Albert a trouvé aujourd'hui »
 * plutôt que « rayon 4, source fournisseurs ». Le prénom est figé à l'embauche,
 * pour qu'il ne change jamais sous les yeux du vendeur.
 */
export interface DepartmentProfile {
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
    key: 'high-tech',
    label: 'High-tech et informatique',
    agentName: 'Malik',
    emoji: '💻',
    focus:
      "Smartphones, PC portables, accessoires, casques et enceintes. Surveille les sorties, les baisses de prix et les marques absentes du marché français.",
    covers: ['Smartphones', 'Tablettes', 'PC et accessoires', 'Casques', 'Enceintes', 'Télévisions'],
  },
  {
    key: 'objets-connectes',
    label: 'Objets connectés et domotique',
    agentName: 'Théo',
    emoji: '📡',
    focus:
      "Montres, bagues, capteurs, éclairage et sécurité connectés. Vigilant sur les allégations santé, qui font retirer une annonce.",
    covers: ['Montres connectées', 'Bagues connectées', 'Éclairage LED', 'Caméras', 'Domotique'],
  },
  {
    key: 'electromenager',
    label: 'Électroménager et cuisine',
    agentName: 'Sylvie',
    emoji: '🍳',
    focus:
      "Petit et gros électroménager, robots, friteuses, machines à glace. La catégorie la plus démontrable en vidéo, donc la plus exposée aux effets de mode.",
    covers: ['Petit électroménager', 'Robots cuisine', 'Aspirateurs', 'Machines à café', 'Gros électroménager'],
  },
  {
    key: 'mode-femme',
    label: 'Mode et accessoires femme',
    agentName: 'Audrey',
    emoji: '👗',
    focus:
      "Prêt-à-porter, sacs, chaussures et accessoires. Suit les saisons de près : un article arrivé trop tard ne se vend pas du tout.",
    covers: ['Prêt-à-porter', 'Sacs', 'Chaussures', 'Accessoires', 'Lingerie'],
  },
  {
    key: 'mode-homme',
    label: 'Mode et accessoires homme',
    agentName: 'Julien',
    emoji: '👔',
    focus:
      "Vêtements, chaussures, maroquinerie et accessoires. Surveille les marques de niche qui montent avant qu'elles ne saturent.",
    covers: ['Vêtements', 'Chaussures', 'Maroquinerie', 'Ceintures', 'Casquettes'],
  },
  {
    key: 'bricolage',
    label: 'Bricolage et outillage',
    agentName: 'Albert',
    emoji: '🔧',
    focus:
      "Outillage à main et électroportatif, mesure, quincaillerie. Catégorie en forte croissance, avec une offre encore fine côté vendeurs.",
    covers: ['Outillage électroportatif', 'Outils à main', 'Mesure', 'Quincaillerie', 'Rangement atelier'],
  },
  {
    key: 'jardinage',
    label: 'Jardinage et extérieur',
    agentName: 'Robert',
    emoji: '🌱',
    focus:
      "Outils de jardin, arrosage, mobilier et barbecue. Très saisonnier : il signale les fenêtres d'achat autant que les produits.",
    covers: ['Outils de jardin', 'Arrosage', 'Mobilier extérieur', 'Barbecue', 'Piscine'],
  },
  {
    key: 'maison-deco',
    label: 'Maison et décoration',
    agentName: 'Camille',
    emoji: '🛋️',
    focus:
      "Décoration, linge de maison, rangement et luminaires. Attentif aux volumes et au poids, qui décident de la marge réelle.",
    covers: ['Décoration', 'Linge de maison', 'Luminaires', 'Rangement', 'Petit mobilier'],
  },
  {
    key: 'beaute',
    label: 'Beauté et soins',
    agentName: 'Inès',
    emoji: '💄',
    focus:
      "Soin, maquillage, coiffure et appareils de beauté. Prudente sur la cosmétique importée : la conformité européenne y est un vrai sujet.",
    covers: ['Soin du visage', 'Maquillage', 'Coiffure', 'Épilation', 'Ongles'],
  },
  {
    key: 'sport',
    label: 'Sport et fitness',
    agentName: 'Karim',
    emoji: '🏋️',
    focus:
      "Musculation, running, vélo et accessoires connectés. Suit les pics de janvier et de printemps, où tout se joue en trois semaines.",
    covers: ['Musculation', 'Running', 'Vélo', 'Yoga', 'Montres sport'],
  },
  {
    key: 'bebe',
    label: 'Bébé et puériculture',
    agentName: 'Léa',
    emoji: '🍼',
    focus:
      "Éveil, repas, promenade et sécurité. Le rayon le plus exigeant en normes : elle écarte d'office ce qui n'est pas certifié.",
    covers: ['Éveil', 'Repas', 'Poussettes', 'Sécurité', 'Veilleuses connectées'],
  },
  {
    key: 'animalerie',
    label: 'Animalerie et objets connectés animaux',
    agentName: 'Nadia',
    emoji: '🐾',
    focus:
      "Accessoires, jouets, distributeurs et traceurs GPS. Niche émergente, avec des marges élevées et peu de vendeurs installés.",
    covers: ['Accessoires chien', 'Accessoires chat', 'Distributeurs', 'Traceurs GPS', 'Couchage'],
  },
  {
    key: 'auto-moto',
    label: 'Auto et moto',
    agentName: 'Franck',
    emoji: '🚗',
    focus:
      "Diagnostic, entretien, accessoires et démarrage. Beaucoup de produits techniques où la garantie fait la vente.",
    covers: ['Diagnostic OBD2', 'Compresseurs', 'Accessoires habitacle', 'Éclairage', 'Entretien'],
  },
  {
    key: 'jeux-consoles',
    label: 'Jeux, consoles et accessoires',
    agentName: 'Bastien',
    emoji: '🎮',
    focus:
      "Manettes, casques, sièges et accessoires. Attentif aux contrefaçons, qui sont la principale cause de sanction sur ce rayon.",
    covers: ['Manettes', 'Casques gaming', 'Sièges', 'Rangement', 'Accessoires console'],
  },
  {
    key: 'bijoux-montres',
    label: 'Bijoux et montres',
    agentName: 'Chloé',
    emoji: '⌚',
    focus:
      "Montres, bijoux fantaisie et accessoires. Marges élevées, mais elle écarte tout ce qui approche la contrefaçon de marque.",
    covers: ['Montres', 'Bracelets', 'Colliers', 'Bagues', 'Boîtes à bijoux'],
  },
]

export function findDepartment(key: string) {
  return DEPARTMENTS.find((d) => d.key === key) ?? null
}

export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key)
