# DropShipper IA — mémo projet (version courte)

Ce fichier est relu **à chaque tour** de chaque session : chaque ligne ici se
paie des centaines de fois. Il ne garde que les règles durables. L'histoire
complète des pannes et décisions (105 Ko) est dans **`docs/memoire-projet.md`** :
la consulter par `grep -n "<mot-clé>" docs/memoire-projet.md` puis lire la
section utile, **jamais en entier**. État du chantier : `REPRISE.md` (même
consigne : lire ce qui sert).

## Économie — à respecter par Claude (voir `docs/couts-claude.md`)

- **Modèle : Sonnet par défaut.** Opus seulement si Max le demande pour une
  tâche difficile. Si la session tourne sur Opus pour une tâche courante
  (pub, texte, petit correctif), le rappeler une fois à Max (`/model`).
- **Une session = une tâche.** Pas de session-fleuve : le contexte grossit et
  chaque tour recoûte tout ce qui précède. Tâche finie → le dire, Max ouvre une
  nouvelle session.
- **Lire peu** : `grep`/`sed -n` ciblés plutôt que des fichiers entiers ; pas de
  lecture d'images à la chaîne (une planche contact réduite, pas dix captures).
- **Pas de surveillance planifiée** (check-in horaire de PR, routines,
  `send_later`, abonnement aux PR) **sauf demande explicite de Max** : une
  vérification toutes les heures la nuit rejoue tout le contexte pour rien.
- **Utiliser les skills** (`.claude/skills/`) : elles contiennent la méthode,
  inutile de la redécouvrir. Pubs vidéo : skill `pub-video`.
- Réponses courtes à Max, en français, sans récapitulatif inutile.

## Ce que fait l'application

Import d'un produit depuis n'importe quelle boutique → l'IA réécrit l'annonce →
filigrane → publication vers des marketplaces / boutiques.

| Élément | Adresse |
|---|---|
| Site | https://www.drop-shipper.fr (Vercel, Root Directory = `frontend`) |
| API | https://dropshippro-production.up.railway.app (Railway, racine `backend/`) |
| Dépôt | https://github.com/STANDUP-SHOW/DropShipPro |
| Base | PostgreSQL sur Railway — **la même en local et en production** |

`localhost` n'est pas l'application du client : tester sur `www.drop-shipper.fr`.
`www.drop-shipper.fr/api/*` est une **réécriture Vercel** vers Railway (`frontend/vercel.json`).
Main = production : Railway et Vercel suivent `main`, chaque fusion redéploie (Railway : 502
quelques minutes, prévenir Max). « Corrigé sur la branche » ≠ « corrigé en ligne » : dire lequel.

## Structure

```
backend/            Node + Express 4 + TypeScript + Prisma
backend/extension/  Extension Chrome MV3 (Chrome Web Store — Max téléverse le zip)
backend/dropshop/   DropShop IA (boutique écrite par le modèle, moteur sdk.js) — docs/dropshop.md
backend/storefront-boutique/  Vitrine à thèmes servie à /b/<adresse>
frontend/           React + Vite + Tailwind v4
docs/               Documentation ; docs/pub-video/ = pubs vidéo (skill pub-video)
```

## LA règle qui prime

**Aucune commande qui prend une base « jetable » ne reçoit jamais
`DATABASE_URL`** (en tête : `prisma migrate diff --shadow-database-url`, qui a
vidé la production le 01/09/2026 — dix jours de données perdus).

1. Migration écrite à la main ou générée sans base fantôme, appliquée par
   `npx prisma migrate deploy` uniquement. `migrate dev` interactif = signal.
2. **Avant tout changement de schéma : `cd backend && npm run sauvegarde`.** Et AVANT `prisma generate` : un client déjà régénéré lit une colonne absente de la base et la sauvegarde plante sans rien écrire (29/09/2026).
3. Un script qui touche la base n'écrit rien sans `--ecrire`.
4. Un banc qui lance une tournée (AUTO-MODE, AUTO-SHIPPER, réécritures batch)
   lui passe **toujours** son périmètre (compte jetable) ; la production jamais.

## Pièges courts (détail : grep dans docs/memoire-projet.md)

- Page servie par l'API → doit vivre sous `backend/` (Railway ne voit rien d'autre).
- Disque Railway éphémère : volume monté exactement sur `/app/storage`.
- Express 4 : un handler `async` qui lève fait **pendre** la requête sans log.
- `VITE_*` figées à la compilation : changer une variable Vercel = redéployer.
- Railway « failure » sur GitHub = le plus souvent un déploiement REMPLACÉ par le push suivant (`REMOVED` au tableau de bord, constaté le 30/09) : pousser en lots.
- Vercel ne build pas ? `curl -s https://api.github.com/repos/STANDUP-SHOW/DropShipPro/commits/<sha>/status` (plafond Hobby).
- Content scripts : tout appel API passe par le service worker (`apiFetch`).
- `imagesWatermarked` vaut `true` par défaut : tout bloc de création pose `false`.
- Un faux serveur de banc écrit le contrat **en dur** ; un banc synthétique qui
  passe ne prouve pas la réalité (Temu, Shopify taxonomie).
- « Connecté » seulement après un appel réel réussi ; un libellé ne promet que ce qu'une ligne d'envoi fait (03/10 : `api-ready` affiché « connecteur écrit » sans code). Clés des apps : `docs/connecteurs-a-declarer.md`.
- Pas de connexion automatique aux marketplaces : le vendeur se connecte lui-même, ses identifiants ne passent jamais chez nous.
- **Décision de Max (29/09/2026)** : un MODE AUTOMATIQUE de publication (Vinted, Leboncoin, Facebook Marketplace) est permis, par l'application desktop, dans la session du vendeur, **sur son accord explicite** (risque de suspension affiché), avec plafonds et espacement par plateforme, arrêt et alerte au premier captcha ou blocage, journal de chaque publication. **Jamais d'évasion anti-robot** : ni faux profils matériels, ni navigateur « stealth », ni résolution de captcha.
- Node seulement (pas de Python). Pas de police hors Google Fonts.
- JSX : ne pas juxtaposer plusieurs expressions texte dont une chaîne vide.
- Ne pas pousser pendant qu'une création DropShop tourne (`Shop.siteJob` sans `fin`).

## Rapports des 48 agents (`backend/rapports.db`)

- SQLite **versionnée exprès** (voir `backend/.gitignore`) : un rapport n'est en ligne que commité
  et déployé. Remplie en local par `backend/importer-markdown.cjs` (le cas courant : les
  rapports Markdown des tâches planifiées) ou `importer-aimarket.cjs` (JSON aiMARKET
  de n8n). Pas `MarketReport`.
  Chiffres au 04/10/2026 : 87 rapports (44 rayon, 43 marketing), 641 produits,
  26 catégories, 46 thèmes, du 18/09 au 04/10 — relire la base, elle grossit.
- Ouverte par `services/reportsDb.ts` en `{readonly, fileMustExist}`, chemin résolu depuis le
  module (`fileURLToPath(import.meta.url)`), jamais depuis le cwd (`src/` sous tsx ≠ `dist/`) ;
  sinon better-sqlite3 **crée un fichier vide** et tout échoue à la première requête (500).
  Ouverture au premier appel, pas à l'import ; chaque 500 porte un `motif`. Ne pas défaire.
- Routes publiques `routes/reportsPublic.ts`, montées sur `/api` **avant** le routeur privé
  `/api/reports` (dont `/:id` avalerait tout). Elles rendent la forme déclarée dans
  `frontend/src/lib/api.ts` (clés `analyses`, `produits`, `prompts`…), **jamais un tableau nu** :
  les écrans font `.length`/`.filter` dessus. Toutes en `Cache-Control: no-store`.
- Lues à cinq endroits (`SECTION_PAR_ADRESSE`, `frontend/src/lib/nouveautes.ts`) : `/fresh-news`,
  `/analyse-marche`, `/produits-gagnants`, `/reseaux?vue=analyses`, `/reseaux?vue=prompts`
  (plus l'onglet Analyses de chaque rayon). Une forme cassée les vide toutes d'un coup.
- Diagnostic « toujours rien » : `/api/health` 200 = pas de crash au démarrage ;
  `/api/reports-health` nomme la cause ; comparer l'URL www et l'URL Railway — si elles
  divergent, c'est le cache de la bordure Vercel, pas le code.

## Tester un écran protégé sans mot de passe

`npm run dev` (frontend), Chromium de `/opt/pw-browsers/`, `addInitScript` posant
`localStorage.droppost_token = 'test'`, puis `**/api/**` intercepté **en dernier** : Playwright
essaie les routes de la dernière enregistrée à la première, et un filet plus large posé après
répondrait du JSON aux images.

## Charte (29/09/2026)

Sources dans `docs/marque/` (fichiers de Max). Icône DropShipper : cube sur dégradé **orange #f28a4b → rose #e85290** ; boutons principaux (`.btn-gradient`, extension, e-mails, pages statiques) = ce dégradé ; variables `--marque-orange` / `--marque-rose`. DropShop : vert #0b6b33 + orange ; Drops : jaune #fdbf06. Logo du site : `public/marque/dropshipper-complet.png`. Pas de police hors Google Fonts : la « Radeil Rounded » est une démo, elle ne vit que dans les images des logos.

## Commandes

```bash
cd backend && npm run controle         # tous les bancs locaux
cd backend && node extension/check.cjs # avant de livrer l'extension
cd backend && npx tsc --noEmit
cd frontend && npm run build
```

## Conventions

- Interface et erreurs **en français**, commentaires de code en anglais.
- Vérifier avant d'affirmer ; ne jamais annoncer comme marchant ce qui n'a pas été constaté.
- Secrets dans `backend/.env` (hors git), jamais dans le dépôt ni la conversation.
- Une leçon nouvelle et durable : **une ligne ici** + le détail dans
  `docs/memoire-projet.md`. Ne pas regonfler ce fichier.

## LA règle des rapports : rien ne s'annonce sans `verifier-rapports.cjs`

Trois fois le système a échoué **en silence**, et chaque fois la panne a été
découverte des jours plus tard par Max, pas par nous :

- **19/09** — Claude renvoie un rapport vide (la réflexion adaptative avait
  mangé tout le budget de tokens). Rien ne l'a signalé.
- **23/09** — Serper refuse, faute de crédits ; le nœud est en « continuer
  malgré l'erreur », la liste sort vide, n8n conclut **success**. Deux
  exécutions marquées réussies sans rien écrire. Six jours de silence.
- **04/10** — 24 rapports importés, 439 produits, annoncés comme une réussite.
  Contrôle fait après coup : **0 rayon conforme sur 24**, 0 score, 0 verdict,
  0 image sur 439 produits. Le volume avait monté, la substance avait disparu.

Le point commun n'est pas une panne : **rien ne comparait la sortie au
contrat.** D'où la règle, sans exception :

```
cd backend && node verifier-rapports.cjs [--date AAAA-MM-JJ]
```

Sort 0 si conforme, 1 sinon, et nomme chaque rayon fautif. `import-rapports.bat`
l'appelle et refuse en code 2. **Ne jamais annoncer à Max qu'une nuit est
réussie sans avoir lu sa sortie.** Compter les fichiers écrits n'est pas
mesurer la qualité : le 4 octobre, 24 fichiers étaient là et aucun n'était
vendable.

Le contrat : 20 produits, 20 URL http distinctes, ≥10 fiches, prix sur ≥18/20,
score + verdict + image sur ≥16/20. La référence vivante est le rapport
`telephonie/smartphones` du 20/09 — le seul CONFORME de l'historique.

**Deux moteurs produisent des rapports, et c'est la cause structurelle des
régressions.** n8n + Serper + prompt aiMARKET (arrêté depuis le 23/09, solde
Anthropic et crédits Serper à zéro) et les quatre tâches planifiées Cowork
(qui tournent sur l'abonnement, donc survivent aux pannes de clé API). Quand le
bon moteur s'arrête, le faible continue de produire des fichiers et personne ne
voit la bascule. Objectif : **un seul moteur, un seul contrat.** Le prompt des
quatre tâches est versionné dans `MARKET-ANALYSES/PROMPT-TACHES-PLANIFIEES.md`
— les prompts avaient été changés le 03/10 à 22h03 sans trace.

**Les sites fournisseurs se lisent, contrairement à ce que des rapports
affirment.** Vérifié le 04/10 : une fiche BigBuy se lit, seul le prix demande un
compte. Les 404 portent sur les sitemaps et les pages de catégorie — on n'y va
pas. CJ, Temu, Shein sont en JavaScript : classés `extension` depuis septembre,
ce n'est pas une découverte à refaire. Un agent qui « renonce » à un fournisseur
improvise sa recherche au lieu de suivre la procédure en trois vagues.

## Moteur d'analyses de marché (MARKET-ANALYSES)

24 rayons × 7 thèmes, rotation `(jour_de_l_année - 1) % 7`. **Deux** moteurs
produisent, dans deux formats ; le site ne lit ni l'un ni l'autre, il lit
`backend/rapports.db`, versionnée exprès → un `push` est ce qui publie.

- 4 tâches planifiées Claude (04h00/03/06/09 UTC, 6 catégories chacune) écrivent
  du **Markdown** dans `MARKET-ANALYSES/rapports/<date>/<catégorie>/<thème>.{rayon,marketing}.md`
  → `cd backend && node importer-markdown.cjs [--date AAAA-MM-JJ] [--sec]`
- l'agent n8n `agentRayonUnifie` écrit du **JSON** aiMARKET à plat dans `rapports/`
  → `node importer-aimarket.cjs --fichier <chemin>` (n8n à l'arrêt depuis le 23/09)
- puis toujours : `node memoire-migration.cjs` et `node memoire-alertes.cjs`

Règles de Max, non négociables : jamais inventer une URL ni un prix (champ vide
plutôt que vraisemblable) ; aucun fournisseur de référence ; 20 produits **et**
20 URL par rayon et par jour ; les 7 thèmes d'un rayon ne sont pas redondants ;
rien ne s'active sans son accord ; il pose ses clés API lui-même.

Pièges : `output_config: { effort: 'medium' }` obligatoire sur l'appel Claude,
sinon la réflexion avale tout le budget et le rapport sort vide. `reports.data`
est servi tel quel au site — forme `{type, analysis, products[], …}`, sinon les
pages et l'import en lot cassent. Marge en **euros** côté aiMARKET, en **pour
cent** côté Markdown. L'opérateur `site:` est refusé par Serper en gratuit.

État et procédure de relance : `docs/moteur-analyses-etat.md`,
`docs/moteur-analyses-runbook.md`.
