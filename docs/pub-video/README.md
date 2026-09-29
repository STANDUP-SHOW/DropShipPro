# Publicités vidéo DropShipper IA — 30 s, 9:16

Une page HTML animée (`pub.html`), rendue image par image par Chromium et
assemblée par ffmpeg (`rendre.cjs`). Chaque image est une fonction du temps :
le rendu est identique à chaque lancement, quelle que soit la machine.

```bash
cd docs/pub-video
npm install                      # playwright-core + ffmpeg-static
# déposer les rushs dans sources/ : neurovibe.mp4, crypto.mp4, ville.mp4, cube-ia.mp4
./preparer.sh                    # → clips/ (séquences d'images 9:16)
node rendre.cjs --apercu 12.5    # une image, pour vérifier une scène
node rendre.cjs                  # → sortie/pub-dropshipper-30s.mp4 (~6 min)
node rendre.cjs --pub canaux     # → sortie/pub-canaux-30s.mp4 (pub-canaux.html)
node rendre.cjs --pub dropshop   # → sortie/pub-dropshop-30s.mp4 (pub-dropshop.html)
node rendre.cjs --pub annonces   # → sortie/pub-annonces-30s.mp4 (pub-annonces.html)
```

Ouvrir `pub.html` dans Chrome joue la pub en boucle ; `pub.html?t=12.5` fige un instant.

## Déroulé

| Temps | Scène | Texte | Fond |
|---|---|---|---|
| 0–3 s | Accroche | Et si l'IA faisait tout ? | Myneurovibe (particules) |
| 3–6,6 s | Relevé de produits | Je prends un produit. Partout. | La Terre en réseau |
| 6,6–10,2 s | Annonces | L'IA fait l'annonce. | — (annonce qui s'écrit) |
| 10,2–13,5 s | DropShop IA | La boutique. · 3,50 € une fois, à vie | — (boutique qui se construit) |
| 13,5–16,8 s | Visuels | Les visuels. | Myneurovibe (bokeh) |
| 16,8–20,5 s | Diffusion | Je diffuse partout. · 314 canaux | Ville connectée |
| 20,5–24 s | AUTO-SHIPPER | Le mode auto fait tout. · 50 produits/jour | Cube IA |
| 24–27 s | Les drops | Sans abonnement. · 1 drop = 0,01 € · 120 offerts | Carte du monde en réseau |
| 27–30 s | Appel à l'action | Essayer gratuitement · drop-shipper.fr | Myneurovibe |

Les titres sont ceux de l'accueil (`frontend/src/data/accueil-themes.json`) ; un
chiffre changé là-bas se change ici.

Musique : celle de Myneurovibe, son « drop » (25,6 s dans la source) calé sur
la première coupe à 3 s, normalisée à −14 LUFS.

**Droits** : les quatre rushs viennent de Pinterest (PinLoad). Leur licence
n'est pas établie — à vérifier avant toute diffusion payante (musique
comprise). C'est pour ça que `sources/` et `clips/` restent hors du dépôt.

## Pub 2 · 314 canaux (`pub-canaux.html`)

| Temps | Scène | Ce qu'on voit |
|---|---|---|
| 0–3,4 s | Accroche | Un clic. Compteur jusqu'à 314 canaux de vente |
| 3,4–7,6 s | Les familles | 187 places de marché, 65 comparateurs, 28 outils, 18 régies, 16 affiliation (= 314) |
| 7,6–11,8 s | API branchée | Mur des 40 enseignes Mirakl dont le logo est dans le dépôt (41 branchées ; Hudson's Bay sans logo) |
| 11,8–16 s | Vos boutiques | Flux néon vers Shopify, WooCommerce, PrestaShop, Magento, Wix, Drupal, BigCommerce, Shopware, Squarespace, Ecwid, DropShop |
| 16–20 s | Social commerce | Facebook, Instagram, TikTok, Pinterest, Snapchat, Google |
| 20–23,8 s | Flux produit | Comparateurs et affiliation ; Vinted et Leboncoin par l'extension |
| 23,8–27 s | Partout | Tous les mondes à la fois autour du cœur |
| 27–30 s | Appel à l'action | 314 canaux, une voie de liaison pour chacun |

Les icônes des logiciels de boutique et des réseaux (`icones/`) viennent du
paquet `simple-icons` (CC0), recolorées à la couleur de chaque marque. Aucune
phrase ne dit « seul » ni « exclusif » : ce n'est pas vérifiable.

## Pub 3 · DropShop IA (`pub-dropshop.html`)

Faite de **vrais enregistrements d'écran** envoyés par Max le 26/09/2026, à
déposer dans `sources/` : `boutique-oguss.mp4`, `boutique-robotique.mp4`,
`boutique-iagent.mp4` (le réseau de la session cloud refusait les boutiques).

| Temps | Scène | Images |
|---|---|---|
| 0–3 s | Votre boutique. Écrite par l'IA. | logo DropShop |
| 3–8 s | Un design unique | OGUSS : accueil, puis fiche Azure Noir |
| 8–13 s | Architecture complète | France Robotique : accueil, puis fiche Unitree R1 |
| 13–17 s | Votre logo, votre charte | iagent : accueil (le catalogue est encore vide, non montré) |
| 17–21,2 s | 4 ambiances, 1 boutique | OGUSS en accéléré : Noir, Clair, Dégradé, Coloré |
| 21,2–26,6 s | Pas un thème. Écrite pour vous. | les trois boutiques en éventail ; 3,50 € une fois, 10 modifications, Stripe |
| 26,6–30 s | Créer ma boutique | drop-shipper.fr |

Les enregistrements sont à cadence variable : **on découpe au numéro d'image
après `fps=30`, jamais avec `-ss`/`-t`**, qui tombaient plusieurs secondes à
côté. Les modes d'OGUSS sont choisis par le visiteur : l'écran le dit.

## Pub 4 · Annonces IA (`pub-annonces.html`)

Première pub aux **logos v2** (`logos-v2/`, envoyés par Max le 27/09/2026, à
l'essai ; réduits à 1 600 px de large), palette du logo : `#f28a49` → `#e95986`.

| Temps | Scène |
|---|---|
| 0–3 s | Une fiche fournisseur… devient une annonce d'exception |
| 3–8,4 s | Recomposition totale : fiche brute balayée par un laser, annonce réécrite |
| 8,4–13,4 s | Chaque champ optimisé (vidéo « usine à annonces » + 8 champs cochés) |
| 13,4–18,2 s | SEO · GEO |
| 18,2–23 s | Taillée pour chaque vitrine : titres long, moyen (80), court (50) comptés |
| 23–26,8 s | Diffusée sur 314 canaux |
| 26,8–30 s | Importer ma première annonce · 120 drops offerts |

Promesses relues dans `aiEnhancer.ts`. GEO = « données structurées lisibles
par Google et par les IA » (attributs, GTIN, catégorie Google), jamais
« référencé dans ChatGPT ». Rushs écartés : le « Shopping mall » (logo
ECOM ALLIANCE, sous-titres incrustés), les vidéos néon (texte russe, logos
OZON / WB / Yandex), l'infographie « AI for E-commerce » (outils tiers).
Le téléphone rose est rogné sous son filigrane.

## Musique propre à une pub

`rendre.cjs` prend `musiques/<nom>.wav` s'il existe (sinon la bande neurovibe).
Le dossier est hors dépôt (droits, poids) ; on le reconstruit :

```bash
# Pub 4 (annonces) : Vegas – Jiboya, de 4:00 à 4:30, fournie par Max (sources/musique-annonces.mp3)
ffmpeg -ss 240 -t 30 -i sources/musique-annonces.mp3 \
  -af "afade=t=in:d=0.05,afade=t=out:st=28.8:d=1.2,loudnorm=I=-14:TP=-1.5" -ar 48000 -ac 2 musiques/annonces.wav

# Ou une techno originale synthétisée, sans droits (128 BPM, montée jusqu'au drop, impacts aux coupes) :
node techno.cjs --pub annonces --drop 3 --coupes 8.4,13.4,18.2,23 --final 26.8 --duree 30
```

Logo v2 **en éléments séparés** (l'assemblage est illisible en vertical) : `logos-v2/texte-dropshipper.png`
pleine largeur en haut pendant toute la pub, `logos-v2/icone-v2-dropshipper.png` seule en grand (accroche, fin).

## Illustrations de l'accueil (11 thèmes)

`accueil.html?theme=<slug>` compose chaque thème de `frontend/src/data/accueil-themes.json` : les rushs de Max
au fond (fondu enchaîné, zoom lent) et, par-dessus, ce que fait le thème (relevé, 38 fournisseurs, annonce qui
s'écrit, boutique DropShop réelle, 314 canaux, agents…). Tout est périodique sur 8 s : la boucle ne saute pas.

```bash
node accueil.cjs                  # sortie/accueil/<slug>.mp4 (boucle 1280×720), <slug>.jpg (affiche), <slug>.png (fixe détouré)
node accueil.cjs --theme diffusion --apercu 4
```

`&fixe=1` donne la seconde proposition : la même scène détourée dans une forme (cercle, hexagone, étoile…),
fond transparent. Le contenu important reste dans les 960 px du centre (bloc 4:3 de l'accueil).
Écartés des rushs : 555.mp4 (logo ECOM ALLIANCE), 7777777777.jpg (FedEx, DHL, USPS), 77777 (3).jpg
(Walmart, Target), 22.jpg (logos Twitter), la fin de 88.mp4 (personnes de banque d'images).

## Pub 5 · L'application complète (39 s)

`pub-complete.html`, logos v2 séparés, calée sur Vegas – Jiboya de 5:12 à 5:51 (142,3 BPM, drop au temps 13 = 5,82 s,
cassure au temps 77 = 32,80 s) : chaque coupe tombe sur un premier temps. Rushs du zip de Max dans `clips/p5-*`.

```bash
ffmpeg -ss 312 -t 39 -i sources/musique-annonces.mp3 \
  -af "afade=t=in:d=0.03,afade=t=out:st=37.8:d=1.2,loudnorm=I=-14:TP=-1.5" -ar 48000 -ac 2 musiques/complete.wav
node rendre.cjs --pub complete        # → sortie/pub-complete-39s.mp4 (le nom suit la durée)
```

## Remix 314 canaux (32 s)

`pub-canaux2.html` : la pub 314 canaux avec les logos v2 séparés, calée sur Webra – Nitrobong de 2:26 à 2:58
(144,5 BPM, drop au temps 15 = 6,45 s ; huit scènes de huit temps ; le compteur touche 314 sur le drop).

```bash
ffmpeg -ss 146 -t 32 -i sources/nitrobong.mp3 \
  -af "afade=t=in:d=0.03,afade=t=out:st=30.9:d=1.1,loudnorm=I=-14:TP=-1.5" -ar 48000 -ac 2 musiques/canaux2.wav
node rendre.cjs --pub canaux2          # → sortie/pub-canaux2-32s.mp4
```

## Pub 6 · Prends un produit n'importe où, publie-le partout (30 s)

`pub-partout.html`, logos v2, Pandora & Vermont – Poseidon de 3:32 à 4:02 (144,5 BPM, drop 13,23 s).
Pendant la montée, le compteur 314 roule comme une machine à sous et se fige, chiffre après chiffre,
pile sur le drop, où il s'allume en néon. Rushs de Max dans `sources/partout/` (clips `t-*`).

```bash
node battements.cjs sources/poseidon.mp3 --debut 212 --duree 30
ffmpeg -ss 212 -t 30 -i sources/poseidon.mp3 \
  -af "afade=t=in:d=0.03,afade=t=out:st=28.9:d=1.1,loudnorm=I=-14:TP=-1.5" -ar 48000 -ac 2 musiques/partout.wav
for c in "t-miami miami" "t-globe iphone" "t-ville ville-nuit" "t-warp v5" "t-rayons v3" "t-carres carres" "t-losange v4" "t-etoiles v2"; do
  set -- $c; node extraire.cjs $1 sources/partout/$2.mp4; done
ffmpeg -i sources/partout/flux.jpg -vf "crop=600:930:410:440,scale=1080:-2" -q:v 2 sources/partout/flux-carte.jpg
node rendre.cjs --pub partout          # → sortie/pub-partout-30s.mp4
```

## Refaire une pub

Le mode d'emploi complet (technique, étapes, grammaire visuelle validée par Max, règles de contenu,
pièges) est la skill Claude Code `.claude/skills/pub-video/SKILL.md`. Outils : `battements.cjs`
(analyse de la musique), `extraire.cjs` (rush → images), `page-modele.html` (page de livraison).

## Pub 7 · DropShop by DropShipper (30 s)

`pub-dropshop2.html` : DropShipper présente → DropShop apparaît « by DropShipper » → le bandeau passe au
texte DropShop sur le drop → boutiques réelles, couleurs, DropShop Market (« bientôt »), clé en main →
« Construisez votre DropShop sur DropShipper ». Musique Vegas – Jiboya de 4:06 à 4:36 (141,7 BPM, drop à 4,28 s :
DropShop apparaît sur le drop). Première version sur neurovibe refusée par Max : « pas la techno demandée ».
Logos DropShop v2 (zip de Max) : `logos-v2/texte-dropshop.png`, `icone-dropshop.png`, `auvent-dropshop.png`.

```bash
ffmpeg -ss 246 -t 30 -i sources/musique-annonces.mp3 \
  -af "afade=t=in:d=0.03,afade=t=out:st=28.8:d=1.2,loudnorm=I=-14:TP=-1.5" -ar 48000 -ac 2 musiques/dropshop2.wav
node extraire.cjs d2-ville sources/dropshop2/neon-city.mp4
node extraire.cjs d2-telephones sources/dropshop2/stores.mp4 --filtre "crop=iw:ih*0.76:0:0,scale=-2:1280"   # ôte le filigrane du créateur
node extraire.cjs d2-mockup sources/dropshop2/mockup.mp4
node rendre.cjs --pub dropshop2
```
