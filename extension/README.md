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

Connectez-vous une fois via l'icône de l'extension dans la barre d'outils. Ensuite,
un bouton violet apparaît automatiquement en bas à droite selon la page :

### Sur une page produit (Temu, JoyBuy, AliExpress)

Bouton **« + Ajouter à DropShip Pro »**. Il lit la page telle qu'elle s'affiche
dans votre navigateur — donc **avec le prix, la galerie photo et les variantes
(tailles, couleurs)**, que le serveur ne peut pas récupérer seul : ces sites les
chargent en JavaScript après l'affichage. Le produit part directement dans votre
back-office, passe par l'IA et reçoit votre filigrane.

### Sur une page de vente (Vinted, Leboncoin, eBay, Amazon)

Bouton **« ⚡ Publier avec DropShip Pro »**. Il ouvre la liste de vos produits ;
vous en choisissez un et le formulaire se remplit aussitôt : titre, description,
prix de revente et photos filigranées.

Un bandeau en haut de page indique ce qui a été rempli et ce qu'il reste à
compléter — typiquement **la catégorie**, qui se choisit à la main (la catégorie
suggérée pour cette plateforme est affichée dans le bandeau).

Vous relisez, puis cliquez sur *Publier* vous-même sur la plateforme.

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
