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
| Banc de non-régression | **fait** | `npx tsx check-shopify-app.ts` |
| App **intégrée** (rendue dans l'admin Shopify) + App Bridge | **à faire** | — |
| Jetons de session (session tokens) pour l'app intégrée | **à faire** | — |
| Fiche App Store (visuels, textes, démonstration, politique de confidentialité) | **à faire** | — |
| **Facturation** | **décision à prendre** | voir plus bas |

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

Dans le Dev Dashboard, l'app doit déclarer :

- **URL de redirection** : `https://dropshippro-production.up.railway.app/api/shopify/callback`
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

## Ce qui reste à écrire pour la voie 1

- **App intégrée** : l'admin Shopify affiche l'app dans une iframe. Il faut
  App Bridge (dernière version) et servir une page qui s'y rend.
- **Jetons de session** : dans une app intégrée, l'authentification ne passe
  pas par nos cookies — le front demande un jeton de session à App Bridge et
  l'API le vérifie (JWT signé du secret de l'app). C'est un second portique à
  côté de `requireAuth`, pas un remplacement.
- **Billing API** : `appSubscriptionCreate` ou `appPurchaseOneTimeCreate` pour
  les recharges de drops, avec le retour à confirmer sur la page cible — le
  piège Stripe du mémo vaut mot pour mot ici.
