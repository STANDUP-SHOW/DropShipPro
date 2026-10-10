/**
 * Importe les rapports MarketSpy (aiMarket/*.json) dans rapports.db.
 *
 *   cd backend && node importer-aimarket.cjs            # tout aiMarket/
 *   cd backend && node importer-aimarket.cjs --fichier X.json
 *   cd backend && node importer-aimarket.cjs --sec       # n'ecrit rien, montre
 *   cd backend && node importer-aimarket.cjs --envoyer   # importe, puis met EN LIGNE
 *
 * --envoyer : voir envoyer-rapports.cjs (mise en ligne sans push).
 *
 * Un fichier MarketSpy porte l'etude ET le marketing. La base, elle, separe
 * les deux : les routes de lecture filtrent sur `type = 'marketing'` pour les
 * prompts et sur `type = 'rayon'` pour les produits. Un fichier donne donc
 * DEUX lignes dans `reports`, chacune avec son enfant — c'est la convention
 * deja en place (rayon-2026-09-18-automobile-interieur / marketing-...).
 *
 * Rien n'est perdu au passage : la colonne `data` de `reports` recoit le JSON
 * MarketSpy complet, y compris les champs que le schema n'a pas de colonne
 * pour accueillir (bundles, alerts, scores, business_ideas).
 */
const fs = require('node:fs');
const path = require('node:path');
// La lecture d'une etude et son ecriture vivent dans rapports-etude.cjs,
// partage avec l'import Google Drive du back-office. Pilote SQLite : voir
// `ouvrir` la-bas (better-sqlite3, sinon node:sqlite integre).
const { ouvrir, etudeAiMarket, ecrireEtude } = require('./rapports-etude.cjs');

const args = process.argv.slice(2);
const sec = args.includes('--sec');
const unSeul = args.includes('--fichier') ? args[args.indexOf('--fichier') + 1] : null;
const envoyer = args.includes('--envoyer');

const DOSSIER = path.resolve(__dirname, '..', 'aiMarket');
const BASE = path.resolve(__dirname, 'rapports.db');

if (!fs.existsSync(DOSSIER)) {
  console.error(`Aucun dossier ${DOSSIER}.`);
  process.exit(1);
}

const ouverture = sec ? null : ouvrir(BASE);
const db = ouverture ? ouverture.db : null;
if (ouverture) console.log(`pilote : ${ouverture.pilote}\n`);

const fichiers = unSeul
  ? [path.isAbsolute(unSeul) ? unSeul : path.join(DOSSIER, unSeul)]
  : fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).map((f) => path.join(DOSSIER, f));

if (!fichiers.length) {
  console.error(`Aucun .json dans ${DOSSIER}.`);
  process.exit(1);
}

let ok = 0;
let ko = 0;

for (const fichier of fichiers) {
  const nom = path.basename(fichier);
  let d;
  try {
    d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch (err) {
    console.log(`refus  ${nom} — JSON illisible : ${err.message}`);
    ko++;
    continue;
  }

  const etude = etudeAiMarket(d, nom);
  if (!etude.ok) {
    console.log(`refus  ${nom} — ${etude.raison}`);
    ko++;
    continue;
  }

  if (sec) {
    console.log(`lu     ${nom}`);
    console.log(`       rayon     -> ${etude.idRayon}`);
    console.log(`       marketing -> ${etude.idMarketing}`);
    console.log(`       ${etude.produits} produits, ${etude.sources} sources`);
    ok++;
    continue;
  }

  try {
    ecrireEtude(db, etude);
    console.log(`ok     ${nom} — ${etude.produits} produits, ${etude.sources} sources`);
    ok++;
  } catch (err) {
    console.log(`refus  ${nom} — ${err.message}`);
    ko++;
  }
}

if (db) db.close();
console.log(`\n${ok} importé(s), ${ko} refusé(s).`);

if (envoyer && !sec) require('./envoyer-rapports.cjs').envoyerEtDire(BASE);
