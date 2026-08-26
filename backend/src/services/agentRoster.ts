/**
 * L'équipe fournie d'office.
 *
 * Un vendeur qui ouvre le back-office doit voir qui travaille pour lui, ce que
 * chacun fait, et lequel est en panne. Les agents ne sont pas des réglages
 * cachés dans cinq écrans : c'est une équipe, elle se présente.
 *
 * Deux familles, et la distinction compte :
 *
 * — les agents de chaîne (scrapper, rédacteur, contrôle, vendeur, pilote) ne se
 *   parlent pas, ils travaillent. On les active, on lit ce qu'ils ont fait ;
 * — les agents de comptoir (hotline, commercial, SAV, livraisons) se parlent.
 *   Ils répondent à une question, dans leur domaine, et renvoient au bon
 *   collègue quand ce n'est pas le leur.
 *
 * Les chefs de rayon, eux, s'embauchent un par un (voir departments.ts) : ils
 * dépendent des secteurs que le vendeur travaille vraiment.
 */

export type AgentFamily = 'chaine' | 'comptoir'

/**
 * Le service auquel l'agent appartient.
 *
 * La distinction chaîne / comptoir dit comment on s'en sert ; le service dit à
 * quoi il sert. C'est celle-ci que le vendeur cherche quand il ouvre la page :
 * il veut « quelqu'un pour mes photos », pas « un agent de chaîne ».
 */
export type AgentCategory = 'administratif' | 'production' | 'marketing' | 'logistique'

/** Dans l'ordre où les services se présentent au vendeur. */
export const AGENT_CATEGORIES: Array<{ key: AgentCategory; label: string; hint: string }> = [
  {
    key: 'administratif',
    label: 'Administratifs',
    hint: "Ceux à qui l'on parle quand ça coince : orientation, factures, litiges, comptabilité, droit.",
  },
  {
    key: 'production',
    label: 'Production',
    hint: 'Ils fabriquent les annonces. Chaque produit importé passe entre leurs mains dans cet ordre.',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    hint: 'Les visuels et les campagnes : de quoi montrer le produit ailleurs que sur sa fiche.',
  },
  { key: 'logistique', label: 'Logistique', hint: 'Les colis, une fois la vente faite.' },
]

export interface AgentProfile {
  key: string
  name: string
  role: string
  family: AgentFamily
  category: AgentCategory
  emoji: string
  /** Ce qu'il fait, dit au vendeur et pas au développeur. */
  does: string
  /** Où son travail se voit dans l'application. */
  where: string | null
  /** Adresse de la page concernée, quand il y en a une. */
  href: string | null
  /**
   * Prix mensuel TTC en centimes, quand l'agent se paie à part.
   *
   * Zéro veut dire compris dans l'abonnement : la plupart le sont, et un
   * vendeur ne doit pas se demander devant chaque agent s'il va être facturé.
   */
  monthly?: number
  /** Ce que l'agent ne fait pas, et pourquoi. Affiché avec ses fonctions. */
  caveat?: string
}

/** Les agents de chaîne : ils produisent, ils ne discutent pas. */
export const PIPELINE_AGENTS: AgentProfile[] = [
  {
    key: 'scrapper',
    name: 'Sacha',
    role: 'Agent Scrapper',
    family: 'chaine',
    category: 'production',
    emoji: '🔎',
    does: "Lit la fiche du fournisseur et en ramène le titre, le prix, les photos et les options. Sur Temu et AliExpress il travaille depuis votre navigateur, par l'extension : ces sites ne livrent rien à un serveur.",
    where: 'Import de produit',
    href: '/dashboard',
  },
  {
    key: 'writer',
    name: 'Romain',
    role: 'Agent Rédacteur',
    family: 'chaine',
    category: 'production',
    emoji: '✍️',
    does: "Réécrit l'annonce : titre, description, neuf attributs, six arguments de vente, vingt mots-clés. Du contenu original — recopier la fiche du fournisseur fait sanctionner le référencement.",
    where: 'Chaque annonce importée',
    href: '/dashboard',
  },
  {
    key: 'control',
    name: 'Iris',
    role: 'Agent Contrôle',
    family: 'chaine',
    category: 'production',
    emoji: '👁️',
    does: "Regarde les photos avant la mise en ligne et écarte ce qui n'est pas le produit. Garde toutes les vraies photos, relève les couleurs réellement visibles, écarte les tailles incohérentes.",
    where: 'Réglages → Agent de contrôle',
    href: '/settings',
  },
  {
    key: 'seller',
    name: 'Olivier',
    role: 'Agent Vendeur',
    family: 'chaine',
    category: 'production',
    emoji: '🏷️',
    does: "Adapte l'annonce à chaque destination au moment de publier : longueur du titre, catégorie de la plateforme, champs obligatoires. Il corrige au lieu de signaler — un avertissement ne vend rien.",
    where: 'Chaque publication',
    href: '/dashboard',
  },
  {
    key: 'autopilot',
    name: 'Automate',
    role: 'Agent Pilote automatique',
    family: 'chaine',
    category: 'production',
    emoji: '✈️',
    does: "Fait travailler toute la chaîne sans vous : il reprend les produits conseillés par vos chefs de rayon, importe ce qui passe vos critères, et publie. Il lui faut au moins un chef de rayon pour avoir de quoi travailler.",
    where: 'Pilote automatique',
    href: '/pilote',
  },
  {
    key: 'photo',
    name: 'Léa',
    role: 'Agent Graphiste',
    family: 'chaine',
    category: 'marketing',
    emoji: '📸',
    does: "Refait les photos d'un produit : le même article, mais en situation, éclairé comme en studio. Une fois embauchée, elle apparaît sur chaque fiche d'annonce avec un bouton qui produit six mises en situation d'un coup. Elle ne fait que de la photo — la publicité, avec son logo, son prix et son bouton, est le métier de Nadia.",
    caveat:
      "Elle ne dessine jamais un produit qui n'existe pas : elle repart de vos photos et garde la forme, les couleurs et les marquages. Publier l'image d'un objet que le fournisseur ne livre pas, c'est un litige puis une suspension.",
    where: 'Atelier photo, et chaque fiche produit',
    href: '/marketing-photo',
  },
]

/** Les agents de comptoir : on leur parle. */
export const SUPPORT_AGENTS: AgentProfile[] = [
  {
    key: 'hotline',
    name: 'Camille',
    role: 'Agent Hotline',
    family: 'comptoir',
    category: 'administratif',
    emoji: '☎️',
    does: "Le premier interlocuteur. Elle écoute votre question et vous met en relation avec celui qui sait : un chef de rayon pour un produit, le service commercial pour une facture, le SAV pour un litige, les livraisons pour un colis.",
    where: 'Agents → Discuter',
    href: '/agents/hotline',
  },
  {
    key: 'commercial',
    name: 'Béatrice',
    role: 'Agent Service commercial',
    family: 'comptoir',
    category: 'administratif',
    emoji: '💶',
    does: "Factures, crédits, abonnement, chiffres. Elle explique une facture, retrouve un paiement, et lit vos statistiques financières avec vous.",
    where: 'Agents → Discuter',
    href: '/agents/commercial',
  },
  {
    key: 'sav',
    name: 'Marc',
    role: 'Agent SAV',
    family: 'comptoir',
    category: 'administratif',
    emoji: '🛠️',
    does: "Les problèmes après vente : produit non conforme, colis abîmé, demande de remboursement. Il ouvre un litige avec vous et suit ceux en cours.",
    where: 'Agents → Discuter',
    href: '/agents/sav',
  },
  {
    key: 'comptable',
    name: 'Gérard',
    role: 'Agent Comptable',
    family: 'comptoir',
    category: 'administratif',
    emoji: '📒',
    does: "Vos chiffres et vos papiers : factures et devis, encaissements et remboursements, frais de plateforme, coût des livraisons, résultat par place de marché. Il tient aussi le compte de ce que l'application vous coûte, poste par poste.",
    caveat:
      "Il prépare, il ne certifie pas. Un bilan, une déclaration de TVA ou une liasse fiscale doivent être validés par un expert-comptable inscrit à l'ordre.",
    where: 'Agents → Discuter',
    href: '/agents/comptable',
  },
  {
    key: 'avocat',
    name: 'Maître Doré',
    role: 'Agent Avocat',
    family: 'comptoir',
    category: 'administratif',
    emoji: '⚖️',
    monthly: 1500,
    does: "Droit des affaires appliqué à la vente en ligne : conditions générales, litiges acheteurs, garantie légale et droit de rétractation, contrefaçon, création d'entreprise et choix du statut, obligations d'un dropshippeur envers ses clients.",
    caveat:
      "Il informe, il ne représente pas. Aucun avis rendu ici n'est une consultation juridique : un litige engagé, une mise en demeure ou un contrat signé demandent un avocat inscrit au barreau.",
    where: 'Agents → Discuter',
    href: '/agents/avocat',
  },
  {
    key: 'livraisons',
    name: 'Yann',
    role: 'Agent Livraisons',
    family: 'comptoir',
    category: 'logistique',
    emoji: '📦',
    does: "Le suivi des colis. Où en est une commande, que faire d'un colis bloqué, comment répondre à un acheteur qui s'impatiente.",
    where: 'Agents → Discuter',
    href: '/agents/livraisons',
  },
  {
    key: 'marketing',
    name: 'Nadia',
    role: 'Responsable marketing',
    family: 'comptoir',
    category: 'marketing',
    emoji: '📣',
    does: "Les campagnes payantes : quel produit mérite un budget, quel angle convertit, quel format pour quel réseau, comment lire un coût par acquisition et savoir quand couper. Elle produit aussi le visuel, au format exact de chaque réseau.",
    caveat:
      "Elle ne dépense pas votre argent. Le budget, le ciblage et les enchères restent chez la régie, là où vous voyez ce qui part — une application qui engage un budget publicitaire à votre place est une application qu'on n'ose plus laisser tourner.",
    where: 'Marketing',
    href: '/marketing',
  },
]

export const ALL_AGENTS = [...PIPELINE_AGENTS, ...SUPPORT_AGENTS]

export const SUPPORT_KEYS = SUPPORT_AGENTS.map((a) => a.key)

export function findSupportAgent(key: string) {
  return SUPPORT_AGENTS.find((a) => a.key === key) ?? null
}
