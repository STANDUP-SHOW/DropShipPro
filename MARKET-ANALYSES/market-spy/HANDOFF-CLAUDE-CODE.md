# MARKET-SPY AGENTS — dossier de passation pour Claude Code

Projet : **drop-shipper.fr** (Maxime). Moteur de rapports quotidiens par rayon (aiMARKET / MarketSpy).
Pilote : rayon **TELEPHONIE**, rotation de 7 sous-thèmes (1 par jour de la semaine).
Ce dossier contient 4 agents de veille produits en session Cowork le 03-04/10/2026. **Aucun n'a encore tourné en production.**

## 1. Vue d'ensemble

| Agent | Source | Méthode | Horaire | Sortie (dans `MARKET-ANALYSES/`) |
|---|---|---|---|---|
| **MINEA-SPY** | app.minea.com | Navigateur headless (Browserless/Puppeteer) + cookies de session | 06:00 | `TELEPHONIE-JJ-MM-AA-MINEA.json/.md` |
| **DROPSHIP-SPY** *(bonus, nécessaire au croisement)* | app.dropship.io | Navigateur headless + **interception des réponses JSON** de `api.dropship.io` | 06:20 | `…-DROPSHIP.json/.md` |
| **TIKTOK-SPY** | TikTok **Commercial Content API** (officielle, DSA) | HTTP direct (n8n Code + `this.helpers.httpRequest`) | 06:40 | `…-TIKTOK.json/.md` |
| **META-SPY** | **Meta Ad Library API** `ads_archive` (officielle) | HTTP direct | 06:50 | `…-META.json/.md` |

Chaîne commune à chaque workflow n8n : `Schedule/Manual → Config du jour → Collecte → Parse, score & alertes → Claude (rédaction) → Écrire rapport .md`.

**Croisement des sources** : chaque agent relit les JSON du jour des agents précédents (même rayon, même date) et émet `VALIDÉ n SOURCES` quand une boutique / page / domaine est retrouvé dans plusieurs sources. D'où l'ordre horaire.

## 2. Contenu du dossier

```
minea/      minea-spy-n8n-workflow.json · minea-spy-browserless.js · minea-spy-prompt-systeme.md · nodes/*.js
dropship/   dropship-spy-n8n-workflow.json · dropship-spy-browserless.js · dropship-spy-prompt-systeme.md · nodes/*.js
tiktok/     tiktok-spy-n8n-workflow.json · nodes/*.js
meta/       meta-spy-n8n-workflow.json · nodes/*.js
tests/      tests unitaires des nœuds "Parse, score & alertes" (node tests/test-*.js) — données synthétiques
.env.example
```
- Les `*-n8n-workflow.json` sont **la source de vérité** (importables tels quels dans n8n).
- `nodes/*.js` = copie lisible de chaque nœud Code, pour revue. Le script Browserless est embarqué en chaîne dans le nœud « Payload Browserless » (régénérer le workflow si on modifie le `.js`).
- Les `*-prompt-systeme.md` décrivent la procédure agent (utilisable aussi pour un agent navigateur LLM).

## 3. Prérequis d'exécution

- **n8n self-hosted** avec : `NODE_FUNCTION_ALLOW_BUILTIN=fs,path` et `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (les nœuds Code lisent `$env` et écrivent dans `MARKET_ANALYSES_DIR`).
- **Browserless** (Minea + Dropship) : `docker run -p 3000:3000 -e TOKEN=xxx ghcr.io/browserless/chromium` — endpoint utilisé : `POST {BROWSERLESS_URL}/chromium/function?token=…` (API v2, code ESM `export default async function ({ page, context })`).
- **Claude API** pour la rédaction (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`).
- Voir `.env.example` pour toutes les variables.

## 4. Détails par agent (faits vérifiés vs à vérifier)

### MINEA-SPY
**Vérifié en compte gratuit le 04/10/2026**
- Recherche par URL : `/fr/ads/meta-library?sort_by=-publication_date&query=MOT&q_search_targets=adCopy|pageName|shopDomain` ; produits : `/fr/products?query=MOT`.
- Cartes annonces : ancrage sur le bouton « Analyse de l'annonce », bloc parent contenant 1 seul « annonces actives ». Champs : boutique, annonces actives / total, `Xd Active`, date début, zone (EU/UK), 3 métriques (audience, engagement, commentaires ; alignées à droite si absentes), badge « Impr. faibles », URL produit.
- Cartes produits : nom, « Publié le … », prix, domaine, « N actifs / M annonces totales ».
- **Gratuit** : ~4 annonces / 6 produits par recherche, puis quota **muet** (0 résultat sans message) après 1-2 recherches → le script s'arrête au premier résultat vide (`QUOTA_OU_VIDE`).
- Filtres « Perf. boutique » / « Infos boutique » (CA estimé/jour, visites) = Premium. **MCP officiel Minea** (`/fr/mcp`) = Premium/Business → à privilégier si abonnement.
- Plans (page tarifs) : Starter 49 €, Premium 99 €, Business 199 €/mois. Quotas de recherche **non publiés** → profils prudents dans le script (`PLAN_PROFILES`), à recalibrer au 1er run payant.

**À vérifier** : pagination par scroll en payant ; sélecteur de l'onglet Boutiques (repli générique) ; structure des médias (images/vidéos) non encore extraite.

### DROPSHIP-SPY
**Vérifié en compte trial le 04/10/2026** — réponses JSON interceptées :
- `/api/tiktok_shops/search/…` (Product Library TikTok Shop) · `/api/tiktok_shops/shops/search/…` · `/api/tiktok_creators/search/` · `/api/ad_library/ads/search/…` (FB EU, avec `snapshot` texte+médias) · `/api/advertisers_library/search/…` · `/api/product_database/v3/competitors/search/…` (Shopify) · `/api/tiktok_shops/collections/shops/entities/` (Sales Tracker) · `/api/portfolio/` · `*/filter_presets/` (→ `credits_left`, `total_credits`, `attempts_left`).
- Les recherches filtrées partent avec un **corps chiffré** (`{"encrypted": …}`) → pas d'appel API direct possible, d'où l'interception.
- **1 crédit = 1 résultat affiché** (constaté : 50 créateurs = 50 crédits).
- Plans (page `/setting/plan`) : Basic / Standard / Premium, quotas mensuels codés dans `PLANS` ; budget journalier auto = `(crédits restants − réserve) / jours avant renouvellement / rayons du jour`.

**À vérifier** : sélecteur « page suivante » (heuristique `aria-label/class next`) ; efficacité de la recherche par mot-clé tapée (seule partie dépendante du DOM).

### TIKTOK-SPY
- API : `POST https://open.tiktokapis.com/v2/research/adlib/ad/query/?fields=…`, scope `research.adlib.basic`, token `client_credentials` via `POST /v2/oauth/token/`. 10 résultats / requête, pagination `search_id` + `has_more`.
- Filtres utilisés : `ad_published_date_range` (30 j), `country_code=FR`, `ad_status=ACTIVE`, `search_term`, `search_type=fuzzy_phrase`.
- **Non testé contre l'API réelle** (accès développeur en attente). Format exact de `ad.reach` à confirmer (parse tolérant : objet ou tranche « 10K-100K »).
- **Creative Center / TikTok One** : l'extension navigateur est bloquée sur `ads.tiktok.com` ; la page Top Products n'apparaît plus dans le menu (seuls Top Ads + Trends). Pistes officielles à demander : **Organic API → TikTok One (TTO) API et Discovery API** (business-api.tiktok.com).

### META-SPY
- API : `GET https://graph.facebook.com/{v}/ads_archive` avec `ad_type=ALL`, `ad_reached_countries=["FR"]`, `ad_active_status=ACTIVE`, `ad_delivery_date_min`, `search_terms`. Pagination `paging.next`.
- Champs demandés : `id, ad_creation_time, ad_delivery_start_time, ad_delivery_stop_time, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_captions, ad_creative_link_descriptions, ad_snapshot_url, page_id, page_name, publisher_platforms, languages, eu_total_reach, target_ages, target_gender, target_locations, beneficiary_payers` — **repli automatique** sur une liste minimale si l'API refuse un champ.
- Prérequis : identité vérifiée (facebook.com/ID) + app Meta + token utilisateur long-lived (~60 j, à renouveler).
- **Non testé contre l'API réelle.**

## 5. Scores & alertes (communs)
- Scores /20 : `score_pub` (Minea, dropship FB), `score_ventes` (dropship TikTok Shop), `score_tiktok`, `score_meta`.
- Alertes : `BREAKOUT*`, `NOUVEAU CONCURRENT*`, `PUB ARRÊTÉE`, `FORTE CROISSANCE`, `BAISSE DE PRIX`, `GROS BUDGET PUB`, `VALIDÉ n SOURCES`.
- Historique : chaque agent relit son fichier J-1 (`date_prev`).

## 6. Contraintes produit (à respecter)
- **Agnostique fournisseurs** : aucune promotion d'un fournisseur connecté (ex. BigBuy).
- 20 produits/jour par rayon côté rapport final ; pour un type gagnant, sourcer plusieurs modèles du même type.
- Jamais de saisie d'identifiants par un agent : sessions par cookies exportés, clés API en variables d'environnement.
- Visuels concurrents = analyse uniquement, pas de réutilisation.
- Vérifier les CGU Minea / dropship.io avant mise en production du scraping ; préférer les API/MCP officiels quand disponibles.

## 7. Prochaines étapes suggérées
1. Importer les 4 workflows dans n8n, renseigner `.env`, lancer chaque workflow en **manuel**.
2. Ajuster les sélecteurs signalés « à vérifier » à partir des `warnings` des premiers runs.
3. Ajouter un workflow **agrégateur** (≈07:15) qui fusionne MINEA + DROPSHIP + TIKTOK + META en `TELEPHONIE-JJ-MM-AA-ANALYSEMARCHE` (format aiMARKET, 20 produits, JSON pour le site).
4. Alerte d'expiration du token Meta ; passage Minea → MCP si Premium.
5. Dupliquer par rayon (24) en tenant compte des quotas (dropship Basic ≈ 13 résultats/rayon/jour → rotation de rayons nécessaire).
