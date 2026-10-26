# DropShipper Desktop

Le compagnon de bureau de drop-shipper.fr (Electron). Décisions : `docs/v2/DECISIONS.md`.

## La fenêtre (0.4.0, d'après `docs/v2/memo-final-ecosysteme.md` et `memo-auto-fulfillment.md`)

**Commandes chez les fournisseurs sans API (0.4.0, mémo auto-fulfillment § III)** :
« Commandes fournisseurs » liste les ventes dont le fournisseur n'est pas relié par
API. « Préparer » ouvre la boutique du fournisseur dans la session du vendeur
(`persist:fournisseur-<hôte>`, il s'y connecte lui-même une fois), clique la variante
fixée sur la vente (jamais devinée), « Ajouter au panier », « Passer la commande »,
remplit l'adresse du client (autocomplete, puis nom/libellé des champs) et **s'arrête à
l'écran de paiement** : aucun bouton de paiement n'est jamais cliqué, aucun champ de
carte lu ni rempli. La fenêtre reste ouverte, le vendeur paie, puis « J'ai payé »
(`POST /api/agent/achats/done`). Chaque arrêt (connexion demandée, variante introuvable,
bouton non reconnu, vérification anti-robot) est dit et la main est rendue. Fichiers :
`lib/achats.js` (décisions, testable seul), `lib/commande.js` (la séquence), `lib/pilote-achat.js`,
`lib/page.js` (`cliquerTexte`, `remplirAdresse`, `signesPage`). Banc : `npm run check:achats`
(vraie fenêtre Electron contre `banc/faux-fournisseur.html`). **Jamais essayé chez un vrai
fournisseur** : les mots des boutons et des champs sont des données, à compléter au premier
site qui diffère.

**Import AUTO-SHIPPER des fiches que seul un navigateur lit (0.4.2, 14/10/2026)** : le
pilote du site met en file (déjà payés) les gagnants de Temu, AliExpress, Shein… que ni
le serveur ni l'API AliExpress ne lisent. L'application les prend chaque minute
(`GET /api/agent/file-autoshipper`), ouvre chaque fiche dans une fenêtre cachée (session
`persist:fournisseur-<hôte>`), la relève avec **les scripts de l'extension eux-mêmes**
(copiés dans `extraction/` par `copier-extraction.cjs`, monde isolé, doublure de
`chrome.*`) et l'envoie à `…/capture` : le serveur importe, publie, sans nouveau débit.
Cinq fiches par passage, 15 s entre deux ; au premier mur anti-robot, le fournisseur est
en pause une heure et la ligne attend. Fichiers : `lib/file-autoshipper.js` (logique),
`lib/releveur.js` (fenêtre). Bancs : `npm run check`, `npm run check:releve` (vraie
fenêtre Electron contre une fiche locale). **Jamais essayé sur un vrai Temu/Shein.**

**DESKTOP POWER (0.5.0, 24/10/2026)** : plus de barre à gauche. La fenêtre est **le site
drop-shipper.fr lui-même, en pleine page, dans son propre navigateur** (session
`persist:site`), avec son menu. Ses pages DESKTOP POWER (WebShipper, SmartMarket,
RemoteShipping, AdsAnalyser, AUTO-SHIPPER Importer, MarketPlus) parlent à l'application par
`window.dropshipperDesktop` (`site-preload.js`), exposé aux seules pages du site et revérifié
à chaque appel. Elles y posent **un navigateur intégré** : une vraie vue par profil
(`persist:webshipper`, `persist:ads`, et les partitions de Vinted, Leboncoin, Facebook),
placée sur l'emplacement réservé dans la page, sans aucun pont. MarketPlus dit une
plateforme « connectée » seulement quand son formulaire de dépôt s'ouvre sans demander de
connexion. Décisions dans `lib/power.js` ; bancs : `check-desktop.cjs` (logique) et
`check-power.cjs` (vraie fenêtre Electron contre un faux site local). Les panneaux locaux
(partages, commandes fournisseurs, publication, journal) s'ouvrent depuis le site et
reviennent par « Retour au site ».
Le vendeur s'y connecte une fois ; **ce poste se relie alors tout seul** (une clé
desktop est créée avec sa session, gardée chiffrée ici ; aucun mot de passe lu).
Sous « Sur ce poste » : les produits partagés à importer, la publication par session
(Vinted, Leboncoin, Facebook) et le journal.

**Partager un produit** vers la liste à importer (la même que celle du mobile) :
« Garder pour plus tard » dans WebShipper, presse-papiers capturé (interrupteur, coupé par
défaut), adresse `dropshipper://partager?url=…`, menu de la zone de notification.
Fermer la fenêtre ne coupe pas l'agent : il vit dans la zone de notification.
Le menu « Partager » de Windows lui-même n'est ouvert qu'aux applications du Store
(MSIX) : pas dans cette version.

## Ce qui est écrit (30/09/2026)

**Constaté le 30/09 au soir (0.3.0)** : liaison automatique depuis la session du site, partage depuis la barre (source `desktop`, visible côté serveur), annonce et rayons affichés, « Préparer » sur le vrai Facebook — `backend/check-desktop-reel.ts` sur l'application INSTALLÉE. Avant (0.2.1) : l'installeur s'installe (mode silencieux, code 0) ; l'application INSTALLÉE, avec une clé desktop d'un compte jetable, se relie à l'API de production, affiche l'annonce en attente et les rayons du jour, ouvre la vraie page Facebook sur « Préparer » et reconnaît la session absente (`backend/check-desktop-reel.ts`). Le vrai pilote remplit et publie une réplique locale du formulaire Facebook dans la vraie fenêtre Electron (`check-pilote.cjs`). **Reste non constaté : une annonce publiée sur le vrai Facebook avec un vrai compte.**

| Pièce | Fichier | État |
|---|---|---|
| Clé d'API chiffrée par le coffre du système, appairage | `lib/config.js`, `lib/api.js`, `main.js` | banc vert ; **fenêtre réelle : fausse clé refusée par l'API de production, message affiché** (`check-fenetre.cjs`) |
| File de travail (liens partagés du mobile), sondage fixe 60 s, `claim` | `lib/file.js` | banc vert |
| Sessions persistantes Vinted / Leboncoin / Facebook (partition `persist:*`, le vendeur se connecte lui-même) | `main.js` | jamais essayé avec un vrai compte |
| Garde-fous du mode automatique : accord daté, plafonds (durs), espacement, arrêt au premier blocage, journal | `lib/plafonds.js` | banc vert |
| Surveillance des blocages sur chaque fenêtre de session | `main.js` (`surveiller`) | jamais essayé avec un vrai compte |
| Exécuteur de publication (modes validation et automatique, arrêt au blocage, jamais de « Publier » avec un champ indispensable manquant) | `lib/executeur.js` | banc vert avec faux pilote |
| **Facebook Marketplace** : champs par libellé, catégorie et état choisis dans les listes lues sur la page, « Suivant » puis « Publier » | `lib/adaptateurs.js`, `lib/page.js`, `lib/choix.js`, `lib/pilote-electron.js` | **structure relevée sur la vraie page connectée** ; la lecture de la liste des catégories a tourné sur la vraie page (26 rayons) ; le remplissage et la publication n'ont pas été exécutés sur un vrai compte |
| Vinted, Leboncoin | `lib/adaptateurs.js` | sélecteurs de l'extension, **jamais confrontés à une page connectée** ; catégorie non réglée |
| Import groupé des gagnants du jour, avec **marge minimale et rayons choisis par le vendeur** | `lib/circuit.js`, `main.js`, `renderer/` | banc vert ; serveur : `check-agent-publications.ts` vert |
| File côté serveur : `GET /api/agent/publications`, `POST …/resultat`, `GET /api/agent/gagnants?categories=` | `backend/src/routes/agent.ts` | banc vert |
| Écran de contrôle (CSP stricte, données posées en `textContent`) | `renderer/` | **chargé dans la vraie fenêtre Electron** (`check-fenetre.cjs` : pont complet, tous les éléments présents) ; clics des écrans connectés non essayés |

## Ce qui n'est PAS fait

- **Vinted / Leboncoin** : leur catégorie est une fenêtre à plusieurs niveaux, à relever sur une session connectée (le Chrome de Max ne l'était pas le 30/09 : Vinted renvoie à l'inscription, Leboncoin à « Me connecter »). Tant qu'elle n'est pas réglée, **le mode automatique n'y publie rien** (« à compléter par vous : categorie ») ; « Préparer » remplit le reste. Le mécanisme existe (`categorie: { bouton, libelles, menu, option }` dans l'adaptateur, comme Facebook) : il reste à y mettre les vrais sélecteurs.
- Une vraie publication Facebook de bout en bout (compte de test, accord donné). À surveiller ce jour-là : le prix part en euros entiers (`prix: 'entier'`), et la connexion « Continuer avec Google » peut être refusée par Google dans une fenêtre d'application (se connecter par e-mail).
- Session absente : l'agent le dit (« connectez-vous dans l'application ») sans pause ni échec ; signes relevés sur les trois sites depuis un profil Electron vierge.
- Les imports en masse par le navigateur, la préparation des commandes fournisseurs (arrêt au paiement).
- Synchro par WebSocket (le sondage suffit tant que la file est courte).
- Signature des exécutables (certificat à acheter) et mises à jour automatiques.

## Ce qui est interdit ici (CLAUDE.md, décision du 29/09/2026)

Pas de faux profil matériel, pas de navigateur « stealth », pas de résolution de captcha, pas de hasard « anti-bot » : intervalles fixes, navigateur normal, vraie session. Le premier captcha ou avertissement arrête la plateforme ; le vendeur reprend lui-même. Aucun identifiant de place de marché n'est lu ni transmis.

## Lancer

```bash
cd desktop
npm install            # télécharge Electron (~100 Mo)
npm run check          # banc de la logique pure, sans Electron
npm run check:fenetre  # ouvre la vraie fenêtre quelques secondes (profil jetable) et lit l'écran
npm run check:pilote   # le vrai pilote, dans Electron, contre la réplique du formulaire Facebook (banc/)
cd ../backend && npx tsx check-desktop-reel.ts   # l'application empaquetée contre l'API de production (compte jetable)
npm start
```

## Connexion Google (0.4.1)

Google refuse sa connexion dans la vue intégrée : sa fenêtre partait dans le navigateur sans retour possible (bloquée sur `accounts.google.com/gsi/transform`, 12/10). « Continuer avec Google » ouvre désormais `drop-shipper.fr/connexion-desktop?etat=…` dans le navigateur du poste ; une fois connecté, le site rend la main par `dropshipper://connexion?code=…&etat=…` (code de 2 minutes, usage unique, `POST /api/desktop/code` puis `/api/desktop/echange`, `backend/src/routes/desktopConnexion.ts`), et la session est posée dans la fenêtre du site. Un état non émis par l'application est refusé (`lib/connexion.js`, banc `npm run check`). Un compte créé par Google n'a pas de mot de passe : « Email ou mot de passe incorrect » est alors normal.

## Installeurs Windows

`npm run build` produit dans `dist/` : `DropShipper Desktop Setup 0.2.1.exe` (NSIS) et `DropShipper Desktop 0.2.1.msi`. **Non signés** : Windows SmartScreen affichera « Éditeur inconnu » (Informations complémentaires › Exécuter quand même) tant qu'un certificat de signature n'est pas acheté. Sous Windows, `electron-builder` échoue sur des liens symboliques macOS de son cache `winCodeSign` : copier un dossier extrait du cache en `winCodeSign-2.6.0` (fait sur ce poste).

Clé d'API : drop-shipper.fr › Réglages › « Créer une clé pour DropShipper Desktop » (préfixe `dsp_desk_`).
