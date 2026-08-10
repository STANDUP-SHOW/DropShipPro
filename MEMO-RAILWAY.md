# Mémo — Configurer le backend DropShip Pro sur Railway

Document destiné à un assistant pilotant le navigateur (Claude in Chrome).
À exécuter sur **https://railway.app**, dans le projet qui héberge déjà la base
PostgreSQL de DropShip Pro.

**Contexte :** le dépôt GitHub `STANDUP-SHOW/DropShipPro` contient trois sous-projets
(`backend/`, `frontend/`, `storefront/`). Railway doit construire **uniquement
`backend/`**. Le déploiement échoue actuellement parce qu'il analyse la racine du
dépôt et n'y trouve aucune application.

---

## Étape 1 — Créer (ou ouvrir) le service backend

Si le service n'existe pas encore :

1. Ouvrir le projet Railway contenant le service **Postgres**.
2. Bouton **+ Create** → **GitHub Repo** → choisir `STANDUP-SHOW/DropShipPro`.
3. Laisser Railway créer le service, puis passer à l'étape 2 (le premier build
   échouera tant que l'étape 2 n'est pas faite — c'est attendu).

---

## Étape 2 — Régler le Root Directory *(c'est la correction du bug actuel)*

1. Cliquer sur le service backend.
2. Onglet **Settings**.
3. Section **Source**.
4. Champ **Root Directory** → saisir exactement :

   ```
   backend
   ```

5. Valider (le champ s'enregistre seul, ou via **Update**).

> Sans ce réglage, le build échoue avec le message
> « Railpack could not determine how to build the app ».

---

## Étape 3 — Variables d'environnement

Onglet **Variables** du service backend → ajouter ces quatre entrées.

| Nom | Valeur à saisir |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `006bec8a68b536d5c303fafd272a6e0d15c759661c3151c9f6ffb391f52aa980803143f098519514193e8fbd2da67845` |
| `FRONTEND_URL` | `https://drop-ship-pro.vercel.app` |
| `ANTHROPIC_API_KEY` | **à saisir par Max lui-même** — voir la note ci-dessous |

Précisions :

- `DATABASE_URL` : saisir la référence `${{Postgres.DATABASE_URL}}` telle quelle,
  avec les accolades. Railway la résout vers la base du projet. Si le service
  Postgres porte un autre nom que « Postgres », remplacer ce mot par son nom exact.
- `JWT_SECRET` : signe les sessions de l'application. Cette valeur-ci n'est utilisée
  nulle part ailleurs.
- **`ANTHROPIC_API_KEY` : ne pas la demander ni la saisir.** C'est une clé d'accès
  facturable. Laisser Max la coller lui-même depuis
  https://console.anthropic.com/settings/keys. Signaler simplement que la variable
  reste à renseigner.

---

## Étape 4 — Volume de stockage *(important, sinon perte de données)*

Le système de fichiers de Railway est **éphémère** : sans volume, toutes les photos
produit filigranées sont effacées à chaque redéploiement.

1. Service backend → **Settings** → section **Volumes**.
2. **+ Add Volume**.
3. Mount path :

   ```
   /app/storage
   ```

4. Valider.

---

## Étape 5 — Générer le domaine public

1. Service backend → **Settings** → section **Networking**.
2. **Generate Domain**.
3. Laisser le port proposé par défaut (l'application écoute sur la variable `PORT`
   que Railway injecte automatiquement).
4. **Copier l'URL obtenue** (de la forme `https://xxxxx.up.railway.app`).

---

## Étape 6 — Redéployer et vérifier

1. Onglet **Deployments** → **Deploy** (ou **Redeploy** sur le dernier déploiement).
2. Attendre la fin du build.

**Résultat attendu dans les logs :** Railpack détecte Node, installe les dépendances,
`prisma generate` s'exécute via le `postinstall`, puis
`prisma migrate deploy && npm start`, et enfin la ligne :

```
DropShip Pro API sur http://localhost:XXXX
```

**Vérification finale :** ouvrir dans le navigateur

```
https://<URL-RAILWAY>/api/health
```

La réponse attendue est exactement :

```json
{"ok":true}
```

---

## À rapporter à Max

1. L'**URL publique Railway** générée à l'étape 5.
2. Le résultat de `/api/health` (`{"ok":true}` ou l'erreur obtenue).
3. Si le build échoue : les **20 dernières lignes des logs de build**.
4. Confirmer que la variable `ANTHROPIC_API_KEY` reste **à renseigner par lui**.

---

## Ensuite (à faire par Max, pas par l'assistant)

Une fois l'URL Railway connue, côté **Vercel** (projet `drop-ship-pro`) :

- **Settings → General → Root Directory** = `frontend`
- **Settings → Environment Variables** → `VITE_API_URL` = l'URL Railway
- Redéployer.

Sans cette variable, le site Vercel s'affichera mais aucun appel API ne fonctionnera.
