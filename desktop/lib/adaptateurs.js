'use strict'
/**
 * Ce que l'exécuteur sait de chaque place de marché : où est le formulaire, quels
 * champs viser, lesquels sont indispensables.
 *
 * **Les sélecteurs viennent de l'extension** (backend/extension/content/*.js),
 * écrits par des sessions précédentes et jamais confrontés ici à une vraie page
 * connectée : le 30/09/2026 le Chrome de Max n'était connecté ni à Vinted ni à
 * Leboncoin. Ils sont des DONNÉES, faciles à corriger ; quand l'un ne trouve rien,
 * le champ est rendu dans `manque` et l'exécuteur laisse la main au vendeur au
 * lieu de publier une annonce à moitié remplie.
 *
 * `requis` : sans eux, jamais de publication automatique. La catégorie est dans
 * la liste pour Vinted et Leboncoin : c'est une fenêtre à plusieurs niveaux qu'un
 * script ne règle pas de façon fiable (constat de l'extension). Tant qu'elle n'est
 * pas réglée, le mode automatique ne publie rien et le dit.
 */
const ADAPTATEURS = {
  VINTED: {
    formulaire: 'https://www.vinted.fr/items/new',
    champs: {
      titre: ['input[name="title"]', 'input#title', '[data-testid="title--input"]'],
      description: ['textarea[name="description"]', 'textarea#description', '[data-testid="description--input"]'],
      prix: ['input[name="price"]', 'input#price', '[data-testid="price-input--input"]'],
    },
    photos: ['input[type="file"]'],
    publier: ['button[data-testid="upload-form-save-button"]', 'button[type="submit"]'],
    requis: ['titre', 'description', 'prix', 'photos', 'categorie'],
  },
  LEBONCOIN: {
    formulaire: 'https://www.leboncoin.fr/deposer-une-annonce',
    champs: {
      titre: ['input[name="subject"]', 'input#subject'],
      description: ['textarea[name="body"]', 'textarea#body'],
      prix: ['input[name="price_cents"]', 'input#price_cents'],
    },
    photos: ['input#fileInput', 'input[type="file"]'],
    publier: ['button[type="submit"]'],
    requis: ['titre', 'description', 'prix', 'photos', 'categorie'],
  },
  FACEBOOK: {
    formulaire: 'https://www.facebook.com/marketplace/create/item',
    champs: {
      titre: ['input[type="text"]'],
      description: ['textarea', '[role="textbox"]'],
      prix: ['input[type="text"]'],
    },
    photos: ['input[type="file"]'],
    publier: ['div[aria-label="Publier"]', 'div[aria-label="Publish"]'],
    requis: ['titre', 'description', 'prix', 'photos'],
  },
}

/** Ce qui manque parmi les champs indispensables, dans l'ordre. */
function manquants(plateforme, rempli) {
  const a = ADAPTATEURS[plateforme]
  if (!a) return []
  const fait = new Set(rempli)
  return a.requis.filter((r) => !fait.has(r))
}

module.exports = { ADAPTATEURS, manquants }
