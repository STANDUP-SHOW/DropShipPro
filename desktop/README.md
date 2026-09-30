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
| Écran de contrôle (CSP stricte, données posées en `textContent`) | `renderer/` | **jamais affiché** |

## Ce qui n'est PAS écrit

- **L'exécuteur de publication** (remplir et valider le formulaire Vinted / Leboncoin / Facebook). Les garde-fous sont prêts et attendent : l'exécuteur doit appeler `plafonds.decision()` avant chaque annonce, `plafonds.journaliser()` après, et `plafonds.detecterBlocage()` + `plafonds.arreter()` à chaque page. Le remplissage Leboncoin de l'extension (`backend/extension/`) est la base ; il n'a jamais été vu aller au bout des quatre écrans.
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
