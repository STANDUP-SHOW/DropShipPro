# Publier DropShipper IA sur le Shopify App Store

État au 15/09/2026. Ce fichier dit **ce qui est fait**, **ce qui reste**, et
surtout **la seule question qui peut tout arrêter** — la facturation.

---

## Où on en est vraiment

L'application qui apparaît dans le menu Applications de la boutique
`oguss-france` est une **app personnalisée**, créée depuis l'administration de
la boutique. Elle marche, elle publie (108 produits actifs), et elle n'a rien à
voir avec une app publiable : une app personnalisée n'existe que pour la
boutique qui l'a créée, elle ne s'installe nulle part ailleurs et elle ne peut
pas figurer dans l'App Store.

Publier officiellement, c'est donc construire une **app publique**, qui est un
objet différent. Voici l'inventaire, sans arrondir.

| Exigence Shopify | État | Où |
|---|---|---|
| Installation par OAuth (jamais un jeton recopié) | **fait** | `services/shopifyApp.ts`, `routes/shopifyApp.ts` |
| Vérification HMAC du retour d'installation | **fait** | `hmacRequeteValide` |
| Protection CSRF par `state` signé | **fait** | `signerEtat` / `lireEtat` |
| Webhooks signés (HMAC sur les octets bruts) | **fait** | `hmacWebhookValide`, monté avant `express.json` |
| `customers/data_request` | **fait** | aucune donnée détenue, répondu et journalisé |
| `customers/redact` | **fait** | idem |
| `shop/redact` | **fait** | la liaison de la boutique est supprimée |
| `app/uninstalled` (non obligatoire, mais indispensable) | **fait** | la liaison est éteinte, pas détruite |
| Banc de non-régression | **fait** | `check-shopify-app.ts` + `check-shopify-embed.ts` |
| App **intégrée** (rendue dans l'admin Shopify) + App Bridge | **fait** | `services/shopifyEmbed.ts`, `GET /api/shopify/app` |
| Jetons de session (session tokens) pour l'app intégrée | **fait** | `lireJetonDeSession`, `GET /api/shopify/embed/etat` |
| Fiche App Store (visuels, textes, démonstration, politique de confidentialité) | **à faire** | — |
| **Facturation** | **décision à prendre** | voir plus bas |

## L'état réel du Dev Dashboard (16/09/2026, constaté)

Organisation **oguss conect** (`232181656`). **Deux applis y existent** — la
question « faut-il en créer une ? » revenait à chaque session, la réponse est
non.

| Appli | Id | Installations | À quoi elle sert |
|---|---|---|---|
| **DropShipper IA** | `415503286273` | 0 | **C'est l'app publique.** Configurée et publiée en version `2.0-oauth-publique` le 16/09/2026. |
| DROP-SHIPPER AI | `415547916289` | 1 | **Ne pas l'utiliser.** Sa version 14 demande *toutes* les portées de Shopify — paiements, thèmes, commandes complètes, journaux d'audit. Une fiche App Store avec ça est refusée, et c'est une surface d'attaque gratuite. À nettoyer ou à supprimer, séparément. |

Ce que porte la version `2.0-oauth-publique` :

- **Portées** : `read_products,write_products,read_publications,write_publications`
  — rien d'autre. Shopify examine cette liste.
- **URL de redirection** : `…/api/shopify/callback`
- **URL de l'appli** : `…/api/shopify/app`
- **Intégrée dans l'admin** : oui (App Bridge). **POS** : non.
- **Flux d'installation hérité : OUI**, et ce n'est pas un oubli. « Hérité »
  désigne le *grant* OAuth classique — redirection vers `/admin/oauth/authorize`
  puis échange du `code` —, c'est-à-dire exactement ce que `routes/shopifyApp.ts`
  implémente. Le décocher ferait passer Shopify en installation « gérée » : notre
  `/callback` ne serait plus jamais appelé, et il faudrait écrire l'échange de
  jeton de session à la place.

**Ce qui manque encore : les webhooks RGPD ne sont déclarés nulle part.** Le
formulaire de version du Dev Dashboard n'expose que la *version d'API* des
webhooks, pas leurs adresses ; les sujets de conformité se déclarent dans
`shopify.app.toml` et se poussent par `shopify app deploy`. Notre endpoint les
traite et son banc passe — mais tant que l'adresse n'est pas déclarée, **Shopify
ne les enverra pas**. Conséquence concrète : après une désinstallation, aucun
`shop/redact` n'arrive et le jeton resterait en base. Deux façons de fermer ça,
au choix : déclarer les sujets par le CLI, ou souscrire `app/uninstalled`
nous-mêmes juste après l'OAuth (`webhookSubscriptionCreate`). Obligatoire pour
une fiche App Store ; à faire de toute façon.

## Le domaine d'API

Ajouté dans Railway le 16/09/2026 : **`api.drop-shipper.fr`**, port 8080, sur le
service `DropShipPro`. Les anciennes adresses `*.up.railway.app` continuent de
répondre — l'ajout est purement additif, rien ne casse.

**Le DNS de `drop-shipper.fr` est chez OVH** (`ns106.ovh.net`, `dns106.ovh.net`),
pas chez Vercel. Les deux enregistrements à poser dans la zone :

| Type | Nom | Valeur |
|---|---|---|
| CNAME | `api` | `neb2lwm1.up.railway.app` |
| TXT | `_railway-verify.api` | `railway-verify=250de5caab3be96d0fb44acd7c20a32e04f031c1a83f6b34db23e361bbeecf7f` |

Tant que `api.drop-shipper.fr` ne résout pas, l'App URL et l'URL de redirection
déclarées chez Shopify portent l'adresse Railway. **Ce sont deux champs à
rechanger** une fois le domaine actif, plus `PUBLIC_API_URL` sur Railway.

À faire par Max pour activer ce qui est déjà écrit — trois variables sur
Railway, et rien d'autre :

```
SHOPIFY_APP_KEY=...        # Client ID de l'app publique
SHOPIFY_APP_SECRET=...     # Client Secret
SHOPIFY_APP_SCOPES=write_products,read_products,write_publications,read_publications
```

Sans elles, l'installation en un clic ne s'affiche pas et les routes répondent
503 : dégradation propre, exactement comme la connexion Google. Le parcours au
jeton `shpat_` continue de fonctionner à côté, sans changement.

Dans le Dev Dashboard, l'app déclare (version `2.1-domaine-propre`, 16/09/2026) :

- **App URL** (la page affichée dans l'admin du marchand) :
  `https://api.drop-shipper.fr/api/shopify/app`
- **URL de redirection** : `https://api.drop-shipper.fr/api/shopify/callback`,
  **et** l'ancienne adresse Railway, gardée volontairement le temps de la
  bascule — le champ accepte une liste.
- **Webhooks RGPD**, les trois, vers `https://dropshippro-production.up.railway.app/api/shopify/webhooks`
- **`app/uninstalled`**, même adresse

---

## La question qui peut tout arrêter : la facturation

C'est le point à trancher **avant** d'investir dans la fiche, et il n'est pas
technique.

Ce que dit Shopify, vérifié dans leurs conditions :

- « Apps that use off-platform billing cannot be distributed through the
  Shopify App store. »
- Le Partner Agreement définit les *App Revenues* comme les revenus « relating
  to or passing through » l'application, **avec droit d'audit**.
- La seule échappatoire est la clause 5.5.3 : le **coût des marchandises
  vendues** peut passer par son propre encaissement ; tout le reste doit passer
  par la Billing API de Shopify.
- Coût : 19 $ une fois, **0 % jusqu'à 1 M$ de revenus cumulés**, puis 15 %,
  plus 2,9 % de frais de traitement.
- Aucun délai d'examen garanti ; Shopify a reconnu un retard de file début 2026.

**Ce que ça veut dire pour nous.** Notre modèle est le drop : le vendeur
recharge sur `drop-shipper.fr` et dépense à l'acte. Pour un marchand qui
installerait l'app depuis l'App Store, cet encaissement est du revenu « passant
par » l'application. Le lire autrement serait se raconter une histoire.

Trois voies, et il faut en choisir une :

1. **Se conformer.** Les recharges faites par un marchand venu de l'App Store
   passent par la Billing API de Shopify. Coût réel : 0 % tant qu'on n'a pas
   encaissé 1 M$ **par ce canal**, donc gratuit pendant longtemps, puis 15 %.
   Il faut une seconde voie d'encaissement dans le code, et savoir de quel
   canal vient chaque vendeur.
2. **Ne pas publier, et distribuer l'app en lien direct.** Une app publique
   non listée s'installe parfaitement par son lien d'installation — c'est
   exactement ce que le code ci-dessus permet déjà. On perd la vitrine de
   l'App Store et sa recherche ; on garde 100 % du revenu et la liberté de
   notre grille.
3. **Publier une app volontairement gratuite**, qui ne fait que le pont
   catalogue, et garder le compte et la facturation sur notre site. C'est la
   voie la plus fragile : « relating to or passing through » est large, et le
   droit d'audit est réel.

**Recommandation.** Commencer par la voie 2, qui ne coûte rien et fonctionne
dès que les trois variables sont posées : les marchands s'installent en un
clic depuis nos campagnes, et le parcours est déjà celui d'une vraie app. La
voie 1 ne devient intéressante que si l'on veut la vitrine de l'App Store — et
à ce moment-là, les 0 % jusqu'à 1 M$ la rendent indolore. Ce qu'il ne faut pas
faire, c'est bâtir la fiche d'abord et découvrir la règle de facturation
ensuite.

---

## L'application intégrée — écrite le 16/09/2026

L'admin Shopify affiche l'app dans une iframe de `admin.shopify.com`. Trois
choses en découlent, et aucune n'est optionnelle.

**Nos cookies n'arrivent pas dans cette iframe** (troisième partie, bloqués par
tous les navigateurs modernes), donc `requireAuth` n'y sert à rien : il n'y a
pas de session à lire. Shopify délivre à la place un **jeton de session**, un
JWT d'une minute signé du secret de l'app, que la page demande à App Bridge et
pose en `Authorization: Bearer`. `lireJetonDeSession` le vérifie — c'est un
**second portique**, à côté de `requireAuth`, pas un remplacement : il ne dit
pas quel compte regarde, il prouve « cette page est servie dans l'admin de
cette boutique-là ».

Le contrôle qui compte le plus est le plus discret : **`alg` est imposé à
HS256**, jamais lu dans l'en-tête du jeton. Un vérificateur qui fait confiance
à ce que le jeton déclare accepte `alg: none`, et le jeton se fabrique alors
sans connaître le secret. `check-shopify-embed.ts` éprouve ce cas précis, et il
a été confronté à la version fautive : sans la ligne, il tombe.

**`Content-Security-Policy: frame-ancestors`** est envoyé sur la page : sans
lui, l'admin refuse d'afficher l'iframe et le marchand voit un cadre vide —
c'est le symptôme le plus courant d'une app intégrée qui « ne marche pas ».

**La page ne contient aucun chiffre.** Elle les demande à
`/api/shopify/embed/etat` avec le jeton. Les écrire au rendu aurait été plus
simple et faux : la page est servie avant que la signature du jeton soit
vérifiée, donc on afficherait le catalogue d'une boutique à qui la demande.

## Ce qui reste à écrire pour la voie 1

- **Billing API** : `appSubscriptionCreate` ou `appPurchaseOneTimeCreate` pour
  les recharges de drops, avec le retour à confirmer sur la page cible — le
  piège Stripe du mémo vaut mot pour mot ici.
- **Fiche App Store** : visuels, textes, démonstration, politique de
  confidentialité.
