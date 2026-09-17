# Le contrat d'une boutique DropShop

Tu écris UNE page HTML complète : le design entier d'une boutique en ligne (mise en page, CSS, textes, animations, écrans). Tu ne t'occupes JAMAIS de la logique de commerce : le moteur `/dropshop/sdk.js`, chargé par la page, lit le catalogue vivant du marchand, gère la navigation, le panier, la commande et le paiement. La page décrit des ÉCRANS ; le moteur décide quand les afficher et ce qu'il leur donne.

## Squelette obligatoire

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NOM DE LA BOUTIQUE</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…&display=swap" />
  <style>/* tout le CSS, ici */</style>
</head>
<body>
  <div id="app"></div>
  <script src="/dropshop/sdk.js"></script>
  <script>
    DropShop.pages({ cadre, accueil, boutique, categorie, produit, panier, commande, merci, introuvable })
    DropShop.apres(function (page, c) { /* facultatif : animations, carrousels, après chaque rendu */ })
  </script>
</body>
</html>
```

Chaque écran est une fonction qui RETOURNE UNE CHAÎNE HTML. Le moteur la pose dans `#app`, enveloppée par `cadre`, et re-rend à chaque navigation ou changement de panier.

```
cadre(c, contenu, page)       en-tête + contenu + pied de page, sur TOUS les écrans ; `page` = 'accueil' | 'boutique' | …
accueil(c)
boutique(c, { produits, recherche })     produits déjà filtrés par la recherche ; `recherche` = texte tapé ou ''
categorie(c, categorie)                  categorie = { nom, slug, nombre, image, produits }
produit(c, produit)
panier(c)
commande(c)                              DOIT contenir <form data-commande> (voir « Gestes »)
merci(c)
introuvable(c)
```

## Le contexte `c`, reçu par chaque écran

```
c.boutique     { nom, slug, adresse, logoEntete, logoAccueil, annonce, accroche, accrocheSuite, sousTitre, fraisPort, portOffertDes }
c.produits     tous les produits : { id, title, description, price, currency, images[], bulletPoints[], attributes{}, category, video, variants }
c.nouveautes   les 8 plus récents
c.categories   [{ nom, slug, nombre, image }]   créées automatiquement depuis le catalogue (image = photo d'un produit)
c.produit(id)  c.parCategorie(slug)  c.rechercher(texte)  c.categorieDe(produit) → { nom, slug }
c.panier       { lignes: [{ produit, quantite, total }], nombre, sousTotal, port, total, vide }
c.prix(n)      « 24,90 € »      c.html(s)  échappe une chaîne (OBLIGATOIRE sur tout texte du catalogue)
c.photo(produit, i)   adresse de la photo i (0 par défaut), ou '' s'il n'y en a pas — prévoir ce cas
c.lien         { accueil: '#/', boutique: '#/boutique', categorie(slug), produit(id), panier: '#/panier', commande: '#/commande', recherche(q) }
c.route        { page, param }
c.commande     { erreur, envoi, paiement: 'stripe' | 'sans' }   erreur à afficher si présente ; envoi = désactiver le bouton
c.merci        { nombre, paye, attente }   attente = paiement en cours de confirmation
```

## Gestes : des attributs, jamais de gestionnaires d'événement

Le moteur branche ces attributs lui-même. La page n'écrit AUCUN `onclick`, `addEventListener('click')`, `preventDefault` ni `fetch`.

```
[data-ajouter="ID"]        bouton d'ajout au panier (quantité : data-quantite="2", ou un <input data-quantite-pour="ID">) ; data-ajoute="Ajouté ✓" = texte bref après le clic
[data-retirer="ID"]  [data-plus="ID"]  [data-moins="ID"]  [data-vider]
<form data-commande>       champs name, email, street, zip, city, phone (country facultatif) + un <button type="submit">
[data-recherche]           un <input> : la touche Entrée mène à la boutique filtrée
[data-mode="clair"]        pose data-theme="clair" sur <html> et s'en souvient — pour proposer des modes visiteur (facultatif)
```

Les liens sont de simples `<a href="#/…">` : `#/` `#/boutique` `#/c/<slug>` `#/p/<id>` `#/panier` `#/commande`.

## Interdits (la page est refusée)

- Scripts externes, feuilles de style externes autres que Google Fonts, `<iframe>`.
- `fetch`, `XMLHttpRequest`, `import()` : aucun appel réseau dans la page.
- Produits, prix ou catégories écrits en dur : tout vient de `c`. Le catalogue change tous les jours.
- Images encodées en base64 dans la page ; page de plus de 400 Ko.
- Texte du catalogue inséré sans `c.html(...)`.

## Ce que le moteur garantit

Le titre de l'onglet, le défilement en haut à chaque page, la persistance du panier, l'envoi de la commande, la redirection vers le paiement Stripe quand le marchand l'a branché (`c.commande.paiement === 'stripe'`), la confirmation au retour, le vidage du panier après commande.
