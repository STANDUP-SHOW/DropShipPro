#!/usr/bin/env bash
# Prépare les séquences d'images des vidéos de fond (clips/) à partir des
# rushs déposés dans sources/ (neurovibe.mp4, crypto.mp4, ville.mp4, cube-ia.mp4).
# Tout est recadré en 9:16 ; les passages de crypto.mp4 sont coupés au-dessus
# de ses sous-titres incrustés (1000 px du haut sur 1280).
set -euo pipefail
cd "$(dirname "$0")"
F=node_modules/ffmpeg-static/ffmpeg
COUVRIR="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
extraire() { # nom source début durée filtre
  rm -rf "clips/$1"; mkdir -p "clips/$1"
  "$F" -loglevel error -y -ss "$3" -t "$4" -i "sources/$2" -vf "$5,fps=30" -q:v 3 "clips/$1/%04d.jpg"
  echo "$1 : $(ls "clips/$1" | wc -l) images"
}
extraire accroche neurovibe.mp4 0    3.1 "$COUVRIR"                     # 0 · accroche
extraire terre    crypto.mp4    0    3.7 "crop=720:1000:0:0,$COUVRIR"   # 1 · la Terre en réseau
extraire bokeh    neurovibe.mp4 12   3.4 "$COUVRIR"                     # 4 · visuels
extraire ville    ville.mp4     2    3.8 "$COUVRIR"                     # 5 · diffusion
extraire cube     cube-ia.mp4   0    3.6 "scale=1000:-2"                # 6 · mode auto (écran)
extraire reseau   crypto.mp4    6.4  3.1 "crop=720:1000:0:0,$COUVRIR"   # 7 · carte du monde en réseau
extraire final    neurovibe.mp4 30   3.1 "$COUVRIR"                     # 8 · appel à l'action
