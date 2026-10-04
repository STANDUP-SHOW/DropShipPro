# Reprise de session — drop-shipper.fr / moteur d'analyses

État arrêté le **30 septembre 2026 au soir**. Rien n'a pu être vérifié depuis : le pont
vers la machine a été coupé une partie du temps. Tout ce qui suit est à reconfirmer avant
d'agir.

---

## 1. Où en est le système, en une phrase

Le moteur est **techniquement prêt et à l'arrêt complet** : les deux fournisseurs d'API
sont à zéro crédit, n8n ne tourne plus depuis le 24 septembre à 1h du matin, et les deux
workflows corrigés attendent sur le disque sans avoir été réimportés.

Aucun rapport n'a été produit depuis le **23 septembre**.

---

## 2. Ce qui a cassé, et pourquoi ça a cassé deux fois

Diagnostic établi dans les exécutions n8n 150 à 173.

Le solde Anthropic est tombé à zéro le 23 septembre vers 15h38. Dix-sept exécutions
d'affilée ont alors échoué sur le dernier nœud de l'agent, `Rediger (Claude)` :

```
400 - {"type":"error","error":{"type":"invalid_request_error",
"message":"Your credit balance is too low to access the Anthropic API."}}
```

Or dans l'agent, l'appel à Claude est la **dernière** étape : chaque rayon fait d'abord ses
~46 requêtes Serper et lit ses 25 pages. Les 17 rayons ont donc dépensé leur quota Serper
complet pour aller se casser sur un mur. Le `maxTries: 2` a doublé la facture d'une panne
qui n'avait aucune chance de passer au second essai. Environ **780 crédits Serper brûlés
pour zéro rapport**, et les 2 500 crédits gratuits — offre unique, non renouvelable — y
sont passés. À 15h48, Serper a commencé à répondre `400 Not enough credits`.

**Et personne n'a rien vu pendant six jours.** Quand Serper refusait, le nœud était réglé
en « continuer malgré l'erreur » : l'erreur redescendait comme une donnée ordinaire, la
liste de produits sortait vide, les nœuds suivants n'avaient rien à traiter, et n8n
concluait `success`. Les exécutions 171 et 173 sont marquées réussies alors qu'elles n'ont
rien produit. Un échec déguisé en réussite ne déclenche aucune alerte.

Depuis le 24 septembre à 1h, plus aucune exécution : Docker s'est arrêté, la machine a
redémarré le 29 et le moteur Linux de Docker Desktop ne se relance pas seul.

---

## 3. Ce qui a été corrigé le 30 septembre

Les quatre correctifs sont **écrits sur le disque** et **pas encore chargés dans n8n**.

**Contrôle avant la nuit.** L'orchestrateur a trois nœuds de plus — `Controle Serper`
(1 crédit), `Controle Claude` (4 tokens), `Verdict avant la nuit`. Les deux appels de
contrôle sont en `executeOnce` et `onError: continueRegularOutput`, pour qu'une erreur
arrive comme donnée lisible plutôt que de tomber dans un coin de l'interface. Le nœud
`Verdict` lit les deux réponses et lève une exception avec le message du fournisseur en
clair. Coût d'une panne : 1 crédit au lieu de 1 100.

**Plus de faux succès.** Trois gardes dans l'agent : un refus Serper détecté explicitement,
une liste de noms de modèles vide, une première vague sans réponse — chacune lève une
exception plutôt que de clore le rayon en « réussi ».

**`maxTries` ramené à 1** sur le nœud agent de l'orchestrateur. Le contrôle en tête de nuit
remplace le retry.

**Rétention n8n bridée.** `saveDataSuccessExecution` passé de `'all'` à `'none'`,
`saveExecutionProgress` à `false`, `saveDataErrorExecution` maintenu à `'all'` — ce sont les
données d'échec qui ont permis ce diagnostic. La base est passée de **478 Mo à 24 Mo** après
purge des 168 vieux payloads (8 à 12 Mo de HTML brut chacun) et un `VACUUM`. L'historique
des 173 exécutions est conservé.

Sauvegardes dans `MARKET-ANALYSES/n8n/_sauvegardes/` :
`database.sqlite.2026-09-30_20h28.bak`, `copie-diagnostic-23sept.sqlite`,
`rapports.db.avant-import-3rapports.bak`.

---

## 4. État de la base DropShipper

| | |
|---|---|
| reports | 37 |
| products | 202 — dont 170 vrais produits, 190 avec prix d'achat |
| alerts | 82, **toutes de type `MARGE_FORTE`** |
| thèmes couverts | 17, **chacun sur une seule date** |

**Il n'existe encore aucune alerte de comparaison.** Le moteur de diff fonctionne — validé
sur copie, il détectait correctement les baisses de 20 %, les disparitions et les
mouvements de marge — mais il n'a rien à comparer : `memoire-alertes.cjs` répond
« 17 thèmes examinés : 0 comparés à une étude antérieure ».

La série temporelle démarre à la **deuxième étude d'un même thème**, soit 7 jours après une
première nuit qui passe. C'est le vrai jalon du projet, et il n'est pas encore atteint.

Deux rapports ont été importés le 30 septembre : `2026-09-20_telephonie_smartphones` et
`2026-09-23_electromenager_robots-cuisine`. Le `2026-09-19_telephonie_smartphones` est
refusé par l'importeur — il date d'avant le prompt aiMARKET et son bloc `study` n'a pas le
format attendu. C'est normal, et c'est pour cela qu'il n'y a pas de couple
smartphones 19/20 exploitable.

---

## 5. Les trois blocages, dans l'ordre

### a. Recharger Anthropic — bloquant
`console.anthropic.com` → Plans & Billing.
Une nuit complète = 24 rapports × ~0,39 € ≈ **9,40 €**, soit ~285 €/mois.
Décision en attente : passer en **Batch API** diviserait par deux (~143 €/mois) au prix
d'une latence de quelques heures, ce qui est sans conséquence pour un traitement de nuit.

### b. Recharger Serper — bloquant
Les 2 500 crédits gratuits sont épuisés et ne se renouvellent pas.
Forfait Starter : **50 $ pour 50 000 crédits, valables 6 mois**.
À ~1 100 crédits/nuit, cela fait ~45 nuits, soit ~33 $/mois.

Levier disponible : la deuxième vague représente 26 des 46 requêtes et ne sert qu'à
transformer les URL de catégorie en URL de fiche produit. La ramener de 26 à 12-15 modèles
descend la nuit vers ~800 crédits sans perdre les 20 produits — le plafond est la constante
`PLAFOND` dans `codeNoms`, fichier `_build-workflow.cjs`. **Décision en attente.**

### c. Relancer Docker — bloquant
Docker Desktop est installé et ses processus d'interface démarrent, mais le moteur Linux ne
monte pas : `wsl --list --verbose` montre la distribution `docker-desktop` à l'état
`Stopped`, et `docker ps` répond
`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`.
Il attend vraisemblablement un clic dans sa fenêtre — mise à jour WSL, conditions
d'utilisation, ou connexion. À faire à la main.

---

## 6. Ce qui reste à construire, par ordre de valeur

**Injecter l'étude précédente dans le prompt.** C'est la couche narrative de la mémoire :
l'IA doit expliquer *pourquoi* un produit a bougé, suivre un POCO X7 devenant un POCO X8,
commenter une marge qui s'érode. Aujourd'hui chaque étude repart de zéro. Techniquement
prêt dès qu'un thème a deux dates.

**Exposer les alertes dans l'interface.** La table `alerts` est remplie et n'est lue par
aucun écran. C'est du MARKET ALERT invisible.

**La requête transversale « 200 meilleurs produits de la semaine ».** C'est la promesse
commerciale finale. Elle a besoin de plusieurs jours de données sur les 168 thèmes.

**Un navigateur sans interface (Playwright)** pour remplir les champs `Non vérifié` — MOQ
réel, note fournisseur, stock UE — et pour débloquer les pages produit de Cdiscount,
idealo, CJ et AliExpress, aujourd'hui protégées par anti-bot.

**`AGENT_API_KEY` dans `backend/.env`**, à générer depuis l'écran Réglages › API (le
composant `ApiKeys` était orphelin, il est monté depuis). Nécessaire à
`deposer-rapports.ts`. En attente de Max.

**Surveiller l'heuristique de clé produit** sur une semaine de données réelles. La clé est
construite sur les 5 premiers jetons significatifs du titre avant le tiret cadratin,
accents retirés, mots de bruit écartés. Elle n'a jamais été éprouvée sur deux études d'un
même thème — l'ajuster sur des échecs concrets, pas par anticipation.

---

## 7. Ce que je ferais à la reprise

Dans cet ordre, sans en sauter :

1. Confirmer l'état réel — Docker, n8n accessible, nombre de fichiers dans
   `MARKET-ANALYSES/rapports/` par date. Ne rien supposer de ce document.
2. Si les deux soldes sont rechargés : importer les deux workflows corrigés, puis lancer
   **un seul rayon** par le webhook de l'agent. Un rayon coûte ~0,39 € et ~46 crédits — on
   valide la qualité sur lui, pas sur une nuit entière.
3. Vérifier sur ce rayon les trois choses qui ont déjà failli : 20 produits, 20 URL `http`
   toutes distinctes, et les prix en euros et non en pourcentage.
4. Seulement ensuite, et seulement avec l'accord explicite de Max, lancer la nuit complète
   par le webhook `orchestrateur-nuit` et laisser la planification de 1h active.
5. Au bout de 7 jours, relancer `memoire-alertes.cjs` : c'est là que les premières vraies
   alertes de comparaison apparaissent, et là que le produit commence à exister.

Une leçon de ce projet, à garder : dans cette conversation, l'explication évidente s'est
trompée trois fois sur quatre. Le rapport vide n'était pas une mauvaise clé mais la
réflexion adaptative. Les pages cassées n'étaient pas un bug du frontend mais ma forme de
données. Le silence de six jours n'était pas une panne visible mais un échec déguisé en
succès. **Établir les faits avant de confirmer une hypothèse**, même quand elle est juste.
