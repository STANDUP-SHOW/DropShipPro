# Logos hors paquet

Déposer ici les logos qui ne sont pas dans `frontend/public/logos/`, sous
ces noms exacts, puis relancer `node docs/youtube/rendre.cjs` : la bannière
les prend à la place des pastilles de repli dessinées dans `banniere.html`.
Un carré (icône d'application) rend mieux qu'un logo large dans une pastille ronde.

| Fichier attendu | Côté | Pastille de repli tant qu'il manque |
|---|---|---|
| `aliexpress.png` | fournisseurs | carré rouge, anse blanche, « AliExpress » |
| `cj.png` | fournisseurs | carré orange, « CJ » en écriture cursive |
| `bigbuy.png` | fournisseurs | « BigBuy » en bleu |
| `alibaba.png` | fournisseurs | « Alibaba » en orange |
| `vidaxl.png` | fournisseurs | « vidaXL » en orange |
| `dhgate.png` | fournisseurs | « DHgate » en rouge |
| `banggood.png` | fournisseurs | « Banggood » en orange |
| `shopify.png` | marketplaces | « shopify » en vert |
| `vinted.png` | marketplaces | « vinted » en turquoise |
| `leboncoin.png` | marketplaces | « leboncoin » en orange |
| `wish.png` | marketplaces | « wish » en noir |

Les deux côtés ne montrent que ce que l'application fait vraiment : les
fournisseurs de `backend/src/services/suppliers.ts` (plus Shein, relevé par
l'extension) et les places de marché de `backend/src/services/platforms.ts`.
