# Publier l'extension sur le Chrome Web Store

Objectif : que l'utilisateur n'ait plus jamais à retélécharger l'extension. Une
extension chargée en « Mode développeur » ne se met jamais à jour ; publiée sur le
store, même en mode non répertorié, Chrome l'actualise seul chez tout le monde.

## Ce qui est déjà prêt dans le dépôt

- **Le paquet à téléverser** : `cd backend && node extension/build-store-zip.cjs`
  produit `backend/extension-store.zip`. Le dossier de travail n'est pas modifié :
  il reste chargeable non empaqueté pour le développement.
- **Ce que le script retire du manifeste publié**, et pourquoi :
  - `http://localhost:4000` et `http://localhost:5173` : n'ont de sens que sur une
    machine de développement, et un examinateur les lit comme une demande
    inexpliquée ;
  - `*.temu.com`, `*.joybuy.com`, `*.aliexpress.com` : redondants. Le bouton de
    capture s'enregistre site par site après autorisation depuis le panneau, via
    `optional_host_permissions`. Les demander à l'installation rendait l'écran
    d'autorisation bien plus effrayant que ce que l'extension fait à ce moment-là.
- **La politique de confidentialité** : https://www.drop-shipper.fr/confidentialite
  (page publique, hors authentification — le store vérifie qu'elle est accessible).

## Ce qui reste à votre charge

1. Compte développeur sur https://chrome.google.com/webstore/devconsole — 5 $ une
   fois, par carte bancaire.
2. **Une adresse email réellement relevée** : l'examen écrit dessus, et un message
   ignoré fait échouer la publication. La page de confidentialité annonce
   `contact@drop-shipper.fr` : créez-la, ou changez la constante `CONTACT_EMAIL`
   dans `frontend/src/pages/Privacy.tsx`.
3. **Captures d'écran** : 1 à 5 images en 1280×800. Les plus convaincantes sont le
   bouton « Ajouter à DropShipper IA » sur une fiche produit, le panneau de
   l'extension, et un formulaire Vinted rempli automatiquement.
4. **Icône de la fiche** : 128×128 — `icon128.png` du dossier convient.
5. Choisir **Non répertorié** dans Visibilité : installable par votre lien
   uniquement, invisible dans les recherches, mises à jour automatiques quand même.

## Textes de la fiche, à copier tels quels

**Nom** : DropShipper IA

**Description courte** (132 caractères maximum)

    Importez un produit depuis n'importe quelle boutique et remplissez vos annonces Vinted, Leboncoin, eBay ou Facebook.

**Description détaillée**

    DropShipper IA est l'extension compagnon du service DropShipper IA
    (www.drop-shipper.fr), destinée aux vendeurs qui gèrent un catalogue en ligne.

    Elle sert à deux choses :

    1. Importer un produit. Sur une boutique que vous avez autorisée, un bouton
    apparaît sur la fiche produit. Un clic envoie le titre, le prix, les photos et
    les variantes vers votre catalogue DropShipper IA, où l'annonce est réécrite et
    préparée.

    2. Remplir un formulaire de vente. Sur Vinted, Leboncoin, eBay ou Facebook
    Marketplace, elle remplit le formulaire de dépôt avec l'annonce de votre choix :
    titre, description, prix et photos. Vous relisez, vous corrigez si besoin, et
    c'est vous qui cliquez sur « Publier » — jamais l'extension.

    L'extension ne lit aucune page tant que vous n'avez pas autorisé le site
    concerné, un par un, et vous pouvez retirer cette autorisation à tout moment.
    Elle ne collecte aucune donnée de navigation et n'affiche aucune publicité.

    Un compte DropShipper IA est nécessaire.

**Catégorie** : Outils de travail (Workflow & Planning)
**Langue** : Français

## Justification de chaque permission

Le formulaire d'examen demande une justification par permission. À recopier :

| Permission | Justification à saisir |
|---|---|
| `storage` | Conserve le jeton de connexion au compte DropShipper IA, l'adresse de l'API, et la liste des sites que l'utilisateur a autorisés. |
| `tabs` | Le panneau lit l'adresse de l'onglet actif pour proposer à l'utilisateur d'autoriser ce site précis, et pour ouvrir l'annonce importée dans un nouvel onglet. |
| `scripting` | Injecte le bouton d'import sur les sites autorisés, et le script de remplissage sur les formulaires de dépôt d'annonce. |
| `notifications` | Signale la fin d'un remplissage, ou une connexion requise sur la marketplace, quand l'onglet concerné n'est pas au premier plan. |
| `tabGroups` | Regroupe dans un même groupe d'onglets les formulaires ouverts pour une même diffusion, afin que l'utilisateur les retrouve. |
| Hôtes marketplaces (Vinted, Leboncoin, eBay, Amazon, Facebook, Cdiscount, TikTok Shop, Google Merchant) | Remplir le formulaire de dépôt d'annonce sur ces sites, à la demande de l'utilisateur. C'est la fonction même de l'extension. |
| Hôtes DropShipper IA (drop-shipper.fr, API Railway) | Envoyer et lire les annonces de l'utilisateur sur son propre compte. |
| `optional_host_permissions: https://*/*` | Jamais demandée à l'installation. L'utilisateur autorise une boutique à la fois, depuis le panneau, pour y faire apparaître le bouton d'import. |

**Objectif unique** (single purpose), à recopier :

    Transférer une fiche produit vers le catalogue DropShipper IA de l'utilisateur,
    et remplir pour lui les formulaires de dépôt d'annonce des marketplaces.

**Utilisation des données** — cocher : identité (adresse email), contenu de site
web (fiche produit des sites autorisés). Puis les trois attestations : les données
ne sont pas vendues à des tiers, ne servent pas à un usage étranger à la fonction
annoncée, et ne servent pas à évaluer la solvabilité.

## Après acceptation

- Remplacer le bouton « Télécharger l'extension » du tableau de bord, des réglages
  et du guide par le lien du store, pour que les nouveaux utilisateurs partent
  directement sur la version qui se met à jour seule.
- Prévenir les utilisateurs déjà installés en mode développeur : eux doivent
  réinstaller une dernière fois depuis le store, sans quoi ils resteront figés.
- Publier une mise à jour = incrémenter `version` dans `extension/manifest.json`,
  relancer le script, téléverser. Chrome propage en quelques heures.
