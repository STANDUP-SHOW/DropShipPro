# Faire disparaître `dropshippro-production.up.railway.app`

L'API répond sur une adresse qui porte le nom d'avant, `DropShipPro`, et qui
n'a rien à voir avec DropShipper IA. Elle est visible partout : dans la
Callback URL d'AliExpress, dans celle de Shopify, dans les photos que Shopify
télécharge chez nous, dans la documentation de l'API catalogue que lisent les
clients. Elle doit devenir **`api.drop-shipper.fr`**.

Ce fichier dit l'ordre. **Il compte plus que les gestes.**

---

## Le piège qui commande tout : l'extension

`extension/manifest.json` déclare les hôtes que l'extension a le droit
d'appeler. Jusqu'au 15/09/2026 il n'y avait que l'adresse Railway.

Chrome applique ces permissions **telles qu'elles sont dans la version
installée**. Basculer l'API sur `api.drop-shipper.fr` sans rien faire d'autre
casserait donc l'extension de **tous** les vendeurs d'un coup : elle appellerait
un hôte pour lequel elle n'a aucune permission, et chaque import échouerait.

Et ça ne se répare pas en une heure. Le store sert encore la **1.30.0** — une
version n'arrive au store que quand Max téléverse le zip, puis Chrome propage
en quelques heures, puis chaque navigateur se met à jour quand il veut.

D'où la règle : **l'extension apprend la nouvelle adresse AVANT que l'API n'y
déménage**, jamais l'inverse.

---

## L'ordre, du plus lent au plus rapide

### 1. L'extension connaît les deux adresses — **fait**

`api.drop-shipper.fr` est ajoutée aux `host_permissions`, **à côté** de
l'ancienne, qui reste. Version 1.34.0. C'est purement additif : rien ne change
pour personne tant que l'API n'a pas bougé.

À faire par Max, et c'est le geste à lancer en premier parce que c'est le plus
long à se propager :

```bash
cd backend && node extension/build-store-zip.cjs
```

puis téléverser `backend/extension-store.zip` dans le Developer Dashboard.

### 2. Le domaine existe

Dans Railway : service → **Settings › Networking › Custom Domain** →
`api.drop-shipper.fr`. Railway rend un CNAME, à poser chez le registrar du
domaine. Compter quelques minutes à quelques heures pour le certificat.

Contrôle avant de continuer — les deux adresses doivent répondre `{"ok":true}` :

```bash
curl -s https://api.drop-shipper.fr/api/public/config | head -c 80
```

### 3. L'API se présente sous son nouveau nom

Sur Railway : `PUBLIC_API_URL=https://api.drop-shipper.fr`.

**Cette variable ne sert pas qu'à l'affichage** : c'est elle qui compose
l'adresse des photos que Shopify vient télécharger, et les adresses de rappel
d'AliExpress et de Shopify. La changer change donc trois choses d'un coup.

### 4. Les deux consoles, dans la foulée

| Console | Champ | Nouvelle valeur |
|---|---|---|
| AliExpress Open Platform → App Overview → Edit | Callback URL | `https://api.drop-shipper.fr/api/aliexpress/callback` |
| Shopify Dev Dashboard | URL de redirection | `https://api.drop-shipper.fr/api/shopify/callback` |
| Shopify Dev Dashboard | Webhooks RGPD | `https://api.drop-shipper.fr/api/shopify/webhooks` |

Entre l'étape 3 et celle-ci, une autorisation lancée échouerait : les faire
à la suite, pas à deux jours d'intervalle.

### 5. Le site

Sur Vercel : `VITE_API_URL=https://api.drop-shipper.fr`, **puis redéployer** —
Vite fige les `VITE_*` à la compilation, la variable seule ne suffit jamais.

Et dans le dépôt, trois adresses écrites en dur qui deviennent la nouvelle :

- `frontend/vercel.json` — la réécriture de `/b/:path*` vers la vitrine
- `frontend/src/lib/api.ts` — `FALLBACK_API`, le filet quand `VITE_API_URL`
  est perdue (panne déjà vécue : le bundle appelait alors son propre domaine et
  Vercel répondait 405)
- `backend/extension/config.js` — `DEFAULT_API`, ce qu'une extension fraîchement
  installée appelle avant tout réglage

### 6. La documentation

`CLAUDE.md`, `docs/API-CATALOGUE.md` (lue par les clients), `docs/shopify-app.md`,
`MEMO-RAILWAY-2.md`, `storefront-imprimerie/index.html`.

---

## Ce qui ne casse pas

**L'ancienne adresse continue de répondre.** Railway ne retire pas le domaine
`*.up.railway.app` quand on en ajoute un autre : les deux servent la même
instance. Une extension pas encore mise à jour, un flux catalogue branché par
un client sur l'ancienne adresse, un signet — tout continue de fonctionner. La
migration n'a donc aucune fenêtre de coupure, à condition de respecter l'ordre
ci-dessus.

**Ce qu'il ne faut pas faire** : retirer l'ancienne adresse des
`host_permissions` de l'extension. Elle y reste tant que des vendeurs peuvent
avoir une vieille version, c'est-à-dire longtemps.
