# Charte DropShop et DropShop Market (10/10/2026)

Source : planche de Max `dropshop/planche-charte-dropshop-market-2026-10-10.png`
(8000 × 5299, PNG transparent). Elle remplace l'ancienne charte DropShop
(vert #0b6b33 + orange). Elle ne couvre **que DropShop et DropShop Market** :
la marque mère DropShipper garde le cube et le dégradé orange #f28a4b → rose
#e85290.

## Dégradé

Relevé sur la barre de dégradé de la planche, de gauche à droite :

| Position | Couleur | |
|---|---|---|
| 0 % | `#07eeb7` | vert d'eau |
| 30 % | `#4a98eb` | bleu |
| 50 % | `#8c5ed0` | violet |
| 70 % | `#dd2488` | rose |
| 90 % | `#f48e35` | orange |
| 100 % | `#ffc90b` | jaune |

CSS (`frontend/src/index.css`) : variable `--dropshop-degrade`, classes
`.degrade-dropshop` (fond), `.texte-dropshop` (texte en dégradé),
`.btn-dropshop` (bouton pilule), `.cadre-dropshop` (bordure dégradée de carte).
Fond sombre de la planche : `#01020f`.

## Usages

- **Icône** : sac à provisions + flèche montante formant un D, trait blanc sur
  carré arrondi au dégradé (diagonale vert d'eau en bas à gauche → jaune en haut
  à droite). Variante trait seul au dégradé, variante blanche, variante sur noir.
- **Mot « DropShop »** : en dégradé avec contour blanc épais (logo principal),
  en dégradé simple sous l'icône, en blanc sur fond sombre, en gris foncé sur
  fond clair. Signature : « AI shop creator ».
- **Bouton principal** : pilule au dégradé, icône blanche à gauche, libellé blanc
  en capitales (« CRÉER MA BOUTIQUE »). Ombre de texte légère : le blanc sur la
  partie jaune manque de contraste sans elle.
- **DropShop Market** : « DropShop » blanc (ou noir sur fond clair) + « MARKET »
  en dégradé ; version encart avec sac à anse, bandeau « RAPIDE EUROPE » au
  dégradé et sous-titre « Produits d'importation » ; version mono blanc / gris.
- **PRIME** : interrupteur pilule au dégradé, mot « PRIME » espacé en blanc.
  Pas encore utilisé sur le site (aucune offre Prime n'existe).

## Fichiers (`docs/marque/dropshop/`, découpés dans la planche, fond transparent)

| Fichier | Contenu | Fond conseillé |
|---|---|---|
| `dropshop-logo.png` | icône + mot à contour blanc | sombre ou clair |
| `dropshop-icone.png` | icône carré arrondi au dégradé | tous |
| `dropshop-icone-fond-noir.png` | icône trait dégradé sur carré noir | tous |
| `dropshop-icone-blanc.png` | icône blanche seule | sombre, ou sur le dégradé |
| `dropshop-icone-mot-degrade.png` | icône trait + mot au dégradé | sombre |
| `dropshop-mot.png` | mot à contour blanc seul | sombre |
| `dropshop-signature-blanc.png` / `-vertical-blanc.png` | icône + « DropShop / AI shop creator » blanc | sombre |
| `dropshop-signature-fond-clair.png` | idem, texte gris foncé | clair |
| `dropshop-mono-blanc.png` | icône + mot, tout blanc | sombre |
| `dropshop-bouton-creer.png`, `dropshop-bouton.png` | boutons pilule | sombre |
| `dropshop-market-horizontal.png` / `-vertical.png` | icône + DropShop (blanc) MARKET (dégradé) | sombre |
| `dropshop-market-fond-clair.png` | DropShop (noir) MARKET (dégradé) | clair |
| `dropshop-market-europe-fond-sombre.png` / `-fond-clair.png` | encart Rapide Europe | selon nom |
| `dropshop-market-mono.png`, `dropshop-market-mono-blanc.png`, `dropshop-market-mot-blanc.png` | versions mono | sombre |
| `dropshop-prime.png` | interrupteur PRIME | sombre |
| `dropshop-degrade.png` | barre de dégradé (référence couleur) | — |

Versions allégées servies par le site : `frontend/public/marque/dropshop/`
(`logo.png`, `icone.png`, `icone-blanc.png`, `market-europe.png`).

La planche est un bitmap : les découpes sont nettes jusqu'à leur taille native
(logo 2469 px de large, icône 568 px). Au-delà, demander à Max les sources
vectorielles (SVG ou Illustrator).

## Où la charte est appliquée

- Accueil React, section `#dropshop` (`Index.tsx`) : logo, signature, titre en
  dégradé, cartes à bordure dégradée, bouton pilule, encart DropShop Market.
- Pas encore : la page `/fonctions/dropshop-ia/`, l'ancien `dropshop-complet.png`
  (toujours dans `frontend/public/marque/`, plus référencé par l'accueil), la
  vitrine et les e-mails DropShop.
