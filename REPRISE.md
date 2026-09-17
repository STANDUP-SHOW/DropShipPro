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

## Où on en est le 17/09/2026 — DropShop IA et Fresh news

**Fresh news** (commit 33689a1) : rapports des 48 agents de marché stockés
(`MarketReport`), servis aux comptes à ≥ 500 drops (`GET /api/market-reports`,
402 sinon), page `/fresh-news` (rayon, aujourd'hui / hier, date des 15
derniers jours, titre dégradé, blocs ancrés, produits « Voir / Importer 12 /
Extension 6+12 »). File d'import (`ImportQueue`) écrite, **exécuteur dans
l'extension pas encore fait**. `deposer-rapports.ts` envoie
`MARKET-ANALYSES/rapports/` au serveur (clé `AGENT_API_KEY` dans .env). **Aucun
rapport réel déposé encore** : Max doit dire où Cowork a écrit le rapport
téléphonie.

**DropShop IA** (commit 4446c41, poussé le 17/09 vers 13 h) : le
« Lovable-like » demandé — voir `docs/dropshop.md` et le piège dans
`CLAUDE.md`. Tout est écrit, 70 bancs passent (dont `check-dropshop.ts` et
`check-dropshop-jobs.ts`, ce dernier contre la vraie base avec comptes
jetables et faux modèle). Migration `20260917200000_dropshop_ia` **appliquée
en production** après sauvegarde.

**Constaté en production le 17/09 vers 12 h 20 (compte de Max, boutique
France ROBOTIQUE, 3 annonces)** : création lancée depuis `/creer-boutique`
avec un brief de six lignes → **215 s** (Sonnet 5, un seul passage, le
contrôle du visiteur passé du premier coup) → page de 610 lignes / 35 Ko
servie à `https://api.drop-shipper.fr/b/france-robotique` (en-tête
`X-DropShop-Version: 1`) : identité écrite en tête du CSS (palette noir
laboratoire / bleu électrique, Chakra Petch + Manrope, « poste de contrôle »),
héros plein écran avec la vraie photo du robot, catégories en cartes,
nouveautés, section « pourquoi », FAQ, pied complet. Vérifié par le DOM :
fiche produit (titre, 2 990 €, 16 photos, bouton `data-ajouter`), ajout au
panier → compteur 1 → panier (sous-total, port offert, total) → commande
(6 champs, « Confirmer la commande »). À 615 px de large : pas de défilement
horizontal, grilles à 2 colonnes. **Débit réel : 50 350 → 50 150** (« Création
de boutique DropShop IA »). Puis une modification (« ajoute une FAQ livraison
avant le pied de page ») : **18 s** (Haiku 4.5), version 2, gratuite (9
comprises restantes), résumé montré au vendeur. **Défaut vu** : Haiku a mis
la FAQ dans la fiche produit, pas sur l'accueil ni dans le cadre — la
consigne d'édition dit désormais où va une demande qui ne nomme pas d'écran.
La page servie aussi repassée localement dans le vérificateur : ok.

**Pas encore constaté** : la restauration d'une version depuis l'écran (le
banc la couvre), une création qui exige une réparation (le banc la couvre),
et le chemin Stripe (`/checkout` → session → `/checkout/:session`) — aucune
clé marchand branchée, éprouvé par le contrat seulement.

Piège d'outillage vu ce jour : **les captures d'écran de Chrome MCP
échouent (« renderer frozen ») quand la fenêtre Chrome est masquée** par une
autre ; le DOM répond toujours (`javascript_tool`, `get_page_text`). Vérifier
par le DOM, pas par l'image.

Reste pour DropShop : sous-domaine / domaine propre, boutique de démonstration,
port par commande dans le back-office, Opus 5 à l'essai pour la création.

## Où on en est au soir du 16/09/2026

**App Shopify publique** (Dev Dashboard org 236010842, app 424256045057, Partner
org 5189201, distribution **publique** choisie — irréversible) :
- Railway : `SHOPIFY_APP_KEY` = `50e43d4e109a563f0176c78fe316d82f` (clé de la
  nouvelle app, non secrète) et le secret correspondant, déployés. **Constaté** :
  `/api/settings/shopify/install-url` rend un lien portant cette clé, redirect
  `https://api.drop-shipper.fr/api/shopify/callback`, 4 portées.
- **Constaté** : sur oguss-france, Shopify reconnaît l'app mais affiche « Cette
  appli est en cours d'examen … doit être examinée par Shopify avant de pouvoir
  être installée », bouton Installer grisé. oguss-france est dans l'autre org
  (« oguss conect »). Une app publique non validée ne s'installe que sur une
  boutique de l'organisation **Dev Dashboard 236010842** : « My Store 3 »
  (zr6h70-b1, créée depuis l'admin marchand, essai payant) a été refusée
  pareil ; la boutique dev créée depuis Dev Dashboard › Boutiques › Créer une
  boutique › Dev est passée.
- **Prouvé de bout en bout le 16/09 au soir sur `auto-parts-o8avomvl.myshopify.com`**
  (boutique dev, org 236010842) : lien d'installation → page d'accord Shopify →
  callback → `PlatformCredential` (via `oauth`, refresh token, `expiresAt`) →
  page intégrée dans l'admin (« Boutique reliée », 204 annonces) → publication
  réelle : la station météo (11 variantes) est **Actif** dans Produits de la
  boutique. Ce qui a bloqué entre les deux : Shopify refuse les jetons
  permanents aux apps publiques (commit 624bebd, `expiring: 1` + renouvellement,
  CLAUDE.md § app publique).
- **Le dossier de soumission est écrit** : `docs/shopify-app-store-dossier.md`
  (exigences relevées à la source avec leurs numéros, état point par point,
  chantiers dans l'ordre, textes de fiche FR/EN aux bonnes longueurs). Le
  TOML qui déclare les webhooks RGPD est dans `shopify-app/shopify.app.toml`,
  CLI Shopify 4.8.0 installé. **Geste de Max** : `cd shopify-app && shopify app
  deploy --no-release` (connexion Shopify dans le navigateur), puis activer la
  version dans le Dev Dashboard. **Découverte qui change le plan** : la
  facturation hors Shopify est INTERDITE aux apps listées (exigence 1.2.1,
  texte exact dans le dossier) — la « correction » du matin dans
  docs/shopify-app.md était fausse, re-corrigée. **Billing API FAITE et
  constatée** (commit e9056ac + ec0eda8 : recharges de drops achetées dans
  l'admin, achat test approuvé sur auto-parts, 49 850 → 50 350 drops, crédité
  une fois). Chantiers restants avant soumission : installation lancée depuis
  Shopify sans saisie d'adresse (½ j), coût d'achat dans le champ Cost (1 h),
  page publique /tarifs (1 h), page intégrée qui publie depuis l'admin (1 j),
  puis fichiers de fiche + screencast. Après validation, oguss-france et
  toute boutique peuvent installer. **Webhooks RGPD déclarés et publiés**
  (version `1.1-webhooks-rgpd`, CLI connecté par code d'appareil depuis le
  Chrome de Max ; `app/uninstalled` refusé au niveau app avec le flux hérité,
  reste posé boutique par boutique).
- **oguss-france a PERDU sa liaison** : une seule boutique Shopify par compte
  (`@@unique([userId, platform])`), l'installation sur auto-parts a écrasé son
  jeton. Rien de cassé côté Shopify (108 produits en place), mais une nouvelle
  publication irait vers auto-parts. Deux issues : recoller le `shpat_` de
  l'app personnalisée d'oguss-france dans Réglages (écrase auto-parts à son
  tour), ou — la vraie — **plusieurs boutiques Shopify par compte** (schéma,
  migration à la main + `migrate deploy`, choix de la boutique à la diffusion
  comme `ShopPicker`). À décider avec Max avant de toucher au schéma.
- Deux Chrome sont reliés à Claude in Chrome : celui où Max est connecté
  (drop-shipper, Shopify) n'est pas forcément celui sélectionné par défaut —
  lister les navigateurs et vérifier la session avant d'agir.

**Faire** : export CSV au gabarit officiel (49 colonnes), état d'intégration
`export`, canaux double casquette (FAIRE/TEMU/ALIEXPRESS dans l'enum), éligibilité
sourcée — tout poussé (commits 5c1a24e, f6f7b93, 9b10724). Non confronté à un
vrai dépôt chez Faire.

**Restent** : extension 1.35 à téléverser au Chrome Web Store (puis étapes 5–6
de `docs/migration-domaine-api.md`), supprimer l'ancienne app Shopify une fois la
nouvelle prouvée, `ALIEXPRESS_REDIRECT_URI` optionnel vers api.drop-shipper.fr,
clé Anthropic locale à renouveler.

---

## Livrables hors dépôt — les artefacts

**Une partie du travail de ce projet n'est pas dans le dépôt.** Le business plan,
les chiffrages et les relevés de coûts sont des **artefacts claude.ai** : ils ne
sont ni commités, ni visibles par une recherche de fichiers. Leur adresse n'était
écrite nulle part, et le 16/09/2026 ça a coûté exactement ce que ça devait
coûter — à la question « business plan mis à jour ? », j'ai cherché dans le
dépôt, n'ai rien trouvé, et répondu qu'il n'existait pas. Il existait, il faisait
130 Ko, et il contenait déjà la section demandée. Réponse du client : *« chaque
jour j'ai l'impression qu'on redémarre de 0, comme si je n'avais pas fait ce
projet avec toi. »* Il avait raison.

| Artefact | Adresse |
|---|---|
| **Business plan 2027–2031** (le document de référence) | https://claude.ai/artifact/Ji9BodBHs1k2nqSTziX1JM |
| Le modèle Drops (la monnaie, les paliers) | https://claude.ai/artifact/3bqQ9yjJAECmNiMEFT9N73 |
| Coûts IA réels (cité par `services/tarifs.ts`) | https://claude.ai/artifact/D6irqHHvH2v3m7G8y5QvcA |
| Grille marketplaces | https://claude.ai/artifact/KPXB3n4KeYi9UdkepveepX |
| Capacités par plateforme | https://claude.ai/artifact/RpPjhGgNBTrjVawVEpTSf6 |
| Chiffrage domaines | https://claude.ai/artifact/2kGqtj3FvRLCD8s2xjhcZz |
| Relevé DropShipper IA | https://claude.ai/artifact/PhremyNwb3zTsoezxMsFnE |

**Deux règles qui vont avec :**

1. **Avant de conclure qu'un livrable n'existe pas**, lister les artefacts — pas
   seulement chercher un fichier. Ce qui n'est pas commité existe quand même.
2. **Le business plan recopie des chiffres qui vivent dans le code** —
   fournisseurs (`services/suppliers.ts`), canaux (`frontend/scripts/seo-channels.cjs`),
   tarifs (`services/tarifs.ts`). Exactement le piège déjà documenté pour
   `llms.txt` dans `CLAUDE.md`. **Une fonction ajoutée au produit périme le plan
   sans que rien ne le signale** : relire ces trois sources avant de le republier.

---

## Refonte « Drops » (07/09/2026) — code prêt, déploiement à faire

Bascule vers une **monnaie unique, les drops** : plus d'abonnement Premium, plus
de location de chef de rayon. Accès à tout, chaque action facturée en drops.
**1 drop = 0,01 € ; prix d'une action = coût réel × 5** (marge 80 %). Barème
dans `backend/src/services/tarifs.ts` (source unique).

**Fait et vérifié en local :**

- Cœur économique côté serveur : `services/tarifs.ts` (barème), `billing.ts`
  (`reserveCredits`/`refundCredits` **tout-ou-rien** sur le solde de drops, relevé
  écrit à chaque mouvement, packs de drops). Repricing de tous les sites d'appel
  (import 12, importLot 8, réécriture 10, analyse 30, image 18, pub 20, question
  comptoir 5, question chef 25, conseil produit 40, AUTO-MODE 75/passage,
  AUTO-SHIPPER 14/import). Publier reste gratuit.
- Abonnement + location **supprimés** : `routes/billing.ts` (drops-only),
  `agentBilling.ts` (plus de `paidUntil`/`AGENT_PLANS`, tous les rayons actifs),
  `reports.ts`/`departments.ts`/`agent.ts`/`autoAnalyste.ts`/`autopilot.ts`
  (plus de gate premium/paidUntil ; AUTO-MODE facture 75 drops/passage ;
  AUTO-SHIPPER sans tranche, 14/import). Crédits images fondus dans le solde
  unique (visuals, tickets, statistiques).
- **Relevé du portefeuille** : table `DropTransaction` (migration
  `20260911090000_portefeuille_drops` **déjà appliquée** en prod — additive,
  sans risque : table + défaut d'inscription à 120), endpoint
  `GET /billing/transactions`, chaque débit/crédit porte un libellé.
- Front : page « Mes crédits » refondue en **portefeuille** (`pages/Billing.tsx`)
  — solde en drops + équivalent €, recharge Stripe, relevé en direct,
  explication des drops, **grille tarifaire complète drops/€/$**. Icône pièce
  `components/DropCoin.tsx` (D barré, or, vectorielle). UI d'abonnement/location
  retirée de Billing/Rayon/Rayons/PhotoStudio/Agents. Route `/credits` ajoutée.
- **58 bancs verts**, `tsc` backend vert, `npm run build` front vert.

**Ce qui reste, dans l'ordre — NE PAS inverser :**

1. **Déployer le code** (push → Railway + Vercel). Le nouveau code lit `credits`
   comme des drops.
2. **APRÈS le déploiement**, convertir les soldes existants :
   `cd backend && npx tsx convertir-en-drops.ts` (aperçu), puis `--ecrire`.
   Il fond `credits×12 + imageCredits×18 → drops` pour les comptes antérieurs à
   la bascule (préserve le pouvoir d'achat), idempotent, borné par date. **Ne
   jamais le lancer avant le déploiement** : l'ancien code lirait des soldes
   gonflés. Sauvegarde déjà prise (`sauvegardes/2026-09-07-14-30-17`).
3. **Vérifier en prod** : solde affiché en drops, une action débite le bon
   montant et apparaît au relevé, une recharge crédite.
4. Reste cosmétique (non bloquant) : quelques mentions « abonnement / € par
   mois » dans Guide.tsx et Marketing.tsx à revoir.

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

## Ce qui a été fait le 05/09/2026 — vu fonctionner en production

- **La panne du matin est réglée, et ce n'était pas la base.** L'API tombait
  quelques minutes après chaque démarrage, sans journal : un jeton valide de
  Max (localStorage) pointait un id de compte disparu au wipe du 01/09, le
  `findUniqueOrThrow` de la route levait, et Express 4 laisse **pendre** ce
  qu'un handler async lève. `requireAuth` refuse désormais un tel jeton en 401
  (voir le piège dans `CLAUDE.md`). **Max doit se reconnecter une fois** pour
  remplacer son jeton mort. Base jamais touchée.
- **Deux passes vitrine livrées, vues en production** : la bibliothèque passe
  de 21 à 50 thèmes (build-themes.cjs, 40 familles de polices maxi), la vitrine
  gagne un 5ᵉ mode « Boutique » (les 16 jetons du marchand), et VitrineBlock
  gagne un éditeur de textes (accroche/sous-titre/annonce/frais de port, PATCH
  fusionnant) + une bibliothèque filtrable (pastilles par structure, recherche
  nom/secteurs). Constaté sur un compte jetable : édition → base → vitrine.
- **Deux logos de vitrine téléversables** (en-tête + accueil 500 px), PNG ou
  SVG, dédiés et séparés du logo de filigrane. Vu en production : SVG servi
  en `image/svg+xml`, PNG plafonné sans détourage, SVG piégé refusé, les deux
  affichés sur la vitrine, en-tête qui s'enroule sur mobile sans déborder.


- **La vitrine `/b/<slug>` vend.** Refondue sur le modèle d'oguss.fr : héro et
  catégories créées depuis le flux, fiche produit, panier localStorage par
  boutique, 4 modes visiteur `[data-theme]` teintés par l'accent du thème
  marchand, commande postée à `POST /api/public/shops/:shopKey/orders` (prix
  relus côté serveur, `Order.quantity` migré, une ligne par produit, dispo
  vérifiée sur les publications OWN_SITE). **Constaté sur
  `/b/france-robotique`** (3 robots, photo, modes) et **une commande réelle a
  fait l'aller-retour complet** sur une boutique jetable — Order NEW à 39,80 €,
  quantité 2 — jetable détruit ensuite. Banc `node check-vitrine.cjs`.
  À savoir : le port affiché au client (4,90 € sous 79 €) n'est **pas** inclus
  dans `Order.amount` — les lignes portent le prix des produits seuls.
- **FRANCE ROBOTIQUE réparée** : 2 des 3 produits du matin partaient dans la
  mauvaise boutique (présélection `list[0]` = la plus ancienne). Données
  rangées, `ShopPicker` et `PublishTargets` présélectionnent la plus récente.
- **Les tournées de banc sont bornées** : voir le piège du 05/09 dans
  `CLAUDE.md` (fausses analyses déposées dans le compte réel — nettoyées).

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
