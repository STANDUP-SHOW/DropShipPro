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
    prix: 'virgule',
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
    prix: 'entier',
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
    prix: 'entier',
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

/**
 * Les signes d'une session absente, relevés le 30/09/2026 depuis un profil Electron
 * vierge : Vinted renvoie à `/member/register`, Leboncoin garde l'adresse et écrit
 * « Connectez-vous ou créez un compte », Facebook renvoie à l'accueil de Marketplace
 * avec un formulaire de connexion (champ mot de passe). Un formulaire d'annonce n'a
 * jamais de champ mot de passe : sa présence suffit, sur les trois. Ce n'est PAS un
 * blocage : rien n'est mis en pause, le vendeur est invité à se connecter.
 */
const SANS_SESSION = {
  VINTED: { url: /\/member\/(register|login|signup)|\/session|\/signup/i, texte: null },
  LEBONCOIN: { url: /auth\.leboncoin\.fr|\/connexion/i, texte: /Connectez-vous ou créez un compte/i },
  FACEBOOK: { url: /facebook\.com\/(login|reg)\b|\/login\/?\?|\/login\.php/i, texte: null },
}

function sansSession(plateforme, { url = '', texte = '', motDePasse = false } = {}) {
  const s = SANS_SESSION[plateforme]
  if (!s) return false
  if (motDePasse) return true
  return Boolean((s.url && s.url.test(url)) || (s.texte && s.texte.test(String(texte).slice(0, 4000))))
}

/** Ce qui manque parmi les champs indispensables, dans l'ordre. */
function manquants(plateforme, rempli) {
  const a = ADAPTATEURS[plateforme]
  if (!a) return []
  const fait = new Set(rempli)
  return a.requis.filter((r) => !fait.has(r))
}

module.exports = { ADAPTATEURS, manquants, sansSession }
