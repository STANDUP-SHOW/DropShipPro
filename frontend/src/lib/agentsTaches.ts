/**
 * La fiche détaillée de chaque agent : une phrase courte pour la carte, puis
 * ses tâches, une par ligne, pour le dépliant « Voir le rôle » (14/10/2026).
 *
 * Tout est tiré du texte `does` de `backend/src/services/agentRoster.ts`, sans
 * rien ajouter : si le rôle d'un agent change là-bas, il change ici aussi.
 * Un agent absent de cette table retombe sur son texte `does`, coupé en phrases.
 */

export interface FicheAgent {
  bref: string
  taches: string[]
}

const FICHES: Record<string, FicheAgent> = {
  scrapper: {
    bref: 'Récupère la fiche du produit chez le fournisseur.',
    taches: [
      'Lit la fiche du produit chez le fournisseur.',
      'En ramène le titre, le prix, les photos et les options.',
      "Sur Temu et AliExpress, travaille depuis votre navigateur, par l'extension : ces sites ne livrent rien à un serveur.",
    ],
  },
  writer: {
    bref: "Réécrit chaque annonce avec un contenu original.",
    taches: [
      "Réécrit le titre de l'annonce.",
      'Rédige la description.',
      'Remplit neuf attributs du produit.',
      'Écrit six arguments de vente.',
      'Choisit vingt mots-clés.',
      'Produit un contenu original : recopier la fiche du fournisseur fait sanctionner le référencement.',
    ],
  },
  seller: {
    bref: "Adapte l'annonce à chaque destination au moment de publier.",
    taches: [
      "Adapte l'annonce à chaque destination au moment de la publier.",
      'Ajuste la longueur du titre.',
      'Choisit la catégorie de la plateforme.',
      'Remplit les champs obligatoires.',
      'Corrige au lieu de signaler : un avertissement ne vend rien.',
    ],
  },
  control: {
    bref: "Vérifie les photos des annonces importées sans œil humain.",
    taches: [
      "En mode automatique, contrôle les photos que l'extension téléverse.",
      "Intervient sur l'import en lot et l'Auto-SHIPPER IA, où les annonces entrent sans œil humain.",
      "Écarte ce qui n'est pas le produit : bannières, recommandations, panier.",
      'Garde les vraies photos du produit.',
      "Propose d'en régénérer via l'agent graphiste quand une annonce se retrouve sans photo correcte.",
      'Active, elle coûte 10 drops par annonce contrôlée.',
    ],
  },
  photo: {
    bref: 'Refait les photos de vos produits, en situation.',
    taches: [
      "Refait les photos d'un produit : le même article, en situation, éclairé comme en studio.",
      "Produit six mises en situation d'un coup, depuis le bouton de chaque fiche d'annonce.",
      "Coûte 18 drops l'image.",
      'Ne fait que de la photo : la publicité, avec son logo, son prix et son bouton, est le métier de Laurence.',
    ],
  },
  hotline: {
    bref: 'Répond à vos clients et oriente chaque demande.',
    taches: [
      'En mode automatique, assure la hotline et votre relation avec les clients.',
      'Répond pour vous aux emails.',
      'Répond pour vous aux messages des marketplaces.',
      'Oriente chaque demande vers le bon collègue : un chef de rayon pour un produit, le SAV pour un litige, les livraisons pour un colis.',
    ],
  },
  commercial: {
    bref: 'Vos drops, vos rechargements et vos factures.',
    taches: [
      'Répond sur tout ce qui touche à la plateforme DropShipper IA.',
      'Explique vos drops, vos rechargements et la grille tarifaire.',
      'Explique une facture.',
      'Retrouve un paiement.',
      'Lit vos statistiques financières avec vous.',
    ],
  },
  sav: {
    bref: 'Les problèmes après vente et les litiges.',
    taches: [
      'Traite les problèmes après vente : produit non conforme, colis abîmé, demande de remboursement.',
      'Ouvre un litige avec vous.',
      'Suit les litiges en cours.',
    ],
  },
  comptable: {
    bref: 'Vos chiffres et vos papiers.',
    taches: [
      'Tient vos factures et vos devis.',
      'Suit les encaissements et les remboursements.',
      'Compte les frais de plateforme et le coût des livraisons.',
      'Établit le résultat par place de marché.',
      "Tient le compte de ce que l'application vous coûte, poste par poste.",
    ],
  },
  livraisons: {
    bref: 'Le suivi des colis.',
    taches: [
      'Dit où en est une commande.',
      "Explique que faire d'un colis bloqué.",
      "Aide à répondre à un acheteur qui s'impatiente.",
    ],
  },
  marketing: {
    bref: 'Vos campagnes payantes et leurs visuels.',
    taches: [
      'Dit quel produit mérite un budget.',
      "Trouve l'angle qui convertit.",
      'Choisit le format adapté à chaque réseau.',
      'Explique comment lire un coût par acquisition et savoir quand couper.',
      'Produit le visuel, au format exact de chaque réseau.',
    ],
  },
  avocat: {
    bref: 'Le droit des affaires appliqué à la vente en ligne.',
    taches: [
      'Répond sur vos conditions générales.',
      'Éclaire les litiges avec les acheteurs.',
      'Explique la garantie légale et le droit de rétractation.',
      'Répond sur la contrefaçon.',
      "Aide à la création d'entreprise et au choix du statut.",
      "Rappelle les obligations d'un dropshippeur envers ses clients.",
    ],
  },
}

/** Coupe un texte en phrases, pour un agent qui n'a pas encore sa fiche. */
function enPhrases(texte: string): string[] {
  return texte
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function ficheAgent(key: string, does: string): FicheAgent {
  const fiche = FICHES[key]
  if (fiche) return fiche
  const phrases = enPhrases(does)
  return { bref: phrases[0] ?? does, taches: phrases }
}
