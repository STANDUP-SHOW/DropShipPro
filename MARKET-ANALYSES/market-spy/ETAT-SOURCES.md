# État des quatre sources de veille — 4 octobre 2026

Ce fichier existe pour une raison : **ne pas refaire ces vérifications.** Chaque
ligne ci-dessous a été éprouvée contre le vrai service, pas lue dans une
documentation. Quand une case change, la corriger ici plutôt que de recommencer.

| Source | État | Bloqué par |
|---|---|---|
| **META** | code juste, jamais passé | confirmation d'identité Meta, en cours depuis le 04/10 |
| **TIKTOK** | API fermée, navigateur à finir | la recherche ne se déclenche pas |
| **MINEA** | écrit, non éprouvé | quota muet en gratuit, CGU à vérifier |
| **DROPSHIP** | écrit, non éprouvé | crédits, CGU à vérifier |

---

## META — bloqué par une confirmation d'identité, pas par le code

L'appel réel a été fait le 04/10 avec `test-meta-live.cjs`. Réponse :

```
HTTP 400 — OAuthException code 10, sous-code 2332002
« Application does not have permission for this action »
```

Le jeton n'était pas en cause : type USER, valide, long-lived jusqu'au
03/12/2026, app `DropShipperAdmin1`. Un second essai avec un jeton
d'**application** a donné le sous-code 2332004 — un jeton d'app ne convient pas,
et il contient en plus le secret de l'application.

**Le verrou est l'étape 1 de Meta**, dans ses propres mots sur
`facebook.com/ads/library/api` : « confirmez votre identité et lieu où vous vous
trouvez — suivez le traitement de la confirmation **nécessaire pour diffuser des
publicités portant sur des thèmes sociaux, électoraux ou politiques** ».

C'est une confirmation **distincte** de la vérification Business, que Maxime
avait déjà. Même pour ne lire que des publicités commerciales européennes, Meta
verrouille toute l'API derrière la confirmation des annonceurs politiques.
`facebook.com/ID` affichait bien « 1 étape à effectuer ». Dépôt de pièce
d'identité lancé le 04/10, réponse annoncée sous 48 h. **Pas de code postal dans
ce parcours** — contrairement à ce que racontent de vieux fils GitHub.

Il n'existe **pas** d'étape « autoriser l'application » : le bouton « Accéder à
l'API » de la page Meta est un simple lien vers le Graph API Explorer.

**Attention au compte.** Le profil connecté dans Chrome est « Jobber »
(`61592332661498`), le porteur du premier jeton était « Jobber CorporatePro »
(`122116823319411088`). La confirmation d'identité doit porter sur le compte
depuis lequel le jeton utilisateur est généré, sinon même erreur sans
explication.

**Ce que l'API donnera, et ne donnera pas.** `ad_type=ALL` ne rend les publicités
commerciales que pour l'UE et le Royaume-Uni — le DSA l'impose. `META_COUNTRIES`
sur autre chose que la zone ne rendrait que des pubs politiques : le script
refuse désormais un pays hors zone. `eu_total_reach` et les ventilations
démographiques sont des champs exclusivement UE. Il n'y a **aucune métrique
d'engagement** — ni j'aime, ni commentaires, ni partages, ni taux de clic — et
aucune dépense pour les publicités commerciales. Environ 200 appels par heure et
par jeton. Les pubs commerciales UE sont conservées un an.

Quand la confirmation passe : régénérer un jeton **utilisateur** depuis le Graph
API Explorer, le poser dans `.env`, relancer `test-meta-live.cjs`. Rien à
réécrire.

## TIKTOK — l'API est fermée aux commerçants, le navigateur reste à finir

**L'API Commercial Content n'est pas accessible.** La documentation officielle
est formelle : « Once your application is approved, a **research client** will be
generated for your project. » C'est le programme de recherche, réservé aux
institutions académiques et aux organismes à but non lucratif ; les utilisateurs
commerciaux, créateurs et annonceurs en sont explicitement exclus. Les
inscriptions TikTok Ads et TikTok Creator n'y donnent pas accès — elles donnent
le Creative Center et l'API Marketing sur son propre compte.

La page `library.tiktok.com` affiche pourtant « The API enables **anyone** to run
customized searches ». C'est de la communication, pas la règle d'éligibilité.
Vérifié le 04/10 : ne pas se laisser reprendre par cette phrase.

**Le nœud `tiktok/nodes/tiktok-commercial-content-api.js` est donc inutilisable
en l'état** — il demande un jeton `client_credentials` qui ne sera jamais
délivré.

**L'appel HTTP direct est refusé.** `/api/v1/search` répond `system busy` à
chaque tentative — corps minimal, en-têtes de navigateur complets, France comme
Allemagne, depuis la machine de Maxime comme depuis le cloud. Ce n'est ni un
blocage d'adresse IP ni un quota : une route inexistante renvoie proprement un
`404 page not found`, donc le serveur route correctement et cette route refuse
délibérément. Protection anti-automatisation.

**Le navigateur, lui, passe.** Essai Playwright du 04/10 sur
`library.tiktok.com/ads?region=FR` : la page se charge en français, France
pré-sélectionnée, et **sept réponses JSON en HTTP 200** sont interceptées —
`/api/v1/location`, `/api/v1/support-regions`, `/api/v1/suggestion`,
`/api/v1/web-cookie-privacy/config`. Plus aucune trace de `system busy`. La voie
Browserless est donc la bonne.

**Ce qui reste à résoudre, et c'est le seul point.** `/api/v1/search` ne se
déclenche pas. La touche Entrée n'appelle que `/api/v1/suggestion`
(l'autocomplétion). Le bouton « Rechercher » **recharge la page en la vidant** :
l'adresse perd son `?region=FR` et le sélecteur de pays repasse sur
« Sélectionnez un pays cible ». Trois approches essayées — Entrée, le bouton,
puis sélectionner France dans la liste avant de chercher. Aucune ne lance la
requête.

**La méthode qui reste**, et c'est celle à suivre : faire la recherche à la main
dans un vrai navigateur en lisant le trafic réseau, relever la requête exacte que
la page envoie — en-têtes et corps compris — et la rejouer dans le nœud. Une
heuristique de sélecteur ne suffira pas ici.

## MINEA et DROPSHIP — au placard, et volontairement

Les deux sont écrits et leurs tests de parsing passent, mais aucun n'a tourné en
production. Ils reposent sur un navigateur sans interface, des cookies de session
exportés et des sélecteurs DOM : la fragilité même qui a coûté la semaine du 23
septembre au 4 octobre. Le compte gratuit Minea devient en outre **muet** au
quota — zéro résultat, aucun message — ce qui rend un mur de quota
indiscernable de « aucun concurrent trouvé ».

Et le dossier de passation demande lui-même de vérifier les CGU de Minea et de
dropship.io avant toute mise en production.

**Décision du 04/10 : on démarre avec Meta et TikTok seulement.** Officiels,
gratuits, sans DOM et sans zone grise. Minea reviendra par son MCP officiel le
jour d'un abonnement Premium, jamais par scraping.

## La pièce qui manque à tout l'édifice

Quatre agents qui écrivent quatre JSON par rayon ne font pas un rapport.
L'agrégateur — étape 3 du dossier de passation, vers 7h15 — fusionne MINEA,
DROPSHIP, TIKTOK et META au format aiMARKET avec les 20 produits. Sans lui, ce
travail produit du renseignement qui n'arrive jamais sur le site.

C'est aussi là qu'il doit rencontrer `lireRapport()` et
`POST /api/agent/market-reports`, pour que l'application desktop en développement
et ces agents déposent par la même porte, avec les mêmes champs.

**Deux conventions à trancher avant qu'un seul agent tourne**, sous peine de
rejouer « les rapports sont produits mais invisibles » : ces agents écrivent
`TELEPHONIE-JJ-MM-AA-MINEA.json` à la racine de `MARKET-ANALYSES`, quand la
chaîne en place lit `rapports/<date>/<catégorie>/<thème>.*` ; et ils datent en
`JJ-MM-AA` quand tout le reste est en `AAAA-MM-JJ`.
