# Boutique d'imprimerie — où on en est, ce qui manque

*Écrit le 01/09/2026. Section « Autorisation spéciale », code par défaut `123456`
(`BETA_CODE` en production).*

Le but : une boutique de vente d'imprimerie en ligne, sous-traitée chez
Pixartprinting, avec une partie de leur catalogue. La question posée était
« comment reconstituer leur base avec le moins de manipulations possibles ».

---

## Ce qui est construit et vérifié

Le **réceptacle** et le **flux**. C'est-à-dire tout sauf le relevé lui-même.

- `PrintProduct` en base — une table à part de `Product`, délibérément. Un
  produit d'imprimerie n'a pas un prix mais une matrice
  `(combinaison d'options × quantité × délai) → prix`. Le faire entrer dans
  `Product`, qui porte un prix unique, forcerait à choisir une ligne et à jeter
  le reste, ou à tordre `Product` pour tout le monde afin de servir un seul
  fournisseur.
- `services/printPricing.ts` — validation d'un relevé, marge, prix d'appel,
  résumé de grille. Banc `npx tsx check-imprimerie.ts` : 360 lignes tarifaires,
  neuf formes de relevé invalide refusées, format anglais du mémo d'origine
  accepté.
- `routes/beta.ts` — dépôt, liste, marge, boutique, mise en ligne. La porte est
  côté serveur, sur chaque requête : une page seulement absente du menu reste
  appelable par son adresse.
- `GET /api/public/print/:shopKey/products` — le flux. Chaque article porte un
  **prix d'appel** (avec la quantité et le délai qui le produisent) et la
  **grille complète**, prix de vente marge comprise.
- L'écran `/autorisation-speciale`.

**Trois principes tenus par le code, pas par la consigne :**

1. **La marge n'est jamais écrite dans la grille.** La base ne garde que les
   prix fournisseur ; la marge s'applique à la lecture. Sinon rafraîchir les
   tarifs écraserait la politique de prix, et changer de marge obligerait à tout
   relever.
2. **L'adresse source fait la clé.** Redéposer la même page corrige sa grille au
   lieu d'en créer une seconde — sans quoi le rafraîchissement, qu'il faudra
   faire souvent, remplirait la boutique de doublons.
3. **Une fiche incomplète ne part pas au flux.** Sans grille, sans photo ou sans
   boutique, la mise en ligne est refusée par le serveur, et l'écran dit ce qui
   manque.

## La vitrine — `storefront-imprimerie/`

**Print34**, boutique autonome. Un seul fichier HTML, aucune dépendance, aucun
serveur propre : elle lit le flux et compose tout à partir de lui. On la dépose
sur n'importe quel hébergement statique.

```
storefront-imprimerie/index.html?api=https://…&shop=VOTRE_CLE&contact=commandes@…
```

C'est le configurateur — le morceau qu'aucune boutique standard ne sait faire,
puisque Shopify plafonne à trois options et que ni la quantité ni le délai n'en
sont.

**Le point qui décide de tout : les options viennent de la grille, jamais de la
liste des dimensions.** C'est contre-intuitif — la liste existe et semble faite
pour ça — mais elle décrit ce que le fournisseur propose, pas ce que la grille
contient. Or on ne relève jamais la matrice entière : c'est ce qui rend le
relevé tenable. Un configurateur bâti sur les dimensions offrirait donc des
combinaisons sans prix, et l'acheteur tomberait sur « — » après avoir tout
choisi. Chaque option est confrontée aux lignes réellement disponibles compte
tenu des autres choix, et **barrée** — pas retirée : une option qui disparaît
se lit comme un bug, une option barrée dit « ce grammage existe, mais pas dans
cette quantité ».

Trois autres choses tenues par le code :

- **La fiche s'ouvre sur la ligne la moins chère**, celle qui a été annoncée sur
  la carte. Ouvrir sur une combinaison vide obligerait à tout choisir avant de
  voir un prix — or c'est le prix qu'on vient regarder — et passer de « dès
  27,86 € » à un autre chiffre en ouvrant la fiche se lit comme une hausse.
- **Un choix qui en invalide un autre le rattrape.** Passer de 100 à 7 500
  exemplaires ferme le délai le plus court : sans rattrapage la fiche
  afficherait « — » et l'acheteur croirait s'être trompé.
- **Sans destinataire (`?contact=`), le bouton copie au lieu d'ouvrir un
  courriel.** `mailto:` sans adresse ouvre bien le client de messagerie — sur un
  message vide, adressé à personne. Rien n'encaisse ici : afficher un bouton
  « Payer » qui ne prend pas d'argent serait la seule façon sûre de perdre un
  client.

Démonstration sans base ni API :

```bash
node storefront-imprimerie/demo.cjs
```

Le faux flux n'est pas décoratif : sa grille est **volontairement trouée** — le
400 g n'existe qu'en petites quantités, l'express ferme au-delà de 1 000
exemplaires — parce que c'est ce que produit un relevé partiel. Une démo à
grille complète ne prouverait rien.

**Vérifié le 01/09/2026** dans le navigateur : ouverture sur 16,50 € les 100,
choix du 400 g barrant 1 000 / 2 500 / 7 500 et portant le prix à 24,50 €,
choix de 7 500 barrant le 400 g et l'express, bouton de commande portant la
sélection complète, aucune erreur console.

## Ce qui n'existe pas : le relevé

Aucun code ne va chercher quoi que ce soit chez Pixartprinting. Le dépôt se fait
en collant un JSON dans l'écran (un objet, ou un tableau pour plusieurs fiches).
C'est volontaire à ce stade — vous avez dit pouvoir scraper — et c'est aussi ce
qui permet de ne prendre aucune décision juridique à votre place.

Format attendu, servi par « Voir le format attendu » dans l'écran :

```json
{
  "sourceUrl": "https://…/cartes-de-visite/standard/",
  "sourceRef": "835",
  "name": "Cartes de visite classiques",
  "category": "Papeterie > Cartes de visite",
  "images": ["https://…/ma-photo.jpg"],
  "dimensions": [
    { "cle": "grammage", "libelle": "Grammage", "options": [{ "valeur": "250" }, { "valeur": "350" }] }
  ],
  "priceRows": [
    { "combo": { "grammage": "250" }, "quantite": 100, "delaiJours": 5, "prixHt": 19.9 }
  ]
}
```

Les noms anglais du mémo d'origine (`rows`, `quantity`, `delay_days`,
`price_ht`, `shipping_price`) sont acceptés aussi : un script écrit d'après ce
mémo fonctionne sans traduction.

## Comment relever avec le moins de manipulations — trois voies

**1. Leur demander l'accès API.** C'est la voie qui rend tout le reste inutile.
Pixartprinting annonce des solutions API et un programme professionnel, et
appartient à Cimpress. Une API de devis officielle supprime le relevé, supprime
le risque de blocage d'IP, et supprime la question des CGU. C'est un courrier,
pas un chantier.

**2. Un script Playwright chez vous, pas sur le serveur.** Le mémo technique
décrit la bonne méthode : intercepter les cinq endpoints `/product/*` pendant
qu'on manipule le configurateur, en déduire le schéma JSON, puis rejouer ces
POST sans navigateur. Le script tourne sur votre machine et poste vers
`POST /api/beta/print/products`. **À ne pas mettre sur Railway** : un Chromium
dans l'image, c'est ~400 Mo pour une image qui n'en a aucun besoin le reste du
temps, et une IP de datacenter se bloque bien plus vite qu'une IP résidentielle.

**3. L'extension.** Notre voie habituelle pour les sites qui construisent leur
fiche en JavaScript : elle lit la page déjà affichée dans votre navigateur.
Réaliste pour les dimensions et une poignée de combinaisons, pénible pour une
matrice complète — le produit cartésien demande des centaines de clics.

**Le vrai levier sur le volume :** ne relevez pas toute la matrice. Une
dimension au choix restreint (deux grammages sur trois, un seul délai de
référence) divise le nombre de lignes par cinq ou dix, et personne ne remarque
l'absence des combinaisons que vous ne vendez pas.

## Ce qui reste à décider avant d'industrialiser

- **Les CGU.** Elles interdisent très probablement l'extraction automatisée et
  la revente du catalogue sans accord, comme presque tout site marchand. Je ne
  les ai pas lues. C'est votre décision, et c'est la même règle que nous avons
  appliquée à Zernio : pas de produit commercial bâti sur un droit non confirmé.
- **Photos et textes.** Protégés. Le module ne les stocke pas et attend les
  vôtres. Seule la grille de prix, donnée de fait, est relevée.
- **Le rafraîchissement.** Leurs tarifs bougent avec les promotions. Il faudra
  un passage périodique ; le dépôt est déjà idempotent, donc il n'y a qu'un
  déclencheur à écrire.
- **Le front de la boutique.** Le flux porte la grille, mais aucune boutique
  standard ne sait l'afficher : Shopify plafonne à trois options, et la quantité
  comme le délai n'en sont pas. Il faudra un configurateur côté vitrine, ou se
  contenter du prix d'appel et d'un devis par message.

## Ce qui n'a pas été fait, et pourquoi

Rien n'a été exécuté contre pixartprinting.fr. Pas de requête, pas de relevé
exploratoire, pas de test des cinq endpoints. Tant que la question des CGU n'est
pas tranchée, aller taper leurs endpoints pour « voir si ça marche » est
précisément ce qu'il ne faut pas faire en premier.
