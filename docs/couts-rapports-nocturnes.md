# Mémo — piste pour réduire le coût des 4 routines nocturnes (24 rayons)

**Statut : piste explorée, rien mis en œuvre.** Les 4 routines restent inchangées et
repartiront telles quelles dès que le crédit sera rechargé. Ce mémo sert à décider
si un test vaut la peine, pas à changer quoi que ce soit tout de suite.

## Ce qui tourne aujourd'hui

4 routines Claude (Sonnet), 04h00–04h10, 6 catégories chacune (24 rayons/nuit),
sous-agents en parallèle par catégorie. Par rayon : un rapport RAYON (analyse +
20 produits vérifiés) et un rapport MARKETING (réseaux sociaux, publicités en
cours, tendances, prompts pub) — 48 rapports par nuit. Consigne stricte : jamais
inventer un prix ou une URL.

## D'où vient le coût

Pas de la rédaction : de la **recherche**. Chaque thème demande de vérifier de
vraies fiches produit chez plusieurs fournisseurs (CJ, BigBuy, AliExpress, Temu,
Shein, SUPER DELIVERY), de regarder les marketplaces de revente, et de sourcer
les tendances pub (réseaux sociaux, TikTok, bibliothèques de publicités). Tout ça
passe par des appels d'outils (recherche web, ouverture de pages, sous-agents) —
c'est ce volume d'appels qui coûte, pas les tokens de texte rédigé.

## La piste : séparer collecte et rédaction

n8n (déjà installé sur ton PC) et Ollama (déjà installé) peuvent prendre en
charge la part **mécanique et répétitive** de la collecte :

- **Fournisseurs avec API réelle (CJ, BigBuy)** : un nœud n8n interroge l'API
  directement — rapide, gratuit, fiable. Zéro coût Claude pour cette part.
- **Fournisseurs sans API (AliExpress, Temu, Shein, SUPER DELIVERY)** : possible
  par scraping (comme le fait déjà l'extension Chrome pour l'import produit),
  mais plus fragile — ces pages changent souvent, donc entretien régulier à
  prévoir si une page casse le scraping.
- **Tendances sociales / publicités en cours / TikTok / marketplaces** : c'est la
  part la plus dure à automatiser proprement hors Claude. Un scraping agressif
  de ces plateformes risque de se heurter à leurs conditions d'utilisation, et
  un modèle local ne peut pas vérifier qu'une tendance ou une publicité existe
  réellement — il ne fait qu'en inventer une plausible.

Claude recevrait alors un paquet de données déjà collectées et vérifiées pour
la part fournisseurs API, et garderait un vrai accès web pour tout le reste
(marketplaces, tendances, publicités, produits sans API). Il ferait moins
d'appels d'outils sur la part mécanique, donc coûterait moins cher — sans que
rien de ce qu'il vérifie aujourd'hui par la recherche ne soit remplacé par une
invention.

## Pourquoi la tentative précédente avait fait baisser la qualité (hypothèse)

Le risque, la fois d'avant, était probablement d'avoir laissé Ollama seul
produire des données qu'il ne peut pas vérifier (prix, URL, tendance réelle) —
il comble alors les trous en inventant, ce que le contrat interdit justement.
Le bon découpage n'est pas *Claude remplacé par Ollama*, mais *Claude déchargé
de la part que n8n peut vérifier réellement*, en gardant un vrai accès web pour
tout ce que n8n ne peut pas couvrir de façon fiable.

## Test proposé, sans toucher aux 4 routines en production

1. Construire dans n8n un flux de collecte sur **une seule catégorie/thème**
   (par exemple téléphonie / chargeurs-câbles) : CJ + BigBuy par API, plus un
   essai de scraping AliExpress/Temu/Shein pour mesurer sa fiabilité réelle.
2. Une session Claude à part reçoit ce paquet, complète par une vraie recherche
   web (réseaux sociaux, marketplaces, produits manquants), et rédige le
   rapport complet au format exact du contrat.
3. Comparer, le même jour et sur le même rayon : le rapport produit par la
   routine actuelle (recherche 100 % Claude) contre celui du flux hybride.
4. Décision uniquement sur cette comparaison, par toi. Si la qualité tient,
   on étend catégorie par catégorie. Sinon, on garde l'existant tel quel.

## Limite honnête sur le gain attendu

Cette piste ne divise pas le coût par un facteur énorme : la part la plus
chère — tendances sociales, publicités en cours, marketplaces, produits sans
API — reste une recherche web réelle que seul un agent avec accès web
(Claude) fait correctement aujourd'hui. Le gain porte sur la part fournisseurs
à API connue (CJ, BigBuy), qui est une partie du travail, pas sa majorité.

## Recommandation

Ne rien changer en production avant le test comparatif ci-dessus, sur un seul
rayon, dans une session à part. La généralisation, si tu la décides, se ferait
ensuite catégorie par catégorie — jamais d'un coup sur les 24 rayons.
