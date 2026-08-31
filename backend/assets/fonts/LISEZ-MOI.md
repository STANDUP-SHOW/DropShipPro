# Polices embarquées

Ce dossier est le **seul** emplacement dont nous maîtrisons le contenu.

Tout le reste dépend du serveur : l'image Nixpacks n'embarque aucune police,
`nixpacks.toml` en installe mais Nix les range dans `/nix/store` sous un nom
haché, et fontconfig ne les regarde pas sans qu'on le lui dise. Un paquet
renommé, une image de base qui change, et les publicités repartent en carrés.

Déposer un fichier `.ttf` ici rend la composition indépendante du serveur :
`services/fonts.ts` place ce dossier en tête de sa configuration fontconfig.

## Quelle police

**DejaVu Sans** (`DejaVuSans.ttf` et `DejaVuSans-Bold.ttf`) fait l'affaire :
licence permissive qui autorise la redistribution, et un jeu de caractères qui
couvre le français sans trous — accents, guillemets, œ, €.

Elle se prend sur https://dejavu-fonts.github.io — archive `dejavu-fonts-ttf`,
dossier `ttf/`. Deux fichiers suffisent, environ 1,4 Mo au total.

Toute autre police fait l'affaire, à deux conditions : que sa licence autorise
la redistribution dans un logiciel, et qu'elle couvre le français.

## Vérifier

Après dépôt, `Réglages › état des services` doit lister ce dossier dans
`policesDossiers`. S'il n'y figure pas, le fichier n'a pas l'extension attendue
(`.ttf`, `.otf`, `.ttc`, `.pfb`).
