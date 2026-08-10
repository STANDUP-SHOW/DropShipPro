# Mémo 2 — Débloquer drop-shipper.fr et activer les emails

Document destiné à un assistant pilotant le navigateur (Claude in Chrome).
Fait suite au premier mémo : le backend est déjà déployé et répond.

**Vérifié avant rédaction :**
- Backend Railway en ligne → `https://dropshippro-production.up.railway.app/api/health` renvoie `{"ok":true}`
- Frontend Vercel en ligne sur `drop-ship-pro.vercel.app` **et** `drop-shipper.fr`
- **Problème actuel :** depuis `drop-shipper.fr`, l'API refuse tous les appels
  (aucun en-tête `Access-Control-Allow-Origin`). Connexion et annonces sont donc
  inutilisables sur le domaine personnalisé.

**Symptôme constaté par Max :** la connexion échoue sur
`https://drop-shipper.fr/login`. Vérifié depuis la console de cette page, l'appel
`fetch` vers l'API renvoie `Failed to fetch` — y compris sur `/api/health`, qui ne
demande aucune authentification. **Ce n'est donc pas un problème de mot de passe :
c'est le CORS, corrigé par l'étape 1.** Le formulaire refonctionnera dès le
redéploiement, sans autre changement.

---

## Étape 1 — Corriger `FRONTEND_URL` *(débloque drop-shipper.fr)*

1. Ouvrir https://railway.app → projet DropShip Pro → service **backend**.
2. Onglet **Variables**.
3. Modifier la variable existante `FRONTEND_URL`.
4. Remplacer sa valeur par cette ligne exacte — **trois URL, séparées par des
   virgules, sans espace ni barre oblique finale** :

```
https://drop-shipper.fr,https://www.drop-shipper.fr,https://drop-ship-pro.vercel.app
```

5. Enregistrer.

> Le code accepte désormais une liste. Une seule valeur ne suffit pas : le site
> est joignable depuis trois origines différentes, et le navigateur bloque
> celles qui ne sont pas explicitement autorisées.

---

## Étape 2 — Ajouter `RESEND_API_KEY` *(active l'envoi réel des emails)*

Sans cette variable, l'application fonctionne mais **aucun email ne part** : les
liens de réinitialisation de mot de passe s'écrivent seulement dans les logs.
La récupération de compte est donc inutilisable pour un vrai client.

Max possède déjà un compte Resend. Le partage des rôles est le suivant.

**Ce que l'assistant fait — préparer les deux écrans :**

1. Ouvrir https://resend.com/api-keys dans un onglet.
   - Si aucune clé n'existe : cliquer **Create API Key**, nom `dropship-pro`,
     permission **Sending access**, domaine *All domains*, puis **Add**.
   - La clé complète (`re_…`) ne s'affiche **qu'une seule fois** à la création :
     laisser cet écran ouvert et prévenir Max immédiatement.
2. Ouvrir Railway → service **backend** → **Variables** dans un second onglet.
3. Créer la variable avec un nom seul : **+ New Variable**, nom
   `RESEND_API_KEY`, **laisser la valeur vide**.

**Ce que Max fait — la copie de la clé :**

Il copie la clé depuis l'onglet Resend et la colle dans le champ valeur côté
Railway, puis enregistre.

> ⚠️ **L'assistant ne doit ni lire, ni copier, ni saisir la clé.** Une clé d'API
> est un identifiant : elle donne le droit d'envoyer des emails au nom du
> domaine de Max et se facture. Le déplacer se fait sous son contrôle direct.
> L'assistant se contente d'ouvrir les deux écrans et de le signaler.

Optionnel, même écran, si Max possède un domaine vérifié chez Resend :
- Nom : `MAIL_FROM`
- Valeur : `DropShip Pro <contact@drop-shipper.fr>`

Optionnel, même écran, si Max possède un domaine vérifié chez Resend :
- Nom : `MAIL_FROM`
- Valeur : `DropShip Pro <contact@drop-shipper.fr>`

Sans cette variable, l'expéditeur par défaut `onboarding@resend.dev` est utilisé —
suffisant pour tester, mais les messages risquent d'arriver en indésirables.

---

## Étape 3 — Vérifier le volume de stockage

À contrôler s'il n'a pas été fait au premier mémo.

1. Service backend → **Settings** → section **Volumes**.
2. Il doit exister un volume monté sur :

```
/app/storage
```

3. S'il est absent : **+ Add Volume**, mount path `/app/storage`.

> Sans volume, le disque de Railway est effacé à chaque redéploiement, et toutes
> les photos produit filigranées disparaissent.

---

## Étape 4 — Redéployer

1. Onglet **Deployments**.
2. Menu `···` du dernier déploiement → **Redeploy**.
3. Attendre la fin (statut *Success*).

> Une modification de variable ne prend effet qu'au redéploiement.

---

## Étape 5 — Vérifications

**A. L'API accepte le domaine personnalisé**

Ouvrir https://drop-shipper.fr, puis la console du navigateur (F12 → *Console*),
et exécuter :

```js
fetch('https://dropshippro-production.up.railway.app/api/health')
  .then(r => r.json())
  .then(d => console.log('OK', d))
  .catch(e => console.log('BLOQUÉ', e.message))
```

- Attendu : `OK {ok: true}`
- Si `BLOQUÉ` : l'étape 1 n'a pas pris effet, ou le redéploiement n'est pas terminé.

**B. La connexion fonctionne sur le domaine personnalisé**

Sur https://drop-shipper.fr → *Tableau de bord* → se connecter avec l'adresse
`maxmartinel34@gmail.com`. **Le mot de passe est à saisir par Max** — ne pas le
demander. La page des annonces doit afficher 9 annonces.

**C. Les emails partent réellement** *(seulement si l'étape 2 a été complétée par Max)*

Sur https://drop-shipper.fr/forgot-password, saisir `maxmartinel34@gmail.com` et
valider. Un email doit arriver dans les minutes qui suivent.

---

## À rapporter à Max

1. Résultat du test A (`OK` ou `BLOQUÉ`).
2. Confirmation que le volume `/app/storage` existe.
3. Rappel que `RESEND_API_KEY` reste **à renseigner par lui**, sans quoi la
   réinitialisation de mot de passe n'est pas utilisable par ses clients.
4. En cas d'échec du déploiement : les 20 dernières lignes des logs de build.
