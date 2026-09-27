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

# Pub 2 · 314 canaux
extraire c-accroche neurovibe.mp4 40   3.5 "$COUVRIR"
extraire c-ville1   ville.mp4     6    4.4 "$COUVRIR"
extraire c-europe   crypto.mp4    6.2  4.4 "crop=720:1000:0:0,$COUVRIR"
extraire c-bokeh    neurovibe.mp4 20   4.4 "$COUVRIR"
extraire c-ville2   ville.mp4     11   4.2 "$COUVRIR"
extraire c-cube     cube-ia.mp4   1    4.0 "$COUVRIR"
extraire c-terre    crypto.mp4    0    3.4 "crop=720:1000:0:0,$COUVRIR"
extraire c-final    neurovibe.mp4 44   3.1 "$COUVRIR"

# Pub 3 · DropShop — enregistrements d'écran à cadence variable : découpe au
# numéro d'image après fps=30 (un -ss tombait des secondes à côté).
FEN="crop=1682:ih:0:0,scale=1000:-2"
fenetre() { # nom source image_début image_fin [filtre en plus]
  rm -rf "clips/$1"; mkdir -p "clips/$1"
  "$F" -loglevel error -y -i "sources/$2" -vf "fps=30,trim=start_frame=$3:end_frame=$4,${5:-setpts=PTS-STARTPTS},$FEN" -q:v 2 "clips/$1/%04d.jpg"
  echo "$1 : $(ls "clips/$1" | wc -l) images"
}
fenetre d-oguss-accueil  boutique-oguss.mp4     0    170
fenetre d-oguss-produits boutique-oguss.mp4     420  570
fenetre d-robot-accueil  boutique-robotique.mp4 30   128
fenetre d-robot-fiche    boutique-robotique.mp4 1020 1170
fenetre d-iagent         boutique-iagent.mp4    0    75
fenetre d-oguss-modes    boutique-oguss.mp4     1020 1300 "select='not(mod(n,2))',setpts=N/30/TB"
extraire d-accroche neurovibe.mp4 8  3.2 "$COUVRIR"
extraire d-bokeh    neurovibe.mp4 14 4.6 "$COUVRIR"
extraire d-final    neurovibe.mp4 36 3.1 "$COUVRIR"
"$F" -loglevel error -y -i sources/boutique-oguss.mp4     -vf "fps=30,select='eq(n,300)',$FEN" -frames:v 1 clips/d-still-oguss.jpg
"$F" -loglevel error -y -i sources/boutique-robotique.mp4 -vf "fps=30,select='eq(n,130)',$FEN" -frames:v 1 clips/d-still-robot.jpg
"$F" -loglevel error -y -i sources/boutique-iagent.mp4    -vf "fps=30,select='eq(n,70)',$FEN"  -frames:v 1 clips/d-still-iagent.jpg

# Pub 4 · Annonces IA — sources/annonces-*.mp4|jpg (dossier pub-annonces de Max)
C1="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
fenetre2() { rm -rf "clips/$1"; mkdir -p "clips/$1"; "$F" -loglevel error -y -i "sources/$2" -vf "fps=30,trim=start_frame=$3:end_frame=$4,setpts=PTS-STARTPTS,$5" -q:v 2 "clips/$1/%04d.jpg"; }
fenetre2 a-telephone  annonces-telephone.mp4 0 96  "crop=720:1080:0:0,$C1"   # rogné sous le filigrane
fenetre2 a-usine-fond annonces-usine.mp4     0 170 "$C1"
fenetre2 a-usine      annonces-usine.mp4     0 170 "scale=1000:-2"
fenetre2 a-mockup     annonces-mockup.mp4    0 150 "$C1"
"$F" -loglevel error -y -i sources/annonces-seo-roue.jpg -vf "$C1" -q:v 2 clips/a-seo-roue.jpg
"$F" -loglevel error -y -i sources/annonces-monde.jpg    -vf "$C1" -q:v 2 clips/a-monde.jpg
