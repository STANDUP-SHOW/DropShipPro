# Mémo de reprise — 25 août 2026 (mis à jour en fin de journée)

Ce fichier existe pour qu'une conversation puisse être vidée sans rien perdre.
Il ne répète pas `CLAUDE.md` : il dit **où on en est**, **ce qui bloque**, et
**ce qui reste à faire**. À lire en entier avant de reprendre.

---

## Ce qui bloque, à traiter en premier

### 1. Deux pannes corrigées le 25/08/2026, **à constater en production**

Le code est écrit, compilé et commité ; **rien n'est encore vérifié sur
www.drop-shipper.fr ni sur la machine qui bloquait**. Ne pas rayer ces deux
lignes avant de l'avoir vu.

**a. « removeChild » sur la fiche d'une annonce.** Cause trouvée : dans
`ProductDetail.tsx`, le libellé de catégorie s'écrivait
`Catégorie{product.sourceCategory && (…)}`. Une `sourceCategory` vide rend la
chaîne vide, donc un nœud de texte vide collé à du texte, et React en perd la
trace. Le libellé est désormais **une seule chaîne**, et les conditions qui
peuvent valoir une chaîne vide (`externalUrl`, `error`, `message`, `photoError`,
`sourceSite`, dans la fiche et dans `PublishDialog`) passent par un ternaire qui
rend `null`. **Le motif reste présent ailleurs dans l'application** : chaque
`{chaîne && …}` posé à côté de texte est un candidat.

**b. L'import par l'extension bloquait à l'étape des images.** **La vraie cause,
trouvée au deuxième essai : `NOT_A_PHOTO is not defined`.** La constante était
utilisée trois fois dans `capture.js` — pour compter les hôtes, pour scorer, pour
filtrer — et définie nulle part ; `OFF_TOPIC` non plus. Introduites ainsi par
`572b3ff`, jamais définies depuis. Chaque import qui atteignait le classement des
images levait une `ReferenceError` et s'arrêtait là, sur **tous** les sites. Rien
à voir avec une machine lente.

Les deux constantes sont écrites et éprouvées sur vingt-six adresses réelles.
`NOT_A_PHOTO` écarte le mobilier de page (icônes, logos, pixels, vignettes) ;
`OFF_TOPIC` pénalise sans exclure les photos de recommandation.

Le premier essai avait corrigé, lui, un vrai défaut mais pas celui-là : un seul
`Promise.all` lançait jusqu'à un millier de téléchargements d'images d'un coup,
là où Chrome n'ouvre que six connexions par hôte. Remplacé par une file de douze,
budget de trente secondes, bitmap libéré après mesure. Ça reste utile, ça ne
débloquait rien.

**La leçon, et le garde-fou.** Le contrôle de `CLAUDE.md` ne validait que la
syntaxe : un identifiant inexistant compile parfaitement. `extension/check.cjs`
le remplace et fait trois passes — syntaxe, constantes utilisées mais jamais
définies, filtres de photos confrontés à des adresses réelles. Vérifié : passé
sur la version fautive, il signale `NOT_A_PHOTO` et `OFF_TOPIC`.

```bash
cd backend && node extension/check.cjs
```

Pour constater : recharger l'extension en Mode développeur sur la machine qui
bloquait, puis importer. Regarder la console du **service worker**, pas celle de
la page.

### 2. ~~R2 refuse l'écriture~~ **réglé le 25/08/2026**

Le compartiment est dans la **juridiction européenne** (« photos de droppost |
UE »). R2 exige alors l'adresse `<compte>.eu.r2.cloudflarestorage.com`, et
répond « Access Denied » — et non « compartiment introuvable » — quand on vise
l'adresse standard. Le jeton était valide depuis le début.

`R2_JURISDICTION=eu` est posé dans Railway. **Constaté sur
`/api/health/services` : `stockage: r2`, `ok: true`, aucune alerte.**

Le blocage cassait trois choses ; elles sont donc débloquées mais **pas encore
constatées une par une** : le filigrane (qui retombait en silence sur la photo
d'origine du fournisseur), les agents photo et publicité, et tout ce qui écrira
des fichiers ensuite.

À savoir pour la prochaine fois : le contrôle écrit sous le préfixe
`generated/`, exactement là où l'application écrit — une première version
testait un préfixe inutilisé et affichait un vert trompeur. Et l'alerte donne
maintenant **l'hôte et le compartiment réellement visés**, pour qu'un « Access
Denied » ne renvoie plus relire les variables de Railway.

### 3. Génération d'images : jamais vue fonctionner

`GOOGLE_AI_API_KEY` est en place et acceptée (`images: ok`). Le modèle est
appelé, et l'enregistrement du résultat ne bute plus sur R2. **Rien ne prouve
encore qu'une image sort correctement** — reste à faire tourner un agent photo
pour de vrai et à regarder l'image produite. C'est désormais possible.

### 4. ~~Deux secrets ont circulé en clair~~ **fait le 24/08/2026**

Le jeton R2 et la clé Google ont été révoqués et régénérés, puis reposés dans
Railway. Rien n'était à changer dans le code.

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
- **Publicités : tarif ads = tarif photo × 4**, l'agent rend **2 propositions**,
  et la grille **s'arrête à 250 ads**.
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

## Deux questions posées, deux réponses établies

### Les clés de dépôt ne mettent en commun aucun agent

Question : « nous serons nombreux à utiliser DropShipper, donc les clés de dépôt
créent-elles un répertoire où tous les agents de tout le monde sont ensemble ? »

**Non.** Vérifié dans le code :

- la clé est stockée en SHA-256, jamais relisible, et porte un `userId` ;
- `middleware/apiKey.ts` résout la clé vers **ce seul compte** et pose
  `req.userId` ;
- les **dix écritures** de `routes/agent.ts` utilisent `userId: req.userId!` —
  aucune ne lit un identifiant fourni dans le corps de la requête ;
- la lecture est filtrée pareil : un vendeur ne voit que ses opportunités, ses
  signaux, ses rapports.

Deux vendeurs qui brancheraient le même agent base44 ne verraient donc jamais
les trouvailles l'un de l'autre. **Aucun répertoire commun n'existe.**

### Ce que coûte un « avis sur un produit »

Recherche web facturée 10 $ les mille, plus la lecture des résultats par Sonnet
(3 $/M en entrée, 15 $/M en sortie) :

| Profondeur | Coût unitaire | À 10 000 par jour |
|---|---|---|
| 3 recherches | 0,094 € | 938 €/jour — **28 000 €/mois** |
| 5 recherches | 0,150 € | 1 495 €/jour — **45 000 €/mois** |
| 8 recherches | 0,239 € | 2 392 €/jour — **72 000 €/mois** |

Ce qu'un crédit rapporte : **0,25 €** au pack 5 €, **0,125 €** au pack 25 €,
**0,08 €** au pack 100 €.

**Un avis à 1 crédit se vendrait donc à perte** sur les deux plus gros paquets.
**Décision retenue : 3 crédits l'avis, 5 recherches au maximum** — 0,24 €
encaissés au pire pack contre 0,15 € de coût, soit 38 % de marge partout. Un
avis déjà rendu sur la même URL doit être **resservi sans repayer** pendant
quelques jours : c'est le garde-fou qui empêche la facture de tripler sur un
vendeur indécis.

---

## Ce qui reste demandé et pas encore fait

Mis à jour le 25/08/2026 au soir. Ce qui est barré a été livré et poussé ;
**rien de tout cela n a été constaté en production** — c est le travail de la
prochaine session.

1. ~~**Info sur un produit**~~ **fait.** Onglet dans chaque chef de rayon :
   coller une URL, avis en trois volets (fournisseurs, réseaux, places de
   marché). 3 crédits, 5 recherches, cache par adresse pendant une semaine.
2. **Clé de dépôt** — *repoussé à la demande du client* : le but est que les
   vendeurs consomment nos agents, pas qu ils branchent les leurs.
3. ~~**Structure complète d un chef de rayon**~~ **fait.** Produits gagnants ·
   Info sur un produit · Fournisseurs · Réseaux · Places de marché · **Ses
   ventes** (chiffre, marge et commandes par plateforme, plus l état en ligne de
   chaque annonce du rayon) · Messagerie.
4. ~~**Page Mes marketplaces**~~ **fait, en deux pages** comme demandé :
   `/plateformes-acquisition` (16 fournisseurs) et `/plateformes-vente` (les 21
   destinations, rangées par ce qu on peut en faire). Logos depuis les 742
   fichiers, pastille typographique pour les marques absentes.
5. ~~**Pages SEO par plateforme**~~ **déjà en ligne** avant cette session.
6. ~~**Page API Links**~~ **fait** : `/api-links` rassemble les clés de place de
   marché, les comptes de régie publicitaire et les clés de dépôt.
7. ~~**Refonte de Mon compte**~~ **fait** : « Mes crédits », trois blocs, prix de
   chaque agent, bloc noir Transparence crédits IA.
8. **Réglages** — *partiellement fait*. Le **filigrane** est réglable pour de
   vrai (case à cocher, logo PNG/SVG/JPEG/WebP, coin sur une grille de neuf,
   intensité, taille ; par défaut en bas à droite à 100 %), et le bloc Sécurité
   existait déjà. **Restent** : les blocs plateformes fournisseurs et flux
   automatiques, et le repli du bloc des clés.
9. ~~**Comptabilité et SAV**~~ **fait**, sauf les tickets internes :
   `/comptabilite` donne le chiffre, le coût et la marge mois par mois et
   plateforme par plateforme, les remboursements et les litiges ouverts. Les
   **tickets internes** ne sont pas écrits ; les litiges passent par les
   conversations acheteurs.
10. ~~**Messagerie type boîte mail**~~ **fait** : filtre par plateforme, tri par
    date, isolement des non-lus, archiver, marquer non lu.
11. ~~**Renommages**~~ **fait** : Olivier, « Mes crédits ».

**Ajouté en cours de route et non terminé** : le **relevé des campagnes
publicitaires**. Les comptes de régie se relient et sont conservés, mais aucun
connecteur ne va lire les chiffres. Le client a raison sur le principe : avec le
jeton du vendeur, les API de lecture de Meta, Google Ads et TikTok sont
accessibles sans que nous ayons notre propre application validée. C est un
connecteur par régie, à écrire.

---

## Ce qui a été livré récemment (ne pas refaire)

- **Le Comptable (Gérard)**, compris dans l'abonnement, et **L'Avocat (Maître
  Doré)**, 15 €/mois — `services/agentRoster.ts`, `services/supportChat.ts`.
  Tous deux **cherchent sur le web avant de répondre** (`web_search`, 4 requêtes
  au plus, sources officielles citées avec leur date). C'est une correction :
  le comptable annonçait de mémoire un seuil de TVA faux, puis, après une
  première rustine trop brutale, niait l'existence de la franchise. Vérifié en
  production, la troisième réponse était juste.
- Chaque carte d'agent affiche **son prix et ses limites** (`pages/Agents.tsx`).
- L'adresse R2 tient compte de la juridiction (`lib/storage.ts`).
- Le catalogue de catégories couvre **les quinze rayons**, plus seulement la
  mode homme.

---

## Le cap donné le 25/08/2026 au soir — acquisition et diffusion par API

Demandé après lecture des rapports de `C:\Users\maxma\Downloads\CLAUDE-CODE-INFORMATIONS`
(les deux derniers : `RESUME_EXECUTIF.md` et `rapport_dropshipping_platforms.html`,
sur DSers, Syncee, Koongo et Channable). **Rien de cette section n'est écrit à ce
jour, sauf le point 1.**

Ce que disent les rapports, et qui change la direction : les quatre plateformes
étudiées **n'utilisent pas de scraping**. Elles passent par l'**API officielle**
du fournisseur — c'est explicitement ce que fait DSers avec AliExpress — parce
que c'est plus fiable, temps réel, et sans risque de bannissement. Notre
extension reste indispensable là où aucune API n'existe, mais elle ne doit plus
être le seul chemin.

### 1. La fenêtre « Diffuser », rangée par mode de diffusion

Quand le vendeur clique sur Publier, la fenêtre présente **ses cases à cocher
dans cet ordre**, chaque groupe séparé :

1. **Mes boutiques**, nommées une par une — `boutique-machin.fr`,
   `boutique-machin.com`. C'est pour ça que **le vendeur doit nommer ses
   boutiques** au moment de les ajouter.
2. **Les boutiques à flux** — Google, Facebook, TikTok…
3. **Les boutiques à API**.
4. **Les boutiques assistées par extension**.
5. **En bas, celles où il ne peut pas diffuser**, et pourquoi.

Puis : « **Votre boutique n'est pas dans la liste ? Ajoutez-la** », qui mène à
`/plateformes-vente`, l'annuaire complet avec logos, encadrés cliquables et
pop-up d'information par plateforme.

### 2. Deux pages de raccordement, distinctes

- **API Connect** — relier les **sites et places de marché** où l'on vend.
- **API Sourcing Connect** — relier DropShipper **aux fournisseurs**, et les
  fournisseurs à DropShipper. C'est ce qui ouvrira le reste : commande
  automatique, stock temps réel, suivi.

### 3. Acquisition d'une annonce par API officielle du fournisseur

Une page qui lui est consacrée, à côté de l'import par extension et de l'import
par adresse. C'est la troisième voie d'acquisition, et la plus sûre.

### 4. Le mapping, et l'agent qui en a la charge

Le **mappage des catégories vers la plateforme de destination** est un chantier à
part entière, à confier à un agent. Il existe déjà en partie
(`categoryMapping.ts`, `categorySectors.ts`) mais doit devenir un poste tenu.

### 5. Gestion fournisseur, dans le menu

Un **agent de liaison inter-plateforme** : notre lien avec les plateformes
fournisseurs, avec sa messagerie et de quoi **commander les produits en face**.
La rubrique « Gestion fournisseur » réunira commandes, factures, chiffre
d'affaires fournisseur. À faire quand les API seront branchées.

### 6. Sélection de produits gagnants via compte affilié

Le client ouvre des comptes affiliés (type AliExpress) pour obtenir des **API de
revendeur**, et proposer une sélection de *mining products* aux utilisateurs.

### 7. Le mode d'emploi à refaire

Il décrit un fonctionnement qui n'est plus le nôtre. À reprendre entièrement :
agents, mode automatique, publication par extension, publication par API,
publication par flux.

**La chaîne complète visée**, telle qu'énoncée : acquisition par extension, par
API, par corporate → transformation IA du titre, de la description, du SEO et
des images → mappage des catégories par destination → agent de contrôle →
comptable, avocat → agent de liaison fournisseur.

---

## Repères techniques

- Les regex écrites par script perdent leurs barres obliques inverses : `\d`
  devient `d`, `\b` devient un **caractère de recul invisible** qui ne
  correspond jamais. Quatre régressions déjà causées ainsi. **Écrire les regex
  avec l'outil d'édition, jamais via un script shell**, et les tester.
- **Un long texte écrit par `cat > fichier` se fait avaler par le shell** :
  troncature, ou apostrophes qui cassent le document. Ce mémo lui-même en a été
  victime deux fois. Passer par l'outil d'écriture.
- Le catalogue de catégories compte **113 entrées sur 15 rayons**. Chaque
  boutique déclare ce qu'elle vend ; l'import ne propose que ces catégories.
  Rien de coché = tout proposé.
- Neuf **adaptateurs d'images par fournisseur** (`extension/content/adapters.js`)
  écrits d'après une inspection en direct. Un adaptateur muet s'efface et le
  scan générique reprend la main.
- L'auto-contrôle `/api/health/services` teste **réellement** chaque service :
  il appelle le modèle, écrit dans le stockage, interroge la base. « Configuré »
  n'y veut jamais dire « fonctionne ».
- **Avant de chercher un bug dans le code, regarder ce que le serveur renvoie
  vraiment.** C'est ce qui a trouvé le 405 de Vercel, l'extension en 404, les
  images AVIF manquées, la juridiction R2 et les chiffres faux du comptable.
