# API Power — les API marketing, ce qu'elles débloquent, et comment leurs données vivront dans le back-office

Écrit le 25/09/2026 à la demande de Max : « nos concurrents se servent des
API Meta Business, Google Ads, Search Console, Analytics… je veux que nous
proposions aussi tous ces connecteurs et que nous mettions en avant ce qu'on
va pouvoir en tirer ». Et la question qui va avec : *avions-nous anticipé ces
connexions, le classement des données et les interventions possibles dans
notre back-end ?*

## Réponse courte : à moitié

Ce qui existait avant ce jour :

| Ce qui existe | Où | Ce que ça fait vraiment |
|---|---|---|
| Passerelle sociale (contrat + deux adaptateurs) | `services/socialTypes.ts`, `socialGateway.ts`, `socialZernio.ts`, `socialMeta.ts` | Publication **organique** sur Facebook et Instagram ; écrit, éprouvé sur faux serveur (`check-meta.ts`, `check-social.ts`), **jamais confronté au vrai Meta** (pas de vérification d'entreprise, pas d'App Review). |
| Comptes publicitaires | table `AdAccount`, écran API Connect | Le vendeur colle l'identifiant de son compte (Meta, Google, TikTok, X, Snapchat, Pinterest) et un jeton. **Rien n'est lu** : l'écran le dit. |
| Flux produit | `services/channelFeeds.ts` | Formats Google Shopping et Meta Catalogue, servis par adresse. C'est ce que consomment Merchant Center et le Commerce Manager. |
| Visuels et vidéos publicitaires | atelier (`adComposer`, `adCopywriter`, vidéo d'annonce) | Le contenu à diffuser existe ; la diffusion payante, non. |
| SEO technique | `build-seo`, `build-geo`, `indexnow.cjs` | Sitemaps, IndexNow, pages pré-rendues ; dépôt Search Console à la main. |

Ce qui n'existait pas : la **lecture** des données (rapports publicitaires,
requêtes Search Console, sessions Analytics, statuts Merchant Center), la
**création** de campagnes, la **remontée des ventes** (Conversions API,
conversions Google, Measurement Protocol), les **messageries** (Messenger,
Instagram), et un **modèle de données** où ranger tout ça. C'est ce que ce
dossier pose.

## Le registre : `services/apiPower.ts`

Une seule table, lue par la page publique `/api-power` (React), par sa version
pré-rendue pour les robots (`build-geo.cjs`, via `frontend/src/data/api-power.json`
engendré par `npx tsx exporter-api-power.ts`) et demain par l'écran du
back-office. Chaque API porte :

- **son état réel** — `ecrit` (code + banc, pas confronté), `flux` (nous servons
  déjà le flux qu'elle consomme), `jeton` (le vendeur peut coller son jeton,
  rien n'est lu), `prevu` (rien d'écrit), `ecarte` (non retenu, avec la
  raison). Le banc `check-geo.ts` refuse une API écartée qui promettrait
  quelque chose et une API retenue sans prérequis ;
- **ses prérequis chez l'éditeur** — les vraies démarches (vérification
  d'entreprise, App Review, jeton de développeur, audit), parce que ce sont des
  semaines, pas un bouton ;
- **ses opportunités**, et pour chacune : l'usage (publicité, analyse,
  publication, prospects, catalogue, messagerie, veille, mesure des ventes),
  **ce qui remonte** (mesures ou objets), **les gestes** du vendeur, et
  **l'écran** du back-office où ça arrive.

Au 25/09/2026 : 27 API, 25 retenues, 41 opportunités. Trois en `ecrit`
(Instagram, Pages Facebook), deux en `flux` (Catalogue Meta, Merchant Center),
six en `jeton` (Marketing Meta, Google Ads, TikTok Ads, Pinterest, Snapchat,
X), le reste `prevu`, deux `ecarte` (Live Video, Audience Network).

## Le classement des données : trois sortes, pas plus

Tout ce que ces API rendent entre dans l'une de ces trois catégories, et le
dashboard ne connaîtra que celles-là :

1. **Mesures** — des chiffres datés : impressions, clics, dépense, conversions,
   position, sessions, portée. Une ligne = (compte raccordé, dimension,
   métrique, jour, valeur). Elles se comparent entre régies parce qu'elles
   sont ramenées à un vocabulaire commun : *impressions, clics, coût,
   conversions, valeur* — Meta, Google, TikTok et Pinterest nomment ces cinq
   choses différemment, le back-office ne voit qu'un nom.
2. **Objets** — des choses qui ont un état : une campagne (active, en pause,
   refusée), une publicité, un prospect (nouveau, contacté, converti), un
   message (non lu, répondu), un produit de catalogue (approuvé, refusé avec
   motif), une page (indexée, exclue). Une ligne = (compte, type, identifiant
   chez l'éditeur, état, contenu JSON, mis à jour le).
3. **Gestes** — ce que le vendeur fait depuis chez nous et qui part chez
   l'éditeur : créer / pauser une campagne, changer un budget, répondre à un
   message, resoumettre un produit, redéposer un sitemap. Chaque geste est
   journalisé (qui, quoi, quand, réponse de l'éditeur) : une dépense engagée
   sans trace est un litige.

La règle qui prime : **un agent propose, le vendeur valide chaque dépense.**
L'« agent publicitaire » de Meta et nos chefs de rayon peuvent préparer une
campagne ; aucun budget ne part sans un clic du vendeur, et un plafond de
dépense écrit en base borne ce que l'agent peut demander (même leçon que
l'avoir des tickets : la borne est dans le code, pas dans la consigne).

## Le modèle de données à écrire (prochaine étape, pas encore migré)

Aucune migration n'a été faite ce jour : un schéma se pose quand le premier
connecteur qui l'alimente s'écrit, pas avant. Ce qu'il contiendra :

```
ApiLiaison      — une par (vendeur, api) : jetons (accès + refresh, échéances),
                  scopes accordés, comptes externes rattachés (act_…, property,
                  advertiser_id), état (ok / jeton expiré / révoqué), dernier
                  relevé. Remplace AdAccount à terme (AdAccount y migre).
ApiMesure       — (liaisonId, objetExterne?, dimension, metrique, jour, valeur)
                  index (liaisonId, jour). Relevée par une tournée quotidienne,
                  jamais à l'affichage : une page qui interroge Meta à chaque
                  ouverture épuise le quota et attend.
ApiObjet        — (liaisonId, type, externalId, etat, contenu JSON, updatedAt)
                  unique (liaisonId, type, externalId).
ApiGeste        — (liaisonId, userId, type, demande JSON, reponse JSON, statut,
                  createdAt). Le journal.
```

Les jetons suivent la règle des comptes sociaux : colonnes choisies
explicitement à la lecture, **jamais renvoyés au navigateur** ; refresh avant
échéance et nouvelle paire rangée avant de servir (leçon Shopify du 16/09).

## Où ça s'affiche : les écrans du back-office

| Écran | Ce qui y arrive | Sources |
|---|---|---|
| **Dashboard** (`/statistiques`) | Un seul tableau « publicité » : impressions, clics, coût, conversions, ROAS par régie et par produit, sur 7 / 30 jours ; les sources de visites et le tunnel fiche → panier → paiement des boutiques DropShop | Meta Insights, Google Ads, TikTok, Pinterest, GA4, Instagram/Pages Insights |
| **Commercialisation** (`/marketing`) | Créer une campagne depuis un visuel de l'atelier, la pauser, changer son budget ; les propositions de l'agent à valider | Marketing Meta, Google Ads, TikTok, Pinterest, Snapchat, Microsoft, Amazon Ads |
| **Réseaux** (`/reseaux`) | Publier / programmer sur Instagram, Facebook, Threads, TikTok, YouTube, Pinterest, LinkedIn, X ; statistiques par publication | Instagram, Pages, Threads, Content Posting, YouTube, Pinterest |
| **Mes annonces** (fiche produit) | Le statut du produit chez Google et chez Meta, le motif de refus, le bouton « corriger et resoumettre » | Merchant Center, Catalogue Meta |
| **SAV et messagerie** | Les messages Messenger et Instagram, les prospects des Lead Ads, à côté des emails ; l'agent SAV propose la réponse | Messenger, Instagram, Lead Ads |
| **Analyses de marché** | Les publicités des concurrents sur un produit (Meta, TikTok), les volumes de recherche et CPC des mots-clés, les meilleures ventes Google | Ad Library Meta, Commercial Content TikTok, Keyword Planner, Merchant Center |
| **Mes sites** | Les requêtes Google qui amènent sur la boutique, les pages indexées, le dépôt automatique des sitemaps (Google et Bing) | Search Console, Bing Webmaster |
| **Commandes** | Chaque commande payée part en événement d'achat vers Meta, Google Ads et GA4 ; le taux de correspondance | Conversions API, conversions Google, Measurement Protocol |

Deux règles d'écran, venues des pannes déjà vues :

- **Un écran dit ce qu'il ne lit pas.** Tant qu'une API est en `jeton` ou
  `prevu`, la tuile l'annonce (« jeton enregistré, rien n'est lu pour
  l'instant ») au lieu de montrer un zéro qui ressemble à une panne — c'est ce
  qu'API Connect fait déjà pour AdAccount.
- **Un chiffre a une source et une date.** Chaque mesure affichée porte la
  régie et le jour du relevé ; un ROAS sans la ligne « ventes attribuées par
  Meta le 24/09 » est un chiffre qu'on ne peut pas contester, donc qu'on ne
  doit pas montrer.

## L'ordre conseillé pour brancher

Du plus court au plus long, chaque étape apportant un écran utile seule :

1. **Search Console + GA4 sur les boutiques DropShop** — lecture seule, OAuth
   Google standard, aucun examen lourd ; pose la balise GA4 et le
   Measurement Protocol à la création de boutique. Premier tableau
   « d'où viennent les visiteurs ».
2. **Merchant Center (statuts) + Catalogue Meta (API)** — nous servons déjà
   les flux ; l'API donne les refus par produit sur la fiche.
3. **Conversions API Meta + conversions Google** — depuis `paidAt` ; c'est ce
   qui rend les ROAS vrais.
4. **Marketing Meta (Insights puis création)** — demande la vérification
   d'entreprise et l'App Review de l'app « dropshipper » : à lancer tout de
   suite chez Meta, ça prend des semaines pendant lesquelles le reste se code.
5. **Google Ads (rapports puis Performance Max)** — jeton de développeur
   « Basique » à demander maintenant, même raison.
6. **TikTok, Pinterest, Snapchat, Microsoft, Amazon** — même forme que Meta
   et Google, une régie à la fois.
7. **Messageries** (Messenger, Instagram) et **bibliothèques publicitaires**.

## Ce qui reste vrai quoi qu'on branche

- On ne demande jamais un mot de passe ; OAuth ou jeton collé, comme pour les
  places de marché.
- Un connecteur s'éprouve d'abord contre un **faux serveur au contrat écrit
  en dur**, puis se confronte au vrai service **avec de fausses clés** pour
  vérifier que le refus revient lisible (leçon eBay, Kaufland).
- Un banc qui lance une tournée de relevé **se borne à ses comptes jetables**
  (leçon AUTO-MODE du 05/09).
- Les rapports coûtent du quota chez l'éditeur : relevé par tournée, mis en
  base, affiché depuis la base. Jamais d'appel à l'ouverture d'une page.
