# ARCHITECTURE TECHNIQUE & FONCTIONNELLE : AUTO-FULFILLMENT & TRACKING
## Plateforme : drop-shipper.fr

---

## I. CRÉATION DU COMPOSANT CENTRAL : LE GÉNÉRATEUR DE SKU UNIQUE (TABLE DE CORRESPONDANCE)

Pour relier une vente Marketplace (Amazon, eBay, Vinted) au produit d'origine chez le fournisseur, chaque fiche produit importée doit recevoir un identifiant unique standardisé immuable (SKU). Ce SKU doit obligatoirement être poussé dans le champ "SKU Vendeur" lors de la mise en vente.

### Structure du SKU DropShipper IA
Le SKU doit être autogénéré selon un pattern strict permettant d'identifier immédiatement la nature du routage, sans surcharger la base de données :
`DS - [ID_USER] - [ID_PRODUIT_INTERNE] - [CODE_FOURNISSEUR]`

*   **DS** : Préfixe d'identification de votre plateforme (ex: `DS`).
*   **ID_USER** : ID unique de votre utilisateur dans votre base de données (permet de router le log d'erreur ou le débit financier au bon compte).
*   **ID_PRODUIT_INTERNE** : ID unique de la ligne produit dans votre base de données (permet de retrouver le lien d'origine en 1 milliseconde).
*   **CODE_FOURNISSEUR** : Code abrégé pour l'orientation système (ex: `BB` pour BigBuy, `AL` pour AliExpress, `CC` pour CapCut, `AM` pour Amazon, `EXT` pour un sourcing extension tiers).

**Exemple concret :** `DS-4029-77315-BB` (Produit créé par l'utilisateur 4029, ID interne 77315, stocké chez BigBuy).

### Structure des Métadonnées en Base de Données (Schéma NoSQL / SQL requis)
Au moment du scraping par l'extension, la table `products` doit impérativement stocker le payload JSON suivant :
```json
{
  "sku_dropshipper": "DS-4029-77315-BB",
  "user_id": "4029",
  "product_status": "active",
  "supplier_routing": "API", // Options: "API" ou "EXTENSION"
  "supplier_data": {
    "name": "BigBuy",
    "product_id": "1002934",
    "variant_id": "5543",
    "source_url": "https://www.bigbuy.eu/fr/produit-exemple",
    "cost_price_ht": 12.50,
    "shipping_cost_est": 4.90
  },
  "marketplaces_listed": [
    { "platform": "ebay", "listing_id": "EB-992384102" },
    { "platform": "amazon", "listing_id": "ASIN-B07XJ8KL2" }
  ]
}
```

---

## II. ARCHITECTURE DU FLUX TECHNIQUE COMPLET (DU PAYLOAD AU TRACKING)

Le flux de traitement d'une commande automatique se divise en 4 phases asynchrones :

```
[Achat Marketplace] ➔ (Webhook) ➔ [Serveur drop-shipper.fr] ➔ [Débit Portefeuille / Stripe] ➔ [Routage API / Extension] ➔ [Injection Tracking]
```

### Phase 1 : La Capture par Webhook
*   **Amazon (SP-API)** : Votre serveur écoute l'événement de notification globale d'Amazon Web Services (AWS) appelé `ORDER_STATUS_CHANGE`. Dès que le paiement client est validé par Amazon, un webhook sécurisé frappe votre endpoint : `https://api.drop-shipper.fr/v1/webhooks/amazon`.
*   **eBay (Notification API)** : Votre serveur reçoit une notification push signée cryptographiquement sur l'événement de transaction (`FixedPriceTransaction`).

### Phase 2 : Le Traitement Serveur & Débit Financier
Dès réception du payload de la Marketplace, votre script exécute séquentiellement :
1. Extraction du champ `SellerSKU` (Amazon) ou `SKU` (eBay) contenu dans la commande reçue.
2. Interrogation de votre base de données pour faire correspondre ce SKU avec la table de Mapping de l'étape I.
3. Vérification du solde du **Portefeuille Virtuel** de l'utilisateur sur votre site, ou déclenchement d'un appel API Stripe déporté (`stripe.paymentIntents.create`) utilisant le jeton de carte de crédit enregistré en tâche de fond (*Card on File*).
4. Si le solde est insuffisant ou le paiement Stripe échoue, la commande passe au statut `PENDING_PAYMENT_ALERT` et une notification push / email est envoyée à l'utilisateur.

### Phase 3 : Le Routage Logistique (Le choix de l'aiguillage)
*   **Cas A (Fournisseur avec API - ex: BigBuy)** : Votre serveur forge instantanément une requête HTTP POST vers l'API du fournisseur (contenant les coordonnées de livraison nettoyées, l'ID produit du fournisseur et le token d'authentification). La commande est créée et payée instantanément.
*   **Cas B (Fournisseur sans API - ex: site tiers / Vinted / Leboncoin)** : La commande passe au statut `WAITING_EXTENSION`. Elle est placée dans une file d'attente logicielle (Queue) accessible par l'agent ou l'extension de l'utilisateur.

### Phase 4 : La Remontée Automatique du Suivi de Livraison (Tracking)
1. **Le "Pooling" ou Webhook Fournisseur** : Votre serveur interroge toutes les heures les API des fournisseurs (ex: `GET /orders/status` chez BigBuy) ou écoute leurs webhooks d'expédition.
2. **La Récupération** : Le serveur capte deux chaînes de texte cruciales : le `tracking_number` (ex: `8G002934102`) et le `carrier_name` (ex: `Colissimo`).
3. **L'injection automatique sur la Marketplace** : Votre système renvoie immédiatement ces informations à la marketplace d'origine pour rassurer le client final et valider les critères de performance vendeur :
    *   **Sur Amazon** : Requête POST sur l'endpoint `/orders/v0/orders/{orderId}/shipmentConfirmation` avec le code transporteur et le numéro de suivi.
    *   **Sur eBay** : Appel à la méthode `createShippingFulfillment` de la Fulfillment API d'eBay.

---

## III. AUTOMATISATION VIA L'EXTENSION CHROME (RPA & SEMI-AUTOMATIQUE)

Pour les commandes de la catégorie "Fournisseur sans API", votre extension Google Chrome doit agir comme un robot de processus automatisé (RPA).

### Parcours Utilisateur Optimisé (Semi-Automatique classique)
1. L'utilisateur ouvre son tableau de bord sur `drop-shipper.fr`.
2. Il voit une commande en attente provenant d'eBay (ex: une veste achetée par un client).
3. Il clique sur un gros bouton vert : **"Traiter la commande en 1 clic"**.
4. L'extension Chrome ouvre un nouvel onglet masqué ou visible en arrière-plan, navigue directement sur la fiche produit du fournisseur d'origine, sélectionne la bonne taille/couleur, ajoute au panier, passe à la page de livraison, remplit automatiquement tous les champs avec l'adresse du client récupérée depuis eBay.
5. L'extension s'arrête sur l'écran final de paiement du fournisseur et affiche une notification : *"Saisie automatique terminée. Veuillez valider le paiement pour expédier le colis."*

---

## IV. CONFIGURATION & PROMPT DE L'AGENT IA NAVIGATEUR (POUR LE ROBOT IA)

Si vous intégrez un agent IA capable d'utiliser l'extension pour exécuter des scripts de navigation dynamiques complexes (comme la résolution de cas particuliers ou la recherche d'alternatives de stock), vous devez instancier son fichier de configuration système (System Prompt) avec une rigueur absolue.

### Prompt Système de l'Agent de Navigation (À copier-coller dans votre moteur d'agent)
```text
[ROLE SYSTEME - AGENT DE NAVIGATION DROP-SHIPPER IA]
Tu es un agent d'automatisation de navigateur web (RPA basé sur l'IA) intégré à l'extension Google Chrome de drop-shipper.fr. Ton unique mission est d'exécuter des actions d'achat en ligne pour le compte de nos utilisateurs en acheminant les coordonnées de leurs clients vers le panier des sites fournisseurs.

[DIRECTIVES CRUCIALES DE SÉCURITÉ ET DE FIABILITÉ]
1. EXECUTION COMPORTEMENTALE : Tu dois interagir avec le Document Object Model (DOM) de manière humaine. Attends des délais aléatoires (entre 400ms et 1200ms) entre les clics et les saisies de texte pour éviter les déclenchements de blocs anti-bots (Cloudflare, PerimeterX).
2. STABILITÉ DES SESSIONS : Tu opères uniquement à l'intérieur de la session de navigation active de l'utilisateur. Tu as interdiction absolue de tenter de te déconnecter d'un compte fournisseur existant. Si une mire de connexion (Login) apparaît et que les identifiants ne sont pas pré-remplis dans le trousseau de l'extension, interromps immédiatement la tâche et remonte l'erreur code : ERR_SUPPLIER_LOGIN_REQUIRED.
3. CONTRÔLE DES DONNÉES FINANCIÈRES : Tu as l'autorisation stricte de remplir les formulaires de texte de livraison (Nom, Prénom, Adresse, Code Postal, Ville, Téléphone). Tu as INTERDICTION STRICTE de manipuler, lire, stocker ou copier des numéros de carte bancaire, CVV ou codes de sécurité, sauf instruction explicite d'injection cryptée provenant du serveur sécurisé drop-shipper.fr.
4. GESTION DES ERREURS DE VARIANTES : Avant d'ajouter au panier, compare rigoureusement les métadonnées de la variante demandée (ex: "Taille M", "Couleur: Noir") avec les options sélectionnables sur la page du fournisseur. Si la variante est en rupture de stock ou introuvable, arrête-toi et envoie le statut d'erreur : ERR_SUPPLIER_STOCK_OUT.
```

---

## V. STRATÉGIE INFRASTRUCTURE : L'APPLI DESKTOP VS EXTENSION CHROME

C’est le point pivot de votre réflexion stratégique. Vous soulevez une problématique majeure : **la persistance des sessions et le confort utilisateur.**

### Tableau Comparatif des Deux Approches

| Critères d'Évaluation | Approche Extension Chrome Standard | Approche Application Desktop Dédiée (Electron / Puppeteer) |
| :--- | :--- | :--- |
| **Persistance des Sessions** | 🔴 **Faible** : Si l'utilisateur nettoie son cache, ferme son navigateur ou change d'ordinateur, les connexions sautent. | 🟢 **Maximale** : Le logiciel stocke son propre dossier de profil de session isolé, qui reste ouvert indéfiniment. |
| **Exécution en arrière-plan** | 🔴 **Contrainte** : Le navigateur de l'ordinateur de l'utilisateur doit obligatoirement être allumé et actif. | 🟢 **Totale** : L'application s'exécute de manière invisible en tâche de fond comme un service système (systray). |
| **Complexité de Développement** | 🟢 **Simple** : Code JavaScript standard injecté dans les pages (Content Scripts), déploiement facile via le Web Store. | 🔴 **Élevée** : Il faut packager une application (Electron.js), gérer les mises à jour et les signatures d'exécutables (Windows/Mac). |
| **Contournement Anti-Bot** | 🔴 **Moyen** : Chrome applique des restrictions de sécurité strictes sur les extensions (Manifest V3). | 🟢 **Excellent** : Vous contrôlez l'instance de navigation interne (ex: Playwright stealth) pour simuler de vrais profils matériels. |

### La Recommandation Stratégique pour drop-shipper.fr

**Oui, vous avez totalement intérêt à concevoir une application Desktop dédiée (ou un compagnon Desktop) à terme, mais de façon hybride.**

Pour lancer la fonctionnalité d'auto-fulfillment le plus rapidement possible sans vous épuiser dans des mois de développement logiciel complexe, suivez cette trajectoire en deux temps :

*   **MVP (Étape Courte Terme - Extension Améliorée) :** Vous conservez l'extension Chrome mais vous ajoutez un système de **"Stockage des Sessions de Cookies"** cryptés ou une page de configuration dans votre outil où l'utilisateur déclare ses comptes. Tant que son navigateur est ouvert, l'extension travaille. C'est idéal pour valider le marché et prouver l'efficacité de l'algorithme de mapping de SKU auprès de vos premiers clients.
*   **V2 (Étape Long Terme - L'Application Desktop drop-shipper.fr) :** Vous développez une application Desktop légère basée sur **Electron.js** ou **Tauri**. Cette application embarque un navigateur Chromium configuré en mode "Stealth". L'utilisateur s'y connecte une seule fois à ses différents comptes (Amazon, Vinted, AliExpress, eBay). L'application tourne discrètement en tâche de fond dans la barre des tâches de son ordinateur, télécharge les commandes depuis votre serveur web central via WebSockets et exécute les achats de manière 100 % autonome durant la nuit ou la journée sans déranger l'utilisateur.

---
*Ce document technique sert de base d'architecture pour vos équipes de développement afin d'implémenter les modules de traitement automatisé des commandes.*
