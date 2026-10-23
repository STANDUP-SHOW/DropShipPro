# Planificateur de mots-clés Google (Google Ads API)

Voulu par Max le 23/10/2026 : appuyer les produits gagnants des rayons sur une demande
réelle en France (volume de recherche mensuel, courbe sur 12 mois, concurrence).

## Ce qui est en place (backend)

- `backend/src/services/motsClesGoogle.ts` : `volumesMotsCles()` (generateKeywordHistoricalMetrics)
  et `ideesMotsCles()` (generateKeywordIdeas), France + français + recherche Google, API v26.
- Routes du Poste, clé `dsp_adm_` (`backend/src/routes/admin.ts`) :
  - `GET  /api/admin/mots-cles/etat` → `{ configure, manque[], verifie }` ; `?essai=1` fait un vrai
    appel sur « coque iphone » (« connecté » = un appel réel réussi).
  - `POST /api/admin/mots-cles` `{ motsCles: string[] }` (500 au plus) → `{ motsCles: [{ texte,
    volumeMensuel, concurrence, indiceConcurrence, evolution3Mois, enchereBasse, enchereHaute,
    tendance: [{ mois: 'AAAA-MM', recherches }] }], refus[] }`.
  - `POST /api/admin/mots-cles/idees` `{ graines: string[], limite?: 50 }` → même forme, triée par volume.
  - Erreurs : `{ error, motif }`, 503 `non-configure`/`configuration`, 502 `acces-refuse`/`reseau`/`reponse`, 429 `quota`.
- Un chiffre que Google ne rend pas reste `null`, jamais 0.
- Banc : `cd backend && npx tsx check-mots-cles-google.ts` (faux serveur : il ne prouve pas que Google répond).

## Variables Railway (Max seul)

| Variable | Contenu |
|---|---|
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | le fichier de clé JSON du compte de service, collé en entier |
| `GOOGLE_ADS_CUSTOMER_ID` | numéro du compte Google Ads, `123-456-7890` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | facultatif, seulement si on passe par un compte administrateur (MCC) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | facultatif, ancien jeton ; envoyé seulement s'il est posé |
| `GOOGLE_ADS_API_VERSION` | facultatif, `v26` par défaut |

## Accès chez Google (état constaté dans la doc Google le 23/10/2026)

- Plus de « jeton développeur » depuis le 09/09/2026 : l'accès est donné au **projet Google Cloud**,
  depuis la page « Google Ads API » de la console (console.cloud.google.com/google/ads-apis/overview).
- Niveaux : Test (comptes de test seulement) → Explorer (automatique, 2 880 opérations/jour) →
  **Basic** (15 000/jour, demande la vérification de la marque du projet) → Standard.
- **Le Planificateur (KeywordPlanIdeaService) est refusé en Explorer** : il faut Basic.
- Un projet en essai gratuit Google Cloud ou à facturation suspendue peut être refusé ; un projet
  sans compte de facturation convient (rien de payant n'est nécessaire).
- Authentification par compte de service : son e-mail est ajouté comme utilisateur du compte
  Google Ads (Administration > Accès et sécurité > Utilisateurs > +), niveau autre que « E-mail uniquement ».

## Ce qui reste

Le Poste d'analyses (fil propriétaire d'`analyses/`) appelle ces routes pendant l'analyse d'un
rayon et range les chiffres avec chaque produit ; sans les variables, il continue sans eux.
