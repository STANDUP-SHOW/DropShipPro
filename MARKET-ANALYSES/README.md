# MARKET-ANALYSES — les 48 agents locaux et leurs rapports

Ce dossier reçoit les rapports produits chaque jour par les agents locaux
(n8n, open source, sans coût d'API pour nous). `agents.json` est **le**
découpage : 24 catégories générales × 7 thèmes, un agent RAYON et un agent
MARKETING par catégorie, soit 48 rapports par jour. Le thème du jour tourne
(jour de l'année modulo 7), le même pour les deux agents d'une catégorie.

Les rapports eux-mêmes vont dans `rapports/` (hors dépôt git : ce sont des
données produites, pas du code).

## Pourquoi un format imposé

Le rapport RAYON n'est pas seulement lu : **sa liste de 20 produits doit
devenir une liste d'annonces importables** (à l'unité ou en lot, vers toutes
les plateformes), et c'est aussi elle qui nourrit l'AUTO-SHIPPER chaque matin.
Un rapport en prose libre ne s'importe pas. D'où le contrat ci-dessous : une
en-tête YAML que l'ingestion lit, une analyse libre pour l'humain, et un
tableau de produits aux colonnes fixes pour la machine.

## Nommage des fichiers

```
rapports/AAAA-MM-JJ/<categorie>/<theme>.rayon.md
rapports/AAAA-MM-JJ/<categorie>/<theme>.marketing.md
```

`<categorie>` et `<theme>` sont les `id` d'`agents.json`. Exemple :
`rapports/2026-09-17/telephonie/chargeurs-cables.rayon.md`.

## Contrat du rapport RAYON

```markdown
---
type: rayon
date: 2026-09-17
categorie: telephonie
theme: chargeurs-cables
titre: Chargeurs, câbles et batteries externes — ce qui se vend en septembre 2026
agent: rayon-telephonie
sources: 6
---

## Analyse
(libre : marché, saisonnalité, gammes de prix, ce qui monte, ce qui sature,
pièges — le niveau d'un directeur marketing, avec les sources en liens)

## 20 produits proposés

| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |
|---|-------|-------------|-----------------|--------------|------------------------|---------|--------|----------|
| 1 | Chargeur GaN 65 W 3 ports | CJ Dropshipping | https://… | 9,80 | 24,90 | 61 | api | … |
```

Colonnes du tableau, toutes obligatoires :

| Colonne | Règle |
|---|---|
| Titre | Court, en français, sans majuscules criardes |
| Fournisseur | Nom tel qu'il figure dans `backend/src/services/suppliers.ts` (CJ Dropshipping, BigBuy, AliExpress, Temu, …) |
| URL fournisseur | Adresse de la fiche produit, **une fiche précise**, pas une recherche |
| Prix achat € | En euros, TTC hors port, nombre avec virgule |
| Prix vente conseillé € | Prix public observé ou recommandé |
| Marge % | (vente − achat) / vente, arrondi |
| Import | `api` (fournisseur relié : CJ, BigBuy, AliExpress par clé), `url` (fiche lisible par adresse) ou `extension` (Temu, AliExpress sans clé, Shein, SUPER DELIVERY : la page se construit en JavaScript, seul le navigateur la lit) |
| Pourquoi | Une phrase : le signal qui justifie le choix (tendance, marge, note, saison) |

**Règle qui compte pour l'AUTO-SHIPPER** : seuls les produits `api` et `url`
peuvent être importés sans humain. Un produit `extension` reste dans la liste
(le vendeur peut le relever lui-même), mais l'import automatique du matin le
saute. Un agent qui veut peser sur l'AUTO-SHIPPER choisit donc ses 20 produits
d'abord chez les fournisseurs reliés.

## Contrat du rapport MARKETING

```markdown
---
type: marketing
date: 2026-09-17
categorie: telephonie
theme: chargeurs-cables
titre: …
agent: marketing-telephonie
sources: 8
---

## Social places
## Publicités en cours
## Tendances du jour
## Tendances publicitaires
## Prompts d'images publicitaires
## Prompts de vidéos publicitaires
```

Les six sections sont libres, mais **présentes et dans cet ordre** — l'écran
les affiche par onglets. Chaque prompt d'image ou de vidéo tient en un bloc
```` ``` ```` autonome, copiable tel quel, avec le format visé en première
ligne (`# TikTok 9:16 — 15 s`, `# Facebook 1:1`…).

## Qui y a accès

Gratuit, réservé aux comptes qui ont **au moins 500 drops en banque** au moment
de la lecture. Ce n'est pas un abonnement : c'est un solde. Le vendeur qui
descend sous 500 drops garde ce qu'il a déjà importé et perd la lecture des
nouveaux rapports jusqu'à sa prochaine recharge.

## Ce qui reste payant

- l'analyse **produit par produit** des annonces du vendeur (prix, positionnement) par le chef de rayon ;
- le rapport produit sur demande : une annonce confrontée au marché fournisseurs et aux places de marché.

## Comment les rapports arrivent au serveur

Les agents écrivent ici, sur la machine de Max. Le serveur ne lit pas ce
disque : un déposeur (script ou nœud n8n final) envoie chaque rapport par
`POST /api/agent/*` avec la clé d'agent du compte administrateur, comme les
enquêtes quotidiennes. À écrire — voir `docs/` quand ce sera fait.
