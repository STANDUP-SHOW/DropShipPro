# Runbook de relance — moteur d'analyses drop-shipper.fr

Procédure exacte, à exécuter dans l'ordre. Chaque étape a un critère de réussite : ne pas
passer à la suivante sans lui.

---

## Étape 0 — Prérequis

Les deux soldes doivent être rechargés **avant** de commencer. Sinon on s'arrête à
l'étape 4, ce qui est d'ailleurs le comportement voulu.

- `console.anthropic.com` → Plans & Billing
- `serper.dev` → forfait Starter (50 $ / 50 000 crédits)

---

## Étape 1 — Remonter Docker

Le moteur Linux ne démarre pas en ligne de commande, il faut passer par la fenêtre.

```powershell
wsl --list --verbose
# la distribution docker-desktop doit passer de Stopped a Running
```

Ouvrir Docker Desktop à la main et répondre à ce qu'il demande (mise à jour WSL,
conditions, connexion).

**Critère de réussite :**

```powershell
docker ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}"
```

doit lister le conteneur `n8n`. S'il n'apparaît plus du tout, le conteneur a été supprimé :
il faut le recréer avec les deux montages
`C:\Users\maxma\.n8n` → `/home/node/.n8n` et
`C:\Users\maxma\Downloads\DropPost` → `/files/DropPost`, et le port 5678.
La base `C:\Users\maxma\.n8n\database.sqlite` contient les workflows et les identifiants —
elle ne doit surtout pas être recréée vide.

---

## Étape 2 — Démarrer n8n

```powershell
docker start n8n
```

**Critère de réussite :** `http://localhost:5678` répond dans le navigateur.

---

## Étape 3 — Importer les deux workflows corrigés

Les versions chargées dans n8n sont encore celles du 23 septembre. Les corrigées sont sur
le disque mais inertes.

```powershell
cd C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\n8n

# regenerer, au cas ou un .cjs aurait bouge
node _build-workflow.cjs
node _build-orchestrateur.cjs
```

Puis importer les deux JSON par l'interface n8n (menu *Import from file*) :

- `agent-rayon-unifie.workflow.json` — 14 nœuds
- `orchestrateur-quotidien.workflow.json` — 9 nœuds

**Critère de réussite**, à vérifier dans l'interface :

- l'orchestrateur affiche bien la chaîne
  `Rayons du jour → Controle Serper → Controle Claude → Verdict avant la nuit → Un rayon a la fois`
- le nœud `Agent rayon unifie` n'a plus de *Retry on fail*
- les deux workflows ont *Save successful production executions* sur **Do not save**

Les identifiants Serper et Anthropic sont référencés par ID dans les JSON et doivent se
rattacher automatiquement. Si un nœud affiche un identifiant manquant, le re-sélectionner
dans la liste — ne pas ressaisir de clé.

---

## Étape 4 — Tester le contrôle de crédits à vide

Lancer l'orchestrateur **à la main** depuis l'interface (bouton *Execute workflow*).

Deux issues possibles, les deux sont informatives :

- **Les soldes sont bons** → le workflow passe le verdict et enchaîne sur le premier rayon.
  **L'arrêter immédiatement** : on ne veut pas d'une nuit complète avant l'étape 5.
- **Un solde est vide** → le nœud `Verdict avant la nuit` échoue avec le message du
  fournisseur en clair et le préfixe `NUIT ANNULEE AVANT DE DEPENSER QUOI QUE CE SOIT`.
  Coût total : 1 crédit Serper.

**Critère de réussite :** le verdict se prononce. Dans les deux cas le mécanisme est prouvé.

---

## Étape 5 — Un seul rayon, pour valider la qualité

Ne jamais valider la qualité sur une nuit entière. Un rayon coûte ~0,39 € et ~46 crédits.

```powershell
docker exec n8n wget -qO- --post-data='{"categorie":"telephonie","theme":"smartphones","libelle_categorie":"Telephonie","libelle_theme":"Smartphones","date":"2026-10-03"}' --header='Content-Type: application/json' http://localhost:5678/webhook/<chemin-webhook-agent>
```

Le chemin exact du webhook de l'agent se lit sur le nœud `Webhook test` dans l'interface.
Compter **8 à 13 minutes**.

### Les trois contrôles qui ont déjà failli

Sur le `.json` produit dans `MARKET-ANALYSES/rapports/` :

1. **20 produits.** Pas 18, pas 12.
2. **20 URL en `http`, toutes distinctes.** C'est l'engagement commercial. Si des URL de
   listing reviennent en doublon, la deuxième vague Serper n'a pas fonctionné.
3. **Les marges sont en EUROS.** `net_margin_estimated: 280` vaut 280 €, pas 280 %. Le ROI
   en pourcentage est un champ séparé.

À vérifier aussi : les 20 `imageUrl` présentes, et les champs non renseignés marqués
`Non vérifié` plutôt que remplis au hasard — un prix ou une URL inventés sont la seule
faute qui ne se rattrape pas.

### Importer ce rayon dans DropShipper

```powershell
cd C:\Users\maxma\Downloads\DropPost\backend
node importer-aimarket.cjs --fichier "C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\rapports\<fichier>.json"
node memoire-migration.cjs
node memoire-alertes.cjs
```

L'argument `--fichier` est obligatoire pour cibler un fichier précis. Sans lui, le script
réimporte tout le dossier `aiMarket/` — sans dégât, l'import est idempotent, mais ce n'est
pas ce qu'on veut.

Puis ouvrir les pages d'affichage du site et vérifier que les données s'affichent sans
`Cannot read properties of undefined`, et que l'import en lot des produits fonctionne.

**Critère de réussite :** les trois contrôles passent et l'affichage tient.

---

## Étape 6 — La nuit complète

**Uniquement avec l'accord explicite de Max, après validation de l'étape 5.**

```powershell
docker exec n8n wget -qO- --post-data='{}' --header='Content-Type: application/json' http://localhost:5678/webhook/orchestrateur-nuit
```

Compter **~5 heures** pour 24 rayons traités un par un. Lancée à 1h, la nuit est écrite
bien avant 6h. Le lancement en parallèle est exclu : chacun lit des dizaines de pages, et
en parallèle on sature le réseau et on prend des refus des moteurs de recherche.

Laisser la planification de 1h active une fois la première nuit validée.

**Bilan à faire au matin :** nombre de rapports dans `MARKET-ANALYSES/rapports/` à la date
du jour (attendu : 24), nombre d'exécutions en erreur dans n8n, coût réel côté Anthropic et
crédits Serper restants.

---

## Étape 7 — Sept jours plus tard, le vrai jalon

La rotation ramène chaque catégorie sur le même thème tous les 7 jours. À la deuxième étude
d'un même thème, et pas avant :

```powershell
cd C:\Users\maxma\Downloads\DropPost\backend
node memoire-alertes.cjs
```

Le script doit annoncer des thèmes **comparés** et non plus « sans historique », et écrire
autre chose que des `MARGE_FORTE` : `BREAKOUT`, `NOUVEAU`, `BAISSE_PRIX_FOURNISSEUR`,
`HAUSSE_PRIX_FOURNISSEUR`, `MARGE_EN_HAUSSE`, `MARGE_EN_BAISSE`, `DISPARU`.

C'est à ce moment-là que le produit cesse d'être un générateur de rapports et devient ce
qui était visé : un logiciel d'intelligence commerciale avec une mémoire.

---

## En cas de problème

**Le workflow se termine en `success` sans écrire de rapport.** Ne devrait plus arriver —
c'est précisément ce que les gardes corrigent. Si cela se reproduit, lire la sortie du nœud
`Extraire les noms de produits` : une garde a été contournée.

**Claude renvoie un rapport vide**, avec `stop_reason: max_tokens` et
`thinking_tokens: 32000`. Le `output_config: { effort: 'medium' }` a disparu du corps de
requête. La réflexion adaptative à l'effort par défaut avale tout le budget avant d'écrire
une ligne.

**Serper refuse avec « Query pattern not allowed ».** Un opérateur `site:` s'est glissé
dans une requête. Interdit en formule gratuite ; on interroge en langage naturel et on
filtre les URL par motif côté code.

**Les pages du site cassent sur `.length`.** Une nouvelle lecture de tableau a été écrite
sans `?? []`. Et si l'import en lot tombe en même temps, c'est la forme de `reports.data`
qui est en cause : cette colonne est servie telle quelle au frontend, elle doit porter
`{ type, analysis, products[], marketspy }` et rien d'autre.

**Un diagnostic à faire sur les exécutions passées.** Les données d'échec sont conservées
(`saveDataErrorExecution: 'all'`). Requêter
`C:\Users\maxma\.n8n\database.sqlite`, tables `execution_entity` et `execution_data`, de
préférence sur une copie. Les scripts `_diag-*.py` dans `MARKET-ANALYSES/n8n/` font déjà ce
travail. Et si l'agent écrit un `DIAGNOSTIC-reponse-claude.md`, il contient le corps brut
de la réponse API — c'est ce fichier qui a permis de diagnostiquer le rapport vide en
trente secondes.
