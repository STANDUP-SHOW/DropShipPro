# Spots publicitaires DropShipper IA

Chaque spot est une page HTML qui dessine l'instant `t` sur un canvas
(`window.rendre(t)`), rendue image par image en MP4 1080 × 1920, 30 i/s, par
son `rendre.cjs` (Chromium piloté + ffmpeg). Rien n'est tiré au hasard : deux
rendus donnent la même vidéo.

| Dossier | Durée | Sujet |
|---|---|---|
| (spot 1, « L'IA fait tout, sans abonnement ») | 30 s | Monté hors dépôt ; seule la vidéo existe (artefact « Pub DropShipper IA ») |
| `spot-02-partout/` | 30 s | Prenez un produit de n'importe où, publiez-le partout — Drop Shipping 2027 |

## Rendre

```bash
cd docs/pubs/spot-02-partout
node rendre.cjs --rush <tunnel.mp4>                 # la vidéo
node rendre.cjs --rush <tunnel.mp4> --apercu 3,9,15 # quelques images fixes
```

Il faut `playwright-core` (ou `playwright`) et un ffmpeg avec libx264 :
`FFMPEG=/chemin/ffmpeg` ou `npm i ffmpeg-static` (modules aussi cherchés dans
`NODE_PATH`). Aperçu en temps réel : servir la racine du dépôt et ouvrir
`spot.html?lire&tunnel=<dossier des images du tunnel>`.

## Droits

Le rush du tunnel néon **et sa musique** viennent de Pinterest : ils ne sont
pas dans le dépôt, et leurs droits sont à vérifier avant une diffusion payante.
Les illustrations de `images/` sont celles fournies par Max. Les logos
fournisseurs et places de marché sont lus dans `frontend/public/`.
