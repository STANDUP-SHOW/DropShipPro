/**
 * Corrige deux categories mal formees dans rapports.db.
 *
 *   cd backend && node corriger-slugs-categories.cjs --sec   # lecture seule
 *   cd backend && node corriger-slugs-categories.cjs         # applique
 *
 * ------------------------------------------------------------------------
 * LE PROBLEME
 *
 * Deux rapports marketing du 18/09/2026 portent leur categorie en clair au
 * lieu du slug : « maison decoration » avec une espace, « telephonie » avec
 * l'accent. Ils datent d'avant la normalisation faite a l'import.
 *
 * Consequence visible en production : /api/reports/categories renvoie 26
 * entrees au lieu de 24, et l'interface affiche deux filtres quasi identiques
 * cote a cote.
 *
 * Leurs homologues de type rayon portent deja le bon slug, et aucun rapport
 * marketing n'existe au bon slug pour ces couples date/theme : il n'y a donc
 * pas de collision a craindre.
 *
 * ------------------------------------------------------------------------
 * CE QU'IL FAUT TOUCHER, ET POURQUOI C'EST PLUS QU'UN UPDATE
 *
 * La categorie apparait a quatre endroits pour une meme ligne :
 *   1. reports.categorie      — la colonne filtree par les routes de lecture
 *   2. reports.id             — l'identifiant la contient
 *   3. reports.data           — le JSON est servi TEL QUEL au site, la valeur
 *                               y est donc dupliquee et doit suivre
 *   4. marketing_reports.id et .report_id — l'enfant pointe sur l'identifiant
 *
 * Ne corriger que la colonne laisserait le site afficher l'ancienne valeur,
 * puisque c'est `data` que getAllReports() lui renvoie.
 */
const fs = require('fs');
const path = require('path');

const sec = process.argv.includes('--sec');
const BASE = path.resolve(__dirname, 'rapports.db');
const DOSSIER_SAUV = path.resolve(__dirname, '..', 'MARKET-ANALYSES', 'n8n', '_sauvegardes');

const CORRECTIONS = [
  { mauvais: 'maison decoration', bon: 'maison-decoration' },
  { mauvais: 'téléphonie', bon: 'telephonie' },
];

function ouvrir(chemin) {
  try {
    return { db: new (require('better-sqlite3'))(chemin), pilote: 'better-sqlite3' };
  } catch (e) {
    return { db: new (require('node:sqlite').DatabaseSync)(chemin), pilote: 'node:sqlite' };
  }
}

if (!sec) {
  fs.mkdirSync(DOSSIER_SAUV, { recursive: true });
  const horo = new Date().toISOString().slice(0, 10);
  const sauv = path.join(DOSSIER_SAUV, `rapports.db.avant-slugs-${horo}.bak`);
  fs.copyFileSync(BASE, sauv);
  console.log(`sauvegarde : ${path.basename(sauv)}`);
}

const { db, pilote } = ouvrir(BASE);
console.log(`pilote : ${pilote}\n`);

let touches = 0;

for (const { mauvais, bon } of CORRECTIONS) {
  const lignes = db.prepare('SELECT id, type, date, categorie, theme, data FROM reports WHERE categorie = ?').all(mauvais);
  if (!lignes.length) {
    console.log(`rien a faire pour ${JSON.stringify(mauvais)}`);
    continue;
  }

  for (const l of lignes) {
    const nouvelId = l.id.split(mauvais).join(bon);

    // Garde-fou : on ne doit jamais ecraser un rapport existant.
    const collision = db.prepare('SELECT 1 FROM reports WHERE id = ?').get(nouvelId);
    if (collision && nouvelId !== l.id) {
      console.log(`REFUS  ${l.id}`);
      console.log(`       ${nouvelId} existe deja — fusion a decider a la main, rien touche.`);
      continue;
    }

    // Le JSON est servi tel quel : la valeur dupliquee doit suivre.
    let data = l.data;
    try {
      const o = JSON.parse(data);
      if (o.categorie === mauvais) o.categorie = bon;
      data = JSON.stringify(o);
    } catch (e) {
      console.log(`REFUS  ${l.id} — data illisible (${e.message}), rien touche.`);
      continue;
    }

    console.log(`${sec ? 'lu    ' : 'ok    '} ${l.type} ${l.date} ${l.theme}`);
    console.log(`       categorie : ${JSON.stringify(mauvais)} -> ${JSON.stringify(bon)}`);
    console.log(`       id        : ${l.id}`);
    console.log(`                -> ${nouvelId}`);

    if (sec) {
      touches++;
      continue;
    }

    try {
      db.exec('BEGIN');

      /**
       * marketing_reports.report_id est une cle etrangere vers reports.id.
       * Renommer une cle referencee casse donc l'integrite a l'instant ou on
       * touche la premiere des deux tables, quel que soit l'ordre choisi :
       * repointer l'enfant vers un parent qui n'existe pas encore echoue, et
       * renommer le parent avant l'enfant echoue aussi.
       *
       * defer_foreign_keys repousse le controle au COMMIT, ou les deux lignes
       * sont de nouveau coherentes. Il ne desactive rien : une vraie rupture
       * ferait encore echouer le COMMIT, et la transaction annulerait tout.
       *
       * Le passage --sec ne voit pas ce genre de probleme, puisqu'il n'ecrit
       * pas : le premier essai reel est sorti en « FOREIGN KEY constraint
       * failed » et a tout annule proprement.
       */
      db.exec('PRAGMA defer_foreign_keys = ON');

      // l'enfant d'abord, tant que l'ancien identifiant existe encore
      for (const t of ['marketing_reports', 'rayon_reports']) {
        const enfants = db.prepare(`SELECT id FROM ${t} WHERE report_id = ?`).all(l.id);
        for (const e of enfants) {
          const nouvelIdEnfant = e.id.split(mauvais).join(bon);
          db.prepare(`UPDATE ${t} SET id = ?, report_id = ? WHERE id = ?`).run(nouvelIdEnfant, nouvelId, e.id);
          console.log(`       ${t} : ${e.id}`);
          console.log(`                -> ${nouvelIdEnfant}`);
        }
      }

      // products porte aussi la categorie, en clair, pour la memoire
      const prod = db.prepare('UPDATE products SET categorie = ? WHERE categorie = ?').run(bon, mauvais);
      if (prod.changes) console.log(`       products : ${prod.changes} ligne(s) recategorisee(s)`);

      db.prepare('UPDATE reports SET id = ?, categorie = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(nouvelId, bon, data, l.id);

      db.exec('COMMIT');
      touches++;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (e2) {}
      console.log(`REFUS  ${l.id} — ${err.message}`);
    }
  }
}

// --- controle final : la liste des categories doit etre propre
console.log('\n=== categories en base apres passage ===');
const cats = db.prepare('SELECT DISTINCT categorie FROM reports ORDER BY categorie').all().map((r) => r.categorie);
console.log(`${cats.length} categorie(s)`);
const sales = cats.filter((c) => c !== String(c).normalize('NFD').replace(/[̀-ͯ]/g, '') || /[^a-z0-9-]/.test(c));
if (sales.length) {
  console.log('ENCORE MAL FORMEES :', sales.map((c) => JSON.stringify(c)).join(', '));
} else {
  console.log('toutes au format slug, rien a signaler');
}

db.close();
console.log(`\n${touches} rapport(s) ${sec ? 'a corriger' : 'corrige(s)'}.`);
if (!sec && touches) console.log('Penser a committer backend/rapports.db pour que le site en profite.');
