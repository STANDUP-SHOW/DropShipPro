# Dossier de soumission au Shopify App Store — état au 16/09/2026 (soir)

Ce document est le dossier lui-même : ce que Shopify exige (relevé à la source,
avec les numéros de leurs exigences), où nous en sommes sur chaque point, les
chantiers qui restent avec leur ordre, et les textes de la fiche prêts à coller.
Il complète `docs/shopify-app.md` (l'histoire, les décisions) et le remplace
pour tout ce qui concerne la soumission.

Sources lues le 16/09/2026 : *App Store requirements*, *Best practices for apps
in the Shopify App Store*, *Privacy law compliance*, *Access tokens* —
shopify.dev, en anglais. Les citations sont traduites, les numéros sont les
leurs.

---

## 1. Ce qui est prouvé

Le circuit complet de l'app publique marche, constaté sur la boutique de
développement `auto-parts-o8avomvl.myshopify.com` (org Dev Dashboard
236010842) : lien d'installation → page d'accord Shopify → retour OAuth →
liaison en base (jeton expirant + refresh token, renouvelés tout seuls) → page
DropShipper IA intégrée dans l'admin (« Boutique reliée ») → publication réelle
d'une fiche à 11 variantes, **Actif** dans Produits.

Ce que les exigences demandent et que le code fait déjà :

| Exigence | Ce qu'elle dit | État |
|---|---|---|
| 1.1.1 | L'app intégrée s'authentifie par jetons de session, sans cookie tiers ni localStorage, y compris en navigation privée | **Fait** — la page intégrée demande `shopify.idToken()` à App Bridge et l'envoie à `/api/shopify/embed/etat` ; rien n'est stocké côté navigateur |
| 2.2.3 | App Bridge dernière version, `app-bridge.js` chargé avant tout autre script | **Fait** (`shopifyEmbed.ts`) |
| 2.2.4 | GraphQL Admin API uniquement, jamais REST | **Fait** (`services/shopify.ts`) |
| 2.3.2 / 2.3.4 | OAuth immédiat, y compris à la réinstallation | **Fait** pour le lien d'installation ; voir 2.3.1 ci-dessous pour le départ depuis Shopify |
| 3.1 | TLS valide | **Fait** (api.drop-shipper.fr, www.drop-shipper.fr) |
| 3.2 | Ne demander que les portées nécessaires | **Fait** : `read/write_products`, `read/write_publications`, toutes justifiables (créer la fiche, la publier sur le canal Boutique en ligne) |
| Webhooks de conformité | « Toute app distribuée par l'App Store doit répondre aux demandes RGPD, qu'elle collecte des données personnelles ou non » ; les trois sujets doivent être **souscrits et vérifiés avant la soumission** | **Code fait** (`routes/shopifyApp.ts`, signature sur les octets bruts, réponse 200 immédiate, `shop/redact` efface la liaison). **Déclaration à publier** : voir § 2.1 |
| 4.1 | Nom unique, mené par la marque, ≤ 30 caractères, identique dans la config et la fiche | **Fait** : « DropShipper IA » (14 caractères) |
| Jetons | Les apps publiques doivent utiliser des jetons offline **expirants** | **Fait** le 16/09 (commit 624bebd) |

---

## 2. Ce qui reste, dans l'ordre

### 2.1 Déclarer les webhooks RGPD — une commande, mais avec le compte de Max

Le formulaire « Créer une version » du Dev Dashboard **n'a aucun champ** pour
les webhooks de conformité (constaté : il ne propose que nom, portées, URL,
version d'API des webhooks, POS, proxy). Shopify renvoie au CLI et au fichier
`shopify.app.toml`. Le fichier est écrit : `shopify-app/shopify.app.toml`. Il
reprend la version active à l'identique et n'ajoute que les abonnements.

Ce qu'il reste à faire, et qui demande la session Shopify de Max :

```bash
cd shopify-app && shopify app deploy --no-release
```

Le CLI ouvre une page de connexion Shopify (compte de Max), crée une version
sans l'activer ; on la relit dans le Dev Dashboard › Versions, puis on
l'active. Ensuite, contrôle : dans l'admin d'auto-parts, désinstaller
DropShipper IA et vérifier dans les journaux Railway `app/uninstalled … liaison(s)
éteinte(s)`, puis réinstaller. Le CLI est installé sur la machine (4.8.0).

### 2.2 La facturation — LE point bloquant, et il est bien écrit noir sur blanc

Exigence **1.2.1**, texte exact : « *Apps that use off-platform billing cannot
be distributed through the Shopify App Store. Your app must use Shopify App
Pricing or the Shopify Billing API for any app charges.* » Et **1.2.2** : les
charges doivent pouvoir être acceptées, refusées, et redemandées à la
réinstallation. **1.2.3** : changement de forfait sans passer par le support ni
réinstaller.

Le champ « lien vers une page décrivant les frais facturés hors du système de
facturation Shopify » existe bien dans la fiche, mais il sert aux frais qui ne
sont **pas des frais d'app** (marchandise, frais d'un tiers). Il ne dispense
pas de la Billing API pour ce que l'app vend. La correction du 16/09 dans
`docs/shopify-app.md` était donc trop optimiste ; elle est corrigée.

Ce que ça veut dire pour nous : un marchand qui installe depuis l'App Store
doit pouvoir acheter ses drops **dans Shopify**, et c'est Shopify qui encaisse
(commission 0 % jusqu'à 1 M$ de revenus annuels sur le Partner program actuel —
à revérifier au moment de signer). Notre modèle s'y prête bien :

- **Recharges de drops** = `appPurchaseOneTimeCreate` (achat unique), un par
  pack de `PACKS_DROPS` (500 drops / 5 € … 20 000 / 150 €). Le marchand
  confirme sur la page Shopify, revient sur `returnUrl`, et **c'est cette page
  qui confirme** — le piège Stripe du mémo (`return_url` sans confirmation =
  argent encaissé, crédits jamais versés) vaut mot pour mot.
- **Abonnements** (chefs de rayon, AUTO-SHIPPER) = `appSubscriptionCreate`,
  seulement si on veut les vendre aux marchands Shopify ; sinon, la fiche les
  passe sous silence et ils restent sur le site.
- **Fiche** : « Gratuite à installer » + « Frais supplémentaires : recharges
  de drops à partir de 5 € », tout dans le bloc Tarifs, jamais dans les images
  (4.2.2) ni ailleurs (4.2.3).

Le compte Shopify d'un marchand qui paie chez Shopify et le compte DropShipper
(drops) sont réconciliés par la liaison `PlatformCredential` : l'achat crédite
le compte auquel la boutique est reliée. Banc à écrire contre un faux serveur
GraphQL (contrat en dur : `appPurchaseOneTimeCreate` rend `confirmationUrl`,
puis `currentAppInstallation.oneTimePurchases` rend `status: ACTIVE`).

**FAIT le 16/09/2026 au soir** (commit e9056ac, `services/shopifyBilling.ts`,
banc `check-shopify-billing.ts`) et **constaté sur auto-parts** : la page
intégrée propose les six packs, l'achat s'ouvre chez Shopify (page « Approuver
le montant facturé », bandeau « montant de test, ne vous sera pas facturé »),
l'approbation renvoie sur la page de l'app avec `?achat=ok`, et le solde est
passé de 49 850 à 50 350 drops — un `Payment` sous la clé
`gid://shopify/AppPurchaseOneTime/…` et une ligne de relevé « Recharge de 500
drops (Shopify) ». Rechargé deux fois depuis : crédité une seule fois.

Ce qui reste sur ce point pour la fiche : le bloc Tarifs (« Gratuite à
installer » + frais supplémentaires), et 1.2.3 ne nous concerne pas (aucun
forfait à changer). Les abonnements (chefs de rayon, AUTO-SHIPPER) restent
sur le site et hors fiche.

### 2.3 L'installation doit PARTIR de Shopify

Exigence **2.3.1** : « *Your app must not request the manual entry of a
myshopify.com URL or a shop's domain during the installation or configuration
flow.* » Aujourd'hui le vendeur tape son adresse dans Réglages › Shopify. C'est
accepté pour un lien direct, pas pour l'App Store : là, le marchand clique
« Installer » sur la fiche, Shopify ouvre notre `application_url` avec `shop=…`,
et **c'est nous qui devons lancer OAuth** (2.3.2), puis revenir **dans l'admin,
sur la page de l'app** (2.3.3) — pas sur www.drop-shipper.fr.

Ce qui manque :

1. `GET /api/shopify/app` avec une boutique **non reliée** → rediriger vers
   `/admin/oauth/authorize` (aujourd'hui la page s'affiche avec « pas encore
   relié »). L'état signé porte le compte DropShipper ; ici il n'y en a pas
   encore. Deux voies : l'état porte `shop` seul, et au retour on **crée ou
   rattache** un compte (email du propriétaire de la boutique, lu par `shop {
   email }` avec le jeton tout neuf — c'est pour ça que « Consulter les
   données des employés › Propriétaire de la boutique » est dans l'accord) ; ou
   la page intégrée demande d'abord de se connecter à DropShipper. La
   première est celle que les exigences décrivent (« *Merchants should not be
   able to interact with the UI before OAuth* »).
2. Le retour d'installation redirige vers
   `https://admin.shopify.com/store/<boutique>/apps/dropshipper-ia` quand
   l'installation vient de Shopify (le `retour` signé sait d'où elle vient).
3. Le bouton « Ouvrir DropShipper IA » de la page intégrée ouvre le site dans
   un nouvel onglet, **connecté** (jeton de session Shopify → jeton DropShipper),
   pour que le marchand n'ait pas à créer un mot de passe. Voir 2.4.

**Estimation : une demi-journée**, banc `check-shopify-app.ts` étendu (état
sans compte, rattachement par email, refus si l'email est déjà pris et non
vérifié — même règle que la connexion Google).

### 2.4 L'expérience « intégrée » — le risque de l'examen

Exigence **2.2.2** : « *any off-platform features are integrated directly
within the Shopify Admin* ». Notre page intégrée montre l'état et trois
boutons ; tout le travail se fait sur www.drop-shipper.fr. Channable, AutoDS
ou Lengow sont référencées avec un tableau de bord externe, mais leur page
intégrée fait plus qu'un tableau de chiffres. Deux niveaux :

- **Minimum crédible** (une journée) : la page intégrée liste les annonces du
  catalogue publiables, avec « Publier sur cette boutique » et l'état de chaque
  publication — le geste central de l'app fait DANS l'admin, par App Bridge
  (jeton de session → nos routes). Plus « Acheter des drops » (§ 2.2).
- **Complet** (plusieurs jours) : le site entier chargé dans l'iframe. À ne
  pas faire avant que l'examen le demande.

### 2.5 La catégorie et l'exigence 5.5

Shopify classe les apps ; **5.5 Product sourcing** s'applique à « une app qui
permet aux marchands de s'approvisionner chez des fournisseurs externes et
d'exécuter les commandes ». Elle exige : la demande d'exécution par
`fulfillmentOrderSubmitFulfillmentRequest` (5.5.1), **le coût d'achat dans le
champ Cost de la fiche** (5.5.2), une passerelle PCI pour la marchandise vendue
au marchand (5.5.3).

Position conseillée : nous ne vendons pas de marchandise au marchand et
n'exécutons pas ses commandes — nous importons, réécrivons, illustrons et
publions sur 314 canaux, Shopify en étant un. Catégorie « Vendre des produits ›
Multicanal » (comme Channable), pas « Sourcing ». Mais 5.5.2 est bon à faire
quoi qu'il arrive et coûte une heure : `inventoryItem.cost = prix fournisseur`
dans `productVariantsBulkUpdate` — le marchand voit sa marge dans Shopify.
Si l'examinateur reclasse en sourcing, 5.5.1 devient un chantier (une
journée) ; 5.5.3 ne nous concerne pas.

### 2.6 La fiche et ses fichiers

| Élément | Contrainte | Qui |
|---|---|---|
| Icône | 1200 × 1200, PNG/JPG, sans texte ni capture ni marque Shopify, coins arrondis automatiquement | À dessiner (kit `docs/youtube/` : HTML rendu en PNG) |
| Image de présentation | 1600 × 900, un seul point focal, fond uni, contraste 4,5:1, texte alternatif, **aucun prix** | À dessiner |
| Captures | 3 à 6, 1600 × 900, au moins une de l'interface de l'app, sans chrome de navigateur, sans données personnelles, sans prix, sans avis | À prendre sur auto-parts et sur le site |
| Vidéo | Facultative, 2–3 min, promotionnelle, ≤ 25 % de captures d'écran | Plus tard |
| Boutique de démonstration | Lien direct vers la page qui montre le mieux l'app | `auto-parts-o8avomvl.myshopify.com` — à garnir de 20 fiches propres |
| Politique de confidentialité | Obligatoire, lien vers une page dédiée | `https://www.drop-shipper.fr/confidentialite` (publique, déjà utilisée par le Chrome Web Store) |
| Tarifs détaillés | Lien vers une page dédiée (pas une page marketing) | À créer, publique : `/tarifs` — grille de `services/tarifs.ts`, même règle que `llms.txt` : recopie datée, commentaire croisé |
| Screencast d'examen | Obligatoire (4.5.3) : installation, onboarding, chaque fonction de la fiche, en anglais ou sous-titré, avec l'issue attendue de chaque cas | À enregistrer une fois 2.2–2.4 faits |
| Identifiants de test | Un compte DropShipper de test avec des drops, si l'examinateur doit publier | À créer |
| Contact d'urgence développeur | À jour dans le Partner Dashboard | Max |
| Critères d'éligibilité (4.3) | Canal Boutique en ligne requis ; pays : tous ; devise : toutes | Formulaire |

---

## 3. Les textes de la fiche

Écrits en français ; Shopify traduit automatiquement une fiche anglaise vers le
français, pas l'inverse — la fiche **primaire doit être en anglais** pour
toucher les autres marchés (conversion ×4 hors marché anglophone, dit Shopify).
Les deux versions sont là. Longueurs vérifiées.

**Nom** (≤ 30) : `DropShipper IA`

**Sous-titre de carte** (bénéfice, pas fonction) :
- FR : « Importez, réécrivez et publiez vos produits sur 314 canaux »
- EN : « Import, rewrite and publish your products across 314 channels »

**Introduction** (≤ 100 caractères, un bénéfice mesurable, phrase complète) :
- FR : « Une fiche fournisseur devient une annonce prête à vendre, publiée sur Shopify et 313 autres canaux. » (99)
- EN : « Turn any supplier page into a ready-to-sell listing, published to Shopify and 313 other channels. » (97)

**Description** (≤ 500 caractères, fonctionnel, sans superlatif) :
- FR : « Collez l'adresse d'un produit chez n'importe quel fournisseur, ou relevez-le depuis votre navigateur avec l'extension. L'IA réécrit le titre, la description, les attributs et les mots-clés ; vos photos reçoivent votre filigrane ; la catégorie Shopify est choisie pour vous. Publiez la fiche, avec ses variantes et son prix, sur votre boutique et sur les places de marché, comparateurs et réseaux sociaux reliés. Le prix d'achat est ramené en euros et la marge calculée avant de publier. » (486)
- EN : « Paste a product URL from any supplier, or capture it from your browser with the extension. AI rewrites the title, description, attributes and keywords; your photos get your watermark; the Shopify category is picked for you. Publish the listing, with its variants and price, to your store and to the connected marketplaces, comparison engines and social shops. Purchase prices are converted to your currency and the margin is computed before you publish. » (453)

**Fonctionnalités** (≤ 80 caractères chacune, ce que ça fait, pas comment) :
1. FR « Import d'une fiche fournisseur en un clic, depuis l'adresse ou le navigateur » / EN « One-click import of a supplier page, from its URL or your browser »
2. FR « Réécriture par l'IA : titre, description, attributs, mots-clés » / EN « AI rewriting: title, description, attributes, keywords »
3. FR « Filigrane automatique sur toutes les photos » / EN « Automatic watermark on every photo »
4. FR « Catégorie Shopify et variantes créées avec la fiche » / EN « Shopify category and variants created with the listing »
5. FR « Publication sur Shopify et 313 autres canaux depuis la même fiche » / EN « Publish to Shopify and 313 other channels from the same listing »
6. FR « Marge calculée avant de publier, prix d'achat converti en euros » / EN « Margin computed before publishing, purchase price converted »

**Intégrations** (≤ 6, sans Shopify ni autres apps Shopify) : AliExpress, CJ
Dropshipping, BigBuy, eBay, Google Shopping, Meta (Facebook & Instagram).

**Termes de recherche** (≤ 5, mots entiers, une idée par terme) : dropshipping,
product import, AI product description, multichannel listing, watermark.

**Tarifs** (bloc dédié, une fois la Billing API en place) :
- Méthode : « Gratuite à installer ».
- Frais supplémentaires : « Recharges de drops, la monnaie des actions (import,
  réécriture, image) : à partir de 5 € les 500 drops. 120 drops offerts à
  l'inscription. » — les montants exacts sont ceux de `PACKS_DROPS`.
- Lien « tarifs détaillés » → `/tarifs`.
- Le lien « frais hors Shopify » reste **vide** : rien de ce que l'app vend ne
  passe ailleurs.

**Langues de l'interface** : français (l'anglais est à déclarer seulement
quand l'interface le parle).

---

## 4. Ce que Max fait lui-même

1. `cd shopify-app && shopify app deploy --no-release`, se connecter dans la
   page que le CLI ouvre, puis activer la version dans le Dev Dashboard (§ 2.1).
2. Charger l'icône dans Dev Dashboard › Paramètres de l'appli (une fois dessinée).
3. Remplir la fiche : Dev Dashboard › Distribution › « Gérer la liste du
   Shopify App Store » — les textes du § 3, les fichiers du § 2.6.
4. Vérifier le contact d'urgence développeur dans le Partner Dashboard.
5. Soumettre — seulement quand § 2.1 à 2.4 sont faits et le screencast enregistré.

## 5. Ordre proposé

1. § 2.1 webhooks (une commande) — **maintenant**.
2. § 2.2 Billing API (une journée) — sans elle, la soumission est refusée.
3. § 2.3 installation depuis Shopify (une demi-journée).
4. § 2.5 coût d'achat dans Shopify (une heure) + page `/tarifs` (une heure).
5. § 2.4 page intégrée « minimum crédible » (une journée).
6. Fichiers de la fiche, boutique de démo, screencast, soumission.
7. Pendant l'examen (souvent 1 à 3 semaines, avec allers-retours) : plusieurs
   boutiques Shopify par compte — sans quoi Max lui-même ne peut pas relier
   oguss-france ET une boutique de test.
