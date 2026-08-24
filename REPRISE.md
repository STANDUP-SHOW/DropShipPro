# Mémo de reprise — 25 août 2026

Ce fichier existe pour qu'une conversation puisse être vidée sans rien perdre.
Il ne répète pas `CLAUDE.md` : il dit **où on en est**, **ce qui bloque**, et
**ce qui reste à faire**.

---

## Ce qui bloque, à traiter en premier

### 1. R2 refuse l'écriture — `Access Denied`

**C'est le blocage le plus coûteux : il casse trois fonctions à la fois.**

Constaté en production sur `/api/health/services` :

```
stockage : r2-refuse
Stockage R2 : l'ecriture est refusee (Access Denied).
```

Conséquences réelles, toutes observées :

- **le filigrane ne s'applique pas** — l'image est bien téléchargée et bien
  filigranée, mais l'enregistrement échoue et le code retombe sur la photo
  d'origine du fournisseur, sans message. C'est la cause du « filigrane qui ne
  marche pas » signalé il y a plusieurs jours, et que j'avais mal diagnostiqué
  la première fois (j'avais corrigé les en-têtes de téléchargement) ;
- **les agents photo et publicité** génèrent l'image puis n'arrivent pas à la
  ranger ;
- tout ce qui écrira des fichiers ensuite : factures, exports.

**À faire côté Cloudflare** — R2 → Manage API Tokens :

- le jeton doit être en **Object Read & Write**, pas seulement Read. C'est la
  cause la plus fréquente et elle donne exactement ce message ;
- `R2_BUCKET` doit contenir le seul nom du compartiment ;
- le jeton doit porter sur **ce** compartiment — un jeton créé pour un autre
  répond « Access Denied » et non « bucket introuvable ».

**Vérification** : `/api/health/services` passe de `r2-refuse` à `r2`. Le
contrôle écrit sous le préfixe `generated/`, exactement là où l'application
écrit — une première version testait un préfixe inutilisé et affichait un vert
trompeur.

### 2. Génération d'images : jamais vue fonctionner

`GOOGLE_AI_API_KEY` est en place et acceptée (`images: ok`). Le modèle est
appelé, mais l'enregistrement du résultat butte sur le blocage R2 ci-dessus.
**Rien ne prouve encore qu'une image sort correctement** — à retester dès que R2
écrit.

---

## Décisions prises, à ne pas refaire

- **Modèle d'image : `gemini-3.1-flash-lite-image`** (Nano Banana 2 Lite), pas
  Pro. 0,0336 $ l'image contre 0,134 $ : au tarif Pro, **les huit paquets
  d'images se seraient vendus à perte**, jusqu'à 2 766 € sur le plus gros.
  Réglable par `GOOGLE_IMAGE_MODEL` sans redéploiement.
- **Grille images validée** : 100→10 €, 250→22, 500→40, 1 000→70, 2 500→160,
  5 000→290, 10 000→400, 25 000→800. Marges 68 % à 20 %, **sauf le dernier
  palier à 1 %** — 4,20 € de bénéfice sur 800 €, aucune marge de sécurité si
  Google augmente. Décision assumée, signalée dans le code.
- **Chefs de rayon en abonnement** : 1 €/jour, 5 €/semaine, 15 €/mois, avec
  **24 h offertes à l'embauche**. Un abonnement expiré arrête l'agent mais
  conserve ses trouvailles.
- **Le pilote automatique ne publie que sur les destinations à vraie API.**
  Vinted, Leboncoin et Facebook exigent le clic du vendeur : publier à sa place
  ferait suspendre son compte.
- **Aucun scraping d'Amazon, de Cdiscount, de la bibliothèque publicitaire Meta
  ni des boutiques concurrentes.** Refusé et à garder refusé.
- **Jamais d'identifiants marketplace confiés à un agent tiers.** Un agent
  extérieur l'a demandé ; c'est non.

---

## Ce qui reste demandé et pas encore fait

Par ordre de valeur, tel que discuté :

1. **Deux nouveaux agents** — *Le Comptable* (inclus dans l'abonnement) et
   *L'Avocat* (15 €/mois) : experts, avec discussion, mention « à faire vérifier
   par un professionnel », SIRET, factures, bilan.
2. **Page Mes marketplaces** — fournisseurs et destinations, chacune avec logo,
   ce qu'on peut y faire, bouton Activer, pop-up de détail. Les **742 logos
   exploitables** sont déjà dans `frontend/public/logos/` avec leurs règles
   d'usage dans le README du dossier.
3. **Pages SEO par plateforme** — « comment vendre sur … avec DropShipper ».
4. **Page API Links** — clés par plateforme, pages Facebook et TikTok pour les
   publicités.
5. **Refonte de Mon compte** en trois blocs : annonces et formules, agents,
   graphique. Plus le bloc noir « Transparence crédits IA ».
6. **Réglages** : blocs vendeur, filigrane (case à cocher + logo PNG/SVG en bas
   à droite, 100 % d'intensité), plateformes fournisseurs, flux automatiques,
   marketplaces à clé d'API. Bloc « Clés pour mes agents » à replier.
7. **Comptabilité et SAV** : tickets internes, litiges, chiffres par plateforme.
8. **Messagerie type boîte mail** : tri par date et plateforme, archiver,
   marquer non lu.
9. **Renommages demandés** : agent vendeur → **Olivier** ; « Mon compte » →
   « Mes crédits ».

---

## Repères techniques

- Les regex écrites par script perdent leurs barres obliques inverses : `\d`
  devient `d`, `\b` devient un **caractère de recul invisible** qui ne
  correspond jamais. Trois régressions déjà causées ainsi. **Écrire les regex
  avec l'outil d'édition, jamais via un script shell**, et les tester.
- Le catalogue de catégories compte **113 entrées sur 15 rayons**. Chaque
  boutique déclare ce qu'elle vend ; l'import ne propose que ces catégories.
  Rien de coché = tout proposé.
- Neuf **adaptateurs d'images par fournisseur** (`extension/content/adapters.js`)
  écrits d'après une inspection en direct. Un adaptateur muet s'efface et le
  scan générique reprend la main.
- L'auto-contrôle `/api/health/services` teste **réellement** chaque service :
  il appelle le modèle, écrit dans le stockage, interroge la base. « Configuré »
  n'y veut jamais dire « fonctionne ».
