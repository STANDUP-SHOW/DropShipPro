# DropShipper Desktop

Le compagnon de bureau de drop-shipper.fr (Electron). Décisions : `docs/v2/DECISIONS.md`.

## Ce qui est écrit (30/09/2026)

| Pièce | Fichier | État |
|---|---|---|
| Clé d'API chiffrée par le coffre du système, appairage | `lib/config.js`, `lib/api.js`, `main.js` | banc vert |
| File de travail (liens partagés du mobile), sondage fixe 60 s, `claim` | `lib/file.js` | banc vert |
| Sessions persistantes Vinted / Leboncoin / Facebook (partition `persist:*`, le vendeur se connecte lui-même) | `main.js` | **jamais lancé sous Electron** |
| Garde-fous du mode automatique : accord daté, plafonds (durs), espacement, arrêt au premier blocage, journal | `lib/plafonds.js` | banc vert |
| Surveillance des blocages sur chaque fenêtre de session | `main.js` (`surveiller`) | **jamais lancé sous Electron** |
| Exécuteur de publication (modes validation et automatique, arrêt au blocage, jamais de « Publier » avec un champ indispensable manquant) + adaptateurs + pilote Electron | `lib/executeur.js`, `lib/adaptateurs.js`, `lib/pilote-electron.js` | logique : banc vert avec faux pilote ; **pilote et sélecteurs jamais confrontés à une vraie page connectée** |
| File côté serveur : `GET /api/agent/publications`, `POST …/resultat` (Publication PENDING de Vinted/Leboncoin/Facebook, sans migration) | `backend/src/routes/agent.ts` | banc vert (`check-agent-publications.ts`) |
| Écran de contrôle (CSP stricte, données posées en `textContent`) | `renderer/` | rendu constaté dans un navigateur avec un état simulé (30/09) ; jamais dans la fenêtre Electron |

## Ce qui n'est PAS écrit

- **La catégorie Vinted / Leboncoin** : c'est une fenêtre à plusieurs niveaux que le pilote ne règle pas. Le pilote ne rend jamais « categorie » dans `rempli`, donc **le mode automatique ne publie RIEN sur Vinted ni Leboncoin** (l'exécuteur rend la main : « à compléter par vous : categorie ») ; il publie sur Facebook, dont les sélecteurs sont les moins sûrs. En mode « Préparer », tout le reste est rempli et le vendeur choisit la catégorie et publie.
- Les imports en masse par le navigateur, la préparation des commandes fournisseurs (arrêt au paiement).
- Synchro par WebSocket (le sondage suffit tant que la file est courte).
- Signature des exécutables et mises à jour automatiques.

## Ce qui est interdit ici (CLAUDE.md, décision du 29/09/2026)

Pas de faux profil matériel, pas de navigateur « stealth », pas de résolution de captcha, pas de hasard « anti-bot » : intervalles fixes, navigateur normal, vraie session. Le premier captcha ou avertissement arrête la plateforme ; le vendeur reprend lui-même. Aucun identifiant de place de marché n'est lu ni transmis.

## Lancer

```bash
cd desktop
npm install        # télécharge Electron (~100 Mo)
npm run check      # banc de la logique pure, sans Electron
npm start
```

## Installeurs Windows (générés le 30/09/2026)

`npm run build` produit dans `dist/` : `DropShipper Desktop Setup 0.1.0.exe` (NSIS) et `DropShipper Desktop 0.1.0.msi`. **Non signés** : Windows SmartScreen affichera « Éditeur inconnu » (Informations complémentaires › Exécuter quand même) tant qu'un certificat de signature n'est pas acheté. Sous Windows, `electron-builder` échoue sur des liens symboliques macOS de son cache `winCodeSign` : copier un dossier extrait du cache en `winCodeSign-2.6.0` (fait sur ce poste). L'app empaquetée démarre ; jamais essayée par un vendeur.

Clé d'API : drop-shipper.fr › Réglages › Clés d'API (préfixe `dsp_live_`).
