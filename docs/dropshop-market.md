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
- Un vendeur sans paiements actifs est **visible** (le référencement se
  construit) mais son bouton dit « Bientôt disponible ».
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

## Pas encore fait (et pourquoi)

- **Panier multi-vendeurs** : l'achat est « acheter maintenant », une offre à
  la fois. Un panier mêlant plusieurs vendeurs demande le montage « separate
  charges and transfers » de Stripe ; à faire quand le volume le justifie.
- **Événements Connect** (`account.updated`) : l'état du compte est relu à
  l'ouverture de l'écran vendeur, ce qui suffit au démarrage.
- **Avis acheteurs** sur les fiches : non affichés tant que leur provenance
  (fournisseur vs. Market) n'est pas distinguée à l'écran.
