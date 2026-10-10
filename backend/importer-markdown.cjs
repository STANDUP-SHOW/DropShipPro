/**
 * Importe dans rapports.db les rapports Markdown produits par les taches
 * planifiees « DropPost — Rapports RAYON+MARKETING (lot 1..4/4) ».
 *
 *   cd backend && node importer-markdown.cjs                  # tout ce qui manque
 *   cd backend && node importer-markdown.cjs --date 2026-10-04
 *   cd backend && node importer-markdown.cjs --sec             # lecture seule, rien n'est ecrit
 *
 * ------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 *
 * Deux moteurs produisent des rapports, dans deux formats differents :
 *
 *   1. l'agent n8n « agentRayonUnifie » ecrit du JSON au schema aiMARKET,
 *      a plat dans rapports/ — c'est importer-aimarket.cjs qui le lit ;
 *   2. les quatre taches planifiees Claude ecrivent du MARKDOWN dans
 *      rapports/<date>/<categorie>/<theme>.rayon.md et .marketing.md.
 *
 * Le site, lui, ne lit ni l'un ni l'autre : il lit rapports.db. Les rapports
 * du 4 octobre etaient donc bien produits — 48 fichiers, 24 rayons — et
 * invisibles, faute de route entre le disque et la base.
 *
 * Ce script est cette route pour le format Markdown.
 *
 * ------------------------------------------------------------------------
 * CE QU'IL NE FAIT PAS
 *
 * Il n'invente rien. Un prix illisible reste nul, une URL absente reste vide,
 * un fichier au format inattendu est refuse avec sa raison. C'est la regle du
 * projet : mieux vaut un champ vide qu'une donnee qui a l'air fiable.
 */
const fs = require('fs');
const path = require('path');
// La lecture d'une etude et son ecriture vivent dans rapports-etude.cjs,
// partage avec l'import Google Drive du back-office.
const { ouvrir, etudeMarkdown, ecrireEtude } = require('./rapports-etude.cjs');

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const sec = args.includes('--sec');
const dateVoulue = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

const RACINE = path.resolve(__dirname, '..', 'MARKET-ANALYSES', 'rapports');
const BASE = path.resolve(__dirname, 'rapports.db');

if (!fs.existsSync(RACINE)) {
  console.error(`Aucun dossier ${RACINE}.`);
  process.exit(1);
}

// ----------------------------------------------------- recensement sur disque

/** Les dossiers de date, tries, filtres par --date s'il est donne. */
function dossiersDate() {
  return fs
    .readdirSync(RACINE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .filter((d) => !dateVoulue || d === dateVoulue)
    .sort();
}

/** Un couple rayon/marketing par categorie et par theme. */
function etudes() {
  const out = [];
  for (const date of dossiersDate()) {
    const dDate = path.join(RACINE, date);
    for (const cat of fs.readdirSync(dDate, { withFileTypes: true })) {
      if (!cat.isDirectory()) continue;
      const dCat = path.join(dDate, cat.name);
      const themes = new Map();
      for (const f of fs.readdirSync(dCat)) {
        const m = f.match(/^(.+)\.(rayon|marketing)\.md$/);
        if (!m) continue;
        if (!themes.has(m[1])) themes.set(m[1], {});
        themes.get(m[1])[m[2]] = path.join(dCat, f);
      }
      for (const [theme, fichiers] of themes) {
        out.push({ date, categorie: cat.name, theme, ...fichiers });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ import

const liste = etudes();
if (!liste.length) {
  console.error(
    `Aucun rapport Markdown trouve sous ${RACINE}` +
    (dateVoulue ? ` pour la date ${dateVoulue}.` : '.')
  );
  process.exit(1);
}

const ouverture = sec ? null : ouvrir(BASE);
const db = ouverture ? ouverture.db : null;
if (ouverture) console.log(`pilote : ${ouverture.pilote}\n`);

let ok = 0;
let ko = 0;
let produitsTotal = 0;

for (const e of liste) {
  const nom = `${e.date}/${e.categorie}/${e.theme}`;

  if (!e.rayon) {
    console.log(`refus  ${nom} — pas de fichier .rayon.md`);
    ko++;
    continue;
  }

  let texteRayon;
  try {
    texteRayon = fs.readFileSync(e.rayon, 'utf8');
  } catch (err) {
    console.log(`refus  ${nom} — lecture impossible : ${err.message}`);
    ko++;
    continue;
  }

  let texteMarketing = null;
  let noteLecture = null;
  if (e.marketing) {
    try {
      texteMarketing = fs.readFileSync(e.marketing, 'utf8');
    } catch (err) {
      noteLecture = `marketing illisible (${err.message}), rayon importe seul`;
    }
  }

  const etude = etudeMarkdown({
    texteRayon,
    texteMarketing,
    origineRayon: path.relative(RACINE, e.rayon),
    origineMarketing: e.marketing ? path.relative(RACINE, e.marketing) : null,
  });
  if (!etude.ok) {
    console.log(`refus  ${nom} — ${etude.raison}`);
    ko++;
    continue;
  }
  const note = noteLecture || etude.noteMarketing;
  if (note) console.log(`  note ${nom} — ${note}`);

  if (sec) {
    console.log(`lu     ${nom} — ${etude.produits} produits, ${etude.sources} sources${etude.marketing ? ', marketing ok' : ', SANS marketing'}`);
    console.log(`       ${etude.fiches} URL de fiche | ${etude.produits - etude.avecPrix} produit(s) sans prix complet`);
    ok++;
    produitsTotal += etude.produits;
    continue;
  }

  try {
    ecrireEtude(db, etude);
    console.log(
      `ok     ${nom} — ${etude.produits} produits (${etude.fiches} fiches), ` +
      `${etude.sources} sources${etude.marketing ? ', marketing' : ', SANS marketing'}`
    );
    ok++;
    produitsTotal += etude.produits;
  } catch (err) {
    console.log(`refus  ${nom} — ${err.message}`);
    ko++;
  }
}

if (db) db.close();
console.log(`\n${ok} etude(s) importee(s), ${ko} refusee(s), ${produitsTotal} produits.`);
// --envoyer : la base part en ligne sans push (envoyer-rapports.cjs).
if (args.includes('--envoyer') && !sec && ok) require('./envoyer-rapports.cjs').envoyerEtDire(BASE);
if (!sec && ok) {
  console.log('\nEnchainer pour la memoire et les alertes :');
  console.log('  node memoire-migration.cjs');
  console.log('  node memoire-alertes.cjs');
}
