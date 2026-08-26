# DropShipper IA — mémo projet

Ce fichier est lu automatiquement au début de chaque session. Il remplace la
mémoire d'une conversation : tout ce qui compte pour reprendre le travail est ici.

---

**Reprise apres une conversation videe : lire .** Il dit ou on en
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
docs/        Documentation de l'API catalogue
```

---

## Décisions à ne pas refaire

- **Node, pas Python.** Python n'est pas installé sur la machine ; c'est pour ça
  que le backend n'est pas en FastAPI. La skill `ui-ux-pro-max` est installée mais
  inutilisable pour la même raison.
- **Pas de connexion automatique aux marketplaces.** Rejouer des mots de passe
  viole leurs CGU et fait suspendre les comptes vendeur. L'extension détecte la
  session et attend que l'utilisateur se connecte.
- **L'agent ne clique jamais sur « Publier »** sur un site tiers. Il remplit, le
  vendeur valide.
- **L'import par URL ne marche pas sur Temu, JoyBuy, AliExpress, Shein.** Ces
  sites construisent leur fiche en JavaScript ; le serveur reçoit une coquille
  vide. C'est refusé explicitement, avec renvoi vers l'extension.

## Pièges vérifiés (ne pas retomber dedans)

- **Le disque de Railway est éphémère.** Sans volume monté sur `/app/storage`,
  toutes les photos filigranées disparaissent à chaque redéploiement. Le chemin
  de montage doit être exactement `/app/storage` : le code écrit dans
  `path.resolve('storage')` depuis `/app`. Monté ailleurs, le volume est
  facturé, présent, et sans effet — aucun message ne le signale.
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
