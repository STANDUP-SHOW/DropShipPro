# Extension DropShip Pro

Remplit automatiquement les formulaires de vente Vinted, Leboncoin et eBay avec
un produit importé dans DropShip Pro — l'équivalent de ce que font Vendoo ou Crosslist.

## Installation (mode développeur)

1. Ouvrez `chrome://extensions` dans Chrome (ou Edge).
2. Activez **Mode développeur** (interrupteur en haut à droite).
3. Cliquez **Charger l'extension non empaquetée** et sélectionnez ce dossier `extension/`.
4. Épinglez l'icône DropShip Pro dans la barre d'outils.

Le backend doit tourner sur `http://localhost:4000` (voir le README racine).

## Utilisation

1. Cliquez sur l'icône de l'extension → connectez-vous avec votre compte DropShip Pro.
2. La liste de vos produits importés s'affiche.
3. Cliquez sur **Vinted**, **Leboncoin** ou **eBay** sous le produit voulu.
4. L'onglet de la plateforme s'ouvre et le formulaire se remplit tout seul :
   titre, description, prix et photos filigranées.
5. Un bandeau violet en haut de page indique ce qui a été rempli et ce qu'il reste
   à compléter — typiquement **la catégorie**, qui se choisit à la main.
6. Vous relisez et cliquez sur *Publier* vous-même sur la plateforme.

## Limites connues

- **La catégorie n'est jamais remplie automatiquement.** Sur Vinted c'est un sélecteur
  modal à plusieurs étapes, sur Leboncoin elle conditionne la suite du formulaire.
  La catégorie suggérée par le mapping est affichée dans le bandeau.
- **Les sélecteurs peuvent casser.** Ces sites n'ont pas d'API publique : l'extension
  cible leurs champs de formulaire, qui changent sans préavis. Si un champ n'est plus
  trouvé, il est listé dans le bandeau et les sélecteurs sont à mettre à jour dans
  `content/<plateforme>.js`.
- **Les photos** sont injectées dans le premier `input[type=file]` de la page. Si la
  plateforme utilise un uploader personnalisé sans champ fichier standard, il faut
  les glisser manuellement (bouton *Télécharger les photos* dans l'application).
- **Rien n'est publié automatiquement.** L'extension remplit le formulaire, c'est
  vous qui validez — c'est volontaire : publier sans relecture violerait les CGU
  de ces plateformes et exposerait votre compte à une suspension.

## eBay

Une fois vos identifiants eBay Sell API renseignés dans **Réglages**, la publication
eBay passera par l'API côté serveur et cette extension ne sera plus nécessaire pour
cette plateforme.
