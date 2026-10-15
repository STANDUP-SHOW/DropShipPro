# Polices embarquées

Ce dossier est le **seul** emplacement dont nous maîtrisons le contenu.

Tout le reste dépend du serveur : l'image Nixpacks n'embarque aucune police,
`nixpacks.toml` en installe mais Nix les range dans `/nix/store` sous un nom
haché, et fontconfig ne les regarde pas sans qu'on le lui dise. Un paquet
renommé, une image de base qui change, et les publicités repartent en carrés.

Déposer un fichier `.ttf` ici rend la composition indépendante du serveur :
`services/fonts.ts` place ce dossier en tête de sa configuration fontconfig.

## Ce qui est ici

**DejaVu Sans** et **DejaVu Sans Bold**, version 2.37, pris sur la page de
publication officielle du projet. Licence dans `LICENCE-DejaVu.txt` : polices
Bitstream Vera, modifications DejaVu dans le domaine public — redistribution
autorisee, y compris dans un logiciel commercial.

**Polices d'affiche (15/10/2026)**, pour que les publicités ne sortent plus
en police de secours : Anton, Archivo Black, DM Serif Display, Playfair
Display ExtraBold, Montserrat Medium / ExtraBold / Black. Toutes Google Fonts,
licence SIL Open Font License 1.1 (texte complet dans
`OFL-polices-affiche.txt`) : redistribution autorisée, y compris dans un
logiciel commercial. Fichiers statiques (pas de police variable : librsvg les
lit mal), pris dans les paquets npm `@expo-google-fonts/*`. Les familles sont
nommées dans `services/adCharte.ts` (`POLICES`).

## Remplacer

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
