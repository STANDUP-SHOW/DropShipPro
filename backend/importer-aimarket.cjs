/**
 * Importe les rapports MarketSpy (aiMarket/*.json) dans rapports.db.
 *
 *   cd backend && node importer-aimarket.cjs            # tout aiMarket/
 *   cd backend && node importer-aimarket.cjs --fichier X.json
 *   cd backend && node importer-aimarket.cjs --sec       # n'ecrit rien, montre
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
const { lireEtude, ecrireRapport } = require('./aimarket-import.cjs');

/**
 * Deux pilotes possibles, sans rien installer.
 *
 * Le serveur utilise better-sqlite3 ; en local ses node_modules ne sont pas
 * toujours la, et le compiler pour un script d'import serait absurde. Node 22+
 * embarque `node:sqlite`, qui ouvre le meme fichier. On prend ce qu'on trouve.
 */
function ouvrir(chemin) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(chemin);
    return { db, pilote: 'better-sqlite3' };
  } catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(chemin);
    return { db, pilote: 'node:sqlite' };
  }
}

const args = process.argv.slice(2);
const sec = args.includes('--sec');
const unSeul = args.includes('--fichier') ? args[args.indexOf('--fichier') + 1] : null;

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

  let etude;
  try {
    etude = lireEtude(d);
  } catch (err) {
    console.log(`refus  ${nom} — ${err.message}`);
    ko++;
    continue;
  }

  if (sec) {
    console.log(`lu     ${nom}`);
    console.log(`       rayon     -> ${etude.idRayon}`);
    console.log(`       marketing -> ${etude.idMkt}`);
    console.log(`       ${etude.produits.length} produits, ${etude.nbSources} sources`);
    ok++;
    continue;
  }

  try {
    ecrireRapport(db, d, nom);
    console.log(`ok     ${nom} — ${etude.produits.length} produits, ${etude.nbSources} sources`);
    ok++;
  } catch (err) {
    console.log(`refus  ${nom} — ${err.message}`);
    ko++;
  }
}

if (db) db.close();
console.log(`\n${ok} importé(s), ${ko} refusé(s).`);
