# Workflow KANTIX — Rapports rayon quotidiens (version étoffée)

Génère chaque jour 24 rapports rayon (24 rayons × thème du jour) au niveau
« MARKETSPY AI » du 12/10/2026, et les dépose dans Google Drive :

MARKET-ANALYSES/rapports/AAAA-MM-JJ/{categorie_id}/{theme_id}.rayon.md

## Pipeline par rayon
1. Recherche marché (tendances, nouveautés, saison, saturation, social).
2. Sourcing par plateforme : AliExpress, Alibaba, CJ Dropshipping, Temu, DHGate,
   grossistes UE — recherches restreintes par domaine + extraction des pages
   fournisseurs (prix réels).
3. Recherche marketplaces : Amazon.fr, Cdiscount, Leboncoin, Vinted, Back/Fnac/Darty.
4. Extraction LLM : jusqu'à 20 produits candidats en JSON sourcé (zéro invention).
5. Calcul déterministe — port du moteur _REFERENCE/moteur/common.py :
   coût rendu France = (prix $ × qté × 0,86 + 3) × 1,2 ; marge brute, marge nette,
   ROI, prix max d'achat (marge nette cible 20 %), TVA sur marge pour l'occasion,
   scores /100 et verdicts.
6. Rédaction LLM : rapport complet (executive summary, verdict, marché, sourcing,
   marketplaces, TOP 20 avec fiches, battle sheet, plan de test, risques, décision,
   sources). Les tableaux chiffrés sont pré-calculés par le moteur et recopiés
   tels quels — le modèle ne recalcule rien.

## Règles LISEZMOI respectées
- Rotation : themes[(jour_de_l_annee - 1) % 7], jour Europe/Paris.
- Dossiers réutilisés si existants (le plus ancien si plusieurs) ; jamais supprimés.
- Fichier du jour jamais écrasé : rayon marqué existe_deja.
- Lots de 6 rayons (4 lots) avec pauses anti rate-limit.

## Connecteurs (identifiants workspace requis pour un run planifié)
- google_drive_mcp — lecture des références, dépôt des rapports.
- tavily_6b7d — recherches web et extraction de pages.

## Secret requis
- MISTRAL_API_KEY (secret workspace lié au déploiement).

## Entrée du workflow
- date : AAAA-MM-JJ ou null (jour de l'exécution)
- categorie_ids : liste d'ids rayons pour un test, sinon null = les 24
- model : défaut mistral-large-latest
- batch_size : défaut 6

## Planification
Tous les jours à 9h00 Europe/Paris (calendrier hour=9, minute=0, fuseau Europe/Paris).
