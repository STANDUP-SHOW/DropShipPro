# API Link — réponse au contrat de l'application mobile DropShipper

À transmettre tel quel au développeur de l'application compagnon. Les chemins
et les noms de champs sont **exactement** ceux de son contrat ; les écarts sont
listés à la fin. Code : `backend/src/routes/mobile.ts` ; banc :
`backend/check-api-mobile.ts` (compte jetable, toutes les routes).

## 0. Les réponses aux points bloquants

1. **URL de base** : `https://api.drop-shipper.fr/api/mobile` (en service, certificat
   valide). Secours : `https://dropshippro-production.up.railway.app/api/mobile`.
   Toute la configuration est dans `dropshipper-api.config.json`, à côté.
2. **Auth** : JWT signé HS256, **durée de vie 30 jours**, header
   `Authorization: Bearer <token>`. Le même jeton que le site. Un 401 (jeton
   expiré, invalide, ou compte supprimé) → renvoyer vers l'écran de connexion.
3. **Compte de test** : Max crée un compte sur www.drop-shipper.fr (Créer un
   compte) et transmet lui-même l'email et le mot de passe au développeur. Le
   jeton s'obtient ensuite par `POST /auth/login`. Aucun secret ne passe par
   ce document ni par le dépôt.
4. **Pas de blocage Origin/IP/User-Agent** : une requête sans en-tête `Origin`
   (application native) est acceptée. Limite de débit : 15 connexions par
   15 minutes et par IP sur `/auth/login`.
5. **OpenAPI** : pas de fichier Swagger ; ce document fait foi.

**Format d'erreur** : HTTP 4xx/5xx + `{ "detail": "message lisible" }`, en
français. 400 corps invalide, 401 jeton, 404 objet inconnu, 429 trop de
tentatives, 5xx panne (réessayer).

## 1. Authentification

`POST /auth/login` — `{ "email", "password" }` (email insensible à la casse)

```json
{ "token": "eyJhbGciOi…", "expires_in_days": 30,
  "user": { "id": "cm…", "email": "max@exemple.fr", "name": "OGGUS", "picture": null, "plan": "Drops", "drops": 1250 } }
```

`GET /auth/me` → `{ "user": { …même objet } }`

Un compte créé avec Google n'a pas de mot de passe : il reçoit le même 401
« Email ou mot de passe incorrect » (rien n'est révélé sur la méthode de
connexion). Connexion Google mobile : plus tard.

## 2. Tableau de bord (fenêtre glissante de 30 jours)

`GET /dashboard/summary`

```json
{ "currency": "EUR", "period": "30d", "revenue_gross": 90, "net_profit": 51,
  "margin_pct": 56.7, "ai_orders_processed": 1, "ai_orders_total": 3 }
```

- `revenue_gross` : ventes des 30 derniers jours, remboursements exclus.
- `net_profit` : brut moins le coût réel chez le fournisseur quand il est connu,
  sinon le prix d'achat de la fiche plus le port.
- `margin_pct` : `null` quand il n'y a aucune vente (pas de 0 trompeur).
- `ai_orders_processed` : ventes déposées chez le fournisseur par la plateforme.

`GET /dashboard/chart?range=24h|7d|30d` (défaut `7d`)

```json
{ "range": "7d", "currency": "EUR",
  "points": [ { "label": "lun", "start": "2026-09-23T00:00:00.000Z", "revenue": 1200, "profit": 480 } ] }
```

24 points horaires (`"14h"`), 7 points journaliers (`"lun"`…`"dim"`) ou 30
points (`"23/9"`). `start` est ajouté pour qui veut formater lui-même.

`GET /dashboard/copilot`

```json
{ "avg_response_seconds": 90, "resolution_rate": 0, "sourcing_queue": 12, "active_agents": 3 }
```

- `avg_response_seconds` : délai moyen entre le premier message du vendeur
  dans un ticket et la première réponse d'un agent (30 jours). `null` sans ticket.
- `resolution_rate` : % de tickets non ouverts (30 jours). `null` sans ticket.
- `sourcing_queue` : liens partagés en attente d'import.
- `active_agents` : chefs de rayon en AUTO-MODE + l'AUTO-SHIPPER s'il est activé.

## 3. Notifications

`GET /notifications` → `{ "unread": 3, "items": [ … ] }`, chaque item au
format du contrat, **plus** un champ `url` (où ouvrir l'objet sur le site).

Elles sont **dérivées de l'état réel** du compte, pas d'un journal : une
notification disparaît quand sa cause disparaît. Identifiants stables :

| type | id | quand | actions |
|---|---|---|---|
| `rpa_validation` | `pay:<commande>` | commande déposée chez le fournisseur, qui attend le règlement du vendeur | `approve_pay`, `review` |
| `low_balance` | `balance:<AAAA-MM-JJ>` | solde sous 120 drops (critique sous 20) | `refill_wallet` |
| `ai_escalation` | `ticket:<id>` | ticket ouvert (critique après 24 h) | `take_over`, `review` |
| `new_sale` | `sale:<commande>` | vente des 14 derniers jours à commander | `review` |
| `order_shipped` | `ship:<commande>` | colis expédié dans les 7 derniers jours | `review` |

`POST /notifications/{id}/read` et `POST /notifications/read-all` → `{ "status": "ok" }`.
Les `id` contiennent un `:` : les encoder dans l'URL (`pay%3Acm…`).

`POST /notifications/{id}/action` — `{ "action_id": "approve_pay|refill_wallet|take_over|review" }`
→ `{ "item": { …mis à jour }, "message": "…", "url": "…" }`.
**`approve_pay` ne paie rien** : la plateforme ne règle jamais un fournisseur à
la place du vendeur. La notification passe `resolved`, et `url` est la page du
fournisseur où il règle : l'application l'ouvre. Une action que la notification
ne propose pas → 400.

`POST /register-push` — `{ "platform": "ios|android", "device_token": "…" }`
(`user_id` accepté mais ignoré : le compte est celui du jeton) →
`{ "status": "registered" }`. **L'envoi des notifications push n'est pas encore
branché** (il faut les clés Firebase du projet) : l'inscription est stockée,
l'application peut l'appeler dès maintenant.

## 4. Partage produit

`POST /products/share` — `{ "text"?, "url"?, "source"? }` : l'adresse est prise
dans `url`, sinon cherchée dans `text`. Elle est nettoyée (paramètres de pistage
retirés : `utm_*`, `spm`, `fbclid`…, ce qui désigne le produit est gardé). La
source est devinée du domaine si absente. Repartager la même fiche ne la double pas.

```json
{ "item": { "id": "cm…", "clean_url": "https://fr.aliexpress.com/item/1005006.html",
            "source": "AliExpress", "title": null, "status": "queued", "created_at": "2026-09-29T…" },
  "message": "Produit envoyé dans votre espace DropShipper Desktop !" }
```

`status` : `queued` (en attente), `processing` (pris par l'application desktop),
`done`. `GET /products/shared` → `{ "items": [ … ] }` (200 derniers).

## 5. Préférences

`GET /settings/notifications` → l'objet du contrat ; valeurs par défaut :
`new_sales: false, order_shipped: false, low_balance_margin: true,
rpa_validation: true, ai_escalation: true`.
`PUT /settings/notifications` : objet complet ou partiel, booléens uniquement ;
rend l'objet complet mis à jour. Un champ inconnu → 400. Les préférences
filtrent `GET /notifications`.

## Écarts avec le contrat

- `plan` vaut `"Drops"` : pas d'abonnement, tout se paie en drops ; le solde est
  dans le champ ajouté `drops`.
- Champs ajoutés, sans effet si ignorés : `expires_in_days`, `period`,
  `start`, `url`, `drops`, `title`.
- Libellés et messages en français.
- Push : inscription seulement, envoi à venir.
