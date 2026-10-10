/**
 * Met rapports.db EN LIGNE sans git push ni redeploiement (04/10/2026).
 *
 *   node envoyer-rapports.cjs                 # envoie backend/rapports.db
 *   node importer-markdown.cjs --envoyer      # importe, puis envoie
 *   node importer-aimarket.cjs --envoyer      # idem
 *
 * La base part a l'API (POST /api/admin/rapports-db) ; l'application et les
 * pages publiques /analyses la lisent des la requete suivante, et les nouvelles
 * adresses sont annoncees aux moteurs. Il faut, dans backend/.env ou
 * l'environnement :
 *   DROPSHIPPER_CLE_ADMIN = la cle d'administration (dsp_adm_…). Le Poste d'analyses la garde dans le coffre
 *                          de Windows et ne l'affiche jamais : depuis le 10/10/2026 cette voie locale n'ouvre plus,
 *                          les rapports partent du Poste (analyses/)
 *   DROPSHIPPER_API       = (facultatif) https://dropshippro-production.up.railway.app
 * Un envoi qui aurait MOINS de rapports que la base en ligne est refuse.
 */
const fs = require('node:fs');
const path = require('node:path');

/** backend/.env, lu a la main : le script ne depend de rien. */
function variable(nom) {
  if (process.env[nom]) return process.env[nom].trim();
  try {
    const ligne = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch (e) {
    return '';
  }
}

async function envoyerRapports(base = path.resolve(__dirname, 'rapports.db')) {
  const cle = variable('DROPSHIPPER_CLE_ADMIN');
  const api = (variable('DROPSHIPPER_API') || 'https://dropshippro-production.up.railway.app').replace(/\/+$/, '');
  if (!cle) throw new Error('DROPSHIPPER_CLE_ADMIN manque (backend/.env).');
  const r = await fetch(`${api}/api/admin/rapports-db`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/octet-stream' },
    body: fs.readFileSync(base),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`refusé (${r.status}) : ${t.slice(0, 300)}`);
  return t;
}

/** Pour les importateurs : envoie, dit le resultat, sort en erreur si refus. */
function envoyerEtDire(base) {
  return envoyerRapports(base)
    .then((t) => console.log(`\nEn ligne : ${t}`))
    .catch((e) => {
      console.error(`\nRien mis en ligne : ${e.message}`);
      process.exitCode = 1;
    });
}

module.exports = { envoyerRapports, envoyerEtDire };

if (require.main === module) envoyerEtDire();
