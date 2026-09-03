# DropShipper IA — mémo projet

Ce fichier est lu automatiquement au début de chaque session. Il remplace la
mémoire d'une conversation : tout ce qui compte pour reprendre le travail est ici.

---

**Reprise apres une conversation videe : lire `REPRISE.md`.** Il dit ou on en
est, ce qui bloque et ce qui reste a faire ; ce fichier-ci ne dit que les regles
durables du projet.

---

## Ce que fait l'application

Import d'un produit depuis n'importe quelle boutique → l'IA réécrit l'annonce
(titre, description, attributs, mots-clés) → filigrane sur les photos →
publication vers des marketplaces.

## Où ça tourne

| Élément | Adresse |
|---|---|
| Site | https://www.drop-shipper.fr (l'apex `drop-shipper.fr` redirige vers `www`) |
| API | https://dropshippro-production.up.railway.app |
| Dépôt | https://github.com/STANDUP-SHOW/DropShipPro |
| Base | PostgreSQL sur Railway (la même en local et en production) |

**`localhost` n'est pas l'application du client** : c'est le serveur de
développement, éteint hors session. Toujours tester sur `www.drop-shipper.fr`.

## Structure

```
backend/     Node + Express + TypeScript + Prisma → Railway
backend/extension/  Extension Chrome Manifest V3, servie par /api/public/extension.zip
frontend/    React + Vite + Tailwind v4 → Vercel (Root Directory = frontend)
storefront/  Vitrine de démonstration OGGUS (HTML autonome)
storefront-imprimerie/  Print34, boutique d'imprimerie autonome (voir docs/boutique-imprimerie.md)
backend/storefront-boutique/  La vitrine generique, servie a /b/<adresse> — sous backend/ parce que Railway y a sa racine
docs/        Documentation de l'API catalogue
```

---

## Décisions à ne pas refaire

- **Node, pas Python.** Python n'est pas installé sur la machine ; c'est pour ça
  que le backend n'est pas en FastAPI. La skill `ui-ux-pro-max` a un script de
  recherche en Python, **mais sa valeur est dans ses CSV** : 192 palettes déjà
  écrites en jetons sémantiques, 74 appariements de polices, 84 styles. Ils se
  lisent très bien en Node, et c'est ce que fait `build-themes.cjs`.
- **Pas de connexion automatique aux marketplaces.** Rejouer des mots de passe
  viole leurs CGU et fait suspendre les comptes vendeur. L'extension détecte la
  session et attend que l'utilisateur se connecte.
- **L'agent ne clique jamais sur « Publier »** sur un site tiers. Il remplit, le
  vendeur valide.
- **Un site ne refuse pas de la même façon en local et en production.** Depuis
  une machine personnelle, AliExpress sert une coquille — le contrôle « ni prix
  ni photos » la reconnaît et rend le bon refus. Depuis un hébergeur, il sert un
  mur anti-robot, qui arrivait sous forme de **code HTTP**, donc avant les
  contrôles qui savent expliquer : le vendeur voyait « Impossible d'importer ce
  produit depuis l'URL fournie » et n'apprenait jamais qu'il fallait passer par
  l'extension. Un banc local ne pouvait pas le voir ; le navigateur piloté sur
  `www.drop-shipper.fr` l'a montré en deux minutes. 401, 403, 405, 429, 503 et
  un délai dépassé sont désormais le même refus explicite.
- **Un lot AliExpress ne peut passer que par le panneau latéral.** Sondé le
  02/09/2026 : la fiche répond 200 avec le titre et treize photos, et **aucun
  prix** — ni JSON-LD, ni balise meta, ni rien dans le DOM. Il arrive après
  l'affichage. Aucun serveur n'y verra jamais de prix, donc aucun import par
  adresse ne marchera, quel que soit le travail investi dessus.

  D'où `extension/lot.js` : le vendeur navigue de fiche en fiche, le panneau
  reste ouvert à côté, et chaque « Ajouter » **relève la page pendant qu'elle
  est affichée**. L'import n'envoie ensuite que des fiches déjà lues. Une
  requête par produit, comme côté site. Banc `node check-lot.cjs`.

  Piège associé, découvert en écrivant ce banc : **un faux qui ne respecte pas
  le contrat de ce qu'il remplace invente une panne.** Le faux `apiFetch` y
  faisait `JSON.parse` d'un corps qui est déjà un objet, levait avant
  d'enregistrer l'appel, et rapportait « 0 requête » sur un volet qui en
  envoyait trois.

- **L'import par URL ne marche pas sur Temu, JoyBuy, AliExpress, Shein.** Ces
  sites construisent leur fiche en JavaScript ; le serveur reçoit une coquille
  vide. C'est refusé explicitement, avec renvoi vers l'extension.

## La règle qui prime sur toutes les autres

**Aucune commande qui prend une base « jetable » ne reçoit jamais
`DATABASE_URL`.** En tête : `prisma migrate diff --shadow-database-url`, dont le
rôle est précisément de **vider** la base qu'on lui désigne avant d'y rejouer les
migrations.

Le 01/09/2026, cette commande a été lancée avec l'adresse de la base de
production en base fantôme. Toutes les tables ont été supprimées et recréées
vides : comptes, produits, publications, commandes, crédits, avis. La sauvegarde
de l'hébergeur existait mais était verrouillée derrière l'offre payante, et
datait de dix jours — dix jours de données perdus pour de bon.

Ce qui aurait dû arrêter le geste était déjà écrit dans ce fichier : *« Base :
PostgreSQL sur Railway (la même en local et en production) »*.

Trois conséquences, toutes appliquées :

1. **Une migration se génère sans base fantôme** ou s'écrit à la main, puis
   s'applique avec `npx prisma migrate deploy` — qui n'avance que vers l'avant et
   ne réinitialise rien. Si `migrate dev` devient interactif, c'est un signal à
   lire, pas un obstacle à contourner.
2. **Sauvegarder avant de toucher au schéma**, et pas seulement en comptant sur
   l'hébergeur :

   ```bash
   cd backend && npm run sauvegarde
   ```

   Écrit une copie complète en JSON dans `backend/sauvegardes/<horodatage>/`
   (hors dépôt), garde les copies précédentes, et **signale une chute brutale du
   nombre de lignes** — une sauvegarde qui enregistre un désastre sans le dire le
   rend définitif.
3. **Un script qui touche la base n'écrit rien sans `--ecrire`.** Il montre
   d'abord ce qu'il ferait. Voir `reembaucher-rayons.ts`, `poser-adresses.ts`.

## Pièges vérifiés (ne pas retomber dedans)

- **Le disque de Railway est éphémère.** Sans volume monté sur `/app/storage`,
  toutes les photos filigranées disparaissent à chaque redéploiement. Le chemin
  de montage doit être exactement `/app/storage` : le code écrit dans
  `path.resolve('storage')` depuis `/app`. Monté ailleurs, le volume est
  facturé, présent, et sans effet — aucun message ne le signale.
- **Une page servie par l'API doit vivre sous `backend/`.** Railway déploie avec
  `backend/` pour racine : `storefront-boutique/` placé à la racine du dépôt
  n'arrivait simplement jamais dans le conteneur, et `/b/<adresse>` répondait 500
  — alors que la page existait en local, que `tsc` passait et que tous les bancs
  passaient. Même piège que l'extension en 404, déjà écrit ici, et retombé dedans
  en créant le dossier. Les vitrines autonomes (`storefront/`,
  `storefront-imprimerie/`) restent à la racine : personne ne les sert.
- **L API de production est `dropshippro-production.up.railway.app`.** Un service
  en double sans variables produit des centaines d erreurs P1012 par minute sans
  rien servir : vérifier de quel service viennent les logs avant de chercher dans
  le code.
- **`FRONTEND_URL` accepte une liste** séparée par des virgules : les trois
  origines (apex, www, vercel.app) doivent y figurer, sinon le CORS bloque.
- **Les content scripts ne peuvent pas appeler l'API directement** : une page
  https vers une API http est du contenu mixte, bloqué par Chrome. Tout passe par
  le service worker via `apiFetch` (voir `extension/config.js`).
- **Perdre `VITE_API_URL` sur Vercel casse toute l application**, connexion
  comprise : le bundle appelle alors son propre domaine, et Vercel repond 405.
  Vite fige les `VITE_*` a la compilation, donc ajouter une variable exige un
  redeploiement, et en ecraser une ne se voit qu au premier clic. `lib/api.ts`
  retombe desormais sur l API connue plutot que sur une adresse impossible.
- **Vercel répond 200 à un GET et 405 à un POST** sur `/api/*`. Une adresse d'API
  mal réglée dans l'extension donne donc un 405 incompréhensible ; le popup la
  vérifie désormais avant d'enregistrer.
- **Toujours contrôler l'extension avant de livrer**, avec cette commande :

  ```bash
  cd backend && node extension/check.cjs
  ```

  Elle fait quatre passes, et chacune répond à une panne réellement survenue :
  la **syntaxe** (un `await` dans un callback non-async avait empêché Chrome de
  charger toute l'extension) ; les **constantes utilisées mais jamais définies**
  (`NOT_A_PHOTO` était écrit à trois endroits de `capture.js` sans l'être nulle
  part — syntaxe parfaite, extension chargée, et chaque import s'arrêtait sur
  « NOT_A_PHOTO is not defined » à l'étape des images) ; les **filtres de
  photos**, confrontés à vingt-six adresses réelles ; et le **relevé d une fiche
  produit** — description, caractéristiques techniques et variantes — sur une page
  de montre bâtie comme les vraies, parce que « bracelet acier inoxydable » et
  « 22 rubis » disparaissaient à chaque import. La liste des fichiers n'est
  plus écrite à la main : elle est parcourue, donc un fichier neuf est couvert
  sans que personne y pense.

- **Le tri automatique des photos se contrôle aussi**, sur une page marchande
  montée pour l occasion et servie en local :

  ```bash
  cd backend && npx tsx check-photos.ts
  ```

  Quatre signaux decident, dans cet ordre : ce que le site declare lui-meme
  (JSON-LD, og:image), la presence dans une vraie balise <img>, le CDN dominant,
  le chemin. Et le mobilier de page — en-tete, menu, pied, colonne laterale — est
  ecarte d office : une banniere de soldes est servie par le meme CDN, sous le
  meme chemin, souvent plus grande que les photos du produit. **Le plafond de
  cinq photos n est pas une cible** : mieux vaut trois vraies photos que cinq
  dont une banniere.

- **Une vignette de recommandation est indiscernable d'une photo produit — sauf
  par le lien qui l'enveloppe.** Relevé le 03/09/2026 sur une vraie annonce du
  catalogue : une bague maçonnique importée depuis Temu portait un **pendentif
  boussole** en première photo et un **sac besace kaki « Tokyo Japan »** en
  neuvième. Vingt-six annonces du même lot dans le même état.

  Aucun filtre ne pouvait les écarter, et ce n'était pas un oubli : sur Temu la
  vignette du carrousel sort du **même CDN** que la galerie (`img.kwcdn.com`),
  sous le **même chemin** (`/product/`), dans une **vraie balise `<img>`**, et
  souvent **plus grande** que les photos du produit. Les quatre signaux du tri
  disaient « photo de produit », et ils avaient raison : c'en est une, mais d'un
  autre produit. L'adaptateur Temu les *certifiait* donc — et ce qu'un
  adaptateur désigne passe devant tout, précisément parce qu'on le croit.

  Le seul signal qui les sépare est **structurel** : une vignette de
  recommandation est cliquable vers une autre fiche, c'est sa raison d'être ;
  une photo de galerie ne l'est jamais. `dspPointeVersUneAutreFiche()` vit dans
  `image-scan.js` et sert aussi à `adapters.js` — la recopier ferait deux
  versions qui divergeraient. Deux exceptions vérifiées avant de conclure
  « ailleurs » : un lien vers le fichier image (c'est une loupe) et un lien vers
  la même page avec d'autres paramètres (c'est un choix de variante). Écartées
  mais pas perdues : elles rejoignent la bande dépliable. Banc
  `node check-recommandations.cjs`, éprouvé contre la version fautive —
  **20 voisins sur 28 retenues** sans la règle, 0 avec.

- **Le panier du vendeur est affiché sur toutes les fiches Temu.** Même jour,
  et c'était la cause principale : un **collier boussole** arrivait en photo
  n°1 de dizaines d'annonces — une bague, un parfum, un sac. Ce n'était pas le
  carrousel, qui change d'une fiche à l'autre, mais un **panneau flottant**
  présent partout, donc dans tous les imports et toujours en tête.

  Invisible à tous les filtres : la photo d'un article en panier est une vraie
  photo de produit, sur le bon CDN, sous le bon chemin, à la bonne taille. Et
  `dspChromeImages()` ne regardait que `header, nav, footer, aside` — un
  panneau panier est un `<div>` de plus, aux classes obfusquées.

  Ce qui le distingue est sa **position** : ce qui reste à l'écran quand la
  page défile est du mobilier par construction ; la galerie défile avec la
  fiche. **`fixed` seulement, jamais `sticky`** — plusieurs marchands rendent
  la colonne de la galerie collante pendant qu'on lit la description, et
  l'exclure jetterait les vraies photos. Le banc vérifie les deux sens.

  Leçon plus large : **la photo parasite qui coûte le plus cher est celle qui
  ne change pas d'une fiche à l'autre.** Une mauvaise recommandation abîme une
  annonce ; un élément d'interface persistant les abîme toutes.

- **Une balise SEO n'est pas une description, et le modèle ne peut pas le
  deviner.** Même jour, même lot, et c'est le plus grave des deux :
  `collectDescription()` cherche un bloc par nom de classe
  (`[class*="description"]`). **Temu obfusque tous ses noms de classe** : aucun
  sélecteur ne peut correspondre, jamais. Le relevé retombait donc sur
  `og:description`, qui dit toujours la même chose — « Trouvez des offres
  incroyables sur *titre* sur Temu. Magasinez sur Temu pour économiser. »

  Le modèle recevait ça comme « Description source ». Il n'avait donc que les
  mots du titre, et il a fait ce qu'on lui demandait : il a écrit. Sept
  arguments de vente, neuf attributs, vingt mots-clés, **tous déduits du
  titre** et présentés comme des caractéristiques du produit — « matériau
  aéré », « conception durable pensée pour un usage intensif ». Personne n'avait
  vu le produit.

  **Une annonce inventée est pire qu'une annonce absente** : elle a l'air bonne,
  elle est facturée, et ce sont des affirmations commerciales fausses au nom du
  vendeur. `sourceQuality.ts` mesure donc la matière **avant** de payer l'appel :
  l'accroche SEO n'est pas transmise (présentée comme la parole du fournisseur,
  elle égare le modèle au lieu de le laisser lire le corps de la page), et sans
  matière du tout la réécriture est refusée — texte source gardé, `aiEnhanced`
  à faux, crédit rendu, raison écrite sur la fiche. Le faux positif est le vrai
  danger : la moitié du banc `npx tsx check-substance.ts` sert à vérifier qu'une
  description réelle, même courte, n'est jamais refusée. Ses textes sont **les
  vraies chaînes relues en base**, pas des imitations commodes.

  Corollaire : **`reecrireAnnonce()` ne peut pas réparer ces annonces-là.** Elle
  repart du texte source stocké, qui est justement l'accroche SEO. Elle refuse
  désormais explicitement au lieu d'inventer une seconde fois. Ces fiches se
  réparent en **réimportant depuis la page**, pas en réécrivant.

- **Les connecteurs fournisseurs se contrôlent contre de faux serveurs** :

  ```bash
  cd backend && npx tsx check-fournisseurs.ts && npx tsx check-aliexpress.ts && npx tsx check-refs.ts
  ```

  Le premier couvre BigBuy et CJ, le troisième la lecture de la référence
  fournisseur dans l adresse. Le deuxième est le plus important : **AliExpress
  repond 200 meme quand il refuse**, l echec est dans le corps sous
  `error_response`. Une signature fausse ressemble donc a un produit sans prix,
  c est-a-dire a une rupture — l annonce passerait en brouillon toute seule sans
  qu aucune erreur ne s affiche. Le faux serveur recalcule donc la signature de
  son cote et refuse tout ce qui ne correspond pas. Il verifie aussi qu un refus
  portant sur **un produit** (fiche supprimee) n arrete pas le releve des autres,
  alors qu un refus portant sur **la liaison** (signature, cle, quota) l arrete
  tout de suite : continuer ferait cent appels voues au meme echec.

- **En JSX, ne pas juxtaposer plusieurs expressions de texte** dont une chaîne
  vide : React perd la trace des nœuds et lève « removeChild: the node to be
  removed is not a child ». Composer une seule chaîne.
- **Shopify : quatre sortes de jetons, une seule qui publie.** Le Dev Dashboard
  (dev.shopify.com) propose un « jeton d automatisation d appli » en `atkn_` :
  c est un jeton CI/CD, il ne donne aucun acces au catalogue. Le bon jeton se
  prend dans l administration de la boutique (admin.shopify.com), Parametres ›
  Applications et canaux de vente › Developper des applications › API Admin, et
  commence par `shpat_` (ou `shpca_` pour une app personnalisee -- l ancien
  controle refusait ce prefixe-la, pourtant valide). Diagnostic par prefixe dans
  `services/shopifyToken.ts`, banc `npx tsx check-shopify-token.ts`.

  **Les deux voies sont acceptees depuis le 26/08/2026.** Le Dev Dashboard ne
  delivre plus aucun jeton : il donne un Client ID et un Client Secret qu on
  echange soi-meme (`POST /admin/oauth/access_token`, grant_type
  client_credentials) contre un jeton qui vit 24 h. Cet echange **ne marche que
  si l app et la boutique sont dans la meme organisation Shopify** -- Shopify ne
  le dit pas dans son refus, notre message si. Le jeton echange est garde en
  memoire le temps de sa vie : le redemander a chaque publication ferait trente
  echanges pour trente annonces. Banc `npx tsx check-shopify-oauth.ts`.

  **Mais cette voie n est pas la voie conseillee**, et c est contre-intuitif :
  l echange suppose l app **deja installee sur la boutique**, et une app creee
  dans le Dev Dashboard ne s installe qu avec `shopify app deploy` ou une
  distribution configuree. Un marchand sans projet local est bloque la. La voie
  a conseiller reste l app personnalisee depuis admin.shopify.com : aucun CLI,
  aucun deploiement, un `shpat_` permanent en trois minutes. Piege associe :
  « Autoriser le developpement d applications personnalisees » doit etre active
  une fois, et seul le proprietaire de la boutique peut le faire.

- **Ce qui est vendu au forfait doit avoir un plafond.** L application revend une
  intelligence qu elle achete et ne fabrique pas. Le danger n est pas le nombre
  d utilisateurs, c est le pire d entre eux : a Sonnet une reponse coute ~0,024 EUR,
  donc un abonnement d agent a 15 EUR/mois tenait 21 questions par jour. Un seul
  vendeur a 300 questions/jour coutait 220 EUR pour 15 encaisses.

  Quatre leviers dans `services/chatBudget.ts`, du plus rentable au plus visible :
  **contexte taille** (6 echanges gardes, le reste reduit a la trace des questions
  -- 60 % de caracteres en moins), **instructions mises en cache** (identiques a
  chaque tour, relues au dixieme), **Haiku sur les questions de fait** et Sonnet
  des qu il faut arbitrer ou qu un outil est branche, **plafond de 30 reponses par
  agent et par jour** annonce d avance et affiche des la moitie. Mesure :
  **21 reponses/jour -> 101** pour le meme prix. Banc `npx tsx check-chat-budget.ts`.

  **Les enquetes quotidiennes ne coutent rien** : rapports, opportunites et
  signaux arrivent par `POST /agent/*`, deposes par un agent exterieur que le
  vendeur branche avec sa cle. Ce n est pas notre API Anthropic qui paie.

- **Une image coute 0,0336 $ (~0,031 EUR)**, pas 0,33. Les credits graphiques sont
  le meilleur produit : 47 a 69 % de marge sur les six premiers paliers. Les deux
  derniers sont fragiles -- 23 % a 10 000 images, **3 % a 25 000** (27 EUR de
  benefice sur 800). A repricer avant toute hausse de Google.

- **Le referentiel de categories est en base, et il apprend.** L ancien etait un
  tableau TypeScript de 29 entrees dont 28 de mode homme : une souris gamer
  n avait aucune place ou aller. Le socle vient du classeur de correspondances
  AliExpress/Amazon : **24 rayons, 224 sous-categories, 500 alias de depart**.

  `build-categories.cjs` transforme le classeur en `services/categorySeed.json`
  -- a relancer quand le classeur est enrichi. Le semis tourne au demarrage,
  idempotent, **en lots** : 800 allers-retours un par un prenaient plus de deux
  minutes contre une base distante.

  `resoudreCategorie()` essaie dans l ordre du moins cher au plus cher : choix du
  vendeur, memoire des alias, rapprochement de libelle, puis le modele. **Un
  texte source deja rencontre ne repart jamais au modele** -- mille produits
  d une meme boutique coutent un appel, pas mille. Le modele choisit dans une
  liste fermee ; il ne peut creer une categorie qu en la rattachant a un rayon
  existant, sinon le referentiel grossit en categories jumelles (« Souris »,
  « Souris PC », « Souris d ordinateur ») sans gagner en precision.

  **Rien ne tombe dans « Divers »** : sans categorie, l annonce reste en
  brouillon avec la raison ecrite. Banc `npx tsx check-categories.ts` (il tourne
  contre la vraie base : c est le seul moyen de verifier que la memoire retient).

- **Aucune police sur le serveur : toute publicite sort en carres.** L image par
  defaut de Nixpacks n embarque aucune police. `sharp` compose ses textes par
  librsvg, qui en demande une a fontconfig, n en trouve aucune, et dessine **un
  carre vide par caractere**. Le visuel sort parfaitement compose -- cadre,
  degrade, bouton a sa place -- et totalement illisible.

  **Le piege est qu il ne se voit pas en developpement** : Windows et macOS ont
  des polices. Constate le 26/08/2026, en production, sur trois publicites deja
  facturees. `nixpacks.toml` installe DejaVu et Liberation ; `policeDisponible()`
  refuse de composer quand il n y en a aucune, et le credit est rendu.

- **Le titre d une annonce n est pas une accroche publicitaire.** Le composeur
  tamponnait `aiTitle` sur la photo : trois publicites demandees donnaient trois
  fois la meme image, sans force de vente. `adCopywriter.ts` fait ecrire
  l accroche, avec un **angle impose et different a chaque demande** (probleme,
  benefice, preuve, urgence, identite, comparaison) -- demander de la variete
  sans dire de quoi elle est faite donne trois formulations du meme argument.
  Ce que le vendeur dicte lui-meme n est jamais ecrase.

- **Pas de bouton qui recredite tout seul : un ticket.** Un remboursement
  automatique se presse par reflexe et n apprend rien -- ni ce qui rate, ni sur
  quoi, ni a quelle frequence. Le vendeur signale depuis l objet concerne (une
  pub, un import), Camille repond dans la foulee et oriente vers Marc (SAV) ou
  Beatrice (comptable), qui seuls accordent l avoir.

  **La borne de l avoir est dans le code, pas dans la consigne au modele** : une
  consigne est une suggestion et elle cede quand le vendeur insiste. Un agent ne
  peut jamais rendre plus que ce que l objet a reellement coute, ni rendre deux
  fois. Credits annonce et credits image ne se melangent pas. Banc
  `npx tsx check-tickets.ts` (compte jetable cree et detruit dans le banc).

- **Le raccordement social passe par une passerelle, jamais en direct.** Sept
  regies publicitaires reconstruites a la main, c est plusieurs mois -- et nous
  avons passe une soiree sur Shopify, la plus simple des sept. Le moteur tiers
  (Zernio) est donc un adaptateur derriere `socialGateway.ts`, comme les
  connecteurs fournisseurs.

  **Deux choses restent chez nous quoi qu il arrive** : la correspondance
  vendeur ↔ profil ↔ comptes en base -- changer de moteur revient a reecrire un
  adaptateur, pas a redemander a mille vendeurs de reconnecter leurs comptes --
  et l isolation. **Le moteur valide les comptes contre toute l equipe, pas
  contre le profil** : publier sur le compte d un autre client passerait de son
  cote. Le refus est dans `verifierAppartenance()`, et le banc le prouve.

  Idempotence par `x-request-id` : sans lui, un double clic publie deux fois sur
  le compte du client. Banc `npx tsx check-social.ts` (faux moteur local).
  **Jamais confronte au vrai service** : pas de cle, et le droit de marque
  blanche multi-clients n est pas confirme -- a obtenir par ecrit avant de batir
  un produit commercial dessus.

- **Un alias de catégorie mal posé contamine tout, et ne se corrigeait jamais.**
  Relevé le 31/08/2026 : la clé `la-categorie-maison` — du texte de gabarit
  ramassé sur AliExpress — pointait vers « Figurines et jouets d'action » avec
  **31 usages**. Une seule décision, prise sur un produit qui était bien une
  figurine, avait rangé quinze produits sans rapport : souris, mini-PC,
  perceuses, un aspirateur. Le référentiel n'y était pour rien.

  Trois corrections, et la première est la plus importante : **le titre est
  désormais le premier signal**, pas le dernier. Un lexique déterministe
  (`categoryLexicon.ts`) range **152 annonces sur 154 sans appeler le modèle**.
  C'est ce que font Vinted, Leboncoin et eBay quand ils proposent une catégorie
  dès la frappe. Ensuite : une source sans valeur (« Accueil », « Divers »,
  « Tous les produits ») ne devient jamais une clé ; et titre et mémoire sont
  confrontés — s'ils se contredisent le titre gagne et l'alias fautif est
  effacé, **sauf celui que le vendeur a posé lui-même**.

  **Le genre est un attribut, pas une catégorie.** Le référentiel sépare les
  vêtements et les chaussures par genre parce que la taxonomie Google le fait ;
  il ne sépare ni bijoux, ni montres, ni parfums, parce qu'elle ne le fait pas
  — y ajouter un niveau casserait le pivot. Vinted et Leboncoin le demandent :
  il vit donc dans les caractéristiques. Bancs `check-lexique.ts`,
  `purger-alias.ts --sec`, bouton « Reprendre » sur la page Catégories.

- **Zernio facture 6 $/mois et par compte raccordé.** Le prix à l'acte n'est
  pas le problème : ce coût fixe court sur les vendeurs dormants. Trois comptes
  et trente annonces font 38 $/vendeur/mois, dont la moitié due qu'il publie ou
  non. L'API Graph de Meta ne facture **rien** à l'appel : notre coût par
  publicité redevient l'accroche et l'image, ~0,055 €.

  `socialMeta.ts` implémente `SocialProvider` comme l'adaptateur Zernio ;
  `SOCIAL_PROVIDER=meta` bascule sans qu'aucun vendeur ne reconnecte quoi que
  ce soit — c'est ce pour quoi la passerelle avait été faite. **Organique
  seulement** : le vendeur paie ses campagnes chez Meta, donc aucune permission
  publicitaire n'est demandée, ce qui allège l'examen.

  Piège à connaître : **Instagram n'est publiable que depuis un compte Business
  ou Créateur relié à une page**, et il exige une image — le refus est posé
  avant l'appel. Et le jeton vit chez nous : `comptesDe` choisit ses colonnes
  explicitement, sinon un `findMany` l'enverrait au navigateur. Banc
  `check-meta.ts`. **Jamais confronté au vrai Meta** : il manque l'app, la
  vérification d'entreprise et l'App Review.

- **Une erreur expliquée dans `errors` au pluriel n'était jamais lue.** Le
  client ne regardait que `error` au singulier : « générer ad » affichait
  « Erreur 502 » alors que le serveur disait précisément quoi. `GET
  /settings/diagnostic` rend désormais l'état réel des services — le journal de
  l'hébergeur n'est pas un endroit où l'on envoie un vendeur.

- **Tout se contrôle en une commande**, et c'est celle-là qu'il faut lancer :

  ```bash
  cd backend && npm run controle          # les 41 bancs locaux
  cd backend && npm run controle -- --tout # + le parcours en production
  ```

  Les bancs sont **découverts dans le dossier**, jamais listés à la main : un
  banc neuf couvre la panne la plus fraîche, et c'est précisément celui qu'une
  liste écrite oublie. Rien ne s'arrête au premier échec — un banc qui tombe
  cacherait tous les suivants.

  Piège rencontré en l'écrivant : **`spawnSync` ne sait pas lancer `npx` sous
  Windows** (c'est un `.cmd`), et les trente-trois bancs sont sortis « aucune
  sortie » alors que tous passaient. Un lanceur qui se trompe sur tout est pire
  qu'un lanceur absent. On lance `process.execPath` avec `--import tsx`.

- **Le circuit complet se rejoue en une commande**, sur un compte jetable créé
  et détruit par le banc — le catalogue du vendeur n'est jamais touché :

  ```bash
  cd backend && npx tsx check-parcours.ts --complet --lots 15
  ```

  Capture façon extension (charge AliExpress réelle : six combinaisons, prix et
  photo par combinaison), contrôle de l'annonce produite, note, import par
  adresse, refus explicite, trois images **différentes**, une publicité, import
  en lot. Il a trouvé deux vraies pannes dès son premier lancement. Ce qu'il ne
  couvre pas : le relevé de la page par l'extension, qui vit dans le navigateur.

  Deux pièges appris en l'écrivant. **Railway redémarre l'API à chaque envoi de
  code**, y compris pour un changement qui ne touche que le site : son proxy
  répond alors 502 et le banc rapportait des pannes imaginaires (il patiente et
  refait une fois). Et **une attente qu'un ensemble vide contente ne vérifie
  rien** : « les trois images sont différentes » passait avec zéro image, sous
  une ligne qui venait de rater.

- **Le popup de l'extension a son propre banc**, parce qu'il vit derrière une
  adresse `chrome-extension://` inaccessible à tout outil :

  ```bash
  cd backend && node check-popup.cjs
  ```

  Il monte le popup avec un faux `chrome` et vérifie ce que le vendeur **voit** :
  œil du mot de passe, lien d'oubli, mention du site, encadré du bouton dans les
  trois situations. `extension/check.cjs` ne voyait que le fichier ; d'où trois
  allers-retours sur le même écran. Éprouvé contre la version précédente :
  7 manques. Piège : les scripts injectés dans `<body>` font partie de son
  `textContent`, donc une phrase écrite dans un **commentaire** validait une
  attente — ils vont dans `<head>`, et seul `#app` est lu.

- **Le tri des photos jetait son propre classement — et le sélecteur de
  l'extension le refaisait.** Corrigé côté mesure, la même faute vivait quarante
  lignes plus loin dans `choosePhotos` : un `sort` par surface sur des candidats
  déjà classés. Le vendeur voyait donc « à côté des vraies photos » malgré la
  correction. **Et la présélection cochait le format le plus représenté** : sur
  une fiche entourée de vingt produits recommandés, les plus nombreux à un même
  format sont les recommandations. Elle prend maintenant les mieux classées,
  c'est-à-dire d'abord ce que la page déclare elle-même.

  Corollaire : **un nombre partagé entre l'application et l'extension doit être
  écrit des deux côtés avec mention de l'autre.** Le plafond de photos est passé
  à 15 partout sauf dans `capture.js`, où 10 restait écrit en dur à trois
  endroits — le vendeur lisait 15 et n'en cochait que 10.

- **Le tri des photos jetait son propre classement.** Les images mesurées
  étaient retriées par surface décroissante, ce qui effaçait le chemin produit
  et l'adaptateur fournisseur : une bannière de 1600×900 passait devant une
  photo de 800×800. La surface ne départage plus que des candidats de même
  rang. Deux causes au « dix photos au lieu de cent » : le budget de mesure
  était atteint avant la fin, et les images sous 400 px disparaissaient sans
  retour au lieu de rejoindre la bande dépliable.

- **Un panneau injecté dans la page ne survit pas à un dépôt.** Leboncoin en
  fait quatre écrans. Le panneau latéral de Chrome vit à côté de l'onglet et
  survit à la navigation. `sidePanel.open()` doit partir du geste de
  l'utilisateur : le clic envoie son message **sans `await`**, un aller-retour
  intercalé sortirait de la fenêtre autorisée. Et le panneau n'est pas un
  onglet — `sender.tab` y vaut `undefined`, d'où `dsp-fill-tab` qui reçoit
  l'identifiant.

- **Stripe : « Managed Payments » est activé par défaut** sur le compte, et exige
  un `tax_code` sur chaque `product_data`. Sans lui, toute session Checkout est
  refusée — donc tout paiement. Code retenu : `txcd_10103001` (SaaS usage pro).
- **Un `type="number"` contrôlé par `Number()` casse à la virgule** du pavé
  numérique français. D'où le composant `PriceInput`.

---

## État des intégrations

**Fonctionne et vérifié en production** : comptes, mot de passe oublié,
vérification d'email, import, IA (titre, description, 9 attributs, 6 arguments,
20 mots-clés), filigrane, calcul de marge, API catalogue, extension.

**Deux destinations publient réellement** : « Mon site » (immédiat, via
`/api/public/shops/:shopKey/products`) et **Shopify** (API Admin GraphQL, app
personnalisée créée par le marchand, jeton `shpat_` saisi dans Réglages). Toutes
les autres marketplaces créent une publication « en attente ».

- Shopify : `backend/src/services/shopify.ts`, version d'API épinglée par
  `SHOPIFY_API_VERSION` (défaut 2025-10). `productCreate` puis
  `productVariantsBulkUpdate` (les variantes ne passent plus par productCreate
  depuis 2024-04), puis `publishablePublish` en meilleur effort.
- Shopify télécharge les photos lui-même : les chemins `/storage/...` doivent être
  absolus, d'où `PUBLIC_API_URL` et `backend/src/lib/urls.ts`.
- **Une clé de catalogue par site, pas par compte.** Un vendeur branche plusieurs
  boutiques (mode, high-tech) ; chacune a sa `Shop.shopKey` et ne reçoit que les
  annonces rangées dedans. Le site de destination se choisit **au moment de
  diffuser** (`ShopPicker`), pas dans un réglage. La migration a conservé les clés
  existantes (`Shop.shopKey = User.shopKey`) : les boutiques déjà branchées lisent
  toujours la même adresse. `User.shopKey` n'est plus la source de vérité, il ne
  sert que de boutique par défaut affichée dans le guide.
  **Avoir un site est facultatif** : beaucoup de vendeurs ne font que des
  marketplaces. Un compte neuf n'a aucune boutique, le dernier site est
  supprimable, et la boutique naît toute seule à la première publication sur
  « Mon site » (`resolveShopId`).

- `PlatformInfo.integration` (`live` | `api-ready` | `extension` | `none`) est la
  source unique côté UI : le guide, les réglages et la publication en lot en
  dépendent au lieu de coder les plateformes en dur.

- **Automatisable en self-service** : eBay (Sell API), Google Shopping (Merchant
  Center gratuit), Wish
- **Compte vendeur validé requis** : Amazon, Cdiscount, TikTok Shop, et les
  opérateurs Mirakl (La Redoute, Leclerc, BHV, Kiabi, BrandAlley)
- **Pas d'API, extension uniquement** : Vinted, Leboncoin, Facebook Marketplace
- **Etsy** interdit la revente de produits manufacturés — risque de fermeture
- **Atlas For Men a été retiré de la liste** le 26/08/2026 : détaillant en marque
  propre, pas de marketplace, donc une ligne qui ne servait qu'à dire non. La
  valeur `ATLAS_FOR_MEN` reste dans l'enum Prisma — Postgres ne sait pas retirer
  une valeur d'enum sans reconstruire le type. La page SEO
  `/vendre-sur-atlas-for-men/` reste en ligne : elle répond à une vraie recherche
  et renvoie vers les alternatives.

## Ce qui reste en chantier

1. ~~**Photos depuis Temu**~~ **réglé.** `content/image-scan.js` ratisse tout le
   DOM (data-*, fonds CSS, ::before, picture, poster, shadow DOM ouvert, iframes
   de même origine, JSON-LD et objets d'état lus dans le texte des `<script>`,
   MutationObserver). Page de contrôle : 6 images par la lecture naïve de
   `img.src`, 22 par le scan. **Constaté en production le 18/08/2026 : 1 image
   avant, 27 après, sur une vraie fiche produit.** Le sélecteur manuel reste, il
   sert à écarter les vignettes de recommandation.
2. **Shopify** : code écrit et compilé, jamais exécuté contre une vraie boutique.
   À confirmer en production avec un jeton réel.
3. **`RESEND_API_KEY`** : sans elle aucun email ne part réellement.
4. Une **veille de disponibilité** des produits sources a été proposée.
6. **Publication de l extension au Chrome Web Store** : paquet et fiche prêts
   (`docs/chrome-web-store.md`, `node extension/build-store-zip.cjs`). Restent le
   compte développeur à 5 $, les captures d écran et l envoi. Tant que ce n est
   pas fait, aucune mise à jour automatique : le Mode développeur ne se met
   jamais à jour tout seul.
5. **Compteur de la fenêtre « Diffuser »** : signalé bloqué à 0. Non reproduit en
   lisant le code ; la fenêtre a été déplacée dans un portail `document.body` avec
   `type="button"` explicite (une barre collante ou un ancêtre transformé pouvait
   intercepter les clics). À reconfirmer sur www.drop-shipper.fr.

---

## Conventions

- Interface et messages d'erreur **en français**, commentaires de code en anglais.
- Vérifier avant d'affirmer : lancer le build, tester l'endpoint, regarder la page.
- Ne jamais annoncer qu'une chose fonctionne sans l'avoir constatée.
- Les secrets vont dans `backend/.env` (exclu de git), jamais dans le dépôt ni
  dans la conversation.

## Commandes

```bash
cd backend && npm run dev      # API sur :4000
cd frontend && npm run dev     # site sur :5173
cd frontend && npm run build   # build de production, plus strict que le dev
cd backend && npx tsc --noEmit # vérification des types
```
