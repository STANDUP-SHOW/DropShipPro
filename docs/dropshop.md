# DropShop IA — la boutique écrite par l'IA

Décidé le 17/09/2026 après de très mauvais retours sur l'outil de fabrication
de boutiques à thèmes : « à l'heure de l'IA générative, nous nous devons d'avoir
un outil de production de boutiques IA à la pointe, pas un outil dépassé qui
utilise des templates ». Le modèle : un « Lovable-like » — le vendeur décrit la
boutique de ses rêves, l'IA l'écrit, la teste, la corrige ; le vendeur la
modifie ensuite par simples demandes.

## Le prix, et pourquoi il tient

| Geste | Drops | Ce que ça couvre |
|---|---|---|
| Création de boutique | **200** (2 €) | design unique écrit par Sonnet 5, contrôle du parcours visiteur, jusqu'à deux réparations, hébergement, trafic, emails de commande, Stripe pré-branché, **10 modifications comprises** |
| Modification (au-delà des 10) | **10** | une demande, appliquée par Haiku 4.5 en éditions ciblées, puis vérifiée |
| Restauration d'une version | 0 | rien n'est écrit par le modèle |

Coût réel d'une création : ~30 000 jetons de sortie de Sonnet 5 (≈ 0,30 $) +
l'entrée (contrat + squelette + brief, ≈ 12 000 jetons, mis en cache) + une
réparation Haiku éventuelle (quelques centimes). ≈ 0,35–0,45 € pour 2 €
encaissés. Une modification : la page entière en entrée (≈ 30 000 jetons Haiku,
0,03 $) + quelques centaines de jetons de sortie ≈ 0,04 € pour 0,10 €.

## Comment c'est construit

```
backend/dropshop/sdk.js        le MOTEUR : catalogue vivant, routage, panier, commande, paiement, confirmation
backend/dropshop/contrat.md    le contrat lu par le modèle (écrans, contexte, attributs, interdits)
backend/dropshop/exemple.html  le squelette de référence (neutre : il montre le contrat, pas un design)
backend/dropshop/verifier.cjs  le banc du visiteur, en processus enfant à l'environnement vide
backend/src/services/siteGenerator.ts   consignes, appel au modèle, extraction, éditions, orchestration
backend/src/services/dropshopJobs.ts    travaux (202 + état relu), prix, remboursements, versions
backend/src/routes/dropshop.ts          /api/dropshop/:shopId (état, créer, modifier, restaurer, retirer, stripe)
backend/src/routes/vitrine.ts           /b/<slug> sert la page IA (moteur inséré) devant la vitrine à thèmes
backend/src/routes/public.ts            /checkout (commande + Stripe du marchand), /checkout/:session (confirmation)
backend/src/services/commandeVitrine.ts emails acheteur + marchand, session Stripe, confirmation
frontend/src/pages/CreerBoutique.tsx    le studio : brief, avancement, demandes, versions, aperçu, Stripe
```

**Le partage qui rend tout possible.** Le modèle n'écrit que ce qui est unique
à une boutique : la page HTML entière — mise en page, CSS, textes, écrans,
animations. Il ne touche jamais à la logique de commerce, qui vit dans le
moteur. Une page décrit des *écrans* (`DropShop.pages({ cadre, accueil,
boutique, categorie, produit, panier, commande, merci, introuvable })`) qui
rendent du HTML à partir d'un contexte `c` (produits, catégories, panier,
liens, formats). Les gestes sont des attributs (`data-ajouter`, `data-retirer`,
`<form data-commande>`…) que le moteur branche lui-même. Conséquence : le
panier ne peut pas « ne plus marcher » — il n'est pas dans ce que le modèle
écrit. Et la boutique reste vivante : le catalogue est relu à chaque visite.

**Puis la page est testée, comme Lovable dit le faire.** Le vérificateur monte
la page dans jsdom avec le vrai moteur et un faux serveur (thème + trois
produits), et fait le parcours d'un visiteur : accueil (nom, produits,
catégories, prix, photos), boutique (tous les produits, recherche), catégorie
(les bons produits), fiche (titre, prix, description, `[data-ajouter]` qui
ajoute vraiment), produit inconnu, panier (lignes, total port compris, lien
commande, retirer), commande (formulaire, champs, envoi avec le bon corps),
merci (panier vidé). Chaque manque est écrit **pour être lu par le modèle**,
qui répare par éditions « chercher / remplacer » (tout ou rien, extrait
unique). Deux réparations au plus ; sinon échec et drops rendus.

**Deux modèles.** Sonnet 5 écrit (`AI_MODEL_SITE`), Haiku 4.5 modifie et
répare (`AI_MODEL_SITE_MODIF`). Une modification qui exige une refonte peut
rendre la page entière ; le reste est édité.

**Le processus enfant est une protection, pas une commodité.** jsdom exécute
le JavaScript de la page ; il n'est pas un bac à sable ; la page a été écrite
par un modèle à partir d'un texte tapé par un vendeur. Le vérificateur tourne
donc dans un processus à part, avec un environnement VIDE (pas de
`DATABASE_URL`, pas de clé), tué à 30 s. Une `while (true)` bloque le fil de
l'enfant — aucun minuteur interne ne le sauve, seul le parent le peut, et c'est
ce que le banc éprouve.

## Ce qui nourrit le modèle avant qu'il écrive (17/09, second passage)

Retours de Max sur la première boutique : « la page d'accueil d'oguss.fr fait
beaucoup plus pro », titre collé au bord, pas de logo en amont, pas de
matière, pas de mouvement. Quatre réponses :

- **Le logo d'abord.** Le studio demande le logo (barre du haut + grand sur
  l'accueil, `PUT /settings/shops/:id/vitrine-logo/…`) avant le brief.
  `services/logoCouleurs.ts` lit ses couleurs (sharp, 48×48, fond écarté,
  teintes fusionnées) et en tire **quatre gammes** complètes (sombre, claire,
  contrastée, naturelle) au contraste vérifié (texte ≥ 4,5:1, accent ≥ 3:1).
  `GET /api/dropshop/:shopId/gammes`. Le vendeur en impose une ou laisse
  l'IA libre ; le vérificateur exige le logo dans l'en-tête (`--logo`).
- **La bibliothèque de design.** `services/designLibrary.ts` lit en Node les
  CSV de la skill `ui-ux-pro-max` copiés dans `backend/dropshop/design/`
  (67 styles avec recette et variables, 161 palettes par type de commerce,
  57 appariements Google Fonts, 34 patrons d'accueil, règles de mouvement,
  raisonnement par type). Glossaire commerce FR→EN, BM25 de poche, dossier
  rédigé (~6 000 caractères) donné au modèle comme **inspiration** : choisir,
  adapter, jamais recopier. Déterministe, donc banc sans modèle.
- **La consigne « niveau studio »** : matière dans les fonds (dégradés
  superposés, grain SVG en data URI, trames, blend modes — jamais d'image),
  profondeur (ombres à couches, verre, chevauchements, parallaxe), mouvement
  au survol des vignettes, **diaporama d'accueil** sur les photos produits
  (fondu, Ken Burns, pastilles), textes qui bougent (cascade, marquee,
  révélation au défilement avec état de repos lisible), logo au bon endroit,
  **alignement** (tout dans `.wrap`, jamais `width:100%` dessus — le
  vérificateur le refuse), code expert.
- **Modes visiteur** (case « expérience client immersive ») : quatre
  ambiances complètes en `[data-theme]`, sélecteur à quatre boutons
  `[data-mode]` dessinés, noms propres au commerce — pas « Noir / Clair /
  Gradient / Colorful » recopiés d'oguss. Le vérificateur (`--modes`) exige
  trois ambiances au moins et un clic qui pose `data-theme`.

## Le paiement : sur le compte Stripe du marchand

Nous n'encaissons rien pour lui. Il colle sa clé secrète (`sk_live_…`) dans le
studio ; à la commande, `POST /api/public/shops/:key/checkout` écrit les
commandes, ouvre une session Checkout **avec sa clé** (lignes + livraison),
et le moteur envoie l'acheteur chez Stripe. Au retour (`?session_id=…`), le
moteur demande `GET /checkout/:session` : la session est relue chez Stripe,
`paidAt` est posé sur les commandes, les emails partent — **jamais sur la
parole du navigateur** (leçon du `return_url` des chefs de rayon). Sans clé :
commande « à encaisser par le marchand », comme avant. Si Stripe refuse la
session, les commandes écrites sont effacées : pas de commande fantôme.

Le port n'est pas stocké par commande (le modèle `Order` est par ligne) : il
est facturé chez Stripe et rappelé dans les emails. À revoir si le back-office
doit l'afficher.

## Ce que le vendeur voit

`/creer-boutique` : il nomme ou choisit sa boutique hébergée, décrit celle de
ses rêves, paie 200 drops. L'avancement se lit en direct (écriture, contrôle,
réparation n) ; puis l'aperçu (ordinateur / téléphone) et la conversation :
chaque demande devient une version, chaque version se restaure. Bloc Stripe,
bouton « revenir à la vitrine à thèmes » (la page IA est retirée, les
versions restent).

## Bancs

```bash
cd backend && npx tsx check-dropshop.ts        # moteur + vérificateur + éditions
cd backend && npx tsx check-dropshop-jobs.ts   # prix, remboursements, versions (vraie base, comptes jetables, faux modèle)
```

## Reste à faire

- Sous-domaine `<slug>.drop-shipper.fr` et domaine propre (aujourd'hui `/b/<slug>`).
- Un vrai « boutique de démonstration » à montrer aux prospects.
- Le port par commande dans le back-office.
- Évaluer Opus 5 pour la création quand les retours le justifient (≈ 0,9 € la boutique).
