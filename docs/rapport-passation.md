# Rapport de passation — 30/09/2026 (fin de session Sonnet 5.5)

À lire en premier par la session suivante. Lire ensuite `CLAUDE.md` (règles durables) et
`REPRISE.md` (où on en est). Ce rapport dit **ce qui a été fait, ce qui est constaté, ce qui ne
l'est pas, et ce que Max attend**. Dernier commit poussé : `a333ae5`.

## 1. Comment Max veut travailler (à respecter dès la première minute)

- **Ne jamais s'arrêter pour demander.** Max laisse l'ordinateur tourner sans surveillance ; chaque
  arrêt lui coûte des heures et l'a mis hors de lui toute la journée. Un blocage réel se dit en une
  ligne, puis on passe au lot suivant. Ne pas clore un tour sur une question quand du travail reste.
- **Pas de plafond, pas de validation inutile.** Le mode automatique du desktop importe et publie sans
  repasser par le vendeur ; l'import n'a **aucune limite par défaut** (le solde de drops est la seule
  borne — décision de Max). Ne pas inventer de garde-fou que Max n'a pas demandé.
- **Un agent insiste** : il réessaie les échecs ordinaires, il ne s'arrête pas au premier accroc.
- **Limite que je maintiens (et Max le sait)** : pas d'imitation d'un humain pour tromper les
  anti-robots (faux profil matériel, gestes simulés, hasard « anti-bot », résolution de captcha). C'est
  aussi écrit dans `CLAUDE.md` (décision du 29/09). Sur un mur anti-robot l'agent fait une **pause
  automatique** (6 h doublée, 48 h max) puis retente seul ; il ne le force jamais. Le texte d'accord
  garde **une phrase** de risque (« les plateformes peuvent restreindre un compte qui automatise »),
  une case, une fois. Max a contesté ce point ; ma position est inchangée.
- Réponses courtes, en français. Vérifier avant d'affirmer : « compilé et poussé » n'est pas « vu
  fonctionner ».

## 2. Constaté en production aujourd'hui

- API `https://api.drop-shipper.fr/api/health` répond ; dernier déploiement Railway **réussi** (`a333ae5`).
- Version Shopify **`1.2-commandes` active** (portées `read_orders`,
  `write_merchant_managed_fulfillment_orders`) ; boutique de test `auto-parts-o8avomvl` ré-autorisée ;
  Commandes › Ventes captées : « relevé à l'instant · 0 nouvelle », sans erreur.
- Panneau « Ventes captées » (53 canaux) affiché ; bouton « Renouveler les autorisations » sur
  `/boutique-shopify` ; bouton « Créer une clé pour DropShipper Desktop » dans Réglages.
- Deux défauts trouvés et corrigés : `SHOPIFY_APP_SCOPES` (Railway) **remplaçait** la liste de portées
  (`read_orders` jamais demandé) → `porteeDemandee()` fait maintenant une union (`c10409a`) ; aucun
  moyen de ré-autoriser une boutique reliée (`b0acc39`).

## 3. Livré et poussé, testé seulement contre de faux serveurs (jamais confronté au réel)

**Ventes captées** (`backend/src/services/ventesMarketplaces.ts`, banc `check-ventes-canaux.ts`) :
Kaufland (`id_offer`, EAN de secours), WooCommerce, Magento, PrestaShop, BigCommerce, Wix, Shopware,
Ecwid, Squarespace, Drupal Commerce (Drupal : pas de renvoi du suivi, Commerce n'en a pas en standard).

**Application desktop** (`desktop/`, Electron, README à jour) :
- `lib/plafonds.js` — accord daté, plafonds de **publication** par plateforme (Vinted 10/j, Leboncoin
  5/j, Facebook 8/j, durs 15/8/10), espacement fixe, détection de blocage, pause automatique, journal.
- `lib/executeur.js` + `lib/adaptateurs.js` + `lib/pilote-electron.js` — publie une annonce (3 essais,
  jamais de double clic, résultat incertain → FAILED « vérifiez »).
- `lib/circuit.js` — import d'un lien reçu ; **import groupé de la liste du jour** des gagnants ;
  publication réseaux sociaux ; solde vide = arrêt net.
- `main.js` / `renderer/` — écran, sessions persistantes Vinted/Leboncoin/Facebook (le vendeur se
  connecte lui-même), interrupteurs « tout automatique » et « réseaux sociaux », limite d'imports facultative.
- Installeurs Windows **non signés** : `desktop/dist/` copiés dans `Bureau\DropShipper-Desktop\`
  (`.msi` 88 Mo, `.exe` 78 Mo). L'app empaquetée démarre ; **jamais essayée par un vrai vendeur**.
  Piège de build : `electron-builder` échoue sur les liens symboliques macOS du cache `winCodeSign` ;
  contournement appliqué sur ce poste (copie d'un dossier extrait en `winCodeSign-2.6.0`).

**Serveur, routes agent** (`backend/src/routes/agent.ts`, banc `check-agent-publications.ts`, tous verts) :
- `GET /api/agent/publications` et `POST …/:id/resultat` — file des `Publication` PENDING de
  VINTED/LEBONCOIN/FACEBOOK (aucune migration).
- Clé de type **desktop** (préfixe `dsp_desk_`, créée via `POST /api/settings/api-keys {type:'desktop'}`) :
  seule autorisée pour `POST /import`, `POST /publications`, `GET /gagnants`, `POST /social`.
  Les clés d'agents tiers (`dsp_live_`) gardent leurs droits d'origine (403 ailleurs).
- `GET /api/agent/gagnants` — liste du jour tirée de `MarketReport.produits` : marge connue ≥ `margeMin`
  (20 par défaut), import `api|url` (les pages « extension » sont écartées et comptées), pas déjà au
  catalogue ; seuil de 500 drops comme Fresh news ; jusqu'à 1000 produits.
- `services/desktopFile.ts` — le **pilote automatique serveur** met ses produits gagnants en file
  desktop (si une clé desktop non révoquée a servi depuis moins de 7 jours).

## 4. Ce qui n'est PAS fini

1. **Publication réelle sur Vinted / Leboncoin / Facebook** : sélecteurs copiés de l'extension, jamais
   confrontés à une vraie page connectée. **Le Chrome de Max n'est pas connecté à Vinted**
   (`/items/new` renvoie à l'inscription). Il doit s'y connecter (Vinted, Leboncoin, Facebook) pour
   qu'on relève les vrais champs.
2. **La catégorie Vinted/Leboncoin** : le pilote ne la règle pas. Elle figure encore dans `requis`
   (`desktop/lib/adaptateurs.js`) → le mode automatique **ne publie rien** sur ces deux plateformes.
   Ma tentative de la retirer des `requis` a été **refusée par le classifieur de permissions** ; je ne
   l'ai pas contournée. À décider avec Max : soit régler la catégorie (recherche dans la fenêtre de
   catégories, à écrire sur session réelle), soit tenter la publication et marquer l'échec.
3. **Réseaux sociaux** : `POST /api/agent/social` s'appuie sur la passerelle (`socialGateway`,
   Zernio/Meta) **jamais confrontée au vrai service** (pas de clé, app Meta non validée).
4. **Écran Electron** : rendu vérifié dans un navigateur avec un état simulé, jamais dans la fenêtre
   Electron réelle ; clics non testés.
5. **Sélection des « gagnants »** : le desktop importe TOUTE la liste du jour filtrée par marge. Pas
   d'autre critère (catégories choisies par le vendeur, etc.).
6. **Signature des installeurs** (SmartScreen affichera « Éditeur inconnu »), mises à jour automatiques.
7. eBay : les jetons se collent à la main ; le vrai remède est un « Connecter mon compte eBay » OAuth
   (demande la clé d'application eBay de Max : Client ID/Secret + RuName). Non commencé.

## 5. À la charge de Max (je ne peux pas le faire)

- **Chrome Web Store** : téléverser `backend/extension-store.zip` (1.37.0) — Chrome interdit à
  l'automate de piloter cette page (« extensions gallery cannot be scripted »), et Google redemande le
  mot de passe. Son extension active est encore en **1.36.0**.
- Jeton eBay avec `sell.fulfillment` (secret).
- Envoyer au développeur mobile les deux fichiers du Bureau (`dropshipper-api.config.json`,
  `API-LINK-…md`) — message envoyé en son nom.
- Se connecter à Vinted / Leboncoin / Facebook dans son Chrome (cf. §4.1).
- Créer sa clé desktop (Réglages › Clés pour mes agents) et la coller dans l'application.

## 6. Les « déploiements qui crashent » (Max s'en est plaint)

Vérifié via `api.github.com/repos/STANDUP-SHOW/DropShipPro/commits/<sha>/status` : sur 21 commits du
30/09, **la majorité des déploiements Railway sont marqués « failure » alors que Vercel réussit**, et
les commits qui sont restés en ligne (`57e73cb`, `a6353e0`, `975d8dd`, `a333ae5`) ont **réussi**.
L'hypothèse la plus probable : **des builds interrompus par mes pushes trop rapprochés** (un push toutes
les 3–10 minutes ; Railway abandonne le build en cours et le marque échoué). **Je n'ai pas pu lire les
journaux Railway** (pas de CLI ni de MCP Railway dans cette session) : hypothèse **non prouvée**, et
`28099e6` (13:31, resté 1 h 40 en tête) est aussi « failure » — à regarder dans le tableau de bord :
https://railway.com/project/046ee3ad-fef1-4c84-b8fa-b9f22e10948d . **Règle pour la suite : pousser
en lots, pas à chaque commit** ; et lire un vrai journal de build avant de conclure.
Aussi : le contrôle global `npm run controle` a montré `check-ventes-shopify.ts` et
`check-dropshop-jobs.ts` en échec **quand lancés dans le lot**, mais ils passent **seuls** — piste :
interférence entre bancs sur la base partagée (la même en local et en production).

## 7. Pièges d'outillage vus aujourd'hui

- Le tool Bash perd les antislashs dans un heredoc et dans `node -e` : regex et JS passent par
  Write/Edit (voir la mémoire `heredoc-antislash`).
- Sur admin.shopify.com / Dev Dashboard, un clic par `ref` peut ne rien déclencher : utiliser
  `javascript_tool` avec `.click()`. Captures d'écran impossibles fenêtre masquée : lire le DOM.
- Vérification Shopify OAuth : c'est la page `/app/grant` qui affiche les portées demandées.
- Les benches `check-*` créent des comptes jetables sur la **vraie base** : toujours les nettoyer.

## 8. Commandes

```bash
cd backend && npx tsc --noEmit && npm run controle       # tous les bancs (deux échecs d'interférence connus)
cd backend && npx tsx check-agent-publications.ts        # file, clé desktop, gagnants, social
cd desktop && node check-desktop.cjs                     # logique du desktop (faux pilote)
cd desktop && npm run build                              # installeurs dans desktop/dist
cd frontend && npm run build
```

## 9. Ordre conseillé pour la prochaine session

1. Lire les journaux Railway (§6) ; si vraiment des builds échouent, corriger avant tout.
2. Demander à Max de se connecter à Vinted / Leboncoin / Facebook dans Chrome, puis relever les vrais
   champs et **écrire le réglage de catégorie** ; trancher §4.2.
3. Lancer l'app installée avec une vraie clé desktop de Max sur un compte de test et constater le
   circuit complet (lien → import → file → « Préparer »).
4. Ensuite seulement : réseaux sociaux réels, OAuth eBay, signature des installeurs.
