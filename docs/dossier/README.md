# Le dossier — documents à montrer

Les deux pièces qu'on tend à un investisseur, un banquier ou un partenaire.
Chacune existe en **HTML source** (qu'on modifie) et en **PDF** (qu'on envoie).

| Document | Source | PDF |
|---|---|---|
| Business plan 2027-2031 | `business-plan-dropshipper-ia.html` | `business-plan-dropshipper-ia.pdf` (32 pages) |
| Statuts de MAXDEV (SASU) | `statuts-maxdev.html` | `statuts-maxdev.pdf` (9 pages) |

Les deux portent la mention **« Présenté par MAXDEV — Maxime Martinel —
contact@drop-shipper.fr »**, en couverture et en pied de page : un document qui
circule se détache toujours de la main qui l'a tendu.

## Régénérer

```bash
node docs/rendre-pdf.cjs              # les deux
node docs/rendre-pdf.cjs statuts      # un seul, par préfixe
```

Après avoir modifié le HTML, il suffit de relancer. Chrome fait le rendu : pas
de dépendance ajoutée au projet.

## Les polices sont DANS les fichiers, et c'est délibéré

`telecharger-polices.cjs` encode les fontes en base64 directement dans la
feuille de style. À relancer seulement si l'on change de typographie.

```bash
node docs/dossier/telecharger-polices.cjs
```

Trois choses ont été apprises en arrivant là, et elles coûtent une demi-journée
à qui les redécouvre :

1. **`display=swap` et une imprimante ne vont pas ensemble.** Chrome headless
   imprime sans attendre la bascule vers la police chargée : le PDF sortait
   complet, en trente-deux pages, avec ses titres en **Times New Roman**, et
   rien ne le signalait.
2. **Les fontes VARIABLES ne s'instancient pas à l'impression.** À un navigateur
   récent, Google Fonts sert un seul fichier par famille avec un axe de graisse.
   Chrome headless ne sait pas en tirer une graisse au moment d'imprimer — d'où
   l'agent d'un vieux Chrome dans le script, qui obtient des fontes **statiques**,
   un fichier par graisse. C'était la vraie cause, et sa signature était lisible
   depuis le début : seul l'italique passait, parce que seul l'italique n'était
   pas variable.
3. **Lister les graisses que le document EMPLOIE**, pas celles qu'on croit avoir
   choisies. Le corps du texte emploie `<b>` : sans la graisse 700, Chrome
   retombait sur Times New Roman Bold au milieu d'un paragraphe.

Et un piège de méthode, plus général que les polices : `rendre-pdf.cjs` efface
le PDF **avant** d'appeler Chrome. Sans ça, le contrôle « le fichier existe »
était satisfait par le rendu de la veille — deux rendus de suite, le même poids
à l'octet près, et les polices toujours fausses. *Un contrôle qu'un vieux
fichier peut satisfaire ne contrôle rien.*

## Les statuts ne sont pas signés

C'est un **projet de travail**, écrit pour avoir un dossier à montrer. Il n'a
pas été relu par un juriste. Ce qui reste à compléter est signalé en pointillé
dans le document lui-même — capital, état civil de l'associé, date de signature
— et deux points de fond sont posés en tête : « PDG » n'existe pas dans une
SASU (c'est « Président »), et la marque à viser est *DropShipper IA*, le site
répondant sur `drop-shipper.fr`.
