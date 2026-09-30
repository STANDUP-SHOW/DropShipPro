# Rapport de passation — 30/09/2026, nuit (fin de session Fable 5.1)

À lire en premier par la session suivante, puis `CLAUDE.md` (règles durables) et la tête de
`REPRISE.md`. Ce rapport dit **ce qui a été fait, ce qui est constaté, ce qui ne l'est pas, et
ce que Max attend**. Il remplace le rapport du soir (même jour, session Sonnet 5.5).

## 1. Comment Max veut travailler

- **Ne jamais s'arrêter pour demander.** Un blocage réel se dit en une ligne, puis on passe au
  lot suivant.
- **Pas de plafond, pas de validation inutile** : l'import n'a aucune limite par défaut (le
  solde de drops est la seule borne). Ne pas inventer de garde-fou que Max n'a pas demandé.
- **Un agent insiste** : il réessaie les échecs ordinaires.
- **Limite maintenue** (`CLAUDE.md`, décision du 29/09) : pas d'imitation d'un humain pour
  tromper les anti-robots. Sur un mur, pause automatique (6 h doublée, 48 h max) puis reprise.
- Réponses courtes, en français. « Compilé et poussé » n'est pas « vu fonctionner ».
- Max a annoncé : **les tests de tout se font le 01/10**.

## 2. Fait dans cette session

| Lot | Où | Preuve |
|---|---|---|
| **Facebook Marketplace relevé sur la vraie page connectée** : champs par libellé (Titre, Prix, Description), catégorie et état choisis dans les listes lues sur la page, « Suivant » puis « Publier », bouton grisé attendu | `desktop/lib/adaptateurs.js`, `page.js`, `choix.js`, `pilote-electron.js` | la fonction réelle `lireOptions` a tourné sur la page de Max et rendu les 26 rayons ; banc `check-desktop.cjs` vert (choix de catégorie sur ces 26 rayons, état, refus de publier sans catégorie) |
| **Gagnants : marge minimale et rayons choisis par le vendeur** | `GET /api/agent/gagnants?categories=` (rend aussi `categories`, les rayons du jour) ; écran du desktop (cases à cocher, marge) | `check-agent-publications.ts` et `check-desktop.cjs` verts |
| **« Connecter mon compte eBay » (OAuth)** | `backend/src/routes/ebayAuth.ts` (`/api/ebay/oauth/start`, `/api/ebay/callback`), `services/ebay.ts`, bouton dans `PlatformCredentials.tsx` | `check-ebay.ts` vert (faux serveur) ; **inactif en production** tant que les trois variables manquent |
| **Vraie fenêtre Electron** | `desktop/check-fenetre.cjs` (`npm run check:fenetre`) | écran chargé, pont complet, fausse clé refusée par l'API de production avec le bon message |
| **Railway « failure »** | tableau de bord lu dans Chrome | historique = `REMOVED` (remplacé par le push suivant), aucun `FAILED` : pas de build cassé. Pousser en lots |
| Installeurs **0.2.0** (non signés) | `desktop/dist/`, copiés dans `Bureau\DropShipper-Desktop\` | fabrication réussie |

`npx tsc --noEmit` et `npm run build` (site) verts. `npm run controle` complet non relancé
(il tourne sur la base partagée ; les bancs touchés ont été lancés un par un).

## 3. Ce qui n'est PAS fait, et pourquoi

1. **Remplissage et publication réels sur Facebook** : le classifieur de permissions refuse de
   remplir un formulaire sur le compte connecté de Max (« Unrequested Commit in a Connected
   App »). Je ne l'ai pas contourné. À faire par l'application elle-même, avec Max, sur un
   compte de test (voir § 5).
2. **Vinted et Leboncoin** : le Chrome de Max n'y est **pas connecté** (constaté ce soir :
   Vinted renvoie à `/member/register`, Leboncoin affiche « Me connecter »). Leurs sélecteurs
   viennent toujours de l'extension et leur catégorie n'est pas réglée : le mode automatique
   n'y publie rien. Le mécanisme est prêt (`categorie: { bouton, libelles, menu, option }`
   dans l'adaptateur) ; il manque les vrais sélecteurs.
3. **Réseaux sociaux** (`POST /api/agent/social`) : passerelle jamais confrontée au vrai
   service (pas de clé, application Meta non validée).
4. **eBay OAuth en production** : demande `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
   `EBAY_RUNAME` sur Railway, et chez eBay l'adresse « Auth accepted » du RuName =
   `https://api.drop-shipper.fr/api/ebay/callback`.
5. **Signature des installeurs** (certificat à acheter), mises à jour automatiques.

## 4. À la charge de Max

- Se connecter à **Vinted** et **Leboncoin** dans Chrome (Facebook l'est).
- Clés de l'application eBay (§ 3.4) ; clés du module réseaux sociaux.
- **Chrome Web Store** : téléverser `backend/extension-store.zip` (1.37.0).
- Créer sa clé desktop (Réglages › « Créer une clé pour DropShipper Desktop ») et la coller
  dans l'application.

## 5. Tests du 01/10, dans l'ordre

1. Installer `DropShipper Desktop Setup 0.2.0.exe`, coller une clé desktop : le tableau
   apparaît, les rayons du jour se listent (compte ≥ 500 drops).
2. « Ouvrir Facebook » dans l'application, s'y connecter ; mettre une annonce en file pour
   Facebook ; **« Préparer »** : vérifier titre, prix, photos, catégorie, état, description.
3. Donner l'accord sur Facebook : laisser partir **une** publication, vérifier l'annonce et le
   retour `PUBLISHED` côté site.
4. Vinted / Leboncoin connectés : relever la fenêtre de catégorie, compléter l'adaptateur.
5. Ensuite : eBay OAuth avec les vraies clés, réseaux sociaux réels, signature.

## 6. Pièges d'outillage

- Le tool Bash perd les antislashs dans un heredoc : les scripts passent par Write/Edit.
- Sur Facebook, le texte d'une option de catégorie colle « Livraison possible » au nom.
- Captures d'écran impossibles fenêtre masquée : lire le DOM.
- Les bancs `check-*` créent des comptes jetables sur la **vraie base** : ils les nettoient.

## 7. Commandes

```bash
cd backend && npx tsc --noEmit
cd backend && npx tsx check-agent-publications.ts   # file, clé desktop, gagnants, rayons
cd backend && npx tsx check-ebay.ts                 # publication + OAuth (faux serveur)
cd desktop && npm run check                         # logique du desktop
cd desktop && npm run check:fenetre                 # vraie fenêtre Electron, profil jetable
cd desktop && npm run build                         # installeurs dans desktop/dist
cd frontend && npm run build
```
