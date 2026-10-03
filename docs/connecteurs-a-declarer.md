# Connecteurs : ce que Max doit déclarer chez chaque plateforme

Écrit le 03/10/2026. Les connecteurs ci-dessous existent dans le code et passent leurs bancs.
Aucun n'a encore parlé au vrai service. Chacun attend deux choses :

1. une **application DropShipper** déclarée chez la plateforme, dont les clés vont dans **Railway** ;
2. que le vendeur clique sur **« Relier »** dans DropShipper et autorise l'application chez la plateforme.

`<API>` désigne la valeur de `PUBLIC_API_URL` dans Railway : `https://api.drop-shipper.fr` si la
migration du domaine est faite (`docs/migration-domaine-api.md`), sinon
`https://dropshippro-production.up.railway.app`. L'adresse de retour doit être déclarée **au
caractère près**. `JWT_SECRET` doit être posé, car il signe chaque autorisation.

## Réseaux sociaux et régies (écran Réseaux › Comptes)

| Plateforme | Où créer l'app | Variables Railway | Adresse de retour | Validation chez la plateforme |
|---|---|---|---|---|
| **Facebook + Instagram** (publication normale) | developers.facebook.com | `META_APP_ID`, `META_APP_SECRET` | `<API>/api/public/social/meta/callback` | Vérification d'entreprise, puis App Review de `pages_manage_posts` et `instagram_content_publish`. Tes propres comptes marchent dès maintenant en mode développement. |
| **Meta Ads** | même app Meta | les mêmes | `<API>/api/public/social/meta-ads/callback` | App Review de `ads_management` (accès avancé). En attendant, tes propres comptes publicitaires marchent. |
| **TikTok** (publication normale) | developers.tiktok.com : Login Kit + Content Posting API | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `<API>/api/public/social/tiktok/callback` | **Vérifier le domaine des médias** (Content Posting › Verify domains), sinon chaque envoi échoue. Sans audit TikTok, les publications sortent **en privé**. |
| **TikTok Ads** | business-api.tiktok.com (API for Business) | `TIKTOK_ADS_APP_ID`, `TIKTOK_ADS_SECRET` | `<API>/api/public/social/tiktok-ads/callback` | Approbation de l'app développeur (permissions : comptes, annonces, rapports, créations). |
| **Pinterest + Pinterest Ads** | developers.pinterest.com | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` (+ `PINTEREST_API_URL=https://api-sandbox.pinterest.com` tant que l'app est en accès d'essai) | `<API>/api/public/social/pinterest/callback` | L'accès « Standard » est nécessaire pour publier pour de vrai. Il faut un compte Pinterest Business. |

`SOCIAL_PROVIDER` : ne plus le poser (ou le retirer). Zernio ne sert que si `SOCIAL_PROVIDER=zernio`.

## Places de marché (écran Plateformes de vente)

| Plateforme | Où créer l'app | Variables Railway | Adresse de retour | À savoir |
|---|---|---|---|---|
| **TikTok Shop** | partner.tiktokshop.com : app + Service | `TIKTOKSHOP_APP_KEY`, `TIKTOKSHOP_APP_SECRET`, `TIKTOKSHOP_SERVICE_ID` (+ `TIKTOKSHOP_AUTHORIZE_URL=https://services.eu.tiktokshop.com/open/authorize` pour l'Europe) | `<API>/api/public/marches/tiktok_shop/callback` | Une boutique vendeur France approuvée. Permissions produits, boutiques autorisées, entrepôts. L'offre part **en revue chez TikTok**. |
| **Amazon** | Seller Central › Applications › Développer : app **privée**, rôle *Product Listing* | `AMAZON_LWA_CLIENT_ID`, `AMAZON_LWA_CLIENT_SECRET`, `AMAZON_SPAPI_APP_ID` (+ `AMAZON_SPAPI_BETA=1` tant que l'app est en brouillon) | `<API>/api/public/marches/amazon/callback` | Compte vendeur **Pro**. Pour ton propre compte, pas besoin de redirection : « Autoriser l'application », puis tu colles le jeton et ton Seller ID dans DropShipper. **EAN obligatoire** : on dépose une offre sur une fiche Amazon existante, jamais une fiche neuve. |
| **Allegro** | apps.developer.allegro.pl (bac à sable : apps.developer.allegro.pl.allegrosandbox.pl) | `ALLEGRO_CLIENT_ID`, `ALLEGRO_CLIENT_SECRET` (+ `ALLEGRO_SANDBOX=1` pour les essais) | `<API>/api/public/marches/allegro/callback` | Compte entreprise UE vérifié. Il faut avoir créé chez Allegro au moins un tarif de livraison, une politique de retour et une garantie. Annonces et service client en polonais. Prix convertis en PLN (taux BCE). |

Déjà écrits avant le 03/10 (clés à coller dans Plateformes de vente) : eBay, Kaufland, les 41 enseignes
Mirakl, Shopify et les boutiques tierces. **Pas écrits** : Cdiscount, Etsy, Wish. L'écran le dit
maintenant.

## Ordre conseillé pour la semaine de tests

1. **Allegro en bac à sable** : c'est immédiat, et c'est sans risque.
2. **Meta (Facebook, Instagram, Meta Ads)** sur tes propres comptes, en mode développement.
3. **TikTok et Pinterest** : publications privées ou en bac à sable tant que les audits ne sont pas passés.
4. **Amazon** (application privée) et **TikTok Shop**, dès que les comptes vendeur sont validés.
