# Mémo de reprise — 1er septembre 2026

Ce fichier existe pour qu'une conversation puisse être vidée sans rien perdre.
Il ne répète pas `CLAUDE.md`, qui garde les **règles durables** et les **pièges
vérifiés** : celui-ci dit **où on en est**, **ce qui bloque**, et **ce qui reste
à faire**. À lire en entier avant de reprendre.

---

## La règle qui compte plus que le reste

**Rien n'est « fait » tant que ça n'a pas été constaté.** Compilé, commité et
poussé ne veut pas dire vu fonctionner. Ce mémo distingue partout les deux, et
la prochaine session doit continuer de le faire — c'est la seule protection
contre une liste de fonctions qui grossit pendant que l'application recule.

---

## Ce qui bloque, à traiter en premier

### 1. Les variantes ne sont pas importées — non diagnostiqué

Signalé par le client le 01/09/2026. **L'édition manuelle est réglée** (voir plus
bas), mais la cause du non-import n'a pas été trouvée. Le banc de l'extension
relève correctement `{"Taille du bracelet":[…],"Couleur":[…]}` sur sa page de
contrôle, donc le relevé fonctionne en laboratoire.

**Ce qu'il faut pour avancer : une vraie adresse de produit qui échoue.**
Chercher la cause en lisant le code n'a rien donné, et continuer à le faire est
du temps perdu. Demander l'URL, rejouer l'import, regarder ce que le serveur
reçoit réellement.

Fichiers concernés : `services/aiEnhancer.ts` (`extractVariants`),
`services/variantRepair.ts`, `extension/content/capture.js`.

### 2. Le compteur de la fenêtre « Diffuser », bloqué à 0

Signalé, **non reproduit** en lisant le code. La fenêtre a été déplacée dans un
portail `document.body` avec `type="button"` explicite — une barre collante ou un
ancêtre transformé pouvait intercepter les clics. **À reconfirmer sur
www.drop-shipper.fr**, pas en local.

### 3. Ce qui est écrit mais n'a jamais tourné en vrai

Par ordre de risque :

- **Shopify** au-delà du socle : le code de publication complète (catégorie
  taxonomique, collections, métachamps, variantes en masse) est compilé, jamais
  exécuté contre une vraie boutique. Il faut un jeton `shpat_` réel.
- **eBay** (`services/ebay.ts`, 03/09/2026) : banc contre faux serveur, et le
  circuit **est** vérifié déployé — un jeton invalide a fait l'aller-retour
  jusqu'au vrai api.ebay.com et le 401 revient en refus lisible. Mais aucune
  annonce n'a jamais été réellement créée : il faut un vrai jeton vendeur avec
  les portées sell.inventory et sell.account.
- **Mirakl** : même état — connecteur et formulaire (adresse + clé) en place,
  jamais confronté à un vrai opérateur.
- **Meta** (`services/socialMeta.ts`) : jamais confronté au vrai Meta. Il manque
  l'app, la vérification d'entreprise et l'App Review.
- **Zernio** (`services/socialGateway.ts`) : jamais confronté au vrai service.
  Pas de clé, et le droit de marque blanche multi-clients n'est pas confirmé.
  De toute façon supplanté par Meta natif — 6 $/mois et par compte raccordé
  couraient sur les vendeurs dormants.
- **Tous les connecteurs fournisseurs** : éprouvés contre de faux serveurs
  (`check-fournisseurs.ts`, `check-aliexpress.ts`, `check-refs.ts`), jamais
  contre les vrais.
- **Le remplissage Leboncoin** : jamais vu aller au bout des quatre écrans.
- **La vitrine OGGUS** (`oguss-flux-boutique`, dépôt séparé) : le lecteur de flux
  a été corrigé et un back-office écrit, mais le projet est en Bun et
  `node_modules` est absent — **jamais construit**.

### 4. `RESEND_API_KEY` absente

Sans elle, **aucun email ne part réellement** : ni vérification d'adresse, ni mot
de passe oublié. Le code est bon, il lui manque la clé.

---

## Ce qui a été fait le 01/09/2026

Tout est poussé sur `main`. Rien n'est constaté en production.

**`9c6cadf` — variantes et état du produit.**
`components/VariantEditor.tsx` : dix dimensions proposées (Couleur, Taille,
Pointure, Capacité, Modèle, Longueur, Puissance, Prise, Matière, Contenance)
avec leurs valeurs suggérées, pastilles retirables, bouton `+`. Le bug
d'affichage venait de `defaultValue` + `onBlur` : React ne réécrit jamais un
champ après son montage, donc renommer une dimension faisait revenir les
anciennes valeurs. Tout est contrôlé désormais.
`services/productCondition.ts` : trois états (neuf / reconditionné / occasion),
traduits à la publication — « Très bon état » chez Leboncoin, « Neuf sans
étiquette » chez Vinted, `refurbished` dans les flux Google et Meta. L'extension
cochait « Neuf » d'office, ce qui est un motif de retrait dès qu'on revend du
reconditionné.

**`27a474c` puis `c7875e8` — la boutique d'imprimerie, un autre projet.**
Section « Autorisation spéciale » (code `123456`, `BETA_CODE`),
`PrintProduct` en base, `services/printPricing.ts`, `routes/beta.ts`, flux
`/api/public/print/:shopKey/products`, et la vitrine autonome **Print34**
(`storefront-imprimerie/`). **Le client a explicitement mis ce sujet de côté** :
c'est un projet à part, sans doute une boutique isolée. Ne pas y revenir sans
qu'il le demande. Tout est décrit dans `docs/boutique-imprimerie.md`.

---

## Ce qui reste demandé et pas encore fait

Par ordre de ce qui a été demandé le plus récemment.

1. **La page d'un rayon, enrichie.** Demandé et jamais livré : articles
   dépliables avec aperçu de l'annonce au survol, nombre de ventes, nombre de
   publicités, chiffre d'affaires du rayon, places de marché où les produits
   sont en vente, statistiques d'efficacité, et sélection cliquable pour lancer
   une analyse de marché. Le bloc « Agents chefs de rayons » en bas de `/rayons`
   n'est pas fait non plus.
2. **Le tableau de bord en glassmorphism**, et une **animation de cerveau IA en
   boucle** à un endroit précis. Le client a dit « on fera ça après » ; il avait
   demandé quel format m'arrange (SVG monté, aperçus JPG ; vidéo ou GIF pour
   l'animation). **La réponse n'a jamais été donnée** — la donner avant de
   commencer.
3. **Le relevé des campagnes publicitaires.** Les comptes de régie se relient et
   sont conservés, mais aucun connecteur ne va lire les chiffres. Avec le jeton
   du vendeur, les API de lecture de Meta, Google Ads et TikTok sont accessibles
   sans notre propre application validée. C'est un connecteur par régie.
4. **Une veille de disponibilité** des produits sources — proposée, jamais
   écrite.
5. **Le mode d'emploi** décrit un fonctionnement qui n'est plus le nôtre. À
   reprendre entièrement : agents, mode automatique, publication par extension,
   par API, par flux.
6. **Gestion fournisseur** : le client a demandé de la retirer pour l'instant.
   À rouvrir quand les API fournisseurs seront branchées — commandes, factures,
   chiffre d'affaires par fournisseur.
7. **Sélection de produits gagnants via compte affilié** (type AliExpress), pour
   proposer une sélection aux utilisateurs.

---

## Ce que le client doit faire lui-même

Rien de tout cela ne peut être fait depuis le code.

- **`RESEND_API_KEY`** dans les variables Railway. Sans elle, aucun email.
- **Un jeton Shopify `shpat_`** depuis admin.shopify.com (Paramètres ›
  Applications et canaux de vente › Développer des applications › API Admin).
  C'est la voie à conseiller, pas le Dev Dashboard — voir `CLAUDE.md`.
- **L'app Meta** : création, vérification d'entreprise, App Review. C'est long,
  et c'est le seul chemin vers la publication organique native.
- **Chrome Web Store** : compte développeur à 5 $, captures d'écran, envoi. Le
  paquet et la fiche sont prêts (`docs/chrome-web-store.md`,
  `node extension/build-store-zip.cjs`). **Tant que ce n'est pas fait, aucune
  mise à jour automatique** : le Mode développeur ne se met jamais à jour.
- **Dans `oguss-flux-boutique`** : `git rm --cached .env` (il est commité), et
  les trois variables d'environnement du back-office.

---

## Décisions prises, à ne pas rouvrir

Celles qui reviennent le plus souvent dans les conversations. Les autres sont
dans `CLAUDE.md`.

- **Pas de connexion automatique aux marketplaces**, et **l'agent ne clique
  jamais sur « Publier »** chez un tiers. Il remplit, le vendeur valide.
- **Pas de scraping** d'Amazon, de Cdiscount, de la bibliothèque publicitaire de
  Meta ni des boutiques concurrentes.
- **Les identifiants de place de marché ne sont jamais confiés à un agent
  tiers**, et un jeton stocké ne repart jamais vers le navigateur.
- **Pas de bouton qui recrédite tout seul : un ticket.** La borne de l'avoir est
  dans le code, jamais dans la consigne au modèle — une consigne cède quand le
  vendeur insiste.
- **Le genre est un attribut, pas une catégorie**, sauf pour les vêtements et
  les chaussures, parce que la taxonomie Google le fait là et pas ailleurs.
- **La boutique d'imprimerie est un projet à part.** Mise de côté par le client
  le 01/09/2026.

---

## Repères techniques — ce qui fait perdre du temps

- **Ne pas écrire de fichier par le shell.** Un long texte passé en `cat >` ou en
  `node -e` se fait avaler : gabarits, `${}`, accents graves et `\n` disparaissent.
  Ce mémo lui-même en a été victime deux fois, et cette session a cassé
  `adapters.js`, `check-lexique.ts`, `AdDialog.tsx` et `Suppliers.tsx` de cette
  façon. **Passer par l'outil d'écriture**, et garder les scripts de correction
  dans des fichiers `.cjs`.
- **Les regex écrites par script perdent leurs barres obliques inverses** : `\d`
  devient `d`, `\b` devient un caractère de recul invisible qui ne correspond
  jamais. Quatre régressions causées ainsi.
- **Avant de chercher un bug dans le code, regarder ce que le serveur renvoie
  vraiment.** C'est ce qui a trouvé le 405 de Vercel, l'extension en 404, la
  juridiction R2 et les chiffres faux du comptable.
- **Une vérification qui ne peut pas échouer ne vérifie rien.** Le premier
  contrôle des polices comparait deux textes fins et concluait « suspect » ; il a
  fallu le remplacer par le rapport d'encre entre `i` et `M` (2,99 avec une vraie
  police, 1 avec des carrés vides).
- `check-routes.ts` a attrapé deux fois un `/orders/:id` déclaré avant
  `/orders/by-supplier`. Le lancer après toute route neuve.

### Les bancs à lancer avant de livrer

```bash
cd backend && npx tsc --noEmit
cd frontend && npm run build          # plus strict que le dev
cd backend && node extension/check.cjs
cd backend && npx tsx check-routes.ts
```

Et selon ce qui a été touché : `check-photos.ts`, `check-lexique.ts`,
`check-categories.ts` (vraie base), `check-chat-budget.ts`, `check-tickets.ts`,
`check-social.ts`, `check-meta.ts`, `check-shopify-token.ts`,
`check-shopify-oauth.ts`, `check-fournisseurs.ts`, `check-aliexpress.ts`,
`check-refs.ts`, `check-polices.ts`, `check-imprimerie.ts`.

### À savoir sur la machine

- **La clé `ANTHROPIC_API_KEY` locale est invalide.** Tout banc qui appelle le
  modèle échoue ici sans que le code soit en cause. C'est pour cette raison que
  le bouton « Reprendre » a été ajouté sur la page Catégories : il fait tourner
  le rangement là où la clé est valide.
- **Python n'est pas installé** — d'où Node plutôt que FastAPI, et la skill
  `ui-ux-pro-max` inutilisable.
- **La base est la même en local et en production.** Une migration jouée en
  local touche la production.
