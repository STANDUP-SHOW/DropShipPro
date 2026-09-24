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
| API | https://dropshippro-production.up.railway.app (migration vers `api.drop-shipper.fr` : voir `docs/migration-domaine-api.md`) |
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
backend/storefront-boutique/  La vitrine generique, servie a /b/<adresse> — sous backend/ parce que Railway y a sa racine.
                    Refondue le 05/09/2026 sur le modele d oguss.fr : 5 modes visiteur [data-theme] — « Boutique »
                    (les 16 jetons du theme marchand en variables --m-*, mode par defaut) puis noir/clair/gradient/
                    colorful —, panier localStorage par boutique, commande vers POST /api/public/shops/:shopKey/orders
                    (prix relus serveur, Order.quantity). Banc node check-vitrine.cjs (faux fetch, attentes de
                    visiteur, contrat de commande ecrit en dur). La bibliotheque fait 50 themes (build-themes.cjs,
                    tableau THEMES apparie a la main) ; deux bornes tenues par check-themes.ts : 40 familles de
                    polices maxi (elles seront auto-hebergees — RGPD) et 8 paires de contraste WCAG par palette.
                    Jamais de typo hors Google Fonts (appariements 20 et 39 : Satoshi, Clash Display, General Sans).
                    Les textes de vitrine s editent champ par champ dans VitrineBlock ; PATCH /settings/shops/:id
                    REMPLACE le JSON storefront en entier — toujours renvoyer l objet complet fusionne.
                    Deux logos de vitrine (Shop.vitrineLogoEntete = barre de titre, vitrineLogoAccueil = accueil ~500 px
                    au-dessus du titre), SEPARES du logo de filigrane : saveVitrineLogo garde le SVG tel quel et ne
                    detoure pas (le filigrane fait l inverse). Un SVG portant du script est refuse au televersement
                    (adresse /storage ouvrable en direct). Bancs check-logos-vitrine.ts + check-vitrine.cjs.
docs/        Documentation de l'API catalogue
docs/youtube/  Kit YouTube + Facebook (bannière, couverture, photo, filigrane, gabarit de miniature) : HTML
             dessinés aux dimensions exactes, rendus en PNG par `node docs/youtube/rendre.cjs` (Chrome
             headless). Le nuage de pastilles (nuage.js) ne montre que suppliers.ts et platforms.ts.
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
- **Un handler `async` qui leve, sous Express 4, fait PENDRE la requete — pas
  d erreur, pas de 500, rien.** Express 4 (pas la 5) n attrape pas ce qu un
  `async` leve de lui-meme : la reponse n arrive jamais, le client patiente
  jusqu au timeout. Panne du 05/09/2026 : apres le wipe du 01/09, le compte de
  Max a ete recree avec un nouvel id, mais son navigateur gardait un jeton
  signe pointant l ancien. Signature bonne -> `jwt.verify` passe -> `req.userId`
  = id fantome -> le premier `findUniqueOrThrow({ id: req.userId })` de la route
  leve `NotFoundError`. Chaque chargement de sa page empilait une requete
  pendante, jusqu a saturer l instance : **le service tombait quelques minutes
  apres chaque demarrage, sans une ligne de journal**, et Railway cesse de
  relancer apres une serie d echecs. Les `.catch` des tournees et l AUTO-MODE
  n y etaient pour rien -- desarme a tort par precaution avant de trouver.
  Trois protections, du plus cible au plus general : **`requireAuth` refuse au
  portique un jeton valide dont le compte a disparu** (un `findUnique` par cle
  primaire -> 401 « reconnectez-vous »), ce qui couvre d un coup les seize
  routes qui font confiance a `req.userId` ; un **gestionnaire d erreurs Express
  a quatre arguments** en fin d `index.ts` ; et un filet **process** dans
  `index.ts` (`unhandledRejection` journalise et survit, `uncaughtException`
  journalise et sort proprement pour que Railway relance). Le premier reflexe
  quand l API pend sans rien journaliser : chercher un `async` qui leve, pas la
  base ni les tournees. La cause se reproduit hors navigateur en rejouant le
  jeton exact du localStorage avec `curl` -- 20 s pendues avant le correctif.
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

- **Un agent sans outils est un chatbot, et le vendeur le voit tout de suite.**
  Constaté le 04/09/2026 : « je lui demande 5 produits phares sur AliExpress,
  il me répond qu'il n'a pas accès ni aux fournisseurs ni aux marketplaces ».
  Les chefs de rayon ont désormais trois outils (`chefOutils.ts`, banc
  `check-chef-outils.ts`) : recherche chez les fournisseurs **reliés** (CJ par
  mots-clés, meilleures ventes AliExpress), sondage des prix réellement
  pratiqués dans le catalogue, opportunités déposées par les enquêtes. Rien
  n'est inventé : chaque chiffre a une source, un fournisseur non relié rend
  le geste (Sourcing › Fournisseurs), un refus fournisseur est transmis tel
  quel. Boucle d'outils bornée à trois tours, Sonnet dès qu'un outil est là.

- **Le retour de Stripe atterrit là où `return_url` pointe — et cette page
  doit confirmer.** Le paiement d'un chef de rayon renvoyait vers
  `/rayon/:id?session_id=…` où personne ne lisait `session_id` : l'argent
  était encaissé et l'abonnement jamais prolongé. Toute nouvelle formule qui
  choisit son `return_url` doit embarquer la confirmation sur la page cible.
  Et l'abonnement doit être **vérifié là où il donne accès** : le chat des
  rayons contrôlait crédits et plafond mais jamais `paidUntil`.

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

- **Un import lance QUATRE appels IA, pas un — c est la que part la marge.**
  Constate le 06/09/2026 : Max a depense 23 EUR de tokens pour ~200 annonces, soit
  ~11 centimes l annonce rien qu en texte, alors qu il vend 500 annonces 50 EUR
  (10 c) et 1250 a 100 EUR (8 c) : **il perdait de l argent a chaque vente**. Le
  compte reel par import (`services/productImport.ts`), et non estime :
  **reecriture** (Sonnet 5, ~4 c, sortie enorme), **agent de controle des photos**
  (Sonnet 5 + vision, jusqu a 15 images, ~2 c), extraction variantes (Haiku, ~0,3 c),
  categorie (Haiku, mise en cache, ~0,3 c). La reecriture ne fait AUCUNE recherche
  web (elle n existe que dans l analyse de marche AUTO-MODE). Deux corrections du
  06/09, choisies par Max : l agent de controle passe **OFF par defaut**
  (`User.controlAgent @default(false)`, comptes existants bascules par migration ;
  l AUTO-SHIPPER le **force** cote code car personne ne regarde) -- il repassait
  Sonnet 5 en vision sur des photos deja choisies a la main ; et la sortie de
  reecriture est **allegee** (12 mots-cles au lieu de 25, 8 attributs au lieu de 15,
  5 arguments au lieu de 7) dans le `SYSTEM_PROMPT` d `aiEnhancer.ts`. Cible
  ~3-4 c/annonce. Leviers restants non faits, du plus payant : **API Batch
  d Anthropic (-50 % sur tout**, l import n a pas besoin d etre instantane) et
  **Haiku au lieu de Sonnet pour la reecriture** (moitie prix, arbitrage qualite a
  tester). Regle generale : chaque appel IA sur le chemin d import se compte, et un
  appel vision sur chaque item est un cout qu on n annonce pas au vendeur.

- **L API Batch d Anthropic reecrit les LOTS a moitie prix (06/09/2026).** Un
  import a l unite reste synchrone (l attente n y serait pas acceptable) ; un
  import en LOT differe la reecriture : l annonce nait avec le texte source
  (`Product.rewritePending`), depose un `RewriteJob`, et `tourneeReecritures`
  (services/rewriteBatch.ts, toutes les 2 min) regroupe toutes les entrees en
  attente dans UN batch Anthropic, puis applique les resultats -- ou rend le
  credit et garde le texte source en cas d echec, comme le chemin synchrone.
  `construireRequete`/`interpreter` sont EXTRAITS d aiEnhancer et partages entre
  le direct et le batch : le lot reecrit mot pour mot comme l unite, sinon les
  deux divergeraient. Le flag `differer:true` est pose par extension/lot.js.
  **Piege evite (leçon AUTO-MODE) : la tournee prend un 3e parametre de perimetre
  (userId) que la prod ne passe JAMAIS et le banc TOUJOURS** -- sans lui, un banc
  soumettrait et ecraserait les vraies reecritures en attente. Banc
  `npx tsx check-rewrite-batch.ts` (faux serveur de batch, contrat ecrit en dur :
  create -> id, retrieve -> ended, results -> une ligne par requete).

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

- **Une publicité portait NOS couleurs, pas celles du vendeur (19/09/2026).** Max :
  « l'agent IA utilisé pour la création des publicités doit être augmenté même si
  plus cher, je souhaite vraiment quelque chose de très créatif […] elle extrait
  code couleur gamme idem création de site DropShop ». Le dégradé du bouton
  (`#a855f7` → `#ec4899`), le voile (`#0b0a14`), la police et la mise en page
  étaient **écrits en dur** dans `adComposer` : toutes les publicités de tous les
  vendeurs sortaient du même violet. Un vendeur qui signe d'un logo vert recevait
  un bouton violet — pas un défaut de goût, une publicité qui ne ressemble pas à
  sa marque, donc une publicité qu'il jette.

  `logoCouleurs.ts` savait déjà faire pour DropShop : `adCharte.ts` ne recalcule
  donc rien, il **traduit une gamme de boutique en charte de visuel** (palette,
  plus une mise en page et une typographie parmi quatre de chaque, qui tournent
  avec le rang du visuel). `adCopywriter` passe de Haiku à **Opus 5** et ne se
  contente plus d'écrire : il reçoit les couleurs du logo et rend l'accroche
  **avec** la palette, la mise en page et la typographie. `photoBriefer` passe à
  Opus aussi (demandé pour « le graphiste qui refait les photos ») et reçoit les
  tons de la marque **en mots** — un hexadécimal finirait par repeindre le
  produit, qui doit rester celui du colis. Les tons ne touchent que le décor.

  Trois règles qui ne se négocient pas, et chacune vient d'un essai raté :
  **le contraste est vérifié chez nous** (`normaliserPalette`), parce qu'un
  modèle écrit un titre illisible avec beaucoup de goût ; **le texte du bouton se
  mesure, il ne se devine pas** — la première version décidait à la clarté, et un
  vert moyen recevait du blanc à 2,2 : 1, sur la seule partie de l'image qui
  demande un geste ; et **tout reste déterministe sans réseau** — sans clé, une
  pub garde les couleurs du logo et quatre pubs d'affilée ont quatre mises en
  page.

  Banc `npx tsx check-pub-charte.ts`, et c'est lui qui compte : il **compte les
  pixels** de deux publicités issues de deux logos opposés, au lieu de relire la
  charte. Une charte juste qu'un composeur ignore, c'est exactement la panne
  qu'on corrige — et c'est la leçon de `check-recommandations.cjs`, qui passait
  pendant que la réalité échouait.

  Écran : le logo qui signera est montré AVANT de payer et se retire d'un clic
  (`avecLogo`), les couleurs relevées sont affichées en pastilles, les quatre
  gammes se choisissent, « laisser l'IA libre » par défaut. Route gratuite
  `GET /visuals/charte`.

- **Le modèle d'image se choisit en cascade, jamais par un nom (19/09/2026).**
  Le rendu passe de Flash Lite (0,0336 $) à **Pro (0,134 $)** — une image se vend
  18 drops et c'est elle que l'acheteur regarde, donc c'est le meilleur endroit
  où mettre l'argent. Mais le nom vient de chez Google : impossible de l'éprouver
  avant de déployer, et un modèle retiré rend un **404** — celui du 02/09/2026
  avait tout arrêté d'un coup. `imageGen.ts` essaie donc
  `gemini-3.1-pro-image` → `flash-image` → `flash-lite-image`, retient celui qui
  répond (sinon chaque image repaierait les 404), et `GOOGLE_IMAGE_MODEL` passe
  devant. Le diagnostic sonde la cascade entière, pas un nom : un banc qui teste
  autre chose que le vrai chemin ne teste rien.

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

- **L'AUTO-MODE des chefs de rayon écrit une fois, montre deux fois.** Toutes
  les douze heures, un rayon en poste à interrupteur levé produit une analyse
  de marché (`Report` section MARKET, summary `{auto:'analyse-12h', rayon,
  redacteur}`) et dix produits gagnants (`Opportunity` raw `{gagnant12h}`).
  La rubrique « Mes analyses » du rayon, la page Analyses de marché et la page
  Produits gagnants **lisent ces mêmes lignes** — pas de table dédiée. La marge
  n'est jamais stockée : elle se déduit des deux prix. La garde des onze heures
  (rapport récent) fait qu'un redéploiement Railway ne double aucun passage.
  **La borne de validité vit dans `passageAutoMode`, pas dans le générateur** :
  le banc l'a prouvé dès son premier passage — un gagnant sans lien ou à marge
  négative passait quand le générateur était remplacé. Les interrupteurs :
  `Department.autoMode` (rayons) et `AgentAutoSetting` (agents admin, tous —
  chaîne comprise). Banc `npx tsx check-automode.ts` (faux générateur, vraie
  base, compte jetable).

  **Coût réel : ~0,13 € le passage** (6 recherches web + ~4 000 tokens Sonnet),
  soit **~8 €/mois par rayon** à plein régime — pas « quelques centimes ».
  C'est le poste dominant du salaire du chef : conseillé de passer le salaire
  à 20 €/mois, l'AUTO-MODE étant l'argument de la hausse.

  Deux pannes vues au premier passage réel (04/09/2026), corrigées :
  **la recherche web peut répondre « limite serveur dépassée » sur toutes les
  tentatives** — le modèle rédige alors une analyse entière marquée « à
  vérifier », sans une seule source, et elle était consignée telle quelle.
  Un passage sans recherche aboutie **échoue** désormais (rien de consigné,
  la garde ne bloque pas, le prochain réveil refait), et la tournée espace
  les rayons de 20 s — c'est la rafale qui déclenche la limite. Et **avec la
  recherche web en `tool_choice: auto`, le modèle peut finir en prose sans
  jamais appeler l'outil de livraison** : la liste des gagnants sortait vide
  en silence ; un secours rejoue la livraison sans recherche, outil imposé,
  liens du texte sourcé uniquement.

  **Une tournée lancée par un banc se borne toujours à ses comptes jetables.**
  Constaté le 05/09/2026 : `tourneeAutoMode(fauxGenerateur, 0)` dans
  check-automode balaye TOUS les rayons éligibles de la base — les trois
  rayons réels passés en AUTO-MODE le matin ont reçu chacun une fausse
  analyse (« Les écouteurs Bluetooth dominent le rayon… »), consignée dans le
  compte du vendeur et armant la garde des onze heures contre la vraie
  tournée. check-autoshipper portait la même faute et n'y a échappé que parce
  que le pilote réel était dans sa fenêtre — hors fenêtre, cinq vrais crédits
  débités. Les deux tournées prennent un 3ᵉ paramètre de périmètre (userId ou
  liste) : la production ne le passe jamais, un banc le passe toujours. Le
  nettoyage s'est fait **par signature** (corps du faux générateur, liens
  `exemple.test`), jamais par date.

- **L'AUTO-SHIPPER est une tournée, et sa tranche a un prix fixe.** La page
  « Pilote auto » est devenue l'agent AUTO-SHIPPER AI (fiche de recadrage du
  06/09/2026). Le moteur d'import/publication existait mais n'était jamais
  planifié : `tourneeAutopilot()` (services/autopilot.ts) vise désormais un
  passage par tranche de 12 h et par pilote activé, garde en base
  (`Autopilot.lastAutoRunAt`) donc insensible aux redéploiements. **La tranche
  coûte 5 crédits payés d'avance et couvre l'orchestration seulement** —
  chaque import continue de consommer son crédit d'annonce : cinq crédits ne
  couvriront jamais cinquante réécritures. Piège attrapé par le banc :
  **`reserveCredits(userId, 5)` débite PARTIELLEMENT** (fait pour les lots) —
  avec 2 crédits il prend 2 et dit ok ; un prix fixe doit vérifier
  `allowed === demandé` et rendre le partiel. En panne de passage, la tranche
  est rendue mais la marque reste : pas de rejeu en boucle. Plafond de version :
  50 annonces/jour (clamp zod côté serveur). Banc `npx tsx check-autoshipper.ts`.
  L'animation de la page est un SVG d'attente : à remplacer par l'animation
  JSON tirée des 4 MP4 choisis par Max (chemins à recevoir).

  **Le modèle du 17/09/2026 : « l'IA fait tout pour toi ».** La tranche de
  5 drops par 12 h est morte deux fois : gratuite le 07/09, puis remplacée par
  **la journée AUTO-SHIPPER à 100 drops (1 €), une tournée par 24 h**
  (`DROPS.autoShipperJour`, garde à 23 h, débit à la tournée, rendue si rien
  n'a été importé ni publié, prix fixe vérifié `allowed === prix`), plus
  **18 drops par produit importé et publié** (`autoShipperImport` = agent
  extension 6 + annonce 12). Un pilote sans drops est sauté SANS être marqué.
  Plafond : 50 produits/jour conseillés, **480 autorisés** (24 catégories ×
  20 produits des rapports) pour qui peut se l'offrir. **L'AUTO-MODE des chefs
  de rayon devient gratuit** (`autoModePassage` = 0) : les analyses et gagnants
  viennent des 48 agents locaux de `MARKET-ANALYSES/` (24 catégories × 7
  thèmes, contrat des rapports dans son README — la liste des 20 produits est
  un tableau à colonnes fixes, sinon rien ne s'importe). Reste payant : l'analyse
  produit par produit des annonces du vendeur et le rapport produit à la
  demande. Bancs `check-autoshipper.ts` et `check-automode.ts` adaptés.

- **DropShop IA (17/09/2026) : la boutique est ÉCRITE par le modèle, pas
  choisie dans un catalogue.** Après de très mauvais retours sur la vitrine à
  thèmes, Max a voulu « un Lovable-like ». Le partage qui rend ça possible à
  2 € : le modèle n'écrit que ce qui est unique (la page HTML entière — design,
  CSS, écrans) et **jamais la logique de commerce**, qui vit dans
  `backend/dropshop/sdk.js` (catalogue vivant, routage, panier, commande,
  paiement, confirmation). La page décrit des écrans (`DropShop.pages({...})`)
  et des gestes par attributs (`data-ajouter`, `<form data-commande>`…) que le
  moteur branche lui-même. Le panier ne peut donc pas « ne plus marcher ».
  Contrat lu par le modèle : `dropshop/contrat.md` ; squelette de référence
  volontairement neutre : `dropshop/exemple.html`.

  **Puis la page est testée comme un visiteur** (`dropshop/verifier.cjs`,
  jsdom + vrai moteur + faux serveur) : accueil, catégorie, fiche, ajout au
  panier, commande envoyée avec le bon corps, merci. Chaque manque est écrit
  pour être lu par le modèle, qui répare par éditions « chercher / remplacer »
  (tout ou rien, extrait unique) — deux fois au plus, sinon échec et drops
  rendus. Sonnet 5 écrit (`AI_MODEL_SITE`), Haiku 4.5 modifie et répare
  (`AI_MODEL_SITE_MODIF`). **Le vérificateur tourne dans un processus enfant à
  l'environnement VIDE, tué à 30 s** : jsdom n'est pas un bac à sable et la
  page vient d'un texte tapé par un vendeur ; une `while (true)` bloque le fil
  de l'enfant, seul le parent peut le tuer, et c'est ce que le banc éprouve.
  `jsdom` est passé en dépendance de production pour ça.

  Prix : 350 drops la création, payés une seule fois à vie, sans aucune
  mention DropShipper sur la boutique (200 → 350 le 17/09 au soir ; 10
  modifications comprises), 10 la
  modification ensuite, 0 la restauration d'une version. Travail en 202 + état
  relu dans `Shop.siteJob` (dure des minutes) ; un travail sans fin depuis
  15 min est tenu pour mort et rendu. `/b/<slug>` sert la page IA (moteur
  inséré) dès qu'elle existe, la vitrine à thèmes sinon. **Le paiement va sur
  le compte Stripe DU MARCHAND** (clé collée par lui dans le studio, jamais
  relue) : `/checkout` écrit les commandes puis ouvre la session avec sa clé ;
  au retour, `/checkout/:session` relit Stripe et pose `paidAt` — jamais sur
  la parole du navigateur. Emails acheteur + marchand sous l'enseigne de la
  boutique. Dossier complet : `docs/dropshop.md`. Bancs `check-dropshop.ts`
  et `check-dropshop-jobs.ts`.

  **Second passage le même jour, sur les retours de Max** (« oguss.fr fait
  beaucoup plus pro ») : le logo se dépose AVANT le brief et ses couleurs
  donnent quatre gammes (`logoCouleurs.ts`, contraste vérifié) ; la skill
  `ui-ux-pro-max` est branchée en Node (`designLibrary.ts`, CSV copiés dans
  `dropshop/design/`) et fournit au modèle styles, palettes, polices, patron
  et mouvement choisis par le brief ; la consigne exige matière, profondeur,
  survol, diaporama d'accueil, textes en mouvement ; les modes visiteur sont
  une option vérifiée (`--modes`). **Piège attrapé par le vérificateur :** un
  `.wrap` qui reçoit `width:100%` d'une seconde classe perd ses marges et le
  titre du héros colle au bord de l'écran — c'est ce que Max a vu en premier.

  **Un travail DropShop vit dans le processus : un redéploiement le tue.**
  Constaté le 17/09 : la création d'iagent.agency a démarré pendant un
  redéploiement Railway et est restée « en écriture » un quart d'heure
  pendant que Max regardait l'ancienne vitrine à thèmes en croyant voir la
  production de l'IA. `reprendreTravauxOrphelins()` au démarrage relance tout
  travail sans `fin` (drops déjà pris, pas de redébit) ; l'aperçu du studio
  dit quand il montre l'ancienne vitrine. Règle : **ne pas pousser pendant
  qu'une création tourne** (vérifier `Shop.siteJob` sans `fin`).

  **Les extensions DropShop** (17/09 soir) : catalogue dans
  `services/extensions.ts`, installation payée en base (`ShopExtension`),
  Back Office à `/b/<slug>/admin` avec sa propre session (`scope:
  back-office`, jamais le compte marchand). Paiement en drops et Dropshop
  Cloud spécifiés dans `docs/dropshop.md`, pas codés. Banc
  `check-extensions.ts`.

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
  cd backend && npm run controle          # tous les bancs locaux (62 au 16/09/2026)
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

- **En import de LOT, personne ne relit — et c'est là que Temu se venge.**
  Signalé le 06/09/2026 : un lot de chaussures Temu ressortait avec des photos
  de tondeuses et d'aspirateurs. **À l'unité c'est bon** (le vendeur choisit à
  l'œil) ; **en lot c'est cassé** (aucun filtre humain). `releverPourLot`
  prenait les photos « certifiées » par l'adaptateur, or sur Temu galerie,
  panier et recommandations sortent du **même CDN** : l'adaptateur ne les sépare
  pas, et le filtre par lien (`dspPointeVersUneAutreFiche`) rate les carrousels
  qui ne sont pas de simples `<a href>`. **Piège de méthode, le pire du projet :
  `check-recommandations.cjs` PASSAIT** (il teste le filtre par lien sur une
  page synthétique) **pendant que la réalité échouait** — la page de test ne
  reproduisait pas la vraie structure Temu. Le seul signal robuste, indépendant
  de la structure : **une fiche sert ses photos produit à un seul format** (800×800
  chez Temu, 1000×1000 chez AliExpress), les recommandations à d'autres.
  `galerieDominante()` (capture.js) ne garde donc que le format le plus
  représenté parmi les grandes images, en lot uniquement. Banc
  `node check-galerie-lot.cjs` (jeu de tailles mixtes, garde-fous contre le
  vidage d'une galerie légitime). **À confirmer sur une vraie fiche Temu** :
  un banc synthétique ne prouve pas que le format réel sépare bien les deux.
  Et l'extension ne se met pas à jour toute seule en Mode développeur — le
  vendeur doit la recharger.

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
- **SUPER DELIVERY est un grossiste pour stocker, pas un fournisseur de
  dropshipping — et ses conditions interdisent de republier ses photos.** Sondé
  le 14/09/2026 à la demande de Max (membre depuis, prix à l'unité visibles).
  Grossiste en ligne du Japon (Raccoon Commerce), 1 700 fournisseurs, 740 000
  références, inscription gratuite réservée aux entreprises. Ce que la fiche
  publique donne : titre, description, dix photos (c.superdelivery.com derrière
  un redimensionneur `/ip/n/sa/L/H/…`, original sur
  `www.superdelivery.com/product_image/…`), stock, lot ; **le prix de gros est
  « Members Only »** — d'où `importPath: 'extension'` et l'ajout à
  `EXTENSION_ONLY` / `siteEnJavaScript` (un import par adresse créerait une fiche
  sans prix d'achat). Son centre d'aide international, lu page par page :
  « We do not support drop shipping. Orders can only be shipped to your
  registered company/store address. » ; « we do not provide API integration
  service for product information, including product images » et « We do not
  offer any products' catalogs or price lists » ; « Image reproduction before
  purchase is prohibited » (les photos ne se reprennent qu'après achat, pour
  les produits achetés, si le fournisseur l'autorise) ; 131 pays livrés dont
  la France, aucun minimum, 1 300 ¥ par fournisseur et par commande, droits
  d'import à la charge du membre, pas de retour depuis l'étranger. La seule
  API qui existe est **côté vendeur-sur-SD** (mise à jour de son propre stock,
  entreprises au Japon) ; le téléchargement des fiches (zip infos + images)
  est réservé au plan Standard japonais, et seulement pour des produits déjà
  achetés. La version japonaise autorise l'expédition directe fournisseur par
  fournisseur, mais exige une adresse au Japon. **Pas de connecteur, donc.**
  Adaptateur d'images dans l'extension, référence `/pd_p/<n>/` dans
  `REFERENCES`, banc `check-refs.ts`.

  Corollaire général, réglé le même jour : **un prix relevé en yens ou en
  dollars est ramené en euros à l'import** (`services/devises.ts`, taux BCE via
  api.frankfurter.dev sans clé, cache 12 h, table de repli datée, note écrite
  sur l'annonce). Avant, une fiche CJ importée par l'extension gardait `USD`
  et son prix de vente `USD × 1,5` — impubliable sur une place de marché
  française. L'extension lit désormais `JPY`/`¥`/`円` (les yens n'ont pas de
  décimales : « JPY 1,234 » vaut 1234) et rend la devise du prix retenu. Banc
  `npx tsx check-devises.ts` (faux Frankfurter, contrat écrit en dur).
- **Un prix coupé en deux balises échappe au relevé visuel — lire ce que la
  fiche déclare.** reichelt elektronik (ajouté le 19/09/2026) écrit
  « 100,`<sup>`83`</sup>` € » : l'élément a un enfant, le relevé ne regarde que
  des feuilles, et il retenait « 9,09 € », un accessoire sous la fiche — mesuré
  sur la vraie page avant d'écrire une ligne. `collectPrice` lit désormais les
  microdonnées schema.org (`[itemprop=price]` de la PREMIÈRE portée Product :
  les recommandations en sont aussi) après la balise `product:price`, avant
  toute devinette. Banc `node check-prix-declare.cjs`, sur le HTML réel. Le site
  sert un mur « Security Check » (503 + captcha) à tout ce qui n'est pas un
  navigateur : extension seulement (`EXTENSION_ONLY`). Galerie sous `/xxl_ws/`
  de cdn-reichelt.de, original sous `/bilder/web/xxl_ws/` ; le reste de la page
  est sous `/artikel_ws/`. Détaillant-distributeur : ni dropshipping ni
  expédition neutre annoncés, CGV 8.2 sur les illustrations.

- **L'EAN est une COLONNE (`Product.ean`), plus une caractéristique
  (19/09/2026).** Une réécriture remplace `attributes` en bloc et l'emportait.
  Relevé à l'import : ce que la page DÉCLARE (microdonnées `gtin13`, JSON-LD —
  `collectEan` de l'extension), sinon le texte **derrière une étiquette « EAN /
  GTIN / code-barres » seulement** : une fiche technique est pleine de nombres à
  treize chiffres, et un sur dix passe la clé GS1 par hasard. Clé vérifiée
  partout (`eanValide`), y compris au PATCH de la fiche. `codeBarresDe` lit la
  colonne puis les caractéristiques (les annonces d'avant) ; Mirakl, Kaufland,
  Shopify, le flux catalogue (`ean`) et le flux Google (`g:gtin`, sinon
  `identifier_exists: no`) passent par là.

- **Les avis d'acheteurs : `BuyerReview`, pas `ProductReview`** (déjà pris par
  le verdict d'un chef de rayon) ni `Review` (avis sur l'application). Trois
  entrées, un seul chemin (`services/avisAcheteurs.ts`) : extension à l'import,
  CSV à trois colonnes `stars, User, Avis` (en-têtes FR/EN dans n'importe quel
  ordre, `;` d'Excel, BOM), saisie. `empreinte` rend le réimport idempotent. Une
  note illisible ÉCARTE l'avis, elle ne vaut jamais 5 par défaut. `sourceSite`
  est servi au flux (`reviews.items[].origine`) et le contrat DropShop impose la
  mention « Avis recueilli sur … » : afficher comme sien un avis venu d'ailleurs
  est une pratique commerciale trompeuse. **Le relevé de l'extension a raté deux
  fois sur la vraie page Amazon avant de passer**, et aucun banc synthétique ne
  l'aurait vu : le bloc le plus intérieur à porter une note est le WIDGET
  d'étoiles (4 « avis » = « 4,4 sur 5 étoiles », 13 vrais écartés) ; Amazon
  écrit la note en TEXTE (« 5 étoiles sur 5 »), sans aria-label ni alt ; « deux
  enfants au plus » réduisait un avis de six paragraphes à son plus long. Bancs
  `check-avis.ts` et `check-avis-extension.cjs` (structure réelle recopiée).
  Vérifié sur Amazon seulement : Temu et AliExpress obfusquent leurs classes, le
  relevé par nom de bloc n'y trouvera peut-être rien — le CSV est là pour ça.

- **Une page écrite une fois ne peut pas apprendre un logo déposé après (19/09/2026).**
  Le marchand téléverse le logo d'en-tête de sa boutique DropShop : le fichier
  part, `/theme` le sert, et **rien ne change sur la boutique**. La page a été
  écrite par le modèle le jour de la création, à partir de ce que la boutique
  avait alors ; sans logo ce jour-là, elle n'a tout simplement aucune balise pour
  l'afficher, et aucun refus ne peut plus l'atteindre — elle est déjà écrite. La
  seule réparation était de réécrire la boutique : 350 drops pour un logo.
  `exemple.html`, le squelette de référence qui passe tout le reste, échouait le
  contrôle `--logo` : la preuve en deux secondes.

  D'où le renversement, qui est la règle du moteur depuis le premier jour :
  **ce qui est mécanique appartient au moteur, la page ne décrit que ce qui lui
  est propre.** `poserLogos()` (sdk.js) regarde la page RENDUE et pose ce qui
  manque — l'en-tête, et le grand logo au-dessus du titre de l'accueil — sans
  jamais doubler ce que la page affiche déjà (on compare l'attribut `src`, pas
  `.src`, que le navigateur résout en absolu). Le moteur étant inséré au moment
  de servir (`routes/vitrine.ts`), **toutes les boutiques existantes sont
  réparées sans une seule réécriture.** Le banc `check-dropshop.ts` vérifie les
  deux sens ; il attendait l'inverse (« une page sans logo est refusée »), ce qui
  ne protégeait que la création et jamais le marchand qui dépose son logo après.

- **`imagesWatermarked` vaut `true` par défaut : le quatrième bloc de création
  qui l'oublie (19/09/2026).** La colonne décrit l'existant, marqué dans le
  fichier avant que la marque passe à l'export. Un bloc qui ne pose pas
  `imagesWatermarked: false` crée donc des annonces **réputées déjà marquées** :
  `imagesPourExport` rend leurs photos telles quelles et aucun filigrane n'est
  jamais posé. L'import par adresse, le lot et l'extension sont tombés dedans ;
  `POST /products/manuel` aussi.

  Trois autres trous sur le même chemin, tous invisibles un par un et qui font
  ensemble « le filigrane par boutique ne marche pas » :
  `POST /:id/images` marquait la photo du vendeur **au téléversement, avec les
  réglages du COMPTE** (une annonce moderne en portait donc deux, et jamais celle
  de la boutique) ; la **signature d'export ne couvrait que les réglages**, pas
  la liste des photos, donc une photo ajoutée n'apparaissait nulle part ; et
  `PATCH /shops/:id` ne vidait pas le cache alors que les deux routes du logo le
  faisaient déjà. Enfin, **le rangement dans une boutique n'était fait que pour
  « Mon site »** : désigner sa boutique et publier sur Shopify laissait
  `Product.shopId` nul, donc le filigrane du compte.

- **Un logo ne se règle ni en taille ni en intensité (19/09/2026).** Demandé par
  Max, et c'est juste : un logo affaibli n'est pas discret, il est sale ; et une
  largeur en pourcentage ne dit rien d'un logo HAUT — une enseigne verticale à
  22 % de large mangeait le tiers de la hauteur. `CONTENEUR_LOGO` (watermark.ts)
  est une boîte d'un cinquième de la largeur de la photo, marge de 3 %, où le
  logo entre par `fit: 'inside'` à pleine intensité, dans le coin choisi — en bas
  à droite par défaut. `scale` et `opacity` ne servent plus que le filigrane
  texte, et les deux curseurs disparaissent des deux écrans en mode logo : les
  laisser, c'était proposer deux réglages sans effet. **Le banc le prouve en
  pixels** (deux réglages opposés doivent rendre la même image), et il a été
  éprouvé contre la version fautive.

  Trouvé en passant, même famille : `WatermarkSettings.tsx` n'envoyait pas
  `watermarkMode` — les boutons « Mon logo » / « Un texte » changeaient l'écran
  et n'enregistraient rien.

- **« Nouveauté et usage spécial » n'est pas un rayon, c'est une salle d'attente
  (19/09/2026).** Max : « ne doit pas être un rayon ni traité comme une
  catégorie […] si un utilisateur ne trouve pas sa catégorie ou si l'agent a mal
  transcrit, il se trouve dans nouveauté usage spécial […] le produit ne
  s'affiche nulle part, ça devrait être expliqué ». Cette entrée vient du
  classeur de correspondances, où elle est une catégorie comme une autre ; chez
  nous c'est là qu'atterrit ce que personne n'a su ranger. Elle avait donc un
  chef de rayon, **Ousmane**, ce qui laissait croire qu'il s'y vend quelque
  chose. Le chef est retiré (23 rayons ; la clé répond encore et mène à « Jouets
  et jeux », pour ne pas faire disparaître l'agent de qui l'avait confié), et
  `CATEGORIE_A_RANGER` la nomme en un seul endroit.

  **Et la correction du vendeur n'apprenait rien** — trois défauts sur la même
  route (`PUT /products/:id/category`), invisibles un par un : l'alias était
  gravé sur la catégorie source **telle que le fournisseur l'écrit** (« Gadgets
  Insolites ») quand la lecture demande une clé normalisée
  (« gadgets-insolites »), donc introuvable à jamais ; il portait la source du
  fournisseur, donc la règle qui protège « ce que le vendeur a posé lui-même »
  ne le reconnaissait pas ; et `apprendreCategorie` ne faisait qu'ajouter
  (`skipDuplicates`), donc ne corrigeait **rien** quand un alias fautif existait
  déjà — ce qui est précisément le cas où l'on corrige. `apprendreDuVendeur`
  grave désormais toutes les clés que la lecture essaie, marquées `manuel`, en
  remplaçant. La clé de titre, elle, était écrite et jamais relue : cent fiches
  identiques repayaient cent appels au modèle ; elle est lue en dernier, à part,
  parce qu'un `findFirst` sur une liste de clés rend n'importe laquelle des
  lignes qui correspondent et que la plus vague gagnerait une fois sur deux.
  Bancs `check-salle-attente.ts` (sans base, éprouvé contre un identifiant
  faux et contre la clé non normalisée) et `check-categories.ts` (vraie base :
  l'alias fautif doit être remplacé, et relu par le résolveur).

- **Les rapports des 48 agents se lisent à quatre endroits, pas seulement dans
  Fresh news (19/09/2026).** Fresh news montre un jour d'une catégorie, comme un
  journal ; il manquait la lecture inverse. Chaque rayon a son onglet
  « Analyses de marché », la page du menu porte la même liste tous rayons, et
  Réseaux a deux vues (`?vue=analyses`, `?vue=prompts`). Le raccordement est une
  table écrite à la main, `CATEGORIES_PAR_RAYON` : les chefs de rayon portent
  les clés du référentiel, les agents portent celles d'`agents.json` — deux
  découpages de 24 qui ne se recouvrent pas. Le banc tient ses trois bornes,
  dont celle qui compte : **toute catégorie est lue par au moins un rayon**,
  sinon un rapport écrit chaque matin n'apparaîtrait nulle part et l'écran
  serait vide comme un jour sans dépôt. La liste des produits est **partagée**
  (`ListeProduitsRapport`) entre les trois écrans : recopiée, elle aurait donné
  deux boutons « Importer » qui ne font pas la même chose selon la page.

- **Une application React est invisible pour une IA : d où `llms.txt`.** Signalé
  le 15/09/2026 par Max — « si je demande à une IA ce que fait drop-shipper.fr,
  elle ne le sait pas ». Normal : un assistant qui suit le lien reçoit la
  coquille vide du bundle Vite, et les 29 pages SEO parlent chacune d une place
  de marché, jamais du produit entier. `scripts/build-llms.cjs` écrit donc deux
  fichiers en texte à la racine de `dist/` : **`/llms.txt`** (la carte : ce que
  fait la plateforme, les chiffres, les liens) et **`/llms-full.txt`** (tout le
  détail : les 8 familles de fonctions, la grille tarifaire complète, les 34
  fournisseurs, les 45 destinations, les différences avec AutoDS/DSers/Shopify,
  et une FAQ écrite pour être citée telle quelle). `robots.txt` les annonce.
  Le script tourne dans `npm run build`, après build-seo.

  **Le piège : ces fichiers recopient des données qui vivent ailleurs** — la
  grille de `services/tarifs.ts`, la liste de `services/suppliers.ts` — parce
  que Vercel ne déploie pas `backend/`. Un tarif changé d un seul côté fait
  citer un prix périmé par toutes les IA, ce qui est pire que pas de prix. Les
  deux tables portent le commentaire qui renvoie à l autre. Ce qui est compté
  (canaux par famille) l est depuis `seo-channels.cjs`, jamais écrit à la main.

  **Et `llms.txt` ne suffisait pas (19/09/2026).** Mesuré avec l'agent de
  GPTBot : l'accueil rendait **21 caractères de texte** — aucun robot d'assistant
  n'exécute JavaScript, et ils partent d'un index de PAGES, pas d'un fichier que
  personne ne leur désigne. `scripts/build-geo.cjs` (dernier maillon de
  `npm run build`) pré-rend l'accueil DANS `#root` (React la remplace au
  montage ; masquée hors de `/` par la classe `ecran-app`, sinon elle clignote
  sur les écrans de l'application), pose un graphe schema.org (Organization,
  WebSite, SoftwareApplication aux offres réelles, FAQPage — **jamais
  d'`aggregateRating` inventé**), écrit `/faq/`, `/tarifs/`, `/a-propos/`, nomme
  17 robots d'IA dans `robots.txt` et dépose la clé IndexNow. La FAQ est UNE
  table (`geo-faq.cjs`) lue par trois sorties ; `check-geo.ts` tient ses prix
  égaux à `tarifs.ts`. Après un déploiement qui change des pages :
  `node scripts/indexnow.cjs --envoyer` (il vérifie d'abord que le site sert la
  clé). Ce qu'aucun fichier ne remplace — annuaires, comptes sociaux, pages
  écrites par d'autres — est dans `docs/referencement-ia.md`, textes prêts à
  coller compris.

- **Les rapports des agents vivent dans `backend/rapports.db` (SQLite livrée dans
  le dépôt), PAS dans la table Prisma `MarketReport` (23/09/2026).** Depuis le
  19/09, une autre session a branché Fresh news, Analyses, Gagnants et Prompts
  sur `/api/reports/*` (`routes/reportsPublic.ts`, `services/reportsDb.ts`,
  classe `ReportQuery`, lecture seule) ; la base est remplie par
  `importer-aimarket.cjs` depuis `aiMarket/*.json` (agent MarketSpy) et
  **committée** : un rapport n'est publié que quand la base est commitée et
  déployée. J'ai perdu une heure à déposer 47 rapports Markdown dans
  `MarketReport` que plus rien ne lit — vidée depuis, script retiré. La règle :
  **avant de toucher aux rapports, `grep -rn "reports/" frontend/src/lib/api.ts`
  dit quelle source le site lit.** La table `MarketReport` et
  `POST /api/agent/market-reports` restent en place (contrat des `.md`,
  `lireRapport`), mais la production ne les lit plus. `lireEnTete` tolère
  désormais un en-tête sans `---` fermant (51 fichiers sur 61 l'oubliaient).

  **Les pages publiques `/analyses/…`** (`routes/analysesPubliques.ts`,
  rendu pur dans `services/analysesPubliques.ts`, banc
  `check-analyses-publiques.ts`) lisent `ReportQuery` : index, archive par
  catégorie, une page par rapport rayon (analyse + produits gagnants) et par
  rapport marketing (prompts image/vidéo), `/analyses/sitemap.xml` déclaré
  dans `robots.txt` et lu par `indexnow.cjs`. Réécriture Vercel `/analyses/*`
  → Railway (comme `/b/`). **Ligne publique / privée** : analyse et produits
  (titre, fournisseur, prix de vente conseillé, pourquoi) sont publics ;
  **jamais l'adresse fournisseur ni le prix d'achat** (c'est ce que le compte à
  500 drops achète), ni la marge (MarketSpy l'écrit en euros, l'ancien agent en
  pour-cent, la base ne dit pas lequel). Le corps d'un rapport rayon Markdown
  contient le tableau AVEC les adresses : il n'est jamais rendu tel quel. Piège
  attrapé sur la première page servie : un rapport MarketSpy ne porte pas son
  tableau dans le corps, la page titrait « 20 produits gagnants » et n'en
  montrait aucun — le tableau bridé est ajouté quand le corps ne le porte pas.
  Les lignes aux identifiants fautifs (« téléphonie », « maison decoration »)
  n'ont pas d'adresse. Cache 1 h. Les noms affichés viennent de la base
  (`categorieNom`, `themeNom`), pas d'une relecture d'`agents.json`.

- **Chaque canal de l'annuaire a une VOIE de liaison — plus jamais « 45
  branchés » (23/09/2026).** Max : « que nous manque-t-il pour affirmer que nous
  proposons une liaison avec 314 canaux ? » Réponse trouvée dans le code :
  l'annuaire (`channelDirectory.ts`, engendré depuis le dossier des logos) ne
  portait qu'un nom, un logo et une famille ; « branché » n'avait jamais été
  défini pour un comparateur, une régie ou une place de marché sans API. Les
  314 logos viennent d'un gestionnaire de flux, qui les sert TOUS par un flux
  produit : c'est la voie de la majorité, et nous servons déjà le format
  Google Shopping. `services/liaisonsCanaux.ts` donne à chaque canal une voie
  (`api` branché ou compte-requis, `flux`, `export`, `extension`, `aucune`) et
  un état (`branche`, `compte-requis`, `verifie` = lu dans sa documentation,
  `famille` = voie de sa famille, et l'écran le dit). Résultat : 51 api (45
  branchées, 6 à compte), 234 flux, 2 extension, 27 « pas un canal de vente »
  (outils d'avis, d'analyse, sites fermés — dits tels quels). Banc
  `check-liaisons-canaux.ts` : toute clé est un canal réel (le premier
  `channelFeeds` portait des noms fantômes), chaque `aucune` a sa raison, chaque
  destination LIVE a son canal. Les rapprochements de libellés qui manquaient
  (« Fnac Marketplace » / `fnac`, « Galeria Inno » / deux logos…) sont dans
  `PLATEFORME_VERS_CANAL`. Les régies sont une famille à flux (une publicité
  dynamique pioche dans un catalogue). `GET /products/meta/catalogue.csv` : le
  catalogue en fichier pour les canaux qui n'acceptent pas d'adresse. La phrase
  juste, la même dans l'accueil, la FAQ, llms.txt et l'annuaire : « 314 canaux,
  une voie de liaison pour chacun ». Reste à faire, canal par canal : lire les
  114 `famille` pour les passer `verifie`, et les API restantes avec un compte
  vendeur (Amazon d'abord).

- **« Déployer = pousser sur main » n'est vrai que si Vercel écoute (23/09/2026).**
  Trois pushs de suite (bd4e721, c0e7e53, 17ee921) n'ont déclenché AUCUN
  build Vercel — aucune trace, ni en file ni en erreur — pendant que Railway
  déployait normalement. Vingt minutes perdues à attendre un déploiement qui
  n'existait pas, en cherchant la cause dans le code. Le réflexe : après un
  push, **vérifier que Vercel a bien créé un déploiement** (outil MCP
  `list_deployments` sur `prj_xBa58FSEtTrtw8HxCafkMuFDzI8P`, ou la page
  Deployments), pas seulement attendre le site. Sans build : Deployments › « … »
  › Create Deployment › `main` › Deploy to Production — le bouton reste sur
  « Loading… » mais le déploiement part.

  **Cause trouvée le 24/09/2026 : le plafond de builds de l'offre Hobby.**
  Vercel ne crée aucun déploiement et n'en dit rien dans son tableau de bord,
  mais il l'écrit sur le commit GitHub, lisible sans aucun jeton (dépôt
  public) :

  ```bash
  curl -s https://api.github.com/repos/STANDUP-SHOW/DropShipPro/commits/<sha>/status
  ```

  → `"description": "Deployment rate limited — retry in 24 hours."`. C'est le
  premier geste après un push que Vercel ignore, avant tout le reste. Tant que
  la fenêtre court, seul un déploiement créé à la main depuis le tableau de
  bord (ou l'offre Pro) passe ; ni le navigateur intégré ni Chrome ne sont
  connectés à Vercel, et `create_deployment` du MCP Vercel refuse son
  `requestBody` — c'est donc un geste de Max. Un commit qui ne touche pas
  `frontend/` (CLAUDE.md seul, commit vide) ne déclenche de toute façon
  aucun build : inutile de pousser du vide pour « relancer ».

  Attrapé au passage : **une réécriture Vercel `:path*` ne prend pas une adresse
  à barre finale** — `/analyses/informatique` atteignait Railway,
  `/analyses/informatique/` (la canonique) tombait sur `index.html`. Source
  `/analyses/(.*)` avec `$1`.

- **L'accueil est une table de thèmes, lue trois fois (23/09/2026).** Refait
  « à la manière de Channable » sur la demande de Max : un thème par section
  (gros titre, courte description, illustration, fond alterné), un diaporama
  d'arrivée qui envoie sur la section, chaque section vers `/fonctions/<slug>/`
  (« plus d'informations ») et vers son offre. La source est
  `frontend/src/data/accueil-themes.json` : `Index.tsx` (React),
  `build-geo.cjs` (accueil pré-rendue pour les robots + les onze pages
  `/fonctions/`) la lisent tous les deux — un texte changé d'un seul côté
  ferait deux accueils. Les chiffres y sont ceux du registre (314 canaux, 187
  places de marché, 65 comparateurs, 38 fournisseurs — pas les « 350 / 180 /
  25 / 35 » de mémoire). Les images sont celles de Max, attendues dans
  `frontend/public/images/accueil/<slug>.jpg` ; tant qu'elles manquent,
  `IllustrationTheme` (dégradé + pictogramme) tient la place et aucune image
  cassée ne s'affiche (`ImageOuRepli`, `onerror` sur les pages statiques).
- **Le chemin Google de notre référentiel est un RAYON, pas un pivot vers une
  feuille — et un banc a validé un correctif pendant que la panne continuait.**
  Le 15/09/2026, mini-PC, SSD, tables de mixage et souris étaient tous rangés
  dans « Nettoyants pour appareils électroniques » chez Shopify. Premier
  correctif : noter la ressemblance entre la feuille rendue et ce qu'on avait
  cherché. `check-shopify-categorie.ts` passait — et **la réalité échouait
  toujours**, exactement comme `check-recommandations.cjs`. Deux raisons, et
  aucune n'était dans le code jugé : ses fausses réponses étaient des chemins
  **français inventés** quand Shopify rend des chemins **anglais**, et ses
  catégories d'essai portaient un chemin Google précis (« Electronics >
  Computers > Laptops ») alors que **143 de nos 249 catégories n'ont qu'un
  segment** — « Vehicles & Parts » en désigne trente-deux, « Electronics »
  treize. Chercher la taxonomie avec ça rend les huit premières feuilles du
  rayon, et « Electronics » note 1,00 contre « Electronics Cleaners ».

  D'où le renversement : le chemin Google ne **cherche** plus, il **écarte**
  (garde par département — une dînette « Toys & Games > … > Pretend
  Electronics » tombe d'office). La notation compte la couverture dans les
  **deux sens** : un mot de la feuille que rien n'explique est une
  spécialisation qui disqualifie (« cleaners »), sauf s'il est hérité de la
  branche (« Computer » dans « Computer Mice »). Le libellé français cherche,
  puis son **premier mot** — « Drones et modélisme électronique » ne rend rien,
  « Drones » rend la bonne feuille du premier coup, et le nom de tête est
  aussi ce sur quoi on note (sinon la phrase entière dilue le score à 0,33).

  Reste la barrière de langue, qu'aucune comparaison de chaînes ne franchira :
  « Informatique » n'a aucune lettre commune avec « Computers ». Deux appels
  Haiku **injectables** (`DemandeModele`, faux au banc, comme `AppelShopify`) :
  traduire, puis trancher dans la **liste fermée** rendue par Shopify, avec le
  droit de refuser. Une fois par catégorie, jamais par produit. Sans clé d'API,
  tout dégrade proprement sur la recherche locale. Banc réécrit sur les
  réponses réelles (`sonder-taxonomie.ts`, lecture seule, à relancer avant de
  toucher au score).

  Corollaire attrapé au passage : **une adresse de fiche Shopify ne porte aucun
  identifiant numérique**, c'est un *handle*
  (`/products/mini-pc-amd-ryzen-7-h255-…`). Le script de réparation lisait
  `/products/(\d+)` et sautait les quatre fiches **en silence**.

- **Le thème clair est une inversion de palette, pas une seconde feuille de
  style.** Demandé le 13/09/2026 (bouton lune/soleil sous le titre du menu,
  `BoutonTheme.tsx`, choix dans localStorage `dsp-theme`, posé sur
  `<html data-theme="light">` par `index.html` avant le premier rendu). Le site
  entier est écrit pour le noir avec `text-white`, `bg-white/10`, `text-gray-400`,
  `text-purple-300`… — et Tailwind v4 ne fige aucune de ces couleurs : chaque
  utilitaire lit `var(--color-white)`, `color-mix(… var(--color-gray-400) …)`.
  `scripts/build-theme-clair.cjs` génère donc `src/theme-clair.css` : sous
  `[data-theme="light"]`, chaque échelle est retournée autour de 500
  (300 ↔ 700, 400 ↔ 600…), `white` devient gray-900, `black` devient gray-300
  (pas blanc : les panneaux `bg-black/20` disparaîtraient). Aucune classe à
  toucher dans cent cinquante fichiers. Ce qui a dû être fait à la main :
  les fonds en dur (`bg-[#08070f]`, `bg-[#1b1633]`, `bg-[#211a10]`), le texte
  des boutons `.btn-gradient` (reste blanc : le dégradé ne se retourne pas),
  et les tracés SVG des jauges en `rgba(255,255,255,…)` passés en
  `currentColor` + `fillOpacity`. **Piège :** un sélecteur échappé
  `.bg-[#08070f]` écrit dans index.css est perdu à la minification
  (Lightning CSS) ; viser la classe par attribut, `[class~="bg-[#08070f]"]`.

- **Les boutiques du vendeur ne sont pas des canaux : WooCommerce, PrestaShop,
  Magento (24/09/2026).** Trois connecteurs sur un chemin commun
  (`boutiqueTiers.ts` prépare la fiche une fois — HTML de description, images
  téléchargées ≤ 8 Mo, EAN — chaque connecteur la traduit) : WooCommerce par
  l'API REST wc/v3 (clé/secret en Basic Auth, photos par adresse, catégorie
  cherchée puis créée, `product_invalid_sku` → mise à jour), PrestaShop par
  son webservice XML (clé Basic sans mot de passe, `link_rewrite` et champs
  multilingues sous `<language id>`, photos en multipart une par appel, stock
  sur `stock_availables` après coup), Magento 2 par l'API REST à jeton
  d'intégration (photos en base64 dans `media_gallery_entries`, GET puis
  PUT/POST par SKU). **La liaison se vérifie au collage** (`verifierCompte*`
  dans `routes/settings.ts`) : une clé sans droits ou un webservice éteint se
  voit là, avec la raison, pas à la première diffusion. Banc
  `npx tsx check-boutiques-tiers.ts` (trois faux serveurs, contrat en dur).
  Piège attrapé par `check-liaisons-canaux` : l'annuaire des 314 canaux liste
  des marques, pas des logiciels de boutique — Shopify n'y est pas, les trois
  autres non plus. `BOUTIQUES_DU_VENDEUR` (platforms.ts) nomme la liste une
  fois ; le banc et `categoryMapping` (libellé lisible, pas de taxonomie) la
  lisent. Jamais confrontés à une vraie boutique — faux serveurs seulement.

- **Titres néon de l'accueil (24/09/2026).** Demandés multicolores par Max :
  `.neon .neon-1..6` dans `index.css` (jaune, turquoise, orange, violet,
  vert, rose), lueur par `text-shadow`, tournant par rang de section dans
  `Index.tsx` ; variante thème clair (lueur réduite, couleur assombrie).

---

## État des intégrations

**Fonctionne et vérifié en production** : comptes, mot de passe oublié,
vérification d'email, import, IA (titre, description, 9 attributs, 6 arguments,
20 mots-clés), filigrane, calcul de marge, API catalogue, extension.

- **Connexion Google (Sign in with Google)** : code livré le 11/09/2026, flux
  Google Identity Services par ID token. Le front (`GoogleSignIn.tsx`) rend le
  bouton, le back (`POST /auth/google` + `services/googleAuth.ts`) vérifie l'ID
  token via `google-auth-library` (audience = Client ID) et rend le même
  `{ token, user }` que `/login`. **Un seul Client ID, le même des deux côtés**,
  aucun client secret (la vérif d'ID token n'en demande pas). Reste à faire par
  Max pour l'activer : `GOOGLE_CLIENT_ID` sur Railway, `VITE_GOOGLE_CLIENT_ID`
  sur Vercel (puis **redéployer** le front — Vite fige les VITE_*), et déclarer
  les origines JS autorisées dans la console Google (apex + www). Sans ces
  variables, le bouton ne s'affiche pas et la route répond 503 : dégradation
  propre. Schéma : `User.googleId String? @unique`, `passwordHash` rendu
  **nullable** (compte Google sans mot de passe) — les routes qui le lisaient
  sont gardées. Liaison par email **seulement si l'adresse est déjà vérifiée**
  chez nous ; sinon on adopte le compte et on révoque le mot de passe non prouvé
  (anti-pré-hijacking). Email normalisé en minuscules partout (sinon doublons).

**Cinq familles de destinations publient réellement** (45 « live » au
registre) : « Mon site » (immédiat, via `/api/public/shops/:shopKey/products`),
**Shopify** (API Admin GraphQL, jeton `shpat_` saisi dans Réglages), **eBay**
(API Sell, jeton utilisateur OAuth) et les **41 opérateurs Mirakl** (dépôt
d'offres CSV, adresse + clé du back-office). Les autres marketplaces créent une
publication « en attente ».

- eBay : `backend/src/services/ebay.ts`, banc `npx tsx check-ebay.ts` (faux
  serveur). Triptyque imposé par l'API Inventory : fiche (`inventory_item`),
  offre, `publish`. La **catégorie est demandée à la taxonomie d'eBay**
  (suggestions) puis mémorisée dans `Category.targets.EBAY_ID` — jamais de table
  maison. Trois prérequis côté compte, traduits en gestes précis quand ils
  manquent : politiques de vente (livraison, paiement, retours) et emplacement
  marchand. **Le jeton utilisateur vit deux heures** : seul, il marche puis
  expire ; avec le trio refresh token + Client ID + Client Secret, il se
  renouvelle tout seul (`avecRenouvellement`, rejoué une fois sur 401
  uniquement). Stock prudent (10, pas 100) : eBay sanctionne les annulations.
  **Jamais confronté à un vrai compte eBay** — mais vérifié en production le
  03/09/2026 avec un jeton invalide : le 401 du vrai api.ebay.com revient en
  refus lisible sur la publication.
- Kaufland : `backend/src/services/kaufland.ts`, banc `npx tsx
  check-kaufland.ts`. Seller API signée HMAC-SHA256 **hex** sur
  `MÉTHODE\nURI\ncorps\ntimestamp` (en-têtes Shop-Client-Key/Timestamp/
  Signature), `POST /units/` avec **prix en centimes entiers**, 201 à corps
  vide et unité dans l'en-tête `Location`. Clés : Client Key 32 caractères,
  Secret Key 64 — longueurs vérifiées au collage. L'EAN est obligatoire
  (même modèle que Mirakl) et sa **clé de contrôle GS1 est vérifiée chez
  nous** : un EAN faux grefferait l'offre sur la fiche d'un autre produit.
  Vérifié en production le 04/09/2026 avec des clés bidon : le 401 du vrai
  sellerapi.kaufland.com revient en refus lisible. **Leçon du banc, à ne pas
  reperdre : le faux serveur recalculait d'abord la signature avec la
  fonction du connecteur — une faute aurait été des deux côtés et la
  contre-épreuve ne tombait pas. Un faux serveur écrit le contrat EN DUR.**
- **Un connecteur branché côté serveur peut être injoignable depuis l'écran.**
  Découvert en branchant le formulaire eBay : le champ générique « Clé API »
  n'envoyait qu'une clé, alors que `readMiraklCredentials` exige aussi
  l'adresse du back-office — aucun opérateur Mirakl n'était connectable depuis
  l'interface, et aucun banc ne le voyait (ils appellent le service, pas le
  formulaire). Formulaires dédiés dans `PlatformCredentials.tsx`, validation au
  collage dans `routes/settings.ts` (trio eBay complet ou rien ; adresse Mirakl
  obligatoire).

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

- **Automatisable en self-service** : Google Shopping (Merchant Center
  gratuit), Wish
- **Compte vendeur validé requis** : Amazon, Cdiscount, TikTok Shop (les
  opérateurs Mirakl demandent aussi d'être accepté vendeur, mais le connecteur
  est branché)
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
2. ~~**Shopify**~~ **réglé, et au-delà.** Constaté le 15/09/2026 sur la boutique
   d Max (oguss-france) : **108 produits actifs** publies par la plateforme (ceux que Max a
   selectionnes), avec photos, variantes, stock et categorie Google. Et
   DropShipper IA n y est pas seulement un connecteur : c est une **application
   Shopify installee**, qui apparait dans le menu Applications du back-office
   marchand avec sa propre page. Consequence commerciale a ne pas perdre de vue :
   les 3 millions de boutiques Shopify du monde peuvent nous installer depuis chez
   elles, et nous chercher dans le Shopify App Store.
2bis. **L'app Shopify PUBLIQUE est à moitié faite (15/09/2026).** Celle qui
   apparaît dans le menu Applications d'oguss-france est une app
   **personnalisée** : elle ne s'installe nulle part ailleurs et ne peut pas
   figurer à l'App Store. Écrit et éprouvé (`services/shopifyApp.ts`,
   `routes/shopifyApp.ts`, banc `npx tsx check-shopify-app.ts`) :
   installation OAuth avec `state` signé (il porte le compte — sans lui,
   n'importe qui brancherait une boutique sur le compte d'un autre), HMAC du
   retour, et les **trois webhooks RGPD obligatoires** plus `app/uninstalled`,
   signés sur les **octets bruts** (route montée avant `express.json`, comme
   Stripe). L'échange rend `{ shopDomain, accessToken }`, la forme que
   `readShopifyCredentials` attendait déjà : rien en aval ne change.

   **Le jeton d'une app publique n'est plus permanent (16/09/2026).** Première
   installation réelle sur une boutique de développement (auto-parts-o8avomvl,
   créée depuis le Dev Dashboard — une boutique d'essai créée depuis l'admin
   marchand est dans une autre organisation et Shopify y refuse l'app tant
   qu'elle n'est pas examinée) : callback, liaison et page intégrée bons, et la
   première publication répondait 403 « Non-expiring access tokens are no
   longer accepted for the Admin API » — avec un `shpat_` que Shopify venait de
   délivrer. Notre écran disait « jeton refusé », sans le motif ; la cause n'a
   été lue qu'en rejouant l'appel à la main. Depuis : l'échange demande
   `expiring: 1` (jeton d'UNE HEURE + refresh token de 90 jours, échéances lues
   dans la réponse), `jetonOfflineValide()` renouvelle à moins de cinq minutes
   de l'échéance et RANGE la nouvelle paire avant de servir (l'ancien refresh
   token meurt dès que le nouveau sert), un 401 au renouvellement est définitif
   et demande de réinstaller, et le motif de Shopify est transmis dans le refus.
   Banc `check-shopify-app.ts` § 6, faux serveur au contrat écrit en dur.
   **Une seule boutique Shopify par compte** (`@@unique([userId, platform])`) :
   installer l'app sur une seconde boutique ÉCRASE la liaison de la première —
   c'est ce qui est arrivé à oguss-france ce jour-là.

   **La facturation hors Shopify est INTERDITE aux apps listées** — exigence
   1.2.1 de l'App Store, texte exact dans `docs/shopify-app-store-dossier.md`.
   Le champ « frais facturés hors Shopify » de la fiche sert aux frais qui ne
   sont pas des frais d'app ; il ne dispense de rien. Une règle se lit dans la
   page « requirements », pas dans le formulaire qui la met en œuvre. D'où
   `services/shopifyBilling.ts` (même soir) : les packs de `PACKS_DROPS`
   s'achètent DANS l'admin par `appPurchaseOneTimeCreate` (nom de l'achat
   porte `[drops-1000]`, prix en chaîne décimale, `test` vrai sur une boutique
   de développement) ; **on ne crédite jamais parce que le marchand est
   revenu**, on relit chez Shopify les achats `ACTIVE` non crédités — au retour
   ET à chaque ouverture de la page intégrée (retour perdu = crédité à la
   visite suivante). Le `Payment` s'écrit AVANT les drops sous la clé unique de
   l'achat (colonne `stripeSessionId`, qui est en fait la clé d'idempotence
   quel que soit l'encaisseur) : deux régularisations simultanées ne créditent
   pas deux fois. Prix affichés HT — Shopify ajoute les taxes. Constaté sur
   auto-parts : 49 850 → 50 350 drops, une fois. Banc `check-shopify-billing.ts`.
   Reste à activer : `SHOPIFY_APP_KEY`, `SHOPIFY_APP_SECRET`,
   `SHOPIFY_APP_SCOPES` sur Railway. Restent à écrire pour la fiche : app
   intégrée + App Bridge + jetons de session. **Et une décision qui n'est pas
   technique : la facturation.** Shopify interdit l'encaissement hors
   plateforme aux apps listées, et définit ses revenus comme ce qui « passe
   par » l'app, avec droit d'audit. Tout est posé dans `docs/shopify-app.md`,
   voie conseillée comprise (distribuer par lien direct d'abord : ça ne coûte
   rien et le code est déjà là).

3. **`RESEND_API_KEY`** : sans elle aucun email ne part réellement.
3bis. **L'`ANTHROPIC_API_KEY` de `backend/.env` est refusée (401, 15/09/2026)**
   alors que celle de Railway est bonne — les imports de production sont tous
   réécrits. Conséquence : **aucun banc local ne peut exercer un chemin qui
   appelle le modèle**, et un script lancé depuis la machine dégrade sans le
   dire si on ne lit pas ses journaux. À renouveler dans `backend/.env`.
4. Une **veille de disponibilité** des produits sources a été proposée.
6. **L'extension est au Chrome Web Store** (fiche
   `chromewebstore.google.com/detail/dmhhfboiialjghjkjhfnipjafffpodlk`, dossier
   dans `docs/chrome-web-store.md`). **Le store ne lit pas notre dépôt** : une
   version n'y arrive que quand Max la téléverse. Publier une mise à jour =
   incrémenter `version` dans `extension/manifest.json`, lancer
   `node extension/build-store-zip.cjs` (→ `backend/extension-store.zip`, hors
   dépôt), et **Max téléverse le zip** dans le Developer Dashboard ; Chrome
   propage ensuite en quelques heures. Tant que ce n'est pas fait, le store sert
   l'ancienne version — le site disait « la 1.32.0 est disponible, Chrome
   propage » alors que le store était à la 1.30.0 (15/09/2026). Décision du
   même jour : **plus d'installation « mode développeur » sur le site**, nulle
   part ; le site ne compare plus les numéros de version. Il ne sait que ce qui
   se sait : le pont (`app-bridge.js`) annonce `store` = présence de
   `update_url` dans le manifeste, que Chrome n'écrit que sur une copie du
   store ; une copie chargée à la main est signalée comme telle (elle ne se
   mettra jamais à jour), rien d'autre. Deux copies installées (store + manuelle)
   répondent toutes les deux au ping ; celle du store fait foi.

   **Et il faut le DIRE quand il y en a deux (16/09/2026).** Le client lisait
   1.35.0 dans `chrome://extensions` et « Version 1.32.0 » chez nous, et en
   concluait que l'écran mentait. L'écran ne mentait pas : il avait les deux
   copies, et il en montrait une **sans dire qu'il choisissait**. C'est la
   leçon générale, et elle dépasse l'extension — *un écran qui tranche en
   silence est indiscernable d'un écran faux* : celui qui le lit n'a aucun
   moyen de savoir lequel des deux il est. La tuile distingue donc quatre
   états (active / copie manuelle / **deux copies** / absente).

   Corollaire trouvé en vérifiant, et c'est le même défaut : **la pilule DEMO
   ne commande pas cette tuile.** Elle peuple le chiffre d'affaires et les
   commandes — des chiffres de commerce qu'on montre à un prospect. L'état de
   l'extension est un fait sur la MACHINE de celui qui regarde ; la
   démonstration n'a aucune autorité dessus, et elle affichait « Extension
   active » dans un navigateur qui n'en avait aucune.
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
