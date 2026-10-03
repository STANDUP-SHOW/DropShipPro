# DropShipper Poste d'analyses

L'application Windows de Max pour son PC dédié (faible configuration, sans carte
graphique). Elle remplace n8n + Docker : les **agents d'analyse** (les mêmes
rapports que les workflows n8n), un **navigateur Chromium privé** à sessions
persistantes pour les sites de données qu'il ajoute, et le **dossier de dépôt**
des rapports créé par l'installateur. Application à part de DropShipper
Desktop (celui des clients) : elle porte des clés qui n'appartiennent qu'à Max.

Décisions de Max (03/10/2026) : application à part, à lui seul ; agents portés en
Node avec les mêmes spécifications et les mêmes rapports complets ; navigateur
intégré pour les sites de données (Ads Library Facebook, TikTok Ads Library…) ;
les agents restent sur des API (Claude, Serper), le PC ne calcule rien.

## Installer

Dernier installateur : onglet **Releases** du dépôt › « Poste d'analyses — dernier
installateur » (construit par `.github/workflows/poste-analyses-windows.yml`).
**Non signé** : SmartScreen affichera « Éditeur inconnu » › Informations
complémentaires › Exécuter quand même.

L'installateur crée `C:\DropShipper-Analyses\` (rapports, releves, journaux,
diagnostics, sauvegardes, prompts) et une tâche Windows qui relance l'application
toutes les 10 minutes si elle est arrêtée. Le désinstaller ne supprime jamais le
dossier de dépôt.

## Premier lancement (dans cet ordre)

1. **Réglages** › poser les clés Anthropic et Serper (chiffrées par Windows, jamais réaffichées).
2. **Sources & navigateur** › ajouter chaque site de données, s'y connecter soi-même dans la fenêtre.
3. **Tableau de bord** › « Contrôler les crédits » (1 crédit Serper + 4 tokens Claude).
4. « Lancer UN rayon test » (~0,39 € et ~46 crédits Serper) puis lire le rapport :
   20 produits, 20 URL `http` distinctes, marges en euros, champs non vérifiés = « Non vérifié ».
5. Seulement ensuite, avec accord explicite : « Lancer la nuit complète » ou
   « Activer la nuit automatique » (une fenêtre de confirmation s'ouvre à chaque fois).

Rien ne tourne seul tant que la nuit automatique n'est pas activée.

## Ce que fait un rayon (`lib/rayon.js`)

20 recherches Serper → lecture de ≤ 25 pages (HTTP simple) → noms de modèles (petit appel Claude)
→ une recherche par modèle (≤ 26) → lecture des sites de données connectés →
UN appel Claude (`output_config: { effort: 'medium' }`) → validation → fichiers.
L'appel Claude est le dernier : toutes les gardes (refus Serper, première vague vide,
liste de modèles vide, réponse vide/tronquée/illisible) lèvent une erreur avant.

Sortie, dans `rapports\AAAA-MM-JJ\<categorie>\` : `<theme>.json` (format MarketSpy,
lu tel quel par `backend/importer-aimarket.cjs`), `<theme>.rayon.md` et
`<theme>.marketing.md` (contrat de `MARKET-ANALYSES/README.md`).

**Jamais d'URL ni de prix inventés** : une `supplier_url` absente des pages réellement
lues devient « Non vérifié » et le rapport passe « à revoir » (non envoyé au site).

## Signaux publics (lib/signaux.js, 03/10/2026)

Après la deuxième vague, le rayon ajoute aux preuves, sans compte ni connexion :
- les **questions et recherches associées** de Google (déjà dans les réponses Serper) ;
- **Google Trends** (France, 12 mois) : la courbe du thème et celle des 5 premiers modèles
  comparés (indice moyen, variation des 8 dernières semaines, pic) ;
- **Meta Ad Library** : pour chacun des ≤ 6 premiers modèles (nom exact), nombre d'annonces
  actives en France et ancienneté de la plus ancienne vue.

Lues dans une fenêtre cachée, espacées de 4 s. Le premier captcha ou la première demande de
connexion arrête la source pour toute la nuit. Une valeur non lue s'écrit « illisible » ou
« bloqué », jamais un chiffre de remplacement ; une panne des signaux ne fait pas échouer le
rayon. Le relevé brut est gardé dans `releves\AAAA-MM-JJ\signaux\`. Cases à cocher dans Réglages.
**Vérifié seulement contre de fausses pages** (Google et Meta n'ont pas été appelés depuis le banc) :
si leur texte ou leur format a changé, les lignes sortent « illisible » et il faut adapter
`extraireMetaAds` / `extraireTrends`. Conditions d'utilisation de ces sites à vérifier par Max.

## Lectures Serper étendues (lib/serper-etendu.js, 03/10/2026)

Trois lectures de plus avec la clé Serper existante, après la deuxième vague (les 46 requêtes
d'origine ne bougent pas) :
- **Shopping** : pour chacun des ≤ 20 premiers modèles, les offres Google Shopping France
  (vendeur, prix affiché, note). Le prix est lu, jamais deviné : « Voir le prix » reste
  « Non vérifié ». Les liens de redirection Google ne deviennent pas des URL fournisseur.
- **Autocomplétion** : ce que les acheteurs tapent (thème, catégorie, 5 premiers modèles).
- **Images** : adresses d'images réelles, les seules que `image_url` peut reprendre (≤ 10 modèles).

1 crédit par lecture, soit au plus 20 + 26 + 7 + 20 + 10 = 83 crédits Serper par rayon (le
tableau de bord l'affiche). Le premier refus (crédits, quota) coupe les lectures suivantes,
marquées « non lues » ; il ne fait jamais échouer le rayon. Relevé brut :
`releves\AAAA-MM-JJ\serper\`. Cases et plafonds dans Réglages. Le budget de preuves envoyé à
Claude passe de 90 000 à 120 000 caractères pour les loger.

## Choisir les rayons de la nuit

Onglet « Rapports du jour » : une case par rayon. Sans choix, les 24 tournent ; avec un choix
(par exemple deux, pour tester), « Lancer la nuit » et la nuit automatique ne font que ceux-là
(le coût annoncé dans la fenêtre d'accord suit : ≈ 0,39 € par rayon). Rien coché = rien ne
tourne. Le choix est gardé d'une ouverture à l'autre, et un rayon déjà validé aujourd'hui est
sauté. Boutons : tout cocher, tout décocher, cocher ceux pas encore validés.

## Envoi au site : comment un rapport arrive en ligne (03/10/2026)

Le site (drop-shipper.fr) ne lit PAS le dossier `C:\DropShipper-Analyses` : il lit `rapports.db`
(livrée avec le code) **plus** une deuxième base, `rapports-poste.db`, tenue sur son disque durable
(volume `/app/storage`). Le Poste y écrit par `POST /api/agent/rapports-poste` (clé d'agent du compte
administrateur, Réglages › Clés) :

- **un envoi = un rapport complet** (le JSON MarketSpy) ; le site en fait lui-même le rapport RAYON
  (analyse + produits → Analyses, Produits gagnants) et le rapport MARKETING (prompts, tendances →
  Prompts, Fresh news), chacun à sa place, avec le même code que `importer-aimarket.cjs` ;
- **seuls les rapports validés partent** (20 produits, 20 URL distinctes, marges en euros). Un rapport
  « à revoir » reste sur ce PC et n'est jamais proposé à l'envoi ;
- il part **tout seul** dès que le rayon est validé ; un envoi refusé ou tombé pendant un
  redémarrage du site reste « en attente » (colonne Site, bouton « Envoyer… ») et repart à la fin de
  la nuit. La preuve d'envoi est un fichier `<thème>.envoi.json` à côté du rapport, liée à CETTE
  version : un rayon refait le même jour repart et remplace l'ancien sur le site ;
- l'identifiant exact de la catégorie (`study.category_id`) accompagne le rapport : le nom ne le
  redonne pas pour 14 catégories sur 24 (« TV, son et photo » ≠ `tv-son-photo`).

Rien n'est en ligne tant que cette version du **site** n'est pas déployée (fusion de la PR sur `main`).
Avant, le Poste reçoit un refus 404 et garde les rapports en attente.

## Limites connues, à lire

- **Le prompt est reconstruit**, pas copié : le prompt d'origine vit dans
  `_build-workflow.cjs` sur le PC de Max, hors du dépôt. Celui d'ici (`prompts/rayon.md`)
  reproduit le format MarketSpy lu par l'importer. Pour une fidélité exacte, Max remplace
  `C:\DropShipper-Analyses\prompts\rayon.md` par le sien (aucune réinstallation).
- Les gardes et le format sont testés contre de **faux** Serper/Claude. La qualité d'un
  vrai rapport n'est constatée qu'au premier rayon test.
- **Publication sur le site** : la production lit `backend/rapports.db`, alimentée par
  `importer-aimarket.cjs` puis commitée (comme dans `RUNBOOK-relance.md`). Le poste
  écrit le JSON prêt à importer ; l'ancien envoi (`POST /api/agent/market-reports`, écrit dans une table que plus aucun écran ne lit,
  Réglages › « Envoyer… » + clé d'agent) existe mais la production ne lit pas cette voie.
- Les sites de données sont lus par un navigateur normal, à intervalle fixe, sans aucune
  évasion anti-robot ; le premier captcha ou blocage arrête la source. Aucune extraction
  spécifique à un site n'est écrite : chaque source relève le texte des pages que Max indique.
  Avant de brancher un site, vérifier que ses conditions autorisent une lecture automatisée.
- « Ne se déconnecte jamais » : le profil reste sur le disque et une visite légère toutes
  les 30 minutes entretient la session, mais c'est le site qui décide quand elle expire.
  Le poste le détecte et prévient ; Max se reconnecte lui-même.
- Installateur : construit et vérifié sur un runner Windows (non construit dans le conteneur
  de développement, qui n'a pas Wine). Pas de signature de code ni de mise à jour automatique.
- Configuration minimale visée : 8 Go de mémoire et un SSD, à confirmer sur la vraie machine.

## Développer

```bash
cd analyses
npm install
npm run check                       # 21 tests de logique (faux Serper/Claude/pages, importer et lireRapport du dépôt)
xvfb-run -a npm run check:fenetre   # la VRAIE fenêtre Electron (Linux) ; sous Windows : npm run check:fenetre
npm start
npm run build                       # installateur (sous Windows)
```
