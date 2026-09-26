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
