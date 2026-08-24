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

export interface AgentProfile {
  key: string
  name: string
  role: string
  family: AgentFamily
  emoji: string
  /** Ce qu'il fait, dit au vendeur et pas au développeur. */
  does: string
  /** Où son travail se voit dans l'application. */
  where: string | null
  /** Adresse de la page concernée, quand il y en a une. */
  href: string | null
}

/** Les agents de chaîne : ils produisent, ils ne discutent pas. */
export const PIPELINE_AGENTS: AgentProfile[] = [
  {
    key: 'scrapper',
    name: 'Sacha',
    role: 'Agent Scrapper',
    family: 'chaine',
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
    emoji: '👁️',
    does: "Regarde les photos avant la mise en ligne et écarte ce qui n'est pas le produit. Garde toutes les vraies photos, relève les couleurs réellement visibles, écarte les tailles incohérentes.",
    where: 'Réglages → Agent de contrôle',
    href: '/settings',
  },
  {
    key: 'seller',
    name: 'Victor',
    role: 'Agent Vendeur',
    family: 'chaine',
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
    emoji: '✈️',
    does: "Fait travailler toute la chaîne sans vous : il reprend les produits conseillés par vos chefs de rayon, importe ce qui passe vos critères, et publie. Il lui faut au moins un chef de rayon pour avoir de quoi travailler.",
    where: 'Pilote automatique',
    href: '/pilote',
  },
]

/** Les agents de comptoir : on leur parle. */
export const SUPPORT_AGENTS: AgentProfile[] = [
  {
    key: 'hotline',
    name: 'Camille',
    role: 'Agent Hotline',
    family: 'comptoir',
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
    emoji: '🛠️',
    does: "Les problèmes après vente : produit non conforme, colis abîmé, demande de remboursement. Il ouvre un litige avec vous et suit ceux en cours.",
    where: 'Agents → Discuter',
    href: '/agents/sav',
  },
  {
    key: 'livraisons',
    name: 'Yann',
    role: 'Agent Livraisons',
    family: 'comptoir',
    emoji: '📦',
    does: "Le suivi des colis. Où en est une commande, que faire d'un colis bloqué, comment répondre à un acheteur qui s'impatiente.",
    where: 'Agents → Discuter',
    href: '/agents/livraisons',
  },
]

export const ALL_AGENTS = [...PIPELINE_AGENTS, ...SUPPORT_AGENTS]

export const SUPPORT_KEYS = SUPPORT_AGENTS.map((a) => a.key)

export function findSupportAgent(key: string) {
  return SUPPORT_AGENTS.find((a) => a.key === key) ?? null
}
