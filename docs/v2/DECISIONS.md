# Écosystème V2 — ce qu'on retient des deux mémos, et ce qui change

Les deux mémos de Max (`memo-auto-fulfillment.md`, `memo-final-ecosysteme.md`,
29/09/2026) décrivent la V2 : Cloud + application desktop + application mobile +
extension, auto-fulfillment, imports en masse, publication automatique. Ce
fichier dit comment ils s'appliquent **à notre code réel**. À lire avant tout
travail V2 ; les mémos restent la vision, ce fichier fait foi pour l'exécution.

## Déjà en place (ne pas refaire)

- Commande fournisseur par API avec trois garde-fous (`services/supplierOrders.ts`) :
  une commande par vente (`Order.supplierOrderId` = verrou), aucune variante
  devinée, plafond de prix. Relevé du suivi fournisseur (`releverSuiviFournisseur`).
- Champs de mapping sur `Product` (fournisseur, `supplierRef`, adresse source,
  prix d'achat) et `Order` (variante, suivi, transporteur, coût réel).
- SKU vendeur `DSP-…` déjà publié sur Shopify et les neuf boutiques.
- File « lien partagé » mobile → desktop (`SharedLink`, `routes/agent.ts`,
  migration `20260928120000_shared_link`, **pas encore appliquée**).
- Réécriture en lot à moitié prix (API Batch) : c'est ce qui rend les imports
  massifs rentables.

## Livré le 29/09/2026

- **API Link mobile** (`routes/mobile.ts`, banc `check-api-mobile.ts`) : le contrat
  de l'app compagnon, sous `https://api.drop-shipper.fr/api/mobile`. Fiche
  `api-link-mobile.md`, configuration `dropshipper-api.config.json`.
- **Garde-fou de perte** (`gardePerte`, supplierOrders.ts, banc
  `check-garde-perte.ts`) : `FLAGGED_PRICE_ERROR` écrit sur la commande.
- **Capture des ventes Shopify + renvoi du suivi** (`ventesMarketplaces.ts`,
  banc `check-ventes-shopify.ts`, tournée toutes les 15 min) : vente retrouvée
  par son UGS (la plus longue correspondance), payées seulement, idempotent,
  suivi renvoyé une fois (`Order.suiviTransmisAt` / `suiviTransmisErreur`).
  Exige `read_orders` et `write_merchant_managed_fulfillment_orders` sur l'app
  Shopify du vendeur.
- **Moteur multi-canal** (même jour) : `Canal` = relevé + suivi + motif ; eBay
  (Fulfillment API, portée `sell.fulfillment`) et les 41 enseignes Mirakl
  (commandes `SHIPPING`, suivi OR23 puis expédition OR24, commandes à accepter
  signalées). État de chaque relève sur la liaison (`PlatformCredential.ventes*`),
  affiché dans Commandes avec « Relever maintenant ». **Toutes les autres
  plateformes** : import de l'export CSV de commandes (`importCommandes.ts`,
  colonnes reconnues en 5 langues, idempotent). Banc `check-ventes-canaux.ts`.
  Prochains adaptateurs, même forme : Kaufland, les 9 boutiques tierces, puis
  les canaux à session (Vinted, Leboncoin, Facebook) par l'application desktop.

## Livré le 30/09/2026

- **Kaufland** (`f10ad4b`) : unités `need_to_be_sent` regroupées par commande et
  par référence, suivi `PATCH /order-units/{id}/send` par unité ; `id_offer` =
  `produit.id` posé au dépôt, les anciennes unités retrouvées par EAN
  (`EAN:<code>` dans `produitDeLUgs`, refusé si deux produits portent le même).
- **Les 9 boutiques tierces** : WooCommerce (`0d94c3c`, `processing`, suivi en
  note client puis `completed`), Magento (`d9acb65`, `/order/{id}/ship`),
  PrestaShop (`77d3281`, JSON, `order_carriers` puis état 4 « Expédié »),
  BigCommerce, Wix, Shopware, Ecwid, Squarespace, Drupal Commerce (`bff5e31`).
  **Drupal : pas de renvoi du suivi** (Commerce n'a pas de suivi de colis en
  standard). Tous éprouvés contre de faux serveurs (`check-ventes-canaux.ts`),
  **aucun contre une vraie boutique**.
- **Version Shopify `1.2-commandes` publiée et active** (portées `read_orders`,
  `write_merchant_managed_fulfillment_orders`) : constaté dans le Dev Dashboard.
  Les marchands déjà installés doivent ré-accepter les portées.
- **Application desktop** (`desktop/`) : socle Electron (clé d'API chiffrée,
  file de liens, sessions persistantes, surveillance des blocages) et garde-fous
  du mode automatique (accord daté, plafonds durs, espacement fixe, arrêt au
  premier captcha, journal) — banc `desktop/check-desktop.cjs`. **Pas encore
  lancé sous Electron, et l'exécuteur de publication n'est pas écrit.**
- **Nuit du 30/09 (desktop 0.2.0)** : exécuteur écrit ; Facebook Marketplace relevé
  sur la vraie page (champs par libellé, catégorie et état choisis dans les listes
  lues sur la page — jamais de liste en dur, jamais de catégorie au hasard) ; vraie
  fenêtre Electron essayée (`check-fenetre.cjs`) ; gagnants filtrés par marge et
  rayons au choix du vendeur ; « Connecter mon compte eBay » par OAuth avec NOTRE
  application eBay (clés dans l'environnement, jamais dans la ligne du vendeur).
  Vinted / Leboncoin : catégorie toujours à relever sur session connectée.

## Ce qu'on adopte

- **Inbox mobile** : `POST /v1/mobile/inbox { source_url }` → branchée sur `SharedLink`.
- **Synchro desktop** par WebSocket (ou SSE) sur la file de travail.
- **Maximum Loss Guard** : marge négative (achat + port > vente) → commande
  bloquée `FLAGGED_PRICE_ERROR` + notification. S'ajoute au plafond existant.
- **Sessions persistantes** dans le profil local de l'application desktop
  (`userDataDir`) : Vinted, Leboncoin, Facebook, fournisseurs.
- **Imports en masse** par le navigateur de l'application, rythme normal ;
  catalogues à API (CJ, BigBuy) dès qu'on parle de milliers de produits.
- **Mode automatique de publication** sur accord explicite du vendeur
  (décision de Max, voir CLAUDE.md) : plafonds et espacement par plateforme,
  arrêt au premier captcha ou blocage, journal.

## Ce qui change par rapport aux mémos

| Mémo | Ce qu'on fait | Pourquoi |
|---|---|---|
| SKU `DS-[USER_ID]-[CODE]-[ID]-[VARIANTE]` | `DS-<code>-<id court>[-<variante>]`, colonne `Product.dropshipperSku` unique ; les `DSP-…` déjà publiés restent reconnus | Nos identifiants sont des cuid de 25 caractères : Amazon limite le SKU à 40, eBay à 50. Et l'id du compte n'a rien à faire dans une donnée visible des acheteurs. |
| Nouveau `model Product` | Colonnes ajoutées au `Product` existant | Le modèle existe et porte déjà l'essentiel. |
| Portefeuille Stripe qui paie les fournisseurs | Le fournisseur débite le compte du vendeur (solde BigBuy/CJ approvisionné par lui) ; nous ne facturons que les drops | Encaisser pour régler des tiers relève du statut d'établissement de paiement. |
| Tauri (Rust) | **Electron** conseillé ; Tauri possible avec un processus Node pour Playwright | Notre pile est Node ; Electron embarque Chromium et Playwright sans passerelle. |
| « Fingerprint obfuscation », souris non linéaire, frappe aléatoire, User-Agent maquillé, cron à hasard « anti-bot » | **Non.** Navigateur normal, vraie session, intervalles fixes raisonnables, arrêt au captcha | Limite de Claude : pas d'outil d'évasion de détection. Et un outil repéré comme tel peut faire bannir tous nos vendeurs d'un coup. |
| Suppression des watermarks des vidéos téléchargées | **Non.** Nettoyage des métadonnées oui, retrait de filigranes tiers non | Retirer la marque d'un autre (TikTok, fournisseur) touche au droit d'auteur. |
| Amazon SP-API dès le départ | Après : compte vendeur Amazon requis | Commencer par ce qui est branché : DropShop, Shopify, eBay, Mirakl, WooCommerce… |

## Ordre de travail proposé (une session par lot)

1. **Socle** : pousser la fusion du cloud (appliquer la migration `SharedLink`
   après sauvegarde), visuels de l'accueil.
2. **API Link** : appairage d'appareil (QR code → jeton par appareil),
   `/v1/mobile/inbox`, file de travail, synchro. Contrat à caler sur l'app mobile
   existante (dépôt ou liste d'écrans à fournir par Max).
3. **Auto-fulfillment serveur** : `dropshipperSku`, capture des ventes
   (webhooks / relevés), Loss Guard, statuts, retour du suivi aux marketplaces.
4. **Application desktop Electron** : profil persistant, file de travail,
   imports en masse, préparation des commandes fournisseurs (arrêt au paiement),
   publication Vinted / Leboncoin / Facebook (validation ou mode automatique).
