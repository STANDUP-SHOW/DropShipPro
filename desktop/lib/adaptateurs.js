'use strict'
/**
 * Ce que l'exécuteur sait de chaque place de marché : où est le formulaire, quels
 * champs viser, lesquels sont indispensables. Ce sont des DONNÉES, faciles à
 * corriger ; quand un champ ne se trouve pas, il est rendu dans `manque` et
 * l'exécuteur laisse la main au vendeur au lieu de publier une annonce à moitié
 * remplie.
 *
 * **Facebook : relevé sur la vraie page connectée le 30/09/2026.** Les classes
 * sont illisibles et changent : les champs se repèrent par le texte de leur
 * `<label>` (« Titre », « Prix », « Description » — cette dernière n'apparaît
 * qu'une fois la catégorie choisie). La catégorie est un `label[role=combobox]`
 * qui ouvre un `[role=dialog]` « Menu déroulant » à un seul niveau ; l'état un
 * `[role=listbox]`. Le bouton du bas est « Suivant » (grisé par
 * `aria-disabled` tant que le formulaire est incomplet), puis « Publier ».
 *
 * **Vinted et Leboncoin : sélecteurs venus de l'extension, jamais confrontés à
 * une vraie page connectée** (le Chrome de Max n'y était pas connecté le 30/09 :
 * Vinted renvoie à l'inscription, Leboncoin demande « Me connecter »). Leur
 * catégorie est une fenêtre à plusieurs niveaux qui reste à relever : elle est
 * dans `requis` sans réglage, donc le mode automatique n'y publie rien et le dit.
 *
 * `requis` : sans eux, jamais de publication automatique.
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
    libelles: {
      titre: ['Titre', 'Title'],
      description: ['Description'],
      prix: ['Prix', 'Price'],
    },
    photos: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
    categorie: {
      bouton: 'label[role="combobox"]',
      libelles: ['Catégorie', 'Category'],
      menu: '[role="dialog"][aria-label="Menu déroulant"], [role="dialog"][aria-label="Dropdown menu"]',
      option: '[role="button"]',
      suffixes: ['Livraison possible', 'Shipping available'],
      fourreTout: ['Divers', 'Miscellaneous'],
    },
    etat: {
      bouton: 'label[role="combobox"]',
      libelles: ['État', 'Condition'],
      menu: '[role="listbox"]',
      option: '[role="option"]',
    },
    etapes: ['[aria-label="Suivant"]', '[aria-label="Next"]'],
    publier: ['[aria-label="Publier"]', '[aria-label="Publish"]'],
    requis: ['titre', 'description', 'prix', 'photos', 'categorie', 'etat'],
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
