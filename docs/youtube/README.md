# Kit YouTube et Facebook — DropShipper IA

Les visuels de la chaîne YouTube et de la page Facebook, dessinés en HTML aux
dimensions exactes de chaque réseau et photographiés par Chrome. Les PNG sont
prêts à téléverser ; les HTML sont la source, à modifier puis à re-rendre.

```bash
node docs/youtube/rendre.cjs              # tout re-rendre
node docs/youtube/rendre.cjs facebook     # un seul (préfixe du nom du PNG)
```

| Fichier | Format | Où le mettre |
|---|---|---|
| `banniere-2560x1440.png` | 2560 × 1440 | YouTube › Personnalisation › Image de marque › **Bannière** |
| `profil-800x800.png` | 800 × 800 | YouTube › **Photo** (affichée en rond) — sert aussi de photo de profil Facebook |
| `filigrane-150x150.png` | 150 × 150, fond transparent | YouTube › **Filigrane vidéo** |
| `miniature-1280x720.png` | 1280 × 720 | Gabarit de miniature : changer le titre dans `miniature.html` |
| `facebook-couverture-1640x720.png` | 1640 × 720 | Facebook › Page › **Photo de couverture** |
| `banniere-zones-de-recadrage.png` | 2560 × 1440 | Contrôle : les cadres télévision / ordinateur / tablette / téléphone |
| `apercu-ordinateur-2560x423.png` | 2560 × 423 | Contrôle : la bannière telle qu'un ordinateur la voit |
| `apercu-telephone-1546x423.png` | 1546 × 423 | Contrôle : la bannière telle qu'un téléphone la voit |
| `facebook-zones-de-recadrage.png` | 1640 × 720 | Contrôle : les cadres ordinateur / téléphone de Facebook |
| `facebook-apercu-ordinateur-1640x624.png` | 1640 × 624 | Contrôle : la couverture telle qu'un ordinateur la voit |
| `facebook-apercu-telephone-1280x720.png` | 1280 × 720 | Contrôle : la couverture telle qu'un téléphone la voit |

## Ce qui est dessiné

- **Marque** : le cube sur dégradé rose→violet (celui du favicon et de
  l'extension, redessiné en SVG pour tenir 800 px sans flou) et le nom
  « DropShipper IA » dans le même dégradé que le titre du site (`.text-gradient-rose`).
- **Le nuage** (`nuage.js` + `nuage.css`, partagés par la bannière et la
  couverture) : à gauche **12 fournisseurs**, chacun relié par un flux néon de sa
  couleur au cerveau IA du centre ; à droite **30 places de marché**, toutes
  reliées en rose néon, la couleur de la marque. Tailles différentes, positions
  tirées au sort avec une graine fixe (même dessin à chaque rendu ; changer
  `GRAINE` dans la page pour un autre tirage), jamais alignées, jamais
  superposées. Chaque page ne donne que sa géométrie à `dessinerNuage()`.
- **Rien d'inventé** : les fournisseurs viennent de
  `backend/src/services/suppliers.ts` (plus Shein, relevé par l'extension) et
  les places de marché de `backend/src/services/platforms.ts`. Une marketplace
  que l'application ne sert pas n'a pas sa place sur la bannière.
- **Logos** : ceux du paquet `frontend/public/logos/` quand il les a. Pour les
  autres (AliExpress, CJ, BigBuy, Shopify, Vinted, Leboncoin…), une pastille de
  repli est dessinée tant que le fichier manque dans `logos/` — voir
  `logos/LISEZMOI.md` pour les noms attendus.

## Règles à garder en tête

- **YouTube, bannière** : 2560 × 1440 obligatoire, moins de 6 Mo. Seule la bande
  centrale de 1546 × 423 est visible partout ; l'ordinateur voit 2560 × 423, la
  télévision voit tout.
- **YouTube, photo** : 800 × 800 conseillé, recadrée en cercle. Filigrane :
  150 × 150, fond transparent, moins de 1 Mo. Miniature : 1280 × 720, moins de
  2 Mo, ratio 16:9.
- **Facebook, couverture** : affichée en 820 × 312 sur ordinateur et 640 × 360
  sur téléphone. Une image de 820 × 360 (ici 1640 × 720, le double, pour les
  écrans Retina) satisfait les deux : l'ordinateur rogne 24 px en haut et en bas,
  le téléphone rogne 90 px de chaque côté. Le nom, le cerveau et l'accroche
  tiennent dans l'intersection ; les nuages débordent du cadre du téléphone,
  c'est voulu. Moins de 100 Ko conseillé par Facebook pour éviter la
  recompression — un PNG de 1 Mo passe, mais un JPEG de qualité 90 sera moins
  abîmé par leur compression.
