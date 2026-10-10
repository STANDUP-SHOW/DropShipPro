/* Lit la derniere execution et montre la sortie brute du noeud Claude. */
const path = require('path');
const req = require('module').createRequire('/usr/local/lib/node_modules/n8n/package.json');
let Database;
try { Database = req('better-sqlite3'); } catch (e) { console.log('pas de better-sqlite3: ' + e.message); process.exit(1); }
const db = new Database('/home/node/.n8n/database.sqlite', { readonly: true });

const row = db.prepare(
  "SELECT e.id, e.status, d.data FROM execution_entity e JOIN execution_data d ON d.executionId = e.id WHERE e.workflowId = 'agentRayonUnifie' ORDER BY e.id DESC LIMIT 1"
).get();

if (!row) { console.log('aucune execution'); process.exit(0); }
console.log('execution ' + row.id + ' — statut ' + row.status);

const brut = row.data;
// n8n stocke en format "flatted"
let parsed;
try {
  const { parse } = req('flatted');
  parsed = parse(brut);
} catch (e) {
  console.log('flatted indisponible, extrait brut :');
  const i = brut.indexOf('Rediger');
  console.log(brut.slice(Math.max(0, i - 200), i + 2500));
  process.exit(0);
}

function chercheNoeud(o, nom) {
  try {
    const rd = o.resultData || (o.data && o.data.resultData);
    if (rd && rd.runData && rd.runData[nom]) return rd.runData[nom];
  } catch (e) {}
  return null;
}
const rd = chercheNoeud(parsed, 'Rediger (Claude)');
if (!rd) { console.log('noeud Claude introuvable dans runData'); console.log(Object.keys(parsed || {})); process.exit(0); }
const sortie = JSON.stringify(rd[0] && rd[0].data, null, 1);
console.log('--- SORTIE CLAUDE (2500 premiers caracteres) ---');
console.log(sortie.slice(0, 2500));
