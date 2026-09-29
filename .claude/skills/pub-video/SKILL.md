---
name: pub-video
description: Fabriquer une publicité vidéo verticale DropShipper IA (Shorts, Reels, TikTok, 1080×1920, 30–40 s) calée sur une musique, à partir des rushs, logos et textes fournis par Max — sans CapCut ni logiciel de montage. À charger pour toute nouvelle pub, un remix d'une pub existante, une illustration animée de l'accueil, ou quand Max envoie une musique avec « de m:ss à m:ss ».
---

# Pubs vidéo DropShipper IA — le mémo complet

Tout vit dans `docs/pub-video/`. Six pubs y ont été faites en septembre 2026 ; chacune
est une page HTML que l'on photographie image par image. Ce mémo dit comment en
refaire une, et surtout **ce qui a déjà cassé**.

## Économie (lire avant de commencer)

- **Sonnet suffit** pour une pub : si la session est sur Opus, le signaler à Max (`/model`).
- **Une pub = une session neuve.** Ne pas enchaîner plusieurs pubs dans la même conversation.
- **Images** : vérifier avec UNE planche contact réduite (ex. 6 vignettes 270 px), pas des captures en série ; ne relire une image que si quelque chose a changé.
- Ne pas relire les pages HTML existantes en entier : copier la plus proche (`pub-partout.html`, `pub-dropshop2.html`) et éditer par `grep`/`sed -n`.
- Pas de check-in planifié ni d abonnement de PR après le push, sauf demande.

## La technique en une phrase

Une pub = **une page HTML qui est une fonction pure du temps** (`window.rendre(t)` pose
tous les styles de l'instant `t`, sans aucune animation CSS). `rendre.cjs` ouvre la page
dans Chromium (playwright-core), appelle `rendre(n/30)` pour chaque image, fait une
capture JPEG et la pousse dans ffmpeg (ffmpeg-static) par un tuyau, puis colle la musique.
Rien ne tourne pendant la capture : aucune image ratée ni doublée, quelle que soit la
lenteur de la machine.

| Brique | Rôle |
|---|---|
| `playwright-core` | Chromium sans tête. Dans le cloud : `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (ne jamais lancer `playwright install`) |
| `ffmpeg-static` | Découpe de la musique, extraction des rushs en images, encodage H.264 + AAC |
| `simple-icons` (npm) | Icônes des réseaux sociaux en SVG (`node_modules/simple-icons/icons/<nom>.svg`) |
| `polices/outfit-*.woff2` | Police Outfit **en local** — Google Fonts est bloqué par le proxy du cloud |
| `logos-v2/` | Logos v2 : `texte-dropshipper.png` (le mot seul), `icone-v2-dropshipper.png` (l'icône seule) ; DropShop : `texte-dropshop.png`, `icone-dropshop.png`, `auvent-dropshop.png` |
| `../../frontend/public/logos/` | 745 logos de canaux ; `logos-fournisseurs/` pour les fournisseurs ; `icones/` pour Shopify, WooCommerce… |

Installation : `cd docs/pub-video && npm install`. Aucun Python (il n'y en a pas sur la machine de Max).

## Les fichiers

| Fichier | Quoi |
|---|---|
| `rendre.cjs` | Le rendu. `node rendre.cjs --pub <nom>` → `sortie/pub-<nom>-<durée>s.mp4` ; `--apercu 12.5` → une image PNG |
| `battements.cjs` | Analyse d'une musique : énergie, BPM, drop, cassures, grille de coupes **à recopier dans la page** |
| `extraire.cjs` | Rush vidéo → `clips/<nom>/0001.jpg…` (30 i/s), imprime la balise `<img data-clip>` à coller |
| `techno.cjs` | Piste techno originale synthétisée, sans droits (si la musique de Max n'est pas licenciable) |
| `accueil.html` + `accueil.cjs` | Illustrations animées des 11 thèmes de l'accueil (boucles 8 s 1280×720 + PNG détourés) |
| `page-modele.html` | La page de présentation publiée en Artifact (lecteur + liste des scènes cliquables) |
| `pub.html` | Pub 1 « L'IA fait tout » (30 s) — le patron d'origine : cartes, montre SVG, compteurs |
| `pub-canaux.html` / `pub-canaux2.html` | Pub 2 « 314 canaux » et son remix (Nitrobong, logos v2) : réseaux néon, mur Mirakl, barres par famille |
| `pub-dropshop.html` | Pub 3 DropShop : défilement des vraies boutiques (enregistrements d'écran de Max) |
| `pub-annonces.html` | Pub 4 « Annonces IA » : avant/après, champs qui s'allument, SEO/GEO, titres par vitrine |
| `pub-complete.html` | Pub 5 « L'IA fait tout, toi tu vends » (39 s, Jiboya) : l'appli complète, **la meilleure base pour une pub générale** |
| `pub-partout.html` | Pub 6 « Prends un produit n'importe où, publie-le partout » (Poseidon) : **compteur machine à sous 314 qui se fige en néon sur le drop** |
| `pub-dropshop2.html` | Pub 7 « DropShop by DropShipper » (Jiboya 4:06–4:36) : **présentation d'une marque par une autre** (le bandeau change de logo sur le drop), DropShop Market annoncé « bientôt » |
| `README.md`, `preparer.sh` | Commandes de préparation de chaque pub (musiques, clips) |

Hors dépôt (`.gitignore`) : `sources/` (rushs, musiques), `clips/`, `musiques/`, `sortie/`.
Ils se reconstruisent avec les commandes du README à partir des fichiers de Max.

## Faire une nouvelle pub, pas à pas

1. **Lire la demande** : thème, durée, musique « de m:ss à m:ss », rushs fournis.
   Copier les fichiers reçus dans `sources/<campagne>/`, la musique dans `sources/`.
2. **Regarder les rushs** avant de décider : planche contact (une bande de 6–7 images par
   vidéo, `fps=1/1.5,scale=-2:220,tile=7x1`), puis capture d'une page HTML qui les empile.
   Écarter ce qui porte une marque tierce ou du texte étranger (voir « Règles »).
3. **Analyser la musique** :
   ```bash
   node battements.cjs sources/musique.mp3 --debut 212 --duree 30
   ```
   Recopier `TEMPS`, `DROP`, `PREMIER` dans la page. Découper la musique :
   ```bash
   ffmpeg -ss 212 -t 30 -i sources/musique.mp3 \
     -af "afade=t=in:d=0.03,afade=t=out:st=28.9:d=1.1,loudnorm=I=-14:TP=-1.5" -ar 48000 -ac 2 musiques/<nom>.wav
   ```
   `rendre.cjs` prend `musiques/<nom>.wav` automatiquement.
4. **Extraire les rushs** : `node extraire.cjs t-ville sources/c/ville.mp4` (préfixe par campagne).
5. **Partir de la pub la plus proche** (`pub-complete.html` pour l'appli entière,
   `pub-partout.html` pour relevé + diffusion, `pub-canaux2.html` pour les canaux) et la
   copier en `pub-<nom>.html`. Construire `PLANS` sur la grille : **une scène = 8 temps**
   (deux mesures), chaque coupe sur un premier temps, l'intro porte l'accroche, le drop
   frappe la scène la plus forte, la cassure porte le prix et l'appel.
6. **Aperçus avant le rendu** : `node rendre.cjs --pub <nom> --apercu <t>` au milieu de
   chaque scène, assemblés en planche (`hstack`), puis **regarder** la planche. Corriger,
   refaire les aperçus fautifs seulement.
7. **Rendu** : `node rendre.cjs --pub <nom>` (~10 s de calcul par seconde de pub). Vérifier
   la durée exacte (`ffmpeg -i … | grep Duration`) et une bande de 8 images autour du drop.
8. **Livrer** : compresser pour la page (`-b:v 2600k -maxrate 3500k -bufsize 7000k`, < 15 Mo),
   tirer une affiche (`-ss <t> -frames:v 1`), copier `page-modele.html`, remplir `PUBS`,
   `node --check` sur le script extrait, publier en Artifact avec `files`, envoyer le MP4
   (`SendUserFile`, < 30 Mo), **donner le lien à chaque fois**. Une page par pub.
9. **Commiter** la page HTML, la ligne du README, les outils modifiés. Jamais les rushs ni la musique.

## La grammaire visuelle (ce que Max a validé)

- **Logo v2 en éléments séparés** — jamais l'assemblage icône + texte, « illisible » :
  `#marque` = `texte-dropshipper.png` en **1000 px de large, en haut (top 34 px), toute la
  pub** ; l'icône seule, en grand (400–520 px), à l'accroche, au centre des réseaux, à la fin.
  Le texte occupe 34→306 px : **les légendes commencent à 340 px**, les petites étiquettes
  de scène (`.etiquette`) sont masquées.
- **Texte** : légende en 2 lignes (`.legende`, 96–124 px, 900), la seconde en **néon**
  (`.neon .n1…n6`, couleur par scène) ; sous-titre `.titre` vers 1400 px ; bas de
  l'écran libre (interface des réseaux).
- **Sur la musique** : impulsion à chaque temps (`exp(-phase*14)`) → le cadre pulse
  (`scale 1+0.018`, `brightness 1+0.18`), le logo respire ; plus fort après le drop.
  Éclair coloré (`#eclair`, `mix-blend-mode: screen`) sur chaque coupe ; **flash blanc**
  sur le drop (`#blanc`, décroissance `exp(-(t-DROP)*5)`).
- **Compteurs qui défilent** : 0 → 38 fournisseurs, 0 → 314 canaux, 48 analyses, 50 produits/jour,
  120 drops offerts. Le **compteur machine à sous** (pub 6) : trois roues, flou de vitesse,
  la centaine se fige 2 temps avant le drop, l'unité pile sur le drop, puis néon qui pulse.
- **Villes qui s'illuminent** (Max les aime) : luminosité 0.12 → 1 sur l'accroche.
- **Appel final** : icône, phrase, bouton dégradé « Essayer gratuitement »,
  « 120 drops offerts · drop-shipper.fr ».
- Dégradé v2 : `#f28a49 → #e95986 → #c084fc`.

## Règles de contenu (non négociables)

- **Chiffres vérifiables, lus dans le code ou `frontend/src/data/accueil-themes.json`** :
  314 canaux (187 places de marché, 65 comparateurs, 28 outils, 18 régies, 16 affiliation),
  41 enseignes Mirakl, 38 fournisseurs, 48 analyses/jour, 12 drops l'annonce, 350 drops la
  boutique (= 3,50 € une fois), 120 drops offerts, 50 produits/jour conseillés en mode auto.
  Ce qui n'existe pas encore (DropShop Market / DropMarket, DropBank, Dropshop Cloud) se dit « bientôt ».
  Jamais « seul », « exclusif », « n°1 ». GEO se dit « lisible par Google et par les IA ».
  Annonce : titre en 3 longueurs, description, 5 arguments, 8 attributs, 12 mots-clés, rien d'inventé.
- **Marques tierces** : pas de rush où une marque est le sujet (FedEx, DHL, Walmart, Target,
  ECOM ALLIANCE, OZON/WB/Yandex, texte russe/portugais). Si Max y tient, recadrer et flouter
  (`blur(10px)`) et le lui dire. Pas de personne de banque d'images en gros plan.
- **Droits** : les rushs Pinterest et les musiques de Max ne sont pas licenciés — le dire à
  chaque livraison ; `techno.cjs` fournit une piste sans droits.
- **Musique : techno énergique**, celle que Max désigne. Si la consigne est ambiguë (« la première musique »),
  demander ou prendre Jiboya — la pub DropShop faite sur neurovibe (plus lente) a été refusée.
- Réponses à Max en français, lien de la page à chaque livraison.

## Pièges déjà rencontrés

| Symptôme | Cause | Remède |
|---|---|---|
| Vidéo noire dans la page pendant le rendu | Chromium de Playwright ne lit pas le H.264 | Rushs en suites d'images (`extraire.cjs`) — c'est normal, un vrai navigateur lit le MP4 livré |
| Mauvais segment, images en trop ou perdues | Enregistrements d’écran à cadence variable ; `setpts` après un trim | `fps=30` **avant** `trim=start_frame…`, pas de `setpts`, `-fps_mode passthrough` (c’est ce que fait `extraire.cjs`) ; jamais `-ss/-t` pour découper un rush |
| Rien de l'habillage ne s'affiche | Un `.plan` avec `z-index` passe au-dessus d'un calque sans `z-index` | Donner `z-index` au fond (0) et au contenu (2) |
| Texte en dégradé devenu marron | `filter: drop-shadow` sur un texte `background-clip: text` | Mettre la ligne en `.neon`, ou une étiquette à fond sombre |
| Police de secours | Google Fonts bloqué | `@font-face` sur `polices/*.woff2` |
| Page d'Artifact noire | Une apostrophe dans une chaîne JS entre apostrophes | Guillemets doubles, `node --check` sur le script extrait |
| Publication refusée | Vidéo > 15 Mo | Recompresser en débit cible (~2,6–3 Mb/s) |
| Fichier non envoyé | `SendUserFile` limité à 30 Mo | Envoyer la version compressée |
| `pkill -f motif` tue sa propre commande | Le motif figure dans la ligne de commande | Nommer le processus autrement ou ne pas s'en servir |
| « 0,00 € » à l'écran avant qu'un compteur de prix démarre | Le compteur part tard dans la scène | Masquer le prix tant qu'il n'a pas commencé à monter ; jamais un prix faux, même 1 s |
| Filigrane d'un créateur (@pseudo) dans un rush | Rushs Pinterest | Regarder chaque rush en entier, recadrer (`--filtre "crop=…"` d'`extraire.cjs`) |
| Logos qui traversent le titre | Entrée « qui tombe » depuis le haut | Apparition sur place (échelle + rotation) |
| Une coupe « à côté » du temps | BPM estimé à l'oreille ou par l'écart médian | `battements.cjs` (ajustement de phase sur tous les coups) ; ±0,1 BPM près |

## Illustrations de l'accueil

`accueil.html?theme=<slug>` (11 thèmes de `accueil-themes.json`) : boucle de 8 s en 1280×720,
tout périodique sur 8 s, contenu utile dans les 960 px du centre (bloc 4:3). `&fixe=1` donne
le PNG détouré, fond transparent, dans une forme (cercle, hexagone, étoile…).
`node accueil.cjs` rend les 11 MP4 + affiches + PNG dans `sortie/accueil/`. Max a choisi les
vidéos (retouches à venir) ; l'intégration dans `frontend/` n'est pas faite.
