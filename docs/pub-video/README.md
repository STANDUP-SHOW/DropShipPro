# Publicité vidéo DropShipper IA — 30 s, 9:16

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
