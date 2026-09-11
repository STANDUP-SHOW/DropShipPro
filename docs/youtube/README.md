# Kit YouTube — DropShipper IA

Les visuels de la chaîne, dessinés en HTML aux dimensions exactes de YouTube et
photographiés par Chrome. Les PNG sont prêts à téléverser ; les HTML sont la
source, à modifier puis à re-rendre.

```bash
node docs/youtube/rendre.cjs              # tout re-rendre
node docs/youtube/rendre.cjs miniature    # un seul visuel (préfixe du nom)
```

| Fichier | Format | Où le mettre |
|---|---|---|
| `banniere-2560x1440.png` | 2560 × 1440 | Personnalisation › Image de marque › **Bannière** |
| `profil-800x800.png` | 800 × 800 | Personnalisation › Image de marque › **Photo** (affichée en rond) |
| `filigrane-150x150.png` | 150 × 150, fond transparent | Personnalisation › Image de marque › **Filigrane vidéo** |
| `miniature-1280x720.png` | 1280 × 720 | Gabarit de miniature : changer le titre dans `miniature.html` |
| `banniere-zones-de-recadrage.png` | 2560 × 1440 | Contrôle : les cadres télévision / ordinateur / tablette / téléphone |
| `apercu-ordinateur-2560x423.png` | 2560 × 423 | Contrôle : la bannière telle qu'un ordinateur la voit |
| `apercu-telephone-1546x423.png` | 1546 × 423 | Contrôle : la bannière telle qu'un téléphone la voit |

## Ce qui est dessiné

- **Marque** : le cube sur dégradé rose→violet (celui du favicon et de
  l'extension, redessiné en SVG pour tenir 800 px sans flou) et le nom
  « DropShipper IA » dans le même dégradé que le titre du site (`.text-gradient-rose`).
- **Bannière** : à gauche les sources (Temu, Shein, Etsy, Joom), chacune reliée
  par un flux néon de sa couleur au cerveau IA du centre ; à droite les
  marketplaces (Amazon, TikTok Shop, eBay, Cdiscount, Rakuten, Zalando), toutes
  reliées en rose néon, la couleur de la marque. Le nom, le cerveau et l'accroche
  tiennent dans la **zone sûre de 1546 × 423** que tous les écrans montrent.
- **Logos** : ceux du paquet `frontend/public/logos/` uniquement. AliExpress,
  CJ Dropshipping, BigBuy et Shopify n'y sont pas ; pour les ajouter, déposer
  leur PNG dans ce paquet et compléter `SOURCES` / `DESTINATIONS` dans
  `banniere.html`.

## Règles YouTube à garder en tête

- Bannière : 2560 × 1440 obligatoire, moins de 6 Mo. Seule la bande centrale de
  1546 × 423 est visible partout ; l'ordinateur voit 2560 × 423, la télévision
  voit tout.
- Photo : 800 × 800 conseillé, recadrée en cercle.
- Filigrane : 150 × 150, fond transparent, moins de 1 Mo.
- Miniature : 1280 × 720, moins de 2 Mo, ratio 16:9.
