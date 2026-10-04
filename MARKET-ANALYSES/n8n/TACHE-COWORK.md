# Tâche pour Claude Cowork — construire les 48 agents dans n8n (Ollama local, 0 coût)

## Contexte en une phrase

Max (drop-shipper.fr) veut que n8n produise chaque matin à 6h 48 rapports de marché
(24 catégories × 2 types : RAYON et MARKETING), en utilisant Ollama en local pour la
rédaction (aucun coût d'API récurrent) et n8n lui-même pour la recherche web (pas de
dépendance à un outil de recherche propriétaire).

## Ce qu'il faut faire, dans l'ordre

1. **Lire d'abord ces deux fichiers de référence** (le contrat métier complet) :
   - [`../README.md`](../README.md) — pourquoi ce format, contrat exact des rapports RAYON et MARKETING, règle d'accès "drops".
   - [`../agents.md`](../agents.md) — la liste lisible des 24 catégories et de leurs 7 thèmes.
   - [`../agents.json`](../agents.json) — la même liste en JSON, avec la formule de rotation.

2. **Lire le fichier de configuration de cette tâche** :
   - [`agents-config.json`](agents-config.json) — contient TOUT : les 24 catégories avec leurs 7 thèmes (dupliqué depuis agents.json pour être autonome), la formule de rotation, le planning (6h Europe/Paris), la config de recherche web (Serper.dev, requêtes types), la config de rédaction (Ollama local, modèle à choisir), et les gabarits de prompt exacts pour chaque agent.

3. **Regarder les deux rapports modèles** pour voir le niveau de qualité et de format attendu (déjà produits manuellement, à titre d'exemple) :
   - [`../rapports/2026-09-18/telephonie/chargeurs-cables.rayon.md`](../rapports/2026-09-18/telephonie/chargeurs-cables.rayon.md)
   - [`../rapports/2026-09-18/telephonie/chargeurs-cables.marketing.md`](../rapports/2026-09-18/telephonie/chargeurs-cables.marketing.md)

4. **Importer les 3 workflows n8n**, dans CET ORDRE (important) :
   1. [`agent-rayon.workflow.json`](agent-rayon.workflow.json) — l'agent RAYON, en sous-workflow réutilisable.
   2. [`agent-marketing.workflow.json`](agent-marketing.workflow.json) — l'agent MARKETING, même principe.
   3. [`orchestrateur.workflow.json`](orchestrateur.workflow.json) — le chef d'orchestre : se déclenche à 6h, calcule le thème du jour pour chacune des 24 catégories, et appelle les deux agents ci-dessus pour chacune (24 × 2 = 48 rapports/jour).

   *(Le fichier `dropshipper-market-agents.workflow.json` est une ancienne version, désormais obsolète — ne pas l'utiliser, il ne contient plus qu'une note de redirection.)*

5. **Pourquoi 3 fichiers et pas 48** : au lieu de dupliquer 24 fois un même agent (48 workflows à maintenir), l'orchestrateur *appelle* les deux agents modèles une fois par catégorie via le node "Execute Workflow" de n8n. C'est fonctionnellement identique à "48 agents" (48 exécutions/jour, un rapport par exécution), mais un seul endroit à corriger si le prompt ou la logique doit changer un jour. C'est la version formalisée de la demande initiale de Max : "un agent modèle rayon et un agent modèle marketing".

6. **Après l'import, deux branchements manuels obligatoires** (n8n régénère les identifiants des workflows importés, donc les références entre eux ne se relient pas automatiquement) :
   - Dans `orchestrateur.workflow.json`, ouvrir le node **"Appeler Agent RAYON"** et sélectionner dans la liste déroulante le workflow **"DropPost — Agent RAYON (modele)"** qui vient d'être importé.
   - Faire pareil sur le node **"Appeler Agent MARKETING"** → sélectionner **"DropPost — Agent MARKETING (modele)"**.

7. **Configurer les deux dépendances externes** :
   - **Serper.dev** (recherche web, remplace un outil de recherche propriétaire type Anthropic web_search) : créer un compte sur serper.dev (tier gratuit ~2500 requêtes), copier la clé API, créer dans n8n une credential de type **"HTTP Header Auth"** avec `Header Name = X-API-KEY` et `Header Value = <la clé>`, puis l'attacher aux deux nodes "Rechercher le web (Serper.dev)" (un dans chaque agent).
   - **Ollama** (rédaction locale, 0 coût) : vérifier qu'Ollama tourne sur la machine (`ollama serve`, généralement automatique), puis télécharger un modèle avec `ollama pull <modele>` — voir `agents-config.json > redaction_llm > modele_a_choisir` pour des suggestions (ex: `llama3.1:8b`, `qwen2.5:14b-instruct`). Remplacer ensuite le texte `REMPLACER_PAR_VOTRE_MODELE_OLLAMA` dans les nodes "Rediger avec Ollama (local)" (un dans chaque agent) par le nom exact du modèle téléchargé.

8. **Adapter les chemins de fichiers** : dans `orchestrateur.workflow.json` (node "Definir chemins"), vérifier que `configPath` et `basePath` correspondent bien à l'emplacement réel de `MARKET-ANALYSES` sur la machine où tourne n8n (si n8n tourne dans Docker/WSL, il faudra monter ce dossier en volume et adapter les chemins en conséquence).

9. **Tester avant d'activer** : exécuter manuellement l'orchestrateur une seule fois (bouton "Execute Workflow" dans n8n), vérifier que les deux fichiers `.rayon.md` et `.marketing.md` de la première catégorie sont bien créés au bon endroit et respectent le contrat (comparer avec les rapports modèles de l'étape 3). Ajuster le prompt si le modèle Ollama choisi dévie du format (tableau incomplet, sections manquantes, etc. — les modèles locaux sont moins disciplinés qu'un modèle cloud sur des formats longs et stricts). Ce n'est qu'une fois ce test concluant qu'il faut activer le workflow (toggle "Active") pour qu'il tourne seul chaque matin à 6h.

## Point d'honnêteté à préserver absolument

Les deux agents ne doivent JAMAIS inventer une URL ou un prix. Le prompt embarqué dans
chaque agent l'interdit déjà explicitement et fournit uniquement des URLs réellement
trouvées par la recherche Serper.dev — si un modèle Ollama contourne quand même cette
règle lors des tests, c'est un signal qu'il faut soit changer de modèle, soit renforcer
encore le prompt (donner un exemple complet dans le prompt aide beaucoup les petits
modèles à respecter un format strict).
