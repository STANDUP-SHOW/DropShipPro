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

## Limites connues, à lire

- **Le prompt est reconstruit**, pas copié : le prompt d'origine vit dans
  `_build-workflow.cjs` sur le PC de Max, hors du dépôt. Celui d'ici (`prompts/rayon.md`)
  reproduit le format MarketSpy lu par l'importer. Pour une fidélité exacte, Max remplace
  `C:\DropShipper-Analyses\prompts\rayon.md` par le sien (aucune réinstallation).
- Les gardes et le format sont testés contre de **faux** Serper/Claude. La qualité d'un
  vrai rapport n'est constatée qu'au premier rayon test.
- **Publication sur le site** : la production lit `backend/rapports.db`, alimentée par
  `importer-aimarket.cjs` puis commitée (comme dans `RUNBOOK-relance.md`). Le poste
  écrit le JSON prêt à importer ; l'envoi automatique (`POST /api/agent/market-reports`,
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
