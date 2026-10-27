# DropShop Market — la place de marché (drop-shop.cloud)

Décidé le 03/10/2026. Une place de marché « à la Amazon » où tous les clients
DropShipper (boutiques DropShop ou simples dropshippers) publient leurs
produits. Elle sert surtout de **mise en relation** : inscription gratuite,
paiement Stripe, **5 % du prix de vente** pour la plateforme, et un
référencement Google Ads / Google Shopping / comparateurs pensé dès la
structure.

## Pourquoi pas Mirakl

Mirakl est fait pour les grandes enseignes (licence annuelle, intégration de
plusieurs mois, back-office lourd). Max voulait un admin simplifié : le Market
est donc écrit dans l'application, sur ce qui existe déjà — produits,
variantes, publications, commandes — et l'admin tient en une page.

## Comment c'est construit

```
backend/src/services/market.ts        annonces → offres (une par variante), adresses, rayons
backend/src/services/marketFeeds.ts   flux Google Merchant, Meta, comparateurs, Google Ads Editor
backend/src/services/marketPages.ts   pages HTML rendues serveur + schema.org (ProductGroup/Offer)
backend/src/services/marketStripe.ts  Stripe Connect : inscription Express, paiement, confirmation
backend/src/routes/market.ts          pages publiques, /acheter, /merci, sitemap, robots, /flux/*
backend/src/routes/marketApi.ts       /api/market/vendeur (espace vendeur) et /api/market/admin
frontend/src/pages/DropShopMarket.tsx l'écran vendeur + l'admin (compte admin seulement)
backend/check-market.ts               le banc (offres, flux, pages, commission), sans base ni Stripe
```

**Publier** = choisir la destination « DropShop Market » (plateforme
`DROPSHOP_MARKET`), comme n'importe quel canal. La publication passe PUBLISHED
immédiatement ; l'annonce est en ligne et dans les flux dans l'heure (cache).

**Une variante = une offre = une page = un article de flux.** Les combinaisons
(`Product.combinations`) deviennent chacune une offre avec son prix (marge du
vendeur reportée, `prixDeVenteDe`), sa photo, sa disponibilité et sa page :

```
/p/<id>/<titre>                    la fiche (ProductGroup schema.org, toutes les variantes)
/p/<id>/<titre>/<valeurs>-<clé>    la variante (sa canonique, son prix, son bouton d'achat)
```

La clé (8 hexa) est un hachage du combo : stable d'un relevé à l'autre, tant
que les valeurs ne changent pas. Un titre réécrit redirige en 301.

## Les flux (à coller une fois)

| Adresse | Pour |
|---|---|
| `/flux/google.xml` | Google Merchant Center : une entrée par variante, `item_group_id`, `color`/`size`/`material`/`pattern`, livraison 0 €, `custom_label_0..4` (vendeur, tranche de prix, rayon, tranche de marge, variante/simple) pour découper Shopping / Performance Max |
| `/flux/meta.csv` | Catalogue Meta (Facebook, Instagram) |
| `/flux/comparateurs.csv` | Idealo, Kelkoo, LeGuide, Cherchons… (colonnes nommées, une ligne par variante) |
| `/flux/google-ads.csv` | Google Ads Editor : une campagne par rayon, un groupe d'annonces par variante, mots-clés expression + exact, une annonce responsive (titres ≤ 30, descriptions ≤ 90) — la « création multiple » de Channable |

`?vendeur=<adresse de boutique>` limite un flux à une boutique.

## Paiement (Stripe Connect)

- Montage « destination charges » : l'acheteur paie sur le compte Stripe de
  la PLATEFORME (`STRIPE_SECRET_KEY`, le même que les recharges de drops) ;
  Stripe reverse au compte **Express** du vendeur et retient
  `application_fee_amount` = 5 % (`COMMISSION`).
- Le vendeur s'inscrit sur le formulaire hébergé de Stripe (identité, IBAN) :
  rien ne passe chez nous. `User.stripeConnectReady` = `charges_enabled`, relu
  chez Stripe à chaque ouverture de l'écran vendeur.
- ~~Un vendeur sans paiements actifs affiche « Bientôt disponible ».~~ Remplacé le
  27/10/2026 : tout est achetable, voir « Boutique complète » plus bas.
- La commande (`Order`, plateforme `DROPSHOP_MARKET`, `commission`, `variante`)
  est écrite avant Stripe et effacée s'il refuse. Elle est confirmée au retour
  (`/merci`) **et** par le webhook existant (`/api/billing/webhook`,
  `metadata.market = '1'`), en relisant la session chez Stripe ; idempotente.
- Livraison comprise dans le prix affiché (flux : `shipping 0 EUR`).

## Domaine

`drop-shop.cloud` doit pointer sur le service Railway (domaine personnalisé du
service). `marketHostRouter` le reconnaît (`MARKET_HOSTS`, défaut
`drop-shop.cloud,www.drop-shop.cloud`) et sert le Market à la racine ; `www`
redirige en 301 vers le domaine nu (`MARKET_URL`, défaut
`https://drop-shop.cloud`). Sur l'adresse de l'API, le Market répond aussi sous
`/market` (aperçu) ; les canoniques restent celles de drop-shop.cloud.

## À faire par Max (une fois)

1. `cd backend && npm run sauvegarde` avant la fusion (migration additive
   `20261003200000_dropshop_market`, appliquée par `migrate deploy` au démarrage).
2. Stripe : activer **Connect** sur le compte plateforme (Tableau de bord ›
   Connect › Commencer, type Express, pays France).
3. Railway : ajouter le domaine `drop-shop.cloud` (+ `www`) au service, puis les
   enregistrements DNS que Railway indique.
4. Google Search Console : déclarer `https://drop-shop.cloud`, soumettre
   `/sitemap.xml`. Google Merchant Center : flux programmé sur `/flux/google.xml`.

## Mode Prime (livré en 24 h)

- `Product.marketPrime` : le vendeur l'active depuis l'écran DropShop Market
  après avoir confirmé un engagement (expédition le jour même) ; l'admin peut
  le retirer (`POST /api/market/admin/annonces/:id/retirer-prime`).
- Bouton jaune « ⚡ Prime 24 h » dans l'en-tête, page `/prime`, bandeau sur
  l'accueil, badge sur les cartes et la fiche.
- Déclaré à Google : délai de préparation 0 jour et transport 1 jour (schema.org
  et flux Merchant), `custom_label_4` = `prime-24h` | `standard` pour des
  campagnes séparées, titre Ads « Livré en 24 h ».

## Catégories

Les 24 catégories racines et leurs ~224 sous-catégories (table `Category`,
graine `categorySeed.json` si la base est injoignable, cache 10 min) :
barre de défilement + méga-menu « Toutes les catégories » sur chaque page,
tuiles sur l'accueil, pages `/c/<rayon>` et `/c/<rayon>/<sous>` (non indexées
tant qu'elles sont vides, présentes dans le sitemap dès qu'elles ont un produit).

## Vidéos et avis

- **Vidéo** : celle que le vendeur a téléversée (`Product.videoUrl`), affichée
  sur la fiche, décrite en `VideoObject` (Google Vidéos), et passée au
  catalogue Meta (`video[0].url`). Les vidéos des fiches fournisseur ne sont
  pas captées (décision du 03/09/2026 : flux HLS/blob et droits non tranchés).
- **Avis** : les `BuyerReview` publiés du produit (relevés par l'extension ou
  CSV). Note et étoiles sur la carte et la fiche, 20 derniers avis en détail,
  chacun avec son origine (« Avis recueilli sur aliexpress.com ») : présenter un
  avis d'ailleurs comme recueilli ici serait trompeur. **Pas de
  `aggregateRating` balisé** : Google interdit de baliser des avis recueillis
  sur un autre site.

## Pas encore fait (et pourquoi)

- **Événements Connect** (`account.updated`) : l'état du compte est relu à
  l'ouverture de l'écran vendeur, ce qui suffit au démarrage.
- **Avis laissés sur le Market** : pas encore de formulaire après achat ; les
  avis affichés sont ceux du produit (voir plus haut).

## Publication automatique des boutiques (07/10/2026)

Décision de Max : tout produit publié sur une boutique (destination « Mon site »,
`OWN_SITE`) est aussi publié sur le Market, sauf si le vendeur coche « Ne pas
publier mes produits sur DropShop Market » (écran DropShop Market ; colonne
`User.marketAuto`, `true` par défaut).

- Point d'entrée unique : `publishToPlatform` → `services/marketAuto.ts`
  (`diffuserSurMarket`). L'autopilote et la publication en lot passent par là.
- On ne crée l'annonce que s'il n'existe aucune ligne Market pour le produit :
  un retrait de la modération (`FAILED`) n'est jamais défait.
- Désactiver arrête les prochaines diffusions ; ce qui est en ligne y reste.
- Produits déjà en boutique (avant le 07/10, ou pendant une désactivation) :
  rattrapés **automatiquement** au démarrage de l'API et à la réactivation
  (`rattraperBoutiquesSurMarket`, idempotent ; accord de Max le 12/10/2026). Le
  script `backend/diffuser-boutiques-sur-market.ts` reste pour compter à la main.
- Qui a une boutique ne voit plus « DropShop Market » parmi les destinations
  (fiche et lot) : une ligne dit que c'est automatique. La destination reste pour
  qui n'a pas de boutique.
- Publication en lot : « Mon site » seul coché par défaut, envoi par paquets de 25
  (avant : 61 destinations cochées d'office, une seule requête, plafond de 200).
- Migration `20261007160000_market_auto` : sauvegarde avant fusion (`npm run sauvegarde`).
- Banc : `backend/check-market-auto.ts`.

### « Vendu par » et lien vers la boutique

L'achat reste neutre (le client paie sur le Market, comme sur Amazon ou AliExpress),
mais chaque fiche affiche « Vendu par <boutique> » (page vendeur du Market) et
« Voir sa boutique ↗ » vers la boutique elle-même : son `siteUrl` s'il l'a
renseigné, sinon sa vitrine `/b/<adresse>` (`boutiqueUrlDe`). Même lien sur la
page vendeur et dans le schema.org (`seller.url`). Lien suivi, sans `nofollow` :
c'est voulu, pour le maillage et les backlinks. Un `siteUrl` qui n'est pas en
http(s) est ignoré.

## Publier par API, sans boutique (12/10/2026)

Décision de Max : qui a une boutique n'a rien à faire (publication automatique
ci-dessus) ; qui n'en a pas publie par API, avec sa clé `dsp_live_…` (Réglages ›
Clés d'API). Routes dans `backend/src/routes/marketCle.ts`, montées sur
`/api/market/v1` (avant `/api/market`) :

| Route | Effet |
|---|---|
| `GET /annonces` | ses annonces Market, statut et adresse |
| `POST /annonces` | crée ou met à jour par `reference` (devient `sourceUrl = api://<reference>`), PUBLISHED tout de suite ; `imagesWatermarked: false` |
| `POST /publier` | met sur le Market des produits déjà au catalogue (`productIds`, 200 max) |
| `DELETE /annonces/:reference` | retire l'annonce |

Une annonce retirée par la modération (`error` commençant par « Retirée de
DropShop Market par la modération ») ne se republie pas par l'API (409) et son
retrait vendeur garde la ligne. Banc : `backend/check-market-api.ts`. Le MCP pourra
s'appuyer sur ces routes.

## Boutique complète « comme Amazon » (27/10/2026)

Demande de max : le Market n'avait ni compte client, ni panier, et tout affichait
« Bientôt disponible » (aucun vendeur n'avait activé Stripe Connect).

**Décision de max (27/10)** : tout est achetable. Montage Stripe « separate charges
and transfers » : l'acheteur paie une fois sur le compte plateforme (celui des
recharges de drops), puis chaque vendeur reçoit par virement Connect sa part moins
5 % (`transfer_group` = numéro de commande, `source_transaction` = le paiement).
Un vendeur sans paiements actifs : sa part reste mise de côté et lui est versée
dès qu'il active (`verserPartsEnAttente`, appelé par `etatCompte` à l'ouverture de
son écran). Il en est prévenu par email à chaque vente.

| Fichier | Rôle |
|---|---|
| `services/marketClients.ts` | comptes clients (table `MarketClient`, à part de `User`), session `dsm_session` (JWT, HttpOnly, SameSite=Lax), confirmation d'email, mot de passe oublié |
| `services/marketPanier.ts` | panier dans le cookie `dsm_panier` (ids d'offre + quantités ; prix toujours relus en base) |
| `services/marketStripe.ts` | `ouvrirPaiementPanier`, `confirmerPanier`, virements, `prevenirExpeditionMarket` |
| `services/marketPagesClient.ts` | pages panier, commande, compte, commandes, suivi, adresses, envies, sécurité, contact |
| `services/marketLegal.ts` | éditeur (SIRET à `null` tant que max ne l'a pas donné) et textes : CGV, livraison, retours, mentions légales, confidentialité, aide |
| `routes/marketClient.ts` | toutes les routes client, montées dans `marketRouter` |
| `check-market-boutique.ts` | le banc (sans base ni Stripe) |

Ce que voit le client : « Ajouter au panier » sur les fiches et les cartes,
« Acheter maintenant », liste d'envies, panier multi-vendeurs, commande avec ou
sans compte, numéro `DSM-XXXXXXXX`, emails (bienvenue + confirmation, commande,
expédition avec suivi, retour), espace client (commandes, récapitulatif
imprimable, adresses, envies, mot de passe, suppression du compte), suivi sans
compte (numéro + email), demande de retour en ligne, avis « Achat vérifié »
(BuyerReview `source = 'market'`, `sourceSite = 'drop-shop.cloud'`, une fois par
ligne expédiée), filtres et tris (prix, note, Prime), produits voisins, contact
(copie aux vendeurs de la commande, réponse directe à l'acheteur).

Migration additive `20261027140000_market_clients`. Webhook : `checkout.session.expired`
efface les commandes non payées (à cocher dans Stripe pour qu'il arrive).

Reste à faire : facture émise par le vendeur (le récapitulatif n'en est pas une),
remboursement en un clic depuis l'écran vendeur, médiateur de la consommation
(nom à fournir par max), statuts de retour gérés par le vendeur.
