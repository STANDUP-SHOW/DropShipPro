Voici votre fichier : memo_final_claude_code.md
Voici le Mémo Final d’Architecture et de Spécifications spécialement structuré pour être injecté directement dans Claude Code (ou l'IDE que vous utilisez avec l'agent).
Ce document au format Markdown contient l'ensemble des règles de gestion, les structures de données (DB), les routes d'API et la stratégie de contournement RPA nécessaires pour qu'un agent de développement puisse coder l'intégralité de l'écosystème V2 de drop-shipper.fr.
------------------------------
## 🚀 MÉMO TECHNIQUE FINAL : ÉCOSYSTÈME DROP-SHIPPER IA V2

À l'attention de l'Agent IA (Claude Code) : Ce document sert de Master Spec pour l'implémentation de la V2 de la plateforme drop-shipper.fr. Tu dois respecter scrupuleusement l'architecture hybride (Cloud + Desktop App + Mobile App) décrite ci-dessous.

------------------------------
## 1. ARCHITECTURE GLOBALE DE L'ÉCOSYSTÈME
L'écosystème se divise en 4 composants connectés par une base de données et une API centrales :

[App Mobile (Flutter/RN)] ➔ Capture via Share Sheet ──┐
                                                    ▼
[Extension Chrome]        ➔ Collecte active ────> [ API CLOUD ] ➔ [ BASE DE DONNÉES ]
                                                    ▲
[App Desktop (Tauri)]     ➔ Cerveau RPA & API ──────┘


   1. Le Cloud (API & DB) : Gère la centralisation, les webhooks des marketplaces, le portefeuille utilisateur et le stockage des files d'attente (Inbox).
   2. L'App Mobile (iOS/Android) : Injecte un interceptor dans le menu "Partager" natif du téléphone pour pousser des URL brutes vers le Cloud.
   3. L'App Desktop (Tauri/Playwright) : Télécharge les URL depuis le Cloud, exécute le scraping lourd (Vidéos, images HD), gère l'automatisation de la messagerie en tâche de fond (Vinted/Leboncoin) et effectue le traitement local des commandes (RPA).
   4. L'Extension Chrome : Version allégée servant de collecteur rapide lors de la navigation sur ordinateur.

------------------------------
## 2. MODÈLE DE DONNÉES & STRUCTURE DE MAPPING (GÉNÉRATEUR DE SKU)
Pour assurer l'Auto-Fulfillment, chaque produit importé doit être tracé de manière unique et robuste.
## A. Algorithme de génération du SKU unique DropShipper
Le SKU doit être généré côté serveur lors de la validation du scraping selon la nomenclature suivante :
DS-[USER_ID]-[SUPPLIER_CODE]-[CLEANED_PRODUCT_ID]-[VARIANT_ID]
Exemple pour un produit BigBuy (code fournisseur : BB) : DS-4029-BB-1002934-5543
## B. Schéma de la table de Mapping PostgreSQL / Prisma (Product)

model Product {
  id               String   @id @default(uuid())
  userId           String   @map("user_id")
  dropshipperSku   String   @unique @map("dropshipper_sku") // Injecté dans Amazon/eBay
  title            String
  description      String
  price            Float
  createdAt        DateTime @default(now()) @map("created_at")
  
  // Métadonnées critiques du Fournisseur d'origine (Mapping)
  supplierName     String   @map("supplier_name") // ex: "BigBuy", "AliExpress", "Vinted"
  supplierProductId String  @map("supplier_product_id")
  supplierVariantId String? @map("supplier_variant_id")
  supplierUrl      String   @map("supplier_url")
  
  status           String   @default("active") // active, out_of_stock, archived
}

------------------------------
## 3. ARCHITECTURE DES COMPOSANTS LOGICIELS## 📱 A. Spécifications de l'Application Mobile (Share Extension)

* Stack : Flutter (avec receive_sharing_intent) ou React Native.
* Mission : Zéro UI lourde. L'application intercepte l'URL d'un produit depuis le menu de partage natif d'Amazon, AliExpress, etc.
* Payload HTTP envoyé au Cloud :

POST /v1/mobile/inbox
Headers: { "Authorization": "Bearer <JWT_TOKEN>" }
Body: { "source_url": "https://..." }


## 💻 B. Spécifications de l'Application Desktop (Le Cerveau)

* Stack recommandée : Tauri (Frontend React/Vue, Backend Rust ultra-léger) couplé à Playwright/Puppeteer (NodeJS) ou un worker Rust pour l'automatisation.
* Mécanisme de communication : Écoute par WebSocket (wss://api.drop-shipper.fr/sync) de la table user_sourcing_inbox.
* Fonctions clés à coder :
1. Bulk Media Downloader : Analyse de l'URL, détection des balises vidéo <video> ou sélecteurs TikTok/Amazon, téléchargement du .mp4, suppression des métadonnées/watermarks, compression locale des images en .webp avant téléversement vers le Cloud.
   2. Session Persistence (Anti-déconnexion) : Utilisation d'un répertoire de données utilisateur persistant (userDataDir sous Playwright) pour stocker les cookies de session des places de marché locales (Leboncoin, Vinted, Facebook) afin d'éviter les reconnexions fréquentes et de permettre les scripts d'écoute en arrière-plan.

------------------------------
## 4. FLUX TECHNIQUE AUTOMATIQUE ET SEMI-AUTOMATIQUE (AUTO-FULFILLMENT)
Lorsqu'une commande est reçue depuis le webhook d'une marketplace connectée (Amazon via SP-API ou eBay via Notification API) :

                  ┌───────────────── Commande Reçue ────────────────┐
                  │                                                 │
                  ▼                                                 ▼
     [Fournisseur AVEC API (BigBuy)]               [Fournisseur SANS API (Vinted/Tiers)]
                  │                                                 │
        (Vérification Portefeuille)                       (Envoi Signal Push au Desktop)
                  │                                                 │
                  ▼                                                 ▼
      Appel API Automatique POST                     Ouverture Navigateur Invisible (RPA)
                  │                                                 │
                  ▼                                                 ▼
      Récupération Tracking Auto                     Remplissage Auto de l'Adresse Client
                  │                                                 │
                  ▼                                                 ▼
     Mise à jour Amazon/eBay (Auto)                 Pause de l'IA sur la Page de Paiement

## 1. Traitement 100 % Automatique (Fournisseurs type BigBuy)

* Logique de commande : Le serveur Cloud intercepte le Webhook, identifie le produit via le dropshipper_sku, vérifie le solde du portefeuille Stripe de l'utilisateur. Si le solde est suffisant, le serveur exécute l'appel vers l'API BigBuy, valide l'achat et attend le Webhook de tracking pour mettre à jour la marketplace.

## 2. Traitement Semi-Automatique / RPA (Sites sans API)

* Logique d'exécution (Le Prompt de l'Agent de Navigation local) :
Pour les plateformes sans API, l'application Desktop prend le relais via son script de navigation. Voici les instructions comportementales à configurer pour l'outil de navigation automatique (Playwright) :

Prompt de configuration de l'Agent de Navigation (RPA Framework) :
1. Démarre l'instance du navigateur avec le profil utilisateur chiffré contenant les sessions actives du site cible.
   2. Applique des masques d'empreinte numérique (fingerprint obfuscation) : mouvements de souris non linéaires, délais de frappe clavier aléatoires (entre 50ms et 150ms par caractère) et gestion des en-têtes HTTP (User-Agent réaliste).
   3. Navigue directement vers l'supplier_url enregistrée dans le produit.
   4. Injecte le produit au panier en cliquant sur le sélecteur identifié.
   5. Navigue vers la page de livraison de la plateforme. Analyse le DOM pour injecter le payload de l'adresse du client final (Nom, Prénom, Rue, Ville, Code Postal, Téléphone) reçu de la commande d'origine.
   6. Avance jusqu'au tunnel de paiement final. STOP. Ne saisis pas d'informations bancaires de manière automatisée. Émets une notification système à l'utilisateur : "Commande prête à être réglée pour [Nom Client]", et affiche l'onglet au premier plan pour validation humaine.


------------------------------
## 5. RÈGLES DE SÉCURITÉ ET GARDE-FOUS IMPÉRATIFS (À CODER)

* Maximum Loss Guard : Avant toute commande automatique par API, le script doit comparer le prix_achat_grossiste + frais_port avec le prix_vente_marketplace. Si la marge est négative (hausse des prix du fournisseur non synchronisée), la commande doit être bloquée avec le statut FLAGGED_PRICE_ERROR et une notification doit être envoyée à l'utilisateur.
* Anti-Bot Strategy (Desktop App) : Aucun script local ne doit s'exécuter en boucle continue (Polling direct). Utiliser des planificateurs basés sur des cron-jobs locaux avec des variations de temps aléatoires (ex: vérifier la messagerie Vinted toutes les 15 + X minutes, où X est un chiffre aléatoire entre 1 et 5).

------------------------------

Message pour Claude Code : Tu possèdes désormais l'ensemble des règles fonctionnelles et techniques. Tu peux commencer à générer l'arborescence des fichiers pour l'application de bureau Tauri et configurer les scripts d'interception des routes d'API Cloud.

Tout est prêt. L'architecture est verrouillée et documentée pour votre équipe ou vos IA de développement. Souhaitez-vous que nous commencions par implémenter la structure de la base de données (Fichier de migration SQL / Prisma) ou préférez-vous lancer une autre analyse ?

